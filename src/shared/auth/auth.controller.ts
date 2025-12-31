import { Body, Controller, Post, Get, Query, Res, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Sign In'})
  signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto);
  }

  @Post('/change-password')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change Password'})
  changePassword(@Body() changePasswordDto: ChangePasswordDto) {
    return this.authService.changePassword(changePasswordDto);
  }

  @Post('/forgot-password')
  @ApiOperation({ summary: 'Forgot Password - Request password reset' })
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('/reset-password')
  @ApiOperation({ summary: 'Reset Password - Reset password with token' })
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
  @ApiOperation({ summary: 'Refresh token SSO - Para autenticación SSO/iframe' })
  async refreshSso(@Body() refreshSsoDto: RefreshSsoDto) {
    const tokens = await this.authService.refresh(refreshSsoDto.refreshToken);
    return { accessToken: tokens.accessToken };
  }
}
