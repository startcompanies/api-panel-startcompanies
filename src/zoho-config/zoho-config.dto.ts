import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ZohoConfigDto {
  @IsString()
  @ApiProperty()
  org: string;

  @IsString()
  @ApiProperty()
  service: string;

  @IsString()
  @ApiProperty()
  region: string;

  @IsString()
  @ApiProperty()
  scopes: string;

  @IsString()
  @ApiProperty()
  client_id: string;

  @IsString()
  @ApiProperty()
  client_secret: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  refresh_token?: string;
}

export class UpdateZohoConfigDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  org?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  service?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  region?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  scopes?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  client_id?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  client_secret?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  refresh_token?: string;
}






