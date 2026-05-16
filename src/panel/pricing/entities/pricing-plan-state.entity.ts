import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PricingPlan } from './pricing-plan.entity';

/**
 * Estados habilitados para un plan. Usar `state = '*'` para indicar "cualquier estado".
 */
@Entity('pricing_plan_states')
@Index('uq_pricing_plan_states', ['planId', 'state'], { unique: true })
export class PricingPlanState {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  @Column({ type: 'varchar', length: 60 })
  state: string;

  @Column({ name: 'order_index', type: 'int', default: 0 })
  orderIndex: number;

  @ManyToOne(() => PricingPlan, (p) => p.states, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: PricingPlan;
}
