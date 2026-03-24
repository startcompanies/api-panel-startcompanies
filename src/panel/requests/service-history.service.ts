import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZohoDealTimeline } from './entities/zoho-deal-timeline.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../../shared/user/entities/user.entity';

export interface ServiceHistoryItemDto {
  id: number;
  zohoDealId: string;
  dealName?: string;
  dealType?: string;
  stage?: string;
  status?: string;
  accountName?: string;
  llcPrincipalName?: string;
  closingDate?: string;
  modifiedTimeZoho?: string;
  createdTimeZoho?: string;
  contactEmail?: string;
  partnerPicklist?: string;
  amount?: number;
}

@Injectable()
export class ServiceHistoryService {
  private readonly logger = new Logger(ServiceHistoryService.name);

  constructor(
    @InjectRepository(ZohoDealTimeline)
    private readonly timelineRepo: Repository<ZohoDealTimeline>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Misma idea que findAllByUser: Client por userId o por email del usuario.
   */
  private async resolveClientForUser(userId: number): Promise<Client | null> {
    let client = await this.clientRepo.findOne({ where: { userId } });
    if (client) {
      return client;
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user?.email) {
      return null;
    }
    client = await this.clientRepo.findOne({
      where: { email: user.email },
    });
    return client ?? null;
  }

  async findForPortalUser(
    userId: number,
    role: 'client' | 'partner',
    clientIdFilter?: number,
  ): Promise<ServiceHistoryItemDto[]> {
    const qb = this.timelineRepo
      .createQueryBuilder('t')
      .where('t.clientId IS NOT NULL');

    if (role === 'client') {
      const client = await this.resolveClientForUser(userId);
      if (!client) {
        this.logger.log(`[service-history] sin Client para userId=${userId}`);
        return [];
      }
      if (clientIdFilter != null && client.id !== clientIdFilter) {
        throw new ForbiddenException('No autorizado para este cliente');
      }
      qb.andWhere('t.clientId = :cid', {
        cid: clientIdFilter ?? client.id,
      });
    } else {
      qb.innerJoin(Client, 'cl', 'cl.id = t.clientId').andWhere(
        'cl.partnerId = :pid',
        { pid: userId },
      );
      if (clientIdFilter != null) {
        const owned = await this.clientRepo.findOne({
          where: { id: clientIdFilter, partnerId: userId },
        });
        if (!owned) {
          throw new ForbiddenException('Cliente no asignado a este partner');
        }
        qb.andWhere('t.clientId = :cf', { cf: clientIdFilter });
      }
    }

    qb.orderBy('t.modifiedTimeZoho', 'DESC').addOrderBy('t.id', 'DESC');

    const rows = await qb.getMany();
    return rows.map((r) => this.toDto(r));
  }

  private toDto(r: ZohoDealTimeline): ServiceHistoryItemDto {
    return {
      id: r.id,
      zohoDealId: r.zohoDealId,
      dealName: r.dealName,
      dealType: r.dealType,
      stage: r.stage,
      status: r.status,
      accountName: r.accountName,
      llcPrincipalName: r.llcPrincipalName,
      closingDate: r.closingDate?.toISOString(),
      modifiedTimeZoho: r.modifiedTimeZoho?.toISOString(),
      createdTimeZoho: r.createdTimeZoho?.toISOString(),
      contactEmail: r.contactEmail,
      partnerPicklist: r.partnerPicklist,
      amount: r.amount != null ? Number(r.amount) : undefined,
    };
  }
}
