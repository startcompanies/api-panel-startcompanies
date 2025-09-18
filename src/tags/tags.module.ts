import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tag } from './entities/tag.entity';

@Module({
    controllers: [TagsController],
    providers: [TagsService],
    imports: [
        TypeOrmModule.forFeature([Tag])
    ]
})
export class TagsModule {}
