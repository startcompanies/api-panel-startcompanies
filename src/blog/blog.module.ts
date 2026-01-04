import { Module } from '@nestjs/common';
import { PostsModule } from './posts/posts.module';
import { CategoriesModule } from './categories/categories.module';
import { TagsModule } from './tags/tags.module';
import { ReusableElementsModule } from './reusable-elements/reusable-elements.module';

/**
 * Módulo wrapper que agrupa todos los módulos relacionados con el Blog
 * Separado del Panel para mejor organización y mantenibilidad
 */
@Module({
  imports: [
    PostsModule,
    CategoriesModule,
    TagsModule,
    ReusableElementsModule,
  ],
  exports: [
    PostsModule,
    CategoriesModule,
    TagsModule,
    ReusableElementsModule,
  ],
})
export class BlogModule {}








