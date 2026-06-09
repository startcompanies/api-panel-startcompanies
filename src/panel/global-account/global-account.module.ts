import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { BridgeAccount } from './entities/bridge-account.entity';
import { BridgeWebhookEvent } from './entities/bridge-webhook-event.entity';
import { GlobalAccountService } from './global-account.service';
import {
  BridgeWebhookController,
  GlobalAccountController,
} from './global-account.controller';
import { BridgeWebhookVerifyService } from './bridge-webhook-verify.service';
import { User } from '../../shared/user/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { Request } from '../requests/entities/request.entity';
import { RolesGuard } from '../../shared/auth/roles.guard';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      BridgeAccount,
      BridgeWebhookEvent,
      User,
      Client,
      Request,
    ]),
  ],
  controllers: [GlobalAccountController, BridgeWebhookController],
  providers: [GlobalAccountService, BridgeWebhookVerifyService, RolesGuard],
  exports: [GlobalAccountService],
})
export class GlobalAccountModule {}
