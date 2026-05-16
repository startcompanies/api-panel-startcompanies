import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InvoiceItem } from './invoice-item.entity';

export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'client_id', type: 'int', nullable: true })
  clientId: number | null;

  /** Usuario panel (cliente) dueño de la factura */
  @Column({ name: 'owner_user_id', type: 'int', nullable: true })
  ownerUserId: number | null;

  @Column({ name: 'issued_by_user_id', type: 'int', nullable: true })
  issuedByUserId: number | null;

  @Column({ name: 'invoice_number', type: 'varchar', length: 40, nullable: true })
  invoiceNumber: string | null;

  @Column({ name: 'bill_to', type: 'jsonb', nullable: true })
  billTo: Record<string, unknown> | null;

  @Column({ name: 'payment_instructions', type: 'jsonb', nullable: true })
  paymentInstructions: Record<string, unknown> | null;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 6, scale: 4, default: 0 })
  taxRate: number;

  @Column({ name: 'tax_label', type: 'varchar', length: 120, nullable: true })
  taxLabel: string | null;

  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issueDate: string | null;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status: InvoiceStatus;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ name: 'subtotal_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotalAmount: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ name: 'sent_at', type: 'timestamp with time zone', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'pdf_url', type: 'text', nullable: true })
  pdfUrl: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @OneToMany(() => InvoiceItem, (item) => item.invoice, { cascade: true })
  items: InvoiceItem[];
}

