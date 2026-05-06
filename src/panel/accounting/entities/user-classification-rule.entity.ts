import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('user_classification_rules')
export class UserClassificationRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'owner_user_id', type: 'int' })
  ownerUserId: number;

  @Column({ name: 'payee_key', type: 'varchar', length: 255 })
  payeeKey: string;

  @Column({ name: 'account_code', type: 'varchar', length: 64 })
  accountCode: string;

  @Column({ name: 'source_filter', type: 'varchar', length: 64, nullable: true })
  sourceFilter: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_from_tx_id', type: 'int', nullable: true })
  createdFromTxId: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
