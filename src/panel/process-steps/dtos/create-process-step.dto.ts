import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProcessStepDto {
  @ApiProperty({ example: 1, description: 'ID de la solicitud asociada' })
  @IsNumber()
  @IsNotEmpty()
  requestId: number;

  @ApiProperty({ example: 'Filing Iniciado', description: 'Nombre del paso del proceso' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Inicio del proceso de filing', description: 'Descripción del paso' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['completed', 'current', 'pending'], example: 'pending', description: 'Estado del paso' })
  @IsIn(['completed', 'current', 'pending'])
  @IsNotEmpty()
  status: 'completed' | 'current' | 'pending';

  @ApiProperty({ example: 1, description: 'Número de orden del paso', minimum: 1 })
  @IsNumber()
  @Min(1)
  orderNumber: number;

  @ApiPropertyOptional({ example: 'admin@example.com', description: 'Usuario asignado al paso' })
  @IsOptional()
  @IsString()
  assignedTo?: string;
}

