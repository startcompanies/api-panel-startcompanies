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
    description: 'Tipo de servicio (opcional). Si se proporciona junto con requestUuid, el archivo se guardará en request/{servicio}/{requestUuid}/',
    required: false,
    example: 'apertura-llc',
  })
  servicio?: string;

  @ApiProperty({
    type: 'string',
    description: 'UUID de la solicitud (opcional). Si se proporciona junto con servicio, el archivo se guardará en request/{servicio}/{requestUuid}/',
    required: false,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  requestUuid?: string;

  @ApiProperty({
    type: 'string',
    description: 'Carpeta destino (opcional). Ej: "blog" guarda en blog/{timestamp}-{filename}. Ignora servicio/requestUuid si se usa.',
    required: false,
    example: 'blog',
  })
  folder?: string;
}
