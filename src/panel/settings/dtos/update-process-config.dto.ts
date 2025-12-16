import {
  IsBoolean,
  IsOptional,
  IsString,
  IsNumber,
  Min,
} from 'class-validator';

export class UpdateProcessConfigDto {
  @IsOptional()
  @IsBoolean()
  autoAdvanceSteps?: boolean;

  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;

  @IsOptional()
  @IsString()
  defaultAssignee?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  notificationDelay?: number;
}

