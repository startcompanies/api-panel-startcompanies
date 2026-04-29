import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('bank_imports')
export class BankImport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'bank_account_id', type: 'int' })
  bankAccountId: number;

  @Column({ name: 'file_name', type: 'varchar', length: 220 })
  fileName: string;

  @Column({ name: 'rows_count', type: 'int', default: 0 })
  rowsCount: number;

  @Column({ name: 'imported_by_user_id', type: 'int' })
  importedByUserId: number;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}

