/**
 * Etapas internas del Deal en Zoho que se muestran al cliente con otro nombre.
 * El resto del pipeline se refleja 1:1 en request.stage.
 *
 * Blueprint cliente (orden): Solicitud Recibida → Renovación Confirmada → Presentación Federal en Proceso
 * → Federal completada → Register Agreement (en Proceso / completado) → estatal (NM vs no NM) → Renovación completa.
 */
export const ZOHO_RENOVACION_STAGE_CLIENT_ALIAS: Record<string, string> = {
  'Renovación Abierta': 'Solicitud Recibida',
  'Federal enviada a Tax Preparer': 'Presentación Federal en Proceso',
  'Federal - En revisión interna': 'Presentación Federal en Proceso',
  'Aprobación cliente': 'Presentación Federal en Proceso',
  'Federal completada': 'Federal completada',
  'RA en Proceso': 'Register Agreement en Proceso',
  'RA completado': 'Register Agreement completado',
  'Presentación estatal': 'Estatal Completada',
  'Estatal en proceso': 'Estatal en proceso',
};

export function applyRenovacionClientStageAlias(zohoStage: string): string {
  const key = zohoStage.trim();
  return ZOHO_RENOVACION_STAGE_CLIENT_ALIAS[key] ?? key;
}
