import type { PlatformFeatures } from '../../../panel/pricing/entities/pricing-plan.entity';

/** Partner clients: acceso Plaid si tienen contabilidad (sin flag explícito en BD). */
export function hasPlatformFeature(
  features: PlatformFeatures | null | undefined,
  key: keyof PlatformFeatures,
  opts?: { isPartnerClient?: boolean },
): boolean {
  if (opts?.isPartnerClient && key === 'accountingPlaid') {
    return features?.accounting !== false;
  }
  if (!features) return true;
  if (key === 'accountingPlaid') {
    const v = features.accountingPlaid;
    if (v === undefined || v === null) {
      return features.accounting === true;
    }
    return v === true;
  }
  return features[key] === true;
}
