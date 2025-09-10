import { Body, Controller, Get, Post as HttpPost, Param, Req, UseGuards } from '@nestjs/common';
import { PostsService } from './posts.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PostDto } from './dtos/post.dto';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // Obtener todos los post desde el portal
  @Get('get-from-portal')
  async findAllPublishedForPortal(){
    return this.postsService.findAllPublishedForPortal();
  }

  // Obtener post por slug desde el portal
  @Get('get-from-portal/:slug')
  async findOneBySlug(@Param('slug') slug: string){
    return this.postsService.findOneBySlug(slug);
  }

  @HttpPost()
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  async create(@Body() postDto: PostDto, @Req() req: Request) {
    const userId = req['user'].id; // Asume que el ID del usuario está en el token JWT
    return this.postsService.create(postDto, userId);
  }
}
