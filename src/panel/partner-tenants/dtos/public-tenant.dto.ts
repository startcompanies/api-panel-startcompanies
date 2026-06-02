import { ApiProperty } from '@nestjs/swagger';
import { PartnerTenantSurface } from '../entities/partner-tenant.entity';
import { TenantThemeTokensDto } from './tenant-theme-tokens.dto';

export class PublicTenantDto {
  @ApiProperty({ example: 'default' })
  slug: string;

  @ApiProperty({ example: 'startcompanies' })
  kind: 'platform' | 'partner';

  @ApiProperty({ nullable: true })
  partnerId: number | null;

  @ApiProperty({ example: 'Start Companies' })
  displayName: string;

  @ApiProperty({ example: 'startcompanies.io' })
  customDomain: string;

  @ApiProperty({ example: 'https://startcompanies.io' })
  frontendBaseUrl: string;

  @ApiProperty({ nullable: true })
  logoUrl: string | null;

  @ApiProperty({ nullable: true })
  logoDarkUrl: string | null;

  @ApiProperty({ nullable: true })
  faviconUrl: string | null;

  @ApiProperty({ nullable: true, example: '#0068BD' })
  primaryColor: string | null;

  @ApiProperty({ nullable: true, example: '#006AFE' })
  secondaryColor: string | null;

  @ApiProperty({ nullable: true, example: '#01C9E2' })
  accentColor: string | null;

  @ApiProperty({
    example: 'blue',
    enum: ['blue', 'teal', 'green', 'indigo', 'amber', 'slate', 'red', 'yellow', 'custom'],
  })
  brandPalette: string;

  @ApiProperty({ example: 'dark', enum: ['light', 'dark'] })
  shellAppearance: string;

  @ApiProperty({ nullable: true, example: 'Mi Portal - Servicios LLC' })
  seoTitle: string | null;

  @ApiProperty({ nullable: true, example: 'Accede a tu panel y gestiona tus servicios en línea.' })
  seoDescription: string | null;

  @ApiProperty({ type: TenantThemeTokensDto })
  themeTokens: TenantThemeTokensDto;

  @ApiProperty({ type: [String], example: ['panel'] })
  enabledSurfaces: PartnerTenantSurface[];

  @ApiProperty({ nullable: true, example: '+17869354213' })
  whatsappNumber: string | null;

  @ApiProperty({ nullable: true, example: 'https://www.mi-marca.com' })
  websiteUrl: string | null;
}
