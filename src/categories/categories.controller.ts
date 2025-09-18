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
import { ApiBearerAuth } from '@nestjs/swagger';
import { CategoryDTO } from './dtos/category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('with-posts-count')
  async findAllWithPublishedPostsCount() {
    return this.categoriesService.findAllWithPublishedPostsCount();
  }

  @Get()
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post()
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  create(@Body() categoryDto: CategoryDTO) {
    return this.categoriesService.create(categoryDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  update(@Param('id') id: string, @Body() categoryDto: CategoryDTO) {
    return this.categoriesService.updateCategoryById(id, categoryDto);
  }

  @Get(':id')
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  findById(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }
}
