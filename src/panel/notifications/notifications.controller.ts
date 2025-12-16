import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dtos/create-notification.dto';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Panel - Notifications')
@Controller('panel/notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // Listar notificaciones del usuario actual
  @Get('me')
  findMyNotifications(
    @Req() req: any,
    @Query('read') read?: string,
  ) {
    const userId = req.user.id;
    const readFilter = read === 'true' ? true : read === 'false' ? false : undefined;
    return this.notificationsService.findByUser(userId, readFilter);
  }

  // Contar notificaciones no leídas del usuario actual
  @Get('me/unread-count')
  getUnreadCount(@Req() req: any) {
    const userId = req.user.id;
    return this.notificationsService.findUnreadCount(userId);
  }

  // Crear notificación (admin o sistema)
  @Post()
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  // Marcar notificación como leída
  @Patch(':id/read')
  markAsRead(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    return this.notificationsService.markAsRead(id, userId);
  }

  // Marcar todas las notificaciones como leídas
  @Patch('me/read-all')
  markAllAsRead(@Req() req: any) {
    const userId = req.user.id;
    return this.notificationsService.markAllAsRead(userId);
  }

  // Eliminar notificación
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    return this.notificationsService.delete(id, userId);
  }
}

