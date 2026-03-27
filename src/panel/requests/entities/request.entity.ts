import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../../../shared/user/entities/user.entity';
import { Client } from '../../clients/entities/client.entity';
import { AperturaLlcRequest } from './apertura-llc-request.entity';
import { RenovacionLlcRequest } from './renovacion-llc-request.entity';
import { CuentaBancariaRequest } from './cuenta-bancaria-request.entity';

@Entity('requests')
@Index(['uuid'])
export class Request {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 36, unique: true })
  uuid: string;

  @Column({ type: 'varchar', length: 50 })
  type: 'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria';

  @Column({ type: 'varchar', length: 50 })
  status: 'solicitud-recibida' | 'pendiente' | 'en-proceso' | 'completada' | 'rechazada';

  @Column({ name: 'current_step', type: 'int', nullable: true })
  currentStep?: number; // Paso principal del wizard (1, 2, 3, 4)

  @Column({ type: 'varchar', length: 100, nullable: true })
  stage?: string; // Etapa actual del blueprint de Zoho CRM

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id', type: 'int' })
  clientId: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'partner_id' })
  partner?: User;

  @Column({ name: 'partner_id', nullable: true, type: 'int' })
  partnerId?: number;

  @OneToOne(() => AperturaLlcRequest, (alr) => alr.request, { cascade: true })
  aperturaLlcRequest?: AperturaLlcRequest;

  @OneToOne(() => RenovacionLlcRequest, (rlr) => rlr.request, { cascade: true })
  renovacionLlcRequest?: RenovacionLlcRequest;

  @OneToOne(() => CuentaBancariaRequest, (cbr) => cbr.request, { cascade: true })
  cuentaBancariaRequest?: CuentaBancariaRequest;

  @Column({ nullable: true, type: 'text' })
  notes?: string;

  @Column({ name: 'zoho_account_id', nullable: true, length: 100 })
  zohoAccountId?: string;

  @Column({ name: 'work_drive_url_external', nullable: true, type: 'text' })
  workDriveUrlExternal?: string; // URL externa de Zoho WorkDrive desde Account

  @Column({ name: 'work_drive_id', nullable: true, length: 200 })
  workDriveId?: string; // ID del recurso en Zoho WorkDrive (carpeta/archivo)

  @Column({ name: 'company', nullable: true, length: 255 })
  company?: string; // Empresa: "Start Companies" o nombre del partner

  // Información de pago
  @Column({ name: 'payment_method', nullable: true, type: 'varchar', length: 50 })
  paymentMethod?: 'transferencia' | 'stripe';

  @Column({ name: 'payment_amount', nullable: true, type: 'decimal', precision: 10, scale: 2 })
  paymentAmount?: number;

  @Column({ name: 'stripe_charge_id', nullable: true, type: 'varchar', length: 100 })
  stripeChargeId?: string; // ID del cargo de Stripe

  @Column({ name: 'payment_status', nullable: true, type: 'varchar', length: 50 })
  paymentStatus?: string; // Estado del pago (succeeded, pending, failed, etc.)

  @Column({ name: 'payment_proof_url', nullable: true, type: 'text' })
  paymentProofUrl?: string; // URL del comprobante de transferencia

  @Column({ name: 'signature_url', nullable: true, type: 'text' })
  signatureUrl?: string; // URL de la firma del cliente en el paso de revisión final

  // Origen de creación del request (panel vs wizard) para interpretar pasos correctamente
  @Column({
    name: 'created_from',
    type: 'varchar',
    length: 20,
    default: "'panel'",
  })
  createdFrom: 'panel' | 'wizard';

  // Plan del servicio (ej. apertura-llc: Entrepreneur, Elite, Premium) para validaciones al recargar
  @Column({ type: 'varchar', length: 50, nullable: true })
  plan?: string;

  @CreateDateColumn({
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @BeforeInsert()
  generateUuid() {
    if (!this.uuid) {
      this.uuid = uuidv4();
    }
  }
}

