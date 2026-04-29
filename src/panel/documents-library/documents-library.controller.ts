import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { DocumentsLibraryService } from './documents-library.service';

@ApiTags('Panel - Documents Library')
@Controller('panel/documents-library')
@UseGuards(AuthGuard)
@ApiBearerAuth('JWT-auth')
export class DocumentsLibraryController {
  constructor(private readonly docsService: DocumentsLibraryService) {}

  @Get('folders')
  listFolders() {
    return this.docsService.listFolders();
  }

  @Post('folders')
  createFolder(@Body() body: Record<string, unknown>) {
    return this.docsService.createFolder(body as any);
  }

  @Get('documents')
  listDocuments(@Query('folderId') folderId?: string) {
    return this.docsService.listDocuments(folderId ? Number(folderId) : undefined);
  }

  @Post('documents')
  createDocument(@Body() body: Record<string, unknown>) {
    return this.docsService.createDocument(body as any);
  }

  @Post('documents/tags')
  addTag(@Body() body: { documentId: number; tag: string }) {
    return this.docsService.addTag(body.documentId, body.tag);
  }
}

