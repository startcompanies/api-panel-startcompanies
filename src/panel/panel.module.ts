import { Module } from '@nestjs/common';
import { RequestsModule } from './requests/requests.module';
// ProcessStepsModule eliminado - no se usa
// DocumentsModule eliminado - tabla documents no se usa (URLs se guardan directamente en campos de request)
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { ClientsModule } from './clients/clients.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { BillingModule } from './billing/billing.module';

/**
 * Módulo wrapper que agrupa todos los módulos relacionados con el Panel Administrativo
 * Separado del Blog para mejor organización y mantenibilidad
 */
@Module({
  imports: [
    RequestsModule,
    // ProcessStepsModule eliminado - no se usa
    // DocumentsModule eliminado - no se usa
    NotificationsModule,
    SettingsModule,
    ReportsModule,
    ClientsModule,
    DashboardModule,
    BillingModule,
  ],
  exports: [
    RequestsModule,
    // ProcessStepsModule eliminado - no se usa
    // DocumentsModule eliminado - no se usa
    NotificationsModule,
    SettingsModule,
    ReportsModule,
    ClientsModule,
    DashboardModule,
    BillingModule,
  ],
})
export class PanelModule {}










