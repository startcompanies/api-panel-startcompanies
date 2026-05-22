import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export class UpdatePartnerTenantDto {
  @ApiProperty({ required: false, example: 'Tax Solution' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName?: string;

  @ApiProperty({ required: false, example: 'tax-solution' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/)
  slug?: string;

  @ApiProperty({ required: false, example: 'portal.taxsolution.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customDomain?: string;

  @ApiProperty({ required: false, example: 'https://portal.taxsolution.com' })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(255)
  frontendBaseUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  logoUrl?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  logoDarkUrl?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  faviconUrl?: string | null;

  @ApiProperty({ required: false, example: '#0068BD' })
  @IsOptional()
  @Matches(HEX_COLOR)
  primaryColor?: string | null;

  @ApiProperty({ required: false, example: '#006AFE' })
  @IsOptional()
  @Matches(HEX_COLOR)
  secondaryColor?: string | null;

  @ApiProperty({ required: false, example: '#01C9E2' })
  @IsOptional()
  @Matches(HEX_COLOR)
  accentColor?: string | null;

  @ApiProperty({
    required: false,
    example: 'blue',
    enum: ['blue', 'teal', 'green', 'indigo', 'amber', 'slate', 'red', 'yellow', 'custom'],
  })
  @IsOptional()
  @IsIn(['blue', 'teal', 'green', 'indigo', 'amber', 'slate', 'red', 'yellow', 'custom'])
  brandPalette?: string;

  @ApiProperty({ required: false, example: 'dark', enum: ['light', 'dark'] })
  @IsOptional()
  @IsIn(['light', 'dark'])
  shellAppearance?: string;

  @ApiProperty({ required: false, type: [String], example: ['panel'], deprecated: true })
  @IsOptional()
  @IsArray()
  @IsIn(['panel'], { each: true })
  /** Ignorado en servidor: los partners solo exponen el panel. */
  enabledSurfaces?: ('panel')[];

  @ApiProperty({ required: false, description: 'Solo admin' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
