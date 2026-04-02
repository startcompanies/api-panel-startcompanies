import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('login_otp_challenges')
export class LoginOtpChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: number;

  @Column({ length: 64 })
  codeHash: string;

  @Column({ default: false })
  rememberMe: boolean;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ default: 0 })
  attemptCount: number;

  @Column({ default: 0 })
  resendCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
