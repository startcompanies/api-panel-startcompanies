import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { configService } from './config/config.service';
import { UserModule } from './shared/user/user.module';
import { AuthModule } from './shared/auth/auth.module';
import { CommonModule } from './shared/common/common.module';
import { UploadFileModule } from './shared/upload-file/upload-file.module';
// Módulos agrupados por funcionalidad
import { BlogModule } from './blog/blog.module';
import { PanelModule } from './panel/panel.module';
import { ZohoConfigModule } from './zoho-config/zoho-config.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(configService.getTypeOrmConfig()),
    // Módulos compartidos (usados por Blog y Panel)
    AuthModule,
    UserModule,
    CommonModule,
    UploadFileModule,
    // Módulos agrupados por funcionalidad
    BlogModule, // Agrupa: PostsModule, CategoriesModule, TagsModule, ReusableElementsModule
    PanelModule, // Agrupa: RequestsModule, ProcessStepsModule, DocumentsModule, NotificationsModule, SettingsModule, ReportsModule
    ZohoConfigModule, // Configuración OAuth y SSO de Zoho
  ],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
