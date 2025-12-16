import { IsString, IsNotEmpty } from 'class-validator';

export class AssignProcessStepDto {
  @IsString()
  @IsNotEmpty()
  assignedTo: string;
}

