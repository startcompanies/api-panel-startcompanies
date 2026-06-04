import { mapPlaidTransactionToImportRow } from './plaid-transaction.util';

describe('mapPlaidTransactionToImportRow', () => {
  it('invierte el signo: Plaid positivo (salida) → contabilidad negativo', () => {
    const row = mapPlaidTransactionToImportRow(
      {
        transaction_id: 'tx_1',
        date: '2024-01-15',
        amount: 50,
        name: 'Coffee Shop',
        merchant_name: 'Coffee Shop',
      },
      'First Platypus Bank',
    );
    expect(row.amount).toBe(-50);
    expect(row.transactionId).toBe('tx_1');
    expect(row.sourceBank).toBe('First Platypus Bank');
  });

  it('Plaid negativo (entrada) → contabilidad positivo (ingreso)', () => {
    const row = mapPlaidTransactionToImportRow(
      {
        transaction_id: 'tx_2',
        date: '2024-01-16',
        amount: -1200,
        name: 'Deposit',
      },
      'Relay',
    );
    expect(row.amount).toBe(1200);
  });
});
