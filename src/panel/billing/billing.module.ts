import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsModule } from '../../shared/payments/payments.module';
import { User } from '../../shared/user/entities/user.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeWebhookEvent } from './entities/stripe-webhook-event.entity';
import { PricingPlan } from '../pricing/entities/pricing-plan.entity';
import { AccountTeamModule } from '../account-team/account-team.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, StripeWebhookEvent, PricingPlan]),
    PaymentsModule,
    AccountTeamModule,
  ],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}

