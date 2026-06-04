import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('plaid_webhook_events')
export class PlaidWebhookEvent {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ name: 'item_id', type: 'varchar', length: 64, nullable: true })
  itemId: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}
