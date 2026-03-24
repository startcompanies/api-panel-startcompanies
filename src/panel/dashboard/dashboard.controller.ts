import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Panel - Dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('panel/dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  @ApiOperation({
    summary: 'Resumen del panel (admin / staff)',
    description:
      'Totales de solicitudes por estado, clientes, partners, distribución por tipo y últimas solicitudes.',
  })
  getSummary() {
    return this.dashboardService.getAdminSummary();
  }
}
