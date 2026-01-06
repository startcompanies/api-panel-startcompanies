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

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Request)
    private requestRepository: Repository<Request>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
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
   * Obtener clientes del admin
   * El admin ve:
   * 1. Clientes de la tabla clients sin partner asignado
   * 2. Usuarios con type: 'client' que no tienen registro en clients
   */
  async getAdminClients(): Promise<Client[]> {
    try {
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

      // 5. Combinar y devolver
      const allClients = [...clientsFromTable, ...clientsFromUsers];
      
      // Ordenar por fecha de creación descendente
      allClients.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

      return allClients;
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

      return await this.clientRepository.save(client);
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
      // 1. Primero intentar buscar en la tabla clients
      let client = await this.clientRepository.findOne({
        where: { id },
        relations: ['user'],
      });

      let userIdForRequests: number | undefined;

      if (client) {
        // Cliente encontrado en la tabla clients
        if (partnerId && client.partnerId !== partnerId) {
          throw new NotFoundException('Cliente no encontrado');
        }
        userIdForRequests = client.userId || id;
      } else {
        // 2. Si no se encuentra, buscar en la tabla users (puede ser un usuario con type: 'client')
        const user = await this.userRepository.findOne({
          where: { id, type: 'client' },
        });

        if (!user) {
          throw new NotFoundException('Cliente no encontrado');
        }

        // Si es un usuario, usar su ID directamente
        userIdForRequests = user.id;
      }

      // 3. Buscar requests por clientId (que en Request.entity es el ID del usuario)
      const where: any = { clientId: userIdForRequests };
      
      if (partnerId) {
        // Si hay partnerId, también filtrar por partnerId en las requests
        where.partnerId = partnerId;
      }

      const allRequests = await this.requestRepository.find({ where });

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

}








