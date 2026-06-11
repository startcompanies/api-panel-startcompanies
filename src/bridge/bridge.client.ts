import { v4 as uuidv4 } from 'uuid';

export class BridgeError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly raw: unknown,
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

export interface BridgeKycLinkResponse {
  id: string;
  customer_id?: string;
  full_name?: string;
  email?: string;
  type: 'business' | 'individual';
  kyc_link: string;
  tos_link: string;
  kyc_status: string;
  tos_status: string;
  rejection_reasons?: Array<{ reason?: string; developer_reason?: string }>;
  created_at?: string;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export function bridgeIsConfigured(): boolean {
  return Boolean(
    process.env.BRIDGE_API_KEY?.trim() && process.env.BRIDGE_BASE_URL?.trim(),
  );
}

function bridgeConfig() {
  return {
    baseUrl: process.env.BRIDGE_BASE_URL!.replace(/\/$/, ''),
    apiKey: process.env.BRIDGE_API_KEY!,
  };
}

export async function bridgeRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, idempotencyKey } = options;
  const { baseUrl, apiKey } = bridgeConfig();

  const headers: Record<string, string> = {
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  };

  if (['POST', 'PATCH', 'PUT'].includes(method)) {
    headers['Idempotency-Key'] = idempotencyKey ?? uuidv4();
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    throw new BridgeError(
      res.status,
      typeof data.code === 'string' ? data.code : 'unknown_error',
      typeof data.message === 'string'
        ? data.message
        : `Bridge error ${res.status}`,
      data,
    );
  }

  return data as T;
}

export async function bridgeRequestWithRetry<T>(
  path: string,
  options: RequestOptions = {},
  maxAttempts = 4,
): Promise<T> {
  const idempotencyKey = options.idempotencyKey ?? uuidv4();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await bridgeRequest<T>(path, { ...options, idempotencyKey });
    } catch (err) {
      if (!(err instanceof BridgeError)) throw err;
      const isLast = attempt === maxAttempts;
      if (isLast || !RETRYABLE_STATUSES.has(err.status)) throw err;
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error('Bridge retry unreachable');
}

export async function createBridgeKycLink(params: {
  full_name: string;
  email: string;
  type: 'business' | 'individual';
  redirect_uri?: string;
  idempotencyKey: string;
}): Promise<BridgeKycLinkResponse> {
  try {
    return await bridgeRequestWithRetry<BridgeKycLinkResponse>('/kyc_links', {
      method: 'POST',
      idempotencyKey: params.idempotencyKey,
      body: {
        full_name: params.full_name,
        email: params.email,
        type: params.type,
        ...(params.redirect_uri ? { redirect_uri: params.redirect_uri } : {}),
      },
    });
  } catch (err) {
    if (!(err instanceof BridgeError) || err.code !== 'duplicate_record') {
      throw err;
    }

    const existing = parseExistingKycLink(err.raw);
    if (!existing) throw err;

    if (existing.type !== params.type) {
      throw new BridgeError(
        409,
        'kyc_link_type_mismatch',
        `Este correo ya tiene un enlace KYC de tipo ${existing.type}.`,
        err.raw,
      );
    }

    return existing;
  }
}

function parseExistingKycLink(raw: unknown): BridgeKycLinkResponse | null {
  if (!raw || typeof raw !== 'object') return null;

  const existing = (raw as Record<string, unknown>).existing_kyc_link;
  if (!existing || typeof existing !== 'object') return null;

  const link = existing as Record<string, unknown>;
  if (
    typeof link.id !== 'string' ||
    typeof link.kyc_link !== 'string' ||
    typeof link.tos_link !== 'string' ||
    (link.type !== 'business' && link.type !== 'individual')
  ) {
    return null;
  }

  return existing as BridgeKycLinkResponse;
}

export async function getBridgeKycLink(
  kycLinkId: string,
): Promise<BridgeKycLinkResponse> {
  return bridgeRequestWithRetry<BridgeKycLinkResponse>(
    `/kyc_links/${encodeURIComponent(kycLinkId)}`,
  );
}

export async function deleteBridgeCustomer(customerId: string): Promise<void> {
  try {
    await bridgeRequest(`/customers/${encodeURIComponent(customerId)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    if (err instanceof BridgeError && err.status === 404) return;
    throw err;
  }
}

export function bridgeOnboardingCancelAllowed(): boolean {
  if (process.env.BRIDGE_ALLOW_ONBOARDING_CANCEL === 'true') return true;
  if (process.env.BRIDGE_ALLOW_ONBOARDING_CANCEL === 'false') return false;
  const base = process.env.BRIDGE_BASE_URL ?? '';
  return base.includes('sandbox.bridge.xyz');
}
