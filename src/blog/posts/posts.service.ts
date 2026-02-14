import { InjectRepository } from '@nestjs/typeorm';
import { Post } from './entities/post.entity';
import { In, Repository } from 'typeorm';
import { User } from 'src/shared/user/entities/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { HandleExceptionsService } from 'src/shared/common/common.service';
import { PostDto } from './dtos/post.dto';
import slugify from 'slugify';
import { PaginationDto } from 'src/shared/common/dtos/pagination.dto';
import { GetPostsFilterDto } from './dtos/get-posts-filter.dto';
import * as fs from 'fs';
import * as path from 'path';

export interface MigrationMetaItem {
  slug: string;
  url_original: string;
  url_nueva: string;
  title: string;
  description: string;
}

export interface SyncDescriptionsResult {
  updated: number;
  notFound: number;
  details: Array<{ slug: string; status: 'updated' | 'not_found' }>;
}

export class PostsService {

  constructor(
    @InjectRepository(Post)
    private postsRepository: Repository<Post>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(Tag)
    private tagsRepository: Repository<Tag>,
    private readonly exceptionsService: HandleExceptionsService,
  ) { }

  // Crear post
  async create(postDto: PostDto, userId: string): Promise<Post | undefined> {
    const { categories_ids, tags_ids, ...rest } = postDto;

    try {
      const user = await this.userRepository.findOne({
        where: { id: Number(userId) },
      });
      if (!user) {
        this.exceptionsService.handleNotFoundExceptions(Number(userId));
      }

      const categories =
        categories_ids && categories_ids.length > 0
          ? await this.categoriesRepository.findBy({ id: In(categories_ids) })
          : [];
      const tags =
        tags_ids && tags_ids.length > 0
          ? await this.tagsRepository.findBy({ id: In(tags_ids) })
          : [];

      const slug = slugify(postDto.title, {
        lower: true,
        strict: true,
        remove: /[:.]/g,
      });
      const excerpt = postDto.content.substring(0, 150) + '...';

      // Crear la entidad de forma segura
      const newPost = new Post();
      newPost.title = postDto.title;
      newPost.content = postDto.content;
      newPost.image_url = postDto.image_url ?? '';
      newPost.published_at = postDto.published_at
        ? new Date(postDto.published_at)
        : new Date();
      newPost.slug = slug;
      newPost.excerpt = excerpt;
      newPost.description = postDto.description ?? null;
      newPost.user = user!;
      newPost.categories = categories;
      newPost.tags = tags;
      newPost.is_published = postDto.is_published ?? true;
      return await this.postsRepository.save(newPost);
    } catch (err) {
      this.exceptionsService.handleDBExceptions(err);
    }
  }

  /** * Método para obtener todos los posts publicados para el portal */
  async findAllPublishedForPortal(): Promise<Post[] | undefined> {
    try {
      return this.postsRepository.find({
        where: { is_published: true },
        select: ['title', 'slug', 'excerpt', 'description', 'image_url', 'published_at'],
        relations: ['user', 'categories', 'tags'],
        order: { published_at: 'DESC' },
      });
    } catch (err) {
      this.exceptionsService.handleDBExceptions(err);
    }
  }

  /** * Método para obtener todos los posts en modo de revisión */
  async findAllSandbox(): Promise<Post[] | undefined> {
    try {
      return this.postsRepository.find({
        where: { sandbox: true },
        select: ['title', 'slug', 'excerpt', 'description', 'image_url', 'published_at'],
        relations: ['user', 'categories', 'tags'],
        order: { published_at: 'DESC' },
      });
    } catch (err) {
      this.exceptionsService.handleDBExceptions(err);
    }
  }

  /** * Método para obtener un post por su slug */
  async findOneBySlug(slug: string): Promise<Post | undefined | null> {
    try {
      const post = await this.postsRepository.findOne({
        where: { slug },
        relations: ['user', 'categories', 'tags'],
      });

      if (!post) {
        this.exceptionsService.handleNotFoundExceptions(slug);
      }

      return post;
    } catch (err) {
      this.exceptionsService.handleDBExceptions(err);
    }
  }

  // Nuevo método para listar posts por slug de categoría
  async findAllByCategorySlug(
    categorySlug: string,
  ): Promise<Post[] | undefined> {
    try {
      const posts = await this.postsRepository
        .createQueryBuilder('post')
        .leftJoinAndSelect('post.user', 'user')
        .leftJoinAndSelect('post.categories', 'category')
        .leftJoinAndSelect('post.tags', 'tag')
        .where('category.slug = :slug', { slug: categorySlug })
        .andWhere('post.is_published = :isPublished', { isPublished: true })
        .select([
          'post.title',
          'post.slug',
          'post.excerpt',
          'post.description',
          'post.image_url',
          'post.published_at',
          'user.id',
          'user.first_name',
          'user.last_name',
          'category.name',
          'category.slug',
          'tag.name',
          'tag.slug',
        ])
        .orderBy('post.published_at', 'DESC')
        .getMany();

      return posts;
    } catch (error) {
      this.exceptionsService.handleDBExceptions(error);
    }
  }

  // Obtener todos los posts correspondientes a una categoria en modo de revisión
  async findAllSandboxPostsByCategorySlug(categorySlug: string) {
    try {
      const posts = await this.postsRepository
        .createQueryBuilder('post')
        .leftJoinAndSelect('post.user', 'user')
        .leftJoinAndSelect('post.categories', 'category')
        .leftJoinAndSelect('post.tags', 'tag')
        .where('category.slug = :slug', { slug: categorySlug })
        .andWhere('post.sandbox = :sandbox', { sandbox: true })
        .select([
          'post.title',
          'post.slug',
          'post.excerpt',
          'post.description',
          'post.image_url',
          'post.published_at',
          'user.id',
          'user.first_name',
          'user.last_name',
          'category.name',
          'category.slug',
          'tag.name',
          'tag.slug',
        ])
        .orderBy('post.published_at', 'DESC')
        .getMany();

      return posts;
    } catch (error) {
      this.exceptionsService.handleDBExceptions(error);
    }
  }

  // Get post by ID
  async findOneById(id: string): Promise<Post | undefined | null> {
    try {
      const post = await this.postsRepository.findOne({
        where: { id: Number(id) },
        relations: ['user', 'categories', 'tags'],
      });

      if (!post) {
        this.exceptionsService.handleNotFoundExceptions(id);
      }

      return post;
    } catch (err) {
      this.exceptionsService.handleDBExceptions(err);
    }
  }

  // Publicar post
  async publishPostById(
    id: string,
    isPublished: boolean,
  ): Promise<Post | undefined> {
    try {
      const post: any = await this.postsRepository.findOne({
        where: { id: Number(id) },
      });

      if (!post) {
        this.exceptionsService.handleNotFoundExceptions(id);
      }

      // Actualiza el estado de publicación a 'true'
      post.is_published = isPublished;

      // Guarda los cambios en la base de datos
      return await this.postsRepository.save(post);
    } catch (err) {
      this.exceptionsService.handleDBExceptions(err);
    }
  }

  /** * Método para actualizar el estado de revisión de un post */
  async updateSandboxStatus(id: string, sandbox: boolean): Promise<Post | undefined> {
    try {
      const post: any = await this.postsRepository.findOne({
        where: { id: Number(id) },
      });

      // Verifica si el post existe
      if (!post) {
        this.exceptionsService.handleNotFoundExceptions(id);
      }

      // Actualiza el estado de revisión del post
      post.sandbox = sandbox;

      // Guarda los cambios en la base de datos
      return await this.postsRepository.save(post);
    } catch (err) {
      this.exceptionsService.handleDBExceptions(err);
    }
  }

  /** Actualiza el estado de validación QA de un post */
  async updateQaReviewedStatus(id: string, qaReviewed: boolean): Promise<Post | undefined> {
    try {
      const post: any = await this.postsRepository.findOne({
        where: { id: Number(id) },
      });

      if (!post) {
        this.exceptionsService.handleNotFoundExceptions(id);
      }

      post.qa_reviewed = qaReviewed;
      return await this.postsRepository.save(post);
    } catch (err) {
      this.exceptionsService.handleDBExceptions(err);
    }
  }

  /** Pone qa_reviewed en false para todos los posts (reiniciar QA) */
  async resetAllQaReviewed(): Promise<{ affected: number }> {
    const result = await this.postsRepository.update({}, { qa_reviewed: false });
    return { affected: result.affected ?? 0 };
  }

  //Actualizar post
  async updatePost(
    id: string,
    postDto: PostDto,
  ): Promise<Post | undefined | null> {
    const { categories_ids, tags_ids, ...rest } = postDto;

    try {
      const post: any = await this.postsRepository.findOne({
        where: { id: Number(id) },
      });

      if (!post) {
        this.exceptionsService.handleNotFoundExceptions(id);
      }

      // Actualiza los campos principales
      post.title = postDto.title;
      post.content = postDto.content;
      post.image_url = postDto.image_url ?? '';
      post.published_at = postDto.published_at
        ? new Date(postDto.published_at)
        : post.published_at; // Mantiene la fecha si no se provee una nueva
      /*post.slug = slugify(postDto.title, {
        lower: true,
        strict: true,
        remove: /[:.]/g,
      });*/
      post.slug = postDto.slug;
      post.excerpt = postDto.content.substring(0, 150) + '...';
      if (postDto.description !== undefined) {
        post.description = postDto.description ?? null;
      }

      // Actualiza las relaciones
      if (categories_ids?.length) {
        post.categories = await this.categoriesRepository.findBy({
          id: In(categories_ids),
        });
      }
      if (tags_ids?.length) {
        post.tags = await this.tagsRepository.findBy({ id: In(tags_ids) });
      }

      // Guarda los cambios y retorna el post actualizado
      return await this.postsRepository.save(post);
    } catch (err) {
      this.exceptionsService.handleDBExceptions(err);
    }
  }

  /**
   * Obtiene todos los posts sin filtros ni paginación.
   */
  async findAll(): Promise<Post[] | undefined> {
    try {
      return await this.postsRepository.find({
        relations: ['user', 'categories', 'tags'],
        order: { published_at: 'DESC' },
      });
    } catch (error) {
      console.error('Error al obtener los posts:', error);
      this.exceptionsService.handleDBExceptions(error);
    }
  }

  /**
   * Recorre businessenusa-migration-meta.json, busca posts por slug
   * y actualiza el campo description. Si el slug no existe, no hace nada.
   */
  async syncDescriptionsFromMigrationMeta(
    jsonPath?: string,
  ): Promise<SyncDescriptionsResult> {
    const filePath =
      jsonPath ||
      path.join(process.cwd(), 'businessenusa-migration-meta.json');
    if (!fs.existsSync(filePath)) {
      throw new Error(`Archivo no encontrado: ${filePath}`);
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const items: MigrationMetaItem[] = JSON.parse(raw);
    const result: SyncDescriptionsResult = {
      updated: 0,
      notFound: 0,
      details: [],
    };
    for (const item of items) {
      const post = await this.postsRepository.findOne({
        where: { slug: item.slug },
        select: ['id', 'slug', 'description'],
      });
      if (!post) {
        result.notFound++;
        result.details.push({ slug: item.slug, status: 'not_found' });
        continue;
      }
      post.description = item.description;
      await this.postsRepository.save(post);
      result.updated++;
      result.details.push({ slug: item.slug, status: 'updated' });
    }
    return result;
  }
}
