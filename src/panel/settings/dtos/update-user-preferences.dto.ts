import {
  IsString,
  IsOptional,
  IsIn,
  IsObject,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

class NotificationsDto {
  @ApiPropertyOptional({ example: true, description: 'Recibir notificaciones por email' })
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Recibir notificaciones push' })
  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Recibir notificaciones de actualizaciones de solicitudes' })
  @IsOptional()
  @IsBoolean()
  requestUpdates?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Recibir notificaciones de subida de documentos' })
  @IsOptional()
  @IsBoolean()
  documentUploads?: boolean;
}

export class UpdateUserPreferencesDto {
  @ApiPropertyOptional({ enum: ['es', 'en'], example: 'es', description: 'Idioma preferido' })
  @IsOptional()
  @IsIn(['es', 'en'])
  language?: 'es' | 'en';

  @ApiPropertyOptional({ enum: ['light', 'dark', 'auto'], example: 'light', description: 'Tema de la interfaz' })
  @IsOptional()
  @IsIn(['light', 'dark', 'auto'])
  theme?: 'light' | 'dark' | 'auto';

  @ApiPropertyOptional({ example: 'America/New_York', description: 'Zona horaria' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ type: NotificationsDto, description: 'Configuración de notificaciones' })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationsDto)
  @IsObject()
  notifications?: NotificationsDto;
}

