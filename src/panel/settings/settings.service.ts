import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../shared/user/entities/user.entity';
import { UserPreferences } from './entities/user-preferences.entity';
import { UpdateUserPreferencesDto } from './dtos/update-user-preferences.dto';

export interface UserPreferencesResponse {
  language: 'es' | 'en';
  theme: 'light' | 'dark' | 'auto';
  timezone: string;
  notifications: {
    email: boolean;
    push: boolean;
    requestUpdates: boolean;
    documentUploads: boolean;
  };
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserPreferences)
    private readonly preferencesRepo: Repository<UserPreferences>,
  ) {}

  private defaultPreferences(): UserPreferencesResponse {
    return {
      language: 'es',
      theme: 'light',
      timezone: 'America/Mexico_City',
      notifications: {
        email: true,
        push: true,
        requestUpdates: true,
        documentUploads: true,
      },
    };
  }

  async getPreferences(userId: number): Promise<UserPreferencesResponse> {
    const row = await this.preferencesRepo.findOne({ where: { userId } });
    if (!row) {
      return this.defaultPreferences();
    }
    return {
      language: row.language,
      theme: row.theme,
      timezone: row.timezone,
      notifications: row.notifications ?? this.defaultPreferences().notifications,
    };
  }

  async updatePreferences(
    userId: number,
    dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponse> {
    let row = await this.preferencesRepo.findOne({ where: { userId } });
    if (!row) {
      row = this.preferencesRepo.create({
        userId,
        language: dto.language ?? 'es',
        theme: dto.theme ?? 'light',
        timezone: dto.timezone ?? 'America/Mexico_City',
        notifications: dto.notifications ?? this.defaultPreferences().notifications,
      });
      await this.preferencesRepo.save(row);
    } else {
      if (dto.language !== undefined) row.language = dto.language;
      if (dto.theme !== undefined) row.theme = dto.theme;
      if (dto.timezone !== undefined) row.timezone = dto.timezone;
      if (dto.notifications !== undefined) {
        const def = this.defaultPreferences().notifications;
        const current = row.notifications ?? def;
        row.notifications = {
          email: dto.notifications.email ?? current.email ?? def.email,
          push: dto.notifications.push ?? current.push ?? def.push,
          requestUpdates: dto.notifications.requestUpdates ?? current.requestUpdates ?? def.requestUpdates,
          documentUploads: dto.notifications.documentUploads ?? current.documentUploads ?? def.documentUploads,
        };
      }
      await this.preferencesRepo.save(row);
    }
    return this.getPreferences(userId);
  }
}

