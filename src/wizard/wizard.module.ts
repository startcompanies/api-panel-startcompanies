import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Request } from '../panel/requests/entities/request.entity';
import { AperturaLlcRequest } from '../panel/requests/entities/apertura-llc-request.entity';
import { RenovacionLlcRequest } from '../panel/requests/entities/renovacion-llc-request.entity';
import { CuentaBancariaRequest } from '../panel/requests/entities/cuenta-bancaria-request.entity';
import { Member } from '../panel/requests/entities/member.entity';
// BankAccountOwner y BankAccountValidator ya no se usan - consolidados en Member y CuentaBancariaRequest
import { User } from '../shared/user/entities/user.entity';
import { Client } from '../panel/clients/entities/client.entity';
import { WizardService } from './wizard.service';
import { WizardController } from './wizard.controller';
import { GeoController } from './geo/geo.controller';
import { GeoService } from './geo/geo.service';
import { PaymentsModule } from '../shared/payments/payments.module';
import { CommonModule } from '../shared/common/common.module';
import { AuthModule } from '../shared/auth/auth.module';

@Module({
  imports: [
    HttpModule.register({ timeout: 8000, maxRedirects: 3 }),
    TypeOrmModule.forFeature([
      Request,
      AperturaLlcRequest,
      RenovacionLlcRequest,
      CuentaBancariaRequest,
      Member,
      // BankAccountOwner y BankAccountValidator ya no se usan - consolidados en Member y CuentaBancariaRequest
      User,
      Client,
    ]),
    PaymentsModule,
    CommonModule,
    AuthModule,
  ],
  controllers: [WizardController, GeoController],
  providers: [WizardService, GeoService],
  exports: [WizardService],
})
export class WizardModule {}
