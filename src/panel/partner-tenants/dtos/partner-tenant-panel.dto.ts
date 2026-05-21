import { ApiProperty } from '@nestjs/swagger';
import { PublicTenantDto } from './public-tenant.dto';

export class PartnerTenantPanelDto extends PublicTenantDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  updatedAt: string;
}
