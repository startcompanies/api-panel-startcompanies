/**
 * Alias de etapas internas de Zoho Deal (Apertura) para vista cliente en el Panel.
 *
 * Orden lógico del timeline cliente:
 * Solicitud Recibida → Apertura Confirmada (Filing Iniciado mismo alias) → Documentación completada
 * → Apertura Cuenta Bancaria → Cuenta Bancaria Confirmada (formulario de pago) → Confirmación pago
 * → Apertura Activa (+ Apertura Perdida terminal).
 *
 * Se sobrescribe `request.stage` con estas etiquetas.
 */
export const ZOHO_APERTURA_STAGE_CLIENT_LABELS = [
  'Solicitud Recibida',
  'Apertura Confirmada',
  'Documentación completada',
  'Apertura Cuenta Bancaria',
  'Cuenta Bancaria Confirmada',
  'Confirmación pago',
  'Apertura Activa',
  'Apertura Perdida',
] as const;

export type AperturaClientStageLabel = (typeof ZOHO_APERTURA_STAGE_CLIENT_LABELS)[number];

/**
 * Normaliza un Deal.Stage (Zoho) a una etiqueta visible para el cliente.
 * Si no reconoce el stage, hace fallback a "Solicitud Recibida".
 */
export function applyAperturaClientStageAlias(
  zohoStage: string,
): AperturaClientStageLabel {
  const t = (zohoStage || '').trim();
  if (!t) return 'Solicitud Recibida';

  if (t === 'Apertura Perdida') return 'Apertura Perdida';
  if (t === 'Apertura Activa') return 'Apertura Activa';

  if (t === 'Confirmación pago' || t === 'Confirmacion pago') {
    return 'Confirmación pago';
  }

  if (t === 'Cuenta Bancaria Confirmada') {
    return 'Cuenta Bancaria Confirmada';
  }

  if (t === 'Apertura Cuenta Bancaria') {
    return 'Apertura Cuenta Bancaria';
  }

  /** Mismo hito cliente que Apertura Confirmada */
  if (t === 'Filing Iniciado' || t === 'Apertura Confirmada') {
    return 'Apertura Confirmada';
  }

  if (
    t === 'Documentación completada' ||
    t === 'EIN Solicitado' ||
    t === 'Operating Agreement' ||
    t === 'BOI Enviado' ||
    /documentaci/i.test(t) ||
    /\bein\b/i.test(t) ||
    /operating/i.test(t) ||
    /\bboi\b/i.test(t)
  ) {
    return 'Documentación completada';
  }

  if (t.includes('Cuenta Bancaria')) {
    return 'Apertura Cuenta Bancaria';
  }

  return 'Solicitud Recibida';
}
