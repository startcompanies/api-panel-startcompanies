import {
  BadRequestException,
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PostDto } from './dtos/post.dto';
import { UpdatePublicationStatusDto } from './dtos/update-publication-status.dto';
import { PaginationDto } from 'src/shared/common/dtos/pagination.dto';
import { GetPostsFilterDto } from './dtos/get-posts-filter.dto';
import { UpdateSandboxStatusDto } from './dtos/update-sandbox-status.dto';
import { UpdateQaReviewedStatusDto } from './dtos/update-qa-reviewed-status.dto';
import { UpdateTodoDto } from './dtos/update-todo.dto';

/**
 * Blog posts API.
 *
 * Contrato: **Panel** (JWT) usa solo `GET /blog/posts` y rutas mutables (`:id`, publish, sandbox…).
 * **Portal** público: rutas canónicas `GET /blog/posts/public` y `GET /blog/posts/public/:slug` con query
 * `audience=published|preview` (y `category` opcional en el listado). Las rutas `get-from-portal` /
 * `get-sandbox-posts` siguen como alias deprecados.
 */
@ApiTags('Blog - Posts')
@Controller('blog/posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  /** Panel: lista completa (sin filtrar por publicado ni sandbox). Requiere JWT. */
  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener todos los posts sin filtros ni paginación',
  })
  async findAll() {
    return this.postsService.findAll();
  }

  // --- Portal: rutas canónicas (registrar antes de @Get(':id')) ---

  private resolveBlogAudience(audience?: string): 'published' | 'preview' {
    const raw = (audience ?? 'published').trim().toLowerCase();
    if (raw === 'preview' || raw === 'sandbox') return 'preview';
    if (raw === 'published' || raw === '') return 'published';
    throw new BadRequestException(
      `audience inválido: ${JSON.stringify(audience)}. Use published o preview.`,
    );
  }

  @Get('public')
  @ApiOperation({
    summary: 'Portal: listado de posts (publicados o revisión)',
    description:
      'Use audience=published (por defecto) o preview. Opcional category=slug de categoría.',
  })
  @ApiQuery({
    name: 'audience',
    required: false,
    enum: ['published', 'preview'],
    description: 'published = is_published; preview = sandbox',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Slug de categoría para filtrar el listado',
  })
  async findPublicList(
    @Query('audience') audience?: string,
    @Query('category') category?: string,
  ) {
    const mode = this.resolveBlogAudience(audience);
    const cat = category?.trim();
    if (cat) {
      return mode === 'preview'
        ? this.postsService.findAllSandboxPostsByCategorySlug(cat)
        : this.postsService.findAllByCategorySlug(cat);
    }
    return mode === 'preview'
      ? this.postsService.findAllSandbox()
      : this.postsService.findAllPublishedForPortal();
  }

  @Get('public/:slug')
  @ApiOperation({
    summary: 'Portal: detalle de post por slug',
    description: 'audience=published (por defecto) o preview (sandbox).',
  })
  @ApiQuery({
    name: 'audience',
    required: false,
    enum: ['published', 'preview'],
  })
  async findPublicDetail(
    @Param('slug') slug: string,
    @Query('audience') audience?: string,
  ) {
    const mode = this.resolveBlogAudience(audience);
    return mode === 'preview'
      ? this.postsService.findOneSandboxBySlug(slug)
      : this.postsService.findOneBySlug(slug);
  }

  // --- Portal: alias legacy (misma lógica que /public + audience) ---

  @Get('get-from-portal')
  @ApiOperation({
    summary: 'Obtener todos los posts publicados para el portal',
    deprecated: true,
    description: 'Usar GET /blog/posts/public?audience=published',
  })
  async findAllPublishedForPortal() {
    return this.postsService.findAllPublishedForPortal();
  }

  @Get('get-sandbox-posts')
  @ApiOperation({
    summary: 'Obtener todos los posts en modo de revisión',
    deprecated: true,
    description: 'Usar GET /blog/posts/public?audience=preview',
  })
  async findAllSandbox() {
    return this.postsService.findAllSandbox();
  }

  @Get('get-from-portal/:slug')
  @ApiOperation({
    summary: 'Obtener un post por su slug',
    deprecated: true,
    description: 'Usar GET /blog/posts/public/:slug?audience=published',
  })
  async findOneBySlug(@Param('slug') slug: string) {
    return this.postsService.findOneBySlug(slug);
  }

  @Get('get-from-portal/category/:slug')
  @ApiOperation({
    summary: 'Obtener todos los posts correspondientes a una categoría',
    deprecated: true,
    description: 'Usar GET /blog/posts/public?audience=published&category=:slug',
  })
  async findAllPostsByCategorySlug(@Param('slug') slug: string) {
    return this.postsService.findAllByCategorySlug(slug);
  }

  @Get('get-sandbox-posts/category/:slug')
  @ApiOperation({
    summary: 'Obtener todos los posts correspondientes a una categoría en modo de revisión',
    deprecated: true,
    description: 'Usar GET /blog/posts/public?audience=preview&category=:slug',
  })
  async findAllSandboxPostsByCategorySlug(@Param('slug') slug: string) {
    return this.postsService.findAllSandboxPostsByCategorySlug(slug);
  }

  @Get('get-sandbox-posts/:slug')
  @ApiOperation({
    summary: 'Obtener un post en modo revisión por su slug',
    deprecated: true,
    description: 'Usar GET /blog/posts/public/:slug?audience=preview',
  })
  async findOneSandboxBySlug(@Param('slug') slug: string) {
    return this.postsService.findOneSandboxBySlug(slug);
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

  // Marcar post como validado / no validado en QA
  @Patch('qa-reviewed/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Marcar post como validado o no validado en QA',
  })
  @ApiParam({ name: 'id', description: 'ID del post' })
  @ApiBody({ type: UpdateQaReviewedStatusDto })
  async updateQaReviewedStatus(
    @Param('id') id: string,
    @Body() dto: UpdateQaReviewedStatusDto,
  ) {
    return this.postsService.updateQaReviewedStatus(id, dto.qa_reviewed);
  }

  // Reiniciar QA: quitar validación QA de todos los posts
  @Patch('qa-reset')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Reiniciar QA: marcar todos los posts como no validados en QA',
  })
  @ApiResponse({ status: 200, description: 'Cantidad de posts actualizados' })
  async resetAllQaReviewed() {
    return this.postsService.resetAllQaReviewed();
  }

  // Actualizar notas TODO del post (solo desde listado)
  @Patch('todo/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Actualizar notas TODO / pendientes del post',
  })
  @ApiParam({ name: 'id', description: 'ID del post' })
  @ApiBody({ type: UpdateTodoDto })
  async updateTodo(
    @Param('id') id: string,
    @Body() dto: UpdateTodoDto,
  ) {
    return this.postsService.updateTodo(id, dto.todo ?? null);
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

  @HttpPost('sync-descriptions-from-migration-meta')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Sincronizar descriptions desde businessenusa-migration-meta.json',
    description:
      'Recorre el JSON, busca cada post por slug, valida que el title coincida y actualiza el campo description.',
  })
  @ApiResponse({ status: 200, description: 'Resultado: updated, titleMismatch, notFound, details' })
  async syncDescriptionsFromMigrationMeta() {
    return this.postsService.syncDescriptionsFromMigrationMeta();
  }
}
