import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class TagDto {
  @ApiProperty({
    example: 'impuestos',
    description: 'El nombre del tag',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del tag no puede estar vació' })
  @MaxLength(50, {
    message: 'El nombre del tag no puede exceder los 50 caracteres.',
  })
  name: string;

  /*@ApiProperty({
    example: 'impuestos',
    description: 'El slug del tag para URLs amigables',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: 'El slug del tag no puede estar vacio.' })
  @MaxLength(50, {
    message: 'El slug del tag no puede exceder los 50 caracteres.',
  })
  slug: string;*/
}
