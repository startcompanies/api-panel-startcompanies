import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { encodePassword } from '../common/utils/bcrypt';

@Injectable()
export class UserSeedService implements OnModuleInit {
  private readonly logger = new Logger(UserSeedService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    await this.seedAdminUser();
  }

  /**
   * Crea un usuario administrador por defecto si no existe ninguno.
   */
  private async seedAdminUser(): Promise<void> {
    try {
      // Verificar si ya existe un usuario administrador
      const adminExists = await this.userRepository.findOne({
        where: { type: 'admin' },
      });

      if (adminExists) {
        this.logger.log('Usuario administrador ya existe, omitiendo seed');
        return;
      }

      // Crear usuario administrador por defecto
      const defaultAdmin = this.userRepository.create({
        username: 'admin',
        email: 'admin@startcompanies.us',
        password: encodePassword('Admin123!'), // Contraseña por defecto - DEBE CAMBIARSE
        first_name: 'Administrador',
        last_name: 'Sistema',
        type: 'admin',
        status: true,
      });

      await this.userRepository.save(defaultAdmin);

      this.logger.warn('═══════════════════════════════════════════════════════════');
      this.logger.warn('⚠️  USUARIO ADMINISTRADOR POR DEFECTO CREADO');
      this.logger.warn('═══════════════════════════════════════════════════════════');
      this.logger.warn(`Email: admin@startcompanies.us`);
      this.logger.warn(`Password: Admin123!`);
      this.logger.warn('⚠️  IMPORTANTE: Cambiar la contraseña después del primer inicio de sesión');
      this.logger.warn('═══════════════════════════════════════════════════════════');
    } catch (error) {
      this.logger.error('Error al crear usuario administrador por defecto:', error);
    }
  }
}






