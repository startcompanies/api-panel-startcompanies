import { Module } from '@nestjs/common';
import { LiliController } from './lili.controller';
import { LiliService } from './lili.service';

@Module({
  controllers: [LiliController],
  providers: [LiliService],
  exports: [LiliService],
})
export class LiliModule {}
