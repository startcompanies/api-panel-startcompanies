import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SignInDto {
  @ApiProperty({ example: 'john@example.com', description: 'Email del usuario' })
  @IsString()
  email: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Contraseña del usuario' })
  @IsString()
  password: string;

  @ApiPropertyOptional({
    description: 'Sesión larga (refresh ~30 días). Si no se envía, se usa sesión más corta.',
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}