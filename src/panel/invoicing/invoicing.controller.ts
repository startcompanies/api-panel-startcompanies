import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
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

  @Post('invoices/:id/send')
  sendInvoice(@Req() req: { user: { id: number } }, @Param('id', ParseIntPipe) id: number) {
    return this.invoicingService.markAsSent(id, req.user.id);
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
}
