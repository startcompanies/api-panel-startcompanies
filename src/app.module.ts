import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { configService } from './config/config.service';
import { UserModule } from './shared/user/user.module';
import { AuthModule } from './shared/auth/auth.module';
import { CommonModule } from './shared/common/common.module';
import { UploadFileModule } from './shared/upload-file/upload-file.module';
// Módulos agrupados por funcionalidad
import { PanelModule } from './panel/panel.module';
import { WizardModule } from './wizard/wizard.module';
import { ZohoConfigModule } from './zoho-config/zoho-config.module';
import { LiliModule } from './lili/lili.module';
import { LoggingInterceptor } from './shared/common/interceptors/logging.interceptor';
import { ViewAsReadOnlyInterceptor } from './panel/view-as/view-as-read-only.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
      },
    ]),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(configService.getTypeOrmConfig()),
    // Módulos compartidos (usados por Blog y Panel)
    AuthModule,
    UserModule,
    CommonModule,
    UploadFileModule,
    // Módulos agrupados por funcionalidad
    PanelModule, // Agrupa: RequestsModule, ProcessStepsModule, DocumentsModule, NotificationsModule, SettingsModule, ReportsModule
    WizardModule, // Módulo para flujo wizard (nuevos usuarios)
    ZohoConfigModule, // Configuración OAuth y SSO de Zoho
    LiliModule,
  ],
  controllers: [],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ViewAsReadOnlyInterceptor,
    },
  ],
})
export class AppModule {}
