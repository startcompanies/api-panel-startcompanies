import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnerTenant } from './entities/partner-tenant.entity';
import { PartnerTenantsService } from './partner-tenants.service';
import { PartnerTenantsController } from './partner-tenants.controller';
import { PanelPartnerTenantsController } from './panel-partner-tenants.controller';
import { TenantAccessService } from './tenant-access.service';
import { EmailTenantBrandingService } from './email-tenant-branding.service';
import { Client } from '../clients/entities/client.entity';
import { User } from '../../shared/user/entities/user.entity';
import { UploadFileModule } from '../../shared/upload-file/upload-file.module';
import { RolesGuard } from '../../shared/auth/roles.guard';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PartnerTenant, Client, User]),
    UploadFileModule,
  ],
  controllers: [PartnerTenantsController, PanelPartnerTenantsController],
  providers: [
    PartnerTenantsService,
    TenantAccessService,
    EmailTenantBrandingService,
    RolesGuard,
  ],
  exports: [
    PartnerTenantsService,
    TenantAccessService,
    EmailTenantBrandingService,
  ],
})
export class PartnerTenantsModule {}
