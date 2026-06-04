import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('plaid_connect_reminders')
export class PlaidConnectReminder {
  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({
    name: 'sent_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  sentAt: Date;
}
