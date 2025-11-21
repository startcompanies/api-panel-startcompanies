import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class ReusableElementDto {
  @ApiProperty({
    example: 'Elemento reutilizable de ejemplo',
    description: 'Nombre del elemento reutilizable',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @MaxLength(255, {
    message: 'El nombre no puede exceder los 255 caracteres',
  })
  name: string;

  @ApiProperty({
    example: 'Descripción del elemento reutilizable',
    description: 'Descripción del elemento reutilizable',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 'Contenido del elemento reutilizable',
    description: 'Contenido del elemento reutilizable',
    required: false,
  })
  @IsString()
  @IsOptional()
  content?: string;
}

