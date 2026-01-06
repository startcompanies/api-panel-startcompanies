import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SsoDto {
  @IsString()
  @ApiProperty()
  email: string;

  @IsString()
  @ApiProperty()
  token: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  customerId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  phone?: string;
}

export class RefreshSsoDto {
  @IsString()
  @ApiProperty({ description: 'Refresh token para SSO (viene del localStorage)' })
  refreshToken: string;
}








