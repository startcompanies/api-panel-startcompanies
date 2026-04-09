/**
 * Normaliza correo para búsqueda en login / auth: trim y minúsculas.
 * El dominio es case-insensitive; la parte local se trata igual que la mayoría de proveedores.
 */
export function normalizeAuthEmail(email: string | undefined | null): string {
  if (email == null || typeof email !== 'string') {
    return '';
  }
  return email.trim().toLowerCase();
}
