import { Post } from '../../../blog/posts/entities/post.entity';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password?: string;

  @Column({ unique: true })
  email: string;

  @Column({ default: true })
  status: boolean;

  @Column({ 
    type: 'varchar', 
    length: 20, 
    default: 'user',
    // Validación a nivel de aplicación, en DB usar CHECK constraint
    // Roles del Panel: 'admin', 'partner', 'client', 'user'
    // Roles del Blog: 'admin', 'editor', 'user'
  })
  type: 'user' | 'client' | 'partner' | 'admin' | 'editor';

  @Column({ nullable: true })
  first_name: string;

  @Column({ nullable: true })
  last_name: string;

  @Column({ nullable: true })
  bio: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  company: string;

  @Column({ default: false })
  emailVerified: boolean;

  /** ID del Contact en Zoho CRM (flujo partner: Tipo Partner). */
  @Column({ name: 'zoho_contact_id', type: 'varchar', length: 100, nullable: true })
  zohoContactId: string | null;

  @Column({ type: 'varchar', nullable: true })
  emailVerificationToken: string | null;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 100, nullable: true })
  stripeCustomerId: string | null;

  @Column({ name: 'billing_access_state', type: 'varchar', length: 40, nullable: true })
  billingAccessState: string | null;

  @Column({ name: 'billing_trial_start_at', type: 'timestamp with time zone', nullable: true })
  billingTrialStartAt: Date | null;

  @Column({ name: 'billing_trial_end_at', type: 'timestamp with time zone', nullable: true })
  billingTrialEndAt: Date | null;

  @Column({ name: 'billing_subscription_id', type: 'varchar', length: 100, nullable: true })
  billingSubscriptionId: string | null;

  @Column({ name: 'billing_subscription_status', type: 'varchar', length: 40, nullable: true })
  billingSubscriptionStatus: string | null;

  @Column({ name: 'billing_subscription_current_period_end', type: 'timestamp with time zone', nullable: true })
  billingSubscriptionCurrentPeriodEnd: Date | null;

  @Column({ name: 'billing_subscription_cancel_at', type: 'timestamp with time zone', nullable: true })
  billingSubscriptionCancelAt: Date | null;

  @Column({
    name: 'billing_monthly_price_usd',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 25,
  })
  billingMonthlyPriceUsd: number;

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

  // Relación de One-to-Many: un usuario puede tener muchos posts
  @OneToMany(() => Post, (post) => post.user)
  posts: Post[]
}
