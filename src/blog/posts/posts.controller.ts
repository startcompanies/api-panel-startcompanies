import {
  Body,
  Controller,
  Get,
  Post as HttpPost,
  Param,
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { AuthGuard } from 'src/shared/auth/auth.guard';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PostDto } from './dtos/post.dto';
import { UpdatePublicationStatusDto } from './dtos/update-publication-status.dto';
import { PaginationDto } from 'src/shared/common/dtos/pagination.dto';
import { GetPostsFilterDto } from './dtos/get-posts-filter.dto';
import { UpdateSandboxStatusDto } from './dtos/update-sandbox-status.dto';

@ApiTags('Blog - Posts')
@Controller('blog/posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener todos los posts sin filtros ni paginación',
  })
  async findAll() {
    return this.postsService.findAll();
  }

  // Obtener todos los post desde el portal
  @Get('get-from-portal')
  @ApiOperation({
    summary: 'Obtener todos los posts publicados para el portal',
  })
  async findAllPublishedForPortal() {
    return this.postsService.findAllPublishedForPortal();
  }

  // Obtener todos los posts en modo de revisión
  @Get('get-sandbox-posts')
  @ApiOperation({
    summary: 'Obtener todos los posts en modo de revisión',
  })
  async findAllSandbox() {
    return this.postsService.findAllSandbox();
  }

  // Obtener post por slug desde el portal
  @Get('get-from-portal/:slug')
  @ApiOperation({
    summary: 'Obtener un post por su slug',
  })
  async findOneBySlug(@Param('slug') slug: string) {
    return this.postsService.findOneBySlug(slug);
  }

  // Obtener todos los posts correspondientes a una categoría
  @Get('get-from-portal/category/:slug')
  @ApiOperation({
    summary: 'Obtener todos los posts correspondientes a una categoría',
  })
  async findAllPostsByCategorySlug(@Param('slug') slug: string) {
    return this.postsService.findAllByCategorySlug(slug);
  }

  // Obtener todos los post correspondientes a una categoria en modo de revisión
  @Get('get-sandbox-posts/category/:slug')
  @ApiOperation({
    summary: 'Obtener todos los posts correspondientes a una categoría en modo de revisión',
  })
  async findAllSandboxPostsByCategorySlug(@Param('slug') slug: string) {
    return this.postsService.findAllSandboxPostsByCategorySlug(slug);
  }

  // Crear un nuevo post
  @HttpPost()
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Crear un nuevo post',
    description: 'Crea un nuevo post en el blog. Requiere autenticación.',
  })
  @ApiBody({ type: PostDto })
  @ApiResponse({ status: 201, description: 'Post creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async create(@Body() postDto: PostDto, @Req() req: Request) {
    const userId = req['user'].id; // Asume que el ID del usuario está en el token JWT
    return this.postsService.create(postDto, userId);
  }

  // Obtener post por id
  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener un post por su ID',
  })
  async getById(@Param('id') id: string) {
    return this.postsService.findOneById(id);
  }

  // Publicar post por id
  @Patch('publish/:id')
  @ApiOperation({
    summary: 'Publicar un post por su ID',
    description: 'Actualiza el estado de publicación de un post.',
  })
  @ApiParam({ name: 'id', description: 'ID del post' })
  @ApiBody({ type: UpdatePublicationStatusDto })
  @ApiResponse({ status: 200, description: 'Estado de publicación actualizado' })
  @ApiResponse({ status: 404, description: 'Post no encontrado' })
  async publishPost(
    @Param('id') id: string,
    @Body() updatePublicationStatusDto: UpdatePublicationStatusDto,
  ) {
    return this.postsService.publishPostById(
      id,
      updatePublicationStatusDto.is_published,
    );
  }

  // Actualizar el estado de revisión de un post
  @Patch('sandbox/:id')
  @ApiOperation({
    summary: 'Actualizar el estado de revisión de un post',
  })
  async updateSandboxStatus(
    @Param('id') id: string,
    @Body() updateSandboxStatusDto: UpdateSandboxStatusDto,
  ) {
    return this.postsService.updateSandboxStatus(id, updateSandboxStatusDto.sandbox);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Actualizar un post por su ID',
    description: 'Actualiza completamente un post existente.',
  })
  @ApiParam({ name: 'id', description: 'ID del post' })
  @ApiBody({ type: PostDto })
  @ApiResponse({ status: 200, description: 'Post actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Post no encontrado' })
  async updatePost(@Param('id') id: string, @Body() postDto: PostDto) {
    return this.postsService.updatePost(id, postDto);
  }
}
