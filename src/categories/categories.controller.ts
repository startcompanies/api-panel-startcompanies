import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.services';
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CategoryDTO } from './dtos/category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('with-posts-count')
  @ApiOperation({
    summary: 'Obtener todas las categorías con el número de posts publicados',
  })
  async findAllWithPublishedPostsCount() {
    return this.categoriesService.findAllWithPublishedPostsCount();
  }

  @Get()
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener todas las categorías',
  })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post()
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Crear una nueva categoría',
  })
  create(@Body() categoryDto: CategoryDTO) {
    return this.categoriesService.create(categoryDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Actualizar una categoría por su ID',
  })
  update(@Param('id') id: string, @Body() categoryDto: CategoryDTO) {
    return this.categoriesService.updateCategoryById(id, categoryDto);
  }

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
