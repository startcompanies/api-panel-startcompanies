import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { authService } from './auth.service';
import { SignUpDto } from './dtos/signup.dto';
import { SignInDto } from './dtos/signin.dto';
import { ChangePasswordDto } from './dtos/changePassword.dto';
import { ForgotPasswordDto } from './dtos/forgotPassword.dto';
import { ResetPasswordDto } from './dtos/resetPassword.dto';
import { AuthGuard } from './auth.guard';

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
}
