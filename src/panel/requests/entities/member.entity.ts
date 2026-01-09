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

@Entity('members')
export class Member {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Request, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: Request;

  @Column({ name: 'request_id' })
  requestId: number;

  @Column({ name: 'first_name', length: 255 })
  firstName: string;

  @Column({ name: 'last_name', length: 255 })
  lastName: string;

  @Column({ name: 'passport_number', length: 100 })
  passportNumber: string;

  @Column({ name: 'nationality', length: 100 })
  nationality: string;

  @Column({ name: 'scanned_passport_url', nullable: true, type: 'text' })
  scannedPassportUrl?: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({ name: 'email', length: 255 })
  email: string;

  @Column({ name: 'phone_number', length: 50 })
  phoneNumber: string;

  @Column({ name: 'member_address', type: 'jsonb' })
  memberAddress: {
    street: string;
    unit?: string;
    city: string;
    stateRegion: string;
    postalCode: string;
    country: string;
  };

  @Column({ name: 'percentage_of_participation', type: 'decimal', precision: 5, scale: 2 })
  percentageOfParticipation: number;

  @Column({ name: 'validates_bank_account', default: false, type: 'boolean' })
  validatesBankAccount: boolean;

  @Column({ name: 'additional_bank_docs_url', nullable: true, type: 'text' })
  additionalBankDocsUrl?: string;

  // Campos adicionales para Renovación LLC
  @Column({ name: 'ssn_or_itin', nullable: true, length: 50 })
  ssnOrItin?: string;

  @Column({ name: 'national_tax_id', nullable: true, length: 100 })
  nationalTaxId?: string;

  @Column({ name: 'tax_filing_country', nullable: true, length: 100 })
  taxFilingCountry?: string;

  @Column({ name: 'owner_contributions', nullable: true, type: 'decimal', precision: 12, scale: 2 })
  ownerContributions?: number;

  @Column({ name: 'owner_loans_to_llc', nullable: true, type: 'decimal', precision: 12, scale: 2 })
  ownerLoansToLLC?: number;

  @Column({ name: 'loans_reimbursed_by_llc', nullable: true, type: 'decimal', precision: 12, scale: 2 })
  loansReimbursedByLLC?: number;

  @Column({ name: 'profit_distributions', nullable: true, type: 'decimal', precision: 12, scale: 2 })
  profitDistributions?: number;

  @Column({ name: 'spent_more_than_31_days_in_us', nullable: true, length: 50 })
  spentMoreThan31DaysInUS?: string;

  @Column({ name: 'has_us_financial_investments', nullable: true, length: 50 })
  hasUSFinancialInvestments?: string;

  @Column({ name: 'is_us_citizen', nullable: true, length: 50 })
  isUSCitizen?: string;

  // Campos adicionales para Cuenta Bancaria (desde BankAccountOwner)
  @Column({ name: 'paternal_last_name', nullable: true, length: 255 })
  paternalLastName?: string;

  @Column({ name: 'maternal_last_name', nullable: true, length: 255 })
  maternalLastName?: string;

  @Column({ name: 'passport_or_national_id', nullable: true, length: 100 })
  passportOrNationalId?: string;

  @Column({ name: 'identity_document_url', nullable: true, type: 'text' })
  identityDocumentUrl?: string;

  @Column({ name: 'facial_photograph_url', nullable: true, type: 'text' })
  facialPhotographUrl?: string;

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

