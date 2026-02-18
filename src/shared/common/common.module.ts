import { Module } from '@nestjs/common';
import { HandleExceptionsService } from './common.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './services/email.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  providers: [HandleExceptionsService, EmailService],
  imports: [TypeOrmModule.forFeature([]), ConfigModule],
  exports: [HandleExceptionsService, EmailService, TypeOrmModule],
})
 export class CommonModule {}
