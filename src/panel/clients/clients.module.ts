import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { Client } from './entities/client.entity';
import { Request } from '../requests/entities/request.entity';
import { User } from '../../shared/user/entities/user.entity';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { ZohoConfigModule } from '../../zoho-config/zoho-config.module';
import { CommonModule } from '../../shared/common/common.module';
import { PartnerTenantsModule } from '../partner-tenants/partner-tenants.module';

@Module({
  controllers: [ClientsController],
  providers: [ClientsService, RolesGuard],
  imports: [
    TypeOrmModule.forFeature([Client, Request, User]),
    ZohoConfigModule,
    CommonModule,
    PartnerTenantsModule,
  ],
  exports: [ClientsService],
})
export class ClientsModule {}









