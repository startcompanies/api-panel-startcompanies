import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../../shared/user/entities/user.entity';

@Entity('user_preferences')
export class UserPreferences {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', unique: true })
  userId: number;

  @Column({ name: 'language', default: 'es', length: 10 })
  language: 'es' | 'en';

  @Column({ name: 'theme', default: 'light', length: 20 })
  theme: 'light' | 'dark' | 'auto';

  @Column({ name: 'timezone', default: 'America/Mexico_City', length: 100 })
  timezone: string;

  @Column({
    name: 'notifications',
    type: 'jsonb',
    default: () => "'{\"email\": true, \"push\": true, \"requestUpdates\": true, \"documentUploads\": true}'",
  })
  notifications: {
    email: boolean;
    push: boolean;
    requestUpdates: boolean;
    documentUploads: boolean;
  };

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

