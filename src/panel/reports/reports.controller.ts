import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Panel - Reports')
@ApiBearerAuth('JWT-auth')
@Controller('panel/reports')
@UseGuards(AuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // Reporte de rendimiento de partners (solo admin)
  @Get('partner-performance')
  @Roles('admin')
  @ApiOperation({
    summary: 'Reporte de rendimiento de partners (Admin)',
    description: 'Obtiene un reporte de rendimiento de partners con filtros opcionales por fecha y partner. Solo disponible para administradores.',
  })
  @ApiQuery({ name: 'startDate', required: false, description: 'Fecha de inicio (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Fecha de fin (YYYY-MM-DD)' })
  @ApiQuery({ name: 'partnerId', required: false, description: 'ID del partner para filtrar' })
  @ApiResponse({ status: 200, description: 'Reporte de rendimiento de partners' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (solo admin)' })
  getPartnerPerformance(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('partnerId') partnerId?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    const partner = partnerId ? parseInt(partnerId, 10) : undefined;

    // Validar fechas
    if (start && isNaN(start.getTime())) {
      throw new Error('Fecha de inicio inválida');
    }
    if (end && isNaN(end.getTime())) {
      throw new Error('Fecha de fin inválida');
    }
    if (start && end && start > end) {
      throw new Error('La fecha de inicio debe ser anterior a la fecha de fin');
    }

    return this.reportsService.getPartnerPerformance(start, end, partner);
  }
}

