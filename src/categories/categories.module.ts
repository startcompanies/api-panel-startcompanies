import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.services';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { HandleExceptionsService } from 'src/common/common.service';

@Module({
    controllers: [CategoriesController],
    providers: [CategoriesService, HandleExceptionsService],
    imports: [
        TypeOrmModule.forFeature([Category])
    ]
})
export class CategoriesModule {}
