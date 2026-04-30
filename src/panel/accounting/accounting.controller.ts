import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { AccountingService } from './accounting.service';

@ApiTags('Panel - Accounting')
@Controller('panel/accounting')
@UseGuards(AuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Post('imports/csv')
  @Roles('admin', 'user', 'client')
  importCsv(
    @Req() req: { user: { id: number; type?: string } },
    @Body() body: { bankAccountId?: number; importedByUserId?: number; fileName: string; csv: string },
  ) {
    return this.accountingService.importCsv(req.user, body);
  }

  @Post('imports/preview')
  @Roles('admin', 'user', 'client')
  preview(@Body() body: { csv: string }) {
    return this.accountingService.previewCsv(body.csv);
  }

  @Get('categories')
  @Roles('admin', 'user', 'client')
  categories() {
    return this.accountingService.listCategories();
  }

  @Get('transactions')
  @Roles('admin', 'user', 'client')
  listTransactions(
    @Req() req: { user: { id: number; type?: string } },
    @Query('uncategorized') uncategorized?: string,
  ) {
    return this.accountingService.listTransactions(req.user, uncategorized === '1' || uncategorized === 'true');
  }

  @Patch('transactions/:id')
  @Roles('admin', 'user', 'client')
  patchTransaction(
    @Req() req: { user: { id: number; type?: string } },
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      categoryId?: number | null;
      accountCode?: string | null;
      accountingDate?: string | null;
      invoiceMatchNote?: string | null;
    },
  ) {
    return this.accountingService.patchTransaction(req.user, id, body);
  }

  @Post('suggest-category')
  @Roles('admin', 'user', 'client')
  suggest(@Body() body: { description: string }) {
    return this.accountingService.suggestCategoryByRules(body.description || '');
  }

  @Get('pl')
  @Roles('admin', 'user', 'client')
  getPl(
    @Req() req: { user: { id: number; type?: string } },
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    return this.accountingService.profitAndLoss(req.user, fromDate, toDate);
  }

  @Get('pl/export.csv')
  @Roles('admin', 'user', 'client')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportPlCsv(
    @Req() req: { user: { id: number; type?: string } },
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const csv = await this.accountingService.profitAndLossCsv(req.user, fromDate, toDate);
    res.setHeader('Content-Disposition', `attachment; filename="pl-${fromDate}-${toDate}.csv"`);
    res.send(csv);
  }
}
