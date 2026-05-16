import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('pl_snapshots')
export class PlSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'from_date', type: 'date' })
  fromDate: string;

  @Column({ name: 'to_date', type: 'date' })
  toDate: string;

  @Column({ name: 'income_total', type: 'decimal', precision: 12, scale: 2, default: 0 })
  incomeTotal: number;

  @Column({ name: 'expense_total', type: 'decimal', precision: 12, scale: 2, default: 0 })
  expenseTotal: number;

  @Column({ name: 'net_total', type: 'decimal', precision: 12, scale: 2, default: 0 })
  netTotal: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}

