import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { AppLogsService } from './app-logs.service';

@ApiTags('Panel — Logs')
@ApiBearerAuth('JWT-auth')
@Controller('panel/admin/logs')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AppLogsController {
  constructor(private readonly appLogs: AppLogsService) {}

  @Get('days')
  @ApiOperation({ summary: 'Listar días con archivo de log (hora Argentina)' })
  listDays() {
    return this.appLogs.listDays();
  }

  @Get(':date/download')
  @ApiOperation({ summary: 'Descargar archivo de log completo del día' })
  downloadDay(@Param('date') date: string) {
    return this.appLogs.downloadDay(date);
  }

  @Get(':date')
  @ApiOperation({ summary: 'Leer log de un día (YYYY-MM-DD, hora Argentina)' })
  readDay(
    @Param('date') date: string,
    @Query('tail') tail?: string,
    @Query('q') q?: string,
  ) {
    const n = tail != null && tail !== '' ? parseInt(tail, 10) : undefined;
    return this.appLogs.readDay(date, Number.isFinite(n) ? n : undefined, q);
  }
}
