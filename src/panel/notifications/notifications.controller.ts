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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Panel - Notifications')
@ApiBearerAuth('JWT-auth')
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
  @ApiOperation({
    summary: 'Contar notificaciones no leídas',
    description: 'Obtiene el número de notificaciones no leídas del usuario autenticado.',
  })
  @ApiResponse({ status: 200, description: 'Número de notificaciones no leídas' })
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
  @ApiOperation({
    summary: 'Marcar notificación como leída',
    description: 'Marca una notificación específica como leída para el usuario autenticado.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la notificación' })
  @ApiResponse({ status: 200, description: 'Notificación marcada como leída' })
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
  @ApiOperation({
    summary: 'Eliminar una notificación',
    description: 'Elimina una notificación del usuario autenticado.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la notificación' })
  @ApiResponse({ status: 200, description: 'Notificación eliminada exitosamente' })
  delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    return this.notificationsService.delete(id, userId);
  }
}

