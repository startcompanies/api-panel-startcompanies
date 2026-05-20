import { Module } from '@nestjs/common';
import { HandleExceptionsService } from './common.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './services/email.service';
import { FileLoggerService } from './services/file-logger.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  providers: [HandleExceptionsService, EmailService, FileLoggerService],
  imports: [TypeOrmModule.forFeature([]), ConfigModule],
  exports: [HandleExceptionsService, EmailService, FileLoggerService, TypeOrmModule],
})
 export class CommonModule {}
