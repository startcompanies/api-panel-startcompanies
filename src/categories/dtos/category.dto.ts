import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CategoryDTO {
  @ApiProperty({
    example: 'llc',
    description: 'Nombre de la categoría',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la categoría no puede estar vació' })
  @MaxLength(50, {
    message: 'El nombre de la categoría no puede exceder los 50 caracteres',
  })
  name: string;

  @ApiProperty({
    example: 'llc',
    description: 'El nombre del slug para URLs amigables',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del slug no puede estar vació' })
  @MaxLength(50, {
    message: 'El nombre del slug no puede exceder los 50 caracteres',
  })
  slug: string;
}
