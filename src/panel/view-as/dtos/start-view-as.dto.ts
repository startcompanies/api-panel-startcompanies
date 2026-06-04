import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class StartViewAsDto {
  @ApiPropertyOptional({
    description: 'ID del usuario portal (users.id) del cliente',
    example: 42,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  clientUserId?: number;

  @ApiPropertyOptional({
    description: 'ID de la fila clients (tabla clients)',
    example: 15,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  clientId?: number;
}
