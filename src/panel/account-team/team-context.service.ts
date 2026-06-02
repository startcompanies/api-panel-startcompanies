import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AccountTeamPermissionKey, AccountTeamPermissions } from './account-team-permissions';

export type SessionUserPayload = {
  id: number;
  type?: string;
  accountOwnerId?: number;
  isAccountOwner?: boolean;
  permissions?: AccountTeamPermissions | null;
};

@Injectable()
export class TeamContextService {
  getEffectiveOwnerId(user: SessionUserPayload): number {
    return user.accountOwnerId ?? user.id;
  }

  isAccountOwner(user: SessionUserPayload): boolean {
    if (user.isAccountOwner === true) return true;
    if (user.isAccountOwner === false) return false;
    return !user.accountOwnerId || user.accountOwnerId === user.id;
  }

  hasPermission(user: SessionUserPayload, key: AccountTeamPermissionKey): boolean {
    if (this.isAccountOwner(user)) return true;
    const perms = user.permissions;
    if (!perms) return false;
    return Boolean(perms[key]);
  }

  requirePermission(user: SessionUserPayload, key: AccountTeamPermissionKey): void {
    if (!this.hasPermission(user, key)) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
  }
}
