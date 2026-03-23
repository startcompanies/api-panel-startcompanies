import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { jwtConstants } from '../../shared/common/constants/jwtConstants';
import { getSocketIoCorsConfig } from '../../config/cors-origins';
import { Notification } from './entities/notification.entity';

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('=').trim());
  }
  return out;
}

function extractAccessToken(client: Socket): string | undefined {
  const cookies = parseCookies(client.handshake.headers.cookie);
  if (cookies['access_token']) {
    return cookies['access_token'];
  }
  const auth = client.handshake.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return undefined;
}

export interface NotificationPayload {
  id: number;
  userId: number;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  requestId: number | null;
  createdAt: string;
  updatedAt: string;
}

@WebSocketGateway({
  namespace: '/notifications',
  cors: getSocketIoCorsConfig(),
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    const token = extractAccessToken(client);
    if (!token) {
      this.logger.warn('Socket sin token; desconectando');
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtConstants.secret,
      });
      const userId = payload.id as number | undefined;
      if (!userId) {
        client.disconnect(true);
        return;
      }
      const room = `user:${userId}`;
      await client.join(room);
    } catch {
      client.disconnect(true);
    }
  }

  /** Serializa entidad para el cliente (fechas ISO). */
  emitNotificationToUser(userId: number, notification: Notification) {
    const room = `user:${userId}`;
    const payload = this.toPayload(notification);
    this.server.to(room).emit('notification', payload);
  }

  emitNotificationRead(userId: number, data: { id: number; read: boolean }) {
    this.server.to(`user:${userId}`).emit('notification:read', data);
  }

  emitNotificationRemoved(userId: number, data: { id: number }) {
    this.server.to(`user:${userId}`).emit('notification:removed', data);
  }

  emitNotificationsReadAll(userId: number) {
    this.server.to(`user:${userId}`).emit('notifications:read-all', {});
  }

  private toPayload(n: Notification): NotificationPayload {
    return {
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      link: n.link ?? null,
      requestId: n.requestId ?? null,
      createdAt:
        n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
      updatedAt:
        n.updatedAt instanceof Date ? n.updatedAt.toISOString() : String(n.updatedAt),
    };
  }
}
