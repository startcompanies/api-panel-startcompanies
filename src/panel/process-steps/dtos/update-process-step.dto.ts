import {
  IsString,
  IsOptional,
  IsIn,
} from 'class-validator';

export class UpdateProcessStepDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['completed', 'current', 'pending'])
  status?: 'completed' | 'current' | 'pending';

  @IsOptional()
  @IsString()
  completedBy?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}

