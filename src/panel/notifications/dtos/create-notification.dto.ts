import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsNumber,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNotificationDto {
  @ApiProperty({ example: 1, description: 'ID del usuario destinatario' })
  @IsNumber()
  @IsNotEmpty()
  userId: number;

  @ApiProperty({ enum: ['info', 'success', 'warning', 'error'], example: 'info', description: 'Tipo de notificación' })
  @IsIn(['info', 'success', 'warning', 'error'])
  @IsNotEmpty()
  type: 'info' | 'success' | 'warning' | 'error';

  @ApiProperty({ example: 'Nueva solicitud', description: 'Título de la notificación' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Se ha creado una nueva solicitud', description: 'Mensaje de la notificación' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ example: '/panel/requests/123', description: 'URL de enlace relacionado' })
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional({ example: 123, description: 'ID de la solicitud relacionada' })
  @IsOptional()
  @IsNumber()
  requestId?: number;

  @ApiPropertyOptional({ example: false, description: 'Indica si la notificación está leída', default: false })
  @IsOptional()
  @IsBoolean()
  read?: boolean;
}

