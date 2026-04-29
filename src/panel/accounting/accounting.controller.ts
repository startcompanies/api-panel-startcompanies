import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { AccountingService } from './accounting.service';

@ApiTags('Panel - Accounting')
@Controller('panel/accounting')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'user')
@ApiBearerAuth('JWT-auth')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Post('imports/csv')
  importCsv(@Body() body: { bankAccountId: number; importedByUserId: number; fileName: string; csv: string }) {
    return this.accountingService.importCsv(body);
  }

  @Get('pl')
  getPl(@Query('fromDate') fromDate: string, @Query('toDate') toDate: string) {
    return this.accountingService.profitAndLoss(fromDate, toDate);
  }
}

