import {
  IsString,
  IsOptional,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProcessStepDto {
  @ApiPropertyOptional({ example: 'Filing Completado', description: 'Nombre del paso del proceso' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Filing completado exitosamente', description: 'Descripción del paso' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['completed', 'current', 'pending'], example: 'completed', description: 'Estado del paso' })
  @IsOptional()
  @IsIn(['completed', 'current', 'pending'])
  status?: 'completed' | 'current' | 'pending';

  @ApiPropertyOptional({ example: 'admin@example.com', description: 'Usuario que completó el paso' })
  @IsOptional()
  @IsString()
  completedBy?: string;

  @ApiPropertyOptional({ example: 'admin@example.com', description: 'Usuario asignado al paso' })
  @IsOptional()
  @IsString()
  assignedTo?: string;
}

