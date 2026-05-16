import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { CatalogService } from './catalog.service';

@ApiTags('Panel - Catalog')
@Controller('panel/catalog')
@UseGuards(AuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('items')
  @Roles('admin', 'user')
  listItems() {
    return this.catalogService.listItems();
  }

  @Post('items')
  @Roles('admin', 'user')
  createItem(@Body() body: Record<string, unknown>) {
    return this.catalogService.createItem(body as any);
  }

  @Post('categories')
  @Roles('admin', 'user')
  createCategory(@Body() body: Record<string, unknown>) {
    return this.catalogService.createCategory(body as any);
  }

  @Post('prices')
  @Roles('admin', 'user')
  createPrice(@Body() body: Record<string, unknown>) {
    return this.catalogService.createPrice(body as any);
  }

  @Get('lookup/invoicing')
  @Roles('admin', 'user')
  lookupForInvoicing() {
    return this.catalogService.lookupForInvoicing();
  }

  @Get('my/items')
  @Roles('client')
  listMyItems(@Req() req: { user: { id: number } }) {
    return this.catalogService.listMyItems(req.user.id);
  }

  @Post('my/items')
  @Roles('client')
  createMyItem(
    @Req() req: { user: { id: number } },
    @Body()
    body: { name: string; description?: string; unitMeasure?: string; unitPriceUsd?: number },
  ) {
    return this.catalogService.createMyItem(req.user.id, body);
  }

  @Patch('my/items/:id')
  @Roles('client')
  updateMyItem(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: { name?: string; description?: string; unitMeasure?: string; unitPriceUsd?: number; active?: boolean },
  ) {
    return this.catalogService.updateMyItem(req.user.id, id, body);
  }

  @Delete('my/items/:id')
  @Roles('client')
  deleteMyItem(@Req() req: { user: { id: number } }, @Param('id', ParseIntPipe) id: number) {
    return this.catalogService.deleteMyItem(req.user.id, id);
  }

  @Get('my/lookup/invoicing')
  @Roles('client')
  lookupMyForInvoicing(@Req() req: { user: { id: number } }) {
    return this.catalogService.lookupMyForInvoicing(req.user.id);
  }
}
