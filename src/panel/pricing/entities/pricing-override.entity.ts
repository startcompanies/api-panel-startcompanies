import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Override puntual de precio para una combinación (servicio, plan, estado).
 * Ejemplo inicial: apertura-llc + Elite + Texas → USD 750.
 *
 * Reglas:
 *  - `service_type` siempre presente (apertura-llc | renovacion-llc | cuenta-bancaria | ...).
 *  - `plan_code` y `state` opcionales; null = comodín ("aplica a cualquiera").
 *  - Para evitar ambigüedades el lookup en backend filtra por igualdad estricta.
 */
@Entity('pricing_overrides')
@Index('uq_pricing_overrides', ['serviceType', 'planCode', 'state'], { unique: true })
export class PricingOverride {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'service_type', type: 'varchar', length: 40 })
  serviceType: string;

  @Column({ name: 'plan_code', type: 'varchar', length: 40, nullable: true })
  planCode: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  state: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  price: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
