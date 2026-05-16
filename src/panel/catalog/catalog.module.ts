import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogCategory } from './entities/catalog-category.entity';
import { CatalogItem } from './entities/catalog-item.entity';
import { CatalogPrice } from './entities/catalog-price.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CatalogCategory, CatalogItem, CatalogPrice])],
  controllers: [CatalogController],
  providers: [CatalogService, RolesGuard],
  exports: [CatalogService],
})
export class CatalogModule {}

