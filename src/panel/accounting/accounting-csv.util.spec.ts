import { normalizeCsvDateToIso, parseBankCsvText } from './accounting-csv.util';

describe('accounting-csv.util', () => {
  describe('normalizeCsvDateToIso', () => {
    it('mantiene ISO', () => {
      expect(normalizeCsvDateToIso('2024-03-15')).toBe('2024-03-15');
    });
    it('interpreta MM/DD/YYYY estilo US', () => {
      expect(normalizeCsvDateToIso('1/5/2025')).toBe('2025-01-05');
    });
  });

  describe('QuickBooks', () => {
    it('detecta banco y concatena Name + Memo', () => {
      const csv = [
        'Date,Name,Memo,Amount',
        '03/15/2025,ACME Corp,Invoice 99,-125.50',
      ].join('\n');
      const r = parseBankCsvText(csv, 'quickbooks-register.csv');
      expect(r.detectedBank).toBe('QuickBooks');
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].txDate).toBe('2025-03-15');
      expect(r.rows[0].description).toContain('ACME');
      expect(r.rows[0].amount).toBe(-125.5);
      expect(r.rows[0].payeeNormalized).toBeDefined();
    });
  });

  describe('NetSuite', () => {
    it('arma monto desde debit/credit y reconoce archivo', () => {
      const csv = [
        'Date,Name,Memo,Debit,Credit',
        '2025-04-01,T Utility April,,120.00,',
        '2025-04-02,Client ABC,,,500.00',
      ].join('\n');
      const r = parseBankCsvText(csv, 'netsuite-bank.csv');
      expect(r.detectedBank).toBe('NetSuite');
      expect(r.rows).toHaveLength(2);
      expect(r.rows[0].amount).toBe(-120);
      expect(r.rows[1].amount).toBe(500);
    });
  });
});
