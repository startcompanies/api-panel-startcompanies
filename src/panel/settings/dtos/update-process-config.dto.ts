import {
  IsBoolean,
  IsOptional,
  IsString,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProcessConfigDto {
  @ApiPropertyOptional({ example: true, description: 'Avanzar automáticamente los pasos del proceso' })
  @IsOptional()
  @IsBoolean()
  autoAdvanceSteps?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Requerir aprobación para avanzar pasos' })
  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;

  @ApiPropertyOptional({ example: 'admin@example.com', description: 'Usuario asignado por defecto' })
  @IsOptional()
  @IsString()
  defaultAssignee?: string;

  @ApiPropertyOptional({ example: 300, description: 'Retraso en segundos para enviar notificaciones', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  notificationDelay?: number;
}

