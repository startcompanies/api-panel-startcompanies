import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dtos/create-document.dto';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Panel - Documents')
@Controller('panel/documents')
@UseGuards(AuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // Listar documentos de una solicitud
  @Get('request/:requestId')
  findByRequest(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.documentsService.findByRequest(requestId);
  }

  // Listar documentos de un campo específico
  @Get('request/:requestId/field/:fieldName')
  findByRequestAndField(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param('fieldName') fieldName: string,
  ) {
    return this.documentsService.findByRequestAndField(requestId, fieldName);
  }

  // Subir uno o múltiples documentos (hasta 5 por campo)
  // NOTA: La integración con Zoho Workdrive debe implementarse aquí
  // Por ahora este endpoint acepta los datos del documento ya subido
  @Post()
  async create(
    @Body() createDocumentDto: CreateDocumentDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.documentsService.create(createDocumentDto, userId);
  }

  // Subir múltiples documentos
  @Post('multiple')
  async createMultiple(
    @Body() createDocumentDtos: CreateDocumentDto[],
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.documentsService.createMultiple(createDocumentDtos, userId);
  }

  // Descargar documento desde Zoho Workdrive
  @Get(':id/download')
  async download(@Param('id', ParseIntPipe) id: number) {
    const document = await this.documentsService.findOne(id);
    // TODO: Implementar descarga desde Zoho Workdrive usando zohoWorkdriveUrl
    // Por ahora retornamos la URL
    return {
      url: document.zohoWorkdriveUrl,
      name: document.name,
      mimeType: document.mimeType,
    };
  }

  // Eliminar documento (también de Zoho Workdrive)
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.documentsService.delete(id);
  }
}

