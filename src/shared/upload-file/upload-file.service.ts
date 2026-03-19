import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import axios from 'axios';
import { awsConfigService } from '../../config/aws.config.service';
import { HandleExceptionsService } from 'src/shared/common/common.service';

@Injectable()
export class UploadFileService {
  private readonly s3Client: S3Client;
  private readonly logger = new Logger(UploadFileService.name);
  private readonly bucketName: string;
  private readonly region: string;
  private readonly mediaDomain: string;

  constructor(private readonly exceptionService: HandleExceptionsService) {
    this.s3Client = new S3Client({
      region: awsConfigService.getRegion(),
      credentials: {
        accessKeyId: awsConfigService.getAccessKeyId(),
        secretAccessKey: awsConfigService.getSecretAccessKey(),
      },
    });
    this.bucketName = awsConfigService.getBucketName();
    this.region = awsConfigService.getRegion();
    this.mediaDomain = awsConfigService.getMediaDomain();
  }

  async uploadFile(
    file: Express.Multer.File,
    servicio?: string,
    requestUuid?: string,
    folder?: string,
  ): Promise<{ url: string; key: string } | undefined> {
    // Si se especifica folder (ej: blog), usar key = folder/{timestamp}-{filename}
    const folderNormalizado = folder && folder.trim()
      ? folder.replace(/[^a-z0-9-_/]/gi, '').replace(/\/+/g, '/').replace(/^\/|\/$/g, '')
      : null;

    let key: string;

    if (folderNormalizado) {
      key = `${folderNormalizado}/${Date.now()}-${file.originalname}`;
      this.logger.log(`Subiendo archivo a carpeta "${folderNormalizado}": ${key}`);
    } else {
    // Construir la key según si se proporcionan servicio y requestUuid
    // Normalizar el servicio (remover caracteres especiales, convertir a minúsculas, reemplazar espacios por guiones)
    const servicioNormalizado = servicio && servicio.trim()
      ? servicio
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
      : null;
    
    if (servicioNormalizado && requestUuid && requestUuid.trim()) {
      // Estructura final: request/{servicio}/{requestUuid}/{timestamp}-{filename}
      // Normalizar el UUID (remover caracteres no válidos, mantener solo alfanuméricos y guiones)
      const uuidNormalizado = requestUuid
        .trim()
        .replace(/[^a-zA-Z0-9-]/g, '');
      
      if (uuidNormalizado) {
        key = `request/${servicioNormalizado}/${uuidNormalizado}/${Date.now()}-${file.originalname}`;
        this.logger.log(`Subiendo archivo con estructura final: ${key}`);
      } else {
        // Si el UUID no es válido, usar estructura temporal
        key = `request/${servicioNormalizado}/${Date.now()}-${file.originalname}`;
        this.logger.log(`UUID inválido, usando estructura temporal: ${key}`);
      }
    } else if (servicioNormalizado) {
      // Estructura temporal: request/{servicio}/{timestamp}-{filename}
      // Los archivos se moverán a request/{servicio}/{uuid}/ cuando se cree el request
      key = `request/${servicioNormalizado}/${Date.now()}-${file.originalname}`;
      this.logger.log(`Subiendo archivo con estructura temporal: ${key}`);
    } else {
      // Estructura original: raíz del bucket (comportamiento por defecto)
      key = `${Date.now()}-${file.originalname}`;
      this.logger.log(`Subiendo archivo a la raíz del bucket: ${key}`);
    }
    }

    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    };

    try {
      const upload = new Upload({
        client: this.s3Client,
        params: params,
      });

      await upload.done();
      // Construir URL usando el dominio de medios configurado
      // Asegurar que el dominio termine con / y que la key no empiece con /
      const cleanDomain = this.mediaDomain.replace(/\/$/, '');
      const cleanKey = key.startsWith('/') ? key.substring(1) : key;
      const url = `${cleanDomain}/${cleanKey}`;
      this.logger.log(`Archivo subido exitosamente: ${url}`);
      return { url, key };
    } catch (error) {
      //this.logger.error('Error al subir el archivo a S3.', error);
      /*throw new Error('Error al subir el archivo a S3.');*/
      this.exceptionService.handleAwsS3Exception(error);
    }
  }

  /**
   * Descarga una imagen desde una URL y la sube a S3.
   * Si la URL ya es de media.startcompanies.us/blog/, se devuelve la misma URL sin re-subir.
   * Así se evitan problemas de CORS al hacer la descarga en el servidor.
   */
  async uploadFromUrl(
    imageUrl: string,
    folder?: string,
  ): Promise<{ url: string; key: string }> {
    const url = (imageUrl || '').trim();
    if (!url) {
      this.exceptionService.handleBadRequestFileException();
    }

    const mediaDomain = this.mediaDomain.replace(/\/$/, '');
    const blogPrefix = `${mediaDomain}/blog/`;
    if (url.startsWith(blogPrefix)) {
      this.logger.log(`URL ya está en blog/: ${url}`);
      const key = url.slice(blogPrefix.length).split('?')[0];
      return { url, key };
    }

    const targetFolder = (folder && folder.trim()) || 'blog';
    this.logger.log(`Descargando imagen desde URL para subir a ${targetFolder}: ${url}`);

    const isBufferOrArrayBuffer = (data: unknown): boolean =>
      data != null &&
      (Buffer.isBuffer(data) || data instanceof ArrayBuffer);

    let response;
    try {
      response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 10 * 1024 * 1024, // 10 MB
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });
    } catch (err) {
      this.logger.warn('Error al descargar imagen desde URL:', url, err?.message);
      throw new BadRequestException('No se pudo descargar la imagen desde la URL');
    }

    if (response.status !== 200) {
      this.logger.warn(
        `URL devolvió status ${response.status}: ${url}`,
      );
      throw new BadRequestException('No se pudo descargar la imagen');
    }
    if (!response.data || !isBufferOrArrayBuffer(response.data)) {
      this.logger.warn('Respuesta sin datos válidos (buffer):', url);
      throw new BadRequestException('No se pudo descargar la imagen');
    }

    const buffer = Buffer.isBuffer(response.data)
      ? response.data
      : Buffer.from(response.data);
    const contentType =
      response.headers['content-type']?.split(';')[0]?.trim() || 'image/png';
    const ext =
      contentType.split('/')[1] || url.split('.').pop()?.split('?')[0] || 'png';
    const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : 'png';
    const filename = `image.${safeExt}`;

    const file: Express.Multer.File = {
      fieldname: 'file',
      originalname: filename,
      encoding: '7bit',
      mimetype: contentType,
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    const result = await this.uploadFile(
      file,
      undefined,
      undefined,
      targetFolder,
    );
    if (!result) {
      throw new BadRequestException('Error al subir la imagen a S3');
    }
    return result;
  }

  /**
   * Mueve archivos de request/{servicio}/ a request/{servicio}/{uuid}/
   * Se llama cuando se crea un request para organizar los archivos subidos previamente
   */
  async moveFilesToRequestFolder(
    servicio: string,
    requestUuid: string,
  ): Promise<{ moved: number; errors: number }> {
    if (!servicio || !requestUuid) {
      this.logger.warn('No se puede mover archivos: servicio o requestUuid faltante');
      return { moved: 0, errors: 0 };
    }

    // Normalizar servicio y UUID
    const servicioNormalizado = servicio
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const uuidNormalizado = requestUuid
      .trim()
      .replace(/[^a-zA-Z0-9-]/g, '');

    if (!servicioNormalizado || !uuidNormalizado) {
      this.logger.warn('No se puede mover archivos: servicio o UUID normalizado inválido');
      return { moved: 0, errors: 0 };
    }

    const sourcePrefix = `request/${servicioNormalizado}/`;
    const targetPrefix = `request/${servicioNormalizado}/${uuidNormalizado}/`;

    this.logger.log(`Moviendo archivos de ${sourcePrefix} a ${targetPrefix}`);

    let moved = 0;
    let errors = 0;

    try {
      // Listar todos los archivos en request/{servicio}/
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: sourcePrefix,
      });

      const listResponse = await this.s3Client.send(listCommand);
      const objects = listResponse.Contents || [];

      // Filtrar solo archivos (no carpetas) y excluir los que ya están en la carpeta del UUID
      const filesToMove = objects.filter(
        (obj) => obj.Key && 
        !obj.Key.endsWith('/') && 
        !obj.Key.startsWith(targetPrefix)
      );

      this.logger.log(`Encontrados ${filesToMove.length} archivos para mover`);

      // Mover cada archivo
      for (const file of filesToMove) {
        if (!file.Key) continue;

        const fileName = file.Key.replace(sourcePrefix, '');
        const newKey = `${targetPrefix}${fileName}`;

        try {
          // Copiar el archivo a la nueva ubicación.
          // CopySource debe llevar la key URL-encoded para que la firma S3 coincida (nombres con espacios/unicode).
          const copySource = `${this.bucketName}/${encodeURIComponent(file.Key)}`;
          const copyCommand = new CopyObjectCommand({
            Bucket: this.bucketName,
            CopySource: copySource,
            Key: newKey,
          });

          await this.s3Client.send(copyCommand);

          // Eliminar el archivo original
          const deleteCommand = new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: file.Key,
          });

          await this.s3Client.send(deleteCommand);

          moved++;
          this.logger.log(`Archivo movido: ${file.Key} -> ${newKey}`);
        } catch (error) {
          errors++;
          this.logger.error(`Error al mover archivo ${file.Key}:`, error);
        }
      }

      this.logger.log(`Movidos ${moved} archivos, ${errors} errores`);
      return { moved, errors };
    } catch (error) {
      this.logger.error('Error al listar archivos para mover:', error);
      this.exceptionService.handleAwsS3Exception(error);
      return { moved, errors: errors + 1 };
    }
  }
}
