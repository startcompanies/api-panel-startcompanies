import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PlaidItemStatus = 'active' | 'login_required' | 'revoked' | 'error';

@Entity('plaid_items')
export class PlaidItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'owner_user_id', type: 'int' })
  ownerUserId: number;

  @Column({ name: 'bank_account_id', type: 'int' })
  bankAccountId: number;

  @Column({ name: 'plaid_item_id', type: 'varchar', length: 64, unique: true })
  plaidItemId: string;

  @Column({ name: 'access_token_ciphertext', type: 'text' })
  accessTokenCiphertext: string;

  @Column({ name: 'access_token_iv', type: 'varchar', length: 32 })
  accessTokenIv: string;

  @Column({ name: 'access_token_auth_tag', type: 'varchar', length: 32 })
  accessTokenAuthTag: string;

  @Column({ name: 'institution_id', type: 'varchar', length: 64, nullable: true })
  institutionId: string | null;

  @Column({ name: 'institution_name', type: 'varchar', length: 120, nullable: true })
  institutionName: string | null;

  @Column({ name: 'account_mask', type: 'varchar', length: 20, nullable: true })
  accountMask: string | null;

  @Column({ name: 'sync_cursor', type: 'text', nullable: true })
  syncCursor: string | null;

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status: PlaidItemStatus;

  @Column({ name: 'last_synced_at', type: 'timestamp with time zone', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ name: 'last_sync_error', type: 'text', nullable: true })
  lastSyncError: string | null;

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
