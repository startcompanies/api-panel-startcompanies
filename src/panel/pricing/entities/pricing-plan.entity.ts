import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PricingPlanState } from './pricing-plan-state.entity';
import { PricingPlanFeature } from './pricing-plan-feature.entity';

export interface PlatformFeatures {
  invoicing: boolean;
  accounting: boolean;
  accountingAi: boolean;
  /** Sync bancaria vía Plaid Link. Si falta en JSON legacy, equivale a `accounting`. */
  accountingPlaid?: boolean;
  aiConfig: boolean;
  videos: boolean;
  guides: boolean;
}

export interface PlatformPlanConfig {
  trialMonths: number;
  monthlyPriceAfterTrial: number | null;
  features: PlatformFeatures;
}

/**
 * Plan comercializable del wizard (apertura LLC).
 * `code` es el identificador estable usado por el frontend (Entrepreneur | Elite | Premium | ...).
 */
@Entity('pricing_plans')
export class PricingPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  price: string;

  @Column({ type: 'boolean', default: false })
  recommended: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  subtitle: string | null;

  @Column({ name: 'order_index', type: 'int', default: 0 })
  orderIndex: number;

  @Column({
    name: 'member_type',
    type: 'varchar',
    length: 10,
    default: 'both',
  })
  memberType: 'single' | 'multi' | 'both';

  @Column({ name: 'platform_config', type: 'jsonb', nullable: true })
  platformConfig: PlatformPlanConfig | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @OneToMany(() => PricingPlanState, (s) => s.plan)
  states: PricingPlanState[];

  @OneToMany(() => PricingPlanFeature, (f) => f.plan)
  features: PricingPlanFeature[];
}
