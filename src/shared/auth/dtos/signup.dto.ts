import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignUpDto {
  @ApiProperty({ example: 'johndoe', description: 'Nombre de usuario único' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'john@example.com', description: 'Email del usuario' })
  @IsString()
  email: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Contraseña del usuario' })
  @IsString()
  password: string;

  @IsOptional()
  @IsIn(['user', 'client', 'partner', 'admin', 'editor'])
  @ApiProperty({ enum: ['user', 'client', 'partner', 'admin', 'editor'], default: 'user', required: false })
  type?: 'user' | 'client' | 'partner' | 'admin' | 'editor';

  @ApiProperty({ example: 'Jhon', description: 'Nombre(s) del usuario' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacio' })
  first_name: string;

  @ApiProperty({ example: 'Smith', description: 'Apellido(s) del usuario' })
  @IsString()
  @IsNotEmpty({ message: 'El apellido no puede estar vacio' })
  last_name: string;
}
