/** Parser CSV alineado al mock startcompanies-panel.html (cabeceras flexibles, débito/crédito). */

export type ParsedBankRow = {
  txDate: string;
  description: string;
  amount: number;
  bank: string;
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

export function detectBankFromFileNameAndHeaders(fileName: string, headers: string[]): string {
  const f = (fileName || '').toLowerCase();
  const h = headers.join(',').toLowerCase();
  if (f.includes('mercury') || h.includes('mercury')) return 'Mercury';
  if (f.includes('relay') || h.includes('relay')) return 'Relay';
  if (f.includes('lili') || h.includes('lili')) return 'Lili Bank';
  if (f.includes('wise') || h.includes('wise')) return 'Wise';
  if (f.includes('brex') || h.includes('brex')) return 'Brex';
  if (f.includes('chase') || h.includes('chase')) return 'Chase';
  return 'Genérico';
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
    'value date',
    'completed date',
  ]);
  let descStr = findVal(row, headers, [
    'description',
    'memo',
    'narration',
    'details',
    'payee',
    'name',
    'reference',
    'merchant',
  ]);
  /** Relay/Mercury: columna Description suele ser "Unknown" mientras Payee tiene el comercio. */
  const payeeOnly = findVal(row, headers, ['payee', 'payer/payee', 'payer/payee name', 'merchant']);
  const dTrim = (descStr || '').trim();
  if ((!dTrim || /^unknown$/i.test(dTrim)) && payeeOnly) {
    descStr = payeeOnly;
  }
  const amtStr = findVal(row, headers, ['amount', 'debit', 'credit', 'value', 'monto', 'importe']);
  let amt = parseFloat((amtStr || '').replace(/[^0-9.-]/g, '')) || 0;
  const debitStr = findVal(row, headers, ['debit amount', 'debit']);
  const creditStr = findVal(row, headers, ['credit amount', 'credit']);
  if (debitStr && creditStr && !amtStr) {
    const d = parseFloat(debitStr.replace(/[^0-9.]/g, '')) || 0;
    const c = parseFloat(creditStr.replace(/[^0-9.]/g, '')) || 0;
    amt = c > 0 ? c : -d;
  }
  const fecha = (dateStr.split(' ')[0] || dateStr || '').trim();
  const iso = fecha || new Date().toISOString().split('T')[0];
  const desc = descStr || 'Sin descripción';
  if (desc === 'Sin descripción' && amt === 0) return null;
  return { txDate: iso, description: desc, amount: amt, bank };
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
