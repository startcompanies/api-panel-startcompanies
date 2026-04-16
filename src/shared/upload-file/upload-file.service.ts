import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
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

  /**
   * Valida que el valor sea el UUID de la solicitud (`requests.uuid`), formato 8-4-4-4-12 hex.
   * No acepta ids numéricos ni otros textos (evita carpetas S3 tipo `request/.../930/`).
   */
  static isValidRequestFolderUuid(value: string): boolean {
    const v = (value || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  }

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

  /**
   * Segmento de carpeta bajo `blog/` para imágenes de un post (solo [a-z0-9-]).
   */
  normalizeBlogFolderSlug(slug: string): string {
    return (slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Prefijo S3 para imágenes de un post: `blog/{slug}`.
   * Si el slug queda vacío tras normalizar, devuelve `blog` (comportamiento anterior).
   */
  buildBlogImageFolder(slug: string): string {
    const n = this.normalizeBlogFolderSlug(slug);
    return n ? `blog/${n}` : 'blog';
  }

  /**
   * Nombre de archivo para subidas desde URL: último segmento del path, sanitizado.
   */
  private deriveFilenameFromImageUrl(urlStr: string, contentType: string): string {
    const safeExtFromCt = (): string => {
      const raw = contentType.split('/')[1]?.split(';')[0]?.trim() || 'png';
      const ext = raw.replace(/[^a-z0-9]/gi, '');
      return /^[a-z0-9]+$/i.test(ext) ? ext : 'png';
    };

    let pathname: string;
    try {
      pathname = new URL(urlStr).pathname;
    } catch {
      return `${Date.now()}-image.${safeExtFromCt()}`;
    }

    const segments = pathname.split('/').filter(Boolean);
    let base = segments.length ? segments[segments.length - 1]! : '';
    try {
      base = decodeURIComponent(base);
    } catch {
      /* usar sin decode */
    }
    base = base.split('?')[0].split('#')[0];
    base = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').trim();
    if (!base || base.length > 220) {
      return `${Date.now()}-image.${safeExtFromCt()}`;
    }
    if (!/\.[a-zA-Z0-9]{1,8}$/.test(base)) {
      base = `${base}.${safeExtFromCt()}`;
    }
    return base;
  }

  /**
   * Si la URL pertenece al dominio de medios configurado, devuelve la key S3 (pathname sin / inicial).
   */
  extractS3KeyFromMediaUrl(url: string): string | null {
    const trimmed = (url || '').trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return null;
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    let mediaParsed: URL;
    try {
      mediaParsed = new URL(this.mediaDomain);
    } catch {
      return null;
    }
    if (parsed.hostname.toLowerCase() !== mediaParsed.hostname.toLowerCase()) {
      return null;
    }
    let key = parsed.pathname.replace(/^\//, '');
    try {
      key = decodeURIComponent(key);
    } catch {
      /* usar key sin decode */
    }
    return key || null;
  }

  /**
   * Descarga el objeto desde S3 cuando la URL apunta al bucket de medios configurado.
   * @returns null si la URL no es del dominio de medios o el objeto no existe.
   */
  async getObjectBufferFromMediaUrl(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string } | null> {
    const key = this.extractS3KeyFromMediaUrl(url);
    if (!key) {
      return null;
    }

    try {
      const out = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      const body = out.Body;
      if (!body) {
        this.logger.warn(`GetObject sin body para key=${key}`);
        return null;
      }
      const chunks: Uint8Array[] = [];
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const contentType =
        out.ContentType?.split(';')[0]?.trim() || 'application/octet-stream';
      const lastSeg = key.split('/').pop() || 'file';
      const filename = lastSeg.includes('.') ? lastSeg : `${lastSeg}.bin`;
      return { buffer, contentType, filename };
    } catch (error: any) {
      this.logger.warn(
        `No se pudo leer S3 para adjunto Zoho (key=${key}): ${error?.message ?? error}`,
      );
      return null;
    }
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
      const rawUuid = requestUuid.trim();
      if (!UploadFileService.isValidRequestFolderUuid(rawUuid)) {
        throw new BadRequestException(
          'requestUuid debe ser el UUID de la solicitud (campo uuid en requests), no el id numérico ni otro texto.',
        );
      }
      const uuidNormalizado = rawUuid.toLowerCase();
      key = `request/${servicioNormalizado}/${uuidNormalizado}/${Date.now()}-${file.originalname}`;
      this.logger.log(`Subiendo archivo con estructura final: ${key}`);
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
   * Copia un objeto dentro del mismo bucket a `destFolder/{timestamp}-{basename}`.
   * Usado para pasar imágenes de `blog/archivo.png` a `blog/{slug}/...` sin re-descargar por HTTP.
   */
  private async copyS3ObjectToFolder(
    sourceKey: string,
    destFolderNormalized: string,
  ): Promise<{ url: string; key: string }> {
    const folder = destFolderNormalized.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
    const baseName = sourceKey.split('/').pop() || 'image.png';
    const safeBase = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
    const newKey = `${folder}/${Date.now()}-${safeBase}`;
    const copySource = `${this.bucketName}/${encodeURIComponent(sourceKey)}`;
    await this.s3Client.send(
      new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: copySource,
        Key: newKey,
        MetadataDirective: 'COPY',
      }),
    );
    const cleanDomain = this.mediaDomain.replace(/\/$/, '');
    const publicUrl = `${cleanDomain}/${newKey}`;
    this.logger.log(`Copiado en S3: ${sourceKey} → ${newKey}`);
    return { url: publicUrl, key: newKey };
  }

  /**
   * Descarga una imagen desde una URL y la sube a S3, o copia dentro del bucket si ya está en media.
   * - Si la URL ya apunta a `folder/` (p. ej. blog/mi-slug/), no hace nada.
   * - Si apunta a otro prefijo bajo `blog/` en el mismo dominio (p. ej. blog/plano.png u otro slug),
   *   copia el objeto a `folder/` (reubicación para contenido migrado).
   * - Si es externa, descarga por HTTP y sube a `folder/`.
   */
  async uploadFromUrl(
    imageUrl: string,
    folder?: string,
  ): Promise<{ url: string; key: string }> {
    const url = (imageUrl || '').trim();
    if (!url) {
      this.exceptionService.handleBadRequestFileException();
    }

    const mediaDomainClean = this.mediaDomain.replace(/\/$/, '');
    const targetFolder =
      (folder && folder.trim())?.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/') || 'blog';

    const urlNoFrag = url.split('#')[0];
    const expectedPrefix = `${mediaDomainClean}/${targetFolder}/`;

    if (urlNoFrag.startsWith(expectedPrefix)) {
      const key =
        this.extractS3KeyFromMediaUrl(urlNoFrag.split('?')[0]) ||
        urlNoFrag.slice(mediaDomainClean.length + 1).split('?')[0];
      const canonicalUrl = `${mediaDomainClean}/${key}`;
      this.logger.log(`URL ya está en la carpeta destino (${targetFolder}): ${canonicalUrl}`);
      return { url: canonicalUrl, key };
    }

    const sourceKey = this.extractS3KeyFromMediaUrl(urlNoFrag.split('?')[0]);
    if (
      sourceKey &&
      sourceKey.startsWith('blog/') &&
      !sourceKey.startsWith(`${targetFolder}/`)
    ) {
      this.logger.log(
        `Reubicando imagen en S3 bajo blog/: ${sourceKey} → ${targetFolder}/`,
      );
      return await this.copyS3ObjectToFolder(sourceKey, targetFolder);
    }

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
    const filename = this.deriveFilenameFromImageUrl(url, contentType);

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
   * Se llama cuando se crea un request para organizar los archivos subidos previamente.
   *
   * @param keys Si se pasa un array, solo se mueven esas claves S3 (referenciadas en el payload).
   *             Array vacío = no mover nada (sin listar el bucket).
   *             undefined = compatibilidad: listar todo bajo request/{servicio}/ (p. ej. POST /upload-file/move-to-request).
   */
  async moveFilesToRequestFolder(
    servicio: string,
    requestUuid: string,
    keys?: string[],
  ): Promise<{ moved: number; errors: number }> {
    if (!servicio || !requestUuid) {
      this.logger.warn('No se puede mover archivos: servicio o requestUuid faltante');
      return { moved: 0, errors: 0 };
    }

    if (!UploadFileService.isValidRequestFolderUuid(requestUuid)) {
      throw new BadRequestException(
        'requestUuid debe ser el UUID de la solicitud (campo uuid en requests), no el id numérico.',
      );
    }

    // Normalizar servicio y UUID
    const servicioNormalizado = servicio
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const uuidNormalizado = requestUuid.trim().toLowerCase();

    if (!servicioNormalizado) {
      this.logger.warn('No se puede mover archivos: servicio normalizado inválido');
      return { moved: 0, errors: 0 };
    }

    const sourcePrefix = `request/${servicioNormalizado}/`;
    const targetPrefix = `request/${servicioNormalizado}/${uuidNormalizado}/`;

    this.logger.log(`Moviendo archivos de ${sourcePrefix} a ${targetPrefix}`);

    let moved = 0;
    let errors = 0;

    const moveOne = async (sourceKey: string): Promise<void> => {
      if (
        !sourceKey ||
        sourceKey.endsWith('/') ||
        !sourceKey.startsWith(sourcePrefix) ||
        sourceKey.startsWith(targetPrefix)
      ) {
        return;
      }

      const fileName = sourceKey.replace(sourcePrefix, '');
      const newKey = `${targetPrefix}${fileName}`;

      const copySource = `${this.bucketName}/${encodeURIComponent(sourceKey)}`;
      const copyCommand = new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: copySource,
        Key: newKey,
      });

      await this.s3Client.send(copyCommand);

      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: sourceKey,
      });

      await this.s3Client.send(deleteCommand);

      moved++;
      this.logger.log(`Archivo movido: ${sourceKey} -> ${newKey}`);
    };

    try {
      if (keys !== undefined) {
        const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
        if (unique.length === 0) {
          this.logger.log('Sin claves S3 en el payload; no se mueve ningún archivo');
          return { moved: 0, errors: 0 };
        }
        this.logger.log(`Moviendo ${unique.length} archivo(s) referenciado(s) en el request`);
        for (const key of unique) {
          try {
            await moveOne(key);
          } catch (error) {
            errors++;
            this.logger.error(`Error al mover archivo ${key}:`, error);
          }
        }
        this.logger.log(`Movidos ${moved} archivos, ${errors} errores`);
        return { moved, errors };
      }

      // Compatibilidad: listar todos los objetos bajo request/{servicio}/
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: sourcePrefix,
      });

      const listResponse = await this.s3Client.send(listCommand);
      const objects = listResponse.Contents || [];

      const filesToMove = objects.filter(
        (obj) => obj.Key && 
        !obj.Key.endsWith('/') && 
        !obj.Key.startsWith(targetPrefix)
      );

      this.logger.log(`Encontrados ${filesToMove.length} archivos para mover (listado completo)`);

      for (const file of filesToMove) {
        if (!file.Key) continue;
        try {
          await moveOne(file.Key);
        } catch (error) {
          errors++;
          this.logger.error(`Error al mover archivo ${file.Key}:`, error);
        }
      }

      this.logger.log(`Movidos ${moved} archivos, ${errors} errores`);
      return { moved, errors };
    } catch (error) {
      this.logger.error('Error al mover archivos:', error);
      this.exceptionService.handleAwsS3Exception(error);
      return { moved, errors: errors + 1 };
    }
  }
}
