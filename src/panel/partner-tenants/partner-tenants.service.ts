import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  PartnerTenant,
  PartnerTenantSurface,
} from './entities/partner-tenant.entity';
import { PublicTenantDto } from './dtos/public-tenant.dto';
import { PartnerTenantPanelDto } from './dtos/partner-tenant-panel.dto';
import { UpdatePartnerTenantDto } from './dtos/update-partner-tenant.dto';
import { UploadFileService } from '../../shared/upload-file/upload-file.service';
import { User } from '../../shared/user/entities/user.entity';
import {
  DEFAULT_BRAND_PALETTE,
  DEFAULT_SHELL_APPEARANCE,
} from './constants/brand-palette.constants';
import {
  assertCustomPaletteColors,
  normalizeBrandPalette,
  normalizeShellAppearance,
  resolveTenantThemeTokens,
  resolvedPublicColors,
} from './tenant-theme.util';
import { renderTenantSharePreviewHtml } from './tenant-share-preview.util';

const DEFAULT_PLATFORM_BRAND = {
  slug: 'startcompanies',
  displayName: 'Start Companies',
  logoUrl: 'https://media.startcompanies.us/logo.png',
  logoDarkUrl: 'https://media.startcompanies.us/logo-dark.png',
  primaryColor: '#0068BD',
  secondaryColor: '#006AFE',
} as const;

const WHATSAPP_NUMBER_PATTERN = /^\+?[0-9]{7,15}$/;

@Injectable()
export class PartnerTenantsService {
  private readonly logger = new Logger(PartnerTenantsService.name);

  constructor(
    @InjectRepository(PartnerTenant)
    private readonly tenantRepo: Repository<PartnerTenant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
    private readonly uploadFileService: UploadFileService,
  ) {}

  /** Normaliza host: sin puerto, minúsculas, sin trailing dot. */
  normalizeHost(raw: string | undefined | null): string | null {
    if (!raw || typeof raw !== 'string') {
      return null;
    }
    let host = raw.trim().toLowerCase();
    if (!host) {
      return null;
    }
    if (host.includes('://')) {
      try {
        host = new URL(host).hostname.toLowerCase();
      } catch {
        return null;
      }
    } else {
      host = host.split('/')[0].split(':')[0];
    }
    return host.replace(/\.$/, '') || null;
  }

  isPlatformHost(host: string): boolean {
    const normalized = this.normalizeHost(host);
    return normalized ? this.platformHosts().has(normalized) : false;
  }

  private platformHosts(): Set<string> {
    const fromEnv = this.configService.get<string>('PLATFORM_HOSTS');
    const hosts = new Set<string>([
      'startcompanies.io',
      'staging.startcompanies.io',
      'www.startcompanies.io',
      'localhost',
      '127.0.0.1',
    ]);
    if (fromEnv) {
      for (const h of fromEnv.split(',')) {
        const n = this.normalizeHost(h);
        if (n) {
          hosts.add(n);
        }
      }
    }
    return hosts;
  }

  private defaultPlatformTenant(host: string): PublicTenantDto {
    const base =
      this.configService.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'https://startcompanies.io';
    return {
      slug: DEFAULT_PLATFORM_BRAND.slug,
      kind: 'platform',
      partnerId: null,
      displayName: DEFAULT_PLATFORM_BRAND.displayName,
      customDomain: host,
      frontendBaseUrl: base,
      logoUrl: DEFAULT_PLATFORM_BRAND.logoUrl,
      logoDarkUrl: DEFAULT_PLATFORM_BRAND.logoDarkUrl,
      faviconUrl: null,
      primaryColor: DEFAULT_PLATFORM_BRAND.primaryColor,
      secondaryColor: DEFAULT_PLATFORM_BRAND.secondaryColor,
      accentColor: '#01C9E2',
      brandPalette: DEFAULT_BRAND_PALETTE,
      shellAppearance: DEFAULT_SHELL_APPEARANCE,
      seoTitle: null,
      seoDescription: null,
      themeTokens: resolveTenantThemeTokens({
        brandPalette: DEFAULT_BRAND_PALETTE,
        shellAppearance: DEFAULT_SHELL_APPEARANCE,
        primaryColor: DEFAULT_PLATFORM_BRAND.primaryColor,
        secondaryColor: DEFAULT_PLATFORM_BRAND.secondaryColor,
        accentColor: '#01C9E2',
      }),
      enabledSurfaces: ['panel', 'wizard'],
      whatsappNumber: null,
      websiteUrl: null,
    };
  }

  private themeInputFromRow(row: PartnerTenant) {
    return {
      brandPalette: row.brandPalette,
      shellAppearance: row.shellAppearance,
      primaryColor: row.primaryColor,
      secondaryColor: row.secondaryColor,
      accentColor: row.accentColor,
    };
  }

  private enrichPublicDto(
    base: Omit<
      PublicTenantDto,
      'brandPalette' | 'shellAppearance' | 'accentColor' | 'themeTokens' | 'primaryColor' | 'secondaryColor'
    > & {
      primaryColor: string | null;
      secondaryColor: string | null;
      accentColor?: string | null;
      brandPalette?: string | null;
      shellAppearance?: string | null;
    },
  ): PublicTenantDto {
    const brandPalette = normalizeBrandPalette(
      base.brandPalette ?? DEFAULT_BRAND_PALETTE,
    );
    const shellAppearance = normalizeShellAppearance(
      base.shellAppearance ?? DEFAULT_SHELL_APPEARANCE,
    );
    const resolved = resolvedPublicColors({
      brandPalette,
      shellAppearance,
      primaryColor: base.primaryColor,
      secondaryColor: base.secondaryColor,
      accentColor: base.accentColor,
    });
    return {
      ...base,
      brandPalette,
      shellAppearance,
      primaryColor: resolved.primaryColor,
      secondaryColor: resolved.secondaryColor,
      accentColor: resolved.accentColor,
      themeTokens: resolveTenantThemeTokens({
        brandPalette,
        shellAppearance,
        primaryColor: base.primaryColor,
        secondaryColor: base.secondaryColor,
        accentColor: base.accentColor,
      }),
      enabledSurfaces: base.enabledSurfaces,
    };
  }

  private toPanelDto(row: PartnerTenant): PartnerTenantPanelDto {
    return {
      ...this.toPublicDto(row),
      id: row.id,
      isActive: row.isActive,
      updatedAt: row.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  /** Portal partner: solo panel; sin wizard ni formularios públicos fuera de /panel. */
  private partnerEnabledSurfaces(): PartnerTenantSurface[] {
    return ['panel'];
  }

  private normalizeWhatsappNumber(raw?: string | null): string | null {
    if (raw == null || raw === '') {
      return null;
    }
    const trimmed = raw.trim().replace(/\s/g, '');
    if (!WHATSAPP_NUMBER_PATTERN.test(trimmed)) {
      throw new BadRequestException(
        'WhatsApp: solo dígitos y + opcional al inicio (7-15 dígitos)',
      );
    }
    return trimmed;
  }

  private applyContactFields(
    row: PartnerTenant,
    dto: UpdatePartnerTenantDto,
  ): void {
    if (dto.whatsappNumber !== undefined) {
      row.whatsappNumber = this.normalizeWhatsappNumber(dto.whatsappNumber);
    }
    if (dto.websiteUrl !== undefined) {
      row.websiteUrl = dto.websiteUrl?.trim() || null;
    }
  }

  private assertPartnerWhatsappRequired(
    row: PartnerTenant,
    allowAdminFields?: boolean,
  ): void {
    if (allowAdminFields) {
      return;
    }
    if (row.isActive && !row.whatsappNumber?.trim()) {
      throw new BadRequestException(
        'Indica un número de WhatsApp de soporte para tu portal',
      );
    }
  }

  private warnIfActiveWithoutWhatsapp(row: PartnerTenant): void {
    if (row.isActive && !row.whatsappNumber?.trim()) {
      this.logger.warn(
        `Partner tenant partnerId=${row.partnerId} slug=${row.slug} está activo sin whatsapp_number`,
      );
    }
  }

  private toPublicDto(row: PartnerTenant): PublicTenantDto {
    return this.enrichPublicDto({
      slug: row.slug,
      kind: 'partner',
      partnerId: row.partnerId,
      displayName: row.displayName,
      customDomain: row.customDomain,
      frontendBaseUrl: row.frontendBaseUrl.replace(/\/$/, ''),
      logoUrl: row.logoUrl,
      logoDarkUrl: row.logoDarkUrl,
      faviconUrl: row.faviconUrl,
      primaryColor: row.primaryColor,
      secondaryColor: row.secondaryColor,
      accentColor: row.accentColor,
      brandPalette: row.brandPalette,
      shellAppearance: row.shellAppearance,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      enabledSurfaces: this.partnerEnabledSurfaces(),
      whatsappNumber: row.whatsappNumber,
      websiteUrl: row.websiteUrl,
    });
  }

  /** Marca y URL del panel para un partner (tenant activo o plataforma por defecto). */
  async resolveByPartnerId(partnerId: number): Promise<PublicTenantDto> {
    const row = await this.tenantRepo.findOne({
      where: { partnerId, isActive: true },
    });
    if (row) {
      return this.toPublicDto(row);
    }
    return this.defaultPlatformTenant('platform');
  }

  async resolveByHost(hostInput: string): Promise<PublicTenantDto> {
    const host = this.normalizeHost(hostInput);
    if (!host) {
      throw new NotFoundException('Host no válido');
    }

    if (this.platformHosts().has(host)) {
      return this.defaultPlatformTenant(host);
    }

    const row = await this.tenantRepo
      .createQueryBuilder('t')
      .where('t.is_active = TRUE')
      .andWhere('LOWER(t.custom_domain) = :host', { host })
      .getOne();

    if (!row) {
      throw new NotFoundException(`No hay tenant configurado para el dominio ${host}`);
    }

    return this.toPublicDto(row);
  }

  /**
   * HTML con meta Open Graph / Twitter para crawlers (WhatsApp, Facebook, etc.).
   * Si el dominio no está registrado, usa marca plataforma para no devolver 404 al bot.
   */
  async resolveSharePreviewHtml(hostInput: string): Promise<string> {
    let tenant: PublicTenantDto;
    try {
      tenant = await this.resolveByHost(hostInput);
    } catch (err) {
      if (err instanceof NotFoundException) {
        const host = this.normalizeHost(hostInput) || 'localhost';
        tenant = this.defaultPlatformTenant(host);
      } else {
        throw err;
      }
    }
    return renderTenantSharePreviewHtml(tenant);
  }

  /** Para CORS: URLs base de tenants activos (sin protocolo duplicado). */
  async listActiveFrontendOrigins(): Promise<string[]> {
    const rows = await this.tenantRepo.find({
      where: { isActive: true },
      select: ['frontendBaseUrl'],
    });
    const origins = new Set<string>();
    for (const row of rows) {
      const url = row.frontendBaseUrl?.trim();
      if (url) {
        origins.add(url.replace(/\/$/, ''));
      }
    }
    const platform = this.configService.get<string>('FRONTEND_URL');
    if (platform) {
      origins.add(platform.replace(/\/$/, ''));
    }
    return [...origins];
  }

  async getPanelByPartnerId(partnerId: number): Promise<PartnerTenantPanelDto | null> {
    const row = await this.tenantRepo.findOne({ where: { partnerId } });
    return row ? this.toPanelDto(row) : null;
  }

  private slugifyBase(input: string): string {
    const base = input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
    return base.length >= 2 ? base : 'partner';
  }

  private async ensureUniqueSlug(
    desired: string,
    excludePartnerId?: number,
  ): Promise<string> {
    let slug = desired;
    let n = 0;
    while (true) {
      const existing = await this.tenantRepo.findOne({ where: { slug } });
      if (!existing || existing.partnerId === excludePartnerId) {
        return slug;
      }
      n += 1;
      slug = `${desired}-${n}`;
      if (slug.length > 60) {
        slug = `${desired.slice(0, 50)}-${n}`;
      }
    }
  }

  private assertDomainAllowed(host: string): void {
    if (this.isPlatformHost(host)) {
      throw new BadRequestException(
        'El dominio no puede ser el de la plataforma Start Companies',
      );
    }
  }

  private async assertDomainFree(
    host: string,
    excludePartnerId?: number,
  ): Promise<void> {
    const other = await this.tenantRepo
      .createQueryBuilder('t')
      .where('LOWER(t.custom_domain) = :host', { host })
      .andWhere(excludePartnerId != null ? 't.partner_id != :pid' : '1=1', {
        pid: excludePartnerId,
      })
      .getOne();
    if (other) {
      throw new BadRequestException('Ese dominio ya está en uso por otro partner');
    }
  }

  /** URL base del portal a partir del host (http en local, https en producción). */
  deriveFrontendBaseUrl(host: string): string {
    const protocol =
      host === 'localhost' || host.startsWith('127.') ? 'http' : 'https';
    return `${protocol}://${host}`;
  }

  private normalizeFrontendUrl(url: string, host: string): string {
    const trimmed = url.trim().replace(/\/$/, '');
    try {
      const parsed = new URL(trimmed);
      const normalizedHost = this.normalizeHost(parsed.hostname);
      if (normalizedHost && normalizedHost !== host) {
        throw new BadRequestException(
          'La URL del portal debe usar el mismo dominio configurado',
        );
      }
      return trimmed;
    } catch (e) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      throw new BadRequestException('URL del portal inválida');
    }
  }

  async upsertForPartner(
    partnerId: number,
    dto: UpdatePartnerTenantDto,
    options?: { allowAdminFields?: boolean },
  ): Promise<PartnerTenantPanelDto> {
    const partner = await this.userRepo.findOne({ where: { id: partnerId } });
    if (!partner || partner.type !== 'partner') {
      throw new NotFoundException('Partner no encontrado');
    }

    let row = await this.tenantRepo.findOne({ where: { partnerId } });

    if (!row) {
      const displayName =
        dto.displayName?.trim() ||
        partner.company?.trim() ||
        `${partner.first_name || ''} ${partner.last_name || ''}`.trim() ||
        partner.username;
      const host =
        this.normalizeHost(dto.customDomain) ||
        (dto.frontendBaseUrl?.trim()
          ? this.normalizeHost(dto.frontendBaseUrl)
          : null);
      if (!displayName || !host) {
        throw new BadRequestException(
          'Para activar tu marca, indica nombre de la marca y dominio del portal',
        );
      }
      this.assertDomainAllowed(host);
      await this.assertDomainFree(host);
      const frontendBaseUrl = dto.frontendBaseUrl?.trim()
        ? this.normalizeFrontendUrl(dto.frontendBaseUrl.trim(), host)
        : this.deriveFrontendBaseUrl(host);
      const slugBase = dto.slug?.trim() || this.slugifyBase(displayName);
      const slug = await this.ensureUniqueSlug(slugBase);
      const brandPalette = normalizeBrandPalette(
        dto.brandPalette ?? DEFAULT_BRAND_PALETTE,
      );
      try {
        assertCustomPaletteColors(brandPalette, dto.primaryColor);
      } catch {
        throw new BadRequestException(
          'Indica un color primario válido (#RRGGBB) para la paleta personalizada',
        );
      }
      const shellAppearance = normalizeShellAppearance(dto.shellAppearance);
      const colors = resolvedPublicColors({
        brandPalette,
        shellAppearance,
        primaryColor: dto.primaryColor,
        secondaryColor: dto.secondaryColor,
        accentColor: dto.accentColor,
      });
      row = this.tenantRepo.create({
        partnerId,
        slug,
        displayName,
        customDomain: host,
        frontendBaseUrl,
        logoUrl: dto.logoUrl ?? null,
        logoDarkUrl: dto.logoDarkUrl ?? null,
        faviconUrl: dto.faviconUrl ?? null,
        brandPalette,
        shellAppearance,
        primaryColor: colors.primaryColor,
        secondaryColor: colors.secondaryColor,
        accentColor: colors.accentColor,
        seoTitle: dto.seoTitle?.trim() || null,
        seoDescription: dto.seoDescription?.trim() || null,
        enabledSurfaces: this.partnerEnabledSurfaces(),
        isActive: options?.allowAdminFields ? dto.isActive ?? true : true,
        whatsappNumber: null,
        websiteUrl: null,
      });
      this.applyContactFields(row, dto);
      this.assertPartnerWhatsappRequired(row, options?.allowAdminFields);
      const saved = await this.tenantRepo.save(row);
      this.warnIfActiveWithoutWhatsapp(saved);
      return this.toPanelDto(saved);
    }

    if (dto.displayName != null) {
      row.displayName = dto.displayName.trim();
    }
    if (dto.slug != null) {
      row.slug = await this.ensureUniqueSlug(dto.slug.trim(), partnerId);
    }
    if (dto.customDomain != null) {
      const host = this.normalizeHost(dto.customDomain);
      if (!host) {
        throw new BadRequestException('Dominio inválido');
      }
      this.assertDomainAllowed(host);
      await this.assertDomainFree(host, partnerId);
      row.customDomain = host;
      row.frontendBaseUrl = this.deriveFrontendBaseUrl(host);
    } else if (dto.frontendBaseUrl != null) {
      const host = this.normalizeHost(row.customDomain) || row.customDomain;
      row.frontendBaseUrl = this.normalizeFrontendUrl(dto.frontendBaseUrl, host);
    }
    if (dto.logoUrl !== undefined && dto.logoUrl !== null) {
      row.logoUrl = dto.logoUrl;
    }
    if (dto.logoDarkUrl !== undefined && dto.logoDarkUrl !== null) {
      row.logoDarkUrl = dto.logoDarkUrl;
    }
    if (dto.faviconUrl !== undefined && dto.faviconUrl !== null) {
      row.faviconUrl = dto.faviconUrl;
    }
    if (dto.brandPalette !== undefined) {
      row.brandPalette = normalizeBrandPalette(dto.brandPalette);
    }
    if (dto.shellAppearance !== undefined) {
      row.shellAppearance = normalizeShellAppearance(dto.shellAppearance);
    }
    if (dto.primaryColor !== undefined) {
      row.primaryColor = dto.primaryColor;
    }
    if (dto.secondaryColor !== undefined) {
      row.secondaryColor = dto.secondaryColor;
    }
    if (dto.accentColor !== undefined) {
      row.accentColor = dto.accentColor;
    }
    if (dto.seoTitle !== undefined) {
      row.seoTitle = dto.seoTitle?.trim() || null;
    }
    if (dto.seoDescription !== undefined) {
      row.seoDescription = dto.seoDescription?.trim() || null;
    }

    const paletteAfter = normalizeBrandPalette(row.brandPalette);
    try {
      assertCustomPaletteColors(paletteAfter, row.primaryColor);
    } catch {
      throw new BadRequestException(
        'Indica un color primario válido (#RRGGBB) para la paleta personalizada',
      );
    }
    const resolvedColors = resolvedPublicColors(this.themeInputFromRow(row));
    row.primaryColor = resolvedColors.primaryColor;
    row.secondaryColor = resolvedColors.secondaryColor;
    row.accentColor = resolvedColors.accentColor;

    row.enabledSurfaces = this.partnerEnabledSurfaces();
    if (options?.allowAdminFields && dto.isActive !== undefined) {
      row.isActive = dto.isActive;
    }

    this.applyContactFields(row, dto);
    this.assertPartnerWhatsappRequired(row, options?.allowAdminFields);

    const saved = await this.tenantRepo.save(row);
    this.warnIfActiveWithoutWhatsapp(saved);
    return this.toPanelDto(saved);
  }

  async uploadBrandAsset(
    partnerId: number,
    kind: 'logo' | 'logo-dark' | 'favicon',
    file: Express.Multer.File,
  ): Promise<PartnerTenantPanelDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo vacío o no recibido');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/')) {
      throw new BadRequestException('Solo se permiten archivos de imagen');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('La imagen no puede superar 5 MB');
    }

    let row = await this.tenantRepo.findOne({ where: { partnerId } });
    if (!row) {
      throw new BadRequestException(
        'Guarda primero la configuración de marca antes de subir imágenes',
      );
    }

    const rawName = (file.originalname || 'asset.png').split(/[/\\]/).pop() || 'asset.png';
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const safeFile = { ...file, originalname: safeName };
    const folder = `panel/partner-brand/${partnerId}/${kind}`;
    const uploaded = await this.uploadFileService.uploadFile(
      safeFile,
      undefined,
      undefined,
      folder,
    );
    if (!uploaded?.url) {
      throw new BadRequestException('No se pudo obtener la URL del archivo subido');
    }

    if (kind === 'logo') {
      row.logoUrl = uploaded.url;
    } else if (kind === 'logo-dark') {
      row.logoDarkUrl = uploaded.url;
    } else {
      row.faviconUrl = uploaded.url;
    }
    const saved = await this.tenantRepo.save(row);
    return this.toPanelDto(saved);
  }
}
