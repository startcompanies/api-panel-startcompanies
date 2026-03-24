import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Request as RequestEntity } from '../requests/entities/request.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../../shared/user/entities/user.entity';

export interface DashboardRecentRequestDto {
  id: number;
  type: 'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria';
  clientName: string;
  status: string;
  createdAt: string;
}

export interface DashboardSummaryDto {
  totalRequests: number;
  enProceso: number;
  pendientes: number;
  completadas: number;
  totalClients: number;
  totalPartners: number;
  byType: Array<{
    type: 'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria';
    count: number;
  }>;
  recentRequests: DashboardRecentRequestDto[];
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(RequestEntity)
    private readonly requestRepository: Repository<RequestEntity>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getAdminSummary(): Promise<DashboardSummaryDto> {
    const [
      totalRequests,
      enProceso,
      pendientes,
      completadas,
      totalClients,
      totalPartners,
    ] = await Promise.all([
      this.requestRepository.count(),
      this.requestRepository.count({ where: { status: 'en-proceso' } }),
      this.requestRepository.count({
        where: { status: In(['pendiente', 'solicitud-recibida']) },
      }),
      this.requestRepository.count({ where: { status: 'completada' } }),
      this.clientRepository.count(),
      this.userRepository.count({ where: { type: 'partner' } }),
    ]);

    const byTypeRaw = await this.requestRepository
      .createQueryBuilder('r')
      .select('r.type', 'type')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('r.type')
      .getRawMany<{ type: string; cnt: string }>();

    const typeOrder: Array<'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria'> = [
      'apertura-llc',
      'renovacion-llc',
      'cuenta-bancaria',
    ];
    const byTypeMap = new Map<string, number>();
    for (const row of byTypeRaw) {
      byTypeMap.set(row.type, parseInt(row.cnt, 10) || 0);
    }
    const byType = typeOrder.map((type) => ({
      type,
      count: byTypeMap.get(type) ?? 0,
    }));

    const recent = await this.requestRepository.find({
      order: { createdAt: 'DESC' },
      take: 5,
      relations: ['client'],
    });

    const recentRequests: DashboardRecentRequestDto[] = recent.map((r) => ({
      id: r.id,
      type: r.type,
      clientName: this.clientDisplayName(r),
      status: r.status,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    }));

    return {
      totalRequests,
      enProceso,
      pendientes,
      completadas,
      totalClients,
      totalPartners,
      byType,
      recentRequests,
    };
  }

  private clientDisplayName(req: RequestEntity): string {
    const c = req.client;
    if (!c) return '—';
    const row = c as Client;
    if (row.full_name?.trim()) return row.full_name.trim();
    return row.email || '—';
  }
}
