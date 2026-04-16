import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.services';
import { AuthGuard } from 'src/shared/auth/auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CategoryDTO } from './dtos/category.dto';

@ApiTags('Blog - Categories')
@Controller('blog/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  private resolveBlogAudience(audience?: string): 'published' | 'preview' {
    const raw = (audience ?? 'published').trim().toLowerCase();
    if (raw === 'preview' || raw === 'sandbox') return 'preview';
    if (raw === 'published' || raw === '') return 'published';
    throw new BadRequestException(
      `audience inválido: ${JSON.stringify(audience)}. Use published o preview.`,
    );
  }

  /** Portal: conteos por categoría alineados con listados `GET /blog/posts/public`. */
  @Get('public')
  @ApiOperation({
    summary: 'Portal: categorías con conteo de posts',
    description: 'audience=published (por defecto) o preview (sandbox).',
  })
  @ApiQuery({
    name: 'audience',
    required: false,
    enum: ['published', 'preview'],
  })
  async findPublicWithCounts(@Query('audience') audience?: string) {
    const mode = this.resolveBlogAudience(audience);
    return mode === 'preview'
      ? this.categoriesService.findAllWithSandboxPostsCount()
      : this.categoriesService.findAllWithPublishedPostsCount();
  }

  @Get('with-posts-count')
  @ApiOperation({
    summary: 'Obtener todas las categorías con el número de posts publicados',
    deprecated: true,
    description: 'Usar GET /blog/categories/public?audience=published',
  })
  async findAllWithPublishedPostsCount() {
    return this.categoriesService.findAllWithPublishedPostsCount();
  }

  @Get('whith-sandbox-posts-count')
  @ApiOperation({
    summary: 'Obtener todas las categorías con el número de posts en sandbox',
    deprecated: true,
    description: 'Usar GET /blog/categories/public?audience=preview',
  })
  async findAllWithSandboxPostsCount() {
    return this.categoriesService.findAllWithSandboxPostsCount();
  }

  @Get('with-sandbox-posts-count')
  @ApiOperation({
    summary:
      'Alias de whith-sandbox-posts-count: categorías con conteo de posts sandbox',
    deprecated: true,
    description: 'Usar GET /blog/categories/public?audience=preview',
  })
  async findAllWithSandboxPostsCountAlias() {
    return this.categoriesService.findAllWithSandboxPostsCount();
  }

  // Obtener todas las categorías
  @Get()
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener todas las categorías',
  })
  findAll() {
    return this.categoriesService.findAll();
  }

  // Crear una nueva categoría
  @Post()
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Crear una nueva categoría',
  })
  create(@Body() categoryDto: CategoryDTO) {
    return this.categoriesService.create(categoryDto);
  }

  // Actualizar una categoría por su ID
  @Patch(':id')
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Actualizar una categoría por su ID',
  })
  update(@Param('id') id: string, @Body() categoryDto: CategoryDTO) {
    return this.categoriesService.updateCategoryById(id, categoryDto);
  }

  // Obtener una categoría por su ID
  @Get(':id')
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener una categoría por su ID',
  })
  findById(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }
}
