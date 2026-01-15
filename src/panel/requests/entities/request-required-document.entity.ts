import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity('request_required_documents')
export class RequestRequiredDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'request_type', type: 'varchar', length: 50 })
  requestType: 'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria';

  @Column({ name: 'llc_type', nullable: true, type: 'varchar', length: 20 })
  llcType?: 'single' | 'multi';

  @Column({ name: 'document_name', type: 'varchar', length: 255 })
  documentName: string;

  @Column({ name: 'document_type', type: 'varchar', length: 50 })
  documentType: 'certificate' | 'document' | 'form' | 'other';

  @Column({ type: 'boolean', default: true })
  required: boolean;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'int' })
  order: number;
}

