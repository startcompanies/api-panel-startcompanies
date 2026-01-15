import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from './entities/document.entity';
import { Request } from '../requests/entities/request.entity';
import { CreateDocumentDto } from './dtos/create-document.dto';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(Request)
    private readonly requestRepo: Repository<Request>,
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

    return this.documentRepo.find({
      where: { requestId },
      relations: ['uploadedBy'],
      order: { uploadedAt: 'DESC' },
    });
  }

  async findByRequestAndField(requestId: number, fieldName: string) {
    // Verificar que la solicitud existe
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }

    return this.documentRepo.find({
      where: { requestId, fieldName },
      relations: ['uploadedBy'],
      order: { uploadedAt: 'DESC' },
    });
  }

  async create(createDocumentDto: CreateDocumentDto, uploadedById: number) {
    // Verificar que la solicitud existe
    const request = await this.requestRepo.findOne({
      where: { id: createDocumentDto.requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${createDocumentDto.requestId} no encontrada`,
      );
    }

    // Verificar límite de 5 archivos por campo
    const existingDocs = await this.documentRepo.count({
      where: {
        requestId: createDocumentDto.requestId,
        fieldName: createDocumentDto.fieldName,
      },
    });

    if (existingDocs >= 5) {
      throw new BadRequestException(
        `Se ha alcanzado el límite de 5 archivos para el campo ${createDocumentDto.fieldName}`,
      );
    }

    const document = this.documentRepo.create({
      ...createDocumentDto,
      uploadedById,
      uploadedAt: new Date(),
    });

    return this.documentRepo.save(document);
  }

  async createMultiple(
    createDocumentDtos: CreateDocumentDto[],
    uploadedById: number,
  ) {
    // Verificar que todas las solicitudes existen y son la misma
    const requestIds = [...new Set(createDocumentDtos.map((d) => d.requestId))];
    if (requestIds.length > 1) {
      throw new BadRequestException(
        'Todos los documentos deben pertenecer a la misma solicitud',
      );
    }

    const request = await this.requestRepo.findOne({
      where: { id: requestIds[0] },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestIds[0]} no encontrada`,
      );
    }

    // Agrupar por fieldName y verificar límites
    const fieldCounts: Record<string, number> = {};
    for (const dto of createDocumentDtos) {
      fieldCounts[dto.fieldName] = (fieldCounts[dto.fieldName] || 0) + 1;
    }

    // Verificar límites existentes + nuevos
    for (const [fieldName, newCount] of Object.entries(fieldCounts)) {
      const existingCount = await this.documentRepo.count({
        where: {
          requestId: requestIds[0],
          fieldName,
        },
      });

      if (existingCount + newCount > 5) {
        throw new BadRequestException(
          `Se excedería el límite de 5 archivos para el campo ${fieldName}`,
        );
      }
    }

    const documents = createDocumentDtos.map((dto) =>
      this.documentRepo.create({
        ...dto,
        uploadedById,
        uploadedAt: new Date(),
      }),
    );

    return this.documentRepo.save(documents);
  }

  async findOne(id: number) {
    const document = await this.documentRepo.findOne({
      where: { id },
      relations: ['request', 'uploadedBy'],
    });

    if (!document) {
      throw new NotFoundException(`Documento con ID ${id} no encontrado`);
    }

    return document;
  }

  async delete(id: number) {
    const document = await this.documentRepo.findOne({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException(`Documento con ID ${id} no encontrado`);
    }

    // TODO: Eliminar archivo de Zoho Workdrive usando zohoWorkdriveFileId
    // Por ahora solo eliminamos el registro de la BD

    await this.documentRepo.remove(document);
    return { message: 'Documento eliminado correctamente' };
  }
}

