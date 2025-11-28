import { Inject, Injectable } from '@nestjs/common';
import { SignUpDto } from './dtos/signup.dto';
import { comparePasswords, encodePassword } from 'src/common/utils/bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { HandleExceptionsService } from 'src/common/common.service';
import { SignInDto } from './dtos/signin.dto';
import { JwtService } from '@nestjs/jwt';
import { ChangePasswordDto } from './dtos/changePassword.dto';

@Injectable()
export class authService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private handleExceptionService: HandleExceptionsService,
    private jwtService: JwtService
  ) {}

  async signUp(signUpDto: SignUpDto) {
    const password = encodePassword(signUpDto.password);
    const user = this.userRepository.create({ ...signUpDto, password });
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
      type: user.type
    };

    const token = await this.jwtService.signAsync(infoUser);

    return { token };
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
}
