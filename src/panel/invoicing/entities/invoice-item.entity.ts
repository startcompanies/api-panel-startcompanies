import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Invoice } from './invoice.entity';

@Entity('invoice_items')
export class InvoiceItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'invoice_id', type: 'int' })
  invoiceId: number;

  @ManyToOne(() => Invoice, (inv) => inv.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ name: 'product_name', type: 'varchar', length: 220, nullable: true })
  productName: string | null;

  @Column({ name: 'description', type: 'text' })
  description: string;

  @Column({ name: 'unit_measure', type: 'varchar', length: 20, default: 'u' })
  unitMeasure: string;

  @Column({ name: 'discount_percent', type: 'decimal', precision: 6, scale: 2, default: 0 })
  discountPercent: number;

  @Column({ name: 'qty', type: 'decimal', precision: 10, scale: 2, default: 1 })
  qty: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2, default: 0 })
  unitPrice: number;

  @Column({ name: 'line_total', type: 'decimal', precision: 12, scale: 2, default: 0 })
  lineTotal: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}

