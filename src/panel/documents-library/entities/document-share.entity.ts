import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('document_shares')
export class DocumentShare {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'document_id', type: 'int' })
  documentId: number;

  @Column({ name: 'shared_with_user_id', type: 'int' })
  sharedWithUserId: number;

  @Column({ name: 'permission', type: 'varchar', length: 20, default: 'read' })
  permission: 'read' | 'write';

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}

