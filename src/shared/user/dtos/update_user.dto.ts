import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
