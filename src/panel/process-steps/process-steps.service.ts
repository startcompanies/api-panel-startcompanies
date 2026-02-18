import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ProcessStep } from './entities/process-step.entity';
import { Request } from '../requests/entities/request.entity';
import { CreateProcessStepDto } from './dtos/create-process-step.dto';
import { UpdateProcessStepDto } from './dtos/update-process-step.dto';
import { AssignProcessStepDto } from './dtos/assign-process-step.dto';

@Injectable()
export class ProcessStepsService {
  constructor(
    @InjectRepository(ProcessStep)
    private readonly processStepRepo: Repository<ProcessStep>,
    @InjectRepository(Request)
    private readonly requestRepo: Repository<Request>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findByRequest(requestId: number) {
    // Verificar que la solicitud existe
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }

    return this.processStepRepo.find({
      where: { requestId },
      order: { orderNumber: 'ASC' },
    });
  }

  async create(createProcessStepDto: CreateProcessStepDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que la solicitud existe
      const request = await this.requestRepo.findOne({
        where: { id: createProcessStepDto.requestId },
      });
      if (!request) {
        throw new NotFoundException(
          `Solicitud con ID ${createProcessStepDto.requestId} no encontrada`,
        );
      }

      // Verificar que no exista otro paso con el mismo orderNumber para esta solicitud
      const existingStep = await this.processStepRepo.findOne({
        where: {
          requestId: createProcessStepDto.requestId,
          orderNumber: createProcessStepDto.orderNumber,
        },
      });
      if (existingStep) {
        throw new BadRequestException(
          `Ya existe un paso con orderNumber ${createProcessStepDto.orderNumber} para esta solicitud`,
        );
      }

      const processStep = this.processStepRepo.create(createProcessStepDto);
      const savedStep = await queryRunner.manager.save(ProcessStep, processStep);

      await queryRunner.commitTransaction();
      return savedStep;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al crear paso de proceso:', error);
      throw new InternalServerErrorException(
        'Error al crear el paso de proceso. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async update(id: number, updateProcessStepDto: UpdateProcessStepDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const processStep = await this.processStepRepo.findOne({
        where: { id },
      });

      if (!processStep) {
        throw new NotFoundException(`Paso de proceso con ID ${id} no encontrado`);
      }

      // Si se marca como completado, establecer fecha de completado
      if (
        updateProcessStepDto.status === 'completed' &&
        processStep.status !== 'completed'
      ) {
        updateProcessStepDto.completedBy = updateProcessStepDto.completedBy;
        processStep.completedAt = new Date();
      } else if (updateProcessStepDto.status !== 'completed') {
        // Si se cambia de completado a otro estado, limpiar fecha
        processStep.completedAt = undefined;
        processStep.completedBy = undefined;
      }

      Object.assign(processStep, updateProcessStepDto);
      const updatedStep = await queryRunner.manager.save(
        ProcessStep,
        processStep,
      );

      await queryRunner.commitTransaction();
      return updatedStep;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al actualizar paso de proceso:', error);
      throw new InternalServerErrorException(
        'Error al actualizar el paso de proceso. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async assign(id: number, assignDto: AssignProcessStepDto) {
    const processStep = await this.processStepRepo.findOne({
      where: { id },
    });

    if (!processStep) {
      throw new NotFoundException(`Paso de proceso con ID ${id} no encontrado`);
    }

    processStep.assignedTo = assignDto.assignedTo;
    return this.processStepRepo.save(processStep);
  }
}

