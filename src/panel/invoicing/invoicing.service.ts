import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { InvoiceEvent } from './entities/invoice-event.entity';
import { InvoicePayment } from './entities/invoice-payment.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { ClientCompanyProfile } from '../settings/entities/client-company-profile.entity';
import { InvoicePdfService } from './invoice-pdf.service';

export type InvoiceLineInput = {
  productName?: string;
  description: string;
  unitMeasure?: string;
  qty: number;
  unitPrice: number;
  discountPercent?: number;
};

@Injectable()
export class InvoicingService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly itemsRepo: Repository<InvoiceItem>,
    @InjectRepository(InvoicePayment)
    private readonly paymentsRepo: Repository<InvoicePayment>,
    @InjectRepository(InvoiceEvent)
    private readonly eventsRepo: Repository<InvoiceEvent>,
    @InjectRepository(ClientCompanyProfile)
    private readonly companyRepo: Repository<ClientCompanyProfile>,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  private lineTotal(qty: number, unitPrice: number, discountPercent: number): number {
    const base = Number(qty) * Number(unitPrice);
    const d = Number(discountPercent || 0);
    return Math.round(base * (1 - d / 100) * 100) / 100;
  }

  /** Descripción obligatoria en BD; si solo viene producto, se usa como descripción. product_name se conserva si viene informado. */
  private normalizeLineInput(row: InvoiceLineInput): InvoiceLineInput {
    const desc = (row.description?.trim() || row.productName?.trim() || '').trim();
    const pn = row.productName?.trim();
    return {
      ...row,
      description: desc,
      productName: pn ? pn : undefined,
    };
  }

  private async assertInvoiceOwner(invoiceId: number, userId: number): Promise<Invoice> {
    const inv = await this.invoicesRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.items', 'items')
      .where('inv.id = :id', { id: invoiceId })
      .andWhere('(inv.ownerUserId = :uid OR inv.issuedByUserId = :uid)', { uid: userId })
      .orderBy('items.id', 'ASC')
      .getOne();
    if (!inv) throw new NotFoundException('Invoice no encontrada');
    return inv;
  }

  /** JSON seguro (sin ref. circular item.invoice) + fechas/números estables para el cliente. */
  serializeInvoiceForClient(inv: Invoice): Record<string, unknown> {
    return {
      id: inv.id,
      clientId: inv.clientId,
      ownerUserId: inv.ownerUserId,
      issuedByUserId: inv.issuedByUserId,
      invoiceNumber: inv.invoiceNumber,
      billTo: inv.billTo,
      paymentInstructions: inv.paymentInstructions,
      taxRate: inv.taxRate != null ? Number(inv.taxRate) : 0,
      taxLabel: inv.taxLabel,
      issueDate: this.formatDateOnly(inv.issueDate),
      dueDate: this.formatDateOnly(inv.dueDate),
      status: inv.status,
      currency: inv.currency,
      subtotalAmount: inv.subtotalAmount != null ? Number(inv.subtotalAmount) : 0,
      taxAmount: inv.taxAmount != null ? Number(inv.taxAmount) : 0,
      totalAmount: inv.totalAmount != null ? Number(inv.totalAmount) : 0,
      paidAmount: inv.paidAmount != null ? Number(inv.paidAmount) : 0,
      sentAt: inv.sentAt,
      pdfUrl: inv.pdfUrl,
      notes: inv.notes,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
      items: (inv.items ?? []).map((it) => ({
        id: it.id,
        invoiceId: it.invoiceId,
        productName: it.productName,
        description: it.description,
        unitMeasure: it.unitMeasure,
        discountPercent: it.discountPercent != null ? Number(it.discountPercent) : 0,
        qty: it.qty != null ? Number(it.qty) : 0,
        unitPrice: it.unitPrice != null ? Number(it.unitPrice) : 0,
        lineTotal: it.lineTotal != null ? Number(it.lineTotal) : 0,
        createdAt: it.createdAt,
      })),
    };
  }

  private formatDateOnly(v: string | Date | null | undefined): string | null {
    if (v == null || v === '') return null;
    if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).slice(0, 10);
  }

  async listForUser(userId: number) {
    const rows = await this.invoicesRepo.find({
      where: [{ ownerUserId: userId }, { issuedByUserId: userId }],
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.serializeInvoiceForClient(r));
  }

  async getOneForUser(invoiceId: number, userId: number) {
    const inv = await this.assertInvoiceOwner(invoiceId, userId);
    return this.serializeInvoiceForClient(inv);
  }

  private async nextInvoiceNumber(userId: number): Promise<string> {
    const n = await this.invoicesRepo.count({ where: { ownerUserId: userId } });
    const y = new Date().getFullYear();
    return `SC-${y}-${String(n + 1).padStart(4, '0')}`;
  }

  private computeTotals(
    items: InvoiceLineInput[],
    taxRate: number,
  ): { subtotal: number; taxAmount: number; total: number } {
    const subtotal = items.reduce(
      (acc, row) => acc + this.lineTotal(row.qty, row.unitPrice, row.discountPercent ?? 0),
      0,
    );
    const rate = Number(taxRate || 0);
    const taxAmount = Math.round(subtotal * rate * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    return { subtotal, taxAmount, total };
  }

  private async paymentSnapshotFromCompany(userId: number): Promise<Record<string, unknown>> {
    const row = await this.companyRepo.findOne({ where: { userId } });
    if (!row) return {};
    return {
      bankName: row.bankName,
      accountNumber: row.accountNumber,
      routingAch: row.routingAch,
      swift: row.swift,
      iban: row.iban,
      zelleOrPaypal: row.zelleOrPaypal,
    };
  }

  async createForUser(
    userId: number,
    body: {
      currency?: string;
      issueDate?: string;
      dueDate?: string | null;
      taxRate?: number;
      taxLabel?: string | null;
      notes?: string | null;
      billTo?: Record<string, unknown> | null;
      paymentInstructions?: Record<string, unknown> | null;
      status?: InvoiceStatus;
      items?: InvoiceLineInput[];
    },
  ) {
    const items = (body.items ?? []).map((r) => this.normalizeLineInput(r));
    if (items.some((i) => !i.description)) {
      throw new BadRequestException('Cada línea requiere descripción o nombre de producto/servicio');
    }
    const taxRate = body.taxRate !== undefined ? Number(body.taxRate) : 0;
    const { subtotal, taxAmount, total } = this.computeTotals(items, taxRate);
    const paymentInstructions =
      body.paymentInstructions ?? (await this.paymentSnapshotFromCompany(userId));
    const invoiceNumber = await this.nextInvoiceNumber(userId);
    const issueDate = body.issueDate ?? new Date().toISOString().slice(0, 10);

    return this.invoicesRepo.manager.transaction(async (em) => {
      const inv = em.create(Invoice, {
        clientId: null,
        ownerUserId: userId,
        issuedByUserId: userId,
        invoiceNumber,
        billTo: body.billTo ?? null,
        paymentInstructions,
        taxRate,
        taxLabel: body.taxLabel ?? (taxRate === 0 ? '0% — No ECI' : null),
        issueDate,
        status: body.status ?? 'draft',
        currency: (body.currency || 'USD').slice(0, 3).toUpperCase(),
        subtotalAmount: subtotal,
        taxAmount,
        totalAmount: total,
        paidAmount: 0,
        dueDate: body.dueDate ?? null,
        notes: body.notes ?? null,
      });
      const saved = await em.save(inv);
      for (const row of items) {
        const lineTotal = this.lineTotal(row.qty, row.unitPrice, row.discountPercent ?? 0);
        await em.save(
          em.create(InvoiceItem, {
            invoiceId: saved.id,
            productName: row.productName?.trim() || null,
            description: row.description.trim(),
            unitMeasure: row.unitMeasure?.trim() || 'u',
            discountPercent: row.discountPercent ?? 0,
            qty: row.qty,
            unitPrice: row.unitPrice,
            lineTotal,
          }),
        );
      }
      const full = await em.findOne(Invoice, { where: { id: saved.id }, relations: { items: true } });
      if (!full) throw new InternalServerErrorException('Factura no recuperada tras crear');
      return this.serializeInvoiceForClient(full);
    });
  }

  async updateForUser(
    invoiceId: number,
    userId: number,
    body: {
      currency?: string;
      issueDate?: string;
      dueDate?: string | null;
      taxRate?: number;
      taxLabel?: string | null;
      notes?: string | null;
      billTo?: Record<string, unknown> | null;
      paymentInstructions?: Record<string, unknown> | null;
      status?: InvoiceStatus;
      items?: InvoiceLineInput[];
    },
  ) {
    const inv = await this.assertInvoiceOwner(invoiceId, userId);
    if (inv.status === 'paid' || inv.status === 'void') {
      throw new BadRequestException('No se puede editar esta factura');
    }
    const rawItems =
      body.items !== undefined
        ? body.items
        : (inv.items?.map((r) => ({
            productName: r.productName ?? undefined,
            description: r.description,
            unitMeasure: r.unitMeasure,
            qty: Number(r.qty),
            unitPrice: Number(r.unitPrice),
            discountPercent: Number(r.discountPercent),
          })) ?? []);
    const items = rawItems.map((r) => this.normalizeLineInput(r));
    if (items.some((i) => !i.description)) {
      throw new BadRequestException('Cada línea requiere descripción o nombre de producto/servicio');
    }
    const taxRate = body.taxRate !== undefined ? Number(body.taxRate) : Number(inv.taxRate);
    const { subtotal, taxAmount, total } = this.computeTotals(items, taxRate);

    return this.invoicesRepo.manager.transaction(async (em) => {
      await em.delete(InvoiceItem, { invoiceId: inv.id });
      /* Sin esto, cascade en Invoice.items vuelve a persistir las líneas viejas en memoria + las nuevas del bucle. */
      inv.items = [];
      if (body.currency !== undefined) inv.currency = body.currency.slice(0, 3).toUpperCase();
      if (body.issueDate !== undefined) inv.issueDate = body.issueDate;
      if (body.dueDate !== undefined) inv.dueDate = body.dueDate;
      if (body.taxLabel !== undefined) inv.taxLabel = body.taxLabel;
      if (body.notes !== undefined) inv.notes = body.notes;
      if (body.billTo !== undefined) inv.billTo = body.billTo;
      if (body.paymentInstructions !== undefined) inv.paymentInstructions = body.paymentInstructions;
      if (body.status !== undefined) inv.status = body.status;
      inv.taxRate = taxRate;
      inv.subtotalAmount = subtotal;
      inv.taxAmount = taxAmount;
      inv.totalAmount = total;
      await em.save(inv);
      for (const row of items) {
        const lineTotal = this.lineTotal(row.qty, row.unitPrice, row.discountPercent ?? 0);
        await em.save(
          em.create(InvoiceItem, {
            invoiceId: inv.id,
            productName: row.productName?.trim() || null,
            description: row.description.trim(),
            unitMeasure: row.unitMeasure?.trim() || 'u',
            discountPercent: row.discountPercent ?? 0,
            qty: row.qty,
            unitPrice: row.unitPrice,
            lineTotal,
          }),
        );
      }
      const full = await em.findOne(Invoice, { where: { id: inv.id }, relations: { items: true } });
      if (!full) throw new InternalServerErrorException('Factura no recuperada tras actualizar');
      return this.serializeInvoiceForClient(full);
    });
  }

  async addPartialPayment(invoiceId: number, userId: number, amount: number, method?: string) {
    const invoice = await this.assertInvoiceOwner(invoiceId, userId);
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
    await this.invoicesRepo.save(invoice);
    const full = await this.assertInvoiceOwner(invoiceId, userId);
    return this.serializeInvoiceForClient(full);
  }

  async markAsSent(id: number, userId: number) {
    const inv = await this.assertInvoiceOwner(id, userId);
    inv.status = 'sent';
    inv.sentAt = new Date();
    await this.invoicesRepo.save(inv);
    const full = await this.assertInvoiceOwner(id, userId);
    return this.serializeInvoiceForClient(full);
  }

  async getPdfBuffer(id: number, userId: number): Promise<Buffer> {
    const invoice = await this.assertInvoiceOwner(id, userId);
    const company = await this.companyRepo.findOne({ where: { userId } });
    return this.invoicePdfService.buildInvoicePdf(invoice, company);
  }
}
