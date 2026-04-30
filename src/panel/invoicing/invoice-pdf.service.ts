import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Invoice } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { ClientCompanyProfile } from '../settings/entities/client-company-profile.entity';

const ACCENT = '#0077b6';
const NAVY = '#023e8a';
const CYAN = '#00b4d8';
const SLATE = '#64748b';
const INK = '#0f172a';
const MUTED_BG = '#f1f5f9';
const PAGE_W = 612;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  async buildInvoicePdf(
    invoice: Invoice & { items?: InvoiceItem[] },
    company: ClientCompanyProfile | null,
  ): Promise<Buffer> {
    const items = invoice.items ?? [];
    const logoBuf = await this.fetchLogoBuffer(company?.logoUrl);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: MARGIN,
        info: { Title: `Invoice ${invoice.invoiceNumber || invoice.id}` },
      });
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const issuerName = company?.legalName || '—';
      const addr = company?.address || '';
      const ein = company?.ein ? `EIN: ${company.ein}` : '';
      const invNo = invoice.invoiceNumber || String(invoice.id);
      const issue =
        invoice.issueDate ||
        (invoice.createdAt && String(invoice.createdAt).slice(0, 10)) ||
        '—';

      let y = 0;

      // Franja superior marca
      doc.rect(0, 0, PAGE_W, 8).fill(ACCENT);
      y = 28;

      const headerTop = y;
      const logoSlotW = 118;
      const logoSlotH = 56;
      let textLeft = MARGIN;

      if (logoBuf) {
        try {
          doc.roundedRect(MARGIN, y, logoSlotW, logoSlotH, 6).fill('#ffffff').stroke('#e2e8f0');
          doc.image(logoBuf, MARGIN + 4, y + 4, { fit: [logoSlotW - 8, logoSlotH - 8] });
          textLeft = MARGIN + logoSlotW + 16;
        } catch (e) {
          this.logger.warn(`Logo PDF omitido: ${(e as Error).message}`);
        }
      }

      // Emisor (izquierda)
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(issuerName, textLeft, y, {
        width: 260,
        lineGap: 2,
      });
      y = doc.y + 2;
      doc.font('Helvetica').fontSize(9).fillColor(SLATE).text(addr || ' ', textLeft, y, { width: 280, lineGap: 2 });
      y = doc.y + 2;
      if (ein) {
        doc.text(ein, textLeft, y, { width: 280 });
        y = doc.y;
      }

      // Título factura (derecha, misma banda vertical que cabecera)
      const rightBlockX = MARGIN + 300;
      const rightBlockW = CONTENT_W - 300;
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(24).text('INVOICE', rightBlockX, headerTop, {
        width: rightBlockW,
        align: 'right',
      });
      doc.font('Helvetica').fontSize(10).fillColor(SLATE).text(`No. ${invNo}`, rightBlockX, headerTop + 30, {
        width: rightBlockW,
        align: 'right',
      });

      y = Math.max(y, headerTop + logoSlotH + 8) + 8;

      // Fechas en “píldoras”
      const pillH = 22;
      const pillY = y;
      doc.roundedRect(MARGIN, pillY, 168, pillH, 4).fill(MUTED_BG);
      doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(7).text('ISSUE DATE', MARGIN + 10, pillY + 4);
      doc.fillColor(INK).font('Helvetica').fontSize(9).text(issue, MARGIN + 10, pillY + 11, { width: 148 });

      if (invoice.dueDate) {
        doc.roundedRect(MARGIN + 180, pillY, 168, pillH, 4).fill(MUTED_BG);
        doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(7).text('DUE DATE', MARGIN + 190, pillY + 4);
        doc.fillColor(INK).font('Helvetica').fontSize(9).text(String(invoice.dueDate), MARGIN + 190, pillY + 11, {
          width: 148,
        });
      }

      y = pillY + pillH + 18;

      // Bill to — tarjeta
      const bt = invoice.billTo || {};
      const billLines = [
        String(bt['companyName'] || bt['name'] || ''),
        String(bt['ein'] || bt['taxId'] || ''),
        String(bt['address'] || ''),
        String(bt['email'] || ''),
        String(bt['phone'] || ''),
      ].filter(Boolean);
      const billLabel = 'Bill to';
      doc.font('Helvetica-Bold').fontSize(8).fillColor(SLATE).text(billLabel, MARGIN, y);
      y += 12;
      const billInner = billLines.length ? billLines.join('\n') : '—';
      doc.font('Helvetica').fontSize(9);
      const billTextH = Math.max(36, doc.heightOfString(billInner, { width: CONTENT_W - 24 }) + 20);
      const billCardH = billTextH;
      doc.save();
      doc.fillColor('#ffffff').roundedRect(MARGIN, y, CONTENT_W, billCardH, 8).fill();
      doc.strokeColor('#e2e8f0').lineWidth(1).roundedRect(MARGIN, y, CONTENT_W, billCardH, 8).stroke();
      doc.fillColor(CYAN).rect(MARGIN, y, 5, billCardH).fill();
      doc.restore();
      doc.fillColor(INK).font('Helvetica').fontSize(9).text(billInner, MARGIN + 16, y + 10, {
        width: CONTENT_W - 32,
        lineGap: 3,
      });
      y += billCardH + 20;

      // Tabla líneas
      const colItem = MARGIN;
      const wItem = 232;
      const colQty = colItem + wItem;
      const wQty = 44;
      const colUm = colQty + wQty;
      const wUm = 40;
      const colPrice = colUm + wUm;
      const wPrice = 76;
      const colTotal = colPrice + wPrice;
      const wTotal = 72;
      const rowHeaderH = 26;

      doc.save();
      doc.fillColor(NAVY).roundedRect(MARGIN, y, CONTENT_W, rowHeaderH, 6).fill();
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
      const headerY = y + 9;
      doc.text('DESCRIPTION', colItem + 10, headerY, { width: wItem - 10 });
      doc.text('QTY', colQty, headerY, { width: wQty, align: 'right' });
      doc.text('U.M.', colUm, headerY, { width: wUm, align: 'center' });
      doc.text('PRICE', colPrice, headerY, { width: wPrice, align: 'right' });
      doc.text('TOTAL', colTotal, headerY, { width: wTotal - 8, align: 'right' });
      doc.restore();
      y += rowHeaderH;

      doc.font('Helvetica').fontSize(9).fillColor(INK);
      let rowIndex = 0;
      for (const row of items) {
        const pn = (row.productName || '').toString().trim();
        const dsc = (row.description || '').trim();
        const desc =
          pn && dsc && pn !== dsc ? `${pn} — ${dsc}` : dsc || pn || '—';
        doc.font('Helvetica').fontSize(9);
        const textH = doc.heightOfString(desc.slice(0, 500), { width: wItem - 12 });
        const rowH = Math.max(30, textH + 16);

        if (y + rowH > 720) {
          doc.addPage();
          y = MARGIN;
        }

        if (rowIndex % 2 === 1) {
          doc.save();
          doc.fillColor('#f8fafc').rect(MARGIN, y, CONTENT_W, rowH).fill();
          doc.restore();
        }

        doc.fillColor(INK).text(desc.slice(0, 500), colItem + 10, y + 8, { width: wItem - 12, lineGap: 2 });
        doc.text(String(row.qty), colQty, y + 8, { width: wQty, align: 'right' });
        doc.text(row.unitMeasure || 'u', colUm, y + 8, { width: wUm, align: 'center' });
        doc.text(Number(row.unitPrice).toFixed(2), colPrice, y + 8, { width: wPrice, align: 'right' });
        doc.text(Number(row.lineTotal).toFixed(2), colTotal, y + 8, { width: wTotal - 8, align: 'right' });
        y += rowH;
        rowIndex += 1;
      }

      if (items.length === 0) {
        const emptyH = 36;
        doc.fillColor(SLATE).font('Helvetica-Oblique').fontSize(9).text('No line items', colItem + 10, y + 12, {
          width: CONTENT_W - 20,
        });
        y += emptyH;
      }

      doc.moveTo(MARGIN, y + 4).lineTo(MARGIN + CONTENT_W, y + 4).strokeColor('#e2e8f0').lineWidth(1).stroke();
      y += 20;

      // Totales (bloque derecho)
      const totalsBoxW = 220;
      const totalsX = MARGIN + CONTENT_W - totalsBoxW;
      const taxLabel = invoice.taxLabel || `${(Number(invoice.taxRate || 0) * 100).toFixed(2)}%`;
      const sub = Number(invoice.subtotalAmount).toFixed(2);
      const tax = Number(invoice.taxAmount).toFixed(2);
      const tot = Number(invoice.totalAmount).toFixed(2);
      const cur = invoice.currency || 'USD';

      const totalsInnerH = 72;
      doc.save();
      doc.fillColor(MUTED_BG).roundedRect(totalsX, y, totalsBoxW, totalsInnerH, 8).fill();
      doc.fillColor(ACCENT).rect(totalsX, y, 4, totalsInnerH).fill();
      doc.restore();

      let ty = y + 10;
      doc.font('Helvetica').fontSize(9).fillColor(SLATE).text('Subtotal', totalsX + 14, ty, { width: 90 });
      doc.fillColor(INK).text(`${cur} ${sub}`, totalsX + 14, ty, { width: totalsBoxW - 24, align: 'right' });
      ty += 16;
      doc.fillColor(SLATE).text(`Tax (${taxLabel})`, totalsX + 14, ty, { width: 120 });
      doc.fillColor(INK).text(`${cur} ${tax}`, totalsX + 14, ty, { width: totalsBoxW - 24, align: 'right' });
      ty += 22;
      doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('Total', totalsX + 14, ty, { width: 70 });
      doc.text(`${cur} ${tot}`, totalsX + 14, ty, { width: totalsBoxW - 24, align: 'right' });
      y += totalsInnerH + 18;

      if (invoice.notes) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(SLATE).text('Notes', MARGIN, y);
        y += 12;
        doc.font('Helvetica').fontSize(9).fillColor(INK).text(invoice.notes, MARGIN, y, {
          width: CONTENT_W,
          lineGap: 2,
        });
        y = doc.y + 14;
      }

      const pay = invoice.paymentInstructions || {};
      const payBits = [
        pay['bankName'] && `Bank: ${pay['bankName']}`,
        pay['accountNumber'] && `Account: ${pay['accountNumber']}`,
        pay['routingAch'] && `Routing: ${pay['routingAch']}`,
        pay['swift'] && `SWIFT: ${pay['swift']}`,
        pay['iban'] && `IBAN: ${pay['iban']}`,
        pay['zelleOrPaypal'] && `Zelle/PayPal: ${pay['zelleOrPaypal']}`,
      ].filter(Boolean) as string[];

      if (payBits.length) {
        if (y > 640) {
          doc.addPage();
          y = MARGIN;
        }
        doc.font('Helvetica-Bold').fontSize(9).fillColor(SLATE).text('Payment details', MARGIN, y);
        y += 12;
        doc.font('Helvetica').fontSize(9).fillColor(INK);
        payBits.forEach((p) => {
          doc.text(p, MARGIN, y, { width: CONTENT_W });
          y = doc.y + 2;
        });
        y += 10;
      }

      doc.end();
    });
  }

  /** Descarga logo HTTPS (p. ej. S3) para incrustar en el PDF. */
  private async fetchLogoBuffer(url: string | null | undefined): Promise<Buffer | null> {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return null;

    try {
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 15000);
      const res = await fetch(trimmed, {
        signal: ac.signal,
        redirect: 'follow',
        headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif' },
      });
      clearTimeout(tid);
      if (!res.ok) return null;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.startsWith('image/')) return null;
      const arr = new Uint8Array(await res.arrayBuffer());
      if (arr.byteLength < 24 || arr.byteLength > 5 * 1024 * 1024) return null;
      return Buffer.from(arr);
    } catch (e) {
      this.logger.debug(`Logo fetch failed: ${(e as Error).message}`);
      return null;
    }
  }
}
