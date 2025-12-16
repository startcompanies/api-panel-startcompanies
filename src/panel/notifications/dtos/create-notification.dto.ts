import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsNumber,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateNotificationDto {
  @IsNumber()
  @IsNotEmpty()
  userId: number;

  @IsIn(['info', 'success', 'warning', 'error'])
  @IsNotEmpty()
  type: 'info' | 'success' | 'warning' | 'error';

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsNumber()
  requestId?: number;

  @IsOptional()
  @IsBoolean()
  read?: boolean;
}

