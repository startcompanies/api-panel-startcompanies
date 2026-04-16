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

/** Respuesta POST /permissions de WorkDrive. */
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

      this.logger.debug(
        `WorkDrive access token obtenido (zoho_config id=${configId}, longitud=${tokenResponse.access_token?.length ?? 0})`,
      );

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
   * Elige fila zoho_config para llamar a la API de WorkDrive.
   * Prioridad por service: workdrive → crm.
   * El org no se usa como criterio porque todas las filas pertenecen al mismo cliente;
   * lo que varía es el service y los scopes asociados.
   */
  private pickConfigForWorkDriveApi(all: ZohoConfig[]): ZohoConfig | undefined {
    const withRefresh = all.filter((c) => this.hasRefreshToken(c));
    return (
      withRefresh.find((c) => c.service === 'workdrive') ??
      withRefresh.find((c) => c.service === 'crm')
    );
  }

  /**
   * Obtiene access token y base URL WorkDrive a partir de zoho_config.
   */
  private async getCredentialsAndToken() {
    const allConfigs = await this.zohoConfigService.findAllEntities();
    const config = this.pickConfigForWorkDriveApi(allConfigs);

    if (!config?.refresh_token) {
      throw new HttpException(
        'No hay configuración Zoho WorkDrive con token ni configuración CRM con refresh_token. ' +
          'En Ajustes → Zoho, crea fila service=workdrive o autoriza CRM incluyendo scopes WorkDrive.',
        HttpStatus.NOT_FOUND,
      );
    }

    this.logger.debug(
      `WorkDrive API: usando fila service=${config.service} org=${config.org} id=${config.id}.`,
    );

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
   * Genera un permalink de embed para un archivo o carpeta en WorkDrive.
   * Endpoint: POST /workdrive/api/v1/permissions con shared_type=publish, role_id=34.
   */
  async generateEmbedPermalink(
    resourceId: string,
    org?: string,
  ): Promise<string> {
    const { accessToken, baseUrl } = await this.getCredentialsAndToken();

    const requestBody = {
      data: {
        type: 'permissions',
        attributes: {
          resource_id: resourceId,
          shared_type: 'publish',
          role_id: 34,
        },
      },
    };

    this.logger.debug(
      `WorkDrive POST /permissions resource_id=${resourceId} (sin registrar token en logs).`,
    );

    try {
      const response = await lastValueFrom(
        this.httpService.post<WorkDrivePermissionResponse>(`${baseUrl}/permissions`, requestBody, {
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            Accept: 'application/vnd.api+json',
            'Content-Type': 'application/json',
          },
        }),
      );

      const permalink = response.data?.data?.attributes?.permalink;
      if (permalink) {
        this.logger.log(`Permalink generado para resource_id=${resourceId}: ${permalink}`);
        return permalink;
      }

      this.logger.error('Respuesta de WorkDrive no contiene permalink:', JSON.stringify(response.data, null, 2));
      throw new HttpException('No se recibió permalink en la respuesta de WorkDrive', HttpStatus.BAD_GATEWAY);
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      const status = error.response?.status;
      const data = error.response?.data;
      const detail = zohoApiErrorsMessage(data) || error.message || 'sin detalle';
      this.logger.error(
        `Error al generar permalink de embed para resource_id ${resourceId} (status=${status}):`,
        data || detail,
      );
      throw new HttpException(
        `Error al generar permalink de embed: ${detail}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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


