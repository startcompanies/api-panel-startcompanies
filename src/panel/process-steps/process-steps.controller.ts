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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Panel - Process Steps')
@ApiBearerAuth('JWT-auth')
@Controller('panel/process-steps')
@UseGuards(AuthGuard)
export class ProcessStepsController {
  constructor(private readonly processStepsService: ProcessStepsService) {}

  // Obtener pasos de una solicitud
  @Get('request/:requestId')
  @ApiOperation({
    summary: 'Obtener pasos de una solicitud',
    description: 'Obtiene todos los pasos del proceso asociados a una solicitud.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Lista de pasos del proceso' })
  findByRequest(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.processStepsService.findByRequest(requestId);
  }

  // Crear nuevo paso (admin, para configuración)
  @Post()
  @ApiOperation({
    summary: 'Crear un paso de proceso',
    description: 'Crea un nuevo paso de proceso (solo para administradores, para configuración).',
  })
  @ApiBody({ type: CreateProcessStepDto })
  @ApiResponse({ status: 201, description: 'Paso de proceso creado exitosamente' })
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
  @ApiOperation({
    summary: 'Asignar responsable a un paso',
    description: 'Asigna un responsable a un paso de proceso específico.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID del paso de proceso' })
  @ApiBody({ type: AssignProcessStepDto })
  @ApiResponse({ status: 200, description: 'Responsable asignado exitosamente' })
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() assignDto: AssignProcessStepDto,
  ) {
    return this.processStepsService.assign(id, assignDto);
  }
}

