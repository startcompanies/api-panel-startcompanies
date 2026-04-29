import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { CatalogService } from './catalog.service';

@ApiTags('Panel - Catalog')
@Controller('panel/catalog')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'user')
@ApiBearerAuth('JWT-auth')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('items')
  listItems() {
    return this.catalogService.listItems();
  }

  @Post('items')
  createItem(@Body() body: Record<string, unknown>) {
    return this.catalogService.createItem(body as any);
  }

  @Post('categories')
  createCategory(@Body() body: Record<string, unknown>) {
    return this.catalogService.createCategory(body as any);
  }

  @Post('prices')
  createPrice(@Body() body: Record<string, unknown>) {
    return this.catalogService.createPrice(body as any);
  }

  @Get('lookup/invoicing')
  lookupForInvoicing() {
    return this.catalogService.lookupForInvoicing();
  }
}

