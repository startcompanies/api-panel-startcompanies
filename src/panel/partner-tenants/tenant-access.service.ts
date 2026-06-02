import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PartnerTenant } from './entities/partner-tenant.entity';
import { PartnerTenantsService } from './partner-tenants.service';
import { PublicTenantDto } from './dtos/public-tenant.dto';
import { Client } from '../clients/entities/client.entity';
import { User } from '../../shared/user/entities/user.entity';
import { AccountTeamMember } from '../account-team/entities/account-team-member.entity';
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
    @InjectRepository(AccountTeamMember)
    private readonly teamRepo: Repository<AccountTeamMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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

  /**
   * Usuario titular para comprobar pertenencia al tenant (teammates heredan el owner).
   */
  private async resolveSubjectUser(user: User): Promise<{
    subject: User;
    isScStaff: boolean;
  }> {
    if (user.type === 'admin') {
      return { subject: user, isScStaff: false };
    }
    if (user.type !== 'user') {
      return { subject: user, isScStaff: false };
    }
    const membership = await this.teamRepo.findOne({
      where: { memberUserId: user.id, status: 'active' },
      relations: ['owner'],
    });
    if (!membership) {
      return { subject: user, isScStaff: true };
    }
    const owner =
      membership.owner ??
      (await this.userRepo.findOne({ where: { id: membership.ownerUserId } }));
    if (!owner?.status) {
      throw new ForbiddenException(TENANT_ACCESS_DENIED_MESSAGE);
    }
    return { subject: owner, isScStaff: false };
  }

  private async assertUserMayAccessPlatform(user: User): Promise<void> {
    if (user.type === 'admin') {
      return;
    }

    const { subject, isScStaff } = await this.resolveSubjectUser(user);
    if (isScStaff) {
      return;
    }

    if (subject.type === 'partner') {
      const hasBrand = await this.tenantRepo.exists({
        where: { partnerId: subject.id, isActive: true },
      });
      if (hasBrand) {
        throw new ForbiddenException(TENANT_PARTNER_USE_BRAND_PORTAL_MESSAGE);
      }
      return;
    }

    if (subject.type === 'client') {
      const client = await this.findLinkedClient(subject);
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
    if (user.type === 'admin') {
      return;
    }

    const { subject, isScStaff } = await this.resolveSubjectUser(user);
    if (isScStaff) {
      throw new ForbiddenException(TENANT_ACCESS_DENIED_MESSAGE);
    }

    if (subject.type === 'partner') {
      if (subject.id !== partnerId) {
        throw new ForbiddenException(TENANT_ACCESS_DENIED_MESSAGE);
      }
      return;
    }

    if (subject.type === 'client') {
      const client = await this.findLinkedClient(subject);
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
