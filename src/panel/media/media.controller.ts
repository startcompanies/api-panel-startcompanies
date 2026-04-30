import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { MediaService } from './media.service';

@ApiTags('Panel - Media Premium')
@Controller('panel/media')
@UseGuards(AuthGuard)
@ApiBearerAuth('JWT-auth')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

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
    @Body() body: { title: string; description: string; videoUrl: string; isPublished?: boolean },
  ) {
    return this.mediaService.adminCreateVideo(body);
  }

  @Patch('admin/videos/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  adminUpdateVideo(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title?: string; description?: string; videoUrl?: string; isPublished?: boolean },
  ) {
    return this.mediaService.adminUpdateVideo(id, body);
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
  adminCreateGuide(@Body() body: { title: string; content: string; isPublished?: boolean }) {
    return this.mediaService.adminCreateGuide(body);
  }

  @Patch('admin/guides/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  adminUpdateGuide(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title?: string; content?: string; isPublished?: boolean },
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

