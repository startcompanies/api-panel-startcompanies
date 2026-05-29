export type ContentVisibility = 'startcompanies' | 'partners' | 'both';

export const CONTENT_VISIBILITY_VALUES: ContentVisibility[] = [
  'startcompanies',
  'partners',
  'both',
];

export function visibilitiesForTenantKind(
  kind: 'platform' | 'partner',
): ContentVisibility[] {
  return kind === 'partner'
    ? ['partners', 'both']
    : ['startcompanies', 'both'];
}

export function normalizeContentVisibility(
  raw?: string | null,
): ContentVisibility {
  if (raw === 'partners' || raw === 'both') {
    return raw;
  }
  return 'startcompanies';
}
