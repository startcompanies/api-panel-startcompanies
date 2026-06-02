import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PartnerTenantsService } from './partner-tenants.service';
import { TenantAccessService } from './tenant-access.service';
import { PublicTenantDto } from './dtos/public-tenant.dto';
import { Client } from '../clients/entities/client.entity';
import { User } from '../../shared/user/entities/user.entity';
import { EmailBranding } from '../../shared/common/types/email-branding.types';

const DEFAULT_COLORS = {
  primary: '#0068BD',
  secondary: '#006AFE',
  logoUrl: 'https://media.startcompanies.us/logo.png',
  logoDarkUrl: 'https://media.startcompanies.us/logo-dark.png',
} as const;

@Injectable()
export class EmailTenantBrandingService {
  constructor(
    private readonly partnerTenantsService: PartnerTenantsService,
    private readonly tenantAccessService: TenantAccessService,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly configService: ConfigService,
  ) {}

  private platformDisplayName(): string {
    return (
      this.configService.get<string>('PLATFORM_DISPLAY_NAME')?.trim() ||
      'Start Companies'
    );
  }

  private platformFrontendUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'http://localhost:4200'
    );
  }

  private fromPublicTenant(tenant: PublicTenantDto): EmailBranding {
    return {
      brandDisplayName: tenant.displayName,
      frontendBaseUrl: tenant.frontendBaseUrl.replace(/\/$/, ''),
      logoUrl: tenant.logoUrl || DEFAULT_COLORS.logoUrl,
      logoDarkUrl: tenant.logoDarkUrl || DEFAULT_COLORS.logoDarkUrl,
      primaryColor: tenant.primaryColor || DEFAULT_COLORS.primary,
      secondaryColor: tenant.secondaryColor || DEFAULT_COLORS.secondary,
    };
  }

  platformBranding(): EmailBranding {
    return {
      brandDisplayName: this.platformDisplayName(),
      frontendBaseUrl: this.platformFrontendUrl(),
      logoUrl: DEFAULT_COLORS.logoUrl,
      logoDarkUrl: DEFAULT_COLORS.logoDarkUrl,
      primaryColor: DEFAULT_COLORS.primary,
      secondaryColor: DEFAULT_COLORS.secondary,
    };
  }

  async resolveByPartnerId(partnerId: number): Promise<EmailBranding> {
    const tenant = await this.partnerTenantsService.resolveByPartnerId(partnerId);
    if (tenant.kind === 'partner' && tenant.partnerId === partnerId) {
      return this.fromPublicTenant(tenant);
    }
    return this.platformBranding();
  }

  /**
   * Marca para correos según usuario y, si existe, dominio desde el que actúa (X-Tenant-Host).
   */
  async resolveForUser(
    user: Pick<User, 'id' | 'type' | 'email'>,
    tenantHost?: string,
  ): Promise<EmailBranding> {
    if (tenantHost?.trim()) {
      try {
        const tenant = await this.tenantAccessService.resolveForAuth(
          tenantHost.trim(),
        );
        if (tenant.kind === 'partner') {
          return this.fromPublicTenant(tenant);
        }
      } catch {
        /* dominio desconocido → inferir por usuario */
      }
    }

    if (user.type === 'partner') {
      return this.resolveByPartnerId(user.id);
    }

    if (user.type === 'client') {
      const client = await this.findLinkedClient(user);
      if (client?.partnerId) {
        return this.resolveByPartnerId(client.partnerId);
      }
    }

    return this.platformBranding();
  }

  private async findLinkedClient(
    user: Pick<User, 'id' | 'email'>,
  ): Promise<Client | null> {
    if (user.id) {
      const byUser = await this.clientRepository.findOne({
        where: { userId: user.id },
      });
      if (byUser) {
        return byUser;
      }
    }
    if (user.email) {
      return this.clientRepository.findOne({
        where: { email: user.email },
        order: { updatedAt: 'DESC' },
      });
    }
    return null;
  }
}
