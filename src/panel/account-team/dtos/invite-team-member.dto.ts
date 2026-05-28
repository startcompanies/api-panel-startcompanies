import { IsEmail, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AccountTeamPermissions } from '../account-team-permissions';

export class InviteTeamMemberDto {
  @ApiProperty({ example: 'colaborador@empresa.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Permisos granulares; si se omite, preset conservador' })
  @IsOptional()
  @IsObject()
  permissions?: Partial<AccountTeamPermissions>;
}
