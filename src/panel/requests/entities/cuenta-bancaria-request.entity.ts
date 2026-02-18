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
  @Column({ name: 'registered_agent_street', nullable: true, length: 255 })
  registeredAgentStreet?: string;

  @Column({ name: 'registered_agent_unit', nullable: true, length: 255 })
  registeredAgentUnit?: string;

  @Column({ name: 'registered_agent_city', nullable: true, length: 255 })
  registeredAgentCity?: string;

  @Column({ name: 'registered_agent_state', nullable: true, length: 255 })
  registeredAgentState?: string;

  @Column({ name: 'registered_agent_zip_code', nullable: true, length: 50 })
  registeredAgentZipCode?: string;

  @Column({ name: 'registered_agent_country', nullable: true, length: 255 })
  registeredAgentCountry?: string;

  @Column({ name: 'incorporation_state', nullable: true, length: 255 })
  incorporationState?: string;

  @Column({ name: 'incorporation_month_year', nullable: true, length: 50 })
  incorporationMonthYear?: string;

  @Column({ name: 'countries_where_business', nullable: true, type: 'text' })
  countriesWhereBusiness?: string;

  // Paso 3: Información de la cuenta bancaria
  @Column({ name: 'bank_service', nullable: true, length: 50 })
  bankService?: string; // Servicio bancario: "Relay" o "Mercury"

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

