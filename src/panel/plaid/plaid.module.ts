import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PlaidItem } from './entities/plaid-item.entity';
import { PlaidWebhookEvent } from './entities/plaid-webhook-event.entity';
import { PlaidConnectReminder } from './entities/plaid-connect-reminder.entity';
import { BankAccount } from '../accounting/entities/bank-account.entity';
import { User } from '../../shared/user/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { PlaidService } from './plaid.service';
import { PlaidWebhookVerifyService } from './plaid-webhook-verify.service';
import { PlaidController, PlaidWebhookController } from './plaid.controller';
import { AccountingModule } from '../accounting/accounting.module';
import { PartnerTenantsModule } from '../partner-tenants/partner-tenants.module';
import { CommonModule } from '../../shared/common/common.module';
import { UserSecretEncryptionService } from '../../shared/common/services/user-secret-encryption.service';
import { RolesGuard } from '../../shared/auth/roles.guard';

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    TypeOrmModule.forFeature([
      PlaidItem,
      PlaidWebhookEvent,
      PlaidConnectReminder,
      BankAccount,
      User,
      Client,
    ]),
    forwardRef(() => AccountingModule),
    PartnerTenantsModule,
  ],
  controllers: [PlaidController, PlaidWebhookController],
  providers: [PlaidService, PlaidWebhookVerifyService, UserSecretEncryptionService, RolesGuard],
  exports: [PlaidService],
})
export class PlaidModule {}
