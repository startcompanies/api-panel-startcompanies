import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody, ApiResponse } from '@nestjs/swagger';
import * as express from 'express';
import { JwtService } from '@nestjs/jwt';
import { authService } from './auth.service';
import { SignUpDto } from './dtos/signup.dto';
import { SignInDto } from './dtos/signin.dto';
import { SignInVerifyDto } from './dtos/signin-verify.dto';
import { SignInResendOtpDto } from './dtos/signin-resend-otp.dto';
import { ChangePasswordDto } from './dtos/changePassword.dto';
import { ForgotPasswordDto } from './dtos/forgotPassword.dto';
import { ResetPasswordDto } from './dtos/resetPassword.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { AuthGuard } from './auth.guard';
import { jwtConstants } from '../common/constants/jwtConstants';
import {
  LOGIN_TRUST_MAX_AGE_MS,
  PANEL_DEVICE_TRUST_COOKIE,
} from './constants/login-trust.constants';
import type { LoginTrustRequestContext } from './auth.service';

const isProduction = process.env.NODE_ENV === 'production';
// SameSite=None + Secure para que las cookies se envíen en peticiones cross-origin (frontend en otro dominio)
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
};

const ACCESS_COOKIE_MS = 60 * 60 * 1000;
const REFRESH_COOKIE_SHORT_MS = 5 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_LONG_MS = 30 * 24 * 60 * 60 * 1000;

function extractClientIp(req: express.Request): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff)
    ? xff[0]
    : typeof xff === 'string'
      ? xff.split(',')[0]?.trim()
      : '';
  return raw || req.ip || req.socket?.remoteAddress || '';
}

function buildLoginTrustContext(req: express.Request): LoginTrustRequestContext {
  const ua = req.headers['user-agent'];
  return {
    deviceCookie: req.cookies?.[PANEL_DEVICE_TRUST_COOKIE],
    userAgent: typeof ua === 'string' ? ua : '',
    clientIp: extractClientIp(req),
  };
}

function setPanelSessionCookies(
  res: express.Response,
  accessToken: string,
  refreshToken: string,
  rememberMe: boolean,
) {
  const refreshMs = rememberMe ? REFRESH_COOKIE_LONG_MS : REFRESH_COOKIE_SHORT_MS;
  res.cookie('access_token', accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_COOKIE_MS,
  });
  res.cookie('refresh_token', refreshToken, {
    ...cookieOptions,
    maxAge: refreshMs,
  });
}

@ApiTags('Common - Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: authService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('/signup')
  @ApiOperation({ summary: 'Sign Up' })
  signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  @Post('/signin')
  @ApiOperation({
    summary: 'Iniciar sesión (paso 1)',
    description:
      'Valida email y contraseña; envía código OTP al correo. No emite cookies hasta POST /auth/signin/verify.',
  })
  @ApiBody({ type: SignInDto })
  @ApiResponse({ status: 200, description: 'Segundo factor requerido o error de credenciales (mismo formato histórico)' })
  async signIn(
    @Body() signInDto: SignInDto,
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.signIn(signInDto, buildLoginTrustContext(req));
    if (
      result &&
      typeof result === 'object' &&
      'trustedDeviceBypass' in result &&
      result.trustedDeviceBypass === true
    ) {
      const { trustedDeviceBypass: _b, rememberMe, token, refreshToken, ...rest } = result as {
        trustedDeviceBypass: true;
        rememberMe: boolean;
        token: string;
        refreshToken: string;
        user: unknown;
      };
      setPanelSessionCookies(res, token, refreshToken, rememberMe);
      return rest;
    }
    return result;
  }

  @Post('/trust-device')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Recordar este navegador (omitir OTP)',
    description:
      'Tras iniciar sesión con 2FA, registra el dispositivo hasta 180 días. Emite cookie HttpOnly; no se borra al cerrar sesión.',
  })
  @ApiResponse({ status: 200, description: 'Dispositivo registrado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async registerTrustedDevice(
    @Req() req: express.Request & { user?: { id?: number } },
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const uid = req.user?.id;
    if (uid == null || !Number.isFinite(Number(uid))) {
      throw new UnauthorizedException();
    }
    const cookieVal = await this.authService.createTrustedLoginDevice(
      Number(uid),
      buildLoginTrustContext(req),
    );
    res.cookie(PANEL_DEVICE_TRUST_COOKIE, cookieVal, {
      ...cookieOptions,
      maxAge: LOGIN_TRUST_MAX_AGE_MS,
    });
    return { ok: true };
  }

  @Post('/signin/verify')
  @ApiOperation({
    summary: 'Completar inicio de sesión (paso 2)',
    description: 'Valida el código OTP y emite cookies HttpOnly + tokens.',
  })
  @ApiBody({ type: SignInVerifyDto })
  @ApiResponse({ status: 200, description: 'Sesión iniciada' })
  async signInVerify(
    @Body() dto: SignInVerifyDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.signInVerify(dto);
    const rememberMe = Boolean(result.rememberMe);
    setPanelSessionCookies(res, result.token, result.refreshToken, rememberMe);
    const { rememberMe: _rm, ...body } = result;
    return body;
  }

  @Post('/signin/resend-otp')
  @ApiOperation({ summary: 'Reenviar código OTP del login' })
  @ApiBody({ type: SignInResendOtpDto })
  async signInResendOtp(@Body() dto: SignInResendOtpDto) {
    return this.authService.signInResendOtp(dto);
  }

  @Get('/me')
  @ApiOperation({
    summary: 'Usuario actual',
    description: 'Devuelve el usuario desde el token (cookie o header). Si no hay token o es inválido, responde 200 con null (evita 401 en consola al cargar login).',
  })
  @ApiResponse({ status: 200, description: 'Usuario actual o null si no hay sesión' })
  async me(
    @Req() req: express.Request & { cookies?: { access_token?: string } },
  ): Promise<unknown> {
    const token =
      req.cookies?.access_token ??
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : undefined);
    if (!token) {
      return null;
    }
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtConstants.secret,
      });
      return payload;
    } catch {
      return null;
    }
  }

  @Post('/logout')
  @ApiOperation({ summary: 'Cerrar sesión', description: 'Borra las cookies de acceso y refresh.' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  logout(@Res({ passthrough: true }) res: express.Response) {
    const clearOpts = {
      path: '/',
      httpOnly: true,
      sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
      secure: isProduction,
    };
    res.clearCookie('access_token', clearOpts);
    res.clearCookie('refresh_token', clearOpts);
    return { ok: true };
  }

  @Post('/refresh')
  @ApiOperation({
    summary: 'Refrescar token',
    description: 'Nuevo access token; acepta refresh_token por cookie o body. Setea cookie access_token.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Nuevo token de acceso' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido o expirado' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: { cookies?: { refresh_token?: string } },
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const refreshToken = dto?.refreshToken ?? req.cookies?.refresh_token;
    const result = await this.authService.refresh(refreshToken);
    res.cookie('access_token', result.token, {
      ...cookieOptions,
      maxAge: 60 * 60 * 1000,
    });
    return result;
  }

  @Post('/change-password')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ 
    summary: 'Cambiar contraseña',
    description: 'Permite a un usuario autenticado cambiar su contraseña.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Contraseña cambiada exitosamente' })
  @ApiResponse({ status: 400, description: 'Contraseña actual incorrecta' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  changePassword(@Body() changePasswordDto: ChangePasswordDto) {
    return this.authService.changePassword(changePasswordDto);
  }

  @Post('/forgot-password')
  @ApiOperation({ 
    summary: 'Solicitar restablecimiento de contraseña',
    description: 'Envía un email con un token para restablecer la contraseña.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'Email de restablecimiento enviado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('/reset-password')
  @ApiOperation({ 
    summary: 'Restablecer contraseña',
    description: 'Restablece la contraseña usando el token recibido por email.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Contraseña restablecida exitosamente' })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado' })
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
