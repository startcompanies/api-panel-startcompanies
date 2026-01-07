import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Request } from '../panel/requests/entities/request.entity';
import { AperturaLlcRequest } from '../panel/requests/entities/apertura-llc-request.entity';
import { RenovacionLlcRequest } from '../panel/requests/entities/renovacion-llc-request.entity';
import { CuentaBancariaRequest } from '../panel/requests/entities/cuenta-bancaria-request.entity';
import { Member } from '../panel/requests/entities/member.entity';
import { BankAccountOwner } from '../panel/requests/entities/bank-account-owner.entity';
import { BankAccountValidator } from '../panel/requests/entities/bank-account-validator.entity';
import { User } from '../shared/user/entities/user.entity';
import { Client } from '../panel/clients/entities/client.entity';
import { WizardService } from './wizard.service';
import { WizardController } from './wizard.controller';
import { PaymentsModule } from '../shared/payments/payments.module';
import { CommonModule } from '../shared/common/common.module';
import { AuthModule } from '../shared/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Request,
      AperturaLlcRequest,
      RenovacionLlcRequest,
      CuentaBancariaRequest,
      Member,
      BankAccountOwner,
      BankAccountValidator,
      User,
      Client,
    ]),
    PaymentsModule,
    CommonModule,
    AuthModule,
  ],
  controllers: [WizardController],
  providers: [WizardService],
  exports: [WizardService],
})
export class WizardModule {}
