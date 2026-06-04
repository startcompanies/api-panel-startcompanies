import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SettingsModule } from '../settings/settings.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { AccountingAiSuggestService } from './accounting-ai-suggest.service';
import { AccountingClassificationService } from './accounting-classification.service';
import { AccountCatalog } from './entities/account-catalog.entity';
import { AccountingCategory } from './entities/accounting-category.entity';
import { BankAccount } from './entities/bank-account.entity';
import { BankImport } from './entities/bank-import.entity';
import { BankTransaction } from './entities/bank-transaction.entity';
import { UserClassificationRule } from './entities/user-classification-rule.entity';
import { PlSnapshot } from './entities/pl-snapshot.entity';
import { Invoice } from '../invoicing/entities/invoice.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankAccount,
      BankImport,
      BankTransaction,
      UserClassificationRule,
      AccountCatalog,
      AccountingCategory,
      PlSnapshot,
      Invoice,
    ]),
    SettingsModule,
    ConfigModule,
  ],
  controllers: [AccountingController],
  providers: [AccountingService, AccountingAiSuggestService, AccountingClassificationService, RolesGuard],
  exports: [AccountingService],
})
export class AccountingModule {}

