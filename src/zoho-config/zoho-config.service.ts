import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZohoConfig } from './zoho-config.entity';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { ZohoConfigDto, UpdateZohoConfigDto } from './zoho-config.dto';

/** Respuesta al panel: sin secretos en bruto (el interceptor elimina client_id/secret/refresh_token). */
export type ZohoConfigAdminResponse = {
  id: number;
  org: string;
  service: string;
  region: string;
  scopes: string;
  createdAt: Date;
  updatedAt: Date;
  zohoOAuthClientId: string;
  zohoOAuthClientSecretConfigured: boolean;
  hasRefreshToken: boolean;
};

function toZohoConfigAdminResponse(c: ZohoConfig): ZohoConfigAdminResponse {
  return {
    id: c.id,
    org: c.org,
    service: c.service,
    region: c.region,
    scopes: c.scopes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    zohoOAuthClientId: c.client_id,
    zohoOAuthClientSecretConfigured: Boolean(c.client_secret?.trim()),
    hasRefreshToken: Boolean(c.refresh_token?.trim()),
  };
}

/** Callback OAuth Zoho: {API_PUBLIC_URL}/orgTk/callback (registrar exacto en consola Zoho). */
function zohoRedirectUriFromApiPublic(config: ConfigService): string {
  const base = (
    config.get<string>('API_PUBLIC_URL') || 'http://localhost:3000'
  ).replace(/\/+$/, '');
  return `${base}/orgTk/callback`;
}

@Injectable()
export class ZohoConfigService {
  private readonly logger = new Logger(ZohoConfigService.name);
  private readonly redirect_uri: string;

  constructor(
    @InjectRepository(ZohoConfig)
    private readonly zohoConfigRepository: Repository<ZohoConfig>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.redirect_uri = zohoRedirectUriFromApiPublic(this.configService);
  }

  /**
   * Obtiene la URL base del servicio de tokens según la región
   */
  getTokenUrl(region: string): string {
    switch (region) {
      case 'eu':
        return 'https://accounts.zoho.eu/oauth/v2';
      case 'in':
        return 'https://accounts.zoho.in/oauth/v2';
      case 'cn':
        return 'https://accounts.zoho.com.cn/oauth/v2';
      case 'au':
        return 'https://accounts.zoho.com.au/oauth/v2';
      default:
        return 'https://accounts.zoho.com/oauth/v2';
    }
  }

  /**
   * Genera la URL de autorización OAuth
   */
  private getAuthorizationUrl(
    clientId: string,
    redirectUri: string,
    scopes: string,
    region: string,
    state: number,
  ): string {
    const base = this.getTokenUrl(region);
    /** access_type=offline + prompt=consent: Zoho suele volver a emitir refresh_token al re-autorizar (p. ej. WorkDrive tras CRM). */
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      state: String(state),
      access_type: 'offline',
      prompt: 'consent',
    });
    return `${base}/auth?${q.toString()}`;
  }

  /**
   * Tras canjear el code, Zoho solo envía refresh_token la primera vez por cliente/usuario.
   * Si falta, reutilizamos el de esta fila o de otra con el mismo client_id (misma app Zoho).
   */
  private async resolveRefreshTokenAfterCodeExchange(
    tokenRecord: ZohoConfig,
    data: Record<string, unknown>,
  ): Promise<string | null> {
    const fromResponse = data['refresh_token'];
    if (typeof fromResponse === 'string' && fromResponse.trim()) {
      return fromResponse.trim();
    }
    if (tokenRecord.refresh_token?.trim()) {
      return tokenRecord.refresh_token.trim();
    }
    const siblings = await this.zohoConfigRepository.find({
      where: { client_id: tokenRecord.client_id },
      order: { id: 'ASC' },
    });
    const other = siblings.find((c) => c.id !== tokenRecord.id && c.refresh_token?.trim());
    const inherited = other?.refresh_token?.trim() ?? null;
    if (inherited && other) {
      this.logger.warn(
        `OAuth sin refresh_token en respuesta; reutilizando refresh de config id=${other.id} (mismo client_id). ` +
          `Si WorkDrive sigue fallando, autoriza scopes CRM+WorkDrive juntos o usa incremental auth de Zoho.`,
      );
    }
    return inherited;
  }

  /**
   * Inicia el flujo OAuth guardando la configuración y retornando la URL de autorización
   */
  async redirectToAuthorization(
    org: string,
    service: string,
    region: string,
    scopes: string,
    client_id: string,
    client_secret: string | undefined,
  ) {
    const incomingSecret = client_secret?.trim() ?? '';

    let tokenRecord = await this.zohoConfigRepository.findOne({
      where: { org, service },
    });

    const resolvedSecret =
      incomingSecret || tokenRecord?.client_secret?.trim() || '';

    if (!resolvedSecret) {
      throw new HttpException(
        'client_secret es obligatorio (o debe existir ya guardado en esta configuración)',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (tokenRecord) {
      tokenRecord.region = region;
      tokenRecord.scopes = scopes;
      tokenRecord.client_id = client_id;
      if (incomingSecret) {
        tokenRecord.client_secret = incomingSecret;
      }
    } else {
      if (!incomingSecret) {
        throw new HttpException(
          'client_secret es obligatorio para una configuración nueva',
          HttpStatus.BAD_REQUEST,
        );
      }
      tokenRecord = this.zohoConfigRepository.create({
        org,
        service,
        region,
        scopes,
        client_id,
        client_secret: incomingSecret,
      });
    }

    const savedRecord = await this.zohoConfigRepository.save(tokenRecord);

    // Generar URL de autorización con el ID como state
    return this.getAuthorizationUrl(
      client_id,
      this.redirect_uri,
      scopes,
      region,
      savedRecord.id,
    );
  }

  /**
   * Intercambia el código de autorización por tokens
   */
  async getAccessToken(code: string, state: number) {
    // Buscar la configuración usando el state (ID)
    const tokenRecord = await this.zohoConfigRepository.findOne({
      where: { id: state },
    });

    if (!tokenRecord) {
      throw new HttpException(
        'Registro no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    const { client_id, client_secret, region } = tokenRecord;
    const url_token = this.getTokenUrl(region);

    // Parámetros para intercambiar código por tokens
    const params = {
      client_id,
      client_secret,
      redirect_uri: this.redirect_uri,
      code,
      grant_type: 'authorization_code',
    };

    let response: { data: Record<string, unknown> };
    try {
      response = await lastValueFrom(
        this.httpService.post<{ [k: string]: unknown }>(`${url_token}/token`, null, { params }),
      );
    } catch (err: unknown) {
      const ax = err as { response?: { data?: unknown }; message?: string };
      const zohoBody = ax.response?.data;
      const detail =
        typeof zohoBody === 'object' && zohoBody !== null && 'error_description' in zohoBody
          ? String((zohoBody as { error_description?: string }).error_description)
          : typeof zohoBody === 'object' && zohoBody !== null && 'error' in zohoBody
            ? String((zohoBody as { error?: string }).error)
            : ax.message ?? 'Error de red';
      this.logger.error(`Zoho /token (authorization_code) falló: ${detail}`, zohoBody);
      throw new HttpException(
        `Error al canjear el código con Zoho: ${detail}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const data = response.data ?? {};
    if (typeof data['error'] === 'string') {
      const desc = typeof data['error_description'] === 'string' ? data['error_description'] : data['error'];
      throw new HttpException(`Zoho: ${desc}`, HttpStatus.BAD_REQUEST);
    }

    const refresh = await this.resolveRefreshTokenAfterCodeExchange(tokenRecord, data);
    if (!refresh) {
      throw new HttpException(
        'Zoho no devolvió refresh_token y no hay otro guardado con el mismo Client ID. ' +
          'Es habitual si ya autorizaste esta app antes: vuelve a pulsar Autorizar (ahora forzamos consent) o crea una sola configuración con scopes CRM y WorkDrive.',
        HttpStatus.BAD_REQUEST,
      );
    }

    tokenRecord.refresh_token = refresh;
    return await this.zohoConfigRepository.save(tokenRecord);
  }

  /**
   * Obtiene un access token válido (refresca si es necesario)
   */
  async getValidAccessToken(org: string, service: string): Promise<string> {
    const config = await this.zohoConfigRepository.findOne({
      where: { org, service },
    });

    if (!config || !config.refresh_token) {
      throw new HttpException(
        'Configuración no encontrada o sin refresh_token',
        HttpStatus.NOT_FOUND,
      );
    }

    const url_token = this.getTokenUrl(config.region);
    const params = {
      refresh_token: config.refresh_token,
      client_id: config.client_id,
      client_secret: config.client_secret,
      grant_type: 'refresh_token',
    };

    try {
      const response = await lastValueFrom(
        this.httpService.post(`${url_token}/token`, null, { params }),
      );

      return response.data.access_token;
    } catch (error) {
      throw new HttpException(
        'Error al obtener access token',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** Uso interno (tokens y secretos completos). */
  async findAllEntities(): Promise<ZohoConfig[]> {
    return this.zohoConfigRepository.find();
  }

  async findOneEntity(id: number): Promise<ZohoConfig> {
    const config = await this.zohoConfigRepository.findOne({ where: { id } });
    if (!config) {
      throw new HttpException('Configuración no encontrada', HttpStatus.NOT_FOUND);
    }
    return config;
  }

  async findByOrgAndServiceEntity(org: string, service: string): Promise<ZohoConfig> {
    const config = await this.zohoConfigRepository.findOne({
      where: { org, service },
    });
    if (!config) {
      throw new HttpException('Configuración no encontrada', HttpStatus.NOT_FOUND);
    }
    return config;
  }

  async listForAdmin(): Promise<ZohoConfigAdminResponse[]> {
    const rows = await this.findAllEntities();
    return rows.map(toZohoConfigAdminResponse);
  }

  async getOneForAdmin(id: number): Promise<ZohoConfigAdminResponse> {
    const config = await this.findOneEntity(id);
    return toZohoConfigAdminResponse(config);
  }

  async getByOrgAndServiceForAdmin(org: string, service: string): Promise<ZohoConfigAdminResponse> {
    const config = await this.findByOrgAndServiceEntity(org, service);
    return toZohoConfigAdminResponse(config);
  }

  async create(createZohoConfigDto: ZohoConfigDto): Promise<ZohoConfigAdminResponse> {
    const zohoConfig = this.zohoConfigRepository.create(createZohoConfigDto);
    const saved = await this.zohoConfigRepository.save(zohoConfig);
    return toZohoConfigAdminResponse(saved);
  }

  async update(
    id: number,
    updateZohoConfigDto: UpdateZohoConfigDto,
  ): Promise<ZohoConfigAdminResponse> {
    const existing = await this.zohoConfigRepository.findOne({ where: { id } });
    if (!existing) {
      throw new HttpException('Configuración no encontrada', HttpStatus.NOT_FOUND);
    }

    if (updateZohoConfigDto.org !== undefined) {
      existing.org = updateZohoConfigDto.org;
    }
    if (updateZohoConfigDto.service !== undefined) {
      existing.service = updateZohoConfigDto.service;
    }
    if (updateZohoConfigDto.region !== undefined) {
      existing.region = updateZohoConfigDto.region;
    }
    if (updateZohoConfigDto.scopes !== undefined) {
      existing.scopes = updateZohoConfigDto.scopes;
    }
    if (updateZohoConfigDto.client_id !== undefined && updateZohoConfigDto.client_id.trim() !== '') {
      existing.client_id = updateZohoConfigDto.client_id.trim();
    }
    const incomingSecret = updateZohoConfigDto.client_secret;
    if (incomingSecret !== undefined && incomingSecret.trim() !== '') {
      existing.client_secret = incomingSecret.trim();
    }

    const saved = await this.zohoConfigRepository.save(existing);
    return toZohoConfigAdminResponse(saved);
  }

  async remove(id: number): Promise<void> {
    const zohoConfig = await this.findOneEntity(id);
    await this.zohoConfigRepository.remove(zohoConfig);
  }

  /**
   * Obtiene la primera organización disponible para CRM
   */
  async getFirstAvailableOrgForCrm(): Promise<string | null> {
    const config = await this.zohoConfigRepository.findOne({
      where: { service: 'crm' },
    });
    return config ? config.org : null;
  }
}








