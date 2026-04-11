import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl } from 'class-validator';

export class UploadFromUrlDto {
  @ApiProperty({
    type: 'string',
    description:
      'URL de la imagen a descargar y subir a S3. Si ya es media.../blog/ se devuelve la misma URL. El nombre del fichero en S3 se deriva del último segmento de la URL (sanitizado).',
    example: 'https://businessenusa.com/wp-content/uploads/2023/03/example.png',
  })
  @IsString()
  @IsUrl()
  url: string;

  @ApiProperty({
    type: 'string',
    description:
      'Prefijo de carpeta en S3 (opcional). Por defecto "blog". Para imágenes de un post del blog usar "blog/{slug}" (p. ej. blog/mi-post-llc). La key final será {folder}/{timestamp}-{nombreFichero}.',
    required: false,
    example: 'blog/mi-post-llc',
  })
  @IsOptional()
  @IsString()
  folder?: string;
}
