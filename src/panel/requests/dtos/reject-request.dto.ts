import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectRequestDto {
  @ApiPropertyOptional({
    description: 'Razón del rechazo de la solicitud',
    example: 'Documentación incompleta o información faltante',
  })
  @IsOptional()
  @IsString()
  notes?: string; // Razón del rechazo
}


