import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('llc_guides')
export class LlcGuide {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'content_html', type: 'text', nullable: true })
  contentHtml: string | null;

  @Column({ name: 'attachment_url', type: 'text', nullable: true })
  attachmentUrl: string | null;

  @Column({ name: 'attachment_mime', type: 'varchar', length: 120, nullable: true })
  attachmentMime: string | null;

  @Column({ name: 'is_published', type: 'boolean', default: true })
  isPublished: boolean;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}

