import {
  Body,
  Controller,
  Get,
  Post as HttpPost,
  Param,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PostDto } from './dtos/post.dto';
import { UpdatePublicationStatusDto } from './dtos/update-publication-status.dto';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // Obtener todos los post desde el portal
  @Get('get-from-portal')
  async findAllPublishedForPortal() {
    return this.postsService.findAllPublishedForPortal();
  }

  // Obtener post por slug desde el portal
  @Get('get-from-portal/:slug')
  async findOneBySlug(@Param('slug') slug: string) {
    return this.postsService.findOneBySlug(slug);
  }

  // Obtener todos los posts correspondientes a una categoría
  @Get('get-from-portal/category/:slug')
  async findAllPostsByCategorySlug(@Param('slug') slug: string) {
    return this.postsService.findAllByCategorySlug(slug);
  }

  @HttpPost()
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  async create(@Body() postDto: PostDto, @Req() req: Request) {
    const userId = req['user'].id; // Asume que el ID del usuario está en el token JWT
    return this.postsService.create(postDto, userId);
  }

  // Obtener post por id
  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  async getById(@Param('id') id: string) {
    return this.postsService.findOneById(id);
  }

  // Publicar post por id
  @Patch('publish/:id')
  async publishPost(@Param('id') id: string, @Body() updatePublicationStatusDto: UpdatePublicationStatusDto) {
    return this.postsService.publishPostById(id, updatePublicationStatusDto.is_published);
  }

  @Put(':id')
  async updatePost(@Param('id') id: string, @Body() postDto: PostDto){
    return this.postsService.updatePost(id, postDto);
  }
}
