import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
      .leftJoin(CatalogPrice, 'price', 'price.item_id = item.id AND price.is_active = true')
      .where('item.active = true')
      .select([
        'item.id as id',
        'item.name as name',
        'item.description as description',
        'item.unit_measure as "unitMeasure"',
        'price.amount as amount',
        'price.currency as currency',
      ])
      .getRawMany();
  }

  async listMyItems(ownerUserId: number) {
    return this.itemsRepo.find({
      where: { ownerUserId },
      order: { createdAt: 'DESC' },
    });
  }

  private async assertMyItem(ownerUserId: number, id: number): Promise<CatalogItem> {
    const row = await this.itemsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Item no encontrado');
    if (row.ownerUserId !== ownerUserId) throw new ForbiddenException('No autorizado');
    return row;
  }

  async createMyItem(
    ownerUserId: number,
    body: { name: string; description?: string; unitMeasure?: string; unitPriceUsd?: number },
  ) {
    const item = await this.itemsRepo.save(
      this.itemsRepo.create({
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        unitMeasure: body.unitMeasure?.trim() || 'u',
        ownerUserId,
        active: true,
      }),
    );
    const price = Number(body.unitPriceUsd ?? 0);
    if (price > 0) {
      await this.pricesRepo.save(
        this.pricesRepo.create({
          itemId: item.id,
          amount: price,
          currency: 'USD',
          isActive: true,
        }),
      );
    }
    return this.findMyItemWithPrice(ownerUserId, item.id);
  }

  async updateMyItem(
    ownerUserId: number,
    id: number,
    body: { name?: string; description?: string; unitMeasure?: string; unitPriceUsd?: number; active?: boolean },
  ) {
    const row = await this.assertMyItem(ownerUserId, id);
    if (body.name !== undefined) row.name = body.name.trim();
    if (body.description !== undefined) row.description = body.description?.trim() ?? null;
    if (body.unitMeasure !== undefined) row.unitMeasure = body.unitMeasure?.trim() || 'u';
    if (body.active !== undefined) row.active = body.active;
    await this.itemsRepo.save(row);
    if (body.unitPriceUsd !== undefined) {
      await this.pricesRepo.update({ itemId: id, isActive: true }, { isActive: false });
      if (Number(body.unitPriceUsd) > 0) {
        await this.pricesRepo.save(
          this.pricesRepo.create({
            itemId: id,
            amount: Number(body.unitPriceUsd),
            currency: 'USD',
            isActive: true,
          }),
        );
      }
    }
    return this.findMyItemWithPrice(ownerUserId, id);
  }

  async deleteMyItem(ownerUserId: number, id: number) {
    await this.assertMyItem(ownerUserId, id);
    await this.pricesRepo.delete({ itemId: id });
    await this.itemsRepo.delete({ id });
    return { ok: true };
  }

  private async findMyItemWithPrice(ownerUserId: number, id: number) {
    await this.assertMyItem(ownerUserId, id);
    const raw = await this.itemsRepo
      .createQueryBuilder('item')
      .leftJoin(CatalogPrice, 'price', 'price.item_id = item.id AND price.is_active = true')
      .where('item.id = :id', { id })
      .select([
        'item.id as id',
        'item.name as name',
        'item.description as description',
        'item.unit_measure as "unitMeasure"',
        'item.active as active',
        'price.amount as "unitPriceUsd"',
      ])
      .getRawOne();
    return raw;
  }

  lookupMyForInvoicing(ownerUserId: number) {
    return this.itemsRepo
      .createQueryBuilder('item')
      .leftJoin(CatalogPrice, 'price', 'price.item_id = item.id AND price.is_active = true')
      .where('item.active = true')
      .andWhere('item.owner_user_id = :uid', { uid: ownerUserId })
      .select([
        'item.id as id',
        'item.name as name',
        'item.description as description',
        'item.unit_measure as "unitMeasure"',
        'price.amount as amount',
        'price.currency as currency',
      ])
      .getRawMany();
  }
}
