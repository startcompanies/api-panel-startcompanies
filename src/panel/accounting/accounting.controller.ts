import {
  Body,
  Controller,
  Delete,
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
import { BulkApplySuggestionsDto } from './dtos/bulk-apply-suggestions.dto';

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
  preview(@Body() body: { csv: string; fileName?: string }) {
    return this.accountingService.previewCsv(body.csv, body.fileName);
  }

  @Get('categories')
  @Roles('admin', 'user', 'client')
  categories() {
    return this.accountingService.listCategories();
  }

  @Get('account-catalog')
  @Roles('admin', 'user', 'client')
  accountCatalog() {
    return this.accountingService.listAccountCatalog();
  }

  @Post('account-catalog')
  @Roles('admin', 'user')
  createAccountCatalog(
    @Body()
    body: {
      code: string;
      name: string;
      type: 'income' | 'expense' | 'other';
      plSection?: string;
      plGroup?: string;
      orderIndex?: number;
      active?: boolean;
    },
  ) {
    return this.accountingService.createAccountCatalogEntry(body);
  }

  @Patch('account-catalog/:id')
  @Roles('admin', 'user')
  updateAccountCatalog(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      code?: string;
      name?: string;
      type?: 'income' | 'expense' | 'other';
      plSection?: string | null;
      plGroup?: string | null;
      orderIndex?: number;
      active?: boolean;
    },
  ) {
    return this.accountingService.updateAccountCatalogEntry(id, body);
  }

  @Delete('account-catalog/:id')
  @Roles('admin', 'user')
  deleteAccountCatalog(@Param('id', ParseIntPipe) id: number) {
    return this.accountingService.deleteAccountCatalogEntry(id);
  }

  @Get('transactions')
  @Roles('admin', 'user', 'client')
  listTransactions(
    @Req() req: { user: { id: number; type?: string } },
    @Query('uncategorized') uncategorized?: string,
    @Query('needsReview') needsReview?: string,
  ) {
    const nr = needsReview === '1' || needsReview === 'true';
    if (nr) {
      return this.accountingService.listTransactions(req.user, { needsReview: true });
    }
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
  suggest(
    @Req() req: { user: { id: number; type?: string } },
    @Body() body: { description: string; amount?: number },
  ) {
    return this.accountingService.suggestCategory(req.user, body.description || '', body.amount);
  }

  @Post('transactions/bulk-apply-suggestions')
  @Roles('admin', 'user', 'client')
  bulkApply(
    @Req() req: { user: { id: number; type?: string } },
    @Body() body: BulkApplySuggestionsDto,
  ) {
    return this.accountingService.bulkApplySuggestedCategories(req.user, body ?? {});
  }

  @Post('transactions/bulk-approve-suggestions')
  @Roles('admin', 'user', 'client')
  bulkApproveSuggestions(@Req() req: { user: { id: number; type?: string } }) {
    return this.accountingService.bulkApproveSuggestions(req.user);
  }

  @Post('transactions/:id/approve-suggestion')
  @Roles('admin', 'user', 'client')
  approveSuggestion(
    @Req() req: { user: { id: number; type?: string } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accountingService.approveSuggestion(req.user, id);
  }

  @Post('transactions/:id/reject-suggestion')
  @Roles('admin', 'user', 'client')
  rejectSuggestion(
    @Req() req: { user: { id: number; type?: string } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accountingService.rejectSuggestion(req.user, id);
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
    res.setHeader('Content-Disposition', `attachment; filename="pl-resumen-${fromDate}-${toDate}.csv"`);
    res.send(csv);
  }

  @Get('pl/transactions.csv')
  @Roles('admin', 'user', 'client')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportPlTransactionsCsv(
    @Req() req: { user: { id: number; type?: string } },
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const csv = await this.accountingService.profitAndLossTransactionsCsv(req.user, fromDate, toDate);
    res.setHeader('Content-Disposition', `attachment; filename="pl-movimientos-${fromDate}-${toDate}.csv"`);
    res.send(csv);
  }
}
