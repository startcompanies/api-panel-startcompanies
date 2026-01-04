import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
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

  @ApiProperty({ example: 'Jhon', description: 'Nombre(s) del usuario' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacio' })
  first_name: string;

  @ApiProperty({ example: 'Smith', description: 'Apellido(s) del usuario' })
  @IsString()
  @IsNotEmpty({ message: 'El apellido no puede estar vacio' })
  last_name: string;

  @ApiProperty({ 
    example: 'admin', 
    description: 'Tipo de usuario',
    enum: ['user', 'client', 'partner', 'admin', 'editor'],
    required: false 
  })
  @IsOptional()
  @IsIn(['user', 'client', 'partner', 'admin', 'editor'], {
    message: 'El tipo de usuario debe ser: user, client, partner, admin o editor',
  })
  type?: 'user' | 'client' | 'partner' | 'admin' | 'editor';

  @ApiProperty({ example: '+1234567890', description: 'Teléfono del usuario', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Mi Empresa S.A.', description: 'Empresa del usuario', required: false })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiProperty({ example: 'Biografía del usuario', description: 'Biografía del usuario', required: false })
  @IsOptional()
  @IsString()
  bio?: string;
}







