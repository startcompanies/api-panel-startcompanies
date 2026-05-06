/** Puente hacia filas legacy `accounting_categories` (prefijo 4xxx/5xxx en nombre). */
export function catalogCodeToLegacyCategoryPrefix(
  code: string,
  type: 'income' | 'expense' | 'other',
): string {
  const MAP: Record<string, string> = {
    SALES: '4000',
    OTHER_INCOME: '4100',
    REFUNDS: '4100',
    INVEST: '4100',
    'INVEST/DIVIDENDS': '4100',
    'INVEST/INTEREST': '4100',
    'FX/GAIN': '4100',
    COL_SERV: '5700',
    ADMIN: '5700',
    'ADMIN/SOFTWARES': '5100',
    'ADMIN/OTHER': '5700',
    MKT: '5200',
    PAYROLL: '5000',
    RENT: '5700',
    'OFFICE/EQUIPMENT': '5700',
    'OFFICE/SUPPLIES': '5700',
    UTILITIES: '5700',
    'UTILITIES/ELECTRICITY': '5700',
    'UTILITIES/INTERNET': '5600',
    TRAVEL: '5400',
    'TRAVEL/MEALS': '5400',
    INSURANCE: '5700',
    'FINANCE/CARD_FEES': '5500',
    'FINANCE/INTEREST': '5500',
    'MEALS/ENT': '5400',
    UNCAT: '5700',
    'FX/LOSS': '5700',
    CAPITAL: '5700',
    INTERCO: '5700',
  };
  const upper = String(code || '').trim().toUpperCase();
  return (
    MAP[upper] ??
    (type === 'income' ? '4100' : type === 'expense' ? '5700' : '5700')
  );
}
