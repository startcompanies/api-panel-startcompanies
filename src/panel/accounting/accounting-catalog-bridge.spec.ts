import {
  legacyRuleCodeToCatalogCode,
  resolveRuleCodeInCatalog,
} from './accounting-catalog-bridge';

describe('accounting-catalog-bridge', () => {
  const allowed = new Set(['4100', '6210', '6400', '6700', 'INTERCO']);
  const labels: Record<string, string> = {
    '4100': 'Ingresos por servicios',
    '6210': 'Software, SaaS y tecnología',
    '6400': 'Viajes y transporte',
    '6700': 'Comisiones y pasarelas de pago',
    INTERCO: 'Operaciones intercompañía',
  };

  it('mapea códigos legacy de reglas al plan numérico', () => {
    expect(legacyRuleCodeToCatalogCode('SALES')).toBe('4100');
    expect(legacyRuleCodeToCatalogCode('ADMIN/SOFTWARES')).toBe('6210');
    expect(legacyRuleCodeToCatalogCode('TRAVEL')).toBe('6400');
    expect(legacyRuleCodeToCatalogCode('uber')).toBeNull();
    expect(legacyRuleCodeToCatalogCode('6400')).toBe('6400');
  });

  it('resuelve contra catálogo activo', () => {
    expect(resolveRuleCodeInCatalog('TRAVEL', allowed, labels)?.code).toBe('6400');
    expect(resolveRuleCodeInCatalog('6210', allowed, labels)?.code).toBe('6210');
    expect(resolveRuleCodeInCatalog('UNKNOWN', allowed, labels)).toBeNull();
  });
});
