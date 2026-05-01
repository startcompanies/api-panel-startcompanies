import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../../shared/user/entities/user.entity';

export type AiProvider = 'anthropic' | 'openai';

@Entity('user_ai_credentials')
export class UserAiCredential {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', unique: true })
  userId: number;

  @Column({ type: 'varchar', length: 20 })
  provider: AiProvider;

  @Column({ name: 'key_ciphertext', type: 'text' })
  keyCiphertext: string;

  @Column({ name: 'key_iv', type: 'varchar', length: 64 })
  keyIv: string;

  @Column({ name: 'key_auth_tag', type: 'varchar', length: 64 })
  keyAuthTag: string;

  @Column({ name: 'key_last4', type: 'varchar', length: 4, nullable: true })
  keyLast4: string | null;

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
