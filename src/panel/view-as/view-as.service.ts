import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { authService } from '../../shared/auth/auth.service';
import { Client } from '../clients/entities/client.entity';
import { User } from '../../shared/user/entities/user.entity';
import { StartViewAsDto } from './dtos/start-view-as.dto';
import {
  VIEW_AS_ACTOR_ACCESS_COOKIE,
  VIEW_AS_ACCESS_MAX_AGE_MS,
  VIEW_AS_JWT_EXPIRES_IN,
} from './view-as.constants';

export type ViewAsJwtClaims = {
  id: number;
  type: string;
  viewAs?: boolean;
  viewAsActorId?: number;
  viewAsActorType?: string;
  viewAsClientLabel?: string;
  accountOwnerId?: number;
};

type PanelActorPayload = ViewAsJwtClaims & {
  email?: string;
};

@Injectable()
export class ViewAsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly authService: authService,
    private readonly jwtService: JwtService,
  ) {}

  async start(
    actorAccessToken: string | undefined,
    actorPayload: PanelActorPayload,
    dto: StartViewAsDto,
  ): Promise<{ accessToken: string; user: Awaited<ReturnType<authService['buildSessionPayload']>> & {
    viewAs: true;
    viewAsActorId: number;
    viewAsActorType: string;
    viewAsClientLabel: string;
  }; actorAccessTokenToStore: string }> {
    if (actorPayload.viewAs) {
      throw new BadRequestException(
        'Ya estás en modo vista. Sal primero con «Salir del modo vista».',
      );
    }

    if (!actorAccessToken?.trim()) {
      throw new BadRequestException('Sesión no válida para iniciar modo vista');
    }

    const actorType = actorPayload.type;
    if (!['partner', 'admin', 'user'].includes(actorType)) {
      throw new ForbiddenException('Tu rol no puede usar el modo vista de cliente');
    }

    const { clientUser, clientLabel } = await this.resolveTargetClient(
      actorPayload,
      dto,
    );

    const clientSession = await this.authService.buildSessionPayload(clientUser);
    const viewPayload = {
      ...clientSession,
      viewAs: true as const,
      viewAsActorId: actorPayload.id,
      viewAsActorType: actorType,
      viewAsClientLabel: clientLabel,
    };

    const accessToken = await this.jwtService.signAsync(viewPayload, {
      expiresIn: VIEW_AS_JWT_EXPIRES_IN,
    });

    const userResponse = {
      ...(await this.authService.buildSessionPayload(clientUser)),
      viewAs: true as const,
      viewAsActorId: actorPayload.id,
      viewAsActorType: actorType,
      viewAsClientLabel: clientLabel,
    };

    return {
      accessToken,
      user: userResponse,
      actorAccessTokenToStore: actorAccessToken,
    };
  }

  async end(
    currentAccessToken: string | undefined,
    storedActorAccess: string | undefined,
  ): Promise<{
    accessToken: string;
    user: Awaited<ReturnType<authService['buildSessionPayload']>>;
  }> {
    let actorId: number | null = null;

    if (currentAccessToken) {
      try {
        const payload = (await this.jwtService.verifyAsync(
          currentAccessToken,
        )) as ViewAsJwtClaims;
        if (payload.viewAs && payload.viewAsActorId != null) {
          actorId = Number(payload.viewAsActorId);
        }
      } catch {
        // ignore
      }
    }

    const restoreToken = storedActorAccess?.trim();
    if (!restoreToken) {
      if (actorId == null) {
        throw new BadRequestException('No hay sesión de modo vista activa');
      }
      const user = await this.authService.buildSessionPayloadForUserId(actorId);
      const accessToken = await this.jwtService.signAsync(user);
      return { accessToken, user };
    }

    try {
      const actorPayload = (await this.jwtService.verifyAsync(
        restoreToken,
      )) as ViewAsJwtClaims;
      if (actorPayload.viewAs) {
        throw new BadRequestException('Token de actor inválido');
      }
      const user = await this.authService.buildSessionPayloadForUserId(
        Number(actorPayload.id),
      );
      return { accessToken: restoreToken, user };
    } catch {
      if (actorId == null) {
        throw new BadRequestException('No se pudo restaurar la sesión del operador');
      }
      const user = await this.authService.buildSessionPayloadForUserId(actorId);
      const accessToken = await this.jwtService.signAsync(user);
      return { accessToken, user };
    }
  }

  private async resolveTargetClient(
    actor: PanelActorPayload,
    dto: StartViewAsDto,
  ): Promise<{ clientUser: User; clientLabel: string }> {
    const hasUserId = dto.clientUserId != null && dto.clientUserId > 0;
    const hasClientId = dto.clientId != null && dto.clientId > 0;
    if (!hasUserId && !hasClientId) {
      throw new BadRequestException(
        'Indica clientUserId o clientId del cliente',
      );
    }
    if (hasUserId && hasClientId) {
      throw new BadRequestException(
        'Indica solo clientUserId o clientId, no ambos',
      );
    }

    let clientRow: Client | null = null;
    let clientUserId: number;

    if (hasClientId) {
      clientRow = await this.clientRepository.findOne({
        where: { id: dto.clientId! },
        relations: ['user'],
      });
      if (!clientRow) {
        throw new NotFoundException('Cliente no encontrado');
      }
      if (!clientRow.userId) {
        throw new BadRequestException(
          'Este cliente aún no tiene acceso al portal. Invítalo antes de usar modo vista.',
        );
      }
      clientUserId = clientRow.userId;
    } else {
      clientUserId = dto.clientUserId!;
      clientRow = await this.clientRepository.findOne({
        where: { userId: clientUserId },
      });
    }

    await this.assertActorCanViewClientUser(actor, clientUserId, clientRow);

    const clientUser = await this.userRepository.findOne({
      where: { id: clientUserId },
    });
    if (!clientUser || !clientUser.status) {
      throw new NotFoundException('Usuario portal del cliente no encontrado o inactivo');
    }

    const effectiveType =
      (await this.authService.buildSessionPayload(clientUser)).type;
    if (effectiveType !== 'client') {
      throw new BadRequestException(
        'Solo se puede abrir modo vista para usuarios con rol cliente',
      );
    }

    const label =
      clientRow?.full_name?.trim() ||
      [clientUser.first_name, clientUser.last_name].filter(Boolean).join(' ').trim() ||
      clientUser.username ||
      clientUser.email;

    return { clientUser, clientLabel: label };
  }

  private async assertActorCanViewClientUser(
    actor: PanelActorPayload,
    clientUserId: number,
    clientRow: Client | null,
  ): Promise<void> {
    const actorType = actor.type;

    if (actorType === 'partner') {
      const partnerId = actor.accountOwnerId ?? actor.id;
      const row =
        clientRow ??
        (await this.clientRepository.findOne({ where: { userId: clientUserId } }));
      if (!row || row.partnerId !== partnerId) {
        throw new ForbiddenException(
          'No tienes permiso para ver el panel de este cliente',
        );
      }
      return;
    }

    if (actorType === 'admin' || actorType === 'user') {
      const row =
        clientRow ??
        (await this.clientRepository.findOne({ where: { userId: clientUserId } }));
      if (!row) {
        const user = await this.userRepository.findOne({
          where: { id: clientUserId },
        });
        if (!user) {
          throw new NotFoundException('Usuario no encontrado');
        }
        const extras = await this.authService.buildSessionPayload(user);
        if (extras.type !== 'client') {
          throw new ForbiddenException('El usuario no es un cliente del portal');
        }
      }
      return;
    }

    throw new ForbiddenException('Acceso denegado');
  }
}

export { VIEW_AS_ACCESS_MAX_AGE_MS };
