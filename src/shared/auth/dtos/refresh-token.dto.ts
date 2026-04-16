import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Body opcional: en el panel el refresh suele ir solo por cookie HttpOnly `refresh_token`. */
export class RefreshTokenDto {
  @ApiPropertyOptional({
    description:
      'Opcional. Si no se envía, se usa la cookie `refresh_token` (flujo panel / portal con credentials).',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
