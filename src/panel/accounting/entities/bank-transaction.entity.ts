import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

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

  @Column({ name: 'fingerprint', type: 'varchar', length: 140, unique: true })
  fingerprint: string;

  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId: number | null;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}

