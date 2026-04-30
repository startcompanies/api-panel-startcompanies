import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../shared/user/entities/user.entity';
import { UserPreferences } from './entities/user-preferences.entity';
import { ClientCompanyProfile } from './entities/client-company-profile.entity';
import { UpdateUserPreferencesDto } from './dtos/update-user-preferences.dto';
import { UpdateClientCompanyProfileDto } from './dtos/update-client-company-profile.dto';
import { UploadFileService } from '../../shared/upload-file/upload-file.service';

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
    @InjectRepository(ClientCompanyProfile)
    private readonly companyProfileRepo: Repository<ClientCompanyProfile>,
    private readonly uploadFileService: UploadFileService,
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

  async getCompanyProfile(userId: number) {
    const row = await this.companyProfileRepo.findOne({ where: { userId } });
    if (!row) {
      return {
        legalName: null,
        ein: null,
        address: null,
        billingEmail: null,
        phone: null,
        bankName: null,
        accountNumber: null,
        routingAch: null,
        swift: null,
        iban: null,
        zelleOrPaypal: null,
        logoUrl: null,
      };
    }
    return {
      legalName: row.legalName,
      ein: row.ein,
      address: row.address,
      billingEmail: row.billingEmail,
      phone: row.phone,
      bankName: row.bankName,
      accountNumber: row.accountNumber,
      routingAch: row.routingAch,
      swift: row.swift,
      iban: row.iban,
      zelleOrPaypal: row.zelleOrPaypal,
      logoUrl: row.logoUrl,
    };
  }

  async updateCompanyProfile(userId: number, dto: UpdateClientCompanyProfileDto) {
    let row = await this.companyProfileRepo.findOne({ where: { userId } });
    if (!row) {
      row = this.companyProfileRepo.create({ userId });
    }
    if (dto.legalName !== undefined) row.legalName = dto.legalName ?? null;
    if (dto.ein !== undefined) row.ein = dto.ein ?? null;
    if (dto.address !== undefined) row.address = dto.address ?? null;
    if (dto.billingEmail !== undefined) row.billingEmail = dto.billingEmail ?? null;
    if (dto.phone !== undefined) row.phone = dto.phone ?? null;
    if (dto.bankName !== undefined) row.bankName = dto.bankName ?? null;
    if (dto.accountNumber !== undefined) row.accountNumber = dto.accountNumber ?? null;
    if (dto.routingAch !== undefined) row.routingAch = dto.routingAch ?? null;
    if (dto.swift !== undefined) row.swift = dto.swift ?? null;
    if (dto.iban !== undefined) row.iban = dto.iban ?? null;
    if (dto.zelleOrPaypal !== undefined) row.zelleOrPaypal = dto.zelleOrPaypal ?? null;
    if (dto.logoUrl !== undefined) row.logoUrl = dto.logoUrl ?? null;
    await this.companyProfileRepo.save(row);
    return this.getCompanyProfile(userId);
  }

  /**
   * Sube el logo a S3 bajo `panel/client-company/{userId}/logo/` y persiste la URL pública en el perfil.
   */
  async uploadCompanyLogo(userId: number, file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo vacío o no recibido');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/')) {
      throw new BadRequestException('Solo se permiten archivos de imagen');
    }
    const max = 5 * 1024 * 1024;
    if (file.size > max) {
      throw new BadRequestException('La imagen no puede superar 5 MB');
    }
    const rawName = (file.originalname || 'logo.png').split(/[/\\]/).pop() || 'logo.png';
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const safeFile = { ...file, originalname: safeName };
    const folder = `panel/client-company/${userId}/logo`;
    const uploaded = await this.uploadFileService.uploadFile(safeFile, undefined, undefined, folder);
    if (!uploaded?.url) {
      throw new BadRequestException('No se pudo obtener la URL del archivo subido');
    }
    return this.updateCompanyProfile(userId, { logoUrl: uploaded.url });
  }

  async clearCompanyLogo(userId: number) {
    const row = await this.companyProfileRepo.findOne({ where: { userId } });
    if (!row) {
      return this.getCompanyProfile(userId);
    }
    row.logoUrl = null;
    await this.companyProfileRepo.save(row);
    return this.getCompanyProfile(userId);
  }
}

