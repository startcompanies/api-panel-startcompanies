import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Request } from './entities/request.entity';
import { AperturaLlcRequest } from './entities/apertura-llc-request.entity';
import { RenovacionLlcRequest } from './entities/renovacion-llc-request.entity';
import { CuentaBancariaRequest } from './entities/cuenta-bancaria-request.entity';
import { Member } from './entities/member.entity';
import { BankAccountValidator } from './entities/bank-account-validator.entity';
import { BankAccountOwner } from './entities/bank-account-owner.entity';
import { RequestRequiredDocument } from './entities/request-required-document.entity';
import { User } from '../../shared/user/entities/user.entity';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { MembersController } from './members.controller';
import { OwnersController } from './owners.controller';
import { BankAccountValidatorController } from './bank-account-validator.controller';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { ZohoConfigModule } from '../../zoho-config/zoho-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Request,
      AperturaLlcRequest,
      RenovacionLlcRequest,
      CuentaBancariaRequest,
      Member,
      BankAccountValidator,
      BankAccountOwner,
      RequestRequiredDocument,
      User,
    ]),
    ZohoConfigModule,
  ],
  controllers: [
    RequestsController,
    MembersController,
    OwnersController,
    BankAccountValidatorController,
  ],
  providers: [RequestsService, RolesGuard],
  exports: [RequestsService],
})
export class RequestsModule {}

