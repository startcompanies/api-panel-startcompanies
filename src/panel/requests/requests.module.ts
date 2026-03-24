import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Request } from './entities/request.entity';
import { AperturaLlcRequest } from './entities/apertura-llc-request.entity';
import { RenovacionLlcRequest } from './entities/renovacion-llc-request.entity';
import { CuentaBancariaRequest } from './entities/cuenta-bancaria-request.entity';
import { Member } from './entities/member.entity';
import { ZohoDealTimeline } from './entities/zoho-deal-timeline.entity';
// BankAccountValidator y BankAccountOwner ya no se usan - consolidados en Member y CuentaBancariaRequest
// RequestRequiredDocument ya no se usa - eliminado
import { User } from '../../shared/user/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { RequestsService } from './requests.service';
import { ServiceHistoryService } from './service-history.service';
import { RequestsController } from './requests.controller';
import { MembersController } from './members.controller';
// OwnersController y BankAccountValidatorController ya no se usan - endpoints legacy
import { RolesGuard } from '../../shared/auth/roles.guard';
import { ZohoConfigModule } from '../../zoho-config/zoho-config.module';
import { PaymentsModule } from '../../shared/payments/payments.module';
import { UserModule } from '../../shared/user/user.module';
import { UploadFileModule } from '../../shared/upload-file/upload-file.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Request,
      AperturaLlcRequest,
      RenovacionLlcRequest,
      CuentaBancariaRequest,
      Member,
      ZohoDealTimeline,
      // BankAccountValidator y BankAccountOwner ya no se usan - consolidados en Member y CuentaBancariaRequest
      // RequestRequiredDocument eliminado - no se usa
      User,
      Client,
    ]),
    ZohoConfigModule,
    PaymentsModule,
    UserModule,
    UploadFileModule,
    NotificationsModule,
  ],
  controllers: [
    RequestsController,
    MembersController,
    // OwnersController y BankAccountValidatorController ya no se usan - endpoints legacy
  ],
  providers: [RequestsService, ServiceHistoryService, RolesGuard],
  exports: [RequestsService, ServiceHistoryService],
})
export class RequestsModule {}

