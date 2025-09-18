import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ example: 'testuser', description: 'Nombre del usuario' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del usuario no puede estar vacio' })
  @MinLength(4, {
    message: 'El nombre del usuario debe tener al menos 4 caracteres',
  })
  @MaxLength(20, {
    message: 'El nombre del usuario no puede tener más de 20 caracteres',
  })
  username: string;

  @ApiProperty({ example: 'testuser@example.com', description: 'El correo electrónico del usuario' })
  @IsEmail({}, { message: 'El formato del correo electrónico es inválido.' })
  @IsNotEmpty({ message: 'El correo electrónico no puede estar vacío.' })
  email: string;

  @ApiProperty({
    example: 'Contraseña123',
    description: 'La contraseña del usuario',
  })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña no puede estar vacia' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;
}
