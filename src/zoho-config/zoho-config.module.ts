import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ZohoConfigController } from './zoho-config.controller';
import { ZohoConfigService } from './zoho-config.service';
import { ZohoCrmService } from './zoho-crm.service';
import { ZohoCrmController } from './zoho-crm.controller';
import { ZohoWorkDriveService } from './zoho-workdrive.service';
import { ZohoSyncService } from './zoho-sync.service';
import { ZohoSyncController } from './zoho-sync.controller';
import { ZohoConfig } from './zoho-config.entity';
import { Request } from '../panel/requests/entities/request.entity';
import { AperturaLlcRequest } from '../panel/requests/entities/apertura-llc-request.entity';
import { RenovacionLlcRequest } from '../panel/requests/entities/renovacion-llc-request.entity';
import { CuentaBancariaRequest } from '../panel/requests/entities/cuenta-bancaria-request.entity';
import { Member } from '../panel/requests/entities/member.entity';
import { User } from '../shared/user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ZohoConfig,
      Request,
      AperturaLlcRequest,
      RenovacionLlcRequest,
      CuentaBancariaRequest,
      Member,
      User,
    ]),
    HttpModule,
  ],
  controllers: [ZohoConfigController, ZohoCrmController, ZohoSyncController],
  providers: [ZohoConfigService, ZohoCrmService, ZohoWorkDriveService, ZohoSyncService],
  exports: [ZohoConfigService, ZohoCrmService, ZohoWorkDriveService, ZohoSyncService],
})
export class ZohoConfigModule {}







