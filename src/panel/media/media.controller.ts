import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  Headers,
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
  videos(
    @Request() req,
    @Headers('x-tenant-host') tenantHostHeader?: string,
  ) {
    return this.mediaService.listVideos(req.user, tenantHostHeader);
  }

  @Get('videos/:id')
  videoDetail(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Headers('x-tenant-host') tenantHostHeader?: string,
  ) {
    return this.mediaService.getVideoDetail(id, req.user, tenantHostHeader);
  }

  @Get('guides')
  guides(
    @Request() req,
    @Headers('x-tenant-host') tenantHostHeader?: string,
  ) {
    return this.mediaService.listGuides(req.user, tenantHostHeader);
  }

  @Get('guides/:id')
  guideDetail(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Headers('x-tenant-host') tenantHostHeader?: string,
  ) {
    return this.mediaService.getGuideDetail(id, req.user, tenantHostHeader);
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
    @Body()
    body: {
      title: string;
      description: string;
      videoUrl: string;
      thumbnailUrl?: string | null;
      isPublished?: boolean;
      visibility?: 'startcompanies' | 'partners' | 'both';
    },
  ) {
    return this.mediaService.adminCreateVideo(body);
  }

  @Patch('admin/videos/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  adminUpdateVideo(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      title?: string;
      description?: string;
      videoUrl?: string;
      thumbnailUrl?: string | null;
      isPublished?: boolean;
      visibility?: 'startcompanies' | 'partners' | 'both';
    },
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
      visibility?: 'startcompanies' | 'partners' | 'both';
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
      visibility?: 'startcompanies' | 'partners' | 'both';
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

  private partnerIdFromRequest(req: { user: { id: number; type: string } }): number {
    if (req.user.type !== 'partner') {
      throw new ForbiddenException('Solo partners pueden gestionar contenido del portal');
    }
    return req.user.id;
  }

  @Get('partner/videos')
  @UseGuards(RolesGuard)
  @Roles('partner')
  partnerListVideos(@Request() req) {
    return this.mediaService.partnerListVideos(this.partnerIdFromRequest(req));
  }

  @Post('partner/videos')
  @UseGuards(RolesGuard)
  @Roles('partner')
  partnerCreateVideo(
    @Request() req,
    @Body()
    body: {
      title: string;
      description: string;
      videoUrl: string;
      thumbnailUrl?: string | null;
      isPublished?: boolean;
    },
  ) {
    return this.mediaService.partnerCreateVideo(this.partnerIdFromRequest(req), body);
  }

  @Patch('partner/videos/:id')
  @UseGuards(RolesGuard)
  @Roles('partner')
  partnerUpdateVideo(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      title?: string;
      description?: string;
      videoUrl?: string;
      thumbnailUrl?: string | null;
      isPublished?: boolean;
    },
  ) {
    return this.mediaService.partnerUpdateVideo(this.partnerIdFromRequest(req), id, body);
  }

  @Delete('partner/videos/:id')
  @UseGuards(RolesGuard)
  @Roles('partner')
  partnerDeleteVideo(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.mediaService.partnerDeleteVideo(this.partnerIdFromRequest(req), id);
  }

  @Get('partner/guides')
  @UseGuards(RolesGuard)
  @Roles('partner')
  partnerListGuides(@Request() req) {
    return this.mediaService.partnerListGuides(this.partnerIdFromRequest(req));
  }

  @Post('partner/guides')
  @UseGuards(RolesGuard)
  @Roles('partner')
  partnerCreateGuide(
    @Request() req,
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
    return this.mediaService.partnerCreateGuide(this.partnerIdFromRequest(req), body);
  }

  @Patch('partner/guides/:id')
  @UseGuards(RolesGuard)
  @Roles('partner')
  partnerUpdateGuide(
    @Request() req,
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
    return this.mediaService.partnerUpdateGuide(this.partnerIdFromRequest(req), id, body);
  }

  @Delete('partner/guides/:id')
  @UseGuards(RolesGuard)
  @Roles('partner')
  partnerDeleteGuide(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.mediaService.partnerDeleteGuide(this.partnerIdFromRequest(req), id);
  }

  @Post('partner/thumbnails/upload')
  @UseGuards(RolesGuard)
  @Roles('partner')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async partnerUploadThumbnail(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type: 'videos' | 'guias'; id?: string },
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const partnerId = this.partnerIdFromRequest(req);
    const type = body.type === 'guias' ? 'guias' : 'videos';
    const folder = body.id
      ? `media/partners/${partnerId}/thumbnails/${type}/${body.id}`
      : `media/partners/${partnerId}/thumbnails/${type}/temp`;
    const result = await this.uploadFileService.uploadFile(file, undefined, undefined, folder);
    if (!result) throw new BadRequestException('Error al subir thumbnail');
    return { url: result.url, key: result.key };
  }

  @Post('partner/guides/attachment/upload')
  @UseGuards(RolesGuard)
  @Roles('partner')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async partnerUploadGuideAttachment(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const partnerId = this.partnerIdFromRequest(req);
    const folder = `media/partners/${partnerId}/guides`;
    const result = await this.uploadFileService.uploadFile(file, undefined, undefined, folder);
    if (!result) throw new BadRequestException('Error al subir adjunto');
    return { url: result.url, key: result.key };
  }
}

