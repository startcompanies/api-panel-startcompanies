import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PricingPlan } from './pricing-plan.entity';

/**
 * Features mostradas en el detalle del plan.
 * `kind`:
 *  - 'feature' (default): se muestran en la grilla del wizard como bullets del plan.
 *  - 'renewal': bullets adicionales que aplican a renovación automática (p. ej. Pack Premium).
 */
@Entity('pricing_plan_features')
export class PricingPlanFeature {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'varchar', length: 20, default: 'feature' })
  kind: 'feature' | 'renewal' | string;

  @Column({ name: 'order_index', type: 'int', default: 0 })
  orderIndex: number;

  @ManyToOne(() => PricingPlan, (p) => p.features, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: PricingPlan;
}
