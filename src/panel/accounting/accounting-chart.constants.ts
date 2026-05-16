/** Plan de cuentas para P&L / categorización (whitelist IA y reglas). */
export const ACCOUNT_CHART_LABELS: Record<string, string> = {
  '4000': 'Ingresos por Servicios',
  '4100': 'Otros Ingresos',
  '5000': 'Nómina / Contratistas',
  '5100': 'Software / SaaS',
  '5200': 'Marketing / Publicidad',
  '5300': 'Honorarios Profesionales',
  '5400': 'Viajes y Gastos',
  '5500': 'Gastos Bancarios',
  '5600': 'Infraestructura / Hosting',
  '5700': 'Otros Gastos',
};

export const ACCOUNT_CHART_CODES = Object.keys(ACCOUNT_CHART_LABELS);

export function isAllowedAccountCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const digits = String(code).replace(/\D/g, '').slice(0, 4);
  return ACCOUNT_CHART_CODES.includes(digits);
}
