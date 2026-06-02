/** Permisos granulares de un teammate sobre la cuenta del owner. */
export type AccountTeamPermissions = {
  companyView: boolean;
  companyEdit: boolean;
  brandView: boolean;
  brandEdit: boolean;
  preferencesView: boolean;
  preferencesEdit: boolean;
  subscriptionView: boolean;
  subscriptionManage: boolean;
  operationsDashboard: boolean;
  operationsRequests: boolean;
  operationsInvoicing: boolean;
  operationsAccounting: boolean;
  operationsCatalog: boolean;
  operationsMyClients: boolean;
  operationsDocuments: boolean;
  operationsVideos: boolean;
  operationsGuides: boolean;
  operationsLili: boolean;
  teamView: boolean;
  teamManage: boolean;
};

export type AccountTeamPermissionKey = keyof AccountTeamPermissions;

export const ACCOUNT_TEAM_PERMISSION_KEYS: AccountTeamPermissionKey[] = [
  'companyView',
  'companyEdit',
  'brandView',
  'brandEdit',
  'preferencesView',
  'preferencesEdit',
  'subscriptionView',
  'subscriptionManage',
  'operationsDashboard',
  'operationsRequests',
  'operationsInvoicing',
  'operationsAccounting',
  'operationsCatalog',
  'operationsMyClients',
  'operationsDocuments',
  'operationsVideos',
  'operationsGuides',
  'operationsLili',
  'teamView',
  'teamManage',
];

/** Preset conservador para invitaciones nuevas. */
export const DEFAULT_TEAMMATE_PERMISSIONS: AccountTeamPermissions = {
  companyView: true,
  companyEdit: false,
  brandView: true,
  brandEdit: false,
  preferencesView: true,
  preferencesEdit: false,
  subscriptionView: false,
  subscriptionManage: false,
  operationsDashboard: true,
  operationsRequests: true,
  operationsInvoicing: true,
  operationsAccounting: true,
  operationsCatalog: true,
  operationsMyClients: false,
  operationsDocuments: true,
  operationsVideos: true,
  operationsGuides: true,
  operationsLili: true,
  teamView: true,
  teamManage: false,
};

export const FULL_TEAM_PERMISSIONS: AccountTeamPermissions = Object.fromEntries(
  ACCOUNT_TEAM_PERMISSION_KEYS.map((k) => [k, true]),
) as AccountTeamPermissions;

export function mergeTeamPermissions(
  partial?: Partial<AccountTeamPermissions> | null,
): AccountTeamPermissions {
  const base = { ...DEFAULT_TEAMMATE_PERMISSIONS };
  if (!partial) return base;
  for (const key of ACCOUNT_TEAM_PERMISSION_KEYS) {
    if (typeof partial[key] === 'boolean') {
      base[key] = partial[key] as boolean;
    }
  }
  return base;
}

export function sanitizePermissionsInput(
  input: unknown,
): AccountTeamPermissions {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_TEAMMATE_PERMISSIONS };
  }
  return mergeTeamPermissions(input as Partial<AccountTeamPermissions>);
}
