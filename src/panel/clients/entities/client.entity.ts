import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../../shared/user/entities/user.entity';
// Request entity se importará cuando se actualice la relación
// import { Request } from '../../requests/entities/request.entity';

@Entity('clients')
@Index(['partnerId'])
@Index(['userId'])
@Index(['email'])
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  // Relación con Partner (opcional - si el cliente pertenece a un partner)
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'partner_id' })
  partner?: User;

  @Column({ name: 'partner_id', nullable: true, type: 'int' })
  partnerId?: number;

  // Relación con User (opcional - si el cliente tiene acceso al portal)
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'user_id', nullable: true, type: 'int' })
  userId?: number;

  // Datos del cliente
  @Column({ type: 'varchar', length: 255 })
  full_name: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  company?: string;

  // Dirección (JSONB para flexibilidad)
  @Column({ type: 'jsonb', nullable: true })
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };

  // Estado
  @Column({ type: 'boolean', default: true })
  status: boolean;

  // Notas adicionales
  @Column({ type: 'text', nullable: true })
  notes?: string;

  // Relación con Requests (opcional, se define en Request entity)
  // requests?: Request[];

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






