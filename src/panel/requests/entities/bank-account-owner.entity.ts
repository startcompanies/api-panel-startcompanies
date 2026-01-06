import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Request } from './request.entity';

@Entity('bank_account_owners')
export class BankAccountOwner {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Request, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: Request;

  @Column({ name: 'request_id' })
  requestId: number;

  @Column({ name: 'first_name', length: 255 })
  firstName: string;

  @Column({ name: 'paternal_last_name', length: 255 })
  paternalLastName: string;

  @Column({ name: 'maternal_last_name', length: 255 })
  maternalLastName: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({ name: 'nationality', length: 100 })
  nationality: string;

  @Column({ name: 'passport_or_national_id', length: 100 })
  passportOrNationalId: string;

  @Column({ name: 'identity_document_url', type: 'text' })
  identityDocumentUrl: string;

  @Column({ name: 'facial_photograph_url', type: 'text' })
  facialPhotographUrl: string;

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

