import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PricingPlan } from './entities/pricing-plan.entity';
import { PricingPlanState } from './entities/pricing-plan-state.entity';
import { PricingPlanFeature } from './entities/pricing-plan-feature.entity';
import { PricingRenewal } from './entities/pricing-renewal.entity';
import { PricingOverride } from './entities/pricing-override.entity';
import { PricingMisc } from './entities/pricing-misc.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PricingPlan,
      PricingPlanState,
      PricingPlanFeature,
      PricingRenewal,
      PricingOverride,
      PricingMisc,
    ]),
  ],
  controllers: [PricingController],
  providers: [PricingService, RolesGuard],
  exports: [PricingService],
})
export class PricingModule {}
