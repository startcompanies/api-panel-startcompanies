import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Request } from '../../requests/entities/request.entity';

@Entity('process_steps')
export class ProcessStep {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Request, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: Request;

  @Column({ name: 'request_id' })
  requestId: number;

  @Column({ name: 'name', length: 255 })
  name: string;

  @Column({ name: 'description', nullable: true, type: 'text' })
  description?: string;

  @Column({ name: 'status', length: 50 })
  status: 'completed' | 'current' | 'pending';

  @Column({ name: 'order_number', type: 'int' })
  orderNumber: number;

  @Column({ name: 'completed_at', nullable: true, type: 'timestamp with time zone' })
  completedAt?: Date;

  @Column({ name: 'completed_by', nullable: true, length: 255 })
  completedBy?: string;

  @Column({ name: 'assigned_to', nullable: true, length: 255 })
  assignedTo?: string;

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

