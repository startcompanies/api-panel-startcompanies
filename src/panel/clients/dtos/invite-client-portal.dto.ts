import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class InviteClientPortalDto {
  @ApiPropertyOptional({
    description:
      'true si el id del listado admin es users.id (fila solo portal sin registro en clients)',
  })
  @IsOptional()
  @IsBoolean()
  listItemUserOnly?: boolean;
}
