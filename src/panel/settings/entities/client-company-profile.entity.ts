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

@Entity('client_company_profiles')
export class ClientCompanyProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int', unique: true })
  userId: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'legal_name', type: 'varchar', length: 240, nullable: true })
  legalName: string | null;

  @Column({ name: 'ein', type: 'varchar', length: 20, nullable: true })
  ein: string | null;

  @Column({ name: 'address', type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'billing_email', type: 'varchar', length: 180, nullable: true })
  billingEmail: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ name: 'bank_name', type: 'varchar', length: 160, nullable: true })
  bankName: string | null;

  @Column({ name: 'account_number', type: 'varchar', length: 64, nullable: true })
  accountNumber: string | null;

  @Column({ name: 'routing_ach', type: 'varchar', length: 20, nullable: true })
  routingAch: string | null;

  @Column({ name: 'swift', type: 'varchar', length: 20, nullable: true })
  swift: string | null;

  @Column({ name: 'iban', type: 'varchar', length: 48, nullable: true })
  iban: string | null;

  @Column({ name: 'zelle_or_paypal', type: 'varchar', length: 180, nullable: true })
  zelleOrPaypal: string | null;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string | null;

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
