import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReusableElement } from './entities/reusable-element.entity';
import { ReusableElementDto } from './dtos/reusable-element.dto';
import { HandleExceptionsService } from 'src/common/common.service';

@Injectable()
export class ReusableElementsService {
  constructor(
    @InjectRepository(ReusableElement)
    private reusableElementsRepository: Repository<ReusableElement>,
    private readonly exceptionsService: HandleExceptionsService,
  ) {}

  async create(reusableElementDto: ReusableElementDto): Promise<ReusableElement> {
    try {
      const newReusableElement = this.reusableElementsRepository.create(
        reusableElementDto,
      );
      return await this.reusableElementsRepository.save(newReusableElement);
    } catch (err) {
      console.error('Error al crear el elemento reutilizable:', err);
      throw this.exceptionsService.handleDBExceptions(err);
    }
  }

  async findAll(): Promise<ReusableElement[]> {
    try {
      return await this.reusableElementsRepository.find({
        order: { created_at: 'DESC' },
      });
    } catch (err) {
      console.error('Error al obtener los elementos reutilizables:', err);
      throw this.exceptionsService.handleDBExceptions(err);
    }
  }

  async findById(id: string): Promise<ReusableElement> {
    try {
      const reusableElement = await this.reusableElementsRepository.findOne({
        where: { id: Number(id) },
      });
      if (!reusableElement) {
        throw new NotFoundException(
          `Reusable element with ID "${id}" not found.`,
        );
      }
      return reusableElement;
    } catch (err) {
      console.error('Error al obtener el elemento reutilizable:', err);
      throw this.exceptionsService.handleDBExceptions(err);
    }
  }

  async updateReusableElementById(
    id: string,
    reusableElementDto: Partial<ReusableElementDto>,
  ): Promise<ReusableElement> {
    try {
      const reusableElementToUpdate =
        await this.reusableElementsRepository.findOne({
          where: { id: Number(id) },
        });
      if (!reusableElementToUpdate) {
        throw new NotFoundException(
          `Reusable element with ID "${id}" not found.`,
        );
      }

      const updatedReusableElement = this.reusableElementsRepository.merge(
        reusableElementToUpdate,
        reusableElementDto,
      );
      return await this.reusableElementsRepository.save(updatedReusableElement);
    } catch (err) {
      console.error('Error al actualizar el elemento reutilizable:', err);
      throw this.exceptionsService.handleDBExceptions(err);
    }
  }

  async deleteById(id: string): Promise<void> {
    try {
      const reusableElement = await this.reusableElementsRepository.findOne({
        where: { id: Number(id) },
      });
      if (!reusableElement) {
        throw new NotFoundException(
          `Reusable element with ID "${id}" not found.`,
        );
      }
      await this.reusableElementsRepository.remove(reusableElement);
    } catch (err) {
      console.error('Error al eliminar el elemento reutilizable:', err);
      throw this.exceptionsService.handleDBExceptions(err);
    }
  }
}

