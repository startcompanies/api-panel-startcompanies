import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PlaidItem } from './entities/plaid-item.entity';
import { BankAccount } from '../accounting/entities/bank-account.entity';
import { PlaidService } from './plaid.service';
import { PlaidController, PlaidWebhookController } from './plaid.controller';
import { AccountingModule } from '../accounting/accounting.module';
import { PartnerTenantsModule } from '../partner-tenants/partner-tenants.module';
import { UserSecretEncryptionService } from '../../shared/common/services/user-secret-encryption.service';
import { RolesGuard } from '../../shared/auth/roles.guard';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlaidItem, BankAccount]),
    forwardRef(() => AccountingModule),
    PartnerTenantsModule,
  ],
  controllers: [PlaidController, PlaidWebhookController],
  providers: [PlaidService, UserSecretEncryptionService, RolesGuard],
  exports: [PlaidService],
})
export class PlaidModule {}
