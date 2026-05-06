/** Fuente de ingesta tras normalizar cabeceras CSV. */
export type CanonicalTxSource =
  | 'relay'
  | 'mercury'
  | 'quickbooks'
  | 'netsuite'
  | 'generic';

/** Modelo único previo a clasificar (motor A/B/C). */
export type CanonicalTx = {
  date: string;
  amount: number;
  isIncome: boolean;
  description: string;
  payeeNormalized: string;
  source: CanonicalTxSource;
};

export function normalizePayeeKey(text: string | null | undefined): string {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
}
