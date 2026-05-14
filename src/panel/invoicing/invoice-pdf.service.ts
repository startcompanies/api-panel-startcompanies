import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Invoice } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { ClientCompanyProfile } from '../settings/entities/client-company-profile.entity';

/* ── Design tokens (matching facturacion.html) ────────────── */
const NAVY = '#0A1628';
const NAVY_MID = '#0D2045';
const BLUE = '#0066FF';
const BLUE_MID = '#1A56D6';
const BLUE_LIGHT = '#4E9AF1';
const TEXT = '#1A2540';
const MUTED = '#6B7FA8';
const BG_LIGHT = '#F6F8FC';
const BORDER = '#DDE3F0';
const WHITE = '#ffffff';
const HEADER_ACCENT_TEXT = '#8AA8CC';
const TABLE_TH_TEXT = '#A8C4E8';

const PAGE_W = 612;
const MARGIN = 40;
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
        margin: 0,
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
      const cur = invoice.currency || 'USD';

      let y = 0;

      /* ── HEADER (navy gradient) ──────────────────────────────── */
      const headerH = 80;
      doc.save();
      const grad = doc.linearGradient(0, 0, PAGE_W, headerH);
      grad.stop(0, NAVY).stop(1, NAVY_MID);
      doc.rect(0, 0, PAGE_W, headerH).fill(grad);
      doc.restore();

      // Logo or placeholder (left side)
      const logoAreaX = MARGIN;
      const logoAreaY = (headerH - 48) / 2;
      if (logoBuf) {
        try {
          doc.image(logoBuf, logoAreaX, logoAreaY, { fit: [140, 48] });
        } catch (e) {
          this.logger.warn(`Logo PDF omitido: ${(e as Error).message}`);
          this.drawLogoPlaceholder(doc, logoAreaX, logoAreaY, issuerName);
        }
      } else {
        this.drawLogoPlaceholder(doc, logoAreaX, logoAreaY, issuerName);
      }

      // Title (right side)
      doc
        .fillColor(BLUE_LIGHT)
        .font('Helvetica-Bold')
        .fontSize(26)
        .text('FACTURA', MARGIN, logoAreaY + 4, {
          width: CONTENT_W,
          align: 'right',
          lineGap: 0,
        });
      doc
        .fillColor(HEADER_ACCENT_TEXT)
        .font('Helvetica')
        .fontSize(9)
        .text(`No. ${invNo}`, MARGIN, logoAreaY + 33, {
          width: CONTENT_W,
          align: 'right',
        });

      y = headerH;

      /* ── ACCENT BAR (4 px blue gradient) ────────────────────── */
      doc.save();
      const accentGrad = doc.linearGradient(0, y, PAGE_W, y + 4);
      accentGrad.stop(0, BLUE_MID).stop(0.5, BLUE_LIGHT).stop(1, BLUE_MID);
      doc.rect(0, y, PAGE_W, 4).fill(accentGrad);
      doc.restore();
      y += 4;

      /* ── BODY ────────────────────────────────────────────────── */
      const bodyX = MARGIN;
      y += 28; // top padding

      /* Info row: emisor (left) + meta-boxes (right) */
      const metaBoxW = 200;
      const emitterW = CONTENT_W - metaBoxW - 20;

      // Emisor
      doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(13).text(issuerName, bodyX, y, {
        width: emitterW,
        lineGap: 2,
      });
      let emitterEndY = doc.y + 4;
      if (addr) {
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(addr, bodyX, emitterEndY, {
          width: emitterW,
          lineGap: 3,
        });
        emitterEndY = doc.y + 3;
      }
      if (ein) {
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(ein, bodyX, emitterEndY, {
          width: emitterW,
        });
        emitterEndY = doc.y;
      }
      if (company?.billingEmail) {
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(company.billingEmail, bodyX, emitterEndY + 2, {
          width: emitterW,
        });
        emitterEndY = doc.y;
      }

      // Meta-boxes (right column)
      const metaX = bodyX + emitterW + 20;
      let metaY = y;
      const metaBoxH = 40;
      const metaGap = 7;

      this.drawMetaBox(doc, metaX, metaY, metaBoxW, metaBoxH, 'FECHA DE EMISIÓN', issue);
      metaY += metaBoxH + metaGap;

      if (invoice.dueDate) {
        this.drawMetaBox(doc, metaX, metaY, metaBoxW, metaBoxH, 'FECHA DE VENCIMIENTO', String(invoice.dueDate));
        metaY += metaBoxH + metaGap;
      }

      const taxLabel = invoice.taxLabel || (Number(invoice.taxRate || 0) * 100).toFixed(0) + '%';
      this.drawMetaBox(doc, metaX, metaY, metaBoxW, metaBoxH, 'IMPUESTO', taxLabel);
      metaY += metaBoxH;

      y = Math.max(emitterEndY + 8, metaY + 16);

      /* Divider */
      doc.moveTo(bodyX, y).lineTo(bodyX + CONTENT_W, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 20;

      /* Billing row: Bill to (left) + Send to (right, same) */
      const bt = invoice.billTo || {};
      const billName = String(bt['companyName'] || bt['name'] || '—');
      const billDetails = [
        bt['ein'] && `EIN: ${bt['ein']}`,
        bt['address'],
        bt['email'],
        bt['phone'],
      ]
        .filter(Boolean)
        .map(String);

      const halfW = (CONTENT_W - 20) / 2;

      // Bill to
      doc.fillColor(BLUE_MID).font('Helvetica-Bold').fontSize(8.5).text('FACTURAR A', bodyX, y);
      y += 13;
      doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(12).text(billName, bodyX, y, {
        width: halfW,
        lineGap: 2,
      });
      y += doc.heightOfString(billName, { width: halfW }) + 4;
      if (billDetails.length) {
        doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(billDetails.join('\n'), bodyX, y, {
          width: halfW,
          lineGap: 3,
        });
        y = doc.y;
      }

      y += 24;

      /* ── ITEMS TABLE ─────────────────────────────────────────── */
      const colDesc = bodyX;
      const wDesc = 232;
      const colQty = colDesc + wDesc;
      const wQty = 44;
      const colUm = colQty + wQty;
      const wUm = 40;
      const colPrice = colUm + wUm;
      const wPrice = 80;
      const colTotal = colPrice + wPrice;
      const wTotal = CONTENT_W - (colTotal - bodyX);
      const thH = 30;

      // Table header (blue background)
      doc.save();
      doc.fillColor(BLUE_MID).roundedRect(bodyX, y, CONTENT_W, thH, 6).fill();
      doc.fillColor(TABLE_TH_TEXT).font('Helvetica-Bold').fontSize(8);
      const thTextY = y + 11;
      doc.text('DESCRIPCIÓN', colDesc + 10, thTextY, { width: wDesc - 10 });
      doc.text('CANT.', colQty, thTextY, { width: wQty, align: 'right' });
      doc.text('U.M.', colUm, thTextY, { width: wUm, align: 'center' });
      doc.text('P. UNIT.', colPrice, thTextY, { width: wPrice, align: 'right' });
      doc.text('TOTAL', colTotal, thTextY, { width: wTotal - 6, align: 'right' });
      doc.restore();
      y += thH;

      // Table rows
      doc.font('Helvetica').fontSize(9);
      let rowIdx = 0;
      for (const row of items) {
        const pn = (row.productName || '').toString().trim();
        const dsc = (row.description || '').trim();
        const desc = pn && dsc && pn !== dsc ? pn : dsc || pn || '—';
        const subText = pn && dsc && pn !== dsc ? dsc : '';

        doc.font('Helvetica').fontSize(9);
        const mainH = doc.heightOfString(desc.slice(0, 400), { width: wDesc - 16 });
        const subH = subText ? doc.heightOfString(subText.slice(0, 200), { width: wDesc - 16 }) + 4 : 0;
        const rowH = Math.max(32, mainH + subH + 20);

        if (y + rowH > 720) {
          doc.addPage();
          y = MARGIN;
        }

        const rowBg = rowIdx % 2 === 0 ? BG_LIGHT : WHITE;
        doc.save();
        doc.fillColor(rowBg).rect(bodyX, y, CONTENT_W, rowH).fill();
        doc.restore();
        doc.moveTo(bodyX, y + rowH).lineTo(bodyX + CONTENT_W, y + rowH).strokeColor(BORDER).lineWidth(0.5).stroke();

        const textY = y + 10;
        doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(9).text(desc.slice(0, 400), colDesc + 10, textY, {
          width: wDesc - 16,
          lineGap: 1,
        });
        if (subText) {
          const subY = textY + mainH + 2;
          doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(subText.slice(0, 200), colDesc + 10, subY, {
            width: wDesc - 16,
          });
        }
        doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(String(row.qty), colQty, textY, {
          width: wQty,
          align: 'right',
        });
        doc.text(row.unitMeasure || 'u', colUm, textY, { width: wUm, align: 'center' });
        doc.fillColor(TEXT).font('Helvetica').fontSize(9).text(Number(row.unitPrice).toFixed(2), colPrice, textY, {
          width: wPrice,
          align: 'right',
        });
        doc.font('Helvetica-Bold').text(Number(row.lineTotal).toFixed(2), colTotal, textY, {
          width: wTotal - 6,
          align: 'right',
        });

        y += rowH;
        rowIdx++;
      }

      if (items.length === 0) {
        doc
          .fillColor(MUTED)
          .font('Helvetica-Oblique')
          .fontSize(9)
          .text('Sin ítems registrados', colDesc + 10, y + 10, { width: CONTENT_W - 20 });
        y += 36;
      }

      /* ── TOTALS (right-aligned box) ──────────────────────────── */
      y += 16;
      const totalsBoxW = 260;
      const totalsX = bodyX + CONTENT_W - totalsBoxW;
      const sub = Number(invoice.subtotalAmount).toFixed(2);
      const tax = Number(invoice.taxAmount).toFixed(2);
      const tot = Number(invoice.totalAmount).toFixed(2);

      // Subtotal row
      const totRowH = 32;
      doc.save();
      doc.fillColor(WHITE).roundedRect(totalsX, y, totalsBoxW, totRowH * 2 + totRowH, 8).fill();
      doc.strokeColor(BORDER).lineWidth(1).roundedRect(totalsX, y, totalsBoxW, totRowH * 2 + totRowH, 8).stroke();
      doc.restore();

      // Subtotal
      doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Subtotal', totalsX + 14, y + 11, { width: 100 });
      doc.fillColor(TEXT).font('Helvetica').fontSize(10).text(`${cur} ${sub}`, totalsX + 14, y + 11, {
        width: totalsBoxW - 28,
        align: 'right',
      });
      doc.moveTo(totalsX, y + totRowH).lineTo(totalsX + totalsBoxW, y + totRowH).strokeColor(BORDER).lineWidth(0.5).stroke();
      y += totRowH;

      // Tax
      doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(`Impuesto (${taxLabel})`, totalsX + 14, y + 11, {
        width: 140,
      });
      doc.fillColor(TEXT).font('Helvetica').fontSize(10).text(`${cur} ${tax}`, totalsX + 14, y + 11, {
        width: totalsBoxW - 28,
        align: 'right',
      });
      doc.moveTo(totalsX, y + totRowH).lineTo(totalsX + totalsBoxW, y + totRowH).strokeColor(BORDER).lineWidth(0.5).stroke();
      y += totRowH;

      // Total final (blue background)
      doc.save();
      doc.fillColor(BLUE_MID).rect(totalsX, y, totalsBoxW, totRowH).fill();
      doc.restore();
      doc.fillColor('#A8C4E8').font('Helvetica-Bold').fontSize(11).text('TOTAL', totalsX + 14, y + 10, { width: 100 });
      doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(13).text(`${cur} ${tot}`, totalsX + 14, y + 9, {
        width: totalsBoxW - 28,
        align: 'right',
      });

      y += totRowH + 24;

      /* ── PAYMENT INSTRUCTIONS ────────────────────────────────── */
      const pay = invoice.paymentInstructions || {};
      const payRows = [
        pay['bankName'] && ['Banco', String(pay['bankName'])],
        pay['accountNumber'] && ['Cuenta', String(pay['accountNumber'])],
        pay['routingAch'] && ['Routing ACH', String(pay['routingAch'])],
        pay['swift'] && ['SWIFT', String(pay['swift'])],
        pay['iban'] && ['IBAN', String(pay['iban'])],
        pay['zelleOrPaypal'] && ['Zelle / PayPal', String(pay['zelleOrPaypal'])],
      ].filter(Boolean) as [string, string][];

      if (payRows.length) {
        if (y > 650) {
          doc.addPage();
          y = MARGIN + 20;
        }
        const payBlockW = 300;

        // Payment header
        doc.save();
        doc.save();
        doc.fillColor(BLUE_MID).roundedRect(bodyX, y, payBlockW, 26, 6).fill();
        // clip bottom corners square by covering them with a filled rect
        doc.fillColor(BLUE_MID).rect(bodyX, y + 13, payBlockW, 13).fill();
        doc.restore();
        doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8).text('INSTRUCCIONES DE PAGO', bodyX + 12, y + 9, {
          width: payBlockW - 20,
        });
        doc.restore();
        y += 26;

        // Payment body
        const payBodyH = payRows.length * 22 + 12;
        doc.save();
        doc.fillColor(BG_LIGHT).rect(bodyX, y, payBlockW, payBodyH).fill();
        doc.strokeColor(BORDER).lineWidth(1).rect(bodyX, y, payBlockW, payBodyH).stroke();
        doc.restore();

        let py = y + 8;
        for (const [label, value] of payRows) {
          doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(label, bodyX + 12, py, { width: 100 });
          doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(9).text(value, bodyX + 120, py, {
            width: payBlockW - 132,
          });
          py += 22;
        }
        y += payBodyH + 20;
      }

      /* ── NOTES ───────────────────────────────────────────────── */
      if (invoice.notes) {
        if (y > 660) {
          doc.addPage();
          y = MARGIN + 20;
        }
        doc.save();
        doc.fillColor('#EEF4FF').roundedRect(bodyX, y, CONTENT_W, 1).fill();
        const noteH = doc.heightOfString(invoice.notes, { width: CONTENT_W - 36 }) + 24;
        doc.fillColor('#EEF4FF').roundedRect(bodyX, y, CONTENT_W, noteH, 8).fill();
        doc.fillColor(BLUE_LIGHT).rect(bodyX, y, 3, noteH).fill();
        doc.restore();
        doc.fillColor('#3A5080').font('Helvetica-Oblique').fontSize(9.5).text(invoice.notes, bodyX + 14, y + 10, {
          width: CONTENT_W - 24,
          lineGap: 3,
        });
        y += noteH + 20;
      }

      /* ── FOOTER (navy background) ────────────────────────────── */
      y += 10;
      const footerH = 36;
      const pageH = doc.page.height;
      const footerY = Math.max(y, pageH - footerH);

      doc.save();
      doc.fillColor(NAVY).rect(0, footerY, PAGE_W, footerH).fill();
      doc.fillColor(BLUE_MID).rect(0, footerY, PAGE_W, 3).fill();
      doc.restore();
      doc
        .fillColor(HEADER_ACCENT_TEXT)
        .font('Helvetica')
        .fontSize(9)
        .text('Powered by Start Companies · startcompanies.com', 0, footerY + 13, {
          width: PAGE_W,
          align: 'center',
        });

      doc.end();
    });
  }

  private drawMetaBox(
    doc: InstanceType<typeof PDFDocument>,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
  ): void {
    doc.save();
    doc.fillColor(BG_LIGHT).roundedRect(x, y, w, h, 7).fill();
    doc.strokeColor(BORDER).lineWidth(1).roundedRect(x, y, w, h, 7).stroke();
    doc.restore();
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text(label, x + 10, y + 8, {
      width: w - 20,
      characterSpacing: 0.8,
    });
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(11).text(value, x + 10, y + 19, {
      width: w - 20,
    });
  }

  private drawLogoPlaceholder(
    doc: InstanceType<typeof PDFDocument>,
    x: number,
    y: number,
    name: string,
  ): void {
    doc.save();
    doc.dash(3, { space: 3 });
    doc.strokeColor('rgba(78,154,241,0.45)').lineWidth(1.5).roundedRect(x, y, 140, 48, 7).stroke();
    doc.undash();
    doc.restore();
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || '')
      .join('')
      .toUpperCase();
    doc.fillColor(BLUE_LIGHT).font('Helvetica-Bold').fontSize(20).text(initials, x, y + 14, {
      width: 140,
      align: 'center',
    });
  }

  /** Descarga logo HTTPS para incrustar en el PDF. */
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
