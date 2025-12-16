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

@Entity('renovacion_llc_requests')
export class RenovacionLlcRequest {
  @PrimaryColumn({ name: 'request_id', type: 'int' })
  requestId: number;

  @OneToOne(() => Request, (request) => request.renovacionLlcRequest)
  @JoinColumn({ name: 'request_id' })
  request: Request;

  @Column({ name: 'current_step_number', type: 'int' })
  currentStepNumber: number;

  // Paso 1: Datos Generales de la LLC
  @Column({ name: 'llc_name', nullable: true, length: 255 })
  llcName?: string;

  @Column({ name: 'society_type', nullable: true, length: 255 })
  societyType?: string;

  @Column({ name: 'registration_number', nullable: true, length: 100 })
  registrationNumber?: string;

  @Column({ name: 'state', nullable: true, length: 100 })
  state?: string;

  @Column({ name: 'has_data_or_directors_changes', nullable: true, type: 'boolean' })
  hasDataOrDirectorsChanges?: boolean;

  @Column({ name: 'physical_address', nullable: true, length: 500 })
  physicalAddress?: string;

  @Column({ name: 'correspondence_address', nullable: true, length: 500 })
  correspondenceAddress?: string;

  @Column({ name: 'country', nullable: true, length: 100 })
  country?: string;

  @Column({ name: 'city', nullable: true, length: 100 })
  city?: string;

  @Column({ name: 'postal_code', nullable: true, length: 20 })
  postalCode?: string;

  @Column({ name: 'main_activity_description', nullable: true, type: 'text' })
  mainActivityDescription?: string;

  @Column({ name: 'contact_phone', nullable: true, length: 50 })
  contactPhone?: string;

  @Column({ name: 'contact_email', nullable: true, length: 255 })
  contactEmail?: string;

  @Column({ name: 'has_ein', nullable: true, type: 'boolean' })
  hasEin?: boolean;

  @Column({ name: 'ein_number', nullable: true, length: 50 })
  einNumber?: string;

  @Column({ name: 'main_activity', nullable: true, type: 'text' })
  mainActivity?: string;

  @Column({ name: 'responsible_person', nullable: true, type: 'jsonb' })
  responsiblePerson?: {
    name: string;
    lastName: string;
    country: string;
    address: string;
    email: string;
    phone: string;
  };

  @Column({ name: 'wants_registered_agent', nullable: true, type: 'boolean' })
  wantsRegisteredAgent?: boolean;

  @Column({ name: 'registered_agent_info', nullable: true, type: 'jsonb' })
  registeredAgentInfo?: {
    name: string;
    address: string;
    country: string;
    city: string;
    postalCode: string;
    phone: string;
    email: string;
  };

  @Column({ name: 'identity_document_url', nullable: true, type: 'text' })
  identityDocumentUrl?: string;

  @Column({ name: 'proof_of_address_url', nullable: true, type: 'text' })
  proofOfAddressUrl?: string;

  @Column({ name: 'llc_contract_or_operating_agreement_url', nullable: true, type: 'text' })
  llcContractOrOperatingAgreementUrl?: string;

  @Column({ name: 'articles_of_incorporation_url', nullable: true, type: 'text' })
  articlesOfIncorporationUrl?: string;

  // Paso 3: Domicilio Registrado
  @Column({ name: 'registered_address', nullable: true, length: 500 })
  registeredAddress?: string;

  @Column({ name: 'registered_country', nullable: true, length: 100 })
  registeredCountry?: string;

  @Column({ name: 'registered_state', nullable: true, length: 100 })
  registeredState?: string;

  @Column({ name: 'registered_city', nullable: true, length: 100 })
  registeredCity?: string;

  @Column({ name: 'registered_postal_code', nullable: true, length: 20 })
  registeredPostalCode?: string;

  // Paso 4: Documentación Anexa
  @Column({ name: 'capital_contributions_url', nullable: true, type: 'text' })
  capitalContributionsUrl?: string;

  @Column({ name: 'state_registration_url', nullable: true, type: 'text' })
  stateRegistrationUrl?: string;

  @Column({ name: 'certificate_of_good_standing_url', nullable: true, type: 'text' })
  certificateOfGoodStandingUrl?: string;

  // Paso 5: Confirmación de Datos
  @Column({ name: 'data_is_correct', nullable: true, type: 'boolean' })
  dataIsCorrect?: boolean;

  @Column({ name: 'observations', nullable: true, type: 'text' })
  observations?: string;

  // Paso 6: Pago y Envío
  @Column({ name: 'payment_method', nullable: true, length: 100 })
  paymentMethod?: string;

  @Column({ name: 'amount_to_pay', nullable: true, type: 'decimal', precision: 10, scale: 2 })
  amountToPay?: number;

  @Column({ name: 'wants_invoice', nullable: true, type: 'boolean' })
  wantsInvoice?: boolean;

  @Column({ name: 'payment_proof_url', nullable: true, type: 'text' })
  paymentProofUrl?: string;

  // Tipo de LLC
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

