import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Not, Repository } from 'typeorm';
import { UserDto } from './dtos/user.dto';
import { UpdateUserDto } from './dtos/update_user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
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
   * Obtiene todos los usuarios excepto el que está autenticado.
   * @param userId ID del usuario autenticado.
   * @returns Lista de usuarios (excluyendo al actual).
   */
  async findAllExceptCurrent(userId: string): Promise<User[]> {
    try {
      return await this.userRepository.find({
        where: { id: Not(Number(userId)) }, // 🔑 excluye el id actual
      });
    } catch (e) {
      console.error('Error al obtener los usuarios:', e);
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
      return await this.userRepository.findOne({ where: { id: Number(id) } });
    } catch (e) {
      console.error('Error al buscar el usuario por id:', e);
      throw new InternalServerErrorException('Error al buscar usuario por id');
    }
  }
}
