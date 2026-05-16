import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class BulkApplySuggestionsDto {
  @ApiPropertyOptional({
    description: 'Si false, solo reglas en lote (sin segunda pasada IA)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  useAi?: boolean;
}
