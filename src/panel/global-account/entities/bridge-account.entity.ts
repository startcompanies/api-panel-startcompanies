import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BridgeAccountType = 'business' | 'individual';

@Entity('bridge_accounts')
@Index(['userId', 'accountType'], { unique: true })
export class BridgeAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'account_type', type: 'varchar', length: 20 })
  accountType: BridgeAccountType;

  @Column({ name: 'bridge_customer_id', type: 'varchar', length: 120, nullable: true })
  bridgeCustomerId: string | null;

  @Column({ name: 'bridge_kyc_link_id', type: 'varchar', length: 120, nullable: true })
  bridgeKycLinkId: string | null;

  @Column({ name: 'kyc_status', type: 'varchar', length: 40, default: 'not_started' })
  kycStatus: string;

  @Column({ name: 'tos_status', type: 'varchar', length: 40, default: 'pending' })
  tosStatus: string;

  @Column({ name: 'tos_link', type: 'text', nullable: true })
  tosLink: string | null;

  @Column({ name: 'kyc_link', type: 'text', nullable: true })
  kycLink: string | null;

  @Column({ name: 'legal_name', type: 'varchar', length: 255 })
  legalName: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64, nullable: true })
  idempotencyKey: string | null;

  @Column({ name: 'rejection_reasons', type: 'jsonb', nullable: true })
  rejectionReasons: Array<{ reason?: string; developer_reason?: string }> | null;

  @Column({ name: 'submitted_at', type: 'timestamp with time zone', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
