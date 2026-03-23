import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { User } from '../../shared/user/entities/user.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { RequestSubmittedNotificationsService } from './request-submitted-notifications.service';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { CommonModule } from '../../shared/common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User]), CommonModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsGateway,
    NotificationsService,
    RequestSubmittedNotificationsService,
    RolesGuard,
  ],
  exports: [NotificationsService, RequestSubmittedNotificationsService],
})
export class NotificationsModule {}

