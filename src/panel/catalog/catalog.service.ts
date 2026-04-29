import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogCategory } from './entities/catalog-category.entity';
import { CatalogItem } from './entities/catalog-item.entity';
import { CatalogPrice } from './entities/catalog-price.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(CatalogCategory)
    private readonly categoriesRepo: Repository<CatalogCategory>,
    @InjectRepository(CatalogItem)
    private readonly itemsRepo: Repository<CatalogItem>,
    @InjectRepository(CatalogPrice)
    private readonly pricesRepo: Repository<CatalogPrice>,
  ) {}

  listItems() {
    return this.itemsRepo.find({ order: { createdAt: 'DESC' } });
  }

  createItem(payload: Partial<CatalogItem>) {
    return this.itemsRepo.save(this.itemsRepo.create(payload));
  }

  createCategory(payload: Partial<CatalogCategory>) {
    return this.categoriesRepo.save(this.categoriesRepo.create(payload));
  }

  createPrice(payload: Partial<CatalogPrice>) {
    return this.pricesRepo.save(this.pricesRepo.create(payload));
  }

  lookupForInvoicing() {
    return this.itemsRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect(CatalogPrice, 'price', 'price.item_id = item.id AND price.is_active = true')
      .where('item.active = true')
      .select([
        'item.id as id',
        'item.name as name',
        'item.description as description',
        'price.amount as amount',
        'price.currency as currency',
      ])
      .getRawMany();
  }
}

