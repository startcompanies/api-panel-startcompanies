import { Request } from '../entities/request.entity';

function hasCompletedPayment(
  request: Pick<
    Request,
    'stripeChargeId' | 'paymentMethod' | 'paymentStatus' | 'paymentProofUrl'
  >,
): boolean {
  if (request.stripeChargeId && request.paymentStatus === 'succeeded') {
    return true;
  }
  if (
    request.paymentMethod === 'transferencia' &&
    String(request.paymentProofUrl || '').trim() !== ''
  ) {
    return true;
  }
  return false;
}

/**
 * Flujos sin cobro inicial (crm-lead, panel sin pago): la firma en confirmación
 * equivale a envío de la solicitud → solicitud-recibida.
 */
export function shouldPromoteNoPaymentFlowToSolicitudRecibida(
  request: Pick<
    Request,
    | 'status'
    | 'createdFrom'
    | 'stripeChargeId'
    | 'paymentMethod'
    | 'paymentStatus'
    | 'paymentProofUrl'
    | 'signatureUrl'
  >,
): boolean {
  if (request.status !== 'pendiente') {
    return false;
  }
  const signature = String(request.signatureUrl || '').trim();
  if (!signature) {
    return false;
  }
  if (hasCompletedPayment(request)) {
    return false;
  }

  if (request.createdFrom === 'crm-lead') {
    return true;
  }

  if (
    request.createdFrom === 'panel' &&
    (request.paymentStatus === 'not_required' || !request.paymentMethod)
  ) {
    return true;
  }

  return false;
}

/**
 * Wizard con pago (renovación, apertura con Stripe, etc.): el pago no cierra la solicitud
 * (el usuario sigue el formulario), pero la firma en confirmación sí.
 */
export function shouldPromoteWizardSignatureToSolicitudRecibida(
  request: Pick<
    Request,
    'status' | 'createdFrom' | 'signatureUrl'
  >,
): boolean {
  if (request.status !== 'pendiente') {
    return false;
  }
  if (request.createdFrom !== 'wizard') {
    return false;
  }
  return String(request.signatureUrl || '').trim() !== '';
}

/**
 * Promueve borradores que ya cumplieron el cierre del flujo (firma y/o pago según origen).
 */
export function shouldPromoteToSolicitudRecibida(
  request: Pick<
    Request,
    | 'status'
    | 'createdFrom'
    | 'stripeChargeId'
    | 'paymentMethod'
    | 'paymentStatus'
    | 'paymentProofUrl'
    | 'signatureUrl'
  >,
): boolean {
  return (
    shouldPromoteNoPaymentFlowToSolicitudRecibida(request) ||
    shouldPromoteWizardSignatureToSolicitudRecibida(request)
  );
}

export function applySolicitudRecibidaStatusPromotion(request: Request): boolean {
  if (!shouldPromoteToSolicitudRecibida(request)) {
    return false;
  }
  request.status = 'solicitud-recibida';
  return true;
}

/** @deprecated Usar applySolicitudRecibidaStatusPromotion */
export function applyNoPaymentSignatureStatusPromotion(request: Request): boolean {
  return applySolicitudRecibidaStatusPromotion(request);
}
