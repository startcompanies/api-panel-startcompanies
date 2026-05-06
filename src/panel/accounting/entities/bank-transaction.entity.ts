import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('bank_transactions')
export class BankTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'bank_import_id', type: 'int' })
  bankImportId: number;

  @Column({ name: 'tx_date', type: 'date' })
  txDate: string;

  @Column({ name: 'description', type: 'text' })
  description: string;

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  /** Banco detectado al importar el CSV (p. ej. Relay, Mercury). */
  @Column({ name: 'source_bank', type: 'varchar', length: 64, nullable: true })
  sourceBank: string | null;

  @Column({ name: 'fingerprint', type: 'varchar', length: 140, unique: true })
  fingerprint: string;

  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId: number | null;

  @Column({ name: 'accounting_date', type: 'date', nullable: true })
  accountingDate: string | null;

  @Column({ name: 'account_code', type: 'varchar', length: 64, nullable: true })
  accountCode: string | null;

  /** Origen de la última clasificación: exact, fuzzy, ai, manual. */
  @Column({ name: 'classification_source', type: 'varchar', length: 24, nullable: true })
  classificationSource: string | null;

  @Column({ name: 'classification_confidence', type: 'decimal', precision: 8, scale: 4, nullable: true })
  classificationConfidence: string | number | null;

  @Column({ name: 'needs_review', type: 'boolean', default: false })
  needsReview: boolean;

  /** Clave estable para reglas exactas (payee / descripción normalizada). */
  @Column({ name: 'payee_normalized', type: 'varchar', length: 255, nullable: true })
  payeeNormalized: string | null;

  @Column({ name: 'invoice_match_note', type: 'varchar', length: 255, nullable: true })
  invoiceMatchNote: string | null;

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
}

