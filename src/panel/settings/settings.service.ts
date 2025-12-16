import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferences } from './entities/user-preferences.entity';
import { ProcessConfig } from './entities/process-config.entity';
import { User } from '../../shared/user/entities/user.entity';
import { UpdateUserPreferencesDto } from './dtos/update-user-preferences.dto';
import { UpdateProcessConfigDto } from './dtos/update-process-config.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserPreferences)
    private readonly preferencesRepo: Repository<UserPreferences>,
    @InjectRepository(ProcessConfig)
    private readonly processConfigRepo: Repository<ProcessConfig>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getUserPreferences(userId: number) {
    // Verificar que el usuario existe
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    let preferences = await this.preferencesRepo.findOne({
      where: { userId },
    });

    // Si no existen preferencias, crear unas por defecto
    if (!preferences) {
      preferences = this.preferencesRepo.create({
        userId,
        language: 'es',
        theme: 'light',
        timezone: 'America/Mexico_City',
        notifications: {
          email: true,
          push: true,
          requestUpdates: true,
          documentUploads: true,
        },
      });
      preferences = await this.preferencesRepo.save(preferences);
    }

    return preferences;
  }

  async updateUserPreferences(
    userId: number,
    updateDto: UpdateUserPreferencesDto,
  ) {
    // Verificar que el usuario existe
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    let preferences = await this.preferencesRepo.findOne({
      where: { userId },
    });

    if (!preferences) {
      // Crear preferencias si no existen
      preferences = this.preferencesRepo.create({
        userId,
        language: 'es',
        theme: 'light',
        timezone: 'America/Mexico_City',
        notifications: {
          email: true,
          push: true,
          requestUpdates: true,
          documentUploads: true,
        },
      });
    }

    // Actualizar campos
    if (updateDto.language !== undefined) {
      preferences.language = updateDto.language;
    }
    if (updateDto.theme !== undefined) {
      preferences.theme = updateDto.theme;
    }
    if (updateDto.timezone !== undefined) {
      preferences.timezone = updateDto.timezone;
    }
    if (updateDto.notifications !== undefined) {
      preferences.notifications = {
        ...preferences.notifications,
        ...updateDto.notifications,
      };
    }

    return this.preferencesRepo.save(preferences);
  }

  async getProcessConfig() {
    // Solo debe haber una configuración global
    let config = await this.processConfigRepo.findOne({
      order: { id: 'ASC' },
    });

    // Si no existe, crear una por defecto
    if (!config) {
      config = this.processConfigRepo.create({
        autoAdvanceSteps: false,
        requireApproval: true,
        defaultAssignee: undefined,
        notificationDelay: 24,
      });
      config = await this.processConfigRepo.save(config);
    }

    return config;
  }

  async updateProcessConfig(updateDto: UpdateProcessConfigDto) {
    // Solo debe haber una configuración global
    let config = await this.processConfigRepo.findOne({
      order: { id: 'ASC' },
    });

    if (!config) {
      // Crear configuración si no existe
      config = this.processConfigRepo.create({
        autoAdvanceSteps: false,
        requireApproval: true,
        defaultAssignee: undefined,
        notificationDelay: 24,
      });
    }

    // Actualizar campos
    if (updateDto.autoAdvanceSteps !== undefined) {
      config.autoAdvanceSteps = updateDto.autoAdvanceSteps;
    }
    if (updateDto.requireApproval !== undefined) {
      config.requireApproval = updateDto.requireApproval;
    }
    if (updateDto.defaultAssignee !== undefined) {
      config.defaultAssignee = updateDto.defaultAssignee;
    }
    if (updateDto.notificationDelay !== undefined) {
      config.notificationDelay = updateDto.notificationDelay;
    }

    return this.processConfigRepo.save(config);
  }
}

