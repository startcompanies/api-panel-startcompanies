import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { SignUpDto } from './dtos/signup.dto';
import { comparePasswords, encodePassword } from 'src/shared/common/utils/bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/shared/user/entities/user.entity';
import { HandleExceptionsService } from 'src/shared/common/common.service';
import { SignInDto } from './dtos/signin.dto';
import { JwtService } from '@nestjs/jwt';
import { ChangePasswordDto } from './dtos/changePassword.dto';
import { ForgotPasswordDto } from './dtos/forgotPassword.dto';
import { ResetPasswordDto } from './dtos/resetPassword.dto';
import { EmailService } from 'src/shared/common/services/email.service';

@Injectable()
export class authService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private handleExceptionService: HandleExceptionsService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  async signUp(signUpDto: SignUpDto) {
    const password = encodePassword(signUpDto.password);
    const user = this.userRepository.create({
      ...signUpDto,
      password,
      type: signUpDto.type || 'user', // Asegurar que tenga un valor por defecto
    });
    try {
      await this.userRepository.save(user);
      delete user.password;
      return user;
    } catch (error) {
      this.handleExceptionService.handleDBExceptions(error);
    }
  }

  async signIn(signInDto: SignInDto) {
    const { email, password } = signInDto;

    const user = await this.userRepository.findOneBy({
      email: email ?? undefined,
    });

    if (!user) {
      return this.handleExceptionService.handleErrorLoginException(email);
    }
    
    const isMatch = await comparePasswords(password, user.password ?? '');

    if (!isMatch) {
      return this.handleExceptionService.handleErrorPasswordException(email);
    }

    const infoUser = {
      id: user.id,
      userName: user.username,
      email: user.email,
      status: user.status,
      type: user.type,
    };

    const token = await this.jwtService.signAsync(infoUser);
    const refreshToken = await this.jwtService.signAsync(
      { ...infoUser, type: 'refresh' },
      { expiresIn: '5d' },
    );

    return { user: infoUser, token, refreshToken };
  }

  async changePassword(changePasswordDto: ChangePasswordDto) {
    const { email, oldPassword, newPassword } = changePasswordDto;

    const user = await this.userRepository.findOneBy({
      email: email ?? undefined,
    });

    if (!user) {
      return this.handleExceptionService.handleErrorLoginException(email);
    }

    const isMatch = await comparePasswords(oldPassword, user.password ?? '');

    if (!isMatch) {
      return this.handleExceptionService.handleErrorPasswordException(email);
    }

    const hashedNewPassword = encodePassword(newPassword);
    user.password = hashedNewPassword;

    try {
      await this.userRepository.save(user);
      return {
        message: 'Contraseña actualizada exitosamente',
        code: 200,
      };
    } catch (error) {
      this.handleExceptionService.handleDBExceptions(error);
    }
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.userRepository.findOneBy({
      email: email ?? undefined,
    });

    if (!user) {
      // Por seguridad, no revelamos si el email existe o no
      return {
        message:
          'Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña',
        code: 200,
      };
    }

    // Generar token de reset (en producción, debería ser más seguro y almacenarse en BD)
    const resetToken = await this.jwtService.signAsync(
      { id: user.id, email: user.email, type: 'password-reset' },
      { expiresIn: '1h' },
    );

    // Enviar email con el token
    const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
    try {
      await this.emailService.sendPasswordResetEmail(user.email, userName, resetToken);
    } catch (emailError) {
      console.error('Error al enviar email de reset:', emailError);
      // No fallar si el email falla, pero loguear el error
    }

    return {
      message:
        'Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña',
      code: 200,
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    try {
      // Verificar token
      const payload = await this.jwtService.verifyAsync(token);

      // Aceptar tanto tokens de reset como de setup inicial
      if (payload.type !== 'password-reset' && payload.type !== 'password-setup') {
        return {
          message: 'Token inválido',
          code: 400,
        };
      }

      const user = await this.userRepository.findOneBy({
        id: payload.id,
        email: payload.email,
      });

      if (!user) {
        return {
          message: 'Usuario no encontrado',
          code: 404,
        };
      }

      // Actualizar contraseña
      const hashedNewPassword = encodePassword(newPassword);
      user.password = hashedNewPassword;

      await this.userRepository.save(user);

      return {
        message: 'Contraseña restablecida exitosamente',
        code: 200,
      };
    } catch (error) {
      return {
        message: 'Token inválido o expirado',
        code: 400,
      };
    }
  }


  /**
   * Refresh token - Renueva el access token usando un refresh token (cookie o body)
   */
  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token requerido');
    }
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken);

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Token inválido');
      }

      const user = await this.userRepository.findOne({
        where: { id: payload.id },
      });

      if (!user || !user.status) {
        throw new UnauthorizedException('Usuario no encontrado o inactivo');
      }

      const newPayload = {
        id: user.id,
        userName: user.username,
        email: user.email,
        status: user.status,
        type: user.type,
      };
      const token = await this.jwtService.signAsync(newPayload);

      return { token };
    } catch (error) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
