import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadFileService } from './upload-file.service';
import { HandleExceptionsService } from 'src/shared/common/common.service';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UploadFileDto } from './dtos/upload-file.dto';
import { UploadFromUrlDto } from './dtos/upload-from-url.dto';

@ApiTags('Common - Upload Files')
@Controller('upload-file')
export class UploadFileController {
  constructor(
    private readonly uploadFileService: UploadFileService,
    private readonly exceptionService: HandleExceptionsService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload a file. Opcionalmente, proporciona servicio y requestUuid para guardar en estructura request/{servicio}/{requestUuid}/',
    type: UploadFileDto,
  })
  @ApiOperation({
    summary: 'Subir un archivo',
    description:
      'Sube un archivo al bucket S3. Con servicio + requestUuid (UUID real de la solicitud, no id numérico): request/{servicio}/{uuid}/. Solo servicio: request/{servicio}/{timestamp}-archivo (temporal). folder ignora servicio/requestUuid (p. ej. blog/{slug}).',
  })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    if (!file) {
      this.exceptionService.handleBadRequestFileException();
    } else {
      // Extraer servicio, requestUuid y folder del body (vienen como strings en multipart/form-data)
      const servicio = body.servicio && typeof body.servicio === 'string' ? body.servicio.trim() : undefined;
      const requestUuid = body.requestUuid && typeof body.requestUuid === 'string' ? body.requestUuid.trim() : undefined;
      const folder = body.folder && typeof body.folder === 'string' ? body.folder.trim() : undefined;

      const result = await this.uploadFileService.uploadFile(
        file,
        servicio,
        requestUuid,
        folder,
      );
      return {
        url: result?.url,
        key: result?.key,
        message: 'Archivo subido exitosamente',
      };
    }
  }

  @Post('from-url')
  @ApiOperation({
    summary: 'Subir imagen desde URL',
    description:
      'Descarga la imagen desde la URL (en el servidor, sin CORS) y la sube a S3. Si la URL ya es de media.../blog/ devuelve la misma URL. Carpeta por defecto: blog; para posts usar blog/{slug}. El nombre de archivo conserva el de la URL (sanitizado).',
  })
  @ApiBody({ type: UploadFromUrlDto })
  async uploadFromUrl(@Body() body: UploadFromUrlDto) {
    const { url, folder } = body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new BadRequestException('url es requerida');
    }
    const result = await this.uploadFileService.uploadFromUrl(
      url.trim(),
      folder?.trim() || 'blog',
    );
    return {
      url: result.url,
      key: result.key,
      message: 'Imagen procesada correctamente',
    };
  }

  @Post('move-to-request')
  @ApiOperation({
    summary: 'Mover archivos a carpeta del request',
    description: 'Mueve archivos de request/{servicio}/ a request/{servicio}/{uuid}/ cuando se crea un request',
  })
  async moveFilesToRequestFolder(
    @Body() body: { servicio: string; requestUuid: string },
  ) {
    const { servicio, requestUuid } = body;
    if (!servicio || !requestUuid) {
      throw new BadRequestException('servicio y requestUuid son requeridos');
    }
    
    const result = await this.uploadFileService.moveFilesToRequestFolder(
      servicio,
      requestUuid,
    );
    
    return {
      message: `Archivos movidos: ${result.moved} exitosos, ${result.errors} errores`,
      moved: result.moved,
      errors: result.errors,
    };
  }
}
