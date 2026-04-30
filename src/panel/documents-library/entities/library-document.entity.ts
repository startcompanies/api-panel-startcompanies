import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('library_documents')
export class LibraryDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'folder_id', type: 'int', nullable: true })
  folderId: number | null;

  @Column({ name: 'owner_user_id', type: 'int' })
  ownerUserId: number;

  @Column({ name: 'title', type: 'varchar', length: 220 })
  title: string;

  @Column({ name: 'file_url', type: 'text' })
  fileUrl: string;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}

