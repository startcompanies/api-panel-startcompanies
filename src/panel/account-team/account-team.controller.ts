import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { AccountTeamService } from './account-team.service';
import { TeamContextService, type SessionUserPayload } from './team-context.service';
import { InviteTeamMemberDto } from './dtos/invite-team-member.dto';
import { UpdateTeamMemberDto } from './dtos/update-team-member.dto';

@ApiTags('Panel - Account team')
@ApiBearerAuth('JWT-auth')
@Controller('panel/account-team')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client', 'partner')
export class AccountTeamController {
  constructor(
    private readonly accountTeamService: AccountTeamService,
    private readonly teamContext: TeamContextService,
  ) {}

  private ownerId(req: { user: SessionUserPayload }): number {
    return this.teamContext.getEffectiveOwnerId(req.user);
  }

  @Get('schema')
  @ApiOperation({ summary: 'Claves de permisos disponibles según tipo de cuenta' })
  getSchema(@Req() req: { user: SessionUserPayload }) {
    const ownerId = this.ownerId(req);
    const type = req.user.type;
    if (type !== 'client' && type !== 'partner') {
      throw new ForbiddenException();
    }
    return this.accountTeamService.getPermissionSchema(type);
  }

  @Get('members')
  @ApiOperation({ summary: 'Listar teammates de la cuenta' })
  listMembers(@Req() req: { user: SessionUserPayload }) {
    this.teamContext.requirePermission(req.user, 'teamView');
    return this.accountTeamService.listMembers(this.ownerId(req));
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invitar teammate por email' })
  invite(@Req() req: { user: SessionUserPayload }, @Body() dto: InviteTeamMemberDto) {
    this.teamContext.requirePermission(req.user, 'teamManage');
    const ownerId = this.ownerId(req);
    if (!this.teamContext.isAccountOwner(req.user)) {
      return this.accountTeamService.invite(ownerId, req.user.id, dto);
    }
    return this.accountTeamService.invite(ownerId, req.user.id, dto);
  }

  @Patch('members/:id')
  @ApiOperation({ summary: 'Actualizar permisos de un teammate' })
  updateMember(
    @Req() req: { user: SessionUserPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    this.teamContext.requirePermission(req.user, 'teamManage');
    return this.accountTeamService.updatePermissions(this.ownerId(req), id, dto);
  }

  @Delete('members/:id')
  @ApiOperation({ summary: 'Revocar acceso de un teammate' })
  revoke(
    @Req() req: { user: SessionUserPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    this.teamContext.requirePermission(req.user, 'teamManage');
    return this.accountTeamService.revoke(this.ownerId(req), id);
  }
}
