import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from './entities/tag.entity';
import { TagDto } from './dtos/tag.dto';

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
      throw new InternalServerErrorException('No se pudo crear el tag.');
    }
  }

  async findAll(): Promise<Tag[]> {
    try {
      return await this.tagsRepository.find();
    } catch (err) {
      console.error('Error al obtener los tags:', err);
      throw new InternalServerErrorException(
        'No se pudieron obtener los tags.',
      );
    }
  }
}
