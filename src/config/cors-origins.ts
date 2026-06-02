/**
 * Orígenes permitidos para HTTP CORS y Socket.IO (deben coincidir).
 * localhost solo se permite en entornos de desarrollo (MODE=DEV o NODE_ENV=development).
 */
const isDev = process.env.MODE === 'DEV' || process.env.NODE_ENV === 'development';

function normalizeCorsOrigin(value: string | undefined | null): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }
  let origin = value.trim();
  if (!origin) {
    return null;
  }
  if (!origin.includes('://')) {
    origin = `https://${origin}`;
  }
  try {
    const url = new URL(origin);
    return url.origin;
  } catch {
    return origin.replace(/\/+$/, '');
  }
}

function pushOrigin(bucket: string[], raw: string | undefined | null): void {
  const normalized = normalizeCorsOrigin(raw);
  if (normalized) {
    bucket.push(normalized);
  }
}

export function getAllowedOrigins(): string[] {
  const allowedOrigins: string[] = [];

  const defaults = [
    'https://startcompanies.us',
    'https://staging.startcompanies.io',
    'https://startcompanies.io',
    'https://www.startcompanies.io',
    'https://panel.startcompanies.io',
    'https://panel-staging.startcompanies.io',
  ];
  for (const d of defaults) {
    pushOrigin(allowedOrigins, d);
  }

  pushOrigin(allowedOrigins, process.env.FRONTEND_URL);

  if (isDev) {
    pushOrigin(allowedOrigins, 'http://localhost:4200');
    pushOrigin(allowedOrigins, 'http://127.0.0.1:4200');
  }

  if (process.env.ZOHO_CRM_DOMAINS) {
    for (const d of process.env.ZOHO_CRM_DOMAINS.split(',')) {
      pushOrigin(allowedOrigins, d);
    }
  }

  if (process.env.TENANT_CORS_ORIGINS) {
    for (const d of process.env.TENANT_CORS_ORIGINS.split(',')) {
      pushOrigin(allowedOrigins, d);
    }
  }

  if (process.env.CORS_EXTRA_ORIGINS) {
    for (const d of process.env.CORS_EXTRA_ORIGINS.split(',')) {
      pushOrigin(allowedOrigins, d);
    }
  }

  return [...new Set(allowedOrigins)];
}

export function createCorsOriginCallback(): (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void {
  const allowedOrigins = new Set(getAllowedOrigins());
  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalized = normalizeCorsOrigin(origin);
    if (normalized && allowedOrigins.has(normalized)) {
      callback(null, true);
      return;
    }
    console.warn(
      `[CORS] Origen rechazado: ${origin} (normalizado: ${normalized ?? 'n/a'}). Permitidos: ${[...allowedOrigins].join(', ')}`,
    );
    callback(new Error('Not allowed by CORS'));
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
