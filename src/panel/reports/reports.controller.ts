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
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Panel - Reports')
@Controller('panel/reports')
@UseGuards(AuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // Reporte de rendimiento de partners (solo admin)
  @Get('partner-performance')
  @Roles('admin')
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

