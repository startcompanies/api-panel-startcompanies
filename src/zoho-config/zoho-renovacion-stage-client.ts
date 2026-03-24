/**
 * Etapas internas del Deal en Zoho que se muestran al cliente con otro nombre.
 * El resto del pipeline se refleja 1:1 en request.stage.
 */
export const ZOHO_RENOVACION_STAGE_CLIENT_ALIAS: Record<string, string> = {
  'Federal enviada a Tax Preparer': 'Renovación Confirmada',
  'Aprobación cliente': 'Federal - En revisión interna',
  'RA completado': 'RA en Proceso',
  'Estatal en proceso': 'Presentación estatal',
};

export function applyRenovacionClientStageAlias(zohoStage: string): string {
  const key = zohoStage.trim();
  return ZOHO_RENOVACION_STAGE_CLIENT_ALIAS[key] ?? key;
}
