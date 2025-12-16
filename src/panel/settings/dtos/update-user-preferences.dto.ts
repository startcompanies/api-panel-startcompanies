import {
  IsString,
  IsOptional,
  IsIn,
  IsObject,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

class NotificationsDto {
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @IsOptional()
  @IsBoolean()
  requestUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  documentUploads?: boolean;
}

export class UpdateUserPreferencesDto {
  @IsOptional()
  @IsIn(['es', 'en'])
  language?: 'es' | 'en';

  @IsOptional()
  @IsIn(['light', 'dark', 'auto'])
  theme?: 'light' | 'dark' | 'auto';

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationsDto)
  @IsObject()
  notifications?: NotificationsDto;
}

