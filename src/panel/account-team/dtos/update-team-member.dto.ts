import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { AccountTeamPermissions } from '../account-team-permissions';

export class UpdateTeamMemberDto {
  @ApiProperty()
  @IsObject()
  permissions: Partial<AccountTeamPermissions>;
}
