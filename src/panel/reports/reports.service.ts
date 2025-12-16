import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Request } from '../requests/entities/request.entity';
import { User } from '../../shared/user/entities/user.entity';

export interface PartnerPerformanceMetrics {
  partnerId: number;
  partnerName: string;
  totalRequests: number;
  completedRequests: number;
  pendingRequests: number;
  inProcessRequests: number;
  rejectedRequests: number;
  totalRevenue: number;
  averageCompletionTime: number; // en días
  clientCount: number;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Request)
    private readonly requestRepo: Repository<Request>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getPartnerPerformance(
    startDate?: Date,
    endDate?: Date,
    partnerId?: number,
  ) {
    try {
      const where: any = {};

      // Filtrar por partner si se especifica
      if (partnerId) {
        where.partnerId = partnerId;
      } else {
        // Solo partners tienen partnerId
        where.partnerId = null; // Esto no es correcto, mejor usar Not(IsNull())
      }

      // Filtrar por rango de fechas si se proporciona
      if (startDate && endDate) {
        where.createdAt = Between(startDate, endDate);
      } else if (startDate) {
        where.createdAt = Between(startDate, new Date());
      } else if (endDate) {
        // Si solo hay endDate, buscar desde hace 1 año
        const oneYearAgo = new Date(endDate);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        where.createdAt = Between(oneYearAgo, endDate);
      }

      // Obtener todas las solicitudes de partners
      const whereCondition: any = {};
      if (partnerId) {
        whereCondition.partnerId = partnerId;
      } else {
        // Si no se especifica partnerId, obtener todas las solicitudes que tienen partnerId
        whereCondition.partnerId = null; // Esto no funcionará bien, mejor usar Not(IsNull())
      }

      const requests = await this.requestRepo.find({
        where: partnerId ? { partnerId } : {},
        relations: ['partner', 'client'],
        order: { createdAt: 'DESC' },
      });

      // Filtrar solo las que tienen partnerId si no se especificó uno
      let partnerRequests = requests;
      if (!partnerId) {
        partnerRequests = requests.filter((r) => r.partnerId !== null && r.partnerId !== undefined);
      }

      // Filtrar por fechas si se proporcionaron
      let filteredRequests = partnerRequests;
      if (startDate || endDate) {
        filteredRequests = partnerRequests.filter((req) => {
          const reqDate = new Date(req.createdAt);
          if (startDate && reqDate < startDate) return false;
          if (endDate && reqDate > endDate) return false;
          return true;
        });
      }

      // Agrupar por partner
      const partnerMap = new Map<number, PartnerPerformanceMetrics>();

      for (const request of filteredRequests) {
        if (!request.partnerId) continue;

        const partnerId = request.partnerId;
        let metrics = partnerMap.get(partnerId);

        if (!metrics) {
          const partner = await this.userRepo.findOne({
            where: { id: partnerId },
          });
          metrics = {
            partnerId,
            partnerName: partner
              ? `${partner.first_name} ${partner.last_name}`
              : `Partner ${partnerId}`,
            totalRequests: 0,
            completedRequests: 0,
            pendingRequests: 0,
            inProcessRequests: 0,
            rejectedRequests: 0,
            totalRevenue: 0,
            averageCompletionTime: 0,
            clientCount: 0,
          };
          partnerMap.set(partnerId, metrics);
        }

        metrics.totalRequests++;

        switch (request.status) {
          case 'completada':
            metrics.completedRequests++;
            break;
          case 'pendiente':
            metrics.pendingRequests++;
            break;
          case 'en-proceso':
            metrics.inProcessRequests++;
            break;
          case 'rechazada':
            metrics.rejectedRequests++;
            break;
        }

        // Calcular tiempo de completación si está completada
        if (request.status === 'completada' && request.updatedAt) {
          const completionTime =
            (new Date(request.updatedAt).getTime() -
              new Date(request.createdAt).getTime()) /
            (1000 * 60 * 60 * 24); // convertir a días
          metrics.averageCompletionTime += completionTime;
        }
      }

      // Calcular promedios y obtener clientes únicos por partner
      const partnerMetrics = Array.from(partnerMap.values()).map((metrics) => {
        // Obtener clientes únicos para este partner
        const partnerRequests = filteredRequests.filter(
          (r) => r.partnerId === metrics.partnerId,
        );
        const uniqueClients = new Set(
          partnerRequests.map((r) => r.clientId),
        ).size;
        metrics.clientCount = uniqueClients;

        // Calcular promedio de tiempo de completación
        if (metrics.completedRequests > 0) {
          metrics.averageCompletionTime =
            metrics.averageCompletionTime / metrics.completedRequests;
        } else {
          metrics.averageCompletionTime = 0;
        }

        return metrics;
      });

      // Ordenar por total de solicitudes (descendente)
      partnerMetrics.sort((a, b) => b.totalRequests - a.totalRequests);

      // Calcular métricas agregadas
      const totalRequests = partnerMetrics.reduce(
        (sum, m) => sum + m.totalRequests,
        0,
      );
      const totalCompleted = partnerMetrics.reduce(
        (sum, m) => sum + m.completedRequests,
        0,
      );
      const totalClients = new Set(
        filteredRequests.map((r) => r.clientId),
      ).size;

      return {
        summary: {
          totalPartners: partnerMetrics.length,
          totalRequests,
          totalCompleted,
          totalClients,
          averageRequestsPerPartner:
            partnerMetrics.length > 0
              ? totalRequests / partnerMetrics.length
              : 0,
        },
        partners: partnerMetrics,
        period: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
      };
    } catch (error) {
      console.error('Error al generar reporte de partners:', error);
      throw new InternalServerErrorException(
        'Error al generar el reporte de rendimiento de partners',
      );
    }
  }
}

