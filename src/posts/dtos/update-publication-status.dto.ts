// En ./dtos/update-publication-status.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePublicationStatusDto {
  @ApiProperty({
    example: true,
    description: 'Valor del atributo de publicación del post',
  })
  @IsBoolean()
  is_published: boolean;
}
