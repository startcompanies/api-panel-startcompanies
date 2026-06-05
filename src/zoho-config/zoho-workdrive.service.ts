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

interface WorkDriveFileResource {
  id: string;
  type?: string;
  attributes?: {
    permalink?: string;
    name?: string;
    [key: string]: unknown;
  };
}

interface WorkDriveCreateFileResponse {
  data?: WorkDriveFileResource;
}

interface WorkDriveLinkResponse {
  data?: {
    attributes?: {
      link?: string;
      permalink?: string;
      [key: string]: unknown;
    };
  };
}

/** Resultado al aprovisionar carpeta LLC (equivalente a createFolderWorkDrive en Deluge). */
export interface ProvisionAccountWorkDriveResult {
  workDriveId: string;
  workDriveUrl: string;
  clientShareLink: string;
  personalFolderId: string;
  llcFolderId: string;
  embedPermalink: string;
  embedUrl: string;
}

const DEFAULT_ACCOUNTS_PARENT_FOLDER = 'okew5f51e0430b0d44acdb8d9b944a35d15b1';

const DEFAULT_WORKDRIVE_TEMPLATE_FILE_IDS = [
  '8646642eb502f0c3848e5ab32a0b269fec1e9',
  '86466728b0dd1543645da8165aef702bc8f06',
  '8646617b20db9a00a459f9303d24db893b5ad',
  '8z28qf8a58af45e5741d19f0b94b5cf4ae7b8',
];

const ACCOUNT_SUBFOLDER_NAMES = [
  'PERSONAL DOCUMENTS',
  'LLC MAIN DOCUMENTS',
  'INVOICES',
  'EXTRACTOS BANCARIOS',
  'DOCUMENTOS RECIBIDOS',
] as const;

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

  /**
   * Aprovisiona carpeta WorkDrive para un Account CRM (referencia: Deluge createFolderWorkDrive).
   * Crea estructura, link cliente, plantillas y permalink embebido del panel.
   */
  async provisionAccountFolderStructure(
    folderName: string,
  ): Promise<ProvisionAccountWorkDriveResult> {
    const trimmedName = folderName.trim() || 'LLC';
    const parentFolderId =
      process.env.ZOHO_WORKDRIVE_ACCOUNTS_PARENT_FOLDER?.trim() ||
      DEFAULT_ACCOUNTS_PARENT_FOLDER;

    const mainFolder = await this.createFolder(trimmedName, parentFolderId);
    const workDriveId = mainFolder.id;
    const workDriveUrl = mainFolder.permalink || '';

    const clientShareLink = await this.createClientShareLink(workDriveId);

    const personalFolder = await this.createFolder(
      'PERSONAL DOCUMENTS',
      workDriveId,
    );
    const llcMainFolder = await this.createFolder(
      'LLC MAIN DOCUMENTS',
      workDriveId,
    );

    for (const subName of ACCOUNT_SUBFOLDER_NAMES.slice(2)) {
      await this.createFolder(subName, workDriveId);
    }

    const presentationFolderName = `${new Date().getFullYear()} PRESENTATION`;
    await this.createFolder(presentationFolderName, workDriveId);

    await this.copyTemplateFilesToFolder(workDriveId);

    const embedPermalink = await this.generateEmbedPermalink(workDriveId);
    const embedUrl = this.convertPermalinkToEmbedUrl(embedPermalink);

    return {
      workDriveId,
      workDriveUrl,
      clientShareLink,
      personalFolderId: personalFolder.id,
      llcFolderId: llcMainFolder.id,
      embedPermalink,
      embedUrl,
    };
  }

  private wdJsonHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/json',
    };
  }

  private parseTemplateFileIds(): string[] {
    const raw = process.env.ZOHO_WORKDRIVE_TEMPLATE_FILE_IDS?.trim();
    if (!raw) {
      return DEFAULT_WORKDRIVE_TEMPLATE_FILE_IDS;
    }
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw) as string[];
        return parsed.filter(Boolean);
      } catch {
        return DEFAULT_WORKDRIVE_TEMPLATE_FILE_IDS;
      }
    }
    return raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  private async createFolder(
    name: string,
    parentId: string,
  ): Promise<{ id: string; permalink?: string }> {
    const { accessToken, baseUrl } = await this.getCredentialsAndToken();
    const body = {
      data: {
        attributes: {
          name,
          parent_id: parentId,
        },
        type: 'files',
      },
    };

    try {
      const response = await lastValueFrom(
        this.httpService.post<WorkDriveCreateFileResponse>(
          `${baseUrl}/files`,
          body,
          {
            headers: {
              ...this.wdJsonHeaders(accessToken),
              checkduplicatename: 'true',
            },
          },
        ),
      );

      const resource = response.data?.data;
      const id = resource?.id;
      if (!id) {
        throw new HttpException(
          'WorkDrive no devolvió id al crear carpeta',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return {
        id,
        permalink: resource?.attributes?.permalink,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      const detail = zohoApiErrorsMessage(error.response?.data) || error.message;
      this.logger.error(`WorkDrive createFolder "${name}": ${detail}`);
      throw new HttpException(
        `Error al crear carpeta WorkDrive: ${detail}`,
        error.response?.status || HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Link externo compartible (Deluge POST /links, role_id 7). */
  private async createClientShareLink(resourceId: string): Promise<string> {
    const { accessToken, baseUrl } = await this.getCredentialsAndToken();
    const body = {
      data: {
        attributes: {
          resource_id: resourceId,
          link_name: 'client',
          request_user_data: 'false',
          allow_download: 'true',
          role_id: '7',
        },
        type: 'links',
      },
    };

    try {
      const response = await lastValueFrom(
        this.httpService.post<WorkDriveLinkResponse>(`${baseUrl}/links`, body, {
          headers: this.wdJsonHeaders(accessToken),
        }),
      );

      const link =
        response.data?.data?.attributes?.link ||
        response.data?.data?.attributes?.permalink;
      if (!link) {
        throw new HttpException(
          'WorkDrive no devolvió link de cliente',
          HttpStatus.BAD_GATEWAY,
        );
      }
      return link;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      const detail = zohoApiErrorsMessage(error.response?.data) || error.message;
      this.logger.error(`WorkDrive createClientShareLink: ${detail}`);
      throw new HttpException(
        `Error al crear link WorkDrive: ${detail}`,
        error.response?.status || HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Lista subcarpetas directas de un folder WorkDrive. */
  async listChildFolders(
    parentId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const { accessToken, baseUrl } = await this.getCredentialsAndToken();

    try {
      const response = await lastValueFrom(
        this.httpService.get<{ data?: WorkDriveFileResource[] }>(
          `${baseUrl}/files/${parentId}/files`,
          {
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              Accept: 'application/vnd.api+json',
            },
            params: {
              'filter[type]': 'folder',
              'page[limit]': 200,
            },
          },
        ),
      );

      return (response.data?.data ?? [])
        .map((item) => ({
          id: item.id,
          name: String(item.attributes?.name ?? '').trim(),
        }))
        .filter((item) => item.id && item.name);
    } catch (error: any) {
      const detail = zohoApiErrorsMessage(error.response?.data) || error.message;
      this.logger.warn(`WorkDrive listChildFolders ${parentId}: ${detail}`);
      return [];
    }
  }

  /** Busca subcarpeta por nombre (insensible a mayúsculas) o la crea. */
  async ensureChildFolder(parentId: string, name: string): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) {
      return parentId;
    }

    const children = await this.listChildFolders(parentId);
    const existing = this.findMatchingChildFolder(children, trimmed);
    if (existing) {
      return existing.id;
    }

    const created = await this.createFolder(trimmed, parentId);
    return created.id;
  }

  /**
   * Resuelve alias de subcarpetas (p. ej. `2025 PRESENTATIONS` → `2025 PRESENTATION`).
   */
  private findMatchingChildFolder(
    children: Array<{ id: string; name: string }>,
    requestedName: string,
  ): { id: string; name: string } | undefined {
    const normalized = requestedName.trim().toLowerCase();
    const exact = children.find(
      (child) => child.name.trim().toLowerCase() === normalized,
    );
    if (exact) {
      return exact;
    }

    const presentationMatch = normalized.match(/^(\d{4})\s+presentations?$/);
    if (presentationMatch) {
      const year = presentationMatch[1];
      return children.find((child) => {
        const childName = child.name.trim().toLowerCase();
        return (
          childName === `${year} presentation` ||
          childName === `${year} presentations`
        );
      });
    }

    return undefined;
  }

  /**
   * Sube un archivo a WorkDrive (POST /upload).
   * @returns resource_id del archivo subido
   */
  async uploadFileBuffer(
    parentId: string,
    filename: string,
    content: Buffer,
  ): Promise<string> {
    const { accessToken, baseUrl } = await this.getCredentialsAndToken();
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('content', content, {
      filename,
      contentType: 'application/octet-stream',
    });

    const encodedName = encodeURIComponent(filename);
    const url =
      `${baseUrl}/upload?parent_id=${encodeURIComponent(parentId)}` +
      `&filename=${encodedName}&override-name-exist=true`;

    try {
      const response = await lastValueFrom(
        this.httpService.post<{
          data?: Array<{
            attributes?: {
              resource_id?: string;
              FileName?: string;
              'File INFO'?: string;
            };
          }>;
        }>(url, form, {
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            ...form.getHeaders(),
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }),
      );

      const attrs = response.data?.data?.[0]?.attributes;
      let resourceId = attrs?.resource_id;
      if (!resourceId && attrs?.['File INFO']) {
        try {
          const info = JSON.parse(attrs['File INFO']) as { RESOURCE_ID?: string };
          resourceId = info.RESOURCE_ID;
        } catch {
          /* ignore parse */
        }
      }

      if (!resourceId) {
        throw new HttpException(
          'WorkDrive no devolvió resource_id al subir archivo',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return resourceId;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      const detail = zohoApiErrorsMessage(error.response?.data) || error.message;
      this.logger.error(`WorkDrive upload "${filename}": ${detail}`);
      throw new HttpException(
        `Error al subir archivo a WorkDrive: ${detail}`,
        error.response?.status || HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Sube árbol de archivos bajo la carpeta raíz de la LLC. */
  async uploadDocumentTree(
    rootFolderId: string,
    files: Array<{ relativePath: string; buffer: Buffer }>,
  ): Promise<{ uploaded: number; failed: number; errors: string[] }> {
    let uploaded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const file of files) {
      const segments = file.relativePath
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean);
      if (segments.length === 0) {
        continue;
      }

      const fileName = segments.pop()!;
      let parentId = rootFolderId;

      try {
        for (const segment of segments) {
          parentId = await this.ensureChildFolder(parentId, segment);
        }
        await this.uploadFileBuffer(parentId, fileName, file.buffer);
        uploaded++;
      } catch (error: any) {
        failed++;
        const detail =
          error instanceof HttpException
            ? error.message
            : error?.message || 'Error desconocido';
        errors.push(`${file.relativePath}: ${detail}`);
        this.logger.warn(
          `Import docs: falló subida ${file.relativePath} → ${detail}`,
        );
      }
    }

    return { uploaded, failed, errors };
  }

  /** Copia archivos plantilla al folder raíz de la LLC (Deluge POST /files/{id}/copy). */
  private async copyTemplateFilesToFolder(targetFolderId: string): Promise<void> {
    const templateIds = this.parseTemplateFileIds();
    if (templateIds.length === 0) {
      return;
    }

    const { accessToken, baseUrl } = await this.getCredentialsAndToken();
    const body = {
      data: templateIds.map((resourceId) => ({
        attributes: { resource_id: resourceId },
        type: 'files',
      })),
    };

    try {
      await lastValueFrom(
        this.httpService.post(
          `${baseUrl}/files/${targetFolderId}/copy`,
          body,
          { headers: this.wdJsonHeaders(accessToken) },
        ),
      );
    } catch (error: any) {
      const detail = zohoApiErrorsMessage(error.response?.data) || error.message;
      this.logger.warn(
        `WorkDrive copy templates a ${targetFolderId} (no bloqueante): ${detail}`,
      );
    }
  }
}


