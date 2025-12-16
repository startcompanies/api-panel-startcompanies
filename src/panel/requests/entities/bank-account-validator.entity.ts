import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Request } from './request.entity';

@Entity('bank_account_validators')
export class BankAccountValidator {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'request_id', unique: true, type: 'int' })
  requestId: number;

  @OneToOne(() => Request, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: Request;

  @Column({ name: 'first_name', length: 255 })
  firstName: string;

  @Column({ name: 'last_name', length: 255 })
  lastName: string;

  @Column({ name: 'date_of_birth', type: 'date' })
  dateOfBirth: Date;

  @Column({ name: 'nationality', length: 100 })
  nationality: string;

  @Column({ name: 'citizenship', length: 100 })
  citizenship: string;

  @Column({ name: 'passport_number', length: 100 })
  passportNumber: string;

  @Column({ name: 'scanned_passport_url', type: 'text' })
  scannedPassportUrl: string;

  @Column({ name: 'work_email', length: 255 })
  workEmail: string;

  @Column({ name: 'use_email_for_relay_login', default: false, type: 'boolean' })
  useEmailForRelayLogin: boolean;

  @Column({ name: 'phone', length: 50 })
  phone: string;

  @Column({ name: 'can_receive_sms', default: false, type: 'boolean' })
  canReceiveSMS: boolean;

  @Column({ name: 'is_us_resident', type: 'boolean' })
  isUSResident: boolean;

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

