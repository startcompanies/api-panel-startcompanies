import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { Repository } from 'typeorm';
import { CategoryDTO } from './dtos/category.dto';
import { HandleExceptionsService } from 'src/common/common.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
  ) {}

  async create(categoryDto: CategoryDTO): Promise<Category> {
    try {
      const newCategory = this.categoriesRepository.create(categoryDto);
      return await this.categoriesRepository.save(newCategory);
    } catch (err) {
      console.error('Error al crear el tag:', err);
      throw new HandleExceptionsService().handleDBExceptions(err);
    }
  }

  async findAll(): Promise<Category[]> {
    try {
      return await this.categoriesRepository.find();
    } catch (err) {
      console.error('Error al obtener los tags:', err);
      throw new HandleExceptionsService().handleDBExceptions(err);
    }
  }

  async updateCategoryById(id: string, categoryDto: Partial<CategoryDTO>): Promise<Category>{
    try {
      await this.categoriesRepository.update(id, categoryDto);
      const updatedCategory = await this.categoriesRepository.findOne({ where: { id: Number(id) } });
      if (!updatedCategory) {
        throw new HandleExceptionsService().handleNotFoundExceptions(id);
      }
      return updatedCategory;
    } catch (err) {
      console.error('Error al actualizar la categoría:', err);
      throw new HandleExceptionsService().handleDBExceptions(err);
    }
  }
}
