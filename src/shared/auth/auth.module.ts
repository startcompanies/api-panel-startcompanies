import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { authService } from './auth.service';
import { HandleExceptionsService } from 'src/shared/common/common.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/shared/user/entities/user.entity';
import { LoginOtpChallenge } from './entities/login-otp-challenge.entity';
import { TrustedLoginDevice } from './entities/trusted-login-device.entity';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from 'src/shared/common/constants/jwtConstants';
import { RolesGuard } from './roles.guard';
import { AuthGuard } from './auth.guard';
import { CommonModule } from '../common/common.module';

@Module({
  controllers: [AuthController],
  providers: [authService, HandleExceptionsService, RolesGuard, AuthGuard],
  exports: [RolesGuard],
  imports: [
    TypeOrmModule.forFeature([User, LoginOtpChallenge, TrustedLoginDevice]),
    CommonModule,
    JwtModule.register({
      global: true,
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '60m' },
    }),
  ],
})
export class AuthModule {}
