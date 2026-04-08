/**
 * Normalización y validación de URLs públicas (sitio web, LinkedIn, etc.)
 * para persistencia y Zoho (solo https).
 */

const INVALID_MESSAGE =
  'Introduce una URL completa o un dominio válido (se guardará con https://).';

/**
 * Hostname aceptable para enviar a Zoho / guardar en BD (rechaza localhost, IPs privadas, etc.)
 */
export function isAcceptablePublicWebHostname(hostname: string): boolean {
  const h = (hostname || '').toLowerCase();
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost')) return false;
  if (h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return false;

  const ipv4Parts = h.split('.');
  if (ipv4Parts.length === 4 && ipv4Parts.every((p) => /^\d{1,3}$/.test(p))) {
    const a = parseInt(ipv4Parts[0], 10);
    const b = parseInt(ipv4Parts[1], 10);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;
  }

  return true;
}

/**
 * Devuelve URL con esquema https o cadena vacía si no es válida / no aceptable.
 */
export function normalizePublicHttpsWebUrl(
  raw: string | null | undefined,
): string {
  const t = (raw ?? '').trim();
  if (!t) return '';

  const tl = t.toLowerCase();
  if (
    tl.startsWith('javascript:') ||
    tl.startsWith('data:') ||
    tl.startsWith('vbscript:')
  ) {
    return '';
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    const proto = t.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
    if (proto !== 'http' && proto !== 'https') {
      return '';
    }
  }

  let ustr = t.replace(/^http:\/\//i, 'https://');
  if (!/^https:\/\//i.test(ustr)) {
    ustr = `https://${ustr}`;
  }
  ustr = ustr.replace(/^http:\/\//i, 'https://');

  try {
    const parsed = new URL(ustr);
    if (parsed.protocol !== 'https:') return '';
    if (!parsed.hostname) return '';
    if (!isAcceptablePublicWebHostname(parsed.hostname)) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

export type PublicWebUrlValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

/**
 * Campo opcional: vacío / null → ok con ''.
 * Con texto: debe normalizar a https válido.
 */
export function validateOptionalPublicWebUrl(
  raw: unknown,
): PublicWebUrlValidation {
  if (raw === undefined || raw === null) {
    return { ok: true, value: '' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, message: INVALID_MESSAGE };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: '' };
  }
  const normalized = normalizePublicHttpsWebUrl(trimmed);
  if (!normalized) {
    return { ok: false, message: INVALID_MESSAGE };
  }
  return { ok: true, value: normalized };
}

export { INVALID_MESSAGE as PUBLIC_WEB_URL_INVALID_MESSAGE };

/**
 * Normaliza in-place las claves indicadas. Devuelve mensaje de error o null si todo OK.
 */
export function applyOptionalPublicWebUrlsToObject(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    if (!(key in obj) || obj[key] === undefined) {
      continue;
    }
    const r = validateOptionalPublicWebUrl(obj[key]);
    if (!r.ok) {
      return r.message;
    }
    obj[key] = r.value;
  }
  return null;
}
