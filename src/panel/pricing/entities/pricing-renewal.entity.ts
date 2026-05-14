import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Precio de renovación LLC por estado + tipo (single / multi).
 */
@Entity('pricing_renewals')
export class PricingRenewal {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 60 })
  state: string;

  @Column({ name: 'single_price', type: 'numeric', precision: 10, scale: 2 })
  singlePrice: string;

  @Column({ name: 'multi_price', type: 'numeric', precision: 10, scale: 2 })
  multiPrice: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
