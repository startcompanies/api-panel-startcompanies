import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessStep } from './entities/process-step.entity';
import { Request } from '../requests/entities/request.entity';
import { ProcessStepsService } from './process-steps.service';
import { ProcessStepsController } from './process-steps.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProcessStep, Request])],
  controllers: [ProcessStepsController],
  providers: [ProcessStepsService],
  exports: [ProcessStepsService],
})
export class ProcessStepsModule {}

