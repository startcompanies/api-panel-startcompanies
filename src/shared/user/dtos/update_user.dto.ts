import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({
    example: 'testUser',
    description: 'Nombre del usuario',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string;

  @ApiProperty({
    example: 'Jhon',
    description: 'Nombre(s)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  first_name?: string;

  @ApiProperty({
    example: 'Smith',
    description: 'Apellido',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  last_name?: string;

  @ApiProperty({
    example: 'About me',
    description: 'Biografía corta',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bio?: string;

  @ApiProperty({
    example: '+1234567890',
    description: 'Teléfono del usuario',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'Correo electrónico del usuario',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiProperty({
    example: 'My Company',
    description: 'Empresa del usuario',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;
}
