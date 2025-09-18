import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from './entities/post.entity';
import { User } from '../user/entities/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { HandleExceptionsService } from 'src/common/common.service';

@Module({
    controllers: [PostsController],
    providers: [PostsService, HandleExceptionsService],
    imports: [TypeOrmModule.forFeature([Post, User, Category, Tag])]
})
export class PostsModule {}
