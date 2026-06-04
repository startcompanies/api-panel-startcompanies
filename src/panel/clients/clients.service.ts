import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dtos/create-client.dto';
import { UpdateClientDto } from './dtos/update-client.dto';
import { Request } from '../requests/entities/request.entity';
import { User } from '../../shared/user/entities/user.entity';
import { ZohoContactService } from '../../zoho-config/zoho-contact.service';
import { EmailService } from '../../shared/common/services/email.service';
import { PartnerTenantsService } from '../partner-tenants/partner-tenants.service';
import { EmailTenantBrandingService } from '../partner-tenants/email-tenant-branding.service';
import { EmailBranding } from '../../shared/common/types/email-branding.types';
import { BillingService } from '../billing/billing.service';
import { encodePassword } from '../../shared/common/utils/bcrypt';
import { normalizeAuthEmail } from '../../shared/common/utils/normalize-auth-email';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Request)
    private requestRepository: Repository<Request>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly zohoContactService: ZohoContactService,
    private readonly emailService: EmailService,
    private readonly partnerTenantsService: PartnerTenantsService,
    private readonly emailTenantBranding: EmailTenantBrandingService,
    private readonly billingService: BillingService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Obtener todos los clientes de un partner
   */
  async getMyClients(partnerId: number): Promise<Client[]> {
    try {
      return await this.clientRepository.find({
        where: { partnerId },
        relations: ['user'],
        order: { createdAt: 'DESC' },
      });
    } catch (e) {
      console.error('Error al obtener clientes del partner:', e);
      throw new InternalServerErrorException(
        'No se pudieron obtener los clientes',
      );
    }
  }

  /**
   * Clientes de un partner con estadísticas (admin y staff user).
   */
  async getClientsForPartnerWithStats(partnerId: number): Promise<
    Array<{
      id: number;
      full_name: string;
      email: string;
      totalRequests: number;
      activeRequests: number;
      completedRequests: number;
      createdAt: Date;
      lastRequestDate: Date | null;
    }>
  > {
    try {
      const partnerUser = await this.userRepository.findOne({
        where: { id: partnerId, type: 'partner' },
      });
      if (!partnerUser) {
        throw new NotFoundException('Partner no encontrado');
      }
      const clients = await this.clientRepository.find({
        where: { partnerId },
        relations: ['user'],
        order: { createdAt: 'DESC' },
      });
      const rows = await Promise.all(
        clients.map(async (c) => {
          const stats = await this.getClientStats(c.id).catch(() => ({
            totalRequests: 0,
            activeRequests: 0,
            completedRequests: 0,
          }));
          const lastReq = await this.requestRepository.findOne({
            where: { clientId: c.id },
            order: { createdAt: 'DESC' },
            select: ['createdAt'],
          });
          return {
            id: c.id,
            full_name: c.full_name,
            email: c.email,
            totalRequests: stats.totalRequests,
            activeRequests: stats.activeRequests,
            completedRequests: stats.completedRequests,
            createdAt: c.createdAt,
            lastRequestDate: lastReq?.createdAt ?? null,
          };
        }),
      );
      return rows;
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e;
      }
      console.error('Error al obtener clientes del partner:', e);
      throw new InternalServerErrorException(
        'No se pudieron obtener los clientes del partner',
      );
    }
  }

  /**
   * Obtener clientes del admin
   * El admin ve:
   * 1. Clientes de la tabla clients sin partner asignado
   * 2. Usuarios con type: 'client' que no tienen registro en clients
   */
  async getAdminClients(options?: {
    page?: number;
    limit?: number;
    q?: string;
    status?: 'all' | 'active' | 'inactive';
  }): Promise<{
    data: Array<Record<string, unknown> & { requestClientId: number | null }>;
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const page = Math.max(1, options?.page ?? 1);
      const limit = Math.min(100, Math.max(1, options?.limit ?? 12));

      // 1. Obtener clientes de la tabla clients sin partner
      const clientsFromTable = await this.clientRepository.find({
        where: {
          partnerId: IsNull(),
        },
        relations: ['user'],
        order: { createdAt: 'DESC' },
      });

      // 2. Obtener usuarios con type: 'client' que no tienen registro en clients
      const usersAsClients = await this.userRepository.find({
        where: {
          type: 'client',
        },
        order: { createdAt: 'DESC' },
      });

      // 3. Filtrar usuarios que ya tienen registro en clients
      const userIdsInClients = new Set(
        clientsFromTable
          .map(c => c.userId)
          .filter(id => id !== null && id !== undefined)
      );

      const usersWithoutClientRecord = usersAsClients.filter(
        user => !userIdsInClients.has(user.id)
      );

      // 4. Transformar usuarios al formato Client
      // Nota: Estos "clientes" son en realidad usuarios, por lo que algunas operaciones
      // (editar/eliminar) pueden requerir lógica especial en el frontend
      const clientsFromUsers: Client[] = usersWithoutClientRecord.map(user => {
        const client = new Client();
        // Usar el userId como ID temporal (no habrá conflictos porque son tablas diferentes)
        // El frontend puede usar userId para identificar que es un usuario
        (client as any).isUserOnlyListItem = true;
        client.id = user.id;
        client.userId = user.id;
        client.full_name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || user.email;
        client.email = user.email;
        client.phone = user.phone || undefined;
        client.company = user.company || undefined;
        client.status = user.status;
        client.partnerId = undefined; // Sin partner asignado
        client.createdAt = user.createdAt;
        client.updatedAt = user.updatedAt;
        client.user = user; // Relación con el usuario
        return client;
      });

      // 5. Combinar y ordenar
      const allClients = [...clientsFromTable, ...clientsFromUsers];

      allClients.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

      let filtered = allClients;
      const q = options?.q?.trim().toLowerCase();
      if (q) {
        filtered = filtered.filter(
          c =>
            (c.full_name || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q) ||
            (c.company || '').toLowerCase().includes(q),
        );
      }
      const statusFilter = options?.status ?? 'all';
      if (statusFilter === 'active') {
        filtered = filtered.filter(c => !!c.status);
      } else if (statusFilter === 'inactive') {
        filtered = filtered.filter(c => !c.status);
      }

      const total = filtered.length;
      const skip = (page - 1) * limit;
      const pageRows = filtered.slice(skip, skip + limit);
      const data = pageRows.map((c) => this.mapAdminClientListItem(c));

      return { data, total, page, limit };
    } catch (e) {
      console.error('Error al obtener clientes del admin:', e);
      throw new InternalServerErrorException(
        'No se pudieron obtener los clientes del admin',
      );
    }
  }

  /** Respuesta segura del listado admin (sin password ni relación user anidada). */
  private mapAdminClientListItem(
    c: Client & { isUserOnlyListItem?: boolean },
  ): Record<string, unknown> & {
    requestClientId: number | null;
    portalUserId: number | null;
    platformPlanCode: string | null;
    platformAccessEndsAt: string | null;
  } {
    const isUserOnly = !!c.isUserOnlyListItem;
    const portalUser = c.user ?? null;
    const portalUserId =
      c.userId ?? (isUserOnly ? c.id : portalUser?.id ?? null) ?? null;
    const endsAt = portalUser?.platformAccessEndsAt;
    return {
      id: c.id,
      uuid: c.uuid,
      partnerId: c.partnerId ?? null,
      userId: c.userId ?? portalUserId,
      full_name: c.full_name,
      email: c.email,
      phone: c.phone ?? null,
      company: c.company ?? null,
      address: c.address ?? null,
      status: c.status,
      notes: c.notes ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      requestClientId: isUserOnly ? null : c.id,
      portalUserId,
      platformPlanCode: portalUser?.platformPlanCode ?? null,
      platformAccessEndsAt:
        endsAt instanceof Date
          ? endsAt.toISOString()
          : endsAt
            ? new Date(endsAt as string).toISOString()
            : null,
    };
  }

  /**
   * Fila `clients` del usuario portal con rol client (para flujo nueva solicitud sin paso de asociación).
   * 1) `user_id` = usuario; 2) mismo email (normalizado) y sin partner (alineado a solicitudes directas).
   */
  async findSelfForPortalClient(userId: number, userEmail?: string | null): Promise<Client> {
    const byUser = await this.clientRepository.findOne({
      where: { userId },
      relations: ['user'],
    });
    if (byUser) {
      return byUser;
    }
    const emailNorm = (userEmail || '').trim().toLowerCase();
    if (!emailNorm) {
      throw new NotFoundException(
        'No hay perfil de cliente vinculado. Completa tu cuenta o contacta a soporte.',
      );
    }
    const row = await this.clientRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.user', 'user')
      .where('c.partner_id IS NULL')
      .andWhere('LOWER(TRIM(c.email)) = :emailNorm', { emailNorm })
      .getOne();
    if (row) {
      return row;
    }
    throw new NotFoundException(
      'No hay perfil de cliente vinculado. Completa tu cuenta o contacta a soporte.',
    );
  }

  /**
   * Obtener un cliente por ID
   */
  async getClientById(id: number, partnerId?: number): Promise<Client> {
    try {
      const where: any = { id };
      if (partnerId) {
        where.partnerId = partnerId; // Partners solo pueden ver sus propios clientes
      }

      const client = await this.clientRepository.findOne({
        where,
        relations: ['partner', 'user'],
      });

      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      return client;
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e;
      }
      console.error('Error al obtener cliente:', e);
      throw new InternalServerErrorException('Error al obtener el cliente');
    }
  }

  /**
   * Obtener un cliente por UUID
   */
  async getClientByUuid(uuid: string, partnerId?: number): Promise<Client> {
    try {
      const where: any = { uuid };
      if (partnerId) {
        where.partnerId = partnerId; // Partners solo pueden ver sus propios clientes
      }

      const client = await this.clientRepository.findOne({
        where,
        relations: ['partner', 'user'],
      });

      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      return client;
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e;
      }
      console.error('Error al obtener cliente por UUID:', e);
      throw new InternalServerErrorException('Error al obtener el cliente');
    }
  }

  /**
   * Crear un nuevo cliente
   */
  async createClient(
    createClientDto: CreateClientDto,
    partnerId?: number,
  ): Promise<Client> {
    try {
      // Si es partner, asignar automáticamente su ID
      const finalPartnerId = partnerId || createClientDto.partnerId;

      const emailNorm = normalizeAuthEmail(createClientDto.email);
      if (!emailNorm) {
        throw new BadRequestException('El email es requerido');
      }

      // Validar email único por partner (si tiene partner)
      if (finalPartnerId) {
        const existingClient = await this.findClientByEmailInScope(
          emailNorm,
          finalPartnerId,
        );

        if (existingClient) {
          throw new BadRequestException(
            'Ya existe un cliente con este email para este partner',
          );
        }
      }

      const client = this.clientRepository.create({
        ...createClientDto,
        email: emailNorm,
        partnerId: finalPartnerId,
        status: createClientDto.status !== undefined ? createClientDto.status : true,
      });

      const saved = await this.clientRepository.save(client);
      if (!saved.partnerId) {
        void this.zohoContactService.findOrCreateContact(saved);
      }
      if (createClientDto.inviteToPortal && saved.partnerId) {
        try {
          await this.inviteClientToPortal(saved.id, {
            partnerScopeId: partnerId,
          });
          const refreshed = await this.clientRepository.findOne({
            where: { id: saved.id },
          });
          return refreshed ?? saved;
        } catch (inviteError) {
          if (
            inviteError instanceof BadRequestException ||
            inviteError instanceof NotFoundException
          ) {
            throw inviteError;
          }
          console.error(
            'Cliente creado pero falló la invitación al portal:',
            inviteError,
          );
        }
      }
      return saved;
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof NotFoundException) {
        throw e;
      }
      console.error('Error al crear cliente:', e);
      throw new InternalServerErrorException('No se pudo crear el cliente');
    }
  }

  /**
   * Actualizar un cliente (y usuario portal vinculado si existe).
   */
  async updateClient(
    id: number,
    updateClientDto: UpdateClientDto,
    partnerId?: number,
  ): Promise<Client | User> {
    try {
      const { listItemUserOnly, ...patch } = updateClientDto;

      if (listItemUserOnly && !partnerId) {
        return this.updateAdminUserOnlyClient(id, patch);
      }

      const where: { id: number; partnerId?: number } = { id };
      if (partnerId) {
        where.partnerId = partnerId;
      }

      const client = await this.clientRepository.findOne({
        where,
        relations: ['user'],
      });

      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      if (patch.email !== undefined) {
        const emailNorm = normalizeAuthEmail(patch.email);
        if (!emailNorm) {
          throw new BadRequestException('El email es requerido');
        }
        const currentNorm = normalizeAuthEmail(client.email);
        if (emailNorm !== currentNorm) {
          await this.assertClientEmailAvailable(client, emailNorm, client.id);
          patch.email = emailNorm;
        } else {
          delete patch.email;
        }
      }

      if (patch.full_name !== undefined) {
        patch.full_name = patch.full_name.trim();
        if (!patch.full_name) {
          throw new BadRequestException('El nombre completo es requerido');
        }
      }

      Object.assign(client, patch);
      const savedClient = await this.clientRepository.save(client);

      if (savedClient.userId) {
        await this.syncLinkedPortalUser(savedClient, patch);
        const refreshed = await this.clientRepository.findOne({
          where: { id: savedClient.id },
          relations: ['user'],
        });
        return refreshed ?? savedClient;
      }

      return savedClient;
    } catch (e) {
      if (e instanceof NotFoundException || e instanceof BadRequestException) {
        throw e;
      }
      console.error('Error al actualizar cliente:', e);
      throw new InternalServerErrorException('No se pudo actualizar el cliente');
    }
  }

  /**
   * Listado admin: fila solo usuario portal (sin registro en clients).
   */
  private async updateAdminUserOnlyClient(
    userId: number,
    patch: Omit<UpdateClientDto, 'listItemUserOnly'>,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId, type: 'client' },
    });
    if (!user) {
      throw new NotFoundException('Usuario cliente no encontrado');
    }

    if (patch.email !== undefined) {
      const emailNorm = normalizeAuthEmail(patch.email);
      if (!emailNorm) {
        throw new BadRequestException('El email es requerido');
      }
      const currentNorm = normalizeAuthEmail(user.email);
      if (emailNorm !== currentNorm) {
        await this.assertEmailForPortalUser(user.id, emailNorm, null);
        user.email = emailNorm;
      }
    }

    if (patch.full_name !== undefined) {
      const fullName = patch.full_name.trim();
      if (!fullName) {
        throw new BadRequestException('El nombre completo es requerido');
      }
      const { first, last } = this.splitFullName(fullName);
      user.first_name = first;
      user.last_name = last;
    }

    if (patch.phone !== undefined) {
      user.phone = patch.phone?.trim() ? patch.phone.trim() : (null as unknown as string);
    }
    if (patch.company !== undefined) {
      user.company = patch.company?.trim() ? patch.company.trim() : (null as unknown as string);
    }
    if (patch.status !== undefined) {
      user.status = patch.status;
    }

    const savedUser = await this.userRepository.save(user);

    const linkedClients = await this.clientRepository.find({
      where: { userId: savedUser.id },
    });
    for (const row of linkedClients) {
      if (patch.email !== undefined) {
        row.email = savedUser.email;
      }
      if (patch.full_name !== undefined) {
        row.full_name =
          `${savedUser.first_name || ''} ${savedUser.last_name || ''}`.trim() ||
          savedUser.username ||
          savedUser.email;
      }
      if (patch.phone !== undefined) {
        row.phone = patch.phone;
      }
      if (patch.company !== undefined) {
        row.company = patch.company;
      }
      if (patch.status !== undefined) {
        row.status = patch.status;
      }
      await this.clientRepository.save(row);
    }

    delete (savedUser as { password?: string }).password;
    return savedUser;
  }

  /**
   * Misma lógica que inviteClientToPortal: unicidad por partner/tenant y rol en users.
   */
  private async assertClientEmailAvailable(
    client: Client,
    newEmailNorm: string,
    clientId: number,
  ): Promise<void> {
    const duplicateClient = await this.findClientByEmailInScope(
      newEmailNorm,
      client.partnerId ?? null,
      clientId,
    );
    if (duplicateClient) {
      throw new BadRequestException(
        client.partnerId
          ? 'Ya existe un cliente con este email para este partner'
          : 'Ya existe un cliente con este email',
      );
    }
    await this.assertEmailForPortalUser(
      client.userId ?? null,
      newEmailNorm,
      client.partnerId ?? null,
    );
  }

  private async assertEmailForPortalUser(
    currentUserId: number | null,
    newEmailNorm: string,
    partnerId: number | null,
  ): Promise<void> {
    const existingUser = await this.findUserByEmailNorm(newEmailNorm);
    if (!existingUser) {
      return;
    }
    if (currentUserId != null && existingUser.id === currentUserId) {
      return;
    }
    if (existingUser.type !== 'client') {
      throw new BadRequestException(
        'Ya existe una cuenta con este email con otro rol en el sistema',
      );
    }
    const otherClient = await this.clientRepository.findOne({
      where: { userId: existingUser.id },
    });
    if (!otherClient) {
      throw new BadRequestException('El correo ya está en uso por otra cuenta');
    }
    if (partnerId != null) {
      if (
        otherClient.partnerId != null &&
        otherClient.partnerId !== partnerId
      ) {
        throw new BadRequestException(
          'Este email ya está vinculado a un cliente de otro partner',
        );
      }
    } else if (otherClient.partnerId != null) {
      throw new BadRequestException(
        'Este email ya está vinculado a un cliente de un partner',
      );
    }
    throw new BadRequestException('El correo ya está en uso por otra cuenta');
  }

  private async findUserByEmailNorm(emailNorm: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('u')
      .where('LOWER(TRIM(u.email)) = :email', { email: emailNorm })
      .getOne();
  }

  private async findClientByEmailInScope(
    emailNorm: string,
    partnerId: number | null,
    excludeClientId?: number,
  ): Promise<Client | null> {
    const qb = this.clientRepository
      .createQueryBuilder('c')
      .where('LOWER(TRIM(c.email)) = :email', { email: emailNorm });
    if (partnerId != null) {
      qb.andWhere('c.partner_id = :partnerId', { partnerId });
    } else {
      qb.andWhere('c.partner_id IS NULL');
    }
    if (excludeClientId != null) {
      qb.andWhere('c.id != :excludeClientId', { excludeClientId });
    }
    return qb.getOne();
  }

  private async syncLinkedPortalUser(
    client: Client,
    patch: Omit<UpdateClientDto, 'listItemUserOnly'>,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: client.userId! },
    });
    if (!user) {
      return;
    }
    if (user.type !== 'client') {
      throw new BadRequestException(
        'El email ya está asociado a una cuenta que no es de cliente',
      );
    }

    if (patch.email !== undefined) {
      user.email = client.email;
    }
    if (patch.full_name !== undefined) {
      const { first, last } = this.splitFullName(client.full_name);
      user.first_name = first;
      user.last_name = last;
    }
    if (patch.phone !== undefined) {
      user.phone = patch.phone?.trim() ? patch.phone.trim() : (null as unknown as string);
    }
    if (patch.company !== undefined) {
      user.company = patch.company?.trim()
        ? patch.company.trim()
        : (null as unknown as string);
    }
    if (patch.status !== undefined) {
      user.status = patch.status;
    }

    await this.userRepository.save(user);
  }

  /**
   * Eliminar un cliente
   */
  async deleteClient(id: number, partnerId?: number): Promise<void> {
    try {
      const where: any = { id };
      if (partnerId) {
        where.partnerId = partnerId; // Partners solo pueden eliminar sus propios clientes
      }

      const client = await this.clientRepository.findOne({ where });

      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      // Verificar si tiene requests asociadas
      const requestCount = await this.requestRepository.count({
        where: { clientId: id },
      });

      if (requestCount > 0) {
        throw new BadRequestException(
          `No se puede eliminar el cliente porque tiene ${requestCount} solicitud(es) asociada(s)`,
        );
      }

      await this.clientRepository.remove(client);
    } catch (e) {
      if (e instanceof NotFoundException || e instanceof BadRequestException) {
        throw e;
      }
      console.error('Error al eliminar cliente:', e);
      throw new InternalServerErrorException('No se pudo eliminar el cliente');
    }
  }

  /**
   * Activar/Desactivar un cliente
   */
  async toggleClientStatus(
    id: number,
    partnerId?: number,
  ): Promise<Client> {
    try {
      const where: any = { id };
      if (partnerId) {
        where.partnerId = partnerId;
      }

      const client = await this.clientRepository.findOne({ where });

      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      client.status = !client.status;
      return await this.clientRepository.save(client);
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e;
      }
      console.error('Error al cambiar estado del cliente:', e);
      throw new InternalServerErrorException(
        'No se pudo cambiar el estado del cliente',
      );
    }
  }

  /**
   * Obtener estadísticas de un cliente
   * Soporta tanto clientes de la tabla clients como usuarios con type: 'client'
   */
  async getClientStats(id: number, partnerId?: number): Promise<{
    totalRequests: number;
    activeRequests: number;
    completedRequests: number;
  }> {
    try {
      // requests.client_id es FK a clients.id (no users.id)
      const client = await this.clientRepository.findOne({
        where: { id },
        relations: ['user'],
      });

      let effectiveClientId: number | null = null;

      if (client) {
        if (partnerId && client.partnerId !== partnerId) {
          throw new NotFoundException('Cliente no encontrado');
        }
        effectiveClientId = client.id;
      } else {
        const user = await this.userRepository.findOne({
          where: { id, type: 'client' },
        });

        if (!user) {
          throw new NotFoundException('Cliente no encontrado');
        }

        const linkedClient = await this.clientRepository.findOne({
          where: { userId: user.id },
        });

        if (linkedClient) {
          if (partnerId && linkedClient.partnerId !== partnerId) {
            throw new NotFoundException('Cliente no encontrado');
          }
          effectiveClientId = linkedClient.id;
        }
      }

      if (effectiveClientId == null) {
        return {
          totalRequests: 0,
          activeRequests: 0,
          completedRequests: 0,
        };
      }

      const allRequests = await this.requestRepository.find({
        where: {
          clientId: effectiveClientId,
          ...(partnerId ? { partnerId } : {}),
        },
      });

      return {
        totalRequests: allRequests.length,
        activeRequests: allRequests.filter(
          (r) => r.status === 'en-proceso' || r.status === 'pendiente',
        ).length,
        completedRequests: allRequests.filter(
          (r) => r.status === 'completada',
        ).length,
      };
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e;
      }
      console.error('Error al obtener estadísticas del cliente:', e);
      throw new InternalServerErrorException(
        'Error al obtener estadísticas del cliente',
      );
    }
  }

  /**
   * Convierte el usuario asociado al cliente (type client → partner). Solo admin.
   * `id` es clients.id salvo listItemUserOnly, entonces es users.id (listado solo usuario).
   */
  async convertClientToPartner(
    id: number,
    body?: { phone?: string; listItemUserOnly?: boolean },
  ): Promise<{ user: User; message: string }> {
    const e164Phone = /^\+[1-9]\d{6,14}$/;

    let user: User | null = null;

    if (body?.listItemUserOnly) {
      user = await this.userRepository.findOne({
        where: { id, type: 'client' },
      });
    } else {
      const clientRow = await this.clientRepository.findOne({
        where: { id },
        relations: ['user'],
      });

      if (clientRow?.userId) {
        user = await this.userRepository.findOne({
          where: { id: clientRow.userId },
        });
      } else {
        user = await this.userRepository.findOne({
          where: { id, type: 'client' },
        });
      }
    }

    if (!user || user.type !== 'client') {
      throw new NotFoundException(
        'Usuario cliente no encontrado o el tipo no es client',
      );
    }

    let phone = (body?.phone ?? user.phone ?? '').trim();
    if (!phone) {
      throw new BadRequestException(
        'El teléfono es obligatorio para partners (formato internacional E.164, ej. +34600111222)',
      );
    }
    if (!e164Phone.test(phone)) {
      throw new BadRequestException(
        'El teléfono debe estar en formato internacional (E.164).',
      );
    }

    user.type = 'partner';
    user.phone = phone;
    const saved = await this.userRepository.save(user);
    delete (saved as any).password;

    return {
      user: saved,
      message:
        'Usuario convertido a partner. Debe cerrar sesión e iniciar sesión de nuevo para aplicar el nuevo rol.',
    };
  }

  private generateTemporaryPassword(): string {
    const length = 16;
    const charset =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  private async buildUniqueUsername(email: string): Promise<string> {
    const base = email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '') || 'user';
    let username = base;
    let counter = 1;
    while (await this.userRepository.findOne({ where: { username } })) {
      username = `${base}${counter}`;
      counter++;
    }
    return username;
  }

  private splitFullName(fullName: string): { first: string; last: string } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return {
      first: parts[0] || '',
      last: parts.slice(1).join(' ') || '',
    };
  }

  /**
   * Crea o reutiliza un usuario `client`, enlaza `clients.user_id` y envía invitación.
   * Partners: solo clientes con `partner_id`. Admin SC: clientes sin partner o fila solo usuario.
   */
  async inviteClientToPortal(
    clientId: number,
    options?: {
      partnerScopeId?: number;
      tenantHost?: string;
      /** Admin en plataforma Start Companies (cliente sin partner_id). */
      platformScope?: boolean;
      listItemUserOnly?: boolean;
    },
  ): Promise<{
    userId: number;
    invited: boolean;
    resent: boolean;
    message: string;
  }> {
    if (options?.listItemUserOnly && options?.platformScope) {
      return this.invitePlatformClientByUserId(clientId, options.tenantHost);
    }

    const where: { id: number; partnerId?: number } = { id: clientId };
    if (options?.partnerScopeId) {
      where.partnerId = options.partnerScopeId;
    }

    const client = await this.clientRepository.findOne({ where });
    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }
    if (!client.partnerId && !options?.platformScope) {
      throw new BadRequestException(
        'Solo los clientes de un partner pueden recibir acceso al portal',
      );
    }
    if (!client.email?.trim()) {
      throw new BadRequestException('El cliente debe tener un email válido');
    }

    const branding = client.partnerId
      ? await this.resolvePartnerInviteBranding(client.partnerId, options?.tenantHost)
      : this.emailTenantBranding.platformBranding();

    if (client.partnerId) {
      const tenant = options?.tenantHost
        ? await this.partnerTenantsService.resolveByHost(options.tenantHost)
        : await this.partnerTenantsService.resolveByPartnerId(client.partnerId);

      if (
        tenant.kind === 'partner' &&
        tenant.partnerId != null &&
        tenant.partnerId !== client.partnerId
      ) {
        throw new BadRequestException(
          'El dominio del tenant no coincide con el partner del cliente',
        );
      }
    }

    let user: User | null = null;
    let resent = false;

    if (client.userId) {
      user = await this.userRepository.findOne({ where: { id: client.userId } });
      if (!user) {
        client.userId = undefined;
        await this.clientRepository.save(client);
      } else if (user.type !== 'client') {
        throw new BadRequestException(
          'El email ya está asociado a una cuenta que no es de cliente',
        );
      } else {
        resent = true;
      }
    }

    if (!user) {
      const existingByEmail = await this.userRepository.findOne({
        where: { email: client.email.trim() },
      });

      if (existingByEmail) {
        if (existingByEmail.type !== 'client') {
          throw new BadRequestException(
            'Ya existe una cuenta con este email con otro rol en el sistema',
          );
        }
        const otherClient = await this.clientRepository.findOne({
          where: { userId: existingByEmail.id, id: Not(clientId) },
        });
        if (
          otherClient &&
          otherClient.partnerId != null &&
          otherClient.partnerId !== client.partnerId
        ) {
          throw new BadRequestException(
            'Este email ya está vinculado a un cliente de otro partner',
          );
        }
        if (
          otherClient &&
          !client.partnerId &&
          otherClient.partnerId != null
        ) {
          throw new BadRequestException(
            'Este email ya está vinculado a un cliente de un partner',
          );
        }
        user = existingByEmail;
        client.userId = user.id;
        await this.clientRepository.save(client);
        resent = true;
      }
    }

    if (!user) {
      const { first, last } = this.splitFullName(client.full_name);
      const username = await this.buildUniqueUsername(client.email);
      const hashedPassword = encodePassword(this.generateTemporaryPassword());
      user = this.userRepository.create({
        username,
        email: client.email.trim(),
        password: hashedPassword,
        first_name: first,
        last_name: last,
        phone: client.phone || undefined,
        company: client.company || undefined,
        type: 'client',
        status: client.status !== false,
      });
      user = await this.userRepository.save(user);
      client.userId = user.id;
      await this.clientRepository.save(client);
    }

    if (client.partnerId) {
      await this.billingService.ensurePartnerClientAccess(user);
    } else {
      await this.billingService.ensureTrialWindow(user);
    }

    return this.sendClientPortalInvitationEmail(user, client.full_name, branding, resent);
  }

  /** Admin SC: reenviar invitación a usuario client sin fila en `clients`. */
  private async invitePlatformClientByUserId(
    userId: number,
    tenantHost?: string,
  ): Promise<{
    userId: number;
    invited: boolean;
    resent: boolean;
    message: string;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || user.type !== 'client') {
      throw new NotFoundException('Usuario cliente no encontrado');
    }
    if (!user.email?.trim()) {
      throw new BadRequestException('El cliente debe tener un email válido');
    }
    if (!user.status) {
      throw new BadRequestException(
        'No se puede enviar invitación a un usuario inactivo',
      );
    }

    const clientRow = await this.clientRepository.findOne({
      where: { userId: user.id, partnerId: IsNull() },
    });
    if (clientRow && !clientRow.email?.trim()) {
      clientRow.email = user.email.trim();
      await this.clientRepository.save(clientRow);
    }

    await this.billingService.ensureTrialWindow(user);

    const branding = tenantHost
      ? await this.emailTenantBranding.resolveForUser(user, tenantHost)
      : this.emailTenantBranding.platformBranding();

    const displayName =
      `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
      clientRow?.full_name ||
      user.username;

    return this.sendClientPortalInvitationEmail(user, displayName, branding, true);
  }

  private async resolvePartnerInviteBranding(
    partnerId: number,
    tenantHost?: string,
  ) {
    if (tenantHost?.trim()) {
      const tenant = await this.partnerTenantsService.resolveByHost(tenantHost);
      if (tenant.kind === 'partner' && tenant.partnerId === partnerId) {
        return this.emailTenantBranding.resolveByPartnerId(partnerId);
      }
    }
    return this.emailTenantBranding.resolveByPartnerId(partnerId);
  }

  private async sendClientPortalInvitationEmail(
    user: User,
    displayNameFallback: string | undefined,
    branding: EmailBranding,
    resent: boolean,
  ): Promise<{
    userId: number;
    invited: boolean;
    resent: boolean;
    message: string;
  }> {
    const resetToken = await this.jwtService.signAsync(
      { id: user.id, email: user.email, type: 'password-setup' },
      { expiresIn: '24h' },
    );

    const displayName =
      `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
      displayNameFallback ||
      user.username;

    try {
      await this.emailService.sendInvitationEmail(
        user.email,
        displayName,
        resetToken,
        'client',
        branding,
      );
    } catch (emailError) {
      console.error('Error al enviar invitación al portal:', emailError);
      throw new InternalServerErrorException(
        'No se pudo enviar el email de invitación. El usuario puede estar creado; inténtalo de nuevo.',
      );
    }

    return {
      userId: user.id,
      invited: !resent,
      resent,
      message: resent
        ? 'Invitación reenviada por email'
        : 'Usuario creado e invitación enviada por email',
    };
  }
}









