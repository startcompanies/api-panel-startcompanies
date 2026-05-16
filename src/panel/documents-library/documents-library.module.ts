import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentShare } from './entities/document-share.entity';
import { LibraryDocument } from './entities/library-document.entity';
import { LibraryFolder } from './entities/library-folder.entity';
import { LibraryTag } from './entities/library-tag.entity';
import { DocumentsLibraryController } from './documents-library.controller';
import { DocumentsLibraryService } from './documents-library.service';

@Module({
  imports: [TypeOrmModule.forFeature([LibraryFolder, LibraryDocument, LibraryTag, DocumentShare])],
  controllers: [DocumentsLibraryController],
  providers: [DocumentsLibraryService],
})
export class DocumentsLibraryModule {}

