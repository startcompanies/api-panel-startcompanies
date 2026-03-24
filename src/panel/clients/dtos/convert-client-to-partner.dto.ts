import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ConvertClientToPartnerDto {
  @ApiPropertyOptional({
    description:
      'Teléfono E.164 si el usuario no lo tiene; obligatorio si no hay teléfono guardado',
    example: '+34600111222',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description:
      'true si el id del listado admin es el id de usuario (fila solo portal sin registro en clients)',
  })
  @IsOptional()
  @IsBoolean()
  listItemUserOnly?: boolean;
}
