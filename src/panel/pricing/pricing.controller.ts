import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { Public } from '../../shared/auth/public.decorator';
import { PricingService } from './pricing.service';
import {
  CreatePricingOverrideDto,
  CreatePricingPlanDto,
  UpdatePricingOverrideDto,
  UpdatePricingPlanDto,
  UpsertMiscDto,
  UpsertRenewalDto,
} from './dtos/pricing.dto';

@ApiTags('Panel - Pricing')
@Controller('panel/pricing')
@UseGuards(AuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  /* ----------- PÚBLICO (cualquier sesión autenticada) ----------- */

  /** Lectura agregada usada por el wizard y la app del panel. Sin autenticación requerida. */
  @Get('public')
  @Public()
  public() {
    return this.pricingService.getPublicPricing();
  }

  /* ------------------------ PLANES (admin) ----------------------- */

  @Get('plans')
  @Roles('admin')
  listPlans() {
    return this.pricingService.listPlansAdmin();
  }

  @Get('plans/:id')
  @Roles('admin')
  getPlan(@Param('id', ParseIntPipe) id: number) {
    return this.pricingService.getPlanAdmin(id);
  }

  @Post('plans')
  @Roles('admin')
  createPlan(
    @Req() req: { user: { id: number } },
    @Body() body: CreatePricingPlanDto,
  ) {
    return this.pricingService.createPlan(body, req.user.id);
  }

  @Patch('plans/:id')
  @Roles('admin')
  updatePlan(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePricingPlanDto,
  ) {
    return this.pricingService.updatePlan(id, body, req.user.id);
  }

  @Delete('plans/:id')
  @Roles('admin')
  deactivatePlan(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.pricingService.deactivatePlan(id, req.user.id);
  }

  @Post('plans/:id/restore')
  @Roles('admin')
  restorePlan(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.pricingService.restorePlan(id, req.user.id);
  }

  /* ---------------------- RENOVACIONES (admin) -------------------- */

  @Get('renewals')
  @Roles('admin')
  listRenewals() {
    return this.pricingService.listRenewalsAdmin();
  }

  @Post('renewals')
  @Roles('admin')
  upsertRenewal(
    @Req() req: { user: { id: number } },
    @Body() body: UpsertRenewalDto,
  ) {
    return this.pricingService.upsertRenewal(body, req.user.id);
  }

  @Delete('renewals/:id')
  @Roles('admin')
  deactivateRenewal(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.pricingService.deactivateRenewal(id, req.user.id);
  }

  /* ----------------------- OVERRIDES (admin) ---------------------- */

  @Get('overrides')
  @Roles('admin')
  listOverrides() {
    return this.pricingService.listOverridesAdmin();
  }

  @Post('overrides')
  @Roles('admin')
  createOverride(
    @Req() req: { user: { id: number } },
    @Body() body: CreatePricingOverrideDto,
  ) {
    return this.pricingService.createOverride(body, req.user.id);
  }

  @Patch('overrides/:id')
  @Roles('admin')
  updateOverride(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePricingOverrideDto,
  ) {
    return this.pricingService.updateOverride(id, body, req.user.id);
  }

  @Delete('overrides/:id')
  @Roles('admin')
  deactivateOverride(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.pricingService.deactivateOverride(id, req.user.id);
  }

  /* -------------------------- MISC (admin) ------------------------ */

  @Get('misc')
  @Roles('admin')
  listMisc() {
    return this.pricingService.listMiscAdmin();
  }

  @Post('misc')
  @Roles('admin')
  upsertMisc(
    @Req() req: { user: { id: number } },
    @Body() body: UpsertMiscDto,
  ) {
    return this.pricingService.upsertMisc(body, req.user.id);
  }
}
