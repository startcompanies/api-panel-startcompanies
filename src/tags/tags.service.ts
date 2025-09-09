import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from './entities/tag.entity';
import { TagDto } from './dtos/tag.dto';
import { HandleExceptionsService } from 'src/common/common.service';

@Injectable()
export class TagsService {
  
  constructor(
    @InjectRepository(Tag)
    private tagsRepository: Repository<Tag>,
  ) {}

  async create(tagDto: TagDto): Promise<Tag> {
    try {
      const newTag = this.tagsRepository.create(tagDto);
      return await this.tagsRepository.save(newTag);
    } catch (err) {
      console.error('Error al crear el tag:', err);
      throw new HandleExceptionsService().handleDBExceptions(err);
    }
  }

  async findAll(): Promise<Tag[]> {
    try {
      return await this.tagsRepository.find();
    } catch (err) {
      console.error('Error al obtener los tags:', err);
      throw new HandleExceptionsService().handleDBExceptions(err);
    }
  }

  async updateTagById(id: string, tagDto: Partial<TagDto>): Promise<Tag> {
    try {
      await this.tagsRepository.update(id, tagDto);
      const updatedTag = await this.tagsRepository.findOne({ where: { id: Number(id) } });
      if (!updatedTag) {
        throw new HandleExceptionsService().handleNotFoundExceptions(id);
      }
      return updatedTag;
    } catch (err) {
      console.error('Error al actualizar el tag:', err);
      throw new HandleExceptionsService().handleDBExceptions(err);
    }
  }
}
