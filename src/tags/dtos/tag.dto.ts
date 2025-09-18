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
}
