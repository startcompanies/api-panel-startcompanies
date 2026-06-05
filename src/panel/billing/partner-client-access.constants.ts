import type { PlatformFeatures } from '../pricing/entities/pricing-plan.entity';

/** Acceso completo al panel para clientes de partner (sin suscripción Stripe). */
export const PARTNER_CLIENT_PLATFORM_FEATURES: PlatformFeatures = {
  invoicing: true,
  accounting: true,
  accountingAi: true,
  accountingPlaid: true,
  aiConfig: true,
  videos: true,
  guides: true,
};

export const PARTNER_CLIENT_ACCESS_UNTIL = new Date('2099-12-31T23:59:59.000Z');
