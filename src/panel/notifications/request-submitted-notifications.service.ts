import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../../shared/user/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { Request as RequestEntity } from '../requests/entities/request.entity';
import { NotificationsService } from './notifications.service';
import { EmailService } from '../../shared/common/services/email.service';

const TYPE_LABELS: Record<string, string> = {
  'apertura-llc': 'Apertura LLC',
  'renovacion-llc': 'Renovación LLC',
  'cuenta-bancaria': 'Cuenta bancaria',
};

/** Usuario autenticado del panel al crear/actualizar solicitud (req.user). */
export type PanelRequestActorUser = {
  id: number;
  email: string;
  type: string;
  first_name?: string | null;
  username?: string | null;
};

@Injectable()
export class RequestSubmittedNotificationsService {
  private readonly logger = new Logger(RequestSubmittedNotificationsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Notifica a staff (admin/user), partner y cliente con usuario cuando la solicitud pasa a solicitud-recibida.
   * Opcionalmente envía correos al actor del panel y a staff.
   */
  async notifyAfterSolicitudRecibida(
    request: RequestEntity,
    client: Client | null,
    actorUser?: PanelRequestActorUser | null,
    options?: { channel?: 'portal' | 'wizard' | 'lead' },
  ): Promise<void> {
    const channel = options?.channel ?? 'portal';

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

      // --- Correos (Resend) ---
      const originLabel =
        channel === 'lead'
          ? 'Cliente lead'
          : channel === 'wizard'
            ? 'Cliente directo'
            : request.partnerId
              ? 'Partner'
              : 'Cliente';

      for (const u of staff) {
        if (!u.email?.trim()) continue;
        try {
          const displayName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
          await this.emailService.sendNewRequestAlertToStaff({
            toEmail: u.email,
            recipientName: displayName || u.username,
            requestId: request.id,
            requestType: request.type,
            channel,
            originLabel,
          });
        } catch (emailErr) {
          this.logger.error(
            `Email staff falló para ${u.email} (request ${request.id}): ${emailErr}`,
          );
        }
      }

      if (actorUser?.email && channel === 'portal') {
        const t = actorUser.type;
        if (t === 'partner' || t === 'client') {
          const displayName =
            [actorUser.first_name].filter(Boolean).join(' ').trim() ||
            actorUser.username ||
            actorUser.email;
          try {
            await this.emailService.sendPanelRequestSubmittedToActor({
              email: actorUser.email,
              displayName,
              requestId: request.id,
              requestType: request.type,
              actorType: t,
            });
          } catch (emailErr) {
            this.logger.error(
              `Email actor panel falló para ${actorUser.email} (request ${request.id}): ${emailErr}`,
            );
          }
        }
      }
    } catch (err) {
      this.logger.error(
        `No se pudieron crear notificaciones para solicitud ${request.id}: ${err}`,
      );
    }
  }
}
