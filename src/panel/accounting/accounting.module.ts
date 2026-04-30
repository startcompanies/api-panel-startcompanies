import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { AccountingCategory } from './entities/accounting-category.entity';
import { BankAccount } from './entities/bank-account.entity';
import { BankImport } from './entities/bank-import.entity';
import { BankTransaction } from './entities/bank-transaction.entity';
import { PlSnapshot } from './entities/pl-snapshot.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankAccount,
      BankImport,
      BankTransaction,
      AccountingCategory,
      PlSnapshot,
    ]),
  ],
  controllers: [AccountingController],
  providers: [AccountingService, RolesGuard],
})
export class AccountingModule {}

