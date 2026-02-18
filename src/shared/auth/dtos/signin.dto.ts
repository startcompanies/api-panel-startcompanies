import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger'

export class SignInDto {
  @ApiProperty({ example: 'john@example.com', description: 'Email del usuario' })
  @IsString()
  email: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Contraseña del usuario' })
  @IsString()
  password: string;
}