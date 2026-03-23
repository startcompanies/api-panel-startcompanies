import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { User } from '../../shared/user/entities/user.entity';
import { CreateNotificationDto } from './dtos/create-notification.dto';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async findByUser(userId: number, read?: boolean) {
    // Verificar que el usuario existe
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const where: any = { userId };
    if (read !== undefined) {
      where.read = read;
    }

    return this.notificationRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findUnreadCount(userId: number) {
    return this.notificationRepo.count({
      where: { userId, read: false },
    });
  }

  async create(createNotificationDto: CreateNotificationDto) {
    // Verificar que el usuario existe
    const user = await this.userRepo.findOne({
      where: { id: createNotificationDto.userId },
    });
    if (!user) {
      throw new NotFoundException(
        `Usuario con ID ${createNotificationDto.userId} no encontrado`,
      );
    }

    const notification = this.notificationRepo.create({
      ...createNotificationDto,
      read: createNotificationDto.read ?? false,
    });

    const saved = await this.notificationRepo.save(notification);
    this.notificationsGateway.emitNotificationToUser(
      saved.userId,
      saved,
    );
    return saved;
  }

  async markAsRead(id: number, userId: number) {
    const notification = await this.notificationRepo.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException(
        `Notificación con ID ${id} no encontrada para el usuario ${userId}`,
      );
    }

    notification.read = true;
    const saved = await this.notificationRepo.save(notification);
    this.notificationsGateway.emitNotificationRead(userId, {
      id: saved.id,
      read: true,
    });
    return saved;
  }

  async markAllAsRead(userId: number) {
    await this.notificationRepo.update(
      { userId, read: false },
      { read: true },
    );

    this.notificationsGateway.emitNotificationsReadAll(userId);

    return { message: 'Todas las notificaciones han sido marcadas como leídas' };
  }

  async delete(id: number, userId: number) {
    const notification = await this.notificationRepo.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException(
        `Notificación con ID ${id} no encontrada para el usuario ${userId}`,
      );
    }

    const removedId = notification.id;
    const uid = notification.userId;
    await this.notificationRepo.remove(notification);
    this.notificationsGateway.emitNotificationRemoved(uid, { id: removedId });
    return { message: 'Notificación eliminada correctamente' };
  }
}

