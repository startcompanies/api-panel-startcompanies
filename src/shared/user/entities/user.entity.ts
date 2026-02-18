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

  @Column({ type: 'varchar', nullable: true })
  emailVerificationToken: string | null;

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
