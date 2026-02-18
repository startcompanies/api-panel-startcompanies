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

  // Campos mapeados desde Zoho CRM Accounts (según mapeo proporcionado)
  // Account_Name -> llcName
  @Column({ name: 'llc_name', nullable: true, length: 255 })
  llcName?: string;

  // Actividad_Principal_de_la_LLC -> businessDescription
  @Column({ name: 'business_description', nullable: true, type: 'text' })
  businessDescription?: string;

  // Estado_de_Registro -> incorporationState
  @Column({ name: 'incorporation_state', nullable: true, length: 100 })
  incorporationState?: string;

  // Estructura_Societaria -> llcType (mapeado)
  @Column({ name: 'llc_type', nullable: true, length: 20 })
  llcType?: 'single' | 'multi';

  @Column({ name: 'llc_name_option_2', nullable: true, length: 255 })
  llcNameOption2?: string;

  @Column({ name: 'llc_name_option_3', nullable: true, length: 255 })
  llcNameOption3?: string;

  @Column({ name: 'linkedin', nullable: true, length: 255 })
  linkedin?: string;

  @Column({ name: 'actividad_financiera_esperada', nullable: true, type: 'text' })
  actividadFinancieraEsperada?: string;

  // Campos para apertura bancaria (Sección 3) - Estos campos se usan en el frontend pero no están en el CSV de mapeo a Zoho
  @Column({ name: 'service_bill_url', nullable: true, type: 'text' })
  serviceBillUrl?: string;

  @Column({ name: 'bank_statement_url', nullable: true, type: 'text' })
  bankStatementUrl?: string;

  @Column({ name: 'periodic_income_10k', nullable: true, length: 10 })
  periodicIncome10k?: string;

  @Column({ name: 'bank_account_linked_email', nullable: true, length: 255 })
  bankAccountLinkedEmail?: string;

  @Column({ name: 'bank_account_linked_phone', nullable: true, length: 50 })
  bankAccountLinkedPhone?: string;

  @Column({ name: 'project_or_company_url', nullable: true, length: 500 })
  projectOrCompanyUrl?: string;

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

