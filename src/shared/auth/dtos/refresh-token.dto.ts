import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token recibido en el login' })
  @IsString()
  refreshToken: string;
}
