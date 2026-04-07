import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dtos/create-client.dto';
import { UpdateClientDto } from './dtos/update-client.dto';
import { Request } from '../requests/entities/request.entity';
import { User } from '../../shared/user/entities/user.entity';
import { ZohoContactService } from '../../zoho-config/zoho-contact.service';

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
      const data = pageRows.map((c) => {
        const isUserOnly = !!(c as any).isUserOnlyListItem;
        const requestClientId = isUserOnly ? null : c.id;
        const { isUserOnlyListItem: _omit, ...rest } = c as any;
        return {
          ...rest,
          requestClientId,
        };
      });

      return { data, total, page, limit };
    } catch (e) {
      console.error('Error al obtener clientes del admin:', e);
      throw new InternalServerErrorException(
        'No se pudieron obtener los clientes del admin',
      );
    }
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

      // Validar email único por partner (si tiene partner)
      if (finalPartnerId) {
        const existingClient = await this.clientRepository.findOne({
          where: {
            email: createClientDto.email,
            partnerId: finalPartnerId,
          },
        });

        if (existingClient) {
          throw new BadRequestException(
            'Ya existe un cliente con este email para este partner',
          );
        }
      }

      const client = this.clientRepository.create({
        ...createClientDto,
        partnerId: finalPartnerId,
        status: createClientDto.status !== undefined ? createClientDto.status : true,
      });

      const saved = await this.clientRepository.save(client);
      void this.zohoContactService.findOrCreateContact(saved);
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
   * Actualizar un cliente
   */
  async updateClient(
    id: number,
    updateClientDto: UpdateClientDto,
    partnerId?: number,
  ): Promise<Client> {
    try {
      const where: any = { id };
      if (partnerId) {
        where.partnerId = partnerId; // Partners solo pueden actualizar sus propios clientes
      }

      const client = await this.clientRepository.findOne({ where });

      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      // Validar email único si se está cambiando
      if (updateClientDto.email && updateClientDto.email !== client.email) {
        const existingClient = await this.clientRepository.findOne({
          where: {
            email: updateClientDto.email,
            partnerId: client.partnerId || undefined,
          },
        });

        if (existingClient && existingClient.id !== id) {
          throw new BadRequestException(
            'Ya existe un cliente con este email',
          );
        }
      }

      Object.assign(client, updateClientDto);
      return await this.clientRepository.save(client);
    } catch (e) {
      if (e instanceof NotFoundException || e instanceof BadRequestException) {
        throw e;
      }
      console.error('Error al actualizar cliente:', e);
      throw new InternalServerErrorException('No se pudo actualizar el cliente');
    }
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

}









