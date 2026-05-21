import { ApiProperty } from '@nestjs/swagger';
import { PartnerTenantSurface } from '../entities/partner-tenant.entity';

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

  @ApiProperty({ type: [String], example: ['panel', 'wizard'] })
  enabledSurfaces: PartnerTenantSurface[];
}
