/**
 * Orígenes permitidos para HTTP CORS y Socket.IO (deben coincidir).
 * localhost solo se permite en entornos de desarrollo (MODE=DEV o NODE_ENV=development).
 */
const isDev = process.env.MODE === 'DEV' || process.env.NODE_ENV === 'development';

export function getAllowedOrigins(): string[] {
  const allowedOrigins = [
    'https://startcompanies.us',
    'https://staging.startcompanies.io',
    'https://startcompanies.io',
    'https://panel.startcompanies.io',
    'https://panel-staging.startcompanies.io',
  ];

  if (isDev) {
    allowedOrigins.push('http://localhost:4200', 'http://127.0.0.1:4200');
  }

  if (process.env.ZOHO_CRM_DOMAINS) {
    const zohoDomains = process.env.ZOHO_CRM_DOMAINS.split(',').map((d) => d.trim());
    allowedOrigins.push(...zohoDomains);
  }

  if (process.env.TENANT_CORS_ORIGINS) {
    const tenantOrigins = process.env.TENANT_CORS_ORIGINS.split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    allowedOrigins.push(...tenantOrigins);
  }

  return allowedOrigins;
}

export function createCorsOriginCallback(): (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void {
  const allowedOrigins = getAllowedOrigins();
  return (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Origen rechazado: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  };
}

/** Opción `cors` de Socket.IO / WebSocketGateway (misma política que `enableCors`). */
export function getSocketIoCorsConfig() {
  return {
    origin: createCorsOriginCallback(),
    credentials: true as const,
    methods: ['GET', 'POST'] as const,
  };
}
