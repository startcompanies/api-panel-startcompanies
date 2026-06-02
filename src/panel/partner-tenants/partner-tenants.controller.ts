import { Controller, Get, Headers, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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
    return this.partnerTenantsService.resolveByHost(
      this.resolveHostParam(req, tenantHostHeader, hostQuery),
    );
  }

  @Get('tenant/preview')
  @Public()
  @ApiProduces('text/html')
  @ApiOperation({
    summary: 'HTML Open Graph por dominio (crawlers de redes sociales)',
    description:
      'Misma resolución de host que GET /public/tenant. Pensado para proxy nginx en User-Agent de bots.',
  })
  @ApiQuery({
    name: 'host',
    required: false,
    description: 'Host a resolver (útil en desarrollo local)',
  })
  async sharePreviewHtml(
    @Req() req: { headers: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true }) res: Response,
    @Headers('x-tenant-host') tenantHostHeader?: string,
    @Query('host') hostQuery?: string,
  ): Promise<string> {
    const host = this.resolveHostParam(req, tenantHostHeader, hostQuery);
    const html = await this.partnerTenantsService.resolveSharePreviewHtml(host);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return html;
  }

  private resolveHostParam(
    req: { headers: Record<string, string | string[] | undefined> },
    tenantHostHeader?: string,
    hostQuery?: string,
  ): string {
    const headerHost = req.headers['host'];
    const hostFromReq =
      typeof headerHost === 'string' ? headerHost : headerHost?.[0];
    return (
      hostQuery?.trim() ||
      tenantHostHeader?.trim() ||
      hostFromReq ||
      ''
    );
  }
}
