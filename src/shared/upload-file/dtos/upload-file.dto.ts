import { ApiProperty } from '@nestjs/swagger';

export class UploadFileDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'The file to upload',
  })
  file: any;

  @ApiProperty({
    type: 'string',
    description:
      'Tipo de servicio (opcional). Con requestUuid válido, el archivo queda en request/{servicio}/{uuid}/',
    required: false,
    example: 'apertura-llc',
  })
  servicio?: string;

  @ApiProperty({
    type: 'string',
    description:
      'UUID de la solicitud en BD (`requests.uuid`, formato 8-4-4-4-12 hex). No usar el id numérico del request. Opcional: sin él (solo servicio) la subida va a request/{servicio}/{timestamp}-archivo (temporal).',
    required: false,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  requestUuid?: string;

  @ApiProperty({
    type: 'string',
    description:
      'Carpeta destino (opcional). "blog" → blog/{timestamp}-{filename}. Para imágenes de un post del blog usar "blog/{slug}" (p. ej. blog/mi-articulo-llc). Ignora servicio/requestUuid si se usa.',
    required: false,
    example: 'blog/mi-articulo-llc',
  })
  folder?: string;
}
