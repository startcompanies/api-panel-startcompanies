import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../shared/user/entities/user.entity';
import { AccountTeamMember } from './entities/account-team-member.entity';
import {
  DEFAULT_TEAMMATE_PERMISSIONS,
  mergeTeamPermissions,
  sanitizePermissionsInput,
  type AccountTeamPermissions,
} from './account-team-permissions';
import { InviteTeamMemberDto } from './dtos/invite-team-member.dto';
import { UpdateTeamMemberDto } from './dtos/update-team-member.dto';
import { EmailService } from '../../shared/common/services/email.service';
import { EmailTenantBrandingService } from '../partner-tenants/email-tenant-branding.service';
import { encodePassword } from '../../shared/common/utils/bcrypt';
import { normalizeAuthEmail } from '../../shared/common/utils/normalize-auth-email';

const OWNER_TYPES = new Set(['client', 'partner']);

@Injectable()
export class AccountTeamService {
  constructor(
    @InjectRepository(AccountTeamMember)
    private readonly teamRepo: Repository<AccountTeamMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly emailTenantBranding: EmailTenantBrandingService,
  ) {}

  assertCanManageTeam(owner: User): void {
    if (!OWNER_TYPES.has(owner.type)) {
      throw new ForbiddenException('Solo partners y clientes pueden gestionar teammates');
    }
  }

  async findActiveMembershipByMemberId(
    memberUserId: number,
  ): Promise<AccountTeamMember | null> {
    return this.teamRepo.findOne({
      where: { memberUserId, status: 'active' },
      relations: ['owner'],
    });
  }

  async buildSessionExtras(user: User): Promise<{
    accountOwnerId: number;
    isAccountOwner: boolean;
    permissions: AccountTeamPermissions | null;
    type: User['type'];
  }> {
    const membership = await this.findActiveMembershipByMemberId(user.id);
    if (membership) {
      const owner =
        membership.owner ??
        (await this.userRepo.findOne({ where: { id: membership.ownerUserId } }));
      if (owner?.status) {
        return {
          accountOwnerId: owner.id,
          isAccountOwner: false,
          permissions: membership.permissions,
          type: owner.type,
        };
      }
    }
    return {
      accountOwnerId: user.id,
      isAccountOwner: true,
      permissions: null,
      type: user.type,
    };
  }

  private async loadOwner(ownerUserId: number): Promise<User> {
    const owner = await this.userRepo.findOne({ where: { id: ownerUserId } });
    if (!owner || !owner.status) {
      throw new NotFoundException('Cuenta no encontrada');
    }
    this.assertCanManageTeam(owner);
    return owner;
  }

  async listMembers(ownerUserId: number) {
    const rows = await this.teamRepo.find({
      where: { ownerUserId, status: 'active' },
      relations: ['member'],
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.serializeMember(row));
  }

  async invite(ownerUserId: number, invitedByUserId: number, dto: InviteTeamMemberDto) {
    const owner = await this.loadOwner(ownerUserId);
    const email = normalizeAuthEmail(dto.email);
    if (!email) {
      throw new BadRequestException('Email inválido');
    }
    if (email === owner.email.toLowerCase()) {
      throw new BadRequestException('No puedes invitarte a ti mismo');
    }

    let memberUser = await this.userRepo.findOne({
      where: { email },
    });

    if (memberUser) {
      if (memberUser.id === ownerUserId) {
        throw new BadRequestException('Este email pertenece al titular de la cuenta');
      }
      if (OWNER_TYPES.has(memberUser.type)) {
        throw new BadRequestException(
          'Este email ya es titular de otra cuenta en el panel',
        );
      }
      const otherMembership = await this.teamRepo.findOne({
        where: { memberUserId: memberUser.id, status: 'active' },
      });
      if (otherMembership && otherMembership.ownerUserId !== ownerUserId) {
        throw new BadRequestException(
          'Este usuario ya pertenece al equipo de otra cuenta',
        );
      }
    } else {
      const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '') || 'teammate';
      let username = baseUsername;
      let n = 0;
      while (await this.userRepo.findOne({ where: { username } })) {
        n += 1;
        username = `${baseUsername}${n}`;
      }
      const tempPassword = this.generateTemporaryPassword();
      memberUser = this.userRepo.create({
        username,
        email,
        password: encodePassword(tempPassword),
        type: 'user',
        status: true,
        first_name: '',
        last_name: '',
      });
      memberUser = await this.userRepo.save(memberUser);
    }

    const permissions = mergeTeamPermissions(dto.permissions ?? DEFAULT_TEAMMATE_PERMISSIONS);

    let row = await this.teamRepo.findOne({
      where: { ownerUserId, memberUserId: memberUser.id },
    });
    if (row?.status === 'active') {
      throw new BadRequestException('Este usuario ya es teammate de tu cuenta');
    }
    if (row) {
      row.status = 'active';
      row.permissions = permissions;
      row.invitedByUserId = invitedByUserId;
    } else {
      row = this.teamRepo.create({
        ownerUserId,
        memberUserId: memberUser.id,
        status: 'active',
        permissions,
        invitedByUserId,
      });
    }
    await this.teamRepo.save(row);

    const resetToken = await this.jwtService.signAsync(
      { id: memberUser.id, email: memberUser.email, type: 'password-setup' },
      { expiresIn: '24h' },
    );
    const userName =
      `${memberUser.first_name || ''} ${memberUser.last_name || ''}`.trim() ||
      memberUser.username;
    const branding = await this.emailTenantBranding.resolveForUser(owner);
    try {
      await this.emailService.sendInvitationEmail(
        memberUser.email,
        userName,
        resetToken,
        owner.type as 'partner' | 'client',
        branding,
      );
    } catch (e) {
      console.error('Error enviando invitación teammate:', e);
    }

    const saved = await this.teamRepo.findOne({
      where: { id: row.id },
      relations: ['member'],
    });
    return this.serializeMember(saved!);
  }

  async updatePermissions(
    ownerUserId: number,
    memberId: number,
    dto: UpdateTeamMemberDto,
  ) {
    await this.loadOwner(ownerUserId);
    const row = await this.teamRepo.findOne({
      where: { id: memberId, ownerUserId, status: 'active' },
      relations: ['member'],
    });
    if (!row) {
      throw new NotFoundException('Teammate no encontrado');
    }
    row.permissions = sanitizePermissionsInput(dto.permissions);
    await this.teamRepo.save(row);
    return this.serializeMember(row);
  }

  async revoke(ownerUserId: number, memberId: number) {
    await this.loadOwner(ownerUserId);
    const row = await this.teamRepo.findOne({
      where: { id: memberId, ownerUserId, status: 'active' },
    });
    if (!row) {
      throw new NotFoundException('Teammate no encontrado');
    }
    row.status = 'revoked';
    await this.teamRepo.save(row);
    return { ok: true };
  }

  getPermissionSchema(ownerType: 'client' | 'partner') {
    const keys = Object.keys(DEFAULT_TEAMMATE_PERMISSIONS) as (keyof AccountTeamPermissions)[];
    return {
      ownerType,
      keys,
      defaults: DEFAULT_TEAMMATE_PERMISSIONS,
    };
  }

  private serializeMember(row: AccountTeamMember) {
    const m = row.member;
    return {
      id: row.id,
      memberUserId: row.memberUserId,
      email: m?.email ?? '',
      first_name: m?.first_name ?? '',
      last_name: m?.last_name ?? '',
      username: m?.username ?? '',
      permissions: row.permissions,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private generateTemporaryPassword(): string {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 14; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}
