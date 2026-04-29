import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LibraryDocument } from './entities/library-document.entity';
import { LibraryFolder } from './entities/library-folder.entity';
import { LibraryTag } from './entities/library-tag.entity';

@Injectable()
export class DocumentsLibraryService {
  constructor(
    @InjectRepository(LibraryFolder)
    private readonly foldersRepo: Repository<LibraryFolder>,
    @InjectRepository(LibraryDocument)
    private readonly docsRepo: Repository<LibraryDocument>,
    @InjectRepository(LibraryTag)
    private readonly tagsRepo: Repository<LibraryTag>,
  ) {}

  listFolders() {
    return this.foldersRepo.find({ order: { createdAt: 'DESC' } });
  }

  createFolder(payload: Partial<LibraryFolder>) {
    return this.foldersRepo.save(this.foldersRepo.create(payload));
  }

  listDocuments(folderId?: number) {
    return this.docsRepo.find({
      where: folderId ? { folderId } : {},
      order: { createdAt: 'DESC' },
    });
  }

  createDocument(payload: Partial<LibraryDocument>) {
    return this.docsRepo.save(this.docsRepo.create(payload));
  }

  addTag(documentId: number, tag: string) {
    return this.tagsRepo.save(this.tagsRepo.create({ documentId, tag }));
  }
}

