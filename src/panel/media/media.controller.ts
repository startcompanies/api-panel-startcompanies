import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { MediaService } from './media.service';
import { UploadFileService } from '../../shared/upload-file/upload-file.service';

@ApiTags('Panel - Media Premium')
@Controller('panel/media')
@UseGuards(AuthGuard)
@ApiBearerAuth('JWT-auth')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly uploadFileService: UploadFileService,
  ) {}

  @Get('videos')
  videos(@Request() req) {
    return this.mediaService.listVideos(req.user);
  }

  @Get('videos/:id')
  videoDetail(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.mediaService.getVideoDetail(id, req.user);
  }

  @Get('guides')
  guides(@Request() req) {
    return this.mediaService.listGuides(req.user);
  }

  @Get('guides/:id')
  guideDetail(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.mediaService.getGuideDetail(id, req.user);
  }

  @Get('admin/videos')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  adminListVideos() {
    return this.mediaService.adminListVideos();
  }

  @Post('admin/videos')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  adminCreateVideo(
    @Body() body: { title: string; description: string; videoUrl: string; thumbnailUrl?: string | null; isPublished?: boolean },
  ) {
    return this.mediaService.adminCreateVideo(body);
  }

  @Patch('admin/videos/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  adminUpdateVideo(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title?: string; description?: string; videoUrl?: string; thumbnailUrl?: string | null; isPublished?: boolean },
  ) {
    return this.mediaService.adminUpdateVideo(id, body);
  }

  @Post('admin/thumbnails/upload')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async adminUploadThumbnail(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type: 'videos' | 'guias'; id?: string },
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const type = body.type === 'guias' ? 'guias' : 'videos';
    const folder = body.id ? `thumbnails/${type}/${body.id}` : `thumbnails/${type}/temp`;
    const result = await this.uploadFileService.uploadFile(file, undefined, undefined, folder);
    if (!result) throw new BadRequestException('Error al subir thumbnail');
    return { url: result.url, key: result.key };
  }

  @Delete('admin/videos/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  adminDeleteVideo(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.adminDeleteVideo(id);
  }

  @Get('admin/guides')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  adminListGuides() {
    return this.mediaService.adminListGuides();
  }

  @Post('admin/guides')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  adminCreateGuide(
    @Body()
    body: {
      title: string;
      content?: string;
      contentHtml?: string | null;
      attachmentUrl?: string | null;
      attachmentMime?: string | null;
      thumbnailUrl?: string | null;
      isPublished?: boolean;
    },
  ) {
    return this.mediaService.adminCreateGuide(body);
  }

  @Patch('admin/guides/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  adminUpdateGuide(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      title?: string;
      content?: string;
      contentHtml?: string | null;
      attachmentUrl?: string | null;
      attachmentMime?: string | null;
      thumbnailUrl?: string | null;
      isPublished?: boolean;
    },
  ) {
    return this.mediaService.adminUpdateGuide(id, body);
  }

  @Delete('admin/guides/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  adminDeleteGuide(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.adminDeleteGuide(id);
  }
}

