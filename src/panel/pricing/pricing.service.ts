import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PricingPlan } from './entities/pricing-plan.entity';
import { PricingPlanState } from './entities/pricing-plan-state.entity';
import { PricingPlanFeature } from './entities/pricing-plan-feature.entity';
import { PricingRenewal } from './entities/pricing-renewal.entity';
import { PricingOverride } from './entities/pricing-override.entity';
import { PricingMisc } from './entities/pricing-misc.entity';
import {
  CreatePricingOverrideDto,
  CreatePricingPlanDto,
  PricingPlanFeatureDto,
  UpdatePricingOverrideDto,
  UpdatePricingPlanDto,
  UpsertMiscDto,
  UpsertRenewalDto,
} from './dtos/pricing.dto';
import { PlatformPlanConfig } from './entities/pricing-plan.entity';

/** Shape consumido por el frontend (wizard + admin). */
export interface PublicPricingPayloadPlan {
  id: number;
  code: string;
  label: string;
  price: number;
  recommended: boolean;
  description: string | null;
  subtitle: string | null;
  orderIndex: number;
  memberType: 'single' | 'multi' | 'both';
  platformConfig: PlatformPlanConfig | null;
  /** Estados habilitados; `['*']` significa "cualquiera". */
  states: string[];
  features: string[];
  renewalFeatures: string[];
}

export interface PublicPricingPayloadRenewal {
  state: string;
  singlePrice: number;
  multiPrice: number;
}

export interface PublicPricingPayloadOverride {
  serviceType: string;
  planCode: string | null;
  state: string | null;
  price: number;
}

export interface PublicPricingPayload {
  plans: PublicPricingPayloadPlan[];
  renewals: PublicPricingPayloadRenewal[];
  overrides: PublicPricingPayloadOverride[];
  misc: Record<string, number>;
  updatedAt: string;
}

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(PricingPlan)
    private readonly plansRepo: Repository<PricingPlan>,
    @InjectRepository(PricingPlanState)
    private readonly planStatesRepo: Repository<PricingPlanState>,
    @InjectRepository(PricingPlanFeature)
    private readonly planFeaturesRepo: Repository<PricingPlanFeature>,
    @InjectRepository(PricingRenewal)
    private readonly renewalsRepo: Repository<PricingRenewal>,
    @InjectRepository(PricingOverride)
    private readonly overridesRepo: Repository<PricingOverride>,
    @InjectRepository(PricingMisc)
    private readonly miscRepo: Repository<PricingMisc>,
    private readonly dataSource: DataSource,
  ) {}

  /* =========================================================
   *                       PÚBLICO (lectura)
   * ========================================================= */

  async getPublicPricing(): Promise<PublicPricingPayload> {
    const [plans, renewals, overrides, misc] = await Promise.all([
      this.plansRepo.find({
        where: { isActive: true },
        relations: ['states', 'features'],
        order: { orderIndex: 'ASC', id: 'ASC' },
      }),
      this.renewalsRepo.find({
        where: { isActive: true },
        order: { state: 'ASC' },
      }),
      this.overridesRepo.find({
        where: { isActive: true },
        order: { id: 'ASC' },
      }),
      this.miscRepo.find({
        where: { isActive: true },
        order: { code: 'ASC' },
      }),
    ]);

    const planPayloads: PublicPricingPayloadPlan[] = plans.map((p) => {
      const states = (p.states ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
        .map((s) => s.state);
      const features = (p.features ?? [])
        .filter((f) => f.kind !== 'renewal')
        .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
        .map((f) => f.text);
      const renewalFeatures = (p.features ?? [])
        .filter((f) => f.kind === 'renewal')
        .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
        .map((f) => f.text);
      return {
        id: p.id,
        code: p.code,
        label: p.label,
        price: this.toNumber(p.price),
        recommended: p.recommended,
        description: p.description,
        subtitle: p.subtitle,
        orderIndex: p.orderIndex,
        memberType: p.memberType ?? 'both',
        platformConfig: p.platformConfig ?? null,
        states,
        features,
        renewalFeatures,
      };
    });

    const lastUpdate = this.maxDate([
      ...plans.map((p) => p.updatedAt),
      ...renewals.map((r) => r.updatedAt),
      ...overrides.map((o) => o.updatedAt),
      ...misc.map((m) => m.updatedAt),
    ]);

    return {
      plans: planPayloads,
      renewals: renewals.map((r) => ({
        state: r.state,
        singlePrice: this.toNumber(r.singlePrice),
        multiPrice: this.toNumber(r.multiPrice),
      })),
      overrides: overrides.map((o) => ({
        serviceType: o.serviceType,
        planCode: o.planCode,
        state: o.state,
        price: this.toNumber(o.price),
      })),
      misc: Object.fromEntries(misc.map((m) => [m.code, this.toNumber(m.price)])),
      updatedAt: (lastUpdate ?? new Date()).toISOString(),
    };
  }

  /**
   * Punto único para calcular el monto a cobrar en checkout (apertura LLC).
   * Aplica override si existe (serviceType + planCode + state), si no usa precio base del plan.
   */
  async calculateAperturaOpeningAmountUsd(
    serviceType: string,
    planCode: string | null | undefined,
    state: string | null | undefined,
  ): Promise<number> {
    if (planCode) {
      const override = await this.overridesRepo.findOne({
        where: {
          isActive: true,
          serviceType,
          planCode,
          state: state ?? IsNull(),
        },
      });
      if (override) return this.toNumber(override.price);
    }
    if (!planCode) return 0;
    const plan = await this.plansRepo.findOne({
      where: { isActive: true, code: planCode },
    });
    return plan ? this.toNumber(plan.price) : 0;
  }

  async calculateRenewalAmountUsd(
    state: string,
    llcType: 'single' | 'multi',
  ): Promise<number | null> {
    const row = await this.renewalsRepo.findOne({
      where: { isActive: true, state },
    });
    if (!row) return null;
    return this.toNumber(llcType === 'multi' ? row.multiPrice : row.singlePrice);
  }

  async getMiscPriceUsd(code: string): Promise<number | null> {
    const row = await this.miscRepo.findOne({ where: { isActive: true, code } });
    return row ? this.toNumber(row.price) : null;
  }

  /* =========================================================
   *                          ADMIN
   * ========================================================= */

  /* ---------------- Planes ---------------- */

  async listPlansAdmin() {
    const plans = await this.plansRepo.find({
      relations: ['states', 'features'],
      order: { orderIndex: 'ASC', id: 'ASC' },
    });
    return plans.map((p) => this.toAdminPlanPayload(p));
  }

  async getPlanAdmin(id: number) {
    const plan = await this.plansRepo.findOne({
      where: { id },
      relations: ['states', 'features'],
    });
    if (!plan) throw new NotFoundException(`Plan ${id} no encontrado`);
    return this.toAdminPlanPayload(plan);
  }

  /**
   * Acceso interno cuando se necesita la entidad cruda (con relaciones cargadas)
   * para realizar updates parciales.
   */
  private async loadPlanEntity(id: number): Promise<PricingPlan> {
    const plan = await this.plansRepo.findOne({
      where: { id },
      relations: ['states', 'features'],
    });
    if (!plan) throw new NotFoundException(`Plan ${id} no encontrado`);
    return plan;
  }

  /** Aplana la entidad para el frontend: `states: string[]`, `features: string[]`, etc. */
  private toAdminPlanPayload(p: PricingPlan) {
    const states = (p.states ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
      .map((s) => s.state);
    const features = (p.features ?? [])
      .filter((f) => f.kind !== 'renewal')
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
      .map((f) => f.text);
    const renewalFeatures = (p.features ?? [])
      .filter((f) => f.kind === 'renewal')
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
      .map((f) => f.text);
    return {
      id: p.id,
      code: p.code,
      label: p.label,
      price: this.toNumber(p.price),
      recommended: p.recommended,
      description: p.description,
      subtitle: p.subtitle,
      orderIndex: p.orderIndex,
      memberType: p.memberType ?? 'both',
      platformConfig: p.platformConfig ?? null,
      states,
      features,
      renewalFeatures,
      isActive: p.isActive,
      updatedBy: p.updatedBy,
      updatedAt: p.updatedAt,
    };
  }

  async createPlan(dto: CreatePricingPlanDto, userId: number) {
    const exists = await this.plansRepo.findOne({ where: { code: dto.code } });
    if (exists) throw new BadRequestException(`Ya existe un plan con code ${dto.code}`);

    return this.dataSource.transaction(async (mgr) => {
      const plan = await mgr.getRepository(PricingPlan).save(
        mgr.getRepository(PricingPlan).create({
          code: dto.code,
          label: dto.label,
          price: this.toMoneyString(dto.price),
          recommended: dto.recommended ?? false,
          description: dto.description ?? null,
          subtitle: dto.subtitle ?? null,
          orderIndex: dto.orderIndex ?? 0,
          isActive: true,
          updatedBy: userId,
        }),
      );

      if (dto.states?.length) {
        await this.persistPlanStates(mgr, plan.id, dto.states);
      }
      if (dto.features?.length) {
        await this.persistPlanFeatures(mgr, plan.id, dto.features);
      }
      return this.getPlanAdmin(plan.id);
    });
  }

  async updatePlan(id: number, dto: UpdatePricingPlanDto, userId: number) {
    const plan = await this.loadPlanEntity(id);
    return this.dataSource.transaction(async (mgr) => {
      const repo = mgr.getRepository(PricingPlan);
      const merged = repo.merge(plan, {
        label: dto.label ?? plan.label,
        price: dto.price != null ? this.toMoneyString(dto.price) : plan.price,
        recommended: dto.recommended ?? plan.recommended,
        description: dto.description !== undefined ? dto.description : plan.description,
        subtitle: dto.subtitle !== undefined ? dto.subtitle : plan.subtitle,
        orderIndex: dto.orderIndex ?? plan.orderIndex,
        isActive: dto.isActive ?? plan.isActive,
        memberType: dto.memberType ?? plan.memberType,
        platformConfig: dto.platformConfig !== undefined ? dto.platformConfig : plan.platformConfig,
        updatedBy: userId,
      });
      await repo.save(merged);

      if (dto.states) await this.persistPlanStates(mgr, id, dto.states);
      if (dto.features) await this.persistPlanFeatures(mgr, id, dto.features);
      return this.getPlanAdmin(id);
    });
  }

  /** Soft delete: marca isActive=false; preserva historial referenciado. */
  async deactivatePlan(id: number, userId: number) {
    const plan = await this.loadPlanEntity(id);
    plan.isActive = false;
    plan.updatedBy = userId;
    await this.plansRepo.save(plan);
    return { id, isActive: false };
  }

  async restorePlan(id: number, userId: number) {
    const plan = await this.loadPlanEntity(id);
    plan.isActive = true;
    plan.updatedBy = userId;
    await this.plansRepo.save(plan);
    return { id, isActive: true };
  }

  /* ---------------- Renovaciones ---------------- */

  listRenewalsAdmin() {
    return this.renewalsRepo.find({ order: { state: 'ASC' } });
  }

  async upsertRenewal(dto: UpsertRenewalDto, userId: number) {
    const existing = await this.renewalsRepo.findOne({ where: { state: dto.state } });
    const row =
      existing ??
      this.renewalsRepo.create({
        state: dto.state,
        singlePrice: this.toMoneyString(dto.singlePrice),
        multiPrice: this.toMoneyString(dto.multiPrice),
      });
    row.singlePrice = this.toMoneyString(dto.singlePrice);
    row.multiPrice = this.toMoneyString(dto.multiPrice);
    row.isActive = dto.isActive ?? row.isActive ?? true;
    row.updatedBy = userId;
    return this.renewalsRepo.save(row);
  }

  async deactivateRenewal(id: number, userId: number) {
    const row = await this.renewalsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Renovación ${id} no encontrada`);
    row.isActive = false;
    row.updatedBy = userId;
    return this.renewalsRepo.save(row);
  }

  /* ---------------- Overrides ---------------- */

  listOverridesAdmin() {
    return this.overridesRepo.find({ order: { serviceType: 'ASC', id: 'ASC' } });
  }

  async createOverride(dto: CreatePricingOverrideDto, userId: number) {
    const row = this.overridesRepo.create({
      serviceType: dto.serviceType,
      planCode: dto.planCode ?? null,
      state: dto.state ?? null,
      price: this.toMoneyString(dto.price),
      isActive: dto.isActive ?? true,
      updatedBy: userId,
    });
    return this.overridesRepo.save(row);
  }

  async updateOverride(id: number, dto: UpdatePricingOverrideDto, userId: number) {
    const row = await this.overridesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Override ${id} no encontrado`);
    if (dto.serviceType !== undefined) row.serviceType = dto.serviceType;
    if (dto.planCode !== undefined) row.planCode = dto.planCode;
    if (dto.state !== undefined) row.state = dto.state;
    if (dto.price !== undefined) row.price = this.toMoneyString(dto.price);
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    row.updatedBy = userId;
    return this.overridesRepo.save(row);
  }

  async deactivateOverride(id: number, userId: number) {
    const row = await this.overridesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Override ${id} no encontrado`);
    row.isActive = false;
    row.updatedBy = userId;
    return this.overridesRepo.save(row);
  }

  /* ---------------- Misc ---------------- */

  listMiscAdmin() {
    return this.miscRepo.find({ order: { code: 'ASC' } });
  }

  async upsertMisc(dto: UpsertMiscDto, userId: number) {
    const existing = await this.miscRepo.findOne({ where: { code: dto.code } });
    const row =
      existing ?? this.miscRepo.create({ code: dto.code, label: dto.label, price: '0' });
    row.label = dto.label;
    row.price = this.toMoneyString(dto.price);
    row.isActive = dto.isActive ?? row.isActive ?? true;
    row.updatedBy = userId;
    return this.miscRepo.save(row);
  }

  /* =========================================================
   *                       Helpers
   * ========================================================= */

  private async persistPlanStates(
    mgr: import('typeorm').EntityManager,
    planId: number,
    states: string[],
  ) {
    const repo = mgr.getRepository(PricingPlanState);
    await repo.delete({ planId });
    if (!states.length) return;
    const unique = Array.from(new Set(states.map((s) => s.trim()).filter(Boolean)));
    const rows = unique.map((state, i) =>
      repo.create({ planId, state, orderIndex: i + 1 }),
    );
    await repo.save(rows);
  }

  private async persistPlanFeatures(
    mgr: import('typeorm').EntityManager,
    planId: number,
    features: PricingPlanFeatureDto[],
  ) {
    const repo = mgr.getRepository(PricingPlanFeature);
    await repo.delete({ planId });
    if (!features.length) return;
    const rows = features
      .filter((f) => f.text && f.text.trim().length > 0)
      .map((f, i) =>
        repo.create({
          planId,
          text: f.text.trim(),
          kind: f.kind ?? 'feature',
          orderIndex: f.orderIndex ?? i + 1,
        }),
      );
    if (rows.length) await repo.save(rows);
  }

  private toNumber(v: string | number | null | undefined): number {
    if (v == null) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  private toMoneyString(v: number): string {
    if (!Number.isFinite(v) || v < 0) {
      throw new BadRequestException('Precio inválido');
    }
    return v.toFixed(2);
  }

  private maxDate(dates: (Date | null | undefined)[]): Date | null {
    let max: Date | null = null;
    for (const d of dates) {
      if (!d) continue;
      if (!max || d.getTime() > max.getTime()) max = d;
    }
    return max;
  }
}
