import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
// Roles del Panel: 'admin', 'partner', 'client'
// Roles del Blog: 'admin', 'editor', 'user'
export const Roles = (...roles: ('admin' | 'partner' | 'client' | 'editor' | 'user')[]) =>
  SetMetadata(ROLES_KEY, roles);

