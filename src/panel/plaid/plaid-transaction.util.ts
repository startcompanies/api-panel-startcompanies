import { normalizePayeeKey } from '../accounting/accounting-canonical.types';

/** Convierte un movimiento Plaid al formato de importación contable. */
export function mapPlaidTransactionToImportRow(
  tx: {
    transaction_id: string;
    date: string;
    amount: number;
    name?: string | null;
    merchant_name?: string | null;
    original_description?: string | null;
  },
  institutionName: string | null,
) {
  const desc =
    tx.merchant_name || tx.name || tx.original_description || 'Sin descripción';
  const payee = tx.merchant_name || tx.name || desc;
  return {
    transactionId: tx.transaction_id,
    txDate: tx.date,
    description: desc,
    amount: -Number(tx.amount),
    sourceBank: institutionName,
    payeeNormalized: normalizePayeeKey(payee),
  };
}
