import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

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
    description:
      'Contraseña (opcional en alta admin: si viene vacía se genera una temporal)',
    required: false,
  })
  @ValidateIf(
    (o) => o.password != null && String(o.password).trim() !== '',
  )
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password?: string;

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

  @ApiProperty({
    example: '+521234567890',
    description: 'Obligatorio si type es partner; formato E.164',
    required: false,
  })
  @ValidateIf((o) => o.type === 'partner')
  @IsNotEmpty({ message: 'El teléfono es obligatorio para partners' })
  @IsString()
  @Matches(E164_PHONE_REGEX, {
    message:
      'El teléfono debe estar en formato internacional (E.164), por ejemplo +521234567890',
  })
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









