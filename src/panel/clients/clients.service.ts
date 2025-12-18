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

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Request)
    private requestRepository: Repository<Request>,
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
   * El admin solo ve sus propios clientes (sin partner asignado)
   */
  async getAdminClients(): Promise<Client[]> {
    try {
      return await this.clientRepository.find({
        where: {
          partnerId: IsNull(), // Admin solo ve clientes sin partner asignado
        },
        relations: ['user'],
        order: { createdAt: 'DESC' },
      });
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
   */
  async getClientStats(id: number, partnerId?: number): Promise<{
    totalRequests: number;
    activeRequests: number;
    completedRequests: number;
  }> {
    try {
      // TODO: Actualizar cuando Request use Client en lugar de User
      // Por ahora, buscar por userId si el cliente tiene usuario asociado
      const client = await this.clientRepository.findOne({
        where: { id },
        relations: ['user'],
      });

      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      if (partnerId && client.partnerId !== partnerId) {
        throw new NotFoundException('Cliente no encontrado');
      }

      // Si el cliente tiene usuario, buscar requests por userId
      // Si no, buscar por clientId (cuando se actualice Request)
      const where: any = client.userId 
        ? { clientId: client.userId } // Temporal: buscar por userId del cliente
        : { clientId: id }; // Futuro: buscar por clientId directamente
      if (partnerId) {
        // Verificar que el cliente pertenece al partner
        const client = await this.clientRepository.findOne({
          where: { id, partnerId },
        });
        if (!client) {
          throw new NotFoundException('Cliente no encontrado');
        }
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

