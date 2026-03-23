import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../../shared/user/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { Request as RequestEntity } from '../requests/entities/request.entity';
import { NotificationsService } from './notifications.service';

const TYPE_LABELS: Record<string, string> = {
  'apertura-llc': 'Apertura LLC',
  'renovacion-llc': 'Renovación LLC',
  'cuenta-bancaria': 'Cuenta bancaria',
};

@Injectable()
export class RequestSubmittedNotificationsService {
  private readonly logger = new Logger(RequestSubmittedNotificationsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Notifica a staff (admin/user), partner y cliente con usuario cuando la solicitud pasa a solicitud-recibida.
   */
  async notifyAfterSolicitudRecibida(
    request: RequestEntity,
    client: Client | null,
  ): Promise<void> {
    try {
      const typeLabel = TYPE_LABELS[request.type] ?? request.type;
      const summary = `#${request.id} (${typeLabel})`;

      const staff = await this.userRepo.find({
        where: { type: In(['admin', 'user']), status: true },
      });

      const notified = new Set<number>();

      for (const u of staff) {
        await this.notificationsService.create({
          userId: u.id,
          type: 'info',
          title: 'Nueva solicitud recibida',
          message: `Solicitud ${summary} — revisar en el panel.`,
          link: `/panel/requests/${request.id}`,
          requestId: request.id,
        });
        notified.add(u.id);
      }

      if (request.partnerId && !notified.has(request.partnerId)) {
        await this.notificationsService.create({
          userId: request.partnerId,
          type: 'success',
          title: 'Solicitud registrada',
          message: `La solicitud ${summary} fue enviada al equipo.`,
          link: `/panel/my-requests/${request.id}`,
          requestId: request.id,
        });
        notified.add(request.partnerId);
      }

      const clientUserId = client?.userId;
      if (clientUserId && !notified.has(clientUserId)) {
        await this.notificationsService.create({
          userId: clientUserId,
          type: 'success',
          title: 'Solicitud recibida',
          message: `Tu solicitud ${summary} fue recibida. Puedes seguir el estado en el panel.`,
          link: `/panel/my-requests/${request.id}`,
          requestId: request.id,
        });
      }
    } catch (err) {
      this.logger.error(
        `No se pudieron crear notificaciones para solicitud ${request.id}: ${err}`,
      );
    }
  }
}
