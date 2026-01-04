import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../../shared/user/entities/user.entity';
import { AperturaLlcRequest } from './apertura-llc-request.entity';
import { RenovacionLlcRequest } from './renovacion-llc-request.entity';
import { CuentaBancariaRequest } from './cuenta-bancaria-request.entity';

@Entity('requests')
export class Request {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  type: 'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria';

  @Column({ type: 'varchar', length: 50 })
  status: 'solicitud-recibida' | 'pendiente' | 'en-proceso' | 'completada' | 'rechazada';

  @Column({ type: 'varchar', length: 100, nullable: true })
  stage?: string; // Etapa actual del blueprint de Zoho CRM

  @ManyToOne(() => User)
  @JoinColumn({ name: 'client_id' })
  client: User;

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
}

