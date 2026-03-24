import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { ZohoConfigService } from './zoho-config.service';

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

@Injectable()
export class ZohoWorkDriveService {
  private readonly logger = new Logger(ZohoWorkDriveService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly zohoConfigService: ZohoConfigService,
    private readonly configService: ConfigService,
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
    refresh_token: string,
    client_id: string,
    client_secret: string,
    org: string,
    region: string,
  ): Promise<string> {
    const grant_type = 'refresh_token';
    const currentTime = new Date().getTime();
    const expirationTime = 30 * 60 * 1000; // 30 minutos

    const tokenKey = `token_${org}_workdrive`;

    // Verificar si hay un token válido en caché
    const tokenData = (global as any)[tokenKey];
    if (tokenData && currentTime < tokenData.expiryTime) {
      this.logger.debug(`Token válido encontrado en caché para ${org}_workdrive`);
      return tokenData.access_token;
    }

    // Generar nuevo token
    this.logger.log(`Generando nuevo token para ${org}_workdrive`);
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

  /**
   * Obtiene las credenciales y token para WorkDrive
   * Busca cualquier configuración de WorkDrive disponible si no se especifica org
   */
  private async getCredentialsAndToken(org?: string) {
    const service = 'workdrive';
    let config;
    
    if (org) {
      // Buscar por org específico
      try {
        config = await this.zohoConfigService.findByOrgAndService(org, service);
      } catch (error) {
        // Si no se encuentra, intentar buscar cualquier configuración de WorkDrive
        const allConfigs = await this.zohoConfigService.findAll();
        config = allConfigs.find(c => c.service === service && c.refresh_token);
      }
    } else {
      // Buscar cualquier configuración de WorkDrive disponible
      const allConfigs = await this.zohoConfigService.findAll();
      config = allConfigs.find(c => c.service === service && c.refresh_token);
    }

    if (!config || !config.refresh_token) {
      throw new HttpException(
        `Configuración de WorkDrive no encontrada o sin refresh_token. Por favor, configura el token primero en Settings → Zoho.`,
        HttpStatus.NOT_FOUND,
      );
    }

    // Usar el org de la configuración encontrada para el token key
    const configOrg = config.org;

    const accessToken = await this.getToken(
      config.refresh_token,
      config.client_id,
      config.client_secret,
      configOrg,
      config.region,
    );

    return {
      accessToken,
      baseUrl: this.getWorkDriveBaseUrl(config.region),
    };
  }

  /**
   * Genera un permalink de embed para un archivo o carpeta en WorkDrive
   * Scope requerido: WorkDrive.files.sharing.CREATE
   * 
   * @param resourceId - El ID único del archivo o carpeta en WorkDrive
   * @param org - Nombre de la organización (opcional, buscará cualquier configuración de WorkDrive disponible)
   * @returns El permalink que puede usarse en un iframe
   */
  async generateEmbedPermalink(
    resourceId: string,
    org?: string,
  ): Promise<string> {
    try {
      const { accessToken, baseUrl } = await this.getCredentialsAndToken(org);

      // Obtener el dominio del frontend para permitir embed desde ese dominio
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || '';
      let allowedDomain = '';
      try {
        if (frontendUrl) {
          const parsed = new URL(frontendUrl);
          allowedDomain = parsed.hostname;
        }
      } catch {
        // Si la URL no es válida, no se incluye allowed_domains
      }

      const requestBody: any = {
        data: {
          attributes: {
            resource_id: resourceId,
            shared_type: 'publish',
            role_id: 34, // View role
            ...(allowedDomain ? { allowed_domains: [allowedDomain] } : {}),
          },
          type: 'permissions',
        },
      };

      this.logger.log(`Generando permalink de embed para resource_id: ${resourceId}${allowedDomain ? ` (dominio permitido: ${allowedDomain})` : ''}`);

      const response = await lastValueFrom(
        this.httpService.post<WorkDrivePermissionResponse>(
          `${baseUrl}/permissions`,
          requestBody,
          {
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      // Log completo de la respuesta para debugging
      this.logger.debug('Respuesta completa de WorkDrive API:', JSON.stringify(response.data, null, 2));

      if (
        response.data?.data?.attributes?.permalink
      ) {
        const permalink = response.data.data.attributes.permalink;
        const resourceIdFromResponse = response.data.data.attributes.resource_id;
        const sharedType = response.data.data.attributes.shared_type;
        
        this.logger.log(`Permalink generado exitosamente: ${permalink}`);
        this.logger.log(`Resource ID desde respuesta: ${resourceIdFromResponse}`);
        this.logger.log(`Shared Type: ${sharedType}`);
        this.logger.log(`Datos completos de attributes:`, JSON.stringify(response.data.data.attributes, null, 2));
        
        return permalink;
      } else {
        this.logger.error('Respuesta de WorkDrive no contiene permalink:', JSON.stringify(response.data, null, 2));
        throw new HttpException(
          'No se recibió permalink en la respuesta de WorkDrive',
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error al generar permalink de embed para resource_id ${resourceId}:`,
        error.response?.data || error.message,
      );
      throw new HttpException(
        `Error al generar permalink de embed: ${error.response?.data?.message || error.message}`,
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


