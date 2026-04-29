import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoiceEvent } from './entities/invoice-event.entity';
import { InvoicePayment } from './entities/invoice-payment.entity';

@Injectable()
export class InvoicingService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(InvoicePayment)
    private readonly paymentsRepo: Repository<InvoicePayment>,
    @InjectRepository(InvoiceEvent)
    private readonly eventsRepo: Repository<InvoiceEvent>,
  ) {}

  list() {
    return this.invoicesRepo.find({ order: { createdAt: 'DESC' } });
  }

  create(payload: Partial<Invoice>) {
    const invoice = this.invoicesRepo.create(payload);
    return this.invoicesRepo.save(invoice);
  }

  async update(id: number, payload: Partial<Invoice>) {
    const invoice = await this.invoicesRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice no encontrada');
    Object.assign(invoice, payload);
    return this.invoicesRepo.save(invoice);
  }

  async addPartialPayment(invoiceId: number, amount: number, method?: string) {
    const invoice = await this.invoicesRepo.findOne({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice no encontrada');
    const payment = this.paymentsRepo.create({ invoiceId, amount, method: method ?? null });
    await this.paymentsRepo.save(payment);
    invoice.paidAmount = Number(invoice.paidAmount) + Number(amount);
    if (invoice.paidAmount > 0 && invoice.paidAmount < invoice.totalAmount) invoice.status = 'partial';
    if (invoice.paidAmount >= invoice.totalAmount) invoice.status = 'paid';
    await this.eventsRepo.save(
      this.eventsRepo.create({
        invoiceId,
        eventType: 'partial_payment',
        payload: { amount, method: method ?? null },
      }),
    );
    return this.invoicesRepo.save(invoice);
  }

  async markAsSent(id: number) {
    return this.update(id, { status: 'sent', sentAt: new Date() });
  }

  async getPdf(id: number) {
    const invoice = await this.invoicesRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice no encontrada');
    return {
      invoiceId: id,
      pdfUrl: invoice.pdfUrl ?? `https://example.local/invoices/${id}.pdf`,
    };
  }
}

