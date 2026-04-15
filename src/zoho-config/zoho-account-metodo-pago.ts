/**
 * Mapeo del método de pago de la solicitud al picklist **Metodo_Pago** del módulo **Accounts** en Zoho CRM.
 *
 * Los valores deben coincidir **exactamente** con las opciones del picklist en Zoho (incluidas mayúsculas
 * y acentos). Si el CRM usa otros literales, actualizar estas constantes y redesplegar.
 */
export const ZOHO_ACCOUNT_METODO_PAGO_BY_PAYMENT_METHOD = {
  stripe: 'Stripe',
  transferencia: 'Transferencia',
} as const;

export function picklistMetodoPagoForRequest(
  paymentMethod: 'stripe' | 'transferencia' | null | undefined,
): string | undefined {
  if (paymentMethod === 'stripe') {
    return ZOHO_ACCOUNT_METODO_PAGO_BY_PAYMENT_METHOD.stripe;
  }
  if (paymentMethod === 'transferencia') {
    return ZOHO_ACCOUNT_METODO_PAGO_BY_PAYMENT_METHOD.transferencia;
  }
  return undefined;
}
