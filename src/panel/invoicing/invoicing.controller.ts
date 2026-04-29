import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { InvoicingService } from './invoicing.service';

@ApiTags('Panel - Invoicing')
@Controller('panel/invoicing')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client')
@ApiBearerAuth('JWT-auth')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @Get('invoices')
  listInvoices() {
    return this.invoicingService.list();
  }

  @Post('invoices')
  createInvoice(@Body() body: Record<string, unknown>) {
    return this.invoicingService.create(body as any);
  }

  @Patch('invoices/:id')
  updateInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.invoicingService.update(id, body as any);
  }

  @Post('invoices/:id/send')
  sendInvoice(@Param('id', ParseIntPipe) id: number) {
    return this.invoicingService.markAsSent(id);
  }

  @Get('invoices/:id/pdf')
  getInvoicePdf(@Param('id', ParseIntPipe) id: number) {
    return this.invoicingService.getPdf(id);
  }

  @Post('invoices/:id/payments')
  addPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { amount: number; method?: string },
  ) {
    return this.invoicingService.addPartialPayment(id, body.amount, body.method);
  }
}

