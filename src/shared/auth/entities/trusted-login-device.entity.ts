import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('trusted_login_devices')
export class TrustedLoginDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: number;

  /** SHA-256 del secreto en binario (64 hex). */
  @Column({ type: 'varchar', length: 64 })
  secretHash: string;

  @Column({ type: 'varchar', length: 64 })
  userAgentHash: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipHash: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
