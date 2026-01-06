import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { ZohoConfigService } from './zoho-config.service';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

@Injectable()
export class ZohoCrmService {
  private readonly logger = new Logger(ZohoCrmService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly zohoConfigService: ZohoConfigService,
  ) {}

  /**
   * Obtiene la URL base del servicio CRM de Zoho según la región
   */
  private getCrmBaseUrl(region: string): string {
    const regionMap: Record<string, string> = {
      eu: 'eu',
      in: 'in',
      cn: 'com.cn',
      au: 'com.au',
    };
    const domain = regionMap[region] || 'com';
    return `https://www.zohoapis.${domain}/crm/v8`;
  }

  /**
   * Obtiene o refresca el token de acceso de Zoho CRM
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

    const tokenKey = `token_${org}_crm`;

    // Verificar si hay un token válido en caché
    const tokenData = (global as any)[tokenKey];
    if (tokenData && currentTime < tokenData.expiryTime) {
      this.logger.debug(`Token válido encontrado en caché para ${org}_crm`);
      return tokenData.access_token;
    }

    // Generar nuevo token
    this.logger.log(`Generando nuevo token para ${org}_crm`);
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
      this.logger.error('Error al obtener token de Zoho:', error.response?.data || error.message);
      throw new HttpException(
        'Error al obtener access token de Zoho',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Obtiene las credenciales y token para una organización
   */
  private async getCredentialsAndToken(org: string = 'startcompanies') {
    const service = 'crm';
    const config = await this.zohoConfigService.findByOrgAndService(org, service);

    if (!config || !config.refresh_token) {
      throw new HttpException(
        `No se encontraron credenciales para ${org} y servicio CRM`,
        HttpStatus.NOT_FOUND,
      );
    }

    const token = await this.getToken(
      config.refresh_token,
      config.client_id,
      config.client_secret,
      org,
      config.region,
    );

    return {
      token,
      baseUrl: this.getCrmBaseUrl(config.region),
    };
  }

  /**
   * Crea uno o más registros en un módulo de Zoho CRM
   */
  async createRecords(
    module: string,
    data: Record<string, any>[],
    org: string = 'startcompanies',
  ) {
    try {
      const { token, baseUrl } = await this.getCredentialsAndToken(org);
      const url = `${baseUrl}/${module}`;

      const payload = { data };

      this.logger.log(`Creando ${data.length} registro(s) en módulo ${module}`);

      const response = await lastValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Zoho-oauthtoken ${token}`,
          },
        }),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Error al crear registros en ${module}:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data || 'Error al crear registros en Zoho CRM',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Actualiza uno o más registros en un módulo de Zoho CRM
   */
  async updateRecords(
    module: string,
    data: Array<{ id: string; [key: string]: any }>,
    org: string = 'startcompanies',
  ) {
    try {
      const { token, baseUrl } = await this.getCredentialsAndToken(org);
      const url = `${baseUrl}/${module}`;

      const payload = { data };

      this.logger.log(`Actualizando ${data.length} registro(s) en módulo ${module}`);

      const response = await lastValueFrom(
        this.httpService.put(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Zoho-oauthtoken ${token}`,
          },
        }),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Error al actualizar registros en ${module}:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data || 'Error al actualizar registros en Zoho CRM',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Obtiene una lista de registros de un módulo
   */
  async getRecords(
    module: string,
    options: {
      fields?: string;
      page?: number;
      per_page?: number;
      page_token?: string;
      sort_order?: string;
      sort_by?: string;
      ids?: string;
      cvid?: number;
      converted?: string;
    } = {},
    org: string = 'startcompanies',
  ) {
    try {
      const { token, baseUrl } = await this.getCredentialsAndToken(org);
      const url = `${baseUrl}/${module}`;

      const params: any = {};
      if (options.fields) params.fields = options.fields;
      if (options.page) params.page = options.page;
      if (options.per_page) params.per_page = options.per_page;
      if (options.page_token) params.page_token = options.page_token;
      if (options.sort_order) params.sort_order = options.sort_order;
      if (options.sort_by) params.sort_by = options.sort_by;
      if (options.ids) params.ids = options.ids;
      if (options.cvid) params.cvid = options.cvid;
      if (options.converted) params.converted = options.converted;

      this.logger.log(`Obteniendo registros del módulo ${module}`);

      const response = await lastValueFrom(
        this.httpService.get(url, {
          headers: {
            Accept: 'application/json',
            Authorization: `Zoho-oauthtoken ${token}`,
          },
          params,
        }),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Error al obtener registros de ${module}:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data || 'Error al obtener registros de Zoho CRM',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Obtiene un registro específico por ID
   */
  async getRecordById(
    module: string,
    recordId: string,
    org: string = 'startcompanies',
    fields?: string,
  ) {
    try {
      const { token, baseUrl } = await this.getCredentialsAndToken(org);
      let url = `${baseUrl}/${module}/${recordId}`;

      const params: any = {};
      if (fields) {
        params.fields = fields;
      }

      this.logger.log(`Obteniendo registro ${recordId} del módulo ${module}`);

      const response = await lastValueFrom(
        this.httpService.get(url, {
          headers: {
            Accept: 'application/json',
            Authorization: `Zoho-oauthtoken ${token}`,
          },
          params,
        }),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Error al obtener registro ${recordId} de ${module}:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data || 'Error al obtener registro de Zoho CRM',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Ejecuta una consulta COQL
   */
  async queryWithCoql(
    select_query: string,
    include_meta?: string[],
    org: string = 'startcompanies',
  ) {
    try {
      const { token, baseUrl } = await this.getCredentialsAndToken(org);
      const url = `${baseUrl}/coql`;

      const payload: any = { select_query };
      if (include_meta && include_meta.length > 0) {
        payload.include_meta = include_meta;
      }

      this.logger.log(`Ejecutando consulta COQL`);

      const response = await lastValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Zoho-oauthtoken ${token}`,
          },
        }),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error('Error al ejecutar consulta COQL:', error.response?.data || error.message);
      throw new HttpException(
        error.response?.data || 'Error al ejecutar consulta COQL',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Busca registros usando Search API
   */
  async searchRecords(
    module: string,
    options: {
      criteria?: string;
      email?: string;
      phone?: string;
      word?: string;
      page?: number;
      per_page?: number;
      converted?: string;
      approved?: string;
    } = {},
    org: string = 'startcompanies',
  ) {
    try {
      const { token, baseUrl } = await this.getCredentialsAndToken(org);
      const url = `${baseUrl}/${module}/search`;

      const params: any = {};
      if (options.criteria) params.criteria = options.criteria;
      if (options.email) params.email = options.email;
      if (options.phone) params.phone = options.phone;
      if (options.word) params.word = options.word;
      if (options.page) params.page = options.page;
      if (options.per_page) params.per_page = options.per_page;
      if (options.converted) params.converted = options.converted;
      if (options.approved) params.approved = options.approved;

      this.logger.log(`Buscando registros en módulo ${module}`);

      const response = await lastValueFrom(
        this.httpService.get(url, {
          headers: {
            Accept: 'application/json',
            Authorization: `Zoho-oauthtoken ${token}`,
          },
          params,
        }),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Error al buscar registros en ${module}:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data || 'Error al buscar registros en Zoho CRM',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Realiza un upsert (insertar o actualizar) de registros
   */
  async upsertRecords(
    module: string,
    data: Record<string, any>[],
    duplicate_check_fields?: string[],
    org: string = 'startcompanies',
  ) {
    try {
      const { token, baseUrl } = await this.getCredentialsAndToken(org);
      const url = `${baseUrl}/${module}/upsert`;

      const payload: any = { data };
      if (duplicate_check_fields && duplicate_check_fields.length > 0) {
        payload.duplicate_check_fields = duplicate_check_fields;
      }

      this.logger.log(`Realizando upsert de ${data.length} registro(s) en módulo ${module}`);

      const response = await lastValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Zoho-oauthtoken ${token}`,
          },
        }),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Error al realizar upsert en ${module}:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data || 'Error al realizar upsert en Zoho CRM',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Obtiene los campos y metadata de un módulo (incluyendo Pick Lists)
   */
  async getModuleFields(
    module: string,
    org: string = 'startcompanies',
  ) {
    try {
      const { token, baseUrl } = await this.getCredentialsAndToken(org);
      const url = `${baseUrl}/settings/fields`;
      const params = { module };

      this.logger.log(`Obteniendo campos del módulo ${module}`);

      const response = await lastValueFrom(
        this.httpService.get(url, {
          headers: {
            Accept: 'application/json',
            Authorization: `Zoho-oauthtoken ${token}`,
          },
          params,
        }),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Error al obtener campos de ${module}:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data || 'Error al obtener campos de Zoho CRM',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Obtiene los valores de un Pick List específico
   */
  async getPickListValues(
    module: string,
    field: string,
    org: string = 'startcompanies',
  ) {
    try {
      const fieldsData = await this.getModuleFields(module, org);
      const fieldInfo = fieldsData.fields?.find((f: any) => f.api_name === field);

      if (!fieldInfo) {
        throw new HttpException(
          `Campo ${field} no encontrado en módulo ${module}`,
          HttpStatus.NOT_FOUND,
        );
      }

      if (fieldInfo.data_type !== 'picklist' && fieldInfo.data_type !== 'multiselectpicklist') {
        throw new HttpException(
          `Campo ${field} no es un Pick List`,
          HttpStatus.BAD_REQUEST,
        );
      }

      return fieldInfo.pick_list_values || [];
    } catch (error: any) {
      this.logger.error(`Error al obtener Pick List ${field} de ${module}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene los Stages de Deals según el Layout/Tipo
   */
  async getDealStages(
    layoutId?: number,
    org: string = 'startcompanies',
  ) {
    try {
      const { token, baseUrl } = await this.getCredentialsAndToken(org);
      let url = `${baseUrl}/settings/layouts`;
      const params: any = { module: 'Deals' };
      if (layoutId) {
        url = `${baseUrl}/settings/layouts/${layoutId}`;
      }

      this.logger.log(`Obteniendo layouts de Deals`);

      const response = await lastValueFrom(
        this.httpService.get(url, {
          headers: {
            Accept: 'application/json',
            Authorization: `Zoho-oauthtoken ${token}`,
          },
          params,
        }),
      );

      // Si se especificó layoutId, obtener stages de ese layout
      if (layoutId) {
        const layout = response.data.layouts?.[0];
        const stageField = layout.sections
          ?.flatMap((s: any) => s.fields)
          ?.find((f: any) => f.api_name === 'Stage');

        return stageField?.pick_list_values || [];
      }

      // Si no, retornar todos los layouts
      return response.data.layouts || [];
    } catch (error: any) {
      this.logger.error(`Error al obtener Stages de Deals:`, error.response?.data || error.message);
      throw new HttpException(
        error.response?.data || 'Error al obtener Stages de Zoho CRM',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }
}








