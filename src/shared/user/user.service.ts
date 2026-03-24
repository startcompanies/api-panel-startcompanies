import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Not, Repository, In } from 'typeorm';
import { UserDto } from './dtos/user.dto';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update_user.dto';
import { PaginationDto } from 'src/shared/common/dtos/pagination.dto';
import { Request } from '../../panel/requests/entities/request.entity';
import { Client } from '../../panel/clients/entities/client.entity';
import { encodePassword } from '../common/utils/bcrypt';
import { EmailService } from '../common/services/email.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Request)
    private requestRepository: Repository<Request>,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    private emailService: EmailService,
    private jwtService: JwtService,
  ) {}

  /**
   * Busca un usuario por su dirección de correo electrónico.
   * @param {string} email El correo electrónico del usuario.
   * @returns {Promise<User | null>} El objeto del usuario si se encuentra, de lo contrario null.
   */
  async findUserByEmail(email: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({ where: { email } });
    } catch (e) {
      console.error('Error al buscar el usuario por email:', e);
      throw new InternalServerErrorException(
        'Error al buscar usuario en la base de datos',
      );
    }
  }

  /**
   * Crea un nuevo usuario en la base de datos.
   * @param {CreateUserDto} userData Los datos del nuevo usuario.
   * @returns {Promise<User>} El objeto del nuevo usuario creado.
   */
  async createUser(user: UserDto): Promise<User> {
    try {
      const newUser = this.userRepository.create(user);
      return await this.userRepository.save(newUser);
    } catch (e) {
      console.error('Error al crear el usuario:', e);
      throw new InternalServerErrorException('No se pudo crear el usuario');
    }
  }

  /**
   * Genera una contraseña temporal segura
   */
  private generateTemporaryPassword(): string {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    // Asegurar al menos una mayúscula, una minúscula, un número y un carácter especial
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Mezclar los caracteres
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Crea un nuevo usuario con contraseña temporal y envía email de invitación.
   * @param {CreateUserDto} createUserDto Los datos del nuevo usuario.
   * @returns {Promise<User>} El objeto del nuevo usuario creado.
   */
  async createUserByAdmin(createUserDto: CreateUserDto): Promise<User> {
    try {
      const e164Phone = /^\+[1-9]\d{6,14}$/;
      if (createUserDto.type === 'partner') {
        const phone = (createUserDto.phone || '').trim();
        if (!phone) {
          throw new BadRequestException('El teléfono es obligatorio para partners');
        }
        if (!e164Phone.test(phone)) {
          throw new BadRequestException(
            'El teléfono debe estar en formato internacional (E.164).',
          );
        }
      }

      // Verificar si el email ya existe
      const existingUser = await this.findUserByEmail(createUserDto.email);
      if (existingUser) {
        throw new InternalServerErrorException('El email ya está en uso');
      }

      // Verificar si el username ya existe
      const existingUsername = await this.userRepository.findOne({
        where: { username: createUserDto.username },
      });
      if (existingUsername) {
        throw new InternalServerErrorException('El nombre de usuario ya está en uso');
      }

      // Generar contraseña temporal si no se proporciona o está vacía
      const tempPassword = (createUserDto.password && createUserDto.password.trim() !== '') 
        ? createUserDto.password 
        : this.generateTemporaryPassword();

      // Encriptar la contraseña
      const hashedPassword = encodePassword(tempPassword);

      // Crear el usuario
      const newUser = this.userRepository.create({
        ...createUserDto,
        password: hashedPassword,
        type: createUserDto.type || 'user',
        status: true, // Por defecto activo
      });

      const savedUser = await this.userRepository.save(newUser);
      
      // Generar token para establecer contraseña (válido por 24 horas)
      const resetToken = await this.jwtService.signAsync(
        { id: savedUser.id, email: savedUser.email, type: 'password-setup' },
        { expiresIn: '24h' },
      );

      // Enviar email de invitación
      const userName = `${savedUser.first_name || ''} ${savedUser.last_name || ''}`.trim() || savedUser.username;
      try {
        await this.emailService.sendInvitationEmail(
          savedUser.email,
          userName,
          resetToken,
          (savedUser.type as 'partner' | 'client' | 'admin') || 'user',
        );
      } catch (emailError) {
        console.error('Error al enviar email de invitación:', emailError);
        // No fallar la creación del usuario si el email falla
      }
      
      // Eliminar la contraseña del objeto de respuesta
      delete savedUser.password;
      
      return savedUser;
    } catch (e) {
      if (e instanceof InternalServerErrorException) {
        throw e;
      }
      if (e instanceof BadRequestException) {
        throw e;
      }
      console.error('Error al crear el usuario:', e);
      throw new InternalServerErrorException('No se pudo crear el usuario');
    }
  }

  /**
   * Verifica si existe al menos un usuario administrador.
   * @returns {Promise<boolean>} True si existe al menos un admin, false en caso contrario.
   */
  async hasAdminUser(): Promise<boolean> {
    try {
      const adminCount = await this.userRepository.count({
        where: { type: 'admin' },
      });
      return adminCount > 0;
    } catch (e) {
      console.error('Error al verificar usuarios administradores:', e);
      return false;
    }
  }

  /**
   * Obtiene todos los usuarios excepto el que está autenticado.
   * @param userId ID del usuario autenticado.
   * @returns Lista de usuarios (excluyendo al actual).
   */
  async findAllExceptCurrent(userId: string): Promise<User[]> {
    try {
      return await this.userRepository.find({
        where: { id: Not(Number(userId)) },
      });
    } catch (e) {
      console.error('Error al obtener los usuarios:', e);
      throw new InternalServerErrorException(
        'No se pudieron obtener los usuarios',
      );
    }
  }

  /**
   * Obtiene solo los usuarios con tipo 'admin'. Uso exclusivo del panel de administración.
   */
  async findAdmins(): Promise<User[]> {
    try {
      return await this.userRepository.find({
        where: { type: 'admin' as const },
      });
    } catch (e) {
      console.error('Error al obtener los administradores:', e);
      throw new InternalServerErrorException(
        'No se pudieron obtener los usuarios',
      );
    }
  }

  /**
   * Obtiene solo los usuarios con tipo 'user' para el listado del panel (dashboard/usuarios).
   */
  async findPanelUsers(): Promise<User[]> {
    try {
      return await this.userRepository.find({
        where: { type: 'user' as const },
      });
    } catch (e) {
      console.error('Error al obtener los usuarios del panel:', e);
      throw new InternalServerErrorException(
        'No se pudieron obtener los usuarios',
      );
    }
  }

  /**
   * Actualiza la información de un usuario por id con campos opcionales.
   * @param {number} id El id del usuario a actualizar.
   * @param {Partial<UpdateUserDto>} updateData Los datos a actualizar (campos opcionales).
   * @returns {Promise<User>} El usuario actualizado.
   */
  async updateUserById(
    id: string,
    updateData: Partial<UpdateUserDto>,
  ): Promise<User> {
    try {
      await this.userRepository.update(id, updateData);
      const updatedUser = await this.userRepository.findOne({
        where: { id: Number(id) },
      });
      if (!updatedUser) {
        throw new InternalServerErrorException('Usuario no encontrado');
      }
      return updatedUser;
    } catch (e) {
      console.error('Error al actualizar el usuario:', e);
      throw new InternalServerErrorException(
        'No se pudo actualizar el usuario',
      );
    }
  }
  /**
   * Obtiene un usuario por su id.
   * @param {string} id El id del usuario.
   * @returns {Promise<User | null>} El usuario si se encuentra, de lo contrario null.
   */
  async findUserById(id: string): Promise<User | null> {
    try {
      const numericId = Number(id);
      if (isNaN(numericId)) {
        throw new InternalServerErrorException('ID de usuario inválido');
      }
      return await this.userRepository.findOne({ where: { id: numericId } });
    } catch (e) {
      if (e instanceof InternalServerErrorException) {
        throw e;
      }
      console.error('Error al buscar el usuario por id:', e);
      throw new InternalServerErrorException('Error al buscar usuario por id');
    }
  }

  /**
   * Obtiene el usuario actual autenticado.
   * @param userId ID del usuario autenticado.
   * @returns El usuario actual.
   */
  async getCurrentUser(userId: number): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }
      return user;
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e;
      }
      console.error('Error al obtener el usuario actual:', e);
      throw new InternalServerErrorException(
        'Error al obtener el usuario actual',
      );
    }
  }

  /**
   * Obtiene todos los usuarios de tipo 'partner'.
   * @returns Lista de partners.
   */
  async getPartners(): Promise<User[]> {
    try {
      return await this.userRepository.find({
        where: { type: 'partner' },
        order: { createdAt: 'DESC' },
      });
    } catch (e) {
      console.error('Error al obtener los partners:', e);
      throw new InternalServerErrorException(
        'No se pudieron obtener los partners',
      );
    }
  }

  /**
   * Partner por ID (solo usuarios con type 'partner'). Admin y staff.
   */
  async getPartnerById(partnerId: number): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: partnerId, type: 'partner' },
      });
      if (!user) {
        throw new NotFoundException('Partner no encontrado');
      }
      return user;
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e;
      }
      console.error('Error al obtener el partner:', e);
      throw new InternalServerErrorException('No se pudo obtener el partner');
    }
  }

  /**
   * Obtiene las estadísticas de un partner (conteo de clientes y solicitudes)
   * @param partnerId ID del partner
   * @returns Objeto con totalClients y totalRequests
   */
  async getPartnerStats(partnerId: number): Promise<{
    totalClients: number;
    totalRequests: number;
  }> {
    try {
      // Contar clientes asociados al partner
      const totalClients = await this.clientRepository.count({
        where: { partnerId },
      });

      // Contar solicitudes asociadas al partner
      const totalRequests = await this.requestRepository.count({
        where: { partnerId },
      });

      return {
        totalClients,
        totalRequests,
      };
    } catch (e) {
      console.error('Error al obtener estadísticas del partner:', e);
      throw new InternalServerErrorException(
        'No se pudieron obtener las estadísticas del partner',
      );
    }
  }

  /**
   * Obtiene todos los usuarios de tipo 'client'.
   * @returns Lista de clientes.
   */
  async getClients(): Promise<User[]> {
    try {
      return await this.userRepository.find({
        where: { type: 'client' },
        order: { createdAt: 'DESC' },
      });
    } catch (e) {
      console.error('Error al obtener los clientes:', e);
      throw new InternalServerErrorException(
        'No se pudieron obtener los clientes',
      );
    }
  }

  /**
   * Obtiene los clientes asociados a un partner específico.
   * @param partnerId ID del partner.
   * @returns Lista de clientes del partner.
   */
  async getMyClients(partnerId: number): Promise<User[]> {
    try {
      // Buscar todas las solicitudes del partner para obtener sus clientes únicos
      const requests = await this.requestRepository.find({
        where: { partnerId },
        select: ['clientId'],
      });

      // Extraer IDs de clientes únicos
      const clientIds = [...new Set(requests.map((r) => r.clientId))];

      if (clientIds.length === 0) {
        return [];
      }

      // Obtener los clientes
      return await this.userRepository.find({
        where: {
          id: In(clientIds),
          type: 'client',
        },
        order: { createdAt: 'DESC' },
      });
    } catch (e) {
      console.error('Error al obtener los clientes del partner:', e);
      throw new InternalServerErrorException(
        'No se pudieron obtener los clientes del partner',
      );
    }
  }

  /**
   * Actualiza el perfil del usuario actual.
   * @param userId ID del usuario autenticado.
   * @param updateData Datos a actualizar.
   * @returns Usuario actualizado.
   */
  async updateCurrentUser(
    userId: number,
    updateData: Partial<UpdateUserDto>,
  ): Promise<User> {
    try {
      await this.userRepository.update(userId, updateData);
      const updatedUser = await this.userRepository.findOne({
        where: { id: userId },
      });
      if (!updatedUser) {
        throw new NotFoundException('Usuario no encontrado');
      }
      return updatedUser;
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e;
      }
      console.error('Error al actualizar el usuario actual:', e);
      throw new InternalServerErrorException(
        'No se pudo actualizar el usuario',
      );
    }
  }

  /**
   * Activa o desactiva un usuario (toggle status).
   * @param id ID del usuario.
   * @returns Usuario actualizado.
   */
  async toggleUserStatus(id: string): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: Number(id) },
      });
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      // Toggle del status (el campo status es boolean)
      user.status = !user.status;

      return await this.userRepository.save(user);
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e;
      }
      console.error('Error al cambiar el estado del usuario:', e);
      throw new InternalServerErrorException(
        'No se pudo cambiar el estado del usuario',
      );
    }
  }
}
