import { PublicTenantDto } from './dtos/public-tenant.dto';

const DEFAULT_PLATFORM_TITLE =
  'Start Companies - Apertura de Cuentas Bancarias en EE.UU.';
const DEFAULT_PLATFORM_DESCRIPTION =
  'Abrimos cuentas bancarias para LLC en Estados Unidos. Servicio 100% online, sin comisiones y con garantía. Acompañamiento paso a paso.';
const DEFAULT_OG_IMAGE = 'https://media.startcompanies.us/logo.png';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveCanonicalUrl(tenant: PublicTenantDto): string {
  const base = tenant.frontendBaseUrl?.trim().replace(/\/$/, '');
  if (base) {
    return base;
  }
  const host = tenant.customDomain?.trim();
  return host ? `https://${host}` : 'https://startcompanies.io';
}

function resolveOgImage(tenant: PublicTenantDto): string {
  const candidate =
    tenant.logoUrl?.trim() ||
    tenant.logoDarkUrl?.trim() ||
    (tenant.kind === 'platform' ? DEFAULT_OG_IMAGE : null);
  if (!candidate) {
    return DEFAULT_OG_IMAGE;
  }
  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }
  const base = resolveCanonicalUrl(tenant);
  return `${base}${candidate.startsWith('/') ? '' : '/'}${candidate}`;
}

export function buildSharePreviewMeta(tenant: PublicTenantDto): {
  title: string;
  description: string;
  canonicalUrl: string;
  ogImage: string;
} {
  const canonicalUrl = resolveCanonicalUrl(tenant);
  const ogImage = resolveOgImage(tenant);

  if (tenant.kind === 'platform') {
    return {
      title: DEFAULT_PLATFORM_TITLE,
      description: DEFAULT_PLATFORM_DESCRIPTION,
      canonicalUrl,
      ogImage,
    };
  }

  const name = tenant.displayName?.trim() || 'Portal';
  return {
    title: name,
    description: `Portal de ${name}. Accede a tu panel y gestiona tus servicios en línea.`,
    canonicalUrl,
    ogImage,
  };
}

export function renderTenantSharePreviewHtml(tenant: PublicTenantDto): string {
  const { title, description, canonicalUrl, ogImage } = buildSharePreviewMeta(tenant);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeUrl = escapeHtml(canonicalUrl);
  const safeImage = escapeHtml(ogImage);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  <link rel="canonical" href="${safeUrl}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${safeTitle}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${safeUrl}">
  <meta property="og:image" content="${safeImage}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${safeImage}">
  <meta http-equiv="refresh" content="0;url=${safeUrl}">
</head>
<body>
  <p><a href="${safeUrl}">${safeTitle}</a></p>
</body>
</html>`;
}
