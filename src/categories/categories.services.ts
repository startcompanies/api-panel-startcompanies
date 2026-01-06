import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { Repository } from 'typeorm';
import { CategoryDTO } from './dtos/category.dto';
import { HandleExceptionsService } from 'src/common/common.service';
import slugify from 'slugify';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    private readonly exceptionsService: HandleExceptionsService,
  ) {}

  // Crear una nueva categoría
  async create(categoryDto: CategoryDTO): Promise<Category> {
    try {
      const slug = slugify(categoryDto.name, { lower: true });
      const existingCategory = await this.categoriesRepository.findOne({
        where: { slug },
      });
      if (existingCategory) {
        throw new BadRequestException(
          'A category with this name already exists.',
        );
      }

      const newCategory = this.categoriesRepository.create({
        ...categoryDto,
        slug,
      });
      return await this.categoriesRepository.save(newCategory);
    } catch (err) {
      console.error('Error al crear la categoría:', err);
      throw this.exceptionsService.handleDBExceptions(err);
    }
  }

  // Obtener todas las categorías
  async findAll(): Promise<Category[]> {
    try {
      return await this.categoriesRepository.find();
    } catch (err) {
      console.error('Error al obtener las categorías:', err);
      throw this.exceptionsService.handleDBExceptions(err);
    }
  }

  // Actualizar una categoría por su ID
  async updateCategoryById(
    id: string,
    categoryDto: Partial<CategoryDTO>,
  ): Promise<Category> {
    try {
      const categoryToUpdate = await this.categoriesRepository.findOne({
        where: { id: Number(id) },
      });
      if (!categoryToUpdate) {
        throw new NotFoundException(`Category with ID "${id}" not found.`);
      }

      if (categoryDto.name) {
        categoryToUpdate.slug = slugify(categoryDto.name, { lower: true });
      }

      const updatedCategory = this.categoriesRepository.merge(
        categoryToUpdate,
        categoryDto,
      );
      return await this.categoriesRepository.save(updatedCategory);
    } catch (err) {
      console.error('Error al actualizar la categoría:', err);
      throw this.exceptionsService.handleDBExceptions(err);
    }
  }

  // Obtener una categoría por su ID
  async findById(id: string): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { id: Number(id) },
    });
    if (!category) {
      throw new NotFoundException(`Category with ID "${id}" not found.`);
    }
    return category;
  }

  // Obtener las categorías desde el portal
  async findAllWithPublishedPostsCount(): Promise<any[] | undefined> {
    try {
      const result = await this.categoriesRepository
        .createQueryBuilder('category')
        .select(['category.name', 'category.slug'])
        .addSelect('COUNT(DISTINCT posts.id)', 'post_count')
        .leftJoin(
          'post_categories',
          'post_categories',
          'post_categories.category_id = category.id',
        )
        .leftJoin(
          'posts',
          'posts',
          'posts.id = post_categories.post_id AND posts.is_published = true',
        )
        .groupBy('category.id')
        .having('COUNT(DISTINCT posts.id) > 0')
        .getRawMany();

      return result.map((row) => ({
        name: row.category_name,
        slug: row.category_slug,
        count: parseInt(row.post_count, 10),
      }));
    } catch (error) {
      this.exceptionsService.handleDBExceptions(error);
    }
  }

  // Obtener todas las categorías con el número de posts en sandbox
  async findAllWithSandboxPostsCount(): Promise<any[] | undefined> {
    try {
      const result = await this.categoriesRepository
        .createQueryBuilder('category')
        .select(['category.name', 'category.slug'])
        .addSelect('COUNT(DISTINCT posts.id)', 'post_count')
        .leftJoin(
          'post_categories',
          'post_categories',
          'post_categories.category_id = category.id',
        )
        .leftJoin(
          'posts',
          'posts',
          'posts.id = post_categories.post_id AND posts.sandbox = true',
        )
        .groupBy('category.id')
        .having('COUNT(DISTINCT posts.id) > 0')
        .getRawMany();

      return result.map((row) => ({
        name: row.category_name,
        slug: row.category_slug,
        count: parseInt(row.post_count, 10),
      }));
    } catch (error) {
      this.exceptionsService.handleDBExceptions(error);
    }
  }
}
