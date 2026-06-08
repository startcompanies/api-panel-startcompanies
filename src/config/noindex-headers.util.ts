/**
 * Entornos no productivos (staging, dev, local) deben enviar X-Robots-Tag en todas las respuestas.
 */
export function shouldSendNoIndexHeaders(hostHeader?: string): boolean {
  if (process.env.NOINDEX_HEADERS === '1' || process.env.NOINDEX_HEADERS === 'true') {
    return true;
  }
  if (process.env.MODE === 'DEV') {
    return true;
  }
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  const host = (hostHeader ?? '').toLowerCase().split(':')[0].trim();
  if (!host) {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    return true;
  }
  if (host.includes('staging')) {
    return true;
  }
  if (host.startsWith('dev.') || host.includes('.dev.')) {
    return true;
  }

  return false;
}

export const NOINDEX_ROBOTS_HEADER_VALUE = 'noindex, nofollow';
