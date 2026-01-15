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

  @Column({ name: 'state', nullable: true, length: 100 })
  state?: string;

  @Column({ name: 'ein_number', nullable: true, length: 50 })
  einNumber?: string;

  @Column({ name: 'main_activity', nullable: true, type: 'text' })
  mainActivity?: string;

  // Tipo de LLC
  @Column({ name: 'llc_type', nullable: true, length: 20 })
  llcType?: 'single' | 'multi';

  // Paso 3: Información Contable de la LLC
  @Column({ name: 'llc_opening_cost', nullable: true, type: 'decimal', precision: 12, scale: 2 })
  llcOpeningCost?: number;

  @Column({ name: 'paid_to_family_members', nullable: true, type: 'decimal', precision: 12, scale: 2 })
  paidToFamilyMembers?: number;

  @Column({ name: 'paid_to_local_companies', nullable: true, type: 'decimal', precision: 12, scale: 2 })
  paidToLocalCompanies?: number;

  @Column({ name: 'paid_for_llc_formation', nullable: true, type: 'decimal', precision: 12, scale: 2 })
  paidForLLCFormation?: number;

  @Column({ name: 'paid_for_llc_dissolution', nullable: true, type: 'decimal', precision: 12, scale: 2 })
  paidForLLCDissolution?: number;

  @Column({ name: 'bank_account_balance_end_of_year', nullable: true, type: 'decimal', precision: 12, scale: 2 })
  bankAccountBalanceEndOfYear?: number;

  @Column({ name: 'total_revenue', nullable: true, type: 'decimal', precision: 12, scale: 2 })
  totalRevenue?: number;

  @Column({ name: 'has_financial_investments_in_usa', nullable: true, length: 50 })
  hasFinancialInvestmentsInUSA?: string;

  @Column({ name: 'has_filed_taxes_before', nullable: true, length: 50 })
  hasFiledTaxesBefore?: string;

  @Column({ name: 'was_constituted_with_start_companies', nullable: true, length: 50 })
  wasConstitutedWithStartCompanies?: string;

  // URLs de documentos adicionales
  @Column({ name: 'partners_passports_file_url', nullable: true, type: 'text' })
  partnersPassportsFileUrl?: string;

  @Column({ name: 'operating_agreement_additional_file_url', nullable: true, type: 'text' })
  operatingAgreementAdditionalFileUrl?: string;

  @Column({ name: 'form_147_or_575_file_url', nullable: true, type: 'text' })
  form147Or575FileUrl?: string;

  @Column({ name: 'articles_of_organization_additional_file_url', nullable: true, type: 'text' })
  articlesOfOrganizationAdditionalFileUrl?: string;

  @Column({ name: 'boi_report_file_url', nullable: true, type: 'text' })
  boiReportFileUrl?: string;

  @Column({ name: 'bank_statements_file_url', nullable: true, type: 'text' })
  bankStatementsFileUrl?: string;

  // Campos adicionales de declaraciones
  @Column({ name: 'declaracion_inicial', nullable: true, type: 'boolean' })
  declaracionInicial?: boolean;

  @Column({ name: 'declaracion_ano_corriente', nullable: true, type: 'boolean' })
  declaracionAnoCorriente?: boolean;

  @Column({ name: 'cambio_direccion_ra', nullable: true, type: 'boolean' })
  cambioDireccionRA?: boolean;

  @Column({ name: 'cambio_nombre', nullable: true, type: 'boolean' })
  cambioNombre?: boolean;

  @Column({ name: 'declaracion_anos_anteriores', nullable: true, type: 'boolean' })
  declaracionAnosAnteriores?: boolean;

  @Column({ name: 'agregar_cambiar_socio', nullable: true, type: 'boolean' })
  agregarCambiarSocio?: boolean;

  @Column({ name: 'declaracion_cierre', nullable: true, type: 'boolean' })
  declaracionCierre?: boolean;

  @Column({ name: 'countries_where_llc_does_business', nullable: true, type: 'jsonb' })
  countriesWhereLLCDoesBusiness?: string[];

  @Column({ name: 'llc_creation_date', nullable: true, type: 'date' })
  llcCreationDate?: Date;

  @Column({ name: 'has_property_in_usa', nullable: true, length: 50 })
  hasPropertyInUSA?: string;

  @Column({ name: 'almacena_productos_deposito_usa', nullable: true, length: 50 })
  almacenaProductosDepositoUSA?: string;

  @Column({ name: 'contrata_servicios_usa', nullable: true, length: 50 })
  contrataServiciosUSA?: string;

  @Column({ name: 'tiene_cuentas_bancarias', nullable: true, length: 50 })
  tieneCuentasBancarias?: string;

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

