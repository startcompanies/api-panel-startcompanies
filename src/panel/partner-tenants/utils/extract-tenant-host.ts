/** Host del frontend (white-label), no el Host del API. */
export function extractTenantHostFromRequest(req: {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
}): string | undefined {
  const header = req.headers['x-tenant-host'];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  const q = req.query?.host;
  if (typeof q === 'string' && q.trim()) {
    return q.trim();
  }
  return undefined;
}
