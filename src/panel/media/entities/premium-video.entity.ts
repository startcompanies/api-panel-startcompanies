import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('premium_videos')
export class PremiumVideo {
  @PrimaryGeneratedColumn()
  id: number;

  /** NULL = contenido de Start Companies; valor = contenido exclusivo del partner. */
  @Column({ name: 'partner_id', type: 'int', nullable: true })
  partnerId: number | null;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'video_url', type: 'text' })
  videoUrl: string;

  @Column({ name: 'thumbnail_url', type: 'text', nullable: true })
  thumbnailUrl: string | null;

  @Column({ name: 'is_published', type: 'boolean', default: true })
  isPublished: boolean;

  @Column({ type: 'varchar', length: 20, default: 'startcompanies' })
  visibility: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}

