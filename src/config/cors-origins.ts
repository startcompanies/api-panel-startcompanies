/**
 * Orígenes permitidos para HTTP CORS y Socket.IO (deben coincidir).
 */
export function getAllowedOrigins(): string[] {
  const allowedOrigins = [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'https://startcompanies.us',
    'https://admin-blog.startcompanies.us',
    'https://staging.startcompanies.io',
    'https://startcompanies.io',
  ];
  if (process.env.ZOHO_CRM_DOMAINS) {
    const zohoDomains = process.env.ZOHO_CRM_DOMAINS.split(',').map((d) => d.trim());
    allowedOrigins.push(...zohoDomains);
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
