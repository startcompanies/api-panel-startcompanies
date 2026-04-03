import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { ZohoConfigService } from './zoho-config.service';
import { ZohoConfig } from './zoho-config.entity';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

interface WorkDrivePermissionResponse {
  data: {
    id: string;
    type: string;
    attributes: {
      permalink: string;
      resource_id: string;
      shared_type: string;
      role_id: number;
      [key: string]: any;
    };
  };
}

/** Respuesta POST /links (enlace externo); alternativa al permalink de publish. */
interface WorkDriveLinksResponse {
  data: {
    attributes: {
      link: string;
      [key: string]: any;
    };
  };
}

function workDriveJsonApiHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
  };
}

function zohoApiErrorsMessage(data: unknown): string | undefined {
  const err = data as { errors?: Array<{ id?: string; title?: string }> };
  if (!err?.errors?.length) {
    return undefined;
  }
  return err.errors.map((e) => (e.id && e.title ? `${e.id}: ${e.title}` : e.title || e.id)).join('; ');
}

@Injectable()
export class ZohoWorkDriveService {
  private readonly logger = new Logger(ZohoWorkDriveService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly zohoConfigService: ZohoConfigService,
  ) {}

  /**
   * Obtiene la URL base del servicio WorkDrive de Zoho según la región
   */
  private getWorkDriveBaseUrl(region: string): string {
    const regionMap: Record<string, string> = {
      eu: 'eu',
      in: 'in',
      cn: 'com.cn',
      au: 'com.au',
    };
    const domain = regionMap[region] || 'com';
    return `https://www.zohoapis.${domain}/workdrive/api/v1`;
  }

  /**
   * Obtiene o refresca el token de acceso de Zoho WorkDrive
   * Implementa caché en memoria para evitar refrescar tokens innecesariamente
   */
  private async getToken(
    configId: number,
    refresh_token: string,
    client_id: string,
    client_secret: string,
    region: string,
  ): Promise<string> {
    const grant_type = 'refresh_token';
    const currentTime = new Date().getTime();
    const expirationTime = 30 * 60 * 1000; // 30 minutos

    const tokenKey = `zoho_workdrive_access_${configId}`;

    // Verificar si hay un token válido en caché
    const tokenData = (global as any)[tokenKey];
    if (tokenData && currentTime < tokenData.expiryTime) {
      this.logger.debug(`Token WorkDrive API en caché (zoho_config id=${configId})`);
      return tokenData.access_token;
    }

    this.logger.log(`Refrescando access token WorkDrive desde zoho_config id=${configId}`);
    const tokenUrl = this.zohoConfigService.getTokenUrl(region);
    const params = {
      refresh_token,
      client_id,
      client_secret,
      grant_type,
    };

    try {
      const response = await lastValueFrom(
        this.httpService.post<TokenResponse>(`${tokenUrl}/token`, null, { params }),
      );

      const tokenResponse = response.data;
      const expiryTime = currentTime + expirationTime;

      // Guardar el nuevo token en caché global
      (global as any)[tokenKey] = {
        access_token: tokenResponse.access_token,
        expiryTime,
      };

      return tokenResponse.access_token;
    } catch (error: any) {
      this.logger.error('Error al obtener token de Zoho WorkDrive:', error.response?.data || error.message);
      throw new HttpException(
        'Error al obtener access token de Zoho WorkDrive',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private hasRefreshToken(c: ZohoConfig): boolean {
    return Boolean(c.refresh_token?.trim());
  }

  /**
   * Elige fila zoho_config para llamar a la API de WorkDrive:
   * 1) Si existe configuración `workdrive` (con refresh), úsala.
   * 2) Si no, usa `crm` (mismo org si aplica, luego cualquiera) — p. ej. refresh con scopes CRM+WorkDrive.
   */
  private pickConfigForWorkDriveApi(all: ZohoConfig[], org?: string): ZohoConfig | undefined {
    const wd = (o?: string) =>
      o
        ? all.find((c) => c.org === o && c.service === 'workdrive' && this.hasRefreshToken(c))
        : undefined;
    const crmForOrg = (o: string) =>
      all.find((c) => c.org === o && c.service === 'crm' && this.hasRefreshToken(c));

    if (org) {
      const w = wd(org);
      if (w) {
        return w;
      }
      const c = crmForOrg(org);
      if (c) {
        return c;
      }
    }

    const wGlobal = all.find((c) => c.service === 'workdrive' && this.hasRefreshToken(c));
    if (wGlobal) {
      return wGlobal;
    }

    return all.find((c) => c.service === 'crm' && this.hasRefreshToken(c));
  }

  /**
   * Obtiene access token y base URL WorkDrive a partir de zoho_config.
   */
  private async getCredentialsAndToken(org?: string) {
    const allConfigs = await this.zohoConfigService.findAllEntities();
    const config = this.pickConfigForWorkDriveApi(allConfigs, org);

    if (!config?.refresh_token) {
      throw new HttpException(
        'No hay configuración Zoho WorkDrive con token ni configuración CRM con refresh_token. ' +
          'En Ajustes → Zoho, crea fila WorkDrive o autoriza CRM incluyendo scopes WorkDrive.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (config.service === 'crm') {
      this.logger.debug(
        `WorkDrive API: usando refresh de CRM (org=${config.org}, id=${config.id}); no hay fila service=workdrive.`,
      );
    }

    const accessToken = await this.getToken(
      config.id,
      config.refresh_token,
      config.client_id,
      config.client_secret,
      config.region,
    );

    return {
      accessToken,
      baseUrl: this.getWorkDriveBaseUrl(config.region),
      zohoConfigId: config.id,
      zohoService: config.service,
      zohoOrg: config.org,
      scopesMayIncludeWorkDrive: /workdrive/i.test(config.scopes || ''),
    };
  }

  /**
   * Genera un permalink de embed para un archivo o carpeta en WorkDrive
   * Requiere scopes WorkDrive (p. ej. WorkDrive.files.ALL o equivalentes de sharing).
   * Usa JSON:API (Accept/Content-Type vnd.api+json). Si POST /permissions falla, intenta POST /links.
   *
   * @param resourceId - El ID único del archivo o carpeta en WorkDrive
   * @param org - Nombre de la organización (opcional, buscará cualquier configuración de WorkDrive disponible)
   * @returns El permalink o enlace público que puede usarse en un iframe (vía convertPermalinkToEmbedUrl)
   */
  async generateEmbedPermalink(
    resourceId: string,
    org?: string,
  ): Promise<string> {
    const ctx = await this.getCredentialsAndToken(org);
    const { accessToken, baseUrl, zohoConfigId, zohoService, scopesMayIncludeWorkDrive } = ctx;

    this.logger.log(`Generando permalink de embed para resource_id: ${resourceId}`);

    const permissionBodies = [
      { role_id: 34, label: 'publish+role_id=34' },
      { role_id: 6, label: 'publish+role_id=6(view externo documentado)' },
    ];

    const tryPermissions = async (role_id: number): Promise<string | null> => {
      const requestBody = {
        data: {
          type: 'permissions',
          attributes: {
            resource_id: resourceId,
            shared_type: 'publish',
            role_id,
          },
        },
      };
      const response = await lastValueFrom(
        this.httpService.post<WorkDrivePermissionResponse>(`${baseUrl}/permissions`, requestBody, {
          headers: workDriveJsonApiHeaders(accessToken),
        }),
      );
      const permalink = response.data?.data?.attributes?.permalink;
      if (permalink) {
        this.logger.debug('Respuesta completa de WorkDrive API:', JSON.stringify(response.data, null, 2));
        return permalink;
      }
      this.logger.error('Respuesta de WorkDrive no contiene permalink:', JSON.stringify(response.data, null, 2));
      return null;
    };

    const tryExternalShareLink = async (): Promise<string | null> => {
      const requestBody = {
        data: {
          type: 'links',
          attributes: {
            resource_id: resourceId,
            link_name: `portal-${resourceId.slice(0, 12)}`,
            request_user_data: false,
            allow_download: true,
            role_id: 6,
          },
        },
      };
      const response = await lastValueFrom(
        this.httpService.post<WorkDriveLinksResponse>(`${baseUrl}/links`, requestBody, {
          headers: workDriveJsonApiHeaders(accessToken),
        }),
      );
      const link = response.data?.data?.attributes?.link;
      if (link) {
        this.logger.log(`WorkDrive: permalink vía /links (enlace externo) para resource_id=${resourceId}`);
        return link;
      }
      return null;
    };

    const isUnauthorizedLike = (status: number, data: unknown): boolean => {
      if (status === 401 || status === 403) {
        return true;
      }
      const msg = zohoApiErrorsMessage(data);
      return Boolean(msg && /R008/i.test(msg));
    };

    let lastError: any;

    for (const { role_id, label } of permissionBodies) {
      try {
        this.logger.debug(`WorkDrive permissions: intento ${label}`);
        const permalink = await tryPermissions(role_id);
        if (permalink) {
          this.logger.log(`Permalink generado (${label}): ${permalink}`);
          return permalink;
        }
      } catch (err: any) {
        lastError = err;
        const status = err.response?.status;
        const data = err.response?.data;
        this.logger.warn(
          `WorkDrive permissions falló (${label}) status=${status}: ${zohoApiErrorsMessage(data) || err.message}`,
        );
        if (!isUnauthorizedLike(status, data) && status !== 400) {
          break;
        }
      }
    }

    if (lastError && isUnauthorizedLike(lastError.response?.status, lastError.response?.data)) {
      this.logger.warn(
        `WorkDrive 401/403/R008: zoho_config id=${zohoConfigId} service=${zohoService}; ` +
          `scopes en fila ${scopesMayIncludeWorkDrive ? 'incluyen texto WorkDrive' : 'NO parecen incluir WorkDrive'} — ` +
          `reautorizar OAuth con scopes WorkDrive o comprobar que el recurso pertenece al mismo equipo que el usuario del token.`,
      );
    }

    try {
      const link = await tryExternalShareLink();
      if (link) {
        return link;
      }
    } catch (err: any) {
      lastError = err;
      const data = err.response?.data;
      this.logger.warn(
        `WorkDrive /links falló: status=${err.response?.status} ${zohoApiErrorsMessage(data) || err.message}`,
      );
    }

    const detail =
      zohoApiErrorsMessage(lastError?.response?.data) ||
      lastError?.message ||
      'sin detalle';
    this.logger.error(`Error al generar permalink de embed para resource_id ${resourceId}:`, lastError?.response?.data || detail);
    throw new HttpException(
      `Error al generar permalink de embed: ${detail}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * Convierte un permalink de WorkDrive a URL de embed para iframe
   * Extrae el ID del permalink y construye la URL de embed con parámetros
   * 
   * @param permalink - El permalink obtenido de generateEmbedPermalink
   * @returns URL de embed lista para usar en iframe
   */
  convertPermalinkToEmbedUrl(permalink: string): string {
    this.logger.log(`Convirtiendo permalink a URL de embed: ${permalink}`);
    
    // El permalink puede tener formato:
    // - https://workdrive.zohoexternal.com/file/{resourceId}
    // - https://workdrive.zohoexternal.com/folder/{resourceId}
    // Necesitamos convertirlo a: https://workdrive.zohoexternal.com/embed/{resourceId}?toolbar=false&layout=grid&appearance=light&themecolor=green
    
    // Si ya es una URL de embed, retornarla tal cual (pero validar que tenga el ID completo)
    if (permalink.includes('workdrive.zohoexternal.com/embed/')) {
      // Extraer el ID de la URL de embed para validar
      const embedMatch = permalink.match(/workdrive\.zohoexternal\.com\/embed\/([a-z0-9]+)/i);
      if (embedMatch && embedMatch[1] && embedMatch[1].length > 10) {
        this.logger.log('El permalink ya es una URL de embed válida');
        return permalink;
      } else {
        this.logger.warn('URL de embed detectada pero con ID inválido o truncado, intentando extraer del permalink original');
      }
    }
    
    // Intentar extraer el ID de /file/ o /folder/
    // El ID puede contener letras y números, y generalmente tiene más de 20 caracteres
    // Usar [^/?]+ para capturar todo hasta el siguiente / o ? o fin de línea
    const fileMatch = permalink.match(/workdrive\.zohoexternal\.com\/file\/([^/?\s]+)/i);
    const folderMatch = permalink.match(/workdrive\.zohoexternal\.com\/folder\/([^/?\s]+)/i);
    
    let resourceId: string | null = null;
    
    if (fileMatch && fileMatch[1]) {
      resourceId = fileMatch[1];
      this.logger.log(`ID extraído de /file/: ${resourceId} (longitud: ${resourceId.length})`);
    } else if (folderMatch && folderMatch[1]) {
      resourceId = folderMatch[1];
      this.logger.log(`ID extraído de /folder/: ${resourceId} (longitud: ${resourceId.length})`);
    }
    
    if (resourceId && resourceId.length > 10) {
      const embedUrl = `https://workdrive.zohoexternal.com/embed/${resourceId}?toolbar=false&layout=grid&appearance=light&themecolor=green`;
      this.logger.log(`URL de embed generada: ${embedUrl}`);
      return embedUrl;
    }
    
    this.logger.error(`No se pudo extraer el resource ID del permalink: ${permalink}`);
    this.logger.error(`Resource ID encontrado: ${resourceId}, longitud: ${resourceId?.length || 0}`);
    throw new HttpException(
      `Formato de permalink no válido: ${permalink}. Se esperaba /file/ o /folder/ con un ID válido.`,
      HttpStatus.BAD_REQUEST,
    );
  }
}


