import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ProcessStepsService } from './process-steps.service';
import { CreateProcessStepDto } from './dtos/create-process-step.dto';
import { UpdateProcessStepDto } from './dtos/update-process-step.dto';
import { AssignProcessStepDto } from './dtos/assign-process-step.dto';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Panel - Process Steps')
@Controller('panel/process-steps')
@UseGuards(AuthGuard)
export class ProcessStepsController {
  constructor(private readonly processStepsService: ProcessStepsService) {}

  // Obtener pasos de una solicitud
  @Get('request/:requestId')
  findByRequest(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.processStepsService.findByRequest(requestId);
  }

  // Crear nuevo paso (admin, para configuración)
  @Post()
  create(@Body() createProcessStepDto: CreateProcessStepDto) {
    return this.processStepsService.create(createProcessStepDto);
  }

  // Actualizar estado de un paso
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProcessStepDto: UpdateProcessStepDto,
  ) {
    return this.processStepsService.update(id, updateProcessStepDto);
  }

  // Asignar responsable a un paso
  @Patch(':id/assign')
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() assignDto: AssignProcessStepDto,
  ) {
    return this.processStepsService.assign(id, assignDto);
  }
}

