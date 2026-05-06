/** Parser CSV alineado al mock startcompanies-panel.html (cabeceras flexibles, débito/crédito). */

import type { CanonicalTx, CanonicalTxSource } from './accounting-canonical.types';
import { normalizePayeeKey } from './accounting-canonical.types';

export type ParsedBankRow = {
  txDate: string;
  description: string;
  amount: number;
  bank: string;
  payeeNormalized?: string | null;
  /** Hint de categoría extraído de columnas upstream (Mercury Category, Category de QB). */
  categoryHint?: string;
};

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQ = !inQ;
      }
    } else if (c === ',' && !inQ) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseDelimitedLine(line: string): string[] {
  const t = line.trim();
  if (t.includes('\t') && !t.includes(',')) {
    return t.split('\t').map((c) => c.trim().replace(/^"|"$/g, ''));
  }
  return parseCsvLine(line);
}

/** Normaliza fechas típicas de CSV (ISO, MM/DD/YYYY, DD-MM-YYYY). */
export function normalizeCsvDateToIso(raw: string): string {
  const s = (raw || '').trim().split(/[\sT]/)[0];
  if (!s) return new Date().toISOString().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (mdY) {
    const a = parseInt(mdY[1], 10);
    const b = parseInt(mdY[2], 10);
    const y = mdY[3];
    if (a <= 12) {
      return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    }
    return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }
  const dmy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    return new Date(t).toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

export function detectBankFromFileNameAndHeaders(fileName: string, headers: string[]): string {
  const f = (fileName || '').toLowerCase();
  const hlow = headers.join(',').toLowerCase();
  if (f.includes('quickbook') || f.includes('qbo') || hlow.includes('quickbook')) return 'QuickBooks';
  if (
    f.includes('netsuite') ||
    hlow.includes('netsuite') ||
    hlow.includes('suiteanalytics') ||
    (hlow.includes('internal id') && hlow.includes('memo'))
  ) {
    return 'NetSuite';
  }
  if (f.includes('mercury') || hlow.includes('mercury')) return 'Mercury';
  if (f.includes('relay') || hlow.includes('relay')) return 'Relay';
  if (f.includes('lili') || hlow.includes('lili')) return 'Lili Bank';
  if (f.includes('wise') || hlow.includes('wise')) return 'Wise';
  if (f.includes('brex') || hlow.includes('brex')) return 'Brex';
  if (f.includes('chase') || hlow.includes('chase')) return 'Chase';
  return 'Genérico';
}

export function bankDisplayNameToCanonicalSource(bank: string): CanonicalTxSource {
  const b = (bank || '').toLowerCase();
  if (b.includes('relay')) return 'relay';
  if (b.includes('mercury')) return 'mercury';
  if (b.includes('quickbook')) return 'quickbooks';
  if (b.includes('netsuite')) return 'netsuite';
  return 'generic';
}

export function bankRowToCanonical(row: ParsedBankRow): CanonicalTx {
  const amt = Number(row.amount);
  return {
    date: row.txDate,
    amount: amt,
    isIncome: amt > 0,
    // categoryHint se concatena para que el motor fuzzy lo vea sin cambiar el modelo canónico
    description: [row.description, row.categoryHint].filter(Boolean).join(' ').trim() || 'Sin descripción',
    payeeNormalized: row.payeeNormalized || normalizePayeeKey(row.description),
    source: bankDisplayNameToCanonicalSource(row.bank),
  };
}

function findVal(row: Record<string, string>, headers: string[], keys: string[]): string {
  for (const k of keys) {
    const h = headers.find((x) => x.toLowerCase().includes(k.toLowerCase()));
    if (h && row[h] !== undefined) return (row[h] || '').trim();
  }
  return '';
}

export function normalizeBankRow(
  row: Record<string, string>,
  headers: string[],
  bank: string,
): ParsedBankRow | null {
  const dateStr = findVal(row, headers, [
    'date',
    'fecha',
    'transaction date',
    'posted date',
    'posting date',
    'value date',
    'completed date',
    'trn date',
  ]);

  let descStr = findVal(row, headers, [
    'description',
    'memo',
    'narration',
    'details',
    'payee',
    'payer/payee name',
    'payer/payee',
    'name',
    'reference',
    'merchant',
  ]);

  const payeeOnly = findVal(row, headers, [
    'payee',
    'payer/payee',
    'payer/payee name',
    'merchant',
    'name',
    'customer',
    'vendor',
    'entity',
  ]);

  let categoryHint: string | undefined;
  if (bank === 'QuickBooks') {
    const qbMemo = findVal(row, headers, ['memo', 'memo/description', 'description', 'notes']);
    const qbNum = findVal(row, headers, ['num', 'no.', 'no', 'reference no', 'doc number']);
    const parts = [payeeOnly, qbMemo, qbNum].filter((p) => p && !/^unknown$/i.test(p));
    if (parts.length) descStr = parts.join(' · ');

    // Extraer hints de categoría upstream de QB / Mercury para mejorar la clasificación
    const mercuryCat = findVal(row, headers, ['mercury category']);
    const qbCat = findVal(row, headers, ['category']);
    const hintText = [mercuryCat, qbCat]
      .map((s) => s.trim())
      .filter((s) => s && !/^unknown$/i.test(s))
      .join(' ');
    if (hintText) categoryHint = hintText;
  }

  const dTrim = (descStr || '').trim();
  if ((!dTrim || /^unknown$/i.test(dTrim)) && payeeOnly) {
    descStr = payeeOnly;
  }

  let amt = 0;
  const amtStr = findVal(row, headers, ['amount', 'amt', 'value', 'monto', 'importe', 'total']);
  const debitStr = findVal(row, headers, ['debit', 'debit amount', 'withdrawal', 'payment']);
  const creditStr = findVal(row, headers, ['credit', 'credit amount', 'deposit']);

  if (bank === 'NetSuite' && (debitStr || creditStr)) {
    const d = parseFloat(String(debitStr).replace(/[^0-9.-]/g, '')) || 0;
    const c = parseFloat(String(creditStr).replace(/[^0-9.-]/g, '')) || 0;
    if (c && !d) amt = Math.abs(c);
    else if (d && !c) amt = -Math.abs(d);
    else amt = c - d;
  } else if (debitStr && creditStr && !amtStr) {
    const d = parseFloat(debitStr.replace(/[^0-9.]/g, '')) || 0;
    const c = parseFloat(creditStr.replace(/[^0-9.]/g, '')) || 0;
    amt = c > 0 ? c : -d;
  } else {
    amt = parseFloat((amtStr || '').replace(/[^0-9.-]/g, '')) || 0;
  }

  const nsType = findVal(row, headers, ['type', 'transaction type', 'tran type']).toUpperCase();
  if (bank === 'NetSuite' && amt > 0 && /DEBIT|BILL|PAYMENT|CHECK|EXPENSE|TRANSFER OUT/i.test(nsType)) {
    amt = -Math.abs(amt);
  }
  if (bank === 'NetSuite' && amt < 0 && /CREDIT|DEPOSIT|INFLOW/i.test(nsType)) {
    amt = Math.abs(amt);
  }

  const fechaRaw = (dateStr.split(' ')[0] || dateStr || '').trim();
  const iso = fechaRaw ? normalizeCsvDateToIso(fechaRaw) : new Date().toISOString().split('T')[0];
  const desc = descStr || 'Sin descripción';

  const payeeForKey =
    payeeOnly && !/^unknown$/i.test(payeeOnly.trim())
      ? payeeOnly
      : (desc.split(/[·|]/)[0] || desc).trim();
  const payeeNormalized = normalizePayeeKey(payeeForKey) || normalizePayeeKey(desc);

  if (desc === 'Sin descripción' && amt === 0) return null;
  return { txDate: iso, description: desc, amount: amt, bank, payeeNormalized, categoryHint };
}

export function parseBankCsvText(csv: string, fileName?: string): {
  detectedBank: string;
  rows: ParsedBankRow[];
  totalRows: number;
} {
  const lines = (csv || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { detectedBank: 'Genérico', rows: [], totalRows: 0 };
  }
  const headers = parseDelimitedLine(lines[0]).map((h) => h.replace(/"/g, '').trim());
  const detectedBank = detectBankFromFileNameAndHeaders(fileName || '', headers);
  const rows: ParsedBankRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const vals = parseDelimitedLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, j) => {
      rowObj[h] = vals[j] !== undefined ? vals[j].replace(/"/g, '').trim() : '';
    });
    const mov = normalizeBankRow(rowObj, headers, detectedBank);
    if (mov) rows.push(mov);
  }
  return { detectedBank, rows, totalRows: lines.length - 1 };
}
