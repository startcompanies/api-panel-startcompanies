/** Puente hacia filas legacy `accounting_categories` (prefijo 4xxx/5xxx en nombre). */
export function catalogCodeToLegacyCategoryPrefix(
  code: string,
  type: 'income' | 'expense' | 'other',
): string {
  const MAP: Record<string, string> = {
    SALES: '4100',
    OTHER_INCOME: '4300',
    REFUNDS: '4400',
    INVEST: '4900',
    'INVEST/DIVIDENDS': '4900',
    'INVEST/INTEREST': '7300',
    'FX/GAIN': '4900',
    COL_SERV: '5100',
    ADMIN: '6950',
    'ADMIN/SOFTWARES': '6210',
    'ADMIN/OTHER': '6950',
    MKT: '6300',
    PAYROLL: '6100',
    RENT: '6200',
    'OFFICE/EQUIPMENT': '6240',
    'OFFICE/SUPPLIES': '6230',
    UTILITIES: '6220',
    'UTILITIES/ELECTRICITY': '6220',
    'UTILITIES/INTERNET': '6220',
    TRAVEL: '6400',
    'TRAVEL/MEALS': '6410',
    INSURANCE: '6500',
    'FINANCE/CARD_FEES': '6700',
    'FINANCE/INTEREST': '6710',
    'MEALS/ENT': '6410',
    UNCAT: '6950',
    'FX/LOSS': '7900',
    CAPITAL: '7400',
    INTERCO: '7900',
    // Plan numérico directo (4xxx–7xxx)
    '4100': '4100',
    '4200': '4200',
    '4300': '4300',
    '6210': '6210',
    '6300': '6300',
    '6400': '6400',
    '6410': '6410',
    '6500': '6500',
    '6700': '6700',
    '7300': '7300',
  };
  const upper = String(code || '').trim().toUpperCase();
  return (
    MAP[upper] ??
    (type === 'income' ? '4100' : type === 'expense' ? '6950' : '7900')
  );
}

/**
 * Convierte códigos de reglas del motor (legacy alfanumérico) al código activo en `account_catalog`.
 * Tras la migración al plan numérico, las reglas siguen emitiendo SALES/TRAVEL/etc.
 */
export function legacyRuleCodeToCatalogCode(ruleCode: string): string | null {
  const MAP: Record<string, string> = {
    SALES: '4100',
    OTHER_INCOME: '4300',
    REFUNDS: '4400',
    'INVEST/DIVIDENDS': '4900',
    'INVEST/INTEREST': '7300',
    'FX/GAIN': '4900',
    COL_SERV: '5100',
    ADMIN: '6950',
    'ADMIN/SOFTWARES': '6210',
    'ADMIN/OTHER': '6950',
    MKT: '6300',
    PAYROLL: '6100',
    RENT: '6200',
    'OFFICE/EQUIPMENT': '6240',
    'OFFICE/SUPPLIES': '6230',
    UTILITIES: '6220',
    'UTILITIES/ELECTRICITY': '6220',
    'UTILITIES/INTERNET': '6220',
    TRAVEL: '6400',
    'TRAVEL/MEALS': '6410',
    INSURANCE: '6500',
    'FINANCE/CARD_FEES': '6700',
    'FINANCE/INTEREST': '6710',
    'MEALS/ENT': '6410',
    UNCAT: '6950',
    'FX/LOSS': '7900',
    CAPITAL: '7400',
    INTERCO: 'INTERCO',
  };
  const upper = String(ruleCode || '').trim().toUpperCase();
  if (/^\d{4}$/.test(upper)) return upper;
  return MAP[upper] ?? null;
}

/** Resuelve un código de regla (legacy o numérico) contra el catálogo activo. */
export function resolveRuleCodeInCatalog(
  ruleCode: string,
  allowed: Set<string>,
  labels: Record<string, string>,
): { code: string; label: string } | null {
  const upper = String(ruleCode || '').trim().toUpperCase();
  if (!upper) return null;
  if (allowed.has(upper)) {
    return { code: upper, label: labels[upper] ?? upper };
  }
  const mapped = legacyRuleCodeToCatalogCode(upper);
  if (mapped && allowed.has(mapped)) {
    return { code: mapped, label: labels[mapped] ?? mapped };
  }
  return null;
}
