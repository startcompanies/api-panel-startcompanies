import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('zoho_config')
@Index(['org', 'service'], { unique: true })
export class ZohoConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  org: string; // Nombre de la organización en Zoho

  @Column({ length: 255 })
  service: string; // Servicio: 'crm', 'recruit', etc.

  @Column({ length: 3 })
  region: string; // 'com', 'eu', 'in', 'cn', 'au'

  @Column({ length: 255 })
  scopes: string; // Permisos solicitados (ej: 'ZohoCRM.modules.ALL')

  @Column({ length: 255 })
  client_id: string; // Client ID de Zoho

  @Column({ length: 255 })
  client_secret: string; // Client Secret de Zoho

  @Column({ length: 255, nullable: true })
  refresh_token: string; // Token de refresco (se obtiene después de OAuth)

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}







