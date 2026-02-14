import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody, ApiResponse } from '@nestjs/swagger';
import * as express from 'express';
import { JwtService } from '@nestjs/jwt';
import { authService } from './auth.service';
import { SignUpDto } from './dtos/signup.dto';
import { SignInDto } from './dtos/signin.dto';
import { ChangePasswordDto } from './dtos/changePassword.dto';
import { ForgotPasswordDto } from './dtos/forgotPassword.dto';
import { ResetPasswordDto } from './dtos/resetPassword.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { AuthGuard } from './auth.guard';
import { jwtConstants } from '../common/constants/jwtConstants';

const isProduction = process.env.NODE_ENV === 'production';
// SameSite=None + Secure para que las cookies se envíen en peticiones cross-origin (frontend en otro dominio)
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
};

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
    summary: 'Iniciar sesión',
    description: 'Autentica y devuelve user + tokens; además setea cookies HttpOnly (access_token, refresh_token).',
  })
  @ApiBody({ type: SignInDto })
  @ApiResponse({ status: 200, description: 'Inicio de sesión exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async signIn(
    @Body() signInDto: SignInDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.signIn(signInDto);
    if ('token' in result && result.token && result.refreshToken) {
      res.cookie('access_token', result.token, {
        ...cookieOptions,
        maxAge: 60 * 60 * 1000,
      });
      res.cookie('refresh_token', result.refreshToken, {
        ...cookieOptions,
        maxAge: 5 * 24 * 60 * 60 * 1000,
      });
    }
    return result;
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
