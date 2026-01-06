import { Module } from '@nestjs/common';
import { RequestsModule } from './requests/requests.module';
import { ProcessStepsModule } from './process-steps/process-steps.module';
import { DocumentsModule } from './documents/documents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { ClientsModule } from './clients/clients.module';

/**
 * Módulo wrapper que agrupa todos los módulos relacionados con el Panel Administrativo
 * Separado del Blog para mejor organización y mantenibilidad
 */
@Module({
  imports: [
    RequestsModule,
    ProcessStepsModule,
    DocumentsModule,
    NotificationsModule,
    SettingsModule,
    ReportsModule,
    ClientsModule,
  ],
  exports: [
    RequestsModule,
    ProcessStepsModule,
    DocumentsModule,
    NotificationsModule,
    SettingsModule,
    ReportsModule,
    ClientsModule,
  ],
})
export class PanelModule {}










