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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Panel - Documents')
@ApiBearerAuth('JWT-auth')
@Controller('panel/documents')
@UseGuards(AuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // Listar documentos de una solicitud
  @Get('request/:requestId')
  @ApiOperation({
    summary: 'Listar documentos de una solicitud',
    description: 'Obtiene todos los documentos asociados a una solicitud específica.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Lista de documentos' })
  findByRequest(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.documentsService.findByRequest(requestId);
  }

  // Listar documentos de un campo específico
  @Get('request/:requestId/field/:fieldName')
  @ApiOperation({
    summary: 'Listar documentos por campo',
    description: 'Obtiene todos los documentos de un campo específico de una solicitud.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiParam({ name: 'fieldName', description: 'Nombre del campo' })
  @ApiResponse({ status: 200, description: 'Lista de documentos del campo' })
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
  @ApiOperation({
    summary: 'Crear múltiples documentos',
    description: 'Crea múltiples documentos en una sola operación.',
  })
  @ApiBody({ type: [CreateDocumentDto] })
  @ApiResponse({ status: 201, description: 'Documentos creados exitosamente' })
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
  @ApiOperation({
    summary: 'Eliminar un documento',
    description: 'Elimina un documento, también de Zoho Workdrive si está sincronizado.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID del documento' })
  @ApiResponse({ status: 200, description: 'Documento eliminado exitosamente' })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.documentsService.delete(id);
  }
}

