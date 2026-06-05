import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateClientDto } from './create-client.dto';

export class UpdateClientDto extends PartialType(CreateClientDto) {
  @ApiPropertyOptional({
    description:
      'true si el id del listado admin es users.id (sin fila en clients); solo staff SC',
  })
  @IsOptional()
  @IsBoolean()
  listItemUserOnly?: boolean;
}









