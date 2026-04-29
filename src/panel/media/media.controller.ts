import { Controller, Get, Param, ParseIntPipe, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
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
}

