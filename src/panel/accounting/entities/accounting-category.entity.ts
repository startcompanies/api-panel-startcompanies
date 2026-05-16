import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('accounting_categories')
export class AccountingCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 12 })
  side: 'income' | 'expense';
}

