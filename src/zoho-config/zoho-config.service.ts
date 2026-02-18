import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZohoConfig } from './zoho-config.entity';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { ZohoConfigDto, UpdateZohoConfigDto } from './zoho-config.dto';

@Injectable()
export class ZohoConfigService {
  // URL de redirección después de OAuth (debe coincidir con la configurada en Zoho)
  private readonly redirect_uri: string =
    process.env.REDIRECT_URI || 'http://localhost:3000/orgTk/callback';

  constructor(
    @InjectRepository(ZohoConfig)
    private readonly zohoConfigRepository: Repository<ZohoConfig>,
    private readonly httpService: HttpService,
  ) {}

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
    const url = this.getTokenUrl(region);
    const responseType = 'code';
    return `${url}/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=${responseType}&scope=${scopes}&state=${state}&access_type=offline`;
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
    client_secret: string,
  ) {
    // Buscar si ya existe una configuración
    let tokenRecord = await this.zohoConfigRepository.findOne({
      where: { org, service },
    });

    if (tokenRecord) {
      // Actualizar configuración existente
      tokenRecord.region = region;
      tokenRecord.scopes = scopes;
      tokenRecord.client_id = client_id;
      tokenRecord.client_secret = client_secret;
    } else {
      // Crear nueva configuración
      tokenRecord = this.zohoConfigRepository.create({
        org,
        service,
        region,
        scopes,
        client_id,
        client_secret,
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

    // Realizar petición a Zoho
    const response = await lastValueFrom(
      this.httpService.post(`${url_token}/token`, null, { params }),
    );

    if (!response.data || !response.data.refresh_token) {
      throw new HttpException(
        'No se recibió refresh_token',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Guardar refresh_token
    tokenRecord.refresh_token = response.data.refresh_token;
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

  // Métodos CRUD básicos
  async findAll(): Promise<ZohoConfig[]> {
    return this.zohoConfigRepository.find();
  }

  async findOne(id: number): Promise<ZohoConfig> {
    const config = await this.zohoConfigRepository.findOne({ where: { id } });
    if (!config) {
      throw new HttpException('Configuración no encontrada', HttpStatus.NOT_FOUND);
    }
    return config;
  }

  async findByOrgAndService(org: string, service: string): Promise<ZohoConfig> {
    const config = await this.zohoConfigRepository.findOne({
      where: { org, service },
    });
    if (!config) {
      throw new HttpException('Configuración no encontrada', HttpStatus.NOT_FOUND);
    }
    return config;
  }

  async create(createZohoConfigDto: ZohoConfigDto): Promise<ZohoConfig> {
    const zohoConfig = this.zohoConfigRepository.create(createZohoConfigDto);
    return await this.zohoConfigRepository.save(zohoConfig);
  }

  async update(id: number, updateZohoConfigDto: UpdateZohoConfigDto): Promise<ZohoConfig> {
    const zohoConfig = await this.zohoConfigRepository.preload({
      id,
      ...updateZohoConfigDto,
    });
    if (!zohoConfig) {
      throw new HttpException('Configuración no encontrada', HttpStatus.NOT_FOUND);
    }
    return await this.zohoConfigRepository.save(zohoConfig);
  }

  async remove(id: number): Promise<void> {
    const zohoConfig = await this.findOne(id);
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








