import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../../shared/user/entities/user.entity';

export type PartnerTenantSurface = 'panel' | 'wizard';

@Entity('partner_tenants')
export class PartnerTenant {
  @PrimaryGeneratedColumn()
  id: number;

  /** Usuario con rol `partner` dueño del tenant (único por partner). */
  @Column({ name: 'partner_id', type: 'int', unique: true })
  partnerId: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partner_id' })
  partner?: User;

  @Column({ type: 'varchar', length: 60, unique: true })
  slug: string;

  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName: string;

  /** Host sin protocolo ni path, ej. `portal.taxsolution.com` */
  @Column({ name: 'custom_domain', type: 'varchar', length: 255, unique: true })
  customDomain: string;

  @Column({ name: 'frontend_base_url', type: 'varchar', length: 255 })
  frontendBaseUrl: string;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string | null;

  @Column({ name: 'logo_dark_url', type: 'text', nullable: true })
  logoDarkUrl: string | null;

  @Column({ name: 'favicon_url', type: 'text', nullable: true })
  faviconUrl: string | null;

  @Column({ name: 'primary_color', type: 'varchar', length: 20, nullable: true })
  primaryColor: string | null;

  @Column({ name: 'secondary_color', type: 'varchar', length: 20, nullable: true })
  secondaryColor: string | null;

  @Column({ name: 'accent_color', type: 'varchar', length: 20, nullable: true })
  accentColor: string | null;

  @Column({ name: 'brand_palette', type: 'varchar', length: 20, default: 'blue' })
  brandPalette: string;

  @Column({ name: 'shell_appearance', type: 'varchar', length: 10, default: 'dark' })
  shellAppearance: string;

  @Column({
    name: 'enabled_surfaces',
    type: 'jsonb',
    default: () => `'["panel"]'`,
  })
  enabledSurfaces: PartnerTenantSurface[];

  @Column({ name: 'seo_title', type: 'varchar', length: 120, nullable: true })
  seoTitle: string | null;

  @Column({ name: 'seo_description', type: 'varchar', length: 300, nullable: true })
  seoDescription: string | null;

  @Column({ name: 'whatsapp_number', type: 'varchar', length: 20, nullable: true })
  whatsappNumber: string | null;

  @Column({ name: 'website_url', type: 'varchar', length: 255, nullable: true })
  websiteUrl: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

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
