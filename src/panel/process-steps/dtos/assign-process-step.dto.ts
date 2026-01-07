import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignProcessStepDto {
  @ApiProperty({ example: 'admin@example.com', description: 'Usuario a asignar al paso del proceso' })
  @IsString()
  @IsNotEmpty()
  assignedTo: string;
}

