import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('bridge_webhook_events')
export class BridgeWebhookEvent {
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 120 })
  eventId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 80 })
  eventType: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'processed_at', type: 'timestamp with time zone' })
  processedAt: Date;
}
