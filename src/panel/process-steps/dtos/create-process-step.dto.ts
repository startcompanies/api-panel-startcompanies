import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateProcessStepDto {
  @IsNumber()
  @IsNotEmpty()
  requestId: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['completed', 'current', 'pending'])
  @IsNotEmpty()
  status: 'completed' | 'current' | 'pending';

  @IsNumber()
  @Min(1)
  orderNumber: number;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}

