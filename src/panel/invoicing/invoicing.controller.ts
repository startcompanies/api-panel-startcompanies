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
  StreamableFile,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { InvoicingService } from './invoicing.service';
import { CreateBillingClientDto } from './dtos/create-billing-client.dto';
import { UpdateBillingClientDto } from './dtos/update-billing-client.dto';

@ApiTags('Panel - Invoicing')
@Controller('panel/invoicing')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client')
@ApiBearerAuth('JWT-auth')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @Get('billing-clients')
  listBillingClients(@Req() req: { user: { id: number } }) {
    return this.invoicingService.listBillingClients(req.user.id);
  }

  @Post('billing-clients')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  createBillingClient(@Req() req: { user: { id: number } }, @Body() body: CreateBillingClientDto) {
    return this.invoicingService.createBillingClient(req.user.id, body);
  }

  @Patch('billing-clients/:id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  updateBillingClient(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateBillingClientDto,
  ) {
    return this.invoicingService.updateBillingClient(id, req.user.id, body);
  }

  @Delete('billing-clients/:id')
  deleteBillingClient(@Req() req: { user: { id: number } }, @Param('id', ParseIntPipe) id: number) {
    return this.invoicingService.deleteBillingClient(id, req.user.id);
  }

  @Get('invoices')
  listInvoices(@Req() req: { user: { id: number } }) {
    return this.invoicingService.listForUser(req.user.id);
  }

  @Get('invoices/:id')
  getInvoice(@Req() req: { user: { id: number } }, @Param('id', ParseIntPipe) id: number) {
    return this.invoicingService.getOneForUser(id, req.user.id);
  }

  @Post('invoices')
  createInvoice(@Req() req: { user: { id: number } }, @Body() body: Record<string, unknown>) {
    return this.invoicingService.createForUser(req.user.id, body as any);
  }

  @Patch('invoices/:id')
  updateInvoice(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.invoicingService.updateForUser(id, req.user.id, body as any);
  }

  @Delete('invoices/:id')
  deleteInvoice(@Req() req: { user: { id: number } }, @Param('id', ParseIntPipe) id: number) {
    return this.invoicingService.deleteInvoice(id, req.user.id);
  }

  @Post('invoices/:id/send')
  sendInvoice(@Req() req: { user: { id: number } }, @Param('id', ParseIntPipe) id: number) {
    return this.invoicingService.markAsSent(id, req.user.id);
  }

  @Post('invoices/:id/void')
  voidInvoice(@Req() req: { user: { id: number } }, @Param('id', ParseIntPipe) id: number) {
    return this.invoicingService.voidInvoice(id, req.user.id);
  }

  @Get('invoices/:id/pdf')
  async getInvoicePdf(@Req() req: { user: { id: number } }, @Param('id', ParseIntPipe) id: number) {
    const buf = await this.invoicingService.getPdfBuffer(id, req.user.id);
    return new StreamableFile(buf, {
      type: 'application/pdf',
      disposition: `attachment; filename="invoice-${id}.pdf"`,
    });
  }

  @Post('invoices/:id/payments')
  addPayment(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { amount: number; method?: string },
  ) {
    return this.invoicingService.addPartialPayment(id, req.user.id, body.amount, body.method);
  }

  @Get('invoices/:id/payments')
  listPayments(@Req() req: { user: { id: number } }, @Param('id', ParseIntPipe) id: number) {
    return this.invoicingService.listPayments(id, req.user.id);
  }

  @Patch('invoices/:id/payments/:paymentId')
  updatePayment(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Body() body: { amount?: number; method?: string | null; paidAt?: string | null },
  ) {
    return this.invoicingService.updatePayment(id, paymentId, req.user.id, body ?? {});
  }

  @Delete('invoices/:id/payments/:paymentId')
  removePayment(
    @Req() req: { user: { id: number } },
    @Param('id', ParseIntPipe) id: number,
    @Param('paymentId', ParseIntPipe) paymentId: number,
  ) {
    return this.invoicingService.deletePayment(id, paymentId, req.user.id);
  }
}
