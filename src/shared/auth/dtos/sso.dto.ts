import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SsoDto {
  @ApiProperty({ example: 'john@example.com', description: 'Email del usuario' })
  @IsString()
  email: string;

  @ApiProperty({ example: 'sso_token_abc123', description: 'Token de validación SSO' })
  @IsString()
  token: string;

  @ApiProperty({ example: '12345', description: 'ID del cliente (opcional)', required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ example: '+1234567890', description: 'Teléfono del cliente (opcional)', required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class RefreshSsoDto {
  @ApiProperty({ 
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', 
    description: 'Refresh token para SSO (viene del localStorage)' 
  })
  @IsString()
  refreshToken: string;
}








