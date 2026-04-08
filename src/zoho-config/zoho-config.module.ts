import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ZohoConfigController } from './zoho-config.controller';
import { ZohoConfigService } from './zoho-config.service';
import { ZohoCrmService } from './zoho-crm.service';
import { ZohoCrmController } from './zoho-crm.controller';
import { ZohoWorkDriveService } from './zoho-workdrive.service';
import { ZohoSyncService } from './zoho-sync.service';
import { ZohoContactService } from './zoho-contact.service';
import { ZohoSyncController } from './zoho-sync.controller';
import { PanelClientAllowlistService } from './panel-client-allowlist.service';
import { ZohoConfig } from './zoho-config.entity';
import { Request } from '../panel/requests/entities/request.entity';
import { AperturaLlcRequest } from '../panel/requests/entities/apertura-llc-request.entity';
import { RenovacionLlcRequest } from '../panel/requests/entities/renovacion-llc-request.entity';
import { CuentaBancariaRequest } from '../panel/requests/entities/cuenta-bancaria-request.entity';
import { Member } from '../panel/requests/entities/member.entity';
import { User } from '../shared/user/entities/user.entity';
import { Client } from '../panel/clients/entities/client.entity';
import { ZohoDealTimeline } from '../panel/requests/entities/zoho-deal-timeline.entity';
import { UploadFileModule } from '../shared/upload-file/upload-file.module';
import { CommonModule } from '../shared/common/common.module';

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    UploadFileModule,
    TypeOrmModule.forFeature([
      ZohoConfig,
      Request,
      AperturaLlcRequest,
      RenovacionLlcRequest,
      CuentaBancariaRequest,
      Member,
      User,
      Client,
      ZohoDealTimeline,
    ]),
    HttpModule,
  ],
  controllers: [ZohoConfigController, ZohoCrmController, ZohoSyncController],
  providers: [
    ZohoConfigService,
    ZohoCrmService,
    ZohoWorkDriveService,
    ZohoSyncService,
    ZohoContactService,
    PanelClientAllowlistService,
  ],
  exports: [
    ZohoConfigService,
    ZohoCrmService,
    ZohoWorkDriveService,
    ZohoSyncService,
    ZohoContactService,
    PanelClientAllowlistService,
  ],
})
export class ZohoConfigModule {}








