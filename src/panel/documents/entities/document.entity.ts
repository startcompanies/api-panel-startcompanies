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
import { User } from '../../../shared/user/entities/user.entity';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Request, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: Request;

  @Column({ name: 'request_id' })
  requestId: number;

  @Column({ name: 'field_name', length: 100 })
  fieldName: string;

  @Column({ name: 'name', length: 255 })
  name: string;

  @Column({ name: 'type', length: 50 })
  type: 'certificate' | 'document' | 'form' | 'other';

  @Column({ name: 'zoho_workdrive_file_id', length: 255 })
  zohoWorkdriveFileId: string;

  @Column({ name: 'zoho_workdrive_url', type: 'text' })
  zohoWorkdriveUrl: string;

  @Column({ name: 'size', type: 'bigint' })
  size: number;

  @Column({ name: 'mime_type', nullable: true, length: 100 })
  mimeType?: string;

  @Column({ name: 'description', nullable: true, type: 'text' })
  description?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by' })
  uploadedBy: User;

  @Column({ name: 'uploaded_by' })
  uploadedById: number;

  @Column({ name: 'uploaded_at', type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  uploadedAt: Date;

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

