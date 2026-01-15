import { Body, Controller, Post, Get, Query, Res, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery, ApiBody, ApiResponse } from '@nestjs/swagger';
import { authService } from './auth.service';
import { SignUpDto } from './dtos/signup.dto';
import { SignInDto } from './dtos/signin.dto';
import { ChangePasswordDto } from './dtos/changePassword.dto';
import { ForgotPasswordDto } from './dtos/forgotPassword.dto';
import { ResetPasswordDto } from './dtos/resetPassword.dto';
import { RefreshSsoDto } from './dtos/sso.dto';
import { AuthGuard } from './auth.guard';
import type { Response } from 'express';

@ApiTags('Common - Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: authService) {}

  @Post('/signup')
  @ApiOperation({ summary: 'Sign Up' })
  signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  @Post('/signin')
  @ApiOperation({ 
    summary: 'Iniciar sesión',
    description: 'Autentica un usuario y retorna tokens de acceso y refresh.',
  })
  @ApiBody({ type: SignInDto })
  @ApiResponse({ status: 200, description: 'Inicio de sesión exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto);
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

  @Get('/sso')
  @ApiOperation({ summary: 'SSO Sign In - Autenticación mediante parámetros de URL' })
  @ApiQuery({ name: 'email', description: 'Email del usuario', required: true })
  @ApiQuery({ name: 'token', description: 'Token de validación SSO', required: true })
  @ApiQuery({ name: 'customerId', description: 'ID del cliente (opcional)', required: false })
  @ApiQuery({ name: 'phone', description: 'Teléfono del cliente (opcional)', required: false })
  async ssoSignIn(
    @Query('email') email: string,
    @Query('token') token: string,
    @Res({ passthrough: true }) res: Response,
    @Query('customerId') customerId?: string,
    @Query('phone') phone?: string,
  ) {
    if (!email || !token) {
      throw new HttpException('Email and token are required', HttpStatus.BAD_REQUEST);
    }

    const ssoDto = {
      email,
      token,
      customerId,
      phone,
    };

    const userData: any = await this.authService.ssoSignIn(ssoDto);

    // Guardar refreshToken en cookie
    res.cookie('refreshToken', userData.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // 'lax' para permitir embedding en iframes
      maxAge: 5 * 24 * 60 * 60 * 1000, // 5 días
    });

    // Para SSO (iframe), también devolver refreshToken en la respuesta
    // Esto permite guardarlo en localStorage como fallback cuando las cookies no funcionan
    return {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      status: userData.status,
      type: userData.type,
      accessToken: userData.accessToken,
      refreshToken: userData.refreshToken, // Incluir para localStorage (fallback)
    };
  }

  @Post('refresh-sso')
  @ApiOperation({ 
    summary: 'Refrescar token SSO',
    description: 'Refresca el token de acceso para autenticación SSO/iframe.',
  })
  @ApiBody({ type: RefreshSsoDto })
  @ApiResponse({ status: 200, description: 'Token refrescado exitosamente' })
  @ApiResponse({ status: 401, description: 'Token de refresh inválido' })
  async refreshSso(@Body() refreshSsoDto: RefreshSsoDto) {
    const tokens = await this.authService.refresh(refreshSsoDto.refreshToken);
    return { accessToken: tokens.accessToken };
  }
}
