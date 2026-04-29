import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('library_tags')
export class LibraryTag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'document_id', type: 'int' })
  documentId: number;

  @Column({ name: 'tag', type: 'varchar', length: 80 })
  tag: string;
}

