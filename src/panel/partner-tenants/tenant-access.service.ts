import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PartnerTenant } from './entities/partner-tenant.entity';
import { PartnerTenantsService } from './partner-tenants.service';
import { PublicTenantDto } from './dtos/public-tenant.dto';
import { Client } from '../clients/entities/client.entity';
import { User } from '../../shared/user/entities/user.entity';
import {
  TENANT_ACCESS_DENIED_MESSAGE,
  TENANT_DOMAIN_NOT_CONFIGURED_MESSAGE,
  TENANT_PARTNER_USE_BRAND_PORTAL_MESSAGE,
} from './constants/tenant-access.constants';

@Injectable()
export class TenantAccessService {
  constructor(
    private readonly partnerTenantsService: PartnerTenantsService,
    @InjectRepository(PartnerTenant)
    private readonly tenantRepo: Repository<PartnerTenant>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  /**
   * Resuelve el tenant del login sin fallback silencioso a plataforma en dominios desconocidos.
   */
  async resolveForAuth(hostInput?: string): Promise<PublicTenantDto> {
    const host = this.partnerTenantsService.normalizeHost(hostInput);
    if (!host) {
      return this.partnerTenantsService.resolveByHost('localhost');
    }
    if (this.partnerTenantsService.isPlatformHost(host)) {
      return this.partnerTenantsService.resolveByHost(host);
    }
    const row = await this.tenantRepo
      .createQueryBuilder('t')
      .where('t.is_active = TRUE')
      .andWhere('LOWER(t.custom_domain) = :host', { host })
      .getOne();
    if (!row) {
      throw new ForbiddenException(TENANT_DOMAIN_NOT_CONFIGURED_MESSAGE);
    }
    return this.partnerTenantsService.resolveByHost(host);
  }

  async assertUserMayAccessTenant(
    user: User,
    tenant: PublicTenantDto,
  ): Promise<void> {
    if (tenant.kind === 'platform') {
      await this.assertUserMayAccessPlatform(user);
      return;
    }
    if (tenant.kind === 'partner' && tenant.partnerId != null) {
      await this.assertUserMayAccessPartnerTenant(user, tenant.partnerId);
      return;
    }
    throw new ForbiddenException(TENANT_ACCESS_DENIED_MESSAGE);
  }

  private async assertUserMayAccessPlatform(user: User): Promise<void> {
    if (user.type === 'admin' || user.type === 'user') {
      return;
    }

    if (user.type === 'partner') {
      const hasBrand = await this.tenantRepo.exists({
        where: { partnerId: user.id, isActive: true },
      });
      if (hasBrand) {
        throw new ForbiddenException(TENANT_PARTNER_USE_BRAND_PORTAL_MESSAGE);
      }
      return;
    }

    if (user.type === 'client') {
      const client = await this.findLinkedClient(user);
      if (client?.partnerId) {
        throw new ForbiddenException(TENANT_ACCESS_DENIED_MESSAGE);
      }
      return;
    }

    throw new ForbiddenException(TENANT_ACCESS_DENIED_MESSAGE);
  }

  private async assertUserMayAccessPartnerTenant(
    user: User,
    partnerId: number,
  ): Promise<void> {
    if (user.type === 'admin' || user.type === 'user') {
      return;
    }

    if (user.type === 'partner') {
      if (user.id !== partnerId) {
        throw new ForbiddenException(TENANT_ACCESS_DENIED_MESSAGE);
      }
      return;
    }

    if (user.type === 'client') {
      const client = await this.findLinkedClient(user);
      if (!client?.partnerId || client.partnerId !== partnerId) {
        throw new ForbiddenException(TENANT_ACCESS_DENIED_MESSAGE);
      }
      return;
    }

    throw new ForbiddenException(TENANT_ACCESS_DENIED_MESSAGE);
  }

  private async findLinkedClient(user: User): Promise<Client | null> {
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
