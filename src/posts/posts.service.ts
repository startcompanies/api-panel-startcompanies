import { InjectRepository } from '@nestjs/typeorm';
import { Post } from './entities/post.entity';
import { Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { Category } from 'src/categories/entities/category.entity';
import { Tag } from 'src/tags/entities/tag.entity';
import { HandleExceptionsService } from 'src/common/common.service';
import { PostDto } from './dtos/post.dto';
import slugify from 'slugify';

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
  ) {}

  async create(postDto: PostDto, userId: string): Promise<Post | undefined> {
    const { categories_ids, tags_ids, ...rest } = postDto;

    try {
      const user = await this.userRepository.findOne({
        where: { id: Number(userId) },
      });
      if (!user) {
        this.exceptionsService.handleNotFoundExceptions(Number(userId));
      }

      const categories = await this.categoriesRepository.findByIds(
        categories_ids || [],
      );
      const tags = await this.categoriesRepository.findByIds(tags_ids || []);

      const slug = slugify(postDto.title, { lower: true });
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
      newPost.user = user!;
      newPost.categories = categories;
      newPost.tags = tags;
      return await this.postsRepository.save(newPost);
    } catch (err) {
      this.exceptionsService.handleDBExceptions(err);
    }
  }

  async findAllPublishedForPortal(): Promise<Post[] | undefined> {
    try {
      return this.postsRepository.find({
        where: { is_published: true },
        select: ['title', 'slug', 'excerpt', 'image_url', 'published_at'],
        relations: ['user', 'categories', 'tags'],
        order: { published_at: 'DESC' },
      });
    } catch (err) {
      this.exceptionsService.handleDBExceptions(err);
    }
  }

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
  async findAllByCategorySlug(categorySlug: string): Promise<Post[] | undefined> {
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
          'post.image_url',
          'post.published_at',
          'user.id',
          'user.first_name',
          'user.last_name',
          'category.name',
          'category.slug',
          'tag.name',
          'tag.slug'
        ])
        .orderBy('post.published_at', 'DESC')
        .getMany();

      return posts;
    } catch (error) {
      this.exceptionsService.handleDBExceptions(error);
    }
  }
}
