import { Controller, Get, Headers, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../shared/auth/public.decorator';
import { PartnerTenantsService } from './partner-tenants.service';
import { PublicTenantDto } from './dtos/public-tenant.dto';

@ApiTags('Public - Tenant')
@Controller('public')
export class PartnerTenantsController {
  constructor(private readonly partnerTenantsService: PartnerTenantsService) {}

  @Get('tenant')
  @Public()
  @ApiOperation({
    summary: 'Resolver marca y tenant por dominio (white-label)',
    description:
      'Usa el header Host, X-Tenant-Host o query ?host=. Devuelve configuración de plataforma Start Companies o del partner.',
  })
  @ApiQuery({
    name: 'host',
    required: false,
    description: 'Host a resolver (útil en desarrollo local)',
  })
  resolveTenant(
    @Req() req: { headers: Record<string, string | string[] | undefined> },
    @Headers('x-tenant-host') tenantHostHeader?: string,
    @Query('host') hostQuery?: string,
  ): Promise<PublicTenantDto> {
    const headerHost = req.headers['host'];
    const hostFromReq =
      typeof headerHost === 'string' ? headerHost : headerHost?.[0];
    const raw =
      hostQuery?.trim() ||
      tenantHostHeader?.trim() ||
      hostFromReq ||
      '';
    return this.partnerTenantsService.resolveByHost(raw);
  }
}
