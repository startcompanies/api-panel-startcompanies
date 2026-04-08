import { User } from '../entities/user.entity';

export interface PublicUserResponse {
  id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
}

export interface InternalUserResponse {
  id: number;
  username: string;
  email: string;
  status: boolean;
  type: User['type'];
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  phone: string | null;
  company: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const SENSITIVE_RESPONSE_KEYS = new Set<string>([
  'password',
  'emailVerificationToken',
  'client_id',
  'client_secret',
  'access_token',
  'refresh_token',
]);

export function toPublicUserResponse(
  user?: Partial<User> | null,
): PublicUserResponse | null {
  if (!user) return null;
  return {
    id: Number(user.id),
    username: user.username ?? '',
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
  };
}

export function toInternalUserResponse(
  user?: Partial<User> | null,
): InternalUserResponse | null {
  if (!user) return null;
  return {
    id: Number(user.id),
    username: user.username ?? '',
    email: user.email ?? '',
    status: Boolean(user.status),
    type: (user.type as User['type']) ?? 'user',
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    bio: user.bio ?? null,
    phone: user.phone ?? null,
    company: user.company ?? null,
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.createdAt ?? new Date(0),
    updatedAt: user.updatedAt ?? new Date(0),
  };
}

export function sanitizeSensitiveResponseData<T>(input: T): T {
  return sanitizeSensitiveResponseDataInner(input, new WeakMap()) as T;
}

/**
 * Elimina claves sensibles recursivamente. Usa WeakMap para evitar bucle infinito
 * con referencias circulares (p. ej. entidades TypeORM con relaciones bidireccionales).
 */
function sanitizeSensitiveResponseDataInner(
  input: unknown,
  memo: WeakMap<object, unknown>,
): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input !== 'object') {
    return input;
  }

  if (input instanceof Date) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeSensitiveResponseDataInner(item, memo));
  }

  const obj = input as object;
  if (memo.has(obj)) {
    return memo.get(obj);
  }

  const sanitized: Record<string, unknown> = {};
  memo.set(obj, sanitized);

  const record = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_RESPONSE_KEYS.has(key)) {
      continue;
    }
    sanitized[key] = sanitizeSensitiveResponseDataInner(value, memo);
  }

  return sanitized;
}
