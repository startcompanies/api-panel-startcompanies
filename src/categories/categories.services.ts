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
  ) {}

  async create(categoryDto: CategoryDTO): Promise<Category> {
    try {
      const slug = slugify(categoryDto.name, { lower: true });
      const existingCategory = await this.categoriesRepository.findOne({
        where: { slug },
      });
      if (existingCategory) {
        throw new BadRequestException('A category with this name already exists.');
      }

      const newCategory = this.categoriesRepository.create({ ...categoryDto, slug });
      return await this.categoriesRepository.save(newCategory);
    } catch (err) {
      console.error('Error al crear la categoría:', err);
      throw new HandleExceptionsService().handleDBExceptions(err);
    }
  }

  async findAll(): Promise<Category[]> {
    try {
      return await this.categoriesRepository.find();
    } catch (err) {
      console.error('Error al obtener las categorías:', err);
      throw new HandleExceptionsService().handleDBExceptions(err);
    }
  }

  async updateCategoryById(id: string, categoryDto: Partial<CategoryDTO>): Promise<Category> {
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

      const updatedCategory = this.categoriesRepository.merge(categoryToUpdate, categoryDto);
      return await this.categoriesRepository.save(updatedCategory);
    } catch (err) {
      console.error('Error al actualizar la categoría:', err);
      throw new HandleExceptionsService().handleDBExceptions(err);
    }
  }

  async findById(id: string): Promise<Category> {
    const category = await this.categoriesRepository.findOne({ where: { id: Number(id) } });
    if (!category) {
      throw new NotFoundException(`Category with ID "${id}" not found.`);
    }
    return category;
  }
}