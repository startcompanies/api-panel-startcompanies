import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('invoice_payments')
export class InvoicePayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'invoice_id', type: 'int' })
  invoiceId: number;

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column({ name: 'paid_at', type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  paidAt: Date;

  @Column({ name: 'method', type: 'varchar', length: 60, nullable: true })
  method: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}

