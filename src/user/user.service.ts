import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { UserDto } from './dtos/user.dto';

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
   * Obtiene todos los usuarios de la base de datos.
   * @returns {Promise<User[]>} Lista de todos los usuarios.
   */
  async findAll(): Promise<User[]> {
    try {
      return await this.userRepository.find();
    } catch (e) {
      console.error('Error al obtener todos los usuarios:', e);
      throw new InternalServerErrorException('No se pudieron obtener los usuarios');
    }
  }
}
