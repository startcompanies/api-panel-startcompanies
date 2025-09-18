import { Module } from '@nestjs/common';
import { HandleExceptionsService } from './common.service';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  providers: [HandleExceptionsService],
  imports: [TypeOrmModule.forFeature([])],
  exports: [HandleExceptionsService, TypeOrmModule],
})
export class CommonModule {}
