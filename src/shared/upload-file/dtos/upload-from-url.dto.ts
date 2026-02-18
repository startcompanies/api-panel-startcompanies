import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl } from 'class-validator';

export class UploadFromUrlDto {
  @ApiProperty({
    type: 'string',
    description: 'URL de la imagen a descargar y subir a S3. Si ya es media.startcompanies.us/blog/ se devuelve la misma URL.',
    example: 'https://businessenusa.com/wp-content/uploads/2023/03/example.png',
  })
  @IsString()
  @IsUrl()
  url: string;

  @ApiProperty({
    type: 'string',
    description: 'Carpeta destino en S3 (opcional). Por defecto "blog".',
    required: false,
    example: 'blog',
  })
  @IsOptional()
  @IsString()
  folder?: string;
}
