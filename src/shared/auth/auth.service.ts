import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SignUpDto } from './dtos/signup.dto';
import { comparePasswords, encodePassword } from 'src/shared/common/utils/bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/shared/user/entities/user.entity';
import { HandleExceptionsService } from 'src/shared/common/common.service';
import { SignInDto } from './dtos/signin.dto';
import { SignInVerifyDto } from './dtos/signin-verify.dto';
import { SignInResendOtpDto } from './dtos/signin-resend-otp.dto';
import { JwtService } from '@nestjs/jwt';
import { ChangePasswordDto } from './dtos/changePassword.dto';
import { ForgotPasswordDto } from './dtos/forgotPassword.dto';
import { ResetPasswordDto } from './dtos/resetPassword.dto';
import { EmailService } from 'src/shared/common/services/email.service';
import { LoginOtpChallenge } from './entities/login-otp-challenge.entity';
import { TrustedLoginDevice } from './entities/trusted-login-device.entity';
import { LOGIN_TRUST_MAX_AGE_MS } from './constants/login-trust.constants';
import * as crypto from 'crypto';
import { jwtConstants } from 'src/shared/common/constants/jwtConstants';
import { normalizeAuthEmail } from 'src/shared/common/utils/normalize-auth-email';
import { PANEL_LOGIN_FAILED_MESSAGE } from './constants/auth-login.constants';

export interface LoginTrustRequestContext {
  deviceCookie?: string;
  userAgent: string;
  clientIp: string;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_RESENDS = 5;

@Injectable()
export class authService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(LoginOtpChallenge)
    private readonly loginOtpRepository: Repository<LoginOtpChallenge>,
    @InjectRepository(TrustedLoginDevice)
    private readonly trustedDeviceRepository: Repository<TrustedLoginDevice>,
    private handleExceptionService: HandleExceptionsService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  async signUp(signUpDto: SignUpDto) {
    const password = encodePassword(signUpDto.password);
    const email = normalizeAuthEmail(signUpDto.email);
    const user = this.userRepository.create({
      ...signUpDto,
      email,
      password,
      type: signUpDto.type || 'user',
    });
    try {
      await this.userRepository.save(user);
      delete user.password;
      return user;
    } catch (error) {
      this.handleExceptionService.handleDBExceptions(error);
    }
  }

  private hashOtpCode(code: string): string {
    const secret = process.env.LOGIN_OTP_SECRET || jwtConstants.secret;
    return crypto.createHmac('sha256', secret).update(code).digest('hex');
  }

  private generateOtpDigits(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private buildInfoUser(user: User) {
    return {
      id: user.id,
      userName: user.username,
      username: user.username,
      email: user.email,
      status: user.status,
      type: user.type,
      first_name: user.first_name ?? undefined,
      last_name: user.last_name ?? undefined,
      createdAt: user.createdAt?.toISOString?.() ?? undefined,
    };
  }

  private hashDeviceSecret(secretHex: string): string {
    return crypto.createHash('sha256').update(Buffer.from(secretHex, 'hex')).digest('hex');
  }

  private fingerprintUserAgent(ua: string): string {
    return crypto.createHash('sha256').update(ua || '', 'utf8').digest('hex');
  }

  private fingerprintIp(ip: string): string {
    return crypto.createHash('sha256').update(ip || '', 'utf8').digest('hex');
  }

  private parseDeviceTrustCookie(raw: string | undefined): { id: string; secret: string } | null {
    if (!raw || typeof raw !== 'string') {
      return null;
    }
    try {
      const json = Buffer.from(raw, 'base64url').toString('utf8');
      const o = JSON.parse(json) as { i?: string; s?: string };
      if (
        typeof o.i !== 'string' ||
        typeof o.s !== 'string' ||
        !/^[0-9a-f]{64}$/i.test(o.s)
      ) {
        return null;
      }
      return { id: o.i, secret: o.s.toLowerCase() };
    } catch {
      return null;
    }
  }

  buildDeviceTrustCookieValue(deviceId: string, secretHex: string): string {
    return Buffer.from(JSON.stringify({ i: deviceId, s: secretHex }), 'utf8').toString(
      'base64url',
    );
  }

  private async consumeTrustedDeviceIfValid(
    user: User,
    ctx: LoginTrustRequestContext,
  ): Promise<boolean> {
    const parsed = this.parseDeviceTrustCookie(ctx.deviceCookie);
    if (!parsed) {
      return false;
    }
    const row = await this.trustedDeviceRepository.findOne({ where: { id: parsed.id } });
    if (!row || row.userId !== user.id) {
      return false;
    }
    if (new Date() > row.expiresAt) {
      return false;
    }
    const expectedHash = this.hashDeviceSecret(parsed.secret);
    let secretOk = false;
    try {
      secretOk = crypto.timingSafeEqual(
        Buffer.from(row.secretHash, 'hex'),
        Buffer.from(expectedHash, 'hex'),
      );
    } catch {
      secretOk = false;
    }
    if (!secretOk) {
      return false;
    }
    if (row.userAgentHash !== this.fingerprintUserAgent(ctx.userAgent)) {
      return false;
    }
    // No exigir IP fija (VPN/móvil); rotación suave del hash por última IP vista.
    row.ipHash = ctx.clientIp ? this.fingerprintIp(ctx.clientIp) : null;
    row.lastUsedAt = new Date();
    await this.trustedDeviceRepository.save(row);
    return true;
  }

  /**
   * Registra este navegador como confiable (tras sesión iniciada). Devuelve el valor de cookie a setear.
   */
  async createTrustedLoginDevice(
    userId: number,
    ctx: LoginTrustRequestContext,
  ): Promise<string> {
    const secretHex = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + LOGIN_TRUST_MAX_AGE_MS);
    const entity = this.trustedDeviceRepository.create({
      userId,
      secretHash: this.hashDeviceSecret(secretHex),
      userAgentHash: this.fingerprintUserAgent(ctx.userAgent),
      ipHash: null,
      expiresAt,
      lastUsedAt: null,
    });
    const saved = await this.trustedDeviceRepository.save(entity);
    return this.buildDeviceTrustCookieValue(saved.id, secretHex);
  }

  async revokeTrustedDevicesForUser(userId: number): Promise<void> {
    await this.trustedDeviceRepository.delete({ userId });
  }

  /**
   * Paso 1 del login: valida credenciales; si hay dispositivo confiable válido emite sesión (sin OTP).
   * Si no, envía OTP por correo. No emite cookies aquí salvo bypass (el controlador las setea).
   */
  async signIn(signInDto: SignInDto, trustCtx?: LoginTrustRequestContext) {
    const { password, rememberMe } = signInDto;
    const email = normalizeAuthEmail(signInDto.email);

    const user = await this.userRepository.findOneBy({
      email: email || undefined,
    });

    if (!user) {
      throw new UnauthorizedException(PANEL_LOGIN_FAILED_MESSAGE);
    }

    if (!user.status) {
      throw new UnauthorizedException(PANEL_LOGIN_FAILED_MESSAGE);
    }

    const isMatch = await comparePasswords(password, user.password ?? '');

    if (!isMatch) {
      throw new UnauthorizedException(PANEL_LOGIN_FAILED_MESSAGE);
    }

    if (trustCtx && (await this.consumeTrustedDeviceIfValid(user, trustCtx))) {
      const session = await this.issueSessionTokens(user, Boolean(rememberMe));
      return { ...session, rememberMe: Boolean(rememberMe), trustedDeviceBypass: true as const };
    }

    await this.loginOtpRepository
      .createQueryBuilder()
      .update(LoginOtpChallenge)
      .set({ consumedAt: new Date() })
      .where('userId = :uid', { uid: user.id })
      .andWhere('consumedAt IS NULL')
      .execute();

    const code = this.generateOtpDigits();
    const codeHash = this.hashOtpCode(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    const challenge = this.loginOtpRepository.create({
      userId: user.id,
      codeHash,
      rememberMe: Boolean(rememberMe),
      expiresAt,
      attemptCount: 0,
      resendCount: 0,
      consumedAt: null,
    });
    const saved = await this.loginOtpRepository.save(challenge);

    const displayName =
      `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
    try {
      await this.emailService.sendPanelLoginOtpEmail(user.email, displayName, code);
    } catch (e) {
      await this.loginOtpRepository.delete({ id: saved.id });
      throw new BadRequestException(
        'No pudimos enviar el código a tu correo. Revisa la configuración o inténtalo más tarde.',
      );
    }

    return {
      step: 'second_factor' as const,
      challengeId: saved.id,
      message: 'Te enviamos un código de 6 dígitos a tu correo.',
    };
  }

  async signInVerify(signInVerifyDto: SignInVerifyDto) {
    const { challengeId, code } = signInVerifyDto;

    const challenge = await this.loginOtpRepository.findOne({
      where: { id: challengeId },
    });

    if (!challenge || challenge.consumedAt) {
      throw new BadRequestException(
        'Código inválido o sesión de verificación no válida. Vuelve a iniciar sesión.',
      );
    }

    if (new Date() > challenge.expiresAt) {
      throw new BadRequestException('El código ha expirado. Vuelve a iniciar sesión.');
    }

    if (challenge.attemptCount >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Demasiados intentos. Vuelve a iniciar sesión.');
    }

    const expectedHash = this.hashOtpCode(code);
    let match = false;
    try {
      match = crypto.timingSafeEqual(
        Buffer.from(challenge.codeHash, 'hex'),
        Buffer.from(expectedHash, 'hex'),
      );
    } catch {
      match = false;
    }

    if (!match) {
      challenge.attemptCount += 1;
      await this.loginOtpRepository.save(challenge);
      throw new BadRequestException('Código incorrecto');
    }

    challenge.consumedAt = new Date();
    await this.loginOtpRepository.save(challenge);

    const user = await this.userRepository.findOne({
      where: { id: challenge.userId },
    });

    if (!user || !user.status) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    if (!user.emailVerified) {
      user.emailVerified = true;
      user.emailVerificationToken = null;
      await this.userRepository.save(user);
    }

    const session = await this.issueSessionTokens(user, challenge.rememberMe);
    return { ...session, rememberMe: challenge.rememberMe };
  }

  async signInResendOtp(dto: SignInResendOtpDto) {
    const challenge = await this.loginOtpRepository.findOne({
      where: { id: dto.challengeId },
    });

    if (!challenge || challenge.consumedAt) {
      throw new BadRequestException('Sesión de verificación no válida. Vuelve a iniciar sesión.');
    }

    if (new Date() > challenge.expiresAt) {
      throw new BadRequestException('El código expiró. Vuelve a iniciar sesión.');
    }

    if (challenge.resendCount >= MAX_OTP_RESENDS) {
      throw new BadRequestException('Límite de reenvíos alcanzado. Vuelve a iniciar sesión.');
    }

    const user = await this.userRepository.findOne({
      where: { id: challenge.userId },
    });
    if (!user || !user.status) {
      throw new BadRequestException('Usuario no encontrado o inactivo');
    }

    const code = this.generateOtpDigits();
    challenge.codeHash = this.hashOtpCode(code);
    challenge.expiresAt = new Date(Date.now() + OTP_TTL_MS);
    challenge.resendCount += 1;
    challenge.attemptCount = 0;

    await this.loginOtpRepository.save(challenge);

    const displayName =
      `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
    try {
      await this.emailService.sendPanelLoginOtpEmail(user.email, displayName, code);
    } catch {
      throw new BadRequestException('No pudimos reenviar el correo. Inténtalo más tarde.');
    }

    return { ok: true, message: 'Código reenviado.' };
  }

  private async issueSessionTokens(user: User, rememberMe: boolean) {
    const infoUser = this.buildInfoUser(user);
    const refreshExpires = rememberMe ? '30d' : '5d';
    const token = await this.jwtService.signAsync(infoUser);
    const refreshToken = await this.jwtService.signAsync(
      { ...infoUser, type: 'refresh' },
      { expiresIn: refreshExpires },
    );
    return { user: infoUser, token, refreshToken };
  }

  async changePassword(changePasswordDto: ChangePasswordDto) {
    const { oldPassword, newPassword } = changePasswordDto;
    const email = normalizeAuthEmail(changePasswordDto.email);

    const user = await this.userRepository.findOneBy({
      email: email || undefined,
    });

    if (!user) {
      throw new UnauthorizedException(PANEL_LOGIN_FAILED_MESSAGE);
    }

    const isMatch = await comparePasswords(oldPassword, user.password ?? '');

    if (!isMatch) {
      throw new UnauthorizedException(PANEL_LOGIN_FAILED_MESSAGE);
    }

    const hashedNewPassword = encodePassword(newPassword);
    user.password = hashedNewPassword;

    try {
      await this.userRepository.save(user);
      await this.revokeTrustedDevicesForUser(user.id);
      return {
        message: 'Contraseña actualizada exitosamente',
        code: 200,
      };
    } catch (error) {
      this.handleExceptionService.handleDBExceptions(error);
    }
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const email = normalizeAuthEmail(forgotPasswordDto.email);

    const user = await this.userRepository.findOneBy({
      email: email || undefined,
    });

    if (!user) {
      return {
        message:
          'Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña',
        code: 200,
      };
    }

    const resetToken = await this.jwtService.signAsync(
      { id: user.id, email: user.email, type: 'password-reset' },
      { expiresIn: '1h' },
    );

    const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
    try {
      await this.emailService.sendPasswordResetEmail(user.email, userName, resetToken);
    } catch (emailError) {
      console.error('Error al enviar email de reset:', emailError);
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
      const payload = await this.jwtService.verifyAsync(token);

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

      const hashedNewPassword = encodePassword(newPassword);
      user.password = hashedNewPassword;

      await this.userRepository.save(user);
      await this.revokeTrustedDevicesForUser(user.id);

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
        username: user.username,
        email: user.email,
        status: user.status,
        type: user.type,
        first_name: user.first_name ?? undefined,
        last_name: user.last_name ?? undefined,
        createdAt: user.createdAt?.toISOString?.() ?? undefined,
      };
      const token = await this.jwtService.signAsync(newPayload);

      return { token };
    } catch (error) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
