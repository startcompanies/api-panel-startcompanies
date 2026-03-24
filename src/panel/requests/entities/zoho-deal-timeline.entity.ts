import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';

@Entity('zoho_deal_timeline')
export class ZohoDealTimeline {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'zoho_deal_id', type: 'varchar', length: 50, unique: true })
  zohoDealId: string;

  @Column({ name: 'deal_name', type: 'varchar', length: 500, nullable: true })
  dealName?: string;

  @Column({ name: 'deal_type', type: 'varchar', length: 100, nullable: true })
  dealType?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  stage?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  status?: string;

  @Column({ name: 'zoho_account_id', type: 'varchar', length: 50, nullable: true })
  zohoAccountId?: string;

  @Column({ name: 'account_name', type: 'varchar', length: 500, nullable: true })
  accountName?: string;

  @Column({ name: 'zoho_llc_principal_id', type: 'varchar', length: 50, nullable: true })
  zohoLlcPrincipalId?: string;

  @Column({ name: 'llc_principal_name', type: 'varchar', length: 500, nullable: true })
  llcPrincipalName?: string;

  @Column({ name: 'zoho_contact_id', type: 'varchar', length: 50, nullable: true })
  zohoContactId?: string;

  @Column({ name: 'contact_email', type: 'varchar', length: 255, nullable: true })
  contactEmail?: string;

  @Column({ name: 'contact_first_name', type: 'varchar', length: 255, nullable: true })
  contactFirstName?: string;

  @Column({ name: 'contact_last_name', type: 'varchar', length: 255, nullable: true })
  contactLastName?: string;

  @Column({ name: 'tipo_contacto', type: 'varchar', length: 100, nullable: true })
  tipoContacto?: string;

  @Column({ name: 'partner_picklist', type: 'varchar', length: 200, nullable: true })
  partnerPicklist?: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  amount?: number;

  @Column({ name: 'closing_date', type: 'timestamp with time zone', nullable: true })
  closingDate?: Date;

  @Column({ name: 'fecha', type: 'timestamp with time zone', nullable: true })
  fecha?: Date;

  @Column({ name: 'fecha_constitucion', type: 'timestamp with time zone', nullable: true })
  fechaConstitucion?: Date;

  @Column({ name: 'fecha_renovacion', type: 'timestamp with time zone', nullable: true })
  fechaRenovacion?: Date;

  @Column({ name: 'created_time_zoho', type: 'timestamp with time zone', nullable: true })
  createdTimeZoho?: Date;

  @Column({ name: 'modified_time_zoho', type: 'timestamp with time zone', nullable: true })
  modifiedTimeZoho?: Date;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client?: Client;

  @Column({ name: 'client_id', type: 'int', nullable: true })
  clientId?: number;

  @Column({ name: 'synced_at', type: 'timestamp with time zone' })
  syncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
