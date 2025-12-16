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

@Entity('apertura_llc_requests')
export class AperturaLlcRequest {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @OneToOne(() => Request, (request) => request.aperturaLlcRequest)
  @JoinColumn({ name: 'request_id' })
  request: Request;

  @Column({ name: 'current_step_number', type: 'int' })
  currentStepNumber: number;

  // Paso 1: Información de la LLC
  @Column({ name: 'llc_name', nullable: true, length: 255 })
  llcName?: string;

  @Column({ name: 'business_type', nullable: true, length: 255 })
  businessType?: string;

  @Column({ name: 'business_description', nullable: true, type: 'text' })
  businessDescription?: string;

  @Column({ name: 'llc_phone_number', nullable: true, length: 50 })
  llcPhoneNumber?: string;

  @Column({ name: 'llc_website', nullable: true, length: 500 })
  llcWebsite?: string;

  @Column({ name: 'llc_email', nullable: true, length: 255 })
  llcEmail?: string;

  @Column({ name: 'incorporation_state', nullable: true, length: 100 })
  incorporationState?: string;

  @Column({ name: 'incorporation_date', nullable: true, type: 'date' })
  incorporationDate?: Date;

  @Column({ name: 'has_ein', nullable: true, type: 'boolean' })
  hasEin?: boolean;

  @Column({ name: 'ein_number', nullable: true, length: 50 })
  einNumber?: string;

  @Column({ name: 'ein_document_url', nullable: true, type: 'text' })
  einDocumentUrl?: string;

  @Column({ name: 'no_ein_reason', nullable: true, type: 'text' })
  noEinReason?: string;

  @Column({ name: 'certificate_of_formation_url', nullable: true, type: 'text' })
  certificateOfFormationUrl?: string;

  // Paso 2: Dirección del Registered Agent
  @Column({ name: 'registered_agent_address', nullable: true, type: 'jsonb' })
  registeredAgentAddress?: {
    street: string;
    building?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };

  @Column({ name: 'registered_agent_name', nullable: true, length: 255 })
  registeredAgentName?: string;

  @Column({ name: 'registered_agent_email', nullable: true, length: 255 })
  registeredAgentEmail?: string;

  @Column({ name: 'registered_agent_phone', nullable: true, length: 50 })
  registeredAgentPhone?: string;

  @Column({ name: 'registered_agent_type', nullable: true, length: 20 })
  registeredAgentType?: 'persona' | 'empresa';

  // Paso 3: Información de la cuenta bancaria
  @Column({ name: 'needs_bank_verification_help', nullable: true, type: 'boolean' })
  needsBankVerificationHelp?: boolean;

  @Column({ name: 'bank_account_type', nullable: true, length: 50 })
  bankAccountType?: string;

  @Column({ name: 'bank_name', nullable: true, length: 255 })
  bankName?: string;

  @Column({ name: 'bank_account_number', nullable: true, length: 100 })
  bankAccountNumber?: string;

  @Column({ name: 'bank_routing_number', nullable: true, length: 100 })
  bankRoutingNumber?: string;

  @Column({ name: 'bank_statement_url', nullable: true, type: 'text' })
  bankStatementUrl?: string;

  // Paso 4: Dirección Personal del Propietario
  @Column({ name: 'owner_nationality', nullable: true, length: 100 })
  ownerNationality?: string;

  @Column({ name: 'owner_country_of_residence', nullable: true, length: 100 })
  ownerCountryOfResidence?: string;

  @Column({ name: 'owner_personal_address', nullable: true, type: 'jsonb' })
  ownerPersonalAddress?: {
    street: string;
    building?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };

  @Column({ name: 'owner_phone_number', nullable: true, length: 50 })
  ownerPhoneNumber?: string;

  @Column({ name: 'owner_email', nullable: true, length: 255 })
  ownerEmail?: string;

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

