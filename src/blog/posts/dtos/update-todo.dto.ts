import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTodoDto {
  @ApiProperty({
    example: 'Revisar enlaces, corregir imagen destacada',
    description: 'Notas de pendientes del post (solo editable desde el listado).',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  todo?: string;
}
