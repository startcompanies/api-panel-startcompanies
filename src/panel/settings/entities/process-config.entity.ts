import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('process_config')
export class ProcessConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'auto_advance_steps', default: false, type: 'boolean' })
  autoAdvanceSteps: boolean;

  @Column({ name: 'require_approval', default: true, type: 'boolean' })
  requireApproval: boolean;

  @Column({ name: 'default_assignee', nullable: true, length: 255 })
  defaultAssignee?: string;

  @Column({ name: 'notification_delay', default: 24, type: 'int' })
  notificationDelay: number;

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

