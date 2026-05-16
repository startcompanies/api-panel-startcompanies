import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl } from 'class-validator';

export class UploadFromUrlDto {
  @ApiProperty({
    type: 'string',
    description:
      'URL de la imagen a descargar y subir a S3. El nombre del fichero en S3 se deriva del último segmento de la URL (sanitizado).',
    example: 'https://example.com/uploads/image.png',
  })
  @IsString()
  @IsUrl()
  url: string;

  @ApiProperty({
    type: 'string',
    description:
      'Prefijo de carpeta en S3 (opcional). Por defecto "media". La key final será {folder}/{timestamp}-{nombreFichero}.',
    required: false,
    example: 'media/imagenes',
  })
  @IsOptional()
  @IsString()
  folder?: string;
}
