import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from './entities/tag.entity';
import { TagDto } from './dtos/tag.dto';
import { HandleExceptionsService } from 'src/common/common.service';
import slugify from 'slugify';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private tagsRepository: Repository<Tag>,
  ) {}

  async create(tagDto: TagDto): Promise<Tag> {
    try {
      const slug = slugify(tagDto.name, { lower: true });
      const existingTag = await this.tagsRepository.findOne({
        where: { slug },
      });
      if (existingTag) {
        throw new BadRequestException('A tag with this name already exists.');
      }

      const newTag = this.tagsRepository.create({ ...tagDto, slug });
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
      const tagToUpdate = await this.tagsRepository.findOne({
        where: { id: Number(id) },
      });
      if (!tagToUpdate) {
        throw new NotFoundException(`Tag with ID "${id}" not found.`);
      }

      // Generar el nuevo slug si el nombre cambia
      if (tagDto.name) {
        tagToUpdate.slug = slugify(tagDto.name, { lower: true });
      }

      // Fusionar los datos del DTO con la entidad existente
      const updatedTag = this.tagsRepository.merge(tagToUpdate, tagDto);
      return await this.tagsRepository.save(updatedTag);
    } catch (err) {
      console.error('Error al actualizar el tag:', err);
      throw new HandleExceptionsService().handleDBExceptions(err);
    }
  }

  async findById(id: string): Promise<Tag> {
    const tag = await this.tagsRepository.findOne({ where: { id: Number(id) } });
    if (!tag) {
      throw new NotFoundException(`Tag with ID "${id}" not found.`);
    }
    return tag;
  }
}
