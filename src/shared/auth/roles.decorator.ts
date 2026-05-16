import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
// Roles: 'admin', 'partner', 'client', 'user'
export const Roles = (...roles: ('admin' | 'partner' | 'client' | 'user')[]) =>
  SetMetadata(ROLES_KEY, roles);

