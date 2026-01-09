import {
  Entity,
  PrimaryColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Request } from './request.entity';

@Entity('cuenta_bancaria_requests')
export class CuentaBancariaRequest {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @OneToOne(() => Request, (request) => request.cuentaBancariaRequest)
  @JoinColumn({ name: 'request_id' })
  request: Request;

  @Column({ name: 'current_step_number', type: 'int' })
  currentStepNumber: number;

  // Paso 1: Información del Solicitante
  @Column({ name: 'applicant_email', nullable: true, length: 255 })
  applicantEmail?: string;

  @Column({ name: 'applicant_first_name', nullable: true, length: 255 })
  applicantFirstName?: string;

  @Column({ name: 'applicant_paternal_last_name', nullable: true, length: 255 })
  applicantPaternalLastName?: string;

  @Column({ name: 'applicant_maternal_last_name', nullable: true, length: 255 })
  applicantMaternalLastName?: string;

  @Column({ name: 'applicant_phone', nullable: true, length: 50 })
  applicantPhone?: string;

  @Column({ name: 'account_type', nullable: true, length: 50 })
  accountType?: string;

  @Column({ name: 'business_type', nullable: true, length: 255 })
  businessType?: string;

  @Column({ name: 'legal_business_identifier', nullable: true, length: 255 })
  legalBusinessIdentifier?: string;

  @Column({ name: 'industry', nullable: true, length: 255 })
  industry?: string;

  @Column({ name: 'number_of_employees', nullable: true, length: 50 })
  numberOfEmployees?: string;

  @Column({ name: 'website_or_social_media', nullable: true, length: 255 })
  websiteOrSocialMedia?: string;

  @Column({ name: 'economic_activity', nullable: true, type: 'text' })
  economicActivity?: string;

  @Column({ name: 'ein', nullable: true, length: 50 })
  ein?: string;

  @Column({ name: 'ein_letter_url', nullable: true, type: 'text' })
  einLetterUrl?: string;

  @Column({ name: 'certificate_of_constitution_or_articles_url', nullable: true, type: 'text' })
  certificateOfConstitutionOrArticlesUrl?: string;

  @Column({ name: 'operating_agreement_url', nullable: true, type: 'text' })
  operatingAgreementUrl?: string;

  // Paso 2: Dirección del Registro
  @Column({ name: 'company_address', nullable: true, type: 'jsonb' })
  companyAddress?: {
    street: string;
    unit?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };

  @Column({ name: 'is_registered_agent_in_usa', nullable: true, type: 'boolean' })
  isRegisteredAgentInUSA?: boolean;

  @Column({ name: 'registered_agent_name', nullable: true, length: 255 })
  registeredAgentName?: string;

  @Column({ name: 'registered_agent_address', nullable: true, type: 'text' })
  registeredAgentAddress?: string;

  @Column({ name: 'registered_agent_state', nullable: true, length: 255 })
  registeredAgentState?: string;

  @Column({ name: 'incorporation_state', nullable: true, length: 255 })
  incorporationState?: string;

  @Column({ name: 'incorporation_month_year', nullable: true, length: 50 })
  incorporationMonthYear?: string;

  @Column({ name: 'countries_where_business', nullable: true, type: 'text' })
  countriesWhereBusiness?: string;

  // Paso 3: Información de la cuenta bancaria
  @Column({ name: 'bank_name', nullable: true, length: 255 })
  bankName?: string;

  @Column({ name: 'swift_bic_aba', nullable: true, length: 50 })
  swiftBicAba?: string;

  @Column({ name: 'account_number', nullable: true, length: 100 })
  accountNumber?: string;

  @Column({ name: 'bank_account_type', nullable: true, length: 50 })
  bankAccountType?: string;

  @Column({ name: 'first_registration_date', nullable: true, type: 'date' })
  firstRegistrationDate?: Date;

  @Column({ name: 'has_litigated_current_fiscal_year', nullable: true, type: 'boolean' })
  hasLitigatedCurrentFiscalYear?: boolean;

  @Column({ name: 'litigation_details', nullable: true, type: 'text' })
  litigationDetails?: string;

  // Paso 4: Dirección Personal del Propietario
  @Column({ name: 'is_same_address_as_business', nullable: true, type: 'boolean' })
  isSameAddressAsBusiness?: boolean;

  @Column({ name: 'owner_personal_address', nullable: true, type: 'jsonb' })
  ownerPersonalAddress?: {
    street: string;
    unit?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };

  @Column({ name: 'proof_of_address_url', nullable: true, type: 'text' })
  proofOfAddressUrl?: string;

  // Paso 5: Tipo de LLC
  @Column({ name: 'llc_type', nullable: true, length: 20 })
  llcType?: 'single' | 'multi';

  // Paso 3: Información del Validador (movido desde BankAccountValidator)
  @Column({ name: 'validator_first_name', nullable: true, length: 255 })
  validatorFirstName?: string;

  @Column({ name: 'validator_last_name', nullable: true, length: 255 })
  validatorLastName?: string;

  @Column({ name: 'validator_date_of_birth', nullable: true, type: 'date' })
  validatorDateOfBirth?: Date | null;

  @Column({ name: 'validator_nationality', nullable: true, length: 100 })
  validatorNationality?: string;

  @Column({ name: 'validator_citizenship', nullable: true, length: 100 })
  validatorCitizenship?: string;

  @Column({ name: 'validator_passport_number', nullable: true, length: 100 })
  validatorPassportNumber?: string;

  @Column({ name: 'validator_scanned_passport_url', nullable: true, type: 'text' })
  validatorScannedPassportUrl?: string;

  @Column({ name: 'validator_work_email', nullable: true, length: 255 })
  validatorWorkEmail?: string;

  @Column({ name: 'validator_use_email_for_relay_login', default: false, type: 'boolean' })
  validatorUseEmailForRelayLogin?: boolean;

  @Column({ name: 'validator_phone', nullable: true, length: 50 })
  validatorPhone?: string;

  @Column({ name: 'validator_can_receive_sms', default: false, type: 'boolean' })
  validatorCanReceiveSMS?: boolean;

  @Column({ name: 'validator_is_us_resident', nullable: true, type: 'boolean' })
  validatorIsUSResident?: boolean;

  @Column({ name: 'validator_title', nullable: true, length: 255 })
  validatorTitle?: string;

  @Column({ name: 'validator_income_source', nullable: true, length: 255 })
  validatorIncomeSource?: string;

  @Column({ name: 'validator_annual_income', nullable: true, type: 'numeric', precision: 15, scale: 2 })
  validatorAnnualIncome?: number;

  // Paso 7: Confirmación y Firma Electrónica
  @Column({ name: 'document_certification', nullable: true, type: 'text' })
  documentCertification?: string;

  @Column({ name: 'accepts_terms_and_conditions', nullable: true, type: 'boolean' })
  acceptsTermsAndConditions?: boolean;

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

