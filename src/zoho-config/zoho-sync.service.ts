import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ZohoCrmService } from './zoho-crm.service';
import { ZohoWorkDriveService } from './zoho-workdrive.service';
import { Request } from 'src/panel/requests/entities/request.entity';
import { AperturaLlcRequest } from 'src/panel/requests/entities/apertura-llc-request.entity';
import { RenovacionLlcRequest } from 'src/panel/requests/entities/renovacion-llc-request.entity';
import { CuentaBancariaRequest } from 'src/panel/requests/entities/cuenta-bancaria-request.entity';
import { Member } from 'src/panel/requests/entities/member.entity';
import { User } from 'src/shared/user/entities/user.entity';
import { Client } from 'src/panel/clients/entities/client.entity';
import { ZohoDealTimeline } from 'src/panel/requests/entities/zoho-deal-timeline.entity';
import { encodePassword } from 'src/shared/common/utils/bcrypt';
import {
  normalizeCountryForZoho,
  normalizeCountriesArrayForZoho,
  normalizeUsStateForZoho,
  ZOHO_LLC_ESTRUCTURA_MULTI,
  ZOHO_LLC_ESTRUCTURA_SINGLE,
} from './zoho-location-normalization';
import { applyRenovacionClientStageAlias } from './zoho-renovacion-stage-client';
import {
  ZohoImportAccountsProgressEvent,
  ZohoImportFullSyncMeta,
} from './zoho-sync.dto';

@Injectable()
export class ZohoSyncService {
  private readonly logger = new Logger(ZohoSyncService.name);

  constructor(
    private readonly zohoCrmService: ZohoCrmService,
    private readonly zohoWorkDriveService: ZohoWorkDriveService,
    @InjectRepository(Request)
    private readonly requestRepository: Repository<Request>,
    @InjectRepository(AperturaLlcRequest)
    private readonly aperturaRepo: Repository<AperturaLlcRequest>,
    @InjectRepository(RenovacionLlcRequest)
    private readonly renovacionRepo: Repository<RenovacionLlcRequest>,
    @InjectRepository(CuentaBancariaRequest)
    private readonly cuentaRepo: Repository<CuentaBancariaRequest>,
    @InjectRepository(Member)
    private readonly memberRepo: Repository<Member>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ZohoDealTimeline)
    private readonly zohoDealTimelineRepo: Repository<ZohoDealTimeline>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Normaliza un número de teléfono agregando el prefijo "+" si no lo tiene
   */
  /**
   * Parsea un valor booleano de Zoho (puede venir como string "true"/"false" o boolean)
   */
  private parseBoolean(value: any): boolean | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (lower === 'true' || lower === 'yes' || lower === 'sí' || lower === 'si' || lower === '1') {
        return true;
      }
      if (lower === 'false' || lower === 'no' || lower === '0') {
        return false;
      }
    }
    return undefined;
  }

  /**
   * Convierte un valor de picklist de Zoho (Sí/No) a string para campos que aceptan string
   * Usado para campos como hasPropertyInUSA, almacenaProductosDepositoUSA, etc. en RenovacionLlcRequest
   */
  private parseBooleanToPickListString(value: any): string | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    if (typeof value === 'boolean') {
      return value ? 'si' : 'no';
    }
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (lower === 'true' || lower === 'yes' || lower === 'sí' || lower === 'si' || lower === '1') {
        return 'si';
      }
      if (lower === 'false' || lower === 'no' || lower === '0') {
        return 'no';
      }
    }
    return undefined;
  }

  private normalizePhoneNumber(phoneNumber: string | null | undefined): string | null {
    if (!phoneNumber) return null;
    const cleaned = phoneNumber.trim().replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    return `+${cleaned}`;
  }

  /**
   * Zoho CRM rechaza muchos valores que `new URL` acepta (p. ej. localhost, IPs privadas).
   */
  private isAcceptableZohoWebsiteHostname(hostname: string): boolean {
    const h = (hostname || '').toLowerCase();
    if (!h) return false;
    if (h === 'localhost' || h.endsWith('.localhost')) return false;
    if (h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return false;

    const ipv4Parts = h.split('.');
    if (ipv4Parts.length === 4 && ipv4Parts.every((p) => /^\d{1,3}$/.test(p))) {
      const a = parseInt(ipv4Parts[0], 10);
      const b = parseInt(ipv4Parts[1], 10);
      if (a === 10) return false;
      if (a === 127) return false;
      if (a === 192 && b === 168) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 169 && b === 254) return false;
    }

    return true;
  }

  /**
   * Normaliza URL para campos Zoho de tipo website.
   * Si no es válida o no es aceptable para Zoho (p. ej. localhost), retorna '' y no se envían las claves.
   */
  private normalizeWebsiteUrl(url: string | null | undefined): string {
    const raw = (url || '').trim();
    if (!raw) return '';

    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(candidate);
      if (!parsed.hostname) return '';
      if (!this.isAcceptableZohoWebsiteHostname(parsed.hostname)) return '';
      return candidate;
    } catch {
      return '';
    }
  }

  /** Stage del módulo Deals (COQL / REST); a veces la clave puede variar. */
  private normalizeZohoDealStage(deal: Record<string, unknown> | null | undefined): string {
    if (!deal) return '';
    const raw = deal['Stage'] ?? deal['stage'];
    if (raw == null) return '';
    return String(raw).trim();
  }

  /**
   * Solo correo desde Account/subform cuando el Contact del Deal no trae Email (necesario para crear usuario).
   */
  private mergeEmailFromAccountIfMissing(
    account: Record<string, unknown>,
    contactEmail: string,
  ): string {
    if ((contactEmail || '').trim()) return (contactEmail || '').trim();
    const merged = this.mergeClientContactFromAccountFields(account, {
      contactEmail: '',
      contactPhone: '',
      contactFirstName: '',
      contactLastName: '',
    });
    return merged.contactEmail;
  }

  /**
   * Completa nombre, apellido, correo y teléfono del cliente desde el Account
   * (subform Contacto_Principal_LLC y campos principales), igual criterio que mapAccountToCuentaRequest.
   * Uso: cuando no hay Deal o no se pudo cargar el Contact vinculado al Deal.
   */
  private mergeClientContactFromAccountFields(
    account: Record<string, unknown>,
    partial: {
      contactEmail: string;
      contactPhone: string;
      contactFirstName: string;
      contactLastName: string;
    },
  ): {
    contactEmail: string;
    contactPhone: string;
    contactFirstName: string;
    contactLastName: string;
  } {
    let { contactEmail, contactPhone, contactFirstName, contactLastName } = partial;
    const sub = Array.isArray(account.Contacto_Principal_LLC)
      ? (account.Contacto_Principal_LLC[0] as Record<string, unknown> | undefined)
      : undefined;

    if (sub) {
      if (!(contactFirstName || '').trim()) {
        contactFirstName = String(sub.Nombres_del_propietario || account.Nombre_s || '');
      }
      if (!(contactLastName || '').trim()) {
        contactLastName = String(sub.Apellidos_del_propietario || account.Apellidos || '');
      }
      if (!(contactEmail || '').trim()) {
        contactEmail = String(
          sub.Correo_electr_nico_Propietario || account.Email_Laboral || account.Correo_electr_nico || '',
        );
      }
      if (!(contactPhone || '').trim()) {
        contactPhone = String(sub.Tel_fono_Contacto_Propietario || account.Phone || '');
      }
    } else {
      if (!(contactFirstName || '').trim()) contactFirstName = String(account.Nombre_s || '');
      if (!(contactLastName || '').trim()) contactLastName = String(account.Apellidos || '');
      if (!(contactEmail || '').trim()) {
        contactEmail = String(account.Email_Laboral || account.Correo_electr_nico || '');
      }
      if (!(contactPhone || '').trim()) contactPhone = String(account.Phone || '');
    }

    return {
      contactEmail: (contactEmail || '').trim(),
      contactPhone: (contactPhone || '').trim(),
      contactFirstName: (contactFirstName || '').trim(),
      contactLastName: (contactLastName || '').trim(),
    };
  }

  /**
   * Mapea el estado de la request al Stage de Zoho Deal
   */
  private mapRequestStatusToDealStage(
    status: string,
    type: string,
  ): string {
    const statusMap: Record<string, Record<string, string>> = {
      'pendiente': {
        'apertura-llc': 'Apertura Iniciada',
        'renovacion-llc': 'Renovación Iniciada',
        'cuenta-bancaria': 'Cuenta Bancaria Iniciada',
      },
      'en-proceso': {
        'apertura-llc': 'Apertura En Proceso',
        'renovacion-llc': 'Renovación En Proceso',
        'cuenta-bancaria': 'Cuenta Bancaria En Proceso',
      },
      'completada': {
        'apertura-llc': 'Apertura Confirmada',
        'renovacion-llc': 'Renovación Confirmada',
        'cuenta-bancaria': 'Cuenta Bancaria Finalizada',
      },
      'rechazada': {
        'apertura-llc': 'Apertura Rechazada',
        'renovacion-llc': 'Renovación Rechazada',
        'cuenta-bancaria': 'Cuenta Bancaria Rechazada',
      },
    };
    return statusMap[status]?.[type] || 'Apertura Iniciada';
  }

  /**
   * Mapea el tipo de request al Type de Zoho Deal
   */
  private mapRequestTypeToDealType(type: string): string {
    const typeMap: Record<string, string> = {
      'apertura-llc': 'Apertura',
      'renovacion-llc': 'Renovación',
      'cuenta-bancaria': 'Cuenta Bancaria',
    };
    return typeMap[type] || 'Apertura';
  }

  /**
   * Sincroniza una solicitud desde BD a Zoho CRM
   * SOLO crea/actualiza Account (NO crea Contacts ni Deals)
   * Nota: El proceso inverso (Zoho a BD) es diferente y sí crea Contacts y Deals
   */
  async syncRequestToZoho(requestId: number, org: string = 'startcompanies') {
    try {
      // Obtener la solicitud completa con todas las relaciones
      const request = await this.requestRepository.findOne({
        where: { id: requestId },
        relations: ['client', 'partner', 'aperturaLlcRequest', 'renovacionLlcRequest', 'cuentaBancariaRequest'],
      });

      if (!request) {
        throw new HttpException(
          `Solicitud ${requestId} no encontrada`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Obtener miembros de la solicitud (necesarios para el mapeo del Account)
      const members = await this.memberRepo.find({
        where: { requestId },
        order: { id: 'ASC' },
      });

      // Crear/Actualizar Account en Zoho con subformularios (Contacto Principal LLC y Socios LLC)
      const accountData = await this.mapRequestToAccount(request, members);
      
      // Agregar subformularios si hay members
      if (members.length > 0) {
        // El primer miembro va a "Contacto Principal LLC"
        const primaryMember = members[0];
        const primaryContactSubform = this.mapMemberToPrimaryContactSubform(primaryMember);
        accountData.Contacto_Principal_LLC = [primaryContactSubform];

        // Los demás miembros van a "Socios LLC"
        const otherMembers = members.slice(1);
        if (otherMembers.length > 0) {
          const sociosSubform = otherMembers.map((member) =>
            this.mapMemberToSociosSubform(member),
          );
          accountData.Socios_LLC = sociosSubform;
        }
      }
      
      let accountResult;
      try {
        accountResult = await this.zohoCrmService.upsertRecords(
          'Accounts',
          [accountData],
          ['Account_Name'], // Campo único para detección de duplicados
          org,
        );
      } catch (error: any) {
        // Si el error es sobre porcentajes, intentar buscar el Account existente
        const errorMessage = error.message || error.toString() || '';
        const isPercentageError = errorMessage.includes('porcentajes') || 
                                  errorMessage.includes('porcentaje') ||
                                  errorMessage.includes('100%') ||
                                  errorMessage.includes('suma de porcentajes');
        
        if (isPercentageError) {
          this.logger.warn(`Error de validación de porcentajes ignorado para Account ${accountData.Account_Name}: ${errorMessage}`);
          // Intentar obtener el Account existente por nombre
          try {
            const searchResult = await this.zohoCrmService.searchRecords(
              'Accounts',
              { criteria: `Account_Name:equals:${accountData.Account_Name}` },
              org,
            );
            if (searchResult.data && searchResult.data.length > 0) {
              accountResult = { data: [{ details: { id: searchResult.data[0].id } }] };
              this.logger.log(`Account encontrado por búsqueda: ${searchResult.data[0].id}`);
            } else {
              // Si no se encuentra, intentar con COQL
              const coqlQuery = `SELECT id FROM Accounts WHERE Account_Name = '${accountData.Account_Name}' LIMIT 1`;
              const coqlResult = await this.zohoCrmService.queryWithCoql(coqlQuery, undefined, org);
              if (coqlResult.data && coqlResult.data.length > 0) {
                accountResult = { data: [{ details: { id: coqlResult.data[0].id } }] };
                this.logger.log(`Account encontrado por COQL: ${coqlResult.data[0].id}`);
              } else {
                this.logger.warn(`No se pudo encontrar Account ${accountData.Account_Name} después del error de porcentajes`);
                throw error; // Si no se puede encontrar, lanzar el error original
              }
            }
          } catch (searchError: any) {
            this.logger.error(`Error al buscar Account después de error de porcentajes: ${searchError.message}`);
            throw error; // Lanzar el error original si la búsqueda falla
          }
        } else {
          throw error; // Para otros errores, lanzar normalmente
        }
      }

      const accountId = accountResult.data?.[0]?.details?.id;
      if (!accountId) {
        throw new HttpException(
          'No se pudo obtener el ID de Account de Zoho',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Mismo criterio que mapRequestToAccount (Empresa en Zoho)
      const companyForBd =
        request.partnerId != null || request.partner
          ? 'Partner'
          : 'Start Companies';

      // Guardar zohoAccountId y company en Request (alineado con picklist Empresa enviado a Zoho)
      await this.requestRepository.update(
        { id: requestId },
        { zohoAccountId: accountId, company: companyForBd },
      );

      // Actualizar también el objeto en memoria para consistencia
      request.zohoAccountId = accountId;
      request.company = companyForBd;

      // Sincronizar también propietarios al módulo Propietarios_LLC (además de subforms en Account)
      if (members.length > 0) {
        await this.syncMembersToPropietariosLlc(accountId, members, org);
      }

      this.logger.log(`Account sincronizado exitosamente: ${accountId}. zohoAccountId guardado en BD: ${accountId}`);

      return {
        success: true,
        accountId,
      };
    } catch (error: any) {
      this.logger.error(`Error al sincronizar solicitud ${requestId} a Zoho:`, error);
      throw new HttpException(
        error.message || 'Error al sincronizar con Zoho CRM',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Usuario partner asociado a la solicitud (relación cargada o consulta por partnerId).
   */
  private async resolvePartnerUser(request: Request): Promise<User | null> {
    if (request.partner) {
      return request.partner;
    }
    if (request.partnerId != null) {
      return this.userRepo.findOne({ where: { id: request.partnerId } });
    }
    return null;
  }

  /**
   * Mapea una Request a un Account de Zoho
   */
  private async mapRequestToAccount(
    request: Request,
    members: Member[],
  ): Promise<Record<string, any>> {
    // Picklist Zoho Empresa: "Partner" si la solicitud la gestiona un partner; si no, "Start Companies" (cliente)
    const empresa =
      request.partnerId != null || request.partner
        ? 'Partner'
        : 'Start Companies';

    let accountData: Record<string, any> = {
      Account_Name: '', // Se llenará según el tipo
      Tipo: this.mapRequestTypeToDealType(request.type),
      Empresa: empresa,
      // Owner se asigna automáticamente por Zoho basado en el usuario que hace la petición
      // No incluir Owner si causa problemas de validación
    };

    // Mapear datos según el tipo de solicitud
    if (request.type === 'apertura-llc' && request.aperturaLlcRequest) {
      const apertura = request.aperturaLlcRequest;
      const projectOrCompanyUrl = this.normalizeWebsiteUrl(
        (apertura as any).project_or_company_url ?? apertura.projectOrCompanyUrl,
      );
      accountData = {
        ...accountData,
        // Mapeo según CSV - campos del formulario
        Account_Name: apertura.llcName || '',
        Nombre_de_la_LLC_Opci_n_2: apertura.llcNameOption2 || '',
        Nombre_de_la_LLC_Opci_n_3: apertura.llcNameOption3 || '',
        Estado_de_Registro: normalizeUsStateForZoho(apertura.incorporationState || ''),
        Actividad_Principal_de_la_LLC: apertura.businessDescription || '',
        Estructura_Societaria:
          apertura.llcType === 'single'
            ? ZOHO_LLC_ESTRUCTURA_SINGLE
            : ZOHO_LLC_ESTRUCTURA_MULTI,
        LinkedIn: apertura.linkedin || '',
        ...(projectOrCompanyUrl
          ? { Website: projectOrCompanyUrl, P_gina_web_de_la_LLC: projectOrCompanyUrl }
          : {}),
        Actividad_financiera_esperada: apertura.actividadFinancieraEsperada || '',
        Tendr_ingresos_peri_dicos_que_sumen_USD_10_000: this.mapBooleanToPickList(apertura.periodicIncome10k),
        Correo_Electr_nico_Vinculado_a_la_Cuenta_Bancaria: apertura.bankAccountLinkedEmail || '',
        N_mero_de_Tel_fono_Vinculado_a_la_Cuenta_Bancaria: this.normalizePhoneNumber(apertura.bankAccountLinkedPhone) || '',
      };
    } else if (request.type === 'renovacion-llc' && request.renovacionLlcRequest) {
      const renovacion = request.renovacionLlcRequest;
      accountData = {
        ...accountData,
        // Campos MANTENER según data.md
        Account_Name: renovacion.llcName || '',
        Estado_de_Registro: normalizeUsStateForZoho(renovacion.state || ''),
        Actividad_Principal_de_la_LLC: renovacion.mainActivity || '',
        N_mero_de_EIN: renovacion.einNumber || '',
        Estructura_Societaria:
          renovacion.llcType === 'single'
            ? ZOHO_LLC_ESTRUCTURA_SINGLE
            : ZOHO_LLC_ESTRUCTURA_MULTI,
        // Campos AGREGAR según data.md - usando Pick List (Sí/No)
        Tu_empresa_posee_o_renta_una_propiedad_en_EE_UU: this.mapBooleanToPickList(renovacion.hasPropertyInUSA),
        Almacena_productos_en_un_dep_sito_en_EE_UU: this.mapBooleanToPickList(renovacion.almacenaProductosDepositoUSA),
        Tu_empresa_contrata_servicios_en_EE_UU: this.mapBooleanToPickList(renovacion.contrataServiciosUSA),
        Tu_LLC_tiene_cuentas_bancarias_a_su_nombre: this.mapBooleanToPickList(renovacion.tieneCuentasBancarias),
        Fecha_de_Constituci_n: this.formatDate(renovacion.llcCreationDate),
        Pa_ses_donde_la_LLC_realiza_negocios: normalizeCountriesArrayForZoho(
          renovacion.countriesWhereLLCDoesBusiness,
        ),
        Posee_la_LLC_inversiones_o_activos_en_EE_UU: this.mapBooleanToPickList(renovacion.hasFinancialInvestmentsInUSA),
        La_LLC_declar_impuestos_anteriormente: this.mapBooleanToPickList(renovacion.hasFiledTaxesBefore),
        La_LLC_se_constituy_con_Start_Companies: this.mapBooleanToPickList(renovacion.wasConstitutedWithStartCompanies),
        // Campos adicionales según CSV
        A_o_de_la_Declaraci_n_Fiscal: renovacion.declaracionAnoCorriente ? '2025' : '',
        Nuevo_nombre_de_la_LLC: renovacion.cambioNombre ? renovacion.llcName || '' : '',
        // Declaraciones_Juradas_Anteriores: this.mapBooleanToPickList(renovacion.declaracionAnosAnteriores), // Comentado temporalmente - error de validación en Zoho (maximum_length: 1)
        Cu_nto_cost_abrir_la_LLC_en_Estados_Unidos: renovacion.llcOpeningCost ? String(renovacion.llcOpeningCost) : '',
        Pagos_a_familiares_servicios: renovacion.paidToFamilyMembers ? String(renovacion.paidToFamilyMembers) : '',
        Cu_nto_pag_la_LLC_a_empresas_locales_En_otro_Pa: renovacion.paidToLocalCompanies ? String(renovacion.paidToLocalCompanies) : '',
        Pagos_formaci_n_LLC_tasas_estatales: renovacion.paidForLLCFormation ? String(renovacion.paidForLLCFormation) : '',
        Pagos_disoluci_n_LLC: renovacion.paidForLLCDissolution ? String(renovacion.paidForLLCDissolution) : '',
        Saldo_bancario_fin_de_a_o_LLC: renovacion.bankAccountBalanceEndOfYear ? String(renovacion.bankAccountBalanceEndOfYear) : '',
        Facturaci_n_total_de_la_LLC: renovacion.totalRevenue ? String(renovacion.totalRevenue) : '',
      };
    } else if (request.type === 'cuenta-bancaria' && request.cuentaBancariaRequest) {
      const cuenta = request.cuentaBancariaRequest;
      // Banco: usar bankService si existe, sino "Relay" por defecto
      const banco = cuenta.bankService || 'Relay';
      // Dirección comercial (Registered Agent) desde campos individuales
      const companyAddr = {
        street: cuenta.registeredAgentStreet || '',
        unit: cuenta.registeredAgentUnit || '',
        city: cuenta.registeredAgentCity || '',
        state: normalizeUsStateForZoho(cuenta.registeredAgentState || ''),
        postalCode: cuenta.registeredAgentZipCode || '',
        country: normalizeCountryForZoho(cuenta.registeredAgentCountry || ''),
      };
      const sitioWebRedSocial = this.normalizeWebsiteUrl(
        (cuenta as any).website_or_social_media ?? cuenta.websiteOrSocialMedia,
      );

      accountData = {
        ...accountData,
        // Mapeo según CSV - campos del formulario
        Account_Name: cuenta.legalBusinessIdentifier || '',
        Tipo_de_negocio: cuenta.businessType || '',
        Industria_Rubro: cuenta.industry || '',
        Cantidad_de_empleados: cuenta.numberOfEmployees || '',
        Descripci_n_breve: cuenta.economicActivity || '',
        ...(sitioWebRedSocial ? { Sitio_web_o_Red_Social: sitioWebRedSocial } : {}),
        N_mero_de_EIN: cuenta.ein || '',
        Estructura_Societaria:
          cuenta.llcType === 'single'
            ? ZOHO_LLC_ESTRUCTURA_SINGLE
            : cuenta.llcType === 'multi'
            ? ZOHO_LLC_ESTRUCTURA_MULTI
            : ZOHO_LLC_ESTRUCTURA_SINGLE,
        // Dirección Comercial (Registered Agent) - desde companyAddress (JSONB)
        Direcci_n_comercial_Calle_y_numero: companyAddr.street || '',
        Direcci_n_comercial_Suite: companyAddr.unit || '',
        Direcci_n_comercial_Ciudad: companyAddr.city || '',
        Direcci_n_comercial_Estado: companyAddr.state || '',
        Direcci_n_comercial_Postal: companyAddr.postalCode || '',
        Direcci_n_postal_Pais: companyAddr.country || '',
        Estado_de_constituci_n: normalizeUsStateForZoho(cuenta.incorporationState || ''),
        Mes_y_A_o: cuenta.incorporationMonthYear || '',
        Pa_ses_donde_la_LLC_realiza_negocios: normalizeCountriesArrayForZoho(
          cuenta.countriesWhereBusiness,
        ),
        Banco: banco,
        // Dirección Personal del Propietario (desde ownerPersonalAddress JSONB)
        Calle_y_n_mero: cuenta.ownerPersonalAddress?.street || '',
        Suite_Apto: cuenta.ownerPersonalAddress?.unit || '',
        Ciudad: cuenta.ownerPersonalAddress?.city || '',
        Estado_Provincia: normalizeUsStateForZoho(cuenta.ownerPersonalAddress?.state || ''),
        Postal_Zip_Code: cuenta.ownerPersonalAddress?.postalCode || '',
        Pais: normalizeCountryForZoho(cuenta.ownerPersonalAddress?.country || ''),
      };
    }

    if (empresa === 'Partner') {
      const partner = await this.resolvePartnerUser(request);
      if (partner) {
        const email = (partner.email || '').trim();
        if (email) {
          accountData.Partner_Email = email;
        } else {
          this.logger.warn(
            `Partner user ${partner.id} sin email; no se envía Partner_Email a Zoho para request ${request.id}`,
          );
        }
        accountData.Partner_Phone =
          this.normalizePhoneNumber(partner.phone) || '';
      } else {
        this.logger.warn(
          `Request ${request.id} tiene Empresa=Partner pero no se resolvió el usuario partner (partnerId=${request.partnerId ?? 'n/a'})`,
        );
      }
    }

    return accountData;
  }

  /**
   * Mapea un Member a un Contact de Zoho
   */
  private mapMemberToContact(
    member: Member,
    accountId: string,
    isPrimary: boolean = false,
  ): Record<string, any> {
    return {
      First_Name: member.firstName,
      Last_Name: member.lastName,
      Email: member.email,
      Mobile: this.normalizePhoneNumber(member.phoneNumber),
      Date_of_Birth: this.formatDate(member.dateOfBirth),
      Account_Name: {
        id: accountId,
      },
      Mailing_Street: member.memberAddress?.street || '',
      Mailing_City: member.memberAddress?.city || '',
      Mailing_State: normalizeUsStateForZoho(member.memberAddress?.stateRegion || ''),
      Mailing_Zip: member.memberAddress?.postalCode || '',
      Mailing_Country: normalizeCountryForZoho(
        member.nationality?.trim()
          ? member.nationality
          : member.memberAddress?.country || '',
      ),
    };
  }

  /**
   * Mapea un User, Member o Client a Contact (para contacto principal)
   */
  private mapToContact(
    contact: User | Member | Client,
    accountId: string,
    isPrimary: boolean = false,
  ): Record<string, any> {
    if ('firstName' in contact) {
      // Es un Member
      return this.mapMemberToContact(contact as Member, accountId, isPrimary);
    } else if ('full_name' in contact) {
      // Es un Client
      const client = contact as Client;
      const nameParts = client.full_name.split(' ');
      return {
        First_Name: nameParts[0] || '',
        Last_Name: nameParts.slice(1).join(' ') || '',
        Email: client.email,
        Mobile: this.normalizePhoneNumber(client.phone),
        Account_Name: {
          id: accountId,
        },
      };
    } else {
      // Es un User
      const user = contact as User;
      return {
        First_Name: user.first_name || user.username.split(' ')[0] || '',
        Last_Name: user.last_name || user.username.split(' ').slice(1).join(' ') || '',
        Email: user.email,
        Mobile: this.normalizePhoneNumber(user.phone),
        Account_Name: {
          id: accountId,
        },
      };
    }
  }

  /**
   * Mapea una Request a un Deal de Zoho
   */
  private async mapRequestToDeal(
    request: Request,
    accountId: string,
    primaryContactId: string | null,
  ): Promise<Record<string, any>> {
    let dealName = '';
    let description = '';

    if (request.type === 'apertura-llc' && request.aperturaLlcRequest) {
      dealName = `Apertura - ${request.aperturaLlcRequest.llcName || 'Nueva LLC'}`;
      description = request.aperturaLlcRequest.businessDescription || '';
    } else if (request.type === 'renovacion-llc' && request.renovacionLlcRequest) {
      dealName = `Renovación - ${request.renovacionLlcRequest.llcName || 'LLC'}`;
      description = request.renovacionLlcRequest.mainActivity || '';
    } else if (request.type === 'cuenta-bancaria' && request.cuentaBancariaRequest) {
      dealName = `Cuenta Bancaria - ${request.cuentaBancariaRequest.legalBusinessIdentifier || 'Nueva Cuenta'}`;
      description = request.cuentaBancariaRequest.economicActivity || '';
    }

    const dealData: Record<string, any> = {
      Deal_Name: dealName,
      Type: this.mapRequestTypeToDealType(request.type),
      Stage: this.mapRequestStatusToDealStage(request.status, request.type),
      Account_Name: {
        id: accountId,
      },
      Description: description || request.notes || '',
      Layout: request.type === 'apertura-llc' ? 'Aperturas' : 'Standard',
      // Owner se asigna automáticamente por Zoho basado en el usuario que hace la petición
    };

    if (primaryContactId) {
      dealData.Contact_Name = {
        id: primaryContactId,
      };
    }

    // Agregar campos específicos según el tipo
    if (request.type === 'apertura-llc' && request.aperturaLlcRequest) {
      const apertura = request.aperturaLlcRequest;
      dealData.Estructura_Societaria =
        apertura.llcType === 'single'
          ? ZOHO_LLC_ESTRUCTURA_SINGLE
          : ZOHO_LLC_ESTRUCTURA_MULTI;
      dealData.Estado_de_Registro = normalizeUsStateForZoho(apertura.incorporationState || '');
    } else if (request.type === 'renovacion-llc' && request.renovacionLlcRequest) {
      const renovacion = request.renovacionLlcRequest;
      dealData.Estructura_Societaria =
        renovacion.llcType === 'single'
          ? ZOHO_LLC_ESTRUCTURA_SINGLE
          : ZOHO_LLC_ESTRUCTURA_MULTI;
      dealData.Estado_de_Registro = normalizeUsStateForZoho(renovacion.state || '');
    } else if (request.type === 'cuenta-bancaria' && request.cuentaBancariaRequest) {
      const cuenta = request.cuentaBancariaRequest;
      dealData.Tiene_cuenta_bancaria = cuenta.bankService ? 'Sí' : 'No';
      dealData.Banco = cuenta.bankService || 'Relay';
    }

    return dealData;
  }

  /**
   * Actualiza los subformularios de Account (Contacto Principal LLC y Socios LLC)
   * Los subformularios se actualizan junto con el Account usando el API name del subformulario
   * COMENTADO: Validación de porcentajes deshabilitada por ahora
   */
  private async updateAccountSubforms(
    accountId: string,
    members: Member[],
    org: string,
  ): Promise<void> {
    // COMENTADO: Validación de porcentajes deshabilitada por ahora
    // No se actualizan subformularios para evitar validación de Zoho sobre porcentajes
    this.logger.log(`Actualización de subformularios deshabilitada para Account ${accountId} (validación de porcentajes deshabilitada)`);
    return;
    
    /* CÓDIGO COMENTADO - Validación de porcentajes deshabilitada
    try {
      // El primer miembro va a "Contacto Principal LLC"
      // Los demás van a "Socios LLC"
      const primaryMember = members[0];
      const otherMembers = members.slice(1);

      // Mapear Contacto Principal LLC
      const primaryContactSubform = this.mapMemberToPrimaryContactSubform(primaryMember);

      // Mapear Socios LLC
      const sociosSubform = otherMembers.map((member) =>
        this.mapMemberToSociosSubform(member),
      );

      // Actualizar Account con subformularios
      // Nota: Zoho requiere que los subformularios se actualicen junto con el Account
      // El API name del subformulario debe ser el nombre del módulo del subformulario
      const accountUpdate: Record<string, any> = {
        id: accountId,
      };

      // Los subformularios en Zoho se actualizan usando el API name del módulo del subformulario
      // Por ejemplo: Contacto_Principal_LLC es el API name del módulo subformulario
      if (primaryContactSubform) {
        accountUpdate.Contacto_Principal_LLC = [primaryContactSubform];
      }

      if (sociosSubform.length > 0) {
        accountUpdate.Socios_LLC = sociosSubform;
      }

      // Solo actualizar si hay subformularios
      if (primaryContactSubform || sociosSubform.length > 0) {
        await this.zohoCrmService.updateRecords('Accounts', [accountUpdate as { id: string; [key: string]: any }], org);
        this.logger.log(`Subformularios actualizados para Account ${accountId}`);
      }
    } catch (error: any) {
      this.logger.error('Error al actualizar subformularios:', error);
      // No lanzar error, solo loguear - los subformularios pueden fallar sin afectar el flujo principal
    }
    */
  }

  /**
   * Mapea un Member al subformulario "Contacto Principal LLC"
   */
  private mapMemberToPrimaryContactSubform(member: Member): Record<string, any> {
    return {
      Nombres_del_propietario: member.firstName,
      Apellidos_del_propietario: member.lastName,
      Nro_de_pasaporte_Propietario: member.passportNumber,
      Nacionalidad_Propietario: normalizeCountryForZoho(member.nationality || ''),
      Fecha_Nacimiento_Propietario: this.formatDate(member.dateOfBirth),
      Correo_electr_nico_Propietario: member.email,
      Tel_fono_Contacto_Propietario: this.normalizePhoneNumber(member.phoneNumber),
      Calle_y_n_mero_exterior_altura: member.memberAddress?.street || '',
      N_mero_interior_departamento_P: member.memberAddress?.unit || '',
      Ciudad_Propietario: member.memberAddress?.city || '',
      Estado_Regi_n_Provincia_Prop: normalizeUsStateForZoho(member.memberAddress?.stateRegion || ''),
      C_digo_postal_Propietario: member.memberAddress?.postalCode || '',
      Pa_s_de_Residencia_Propietario: normalizeCountryForZoho(member.memberAddress?.country || ''),
      Porcentaje_Participaci_n_Princ: member.percentageOfParticipation || 100,
      ...(member.ssnOrItin && { N_mero_de_SSN_ITIN: member.ssnOrItin }),
      ...(member.nationalTaxId && { ID_Fiscal_Nacional_CUIT: member.nationalTaxId }),
      ...(member.taxFilingCountry && {
        Pa_s_donde_paga_impuestos: normalizeCountryForZoho(member.taxFilingCountry),
      }),
      ...(member.ownerContributions && {
        Contribuciones_de_capital_realizadas_en_2024_USD: member.ownerContributions,
      }),
      ...(member.ownerLoansToLLC && {
        Pr_stamos_realizados_a_la_LLC_en_2024: member.ownerLoansToLLC,
      }),
      ...(member.loansReimbursedByLLC && {
        Pr_stamos_repagados_por_la_LLC_a_Propietario_2024: member.loansReimbursedByLLC,
      }),
      ...(member.profitDistributions && {
        Retiros_de_capital_realizados_en_2024_USD: member.profitDistributions,
      }),
      ...(member.spentMoreThan31DaysInUS !== null && member.spentMoreThan31DaysInUS !== undefined && member.spentMoreThan31DaysInUS !== '' && {
        Estuvo_en_EE_UU_m_s_de_31_d_as_en_2024: this.mapBooleanToPickList(member.spentMoreThan31DaysInUS),
      }),
      ...(member.hasUSFinancialInvestments !== null && member.hasUSFinancialInvestments !== undefined && member.hasUSFinancialInvestments !== '' && {
        Posee_inversiones_o_activos_en_EE_UU: this.mapBooleanToPickList(member.hasUSFinancialInvestments),
      }),
      ...(member.isUSCitizen !== null && member.isUSCitizen !== undefined && member.isUSCitizen !== '' && {
        Es_ciudadano_de_EE_UU: this.mapBooleanToPickList(member.isUSCitizen),
      }),
    };
  }

  /**
   * Mapea un Member al subformulario "Socios LLC"
   */
  private mapMemberToSociosSubform(member: Member): Record<string, any> {
    return {
      Nombres_del_Socio: member.firstName,
      Apellidos_del_Socio: member.lastName,
      N_mero_de_pasaporte_Socio: member.passportNumber,
      Nacionalidad_Socio: normalizeCountryForZoho(member.nationality || ''),
      Fecha_de_Nacimiento_Socio: this.formatDate(member.dateOfBirth),
      Correo_electr_nico_Socio: member.email,
      Tel_fono_Socio: this.normalizePhoneNumber(member.phoneNumber),
      Calle_y_n_mero_exterior_altura: member.memberAddress?.street || '',
      N_mero_interior_departamento_S: member.memberAddress?.unit || '',
      Ciudad_Propietario: member.memberAddress?.city || '',
      Estado_Regi_n_Provincia_Socio: normalizeUsStateForZoho(member.memberAddress?.stateRegion || ''),
      C_digo_postal_Socio: member.memberAddress?.postalCode || '',
      Pa_s_de_Residencia_Socio: normalizeCountryForZoho(member.memberAddress?.country || ''),
      Porcentaje_Participaci_n_Socio: member.percentageOfParticipation || 0,
      ...(member.ssnOrItin && { N_mero_de_SSN_ITIN: member.ssnOrItin }),
      ...(member.nationalTaxId && { ID_Fiscal_Nacional_CUIT: member.nationalTaxId }),
      ...(member.taxFilingCountry && {
        Pa_s_donde_paga_impuestos: normalizeCountryForZoho(member.taxFilingCountry),
      }),
      ...(member.ownerContributions && {
        Contribuciones_de_capital_realizadas_en_2024: member.ownerContributions,
      }),
      ...(member.ownerLoansToLLC && {
        Pr_stamos_realizados_a_la_LLC_en_2024: member.ownerLoansToLLC,
      }),
      ...(member.loansReimbursedByLLC && {
        Pr_stamos_repagados_por_la_LLC_a_Propietario_2024: member.loansReimbursedByLLC,
      }),
      ...(member.profitDistributions && {
        Retiros_de_Capital_2024: member.profitDistributions,
      }),
      ...(member.spentMoreThan31DaysInUS && {
        Estuvo_en_EE_UU_m_s_de_31_d_as_en_2024: this.mapBooleanToPickList(member.spentMoreThan31DaysInUS),
      }),
      ...(member.hasUSFinancialInvestments && {
        Posee_inversiones_o_activos_en_EE_UU: this.mapBooleanToPickList(member.hasUSFinancialInvestments),
      }),
      ...(member.isUSCitizen && {
        Es_ciudadano_de_EE_UU: this.mapBooleanToPickList(member.isUSCitizen),
      }),
    };
  }

  /**
   * Mapea un Member al módulo Propietarios_LLC
   */
  private mapMemberToPropietarioLlc(
    member: Member,
    accountId: string,
    isPrimary: boolean,
  ): Record<string, any> {
    return {
      Name: `${member.firstName || ''} ${member.lastName || ''}`.trim(),
      Nombres: member.firstName || '',
      Apellidos: member.lastName || '',
      Email: member.email || '',
      Secondary_Email: member.email || '',
      Tel_fono: this.normalizePhoneNumber(member.phoneNumber) || '',
      Fecha_de_nacimiento: this.formatDate(member.dateOfBirth),
      N_mero_de_pasaporte: member.passportNumber || '',
      Nacionalidad: normalizeCountryForZoho(member.nationality || ''),
      Ciudadania: normalizeCountryForZoho(member.nationality || ''),
      Ciudadano_EEUU: this.parseBoolean(member.isUSCitizen),
      Mas_de_31_dias_en_EEUU: this.parseBoolean(member.spentMoreThan31DaysInUS),
      Posee_Activos_en_EEUU: this.parseBoolean(member.hasUSFinancialInvestments),
      SSN_ITIN: member.ssnOrItin || '',
      ID_Fiscal_Nacional: member.nationalTaxId || '',
      Pais_Declaracion_Impuestos: normalizeCountryForZoho(member.taxFilingCountry || ''),
      Pa_s_bajo_cuyas_leyes_el_propietario_presenta_impu: normalizeCountryForZoho(member.taxFilingCountry || ''),
      Aportes_de_Capital: member.ownerContributions ?? null,
      Prestamos_a_LLC: member.ownerLoansToLLC ?? null,
      Prestamos_Reembolsados: member.loansReimbursedByLLC ?? null,
      Distribuciones_Retiros: member.profitDistributions ?? null,
      Retiros_de_Capital: member.profitDistributions ?? null,
      Porcentaje_Participacion: member.percentageOfParticipation ?? (isPrimary ? 100 : 0),
      Calle_y_n_mero_exterior: member.memberAddress?.street || '',
      Apartamento_Suite: member.memberAddress?.unit || '',
      Ciudad: member.memberAddress?.city || '',
      Estado: normalizeUsStateForZoho(member.memberAddress?.stateRegion || ''),
      Codigo_postal: member.memberAddress?.postalCode || '',
      Pa_s: normalizeCountryForZoho(member.memberAddress?.country || ''),
      Es_propietario_Primario: isPrimary,
      Es_propietario_Secundario: !isPrimary,
      Source_Subform: isPrimary ? 'Contacto_Principal_LLC' : 'Socios_LLC',
      LLC: { id: accountId },
    };
  }

  /**
   * Sincroniza miembros al módulo Propietarios_LLC
   * Usa LLC (lookup a Account) como vínculo principal.
   */
  private async syncMembersToPropietariosLlc(
    accountId: string,
    members: Member[],
    org: string,
  ): Promise<void> {
    try {
      const existingByKey = new Map<string, string>();
      const selectQuery = [
        'SELECT id, N_mero_de_pasaporte, Email, Nombres, Apellidos',
        'FROM Propietarios_LLC',
        `WHERE LLC.id = '${accountId}'`,
        'ORDER BY Created_Time DESC',
        'LIMIT 200',
      ].join(' ');
      const existingResponse = await this.zohoCrmService.queryWithCoql(selectQuery, undefined, org);
      const existingRecords = existingResponse.data || [];
      for (const rec of existingRecords) {
        const key = `${(rec.Email || '').toLowerCase()}|${rec.N_mero_de_pasaporte || ''}|${(rec.Nombres || '').toLowerCase()}|${(rec.Apellidos || '').toLowerCase()}`;
        if (!existingByKey.has(key)) {
          existingByKey.set(key, rec.id);
        }
      }

      const payload = members.map((member, index) => {
        const base = this.mapMemberToPropietarioLlc(member, accountId, index === 0);
        const key = `${(member.email || '').toLowerCase()}|${member.passportNumber || ''}|${(member.firstName || '').toLowerCase()}|${(member.lastName || '').toLowerCase()}`;
        const existingId = existingByKey.get(key);
        if (existingId) {
          return { id: existingId, ...base };
        }
        return base;
      });

      if (payload.length === 0) {
        return;
      }

      await this.zohoCrmService.upsertRecords('Propietarios_LLC', payload, ['Email', 'N_mero_de_pasaporte'], org);
      this.logger.log(`Propietarios_LLC sincronizado: ${payload.length} registro(s) para Account ${accountId}`);
    } catch (error: any) {
      this.logger.warn(`Error al sincronizar Propietarios_LLC para Account ${accountId}: ${error.message}`);
      // No bloquear el flujo principal de Account por errores en módulo adicional
    }
  }

  private parseZohoBooleanToMemberValue(value: any): string | null {
    const parsed = this.parseBooleanToPickListString(value);
    return parsed ?? null;
  }

  private async getPropietariosLlcByAccountId(
    accountId: string,
    org: string,
  ): Promise<any[]> {
    const fields = [
      'id',
      'Nombres',
      'Apellidos',
      'Email',
      'Secondary_Email',
      'Tel_fono',
      'Fecha_de_nacimiento',
      'N_mero_de_pasaporte',
      'Nacionalidad',
      'Ciudadania',
      'Ciudadano_EEUU',
      'Mas_de_31_dias_en_EEUU',
      'Posee_Activos_en_EEUU',
      'SSN_ITIN',
      'ID_Fiscal_Nacional',
      'Pais_Declaracion_Impuestos',
      'Pa_s_bajo_cuyas_leyes_el_propietario_presenta_impu',
      'Aportes_de_Capital',
      'Prestamos_a_LLC',
      'Prestamos_Reembolsados',
      'Distribuciones_Retiros',
      'Retiros_de_Capital',
      'Porcentaje_Participacion',
      'Calle_y_n_mero_exterior',
      'Apartamento_Suite',
      'Ciudad',
      'Estado',
      'Codigo_postal',
      'Pa_s',
      'Es_propietario_Primario',
      'Es_propietario_Secundario',
      'Created_Time',
    ];

    const query = `SELECT ${fields.join(', ')} FROM Propietarios_LLC WHERE LLC.id = '${accountId}' ORDER BY Created_Time ASC LIMIT 200`;
    const response = await this.zohoCrmService.queryWithCoql(query, undefined, org);
    return response.data || [];
  }

  /**
   * Mapea valores booleanos o strings a valores de Pick List de Zoho (Sí/No)
   */
  private mapBooleanToPickList(value: string | boolean | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'Sí' : 'No';
    }
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (lower === 'true' || lower === 'yes' || lower === 'sí' || lower === 'si' || lower === '1') {
        return 'Sí';
      }
      if (lower === 'false' || lower === 'no' || lower === '0') {
        return 'No';
      }
      // Si ya es "Sí" o "No", devolverlo tal cual
      if (lower === 'sí' || value === 'Sí') {
        return 'Sí';
      }
      if (lower === 'no' || value === 'No') {
        return 'No';
      }
    }
    return '';
  }

  /**
   * Crea un usuario desde un Client
   */
  private async createUserFromClient(client: Client): Promise<User | null> {
    try {
      // Verificar si el usuario ya existe
      if (client.userId) {
        const existingUser = await this.userRepo.findOne({
          where: { id: client.userId },
        });
        if (existingUser) {
          return existingUser;
        }
      }

      const existingUser = await this.userRepo.findOne({
        where: { email: client.email },
      });

      if (existingUser) {
        // Actualizar el Client para asociarlo con el User existente
        await this.dataSource
          .createQueryBuilder()
          .update('clients')
          .set({ userId: existingUser.id })
          .where('id = :id', { id: client.id })
          .execute();
        return existingUser;
      }

      // Crear nuevo usuario
      const nameParts = client.full_name.split(' ');
      let username = client.email.split('@')[0];
      let existingUserByUsername = await this.userRepo.findOne({
        where: { username },
      });
      let counter = 1;
      while (existingUserByUsername) {
        username = `${client.email.split('@')[0]}${counter}`;
        existingUserByUsername = await this.userRepo.findOne({
          where: { username },
        });
        counter++;
      }

      const defaultPassword = this.generateTemporaryPassword();
      const hashedPassword = encodePassword(defaultPassword);

      const newUser = this.userRepo.create({
        username,
        email: client.email,
        password: hashedPassword,
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        phone: client.phone || '',
        type: 'client',
        status: client.status,
      });

      const savedUser = await this.userRepo.save(newUser);

      // Actualizar el Client para asociarlo con el nuevo User
      await this.dataSource
        .createQueryBuilder()
        .update('clients')
        .set({ userId: savedUser.id })
        .where('id = :id', { id: client.id })
        .execute();

      this.logger.log(`Usuario creado desde Client: ${savedUser.id} - ${savedUser.email}`);
      return savedUser;
    } catch (error: any) {
      this.logger.error(`Error al crear usuario desde Client: ${error.message}`);
      return null;
    }
  }

  /**
   * Crea un usuario basado en el contacto principal
   * (Solo si no es partner, ya que los partners ya son usuarios)
   */
  private async createUserFromPrimaryContact(
    email: string,
    primaryContact: User | Member,
  ): Promise<User | null> {
    try {
      // Verificar si el usuario ya existe
      const existingUser = await this.userRepo.findOne({
        where: { email },
      });

      if (existingUser) {
        this.logger.log(`Usuario ya existe con email ${email}`);
        return existingUser;
      }

      // Si es un User, ya existe en la BD
      if ('username' in primaryContact) {
        return primaryContact as User;
      }

      // Si es un Member, crear nuevo usuario
      const member = primaryContact as Member;
      let username = email.split('@')[0];
      // Verificar si el username ya existe y generar uno único si es necesario
      let existingUserByUsername = await this.userRepo.findOne({
        where: { username },
      });
      let counter = 1;
      while (existingUserByUsername) {
        username = `${email.split('@')[0]}${counter}`;
        existingUserByUsername = await this.userRepo.findOne({
          where: { username },
        });
        counter++;
      }

      // Generar contraseña temporal segura
      const defaultPassword = this.generateTemporaryPassword();
      const hashedPassword = encodePassword(defaultPassword);

      const newUser = this.userRepo.create({
        username,
        email: member.email,
        password: hashedPassword,
        first_name: member.firstName,
        last_name: member.lastName,
        phone: member.phoneNumber,
        type: 'client',
        status: true,
      });

      const savedUser = await this.userRepo.save(newUser);

      this.logger.log(`Usuario creado para contacto principal: ${savedUser.id}`);

      // TODO: Enviar notificación de creación de usuario
      // await this.emailService.sendUserCreationEmail(...);
      // Comentado por ahora ya que está en desarrollo

      return savedUser;
    } catch (error: any) {
      this.logger.error(`Error al crear usuario para ${email}:`, error);
      // No lanzar error, solo loguear
      return null;
    }
  }

  /**
   * Formatea una fecha a formato YYYY-MM-DD para Zoho
   */
  private formatDate(date: Date | string | null | undefined): string | null {
    if (!date) return null;
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  }

  /**
   * Obtiene metadata de Pick Lists y Stages (cacheable)
   */
  private metadataCache: Map<string, any> = new Map();

  async getMetadata(org: string = 'startcompanies') {
    const cacheKey = `metadata_${org}`;
    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey);
    }

    try {
      // Obtener Pick Lists de Accounts
      const accountsFields = await this.zohoCrmService.getModuleFields('Accounts', org);
      const accountsPickLists: Record<string, string[]> = {};
      
      accountsFields.fields?.forEach((field: any) => {
        if (field.data_type === 'picklist' || field.data_type === 'multiselectpicklist') {
          accountsPickLists[field.api_name] = field.pick_list_values?.map((v: any) => v.actual_value) || [];
        }
      });

      // Obtener Stages de Deals
      const dealsStages = await this.zohoCrmService.getDealStages(undefined, org);

      const metadata = {
        accountsPickLists,
        dealsStages,
        timestamp: Date.now(),
      };

      this.metadataCache.set(cacheKey, metadata);
      return metadata;
    } catch (error: any) {
      this.logger.error('Error al obtener metadata:', error);
      throw error;
    }
  }

  /**
   * Valida que un valor existe en un Pick List
   */
  private validatePickListValue(
    value: string | null | undefined,
    pickListValues: string[],
    fieldName: string,
  ): boolean {
    if (!value) return true; // Valores nulos son válidos
    return pickListValues.includes(value);
  }

  private async emitImportProgress(
    onProgress: ((e: ZohoImportAccountsProgressEvent) => void | Promise<void>) | undefined,
    event: ZohoImportAccountsProgressEvent,
  ): Promise<void> {
    if (!onProgress) return;
    await Promise.resolve(onProgress(event));
  }

  /**
   * Total de Accounts que aplican al mismo filtro que el import (COQL count). Opcional para barras de progreso.
   */
  private async getAccountsImportFilterCount(org: string): Promise<number | undefined> {
    try {
      const whereClause = "(Tipo in ('Apertura', 'Renovación', 'Cuenta Bancaria'))";
      const coqlQuery = `select count() from Accounts where ${whereClause}`;
      const response = await this.zohoCrmService.queryWithCoql(coqlQuery, undefined, org);
      const infoCount = (response as { info?: { count?: number } })?.info?.count;
      if (typeof infoCount === 'number' && Number.isFinite(infoCount)) {
        return infoCount;
      }
      const rows = response?.data;
      if (!Array.isArray(rows) || rows.length === 0) {
        return undefined;
      }
      const first = rows[0] as Record<string, unknown>;
      const n =
        first.count ??
        first.Count ??
        (typeof first['count()'] === 'number' ? first['count()'] : undefined);
      if (typeof n === 'number' && Number.isFinite(n)) {
        return n;
      }
    } catch (e: any) {
      this.logger.warn(`COQL count Accounts no disponible: ${e?.message ?? e}`);
    }
    return undefined;
  }

  /**
   * Misma consulta COQL que usa el import de Accounts (filtro por Tipo).
   */
  private buildAccountsImportCoqlQuery(limit: number, offset: number): string {
    const fields = [
        'id',
        'Account_Name',
        'Actividad_Principal_de_la_LLC',
        'Estado_de_Registro',
        'Estructura_Societaria',
        'P_gina_web_de_la_LLC',
        'Website',
        'N_mero_de_EIN',
        'Nombre_de_la_LLC_Opci_n_2',
        'Nombre_de_la_LLC_Opci_n_3',
        'LinkedIn',
        'Actividad_financiera_esperada',
        'Tendr_ingresos_peri_dicos_que_sumen_USD_10_000',
        'Correo_Electr_nico_Vinculado_a_la_Cuenta_Bancaria',
        'N_mero_de_Tel_fono_Vinculado_a_la_Cuenta_Bancaria',
        // Campos para Renovación LLC
        'Tu_empresa_posee_o_renta_una_propiedad_en_EE_UU',
        'Almacena_productos_en_un_dep_sito_en_EE_UU',
        'Tu_empresa_contrata_servicios_en_EE_UU',
        'Tu_LLC_tiene_cuentas_bancarias_a_su_nombre',
        'Fecha_de_Constituci_n',
        'Pa_ses_donde_la_LLC_realiza_negocios',
        'Posee_la_LLC_inversiones_o_activos_en_EE_UU',
        'La_LLC_declar_impuestos_anteriormente',
        'La_LLC_se_constituy_con_Start_Companies',
        'A_o_de_la_Declaraci_n_Fiscal',
        'Nuevo_nombre_de_la_LLC',
        // Declaraciones_Juradas_Anteriores: File Upload — COQL no soporta; viene en getRecordById.
        'Cu_nto_cost_abrir_la_LLC_en_Estados_Unidos',
        'Pagos_a_familiares_servicios',
        'Cu_nto_pag_la_LLC_a_empresas_locales_En_otro_Pa',
        'Pagos_formaci_n_LLC_tasas_estatales',
        'Pagos_disoluci_n_LLC',
        'Saldo_bancario_fin_de_a_o_LLC',
        'Facturaci_n_total_de_la_LLC',
        // Campos para Cuenta Bancaria
        'Tipo_de_negocio',
        'Industria_Rubro',
        'Cantidad_de_empleados',
        'Descripci_n_breve',
        'Sitio_web_o_Red_Social',
        'Direcci_n_comercial_Calle_y_numero',
        'Direcci_n_comercial_Suite',
        'Direcci_n_comercial_Ciudad',
        'Direcci_n_comercial_Estado',
        'Direcci_n_comercial_Postal',
        'Direcci_n_postal_Pais',
        'Estado_de_constituci_n',
        'Mes_y_A_o',
        'Banco',
        'Calle_y_n_mero',
        'Suite_Apto',
        'Ciudad',
        'Estado_Provincia',
        'Postal_Zip_Code',
        'Pais',
        // Campos de contacto del Account principal (para crear Member)
        'Nombre_s',
        'Apellidos',
        'Email_Laboral',
        'Correo_electr_nico',
        'Phone',
        'Fecha_de_nacimiento',
        'Nacionalidad1',
        'N_mero_de_pasaporte',
        // Nota: Es_ciudadano_de_EE_UU está en el subform Contacto_Principal_LLC; COQL de Accounts no lo admite en SELECT.
        // Sigue disponible tras getRecordById (merge) y en filas del subform.
        // Campos necesarios para lógica
        'Tipo', // Necesario para determinar el tipo de request
        'Empresa', // Necesario para determinar si es Partner
        'Partner_Email', // Necesario si es Partner
        'Partner_Phone', // Necesario si es Partner
        'Created_Time',
        'Modified_Time',
      ];

    const whereClause = "(Tipo in ('Apertura', 'Renovación', 'Cuenta Bancaria'))";
    return `select ${fields.join(', ')} from Accounts where ${whereClause} order by Created_Time desc limit ${limit} offset ${offset}`;
  }

  private async fetchAllAccountsCoqlPagesForFullSync(
    org: string,
    batchSize: number,
    onProgress?: (event: ZohoImportAccountsProgressEvent) => void | Promise<void>,
  ): Promise<any[]> {
    const allAccounts: any[] = [];
    let offset = 0;
    while (true) {
      const coqlQuery = this.buildAccountsImportCoqlQuery(batchSize, offset);
      this.logger.debug(`Consulta COQL (prefetch full sync): ${coqlQuery}`);
      const response = await this.zohoCrmService.queryWithCoql(coqlQuery, undefined, org);
      const batch = response.data || [];
      allAccounts.push(...batch);
      await this.emitImportProgress(onProgress, {
        phase: 'prefetch_list',
        accumulated: allAccounts.length,
      });
      if (batch.length < batchSize) {
        break;
      }
      offset += batchSize;
    }
    return allAccounts;
  }

  private async processAccountRowsFromCoql(
    org: string,
    accounts: any[],
    metadata: any,
    onProgress?: (event: ZohoImportAccountsProgressEvent) => void | Promise<void>,
    fullSyncMeta?: ZohoImportFullSyncMeta,
  ): Promise<{
    success: boolean;
    total: number;
    imported: number;
    updated: number;
    errors: any[];
    details: any[];
  }> {
    this.logger.log(`Obteniendo Account completo con subformularios para ${accounts.length} Accounts...`);

    const results = {
      imported: 0,
      updated: 0,
      errors: [] as any[],
      details: [] as any[],
    };

    /** Un solo bucle por account: detalle Zoho y luego import al panel (evita que el contador 1/N “vuelva a 1” tras terminar todos los detalles). */
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      await this.emitImportProgress(onProgress, {
        phase: 'fetch_detail',
        current: i + 1,
        total: accounts.length,
        accountId: String(account.id),
        accountName: account.Account_Name,
        ...(fullSyncMeta ? { fullSync: fullSyncMeta } : {}),
      });
      try {
        const fullAccount = await this.zohoCrmService.getRecordById(
          'Accounts',
          account.id,
          org,
          undefined,
        );
        if (fullAccount.data && fullAccount.data.length > 0) {
          Object.assign(account, fullAccount.data[0]);
          const hasContactoPrincipal = !!(fullAccount.data[0].Contacto_Principal_LLC);
          const hasSocios = !!(fullAccount.data[0].Socios_LLC);
          this.logger.log(`Account ${account.id} (${account.Account_Name}) - Subforms obtenidos: Contacto_Principal_LLC=${hasContactoPrincipal}, Socios_LLC=${hasSocios}`);
          if (hasContactoPrincipal && Array.isArray(fullAccount.data[0].Contacto_Principal_LLC)) {
            this.logger.log(`Contacto_Principal_LLC tiene ${fullAccount.data[0].Contacto_Principal_LLC.length} registro(s)`);
            if (fullAccount.data[0].Contacto_Principal_LLC.length > 0) {
              const prop = fullAccount.data[0].Contacto_Principal_LLC[0];
              this.logger.log(`  - Propietario: ${prop.Nombres_del_propietario || ''} ${prop.Apellidos_del_propietario || ''}, Email: ${prop.Correo_electr_nico_Propietario || 'N/A'}`);
            }
          }
          if (hasSocios && Array.isArray(fullAccount.data[0].Socios_LLC)) {
            this.logger.log(`Socios_LLC tiene ${fullAccount.data[0].Socios_LLC.length} registro(s)`);
            fullAccount.data[0].Socios_LLC.forEach((socio: any, idx: number) => {
              this.logger.log(`  - Socio ${idx + 1}: ${socio.Nombres_del_Socio || ''} ${socio.Apellidos_del_Socio || ''}, Email: ${socio.Correo_electr_nico_Socio || 'N/A'}`);
            });
          } else if (hasSocios === false || fullAccount.data[0].Socios_LLC === null) {
            this.logger.log(`Socios_LLC es null o no existe (Single Member LLC)`);
          }
        } else {
          this.logger.warn(`No se obtuvieron datos completos para Account ${account.id}`);
        }
      } catch (error: any) {
        this.logger.warn(`Error al obtener Account completo para ${account.id}:`, error.message);
      }

      await this.emitImportProgress(onProgress, {
        phase: 'import',
        current: i + 1,
        total: accounts.length,
        accountId: String(account.id),
        accountName: account.Account_Name,
        ...(fullSyncMeta ? { fullSync: fullSyncMeta } : {}),
      });
      try {
        const result = await this.importAccountToRequest(account, metadata, org);
        if (result.created) {
          results.imported++;
        } else {
          results.updated++;
        }
        results.details.push(result);
      } catch (error: any) {
        results.errors.push({
          accountId: account.id,
          accountName: account.Account_Name,
          error: error.message,
        });
        this.logger.error(`Error al importar Account ${account.id}:`, error);
      }
    }

    this.logger.log(`Obtenidos y procesados ${accounts.length} Accounts de Zoho`);

    return {
      success: true,
      total: accounts.length,
      ...results,
    };
  }

  /**
   * Importa Accounts desde Zoho con subformularios y crea Requests en BD
   */
  async importAccountsFromZoho(
    org: string = 'startcompanies',
    limit: number = 200,
    offset: number = 0,
    onProgress?: (event: ZohoImportAccountsProgressEvent) => void | Promise<void>,
    fullSyncMeta?: ZohoImportFullSyncMeta,
  ) {
    try {
      this.logger.log(`Iniciando importación de Accounts desde Zoho CRM`);
      const metadata = await this.getMetadata(org);
      const coqlQuery = this.buildAccountsImportCoqlQuery(limit, offset);
      this.logger.debug(`Consulta COQL: ${coqlQuery}`);
      const response = await this.zohoCrmService.queryWithCoql(coqlQuery, undefined, org);
      const accounts = response.data || [];

      await this.emitImportProgress(onProgress, {
        phase: 'coql',
        pageTotal: accounts.length,
        offset,
        limit,
        ...(fullSyncMeta ? { fullSync: fullSyncMeta } : {}),
      });

      return await this.processAccountRowsFromCoql(org, accounts, metadata, onProgress, fullSyncMeta);
    } catch (error: any) {
      this.logger.error('Error al importar Accounts desde Zoho:', error);
      throw new HttpException(
        error.message || 'Error al importar Accounts desde Zoho CRM',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Importa un Account específico desde Zoho
   */
  async importAccountById(
    accountId: string,
    org: string = 'startcompanies',
  ) {
    try {
      const metadata = await this.getMetadata(org);
      
      // Obtener Account completo SIN especificar campos para que devuelva TODO (incluyendo subforms)
      // Cuando no se especifican campos, Zoho devuelve automáticamente todos los campos + subformularios
      // Esto asegura que se obtengan todos los datos necesarios
      const accountResponse = await this.zohoCrmService.getRecordById('Accounts', accountId, org, undefined);
      const account = accountResponse.data?.[0];

      if (!account) {
        throw new HttpException(
          `Account ${accountId} no encontrado en Zoho`,
          HttpStatus.NOT_FOUND,
        );
      }

      return await this.importAccountToRequest(account, metadata, org);
    } catch (error: any) {
      this.logger.error(`Error al importar Account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Mapea un Account de Zoho a Request + Members en BD
   */
  private async importAccountToRequest(
    account: any,
    metadata: any,
    org: string,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validar Pick Lists
      if (!this.validatePickListValue(account.Tipo, ['Apertura', 'Renovación', 'Cuenta Bancaria'], 'Tipo')) {
        throw new Error(`Tipo inválido: ${account.Tipo}`);
      }

      if (account.Estructura_Societaria && metadata.accountsPickLists.Estructura_Societaria) {
        if (!this.validatePickListValue(account.Estructura_Societaria, metadata.accountsPickLists.Estructura_Societaria, 'Estructura_Societaria')) {
          this.logger.warn(`Estructura_Societaria inválida: ${account.Estructura_Societaria}, usando valor por defecto`);
        }
      }

      // Mapear Tipo de Zoho a tipo de Request
      const requestType = this.mapZohoTipoToRequestType(account.Tipo);
      if (!requestType) {
        throw new Error(`Tipo no soportado: ${account.Tipo}`);
      }

      // Buscar Request existente por zohoAccountId o Account_Name
      let existingRequest = await this.requestRepository.findOne({
        where: { zohoAccountId: account.id },
        relations: ['aperturaLlcRequest', 'renovacionLlcRequest', 'cuentaBancariaRequest'],
      });

      // Si no existe por zohoAccountId, buscar por Account_Name en las tablas específicas
      if (!existingRequest) {
        if (requestType === 'apertura-llc') {
          const apertura = await this.aperturaRepo.findOne({
            where: { llcName: account.Account_Name },
            relations: ['request'],
          });
          if (apertura?.request) {
            // Recargar Request con todas sus relaciones
            existingRequest = await this.requestRepository.findOne({
              where: { id: apertura.request.id },
              relations: ['aperturaLlcRequest', 'renovacionLlcRequest', 'cuentaBancariaRequest'],
            });
          }
        } else if (requestType === 'renovacion-llc') {
          const renovacion = await this.renovacionRepo.findOne({
            where: { llcName: account.Account_Name },
            relations: ['request'],
          });
          if (renovacion?.request) {
            // Recargar Request con todas sus relaciones
            existingRequest = await this.requestRepository.findOne({
              where: { id: renovacion.request.id },
              relations: ['aperturaLlcRequest', 'renovacionLlcRequest', 'cuentaBancariaRequest'],
            });
          }
        } else if (requestType === 'cuenta-bancaria') {
          // Por legal_business_identifier (applicant_email fue eliminado de la tabla en migración)
          const cuenta = await this.cuentaRepo
            .createQueryBuilder('c')
            .leftJoinAndSelect('c.request', 'request')
            .where('c.legal_business_identifier = :name', {
              name: account.Account_Name,
            })
            .getOne();
          if (cuenta?.request) {
            // Recargar Request con todas sus relaciones
            existingRequest = await this.requestRepository.findOne({
              where: { id: cuenta.request.id },
              relations: ['aperturaLlcRequest', 'renovacionLlcRequest', 'cuentaBancariaRequest'],
            });
          }
        }
      }

      const isNew = !existingRequest;

      // Crear o actualizar Request base
      let request: Request;
      if (existingRequest) {
        request = existingRequest;
        request.zohoAccountId = account.id;
        // Actualizar company desde Zoho si viene
        if (account.Empresa) {
          request.company = account.Empresa;
        }
      } else {
        request = this.requestRepository.create({
          type: requestType,
          status: 'pendiente', // Se actualizará con el Deal
          zohoAccountId: account.id,
          company: account.Empresa || 'Start Companies',
        });
      }

      // PRIMERO: Partner (si aplica), luego Deal → User cliente y fila en `clients` (FK requests.client_id)
      // Nota: En este flujo de sync Zoho -> BD NO se envían correos de bienvenida.
      let partnerUserId: number | undefined;

      if (account.Empresa === 'Partner') {
        if (!account.Partner_Email) {
          throw new Error(`Account ${account.id} tiene Empresa=Partner pero no tiene Partner_Email`);
        }

        let partnerUser = await this.userRepo.findOne({
          where: { email: account.Partner_Email },
        });

        if (!partnerUser) {
          let username = account.Partner_Email.split('@')[0];
          let existingUserByUsername = await queryRunner.manager.findOne(User, {
            where: { username },
          });
          let counter = 1;
          while (existingUserByUsername) {
            username = `${account.Partner_Email.split('@')[0]}${counter}`;
            existingUserByUsername = await queryRunner.manager.findOne(User, {
              where: { username },
            });
            counter++;
          }

          const defaultPassword = this.generateTemporaryPassword();
          const hashedPassword = encodePassword(defaultPassword);

          partnerUser = queryRunner.manager.create(User, {
            username,
            email: account.Partner_Email,
            password: hashedPassword,
            phone: this.normalizePhoneNumber(account.Partner_Phone) || '',
            type: 'partner',
            status: true,
          });

          partnerUser = await queryRunner.manager.save(User, partnerUser);
          if (partnerUser) {
            this.logger.log(`Usuario partner creado: ${partnerUser.id}`);
          }
        }

        if (partnerUser) {
          request.partnerId = partnerUser.id;
          partnerUserId = partnerUser.id;
        }
      }

      if (account.Empresa === 'Partner' && partnerUserId == null) {
        throw new Error(`No se pudo obtener/crear usuario partner para Account ${account.id}`);
      }

      // Si hay Deal en Zoho, debe existir Contact_Name y poder cargarse; el cliente es ese Contact (correo vacío se puede completar desde Account).
      let contactEmail = '';
      let contactPhone = '';
      let contactFirstName = '';
      let contactLastName = '';
      let dealContactLoaded = false;
      let dealStage: string | undefined = undefined;

      let deals: Record<string, unknown>[] = [];
      try {
        const dealCoqlQuery = `SELECT Contact_Name, Stage FROM Deals WHERE Account_Name.id = '${account.id}' ORDER BY Modified_Time DESC LIMIT 1`;
        const dealsResponse = await this.zohoCrmService.queryWithCoql(dealCoqlQuery, undefined, org);
        deals = dealsResponse.data || [];
      } catch (dealCoqlError: any) {
        this.logger.warn(
          `No se pudo consultar Deals para Account ${account.id}: ${dealCoqlError.message}. Se intentará importar solo con datos del Account.`,
        );
      }

      if (deals.length > 0) {
        const deal = deals[0];
        dealStage = this.normalizeZohoDealStage(deal);

        if (!deal.Contact_Name) {
          throw new Error(
            `Account ${account.id}: el Deal más reciente debe tener un Contact asignado (Contact_Name) en Zoho. Corrige el Deal e importa de nuevo.`,
          );
        }

        const contactId =
          typeof deal.Contact_Name === 'object'
            ? (deal.Contact_Name as { id?: string }).id
            : deal.Contact_Name;

        if (!contactId) {
          throw new Error(
            `Account ${account.id}: Contact_Name del Deal no tiene id válido. Revisa el lookup en Zoho.`,
          );
        }

        let contactResponse: { data?: Record<string, unknown>[] };
        try {
          contactResponse = await this.zohoCrmService.getRecordById(
            'Contacts',
            String(contactId),
            org,
            undefined,
          );
        } catch (contactError: any) {
          throw new Error(
            `Account ${account.id}: no se pudo cargar el Contact ${contactId} del Deal: ${contactError.message}`,
          );
        }

        if (!contactResponse.data?.length) {
          throw new Error(
            `Account ${account.id}: el Contact ${contactId} enlazado al Deal no existe o no es accesible en Zoho.`,
          );
        }

        const contact = contactResponse.data[0];
        const zohoContactText = (v: unknown) =>
          v == null || v === '' ? '' : String(v);
        contactEmail =
          zohoContactText(contact.Email) ||
          zohoContactText(contact.Secondary_Email) ||
          zohoContactText(contact.Secondary_Email_1);
        contactPhone = zohoContactText(contact.Phone) || zohoContactText(contact.Mobile);
        contactFirstName = zohoContactText(contact.First_Name);
        contactLastName = zohoContactText(contact.Last_Name);
        dealContactLoaded = true;

        this.logger.log(
          `Cliente desde Contact del Deal (Contact_Name id=${contactId}) para Account ${account.id}: email=${contactEmail || '(vacío)'}`,
        );
      }

      if (dealContactLoaded) {
        contactEmail = (contactEmail || '').trim();
        if (!contactEmail) {
          contactEmail = this.mergeEmailFromAccountIfMissing(account, contactEmail);
        }
      } else {
        const mergedContact = this.mergeClientContactFromAccountFields(account, {
          contactEmail,
          contactPhone,
          contactFirstName,
          contactLastName,
        });
        contactEmail = mergedContact.contactEmail;
        contactPhone = mergedContact.contactPhone;
        contactFirstName = mergedContact.contactFirstName;
        contactLastName = mergedContact.contactLastName;
      }

      if (!contactEmail) {
        throw new Error(
          dealContactLoaded
            ? `Account ${account.id}: el Contact del Deal no tiene correo y no hay correo en Account/subform para completar. Se omite la migración.`
            : `Account ${account.id} no tiene correo identificable (no hay Deal o no se pudo consultar; use Contacto Principal LLC / Account). Se omite la migración.`,
        );
      }

      const normalizedContactPhone = this.normalizePhoneNumber(contactPhone) || '';
      const resolvedFullName = dealContactLoaded
        ? `${contactFirstName} ${contactLastName}`.trim() || contactEmail
        : `${contactFirstName} ${contactLastName}`.trim() ||
          `${account.Nombre_s || ''} ${account.Apellidos || ''}`.trim() ||
          contactEmail;
      const resolvedFirstName = dealContactLoaded
        ? (contactFirstName || '').trim()
        : (contactFirstName || '').trim() || (account.Nombre_s || '').trim();
      const resolvedLastName = dealContactLoaded
        ? (contactLastName || '').trim()
        : (contactLastName || '').trim() || (account.Apellidos || '').trim();

      // Stage del Deal aplica a los tres tipos; renovación usa alias para vista cliente
      if (dealStage) {
        const stageForRequest =
          requestType === 'renovacion-llc'
            ? applyRenovacionClientStageAlias(dealStage)
            : dealStage;
        request.stage = stageForRequest;
        if (requestType === 'renovacion-llc' && stageForRequest !== dealStage) {
          this.logger.log(
            `Stage guardado (alias cliente): ${stageForRequest} (Zoho: ${dealStage}) para Account ${account.id}`,
          );
        } else {
          this.logger.log(`Stage del Deal guardado en Request: ${stageForRequest} para Account ${account.id}`);
        }
      }

      let clientUser = await this.userRepo.findOne({
        where: { email: contactEmail },
      });

      if (!clientUser) {
        let username = contactEmail.split('@')[0];
        let existingUserByUsername = await queryRunner.manager.findOne(User, {
          where: { username },
        });
        let counter = 1;
        while (existingUserByUsername) {
          username = `${contactEmail.split('@')[0]}${counter}`;
          existingUserByUsername = await queryRunner.manager.findOne(User, {
            where: { username },
          });
          counter++;
        }

        const defaultPassword = this.generateTemporaryPassword();
        const hashedPassword = encodePassword(defaultPassword);

        clientUser = queryRunner.manager.create(User, {
          username,
          email: contactEmail,
          password: hashedPassword,
          first_name: resolvedFirstName,
          last_name: resolvedLastName,
          phone: normalizedContactPhone,
          type: 'client',
          status: true,
        });

        clientUser = await queryRunner.manager.save(User, clientUser);
        if (clientUser) {
          this.logger.log(`Usuario cliente creado: ${clientUser.id} (desde Deal)`);
        }
      } else {
        let userUpdated = false;
        if (resolvedFirstName && clientUser.first_name !== resolvedFirstName) {
          clientUser.first_name = resolvedFirstName;
          userUpdated = true;
        }
        if (resolvedLastName && clientUser.last_name !== resolvedLastName) {
          clientUser.last_name = resolvedLastName;
          userUpdated = true;
        }
        if (normalizedContactPhone && clientUser.phone !== normalizedContactPhone) {
          clientUser.phone = normalizedContactPhone;
          userUpdated = true;
        }
        if (userUpdated) {
          clientUser = await queryRunner.manager.save(User, clientUser);
          this.logger.log(`Usuario cliente ${clientUser.id} actualizado desde Contact/Account (sync Zoho)`);
        }
      }

      if (!clientUser) {
        throw new Error(`No se pudo obtener/crear usuario cliente para Account ${account.id}`);
      }

      let clientRow = await queryRunner.manager.findOne(Client, {
        where: { email: contactEmail },
      });
      if (!clientRow) {
        clientRow = await queryRunner.manager.findOne(Client, {
          where: { userId: clientUser.id },
        });
      }
      if (!clientRow) {
        clientRow = queryRunner.manager.create(Client, {
          email: contactEmail,
          full_name: resolvedFullName,
          phone: normalizedContactPhone,
          userId: clientUser.id,
          partnerId: partnerUserId,
          status: true,
        });
        clientRow = await queryRunner.manager.save(Client, clientRow);
        this.logger.log(`Cliente (tabla clients) creado en sync Zoho: ${clientRow.id} — ${contactEmail}`);
      } else {
        let updated = false;
        if (!clientRow.userId) {
          clientRow.userId = clientUser.id;
          updated = true;
        }
        if (partnerUserId && !clientRow.partnerId) {
          clientRow.partnerId = partnerUserId;
          updated = true;
        }
        if (resolvedFullName && clientRow.full_name !== resolvedFullName) {
          clientRow.full_name = resolvedFullName;
          updated = true;
        }
        if (normalizedContactPhone && clientRow.phone !== normalizedContactPhone) {
          clientRow.phone = normalizedContactPhone;
          updated = true;
        }
        if (updated) {
          clientRow = await queryRunner.manager.save(Client, clientRow);
        }
      }

      request.clientId = clientRow.id;

      // Generar permalink si Account tiene workDriveId Y el Request no tiene workDriveUrlExternal
      if (account.workDriveId && !request.workDriveUrlExternal) {
        try {
          this.logger.log(`Generando permalink para workDriveId: ${account.workDriveId} (Account ${account.id})`);
          // No pasar org, dejar que el servicio busque cualquier configuración de WorkDrive disponible
          const permalink = await this.zohoWorkDriveService.generateEmbedPermalink(
            account.workDriveId,
          );
          // Guardar el permalink completo tal como viene de la API
          request.workDriveUrlExternal = permalink;
          this.logger.log(`Permalink completo guardado para Account ${account.id}: ${permalink}`);
          this.logger.log(`Longitud de la URL guardada: ${permalink.length} caracteres`);
        } catch (error: any) {
          this.logger.warn(
            `Error al generar permalink para workDriveId ${account.workDriveId} (Account ${account.id}):`,
            error.message,
          );
          // Si falla, intentar usar workDriveUrlExternal directamente si existe
          if (account.workDriveUrlExternal) {
            request.workDriveUrlExternal = account.workDriveUrlExternal;
            this.logger.log(`Usando workDriveUrlExternal directo desde Account ${account.id}: ${account.workDriveUrlExternal}`);
          }
        }
      } else if (account.workDriveUrlExternal && !request.workDriveUrlExternal) {
        // Si no hay workDriveId pero sí workDriveUrlExternal, y el Request no tiene uno, usarlo directamente
        request.workDriveUrlExternal = account.workDriveUrlExternal;
        this.logger.log(`WorkDrive URL externa guardada para Account ${account.id}: ${account.workDriveUrlExternal}`);
      } else if (request.workDriveUrlExternal) {
        this.logger.log(`Request ${request.id} ya tiene workDriveUrlExternal, no se regenerará: ${request.workDriveUrlExternal}`);
      }

      // Guardar Request (ahora con clientId y workDriveUrlExternal)
      request = await queryRunner.manager.save(Request, request);

      // Crear o actualizar Request específico según tipo (después de guardar para tener request.id)
      if (requestType === 'apertura-llc') {
        await this.mapAccountToAperturaRequest(account, request, queryRunner);
      } else if (requestType === 'renovacion-llc') {
        await this.mapAccountToRenovacionRequest(account, request, queryRunner);
      } else if (requestType === 'cuenta-bancaria') {
        await this.mapAccountToCuentaRequest(account, request, queryRunner);
      }

      // Procesar Members desde subformularios (después de guardar Request para tener request.id)
      await this.processMembersFromAccount(account, request, queryRunner, org);

      await queryRunner.commitTransaction();

      // Obtener Deals relacionados y actualizar status y stage
      await this.updateRequestStatusFromDeals(request, org);

      return {
        created: isNew,
        requestId: request.id,
        accountId: account.id,
        accountName: account.Account_Name,
      };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }


  /**
   * Sincroniza múltiples solicitudes a Zoho
   */
  async syncMultipleRequestsToZoho(
    requestIds: number[],
    org: string = 'startcompanies',
  ) {
    const results: Array<{ requestId: number; [key: string]: any }> = [];
    const errors: Array<{ requestId: number; error: string }> = [];

    for (const requestId of requestIds) {
      try {
        const result = await this.syncRequestToZoho(requestId, org);
        results.push({ requestId, ...result });
      } catch (error: any) {
        errors.push({
          requestId,
          error: error.message,
        });
        this.logger.error(`Error al sincronizar solicitud ${requestId}:`, error);
      }
    }

    return {
      success: true,
      synced: results.length,
      failed: errors.length,
      results,
      errors,
    };
  }

  /**
   * Sincroniza desde Zoho a BD: stage, status y workDriveUrlExternal para la Request
   * vinculada al zohoAccountId (Account CRM). Reutiliza Deals + Account como en importación.
   */
  async syncStageStatusAndWorkdriveByAccountId(
    zohoAccountId: string,
    org: string = 'startcompanies',
  ) {
    const request = await this.requestRepository.findOne({
      where: { zohoAccountId },
    });
    if (!request) {
      throw new HttpException(
        `No se encontró Request con zohoAccountId ${zohoAccountId}`,
        HttpStatus.NOT_FOUND,
      );
    }

    await this.updateRequestStatusFromDeals(request, org);

    const refreshed = await this.requestRepository.findOne({
      where: { id: request.id },
    });
    if (!refreshed) {
      throw new HttpException(
        `Request ${request.id} no encontrada tras sincronización`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      success: true,
      requestId: refreshed.id,
      zohoAccountId: refreshed.zohoAccountId,
      type: refreshed.type,
      status: refreshed.status,
      stage: refreshed.stage ?? null,
      workDriveUrlExternal: refreshed.workDriveUrlExternal ?? null,
    };
  }

  /**
   * Mapea el Tipo de Zoho al tipo de Request
   */
  private mapZohoTipoToRequestType(tipo: string): 'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria' | null {
    const typeMap: Record<string, 'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria'> = {
      'Apertura': 'apertura-llc',
      'Renovación': 'renovacion-llc',
      'Cuenta Bancaria': 'cuenta-bancaria',
    };
    return typeMap[tipo] || null;
  }

  /**
   * Mapea Account a AperturaLlcRequest
   */
  private async mapAccountToAperturaRequest(
    account: any,
    request: Request,
    queryRunner: any,
  ) {
    let apertura = request.aperturaLlcRequest;
    
    const aperturaData: Partial<AperturaLlcRequest> = {
      requestId: request.id,
      currentStepNumber: 1,
      // Mapeo según campos proporcionados
      llcName: account.Account_Name || '',
      businessDescription: account.Actividad_Principal_de_la_LLC || '',
      incorporationState: account.Estado_de_Registro || '',
      llcType: this.mapEstructuraToLLCType(account.Estructura_Societaria),
      projectOrCompanyUrl: account.P_gina_web_de_la_LLC || account.Website || undefined, // Mapear a projectOrCompanyUrl según CSV
      llcNameOption2: account.Nombre_de_la_LLC_Opci_n_2 || undefined,
      llcNameOption3: account.Nombre_de_la_LLC_Opci_n_3 || undefined,
      linkedin: account.LinkedIn || undefined,
      actividadFinancieraEsperada: account.Actividad_financiera_esperada || undefined,
      bankAccountLinkedEmail: account.Correo_Electr_nico_Vinculado_a_la_Cuenta_Bancaria || undefined,
      bankAccountLinkedPhone: account.N_mero_de_Tel_fono_Vinculado_a_la_Cuenta_Bancaria || undefined,
      periodicIncome10k: this.parseBoolean(account.Tendr_ingresos_peri_dicos_que_sumen_USD_10_000) ? 'si' : 'no',
    };

    if (apertura) {
      Object.assign(apertura, aperturaData);
      await queryRunner.manager.save(AperturaLlcRequest, apertura);
    } else {
      apertura = queryRunner.manager.create(AperturaLlcRequest, aperturaData);
      await queryRunner.manager.save(AperturaLlcRequest, apertura);
      request.aperturaLlcRequest = apertura;
    }
  }

  /**
   * Mapea Account a RenovacionLlcRequest
   */
  private async mapAccountToRenovacionRequest(
    account: any,
    request: Request,
    queryRunner: any,
  ) {
    let renovacion = request.renovacionLlcRequest;
    
    // Para Renovación, obtener contacto desde subform Contacto_Principal_LLC
    let contactEmail = '';
    let contactPhone = '';
    
    if (account.Contacto_Principal_LLC && Array.isArray(account.Contacto_Principal_LLC) && account.Contacto_Principal_LLC.length > 0) {
      const propietario = account.Contacto_Principal_LLC[0];
      contactEmail = propietario.Correo_electr_nico_Propietario || account.Correo_electr_nico || '';
      contactPhone = propietario.Tel_fono_Contacto_Propietario || account.Phone || '';
    } else {
      contactEmail = account.Correo_electr_nico || '';
      contactPhone = account.Phone || '';
    }
    
    // Parsear countriesWhereLLCDoesBusiness desde string o array
    let countriesWhereLLCDoesBusiness: string[] | undefined = undefined;
    if (account.Pa_ses_donde_la_LLC_realiza_negocios) {
      if (Array.isArray(account.Pa_ses_donde_la_LLC_realiza_negocios)) {
        countriesWhereLLCDoesBusiness = account.Pa_ses_donde_la_LLC_realiza_negocios;
      } else if (typeof account.Pa_ses_donde_la_LLC_realiza_negocios === 'string') {
        countriesWhereLLCDoesBusiness = account.Pa_ses_donde_la_LLC_realiza_negocios
          .split(',')
          .map(c => c.trim())
          .filter(c => c.length > 0);
      }
    }

    const renovacionData: Partial<RenovacionLlcRequest> = {
      requestId: request.id,
      currentStepNumber: 1,
      // Campos según mapeo proporcionado
      llcName: account.Account_Name || '',
      state: account.Estado_de_Registro || '',
      mainActivity: account.Actividad_Principal_de_la_LLC || '',
      einNumber: account.N_mero_de_EIN || '',
      llcType: this.mapEstructuraToLLCType(account.Estructura_Societaria),
      // Campos booleanos - mapear desde picklist (Sí/No) a string
      hasPropertyInUSA: this.parseBooleanToPickListString(account.Tu_empresa_posee_o_renta_una_propiedad_en_EE_UU),
      almacenaProductosDepositoUSA: this.parseBooleanToPickListString(account.Almacena_productos_en_un_dep_sito_en_EE_UU),
      contrataServiciosUSA: this.parseBooleanToPickListString(account.Tu_empresa_contrata_servicios_en_EE_UU),
      tieneCuentasBancarias: this.parseBooleanToPickListString(account.Tu_LLC_tiene_cuentas_bancarias_a_su_nombre),
      hasFinancialInvestmentsInUSA: this.parseBooleanToPickListString(account.Posee_la_LLC_inversiones_o_activos_en_EE_UU),
      hasFiledTaxesBefore: this.parseBooleanToPickListString(account.La_LLC_declar_impuestos_anteriormente),
      wasConstitutedWithStartCompanies: this.parseBooleanToPickListString(account.La_LLC_se_constituy_con_Start_Companies),
      // Campos adicionales
      llcCreationDate: account.Fecha_de_Constituci_n ? new Date(account.Fecha_de_Constituci_n) : undefined,
      countriesWhereLLCDoesBusiness: countriesWhereLLCDoesBusiness,
      // Campos de declaraciones
      declaracionAnoCorriente: account.A_o_de_la_Declaraci_n_Fiscal === '2025' || account.A_o_de_la_Declaraci_n_Fiscal === '2025' ? true : undefined,
      cambioNombre: account.Nuevo_nombre_de_la_LLC ? true : undefined,
      declaracionAnosAnteriores: this.parseBoolean(account.Declaraciones_Juradas_Anteriores),
      // Campos numéricos
      llcOpeningCost: account.Cu_nto_cost_abrir_la_LLC_en_Estados_Unidos ? parseFloat(account.Cu_nto_cost_abrir_la_LLC_en_Estados_Unidos) : undefined,
      paidToFamilyMembers: account.Pagos_a_familiares_servicios ? parseFloat(account.Pagos_a_familiares_servicios) : undefined,
      paidToLocalCompanies: account.Cu_nto_pag_la_LLC_a_empresas_locales_En_otro_Pa ? parseFloat(account.Cu_nto_pag_la_LLC_a_empresas_locales_En_otro_Pa) : undefined,
      paidForLLCFormation: account.Pagos_formaci_n_LLC_tasas_estatales ? parseFloat(account.Pagos_formaci_n_LLC_tasas_estatales) : undefined,
      paidForLLCDissolution: account.Pagos_disoluci_n_LLC ? parseFloat(account.Pagos_disoluci_n_LLC) : undefined,
      bankAccountBalanceEndOfYear: account.Saldo_bancario_fin_de_a_o_LLC ? parseFloat(account.Saldo_bancario_fin_de_a_o_LLC) : undefined,
      totalRevenue: account.Facturaci_n_total_de_la_LLC ? parseFloat(account.Facturaci_n_total_de_la_LLC) : undefined,
    };

    if (renovacion) {
      Object.assign(renovacion, renovacionData);
      await queryRunner.manager.save(RenovacionLlcRequest, renovacion);
    } else {
      renovacion = queryRunner.manager.create(RenovacionLlcRequest, renovacionData);
      await queryRunner.manager.save(RenovacionLlcRequest, renovacion);
      request.renovacionLlcRequest = renovacion;
    }
  }

  /**
   * Mapea Account a CuentaBancariaRequest
   */
  private async mapAccountToCuentaRequest(
    account: any,
    request: Request,
    queryRunner: any,
  ) {
    let cuenta = request.cuentaBancariaRequest;
    
    // Para Cuenta Bancaria, el Contacto Principal viene del Account principal (Nombre_s, Apellidos, Email_Laboral, Phone)
    // y también del subform Contacto_Principal_LLC
    // Priorizar datos del subform si existen, sino usar del Account principal
    let contactFirstName = '';
    let contactLastName = '';
    let contactEmail = '';
    let contactPhone = '';
    
    if (account.Contacto_Principal_LLC && Array.isArray(account.Contacto_Principal_LLC) && account.Contacto_Principal_LLC.length > 0) {
      const propietario = account.Contacto_Principal_LLC[0];
      contactFirstName = propietario.Nombres_del_propietario || account.Nombre_s || '';
      contactLastName = propietario.Apellidos_del_propietario || account.Apellidos || '';
      contactEmail = propietario.Correo_electr_nico_Propietario || account.Email_Laboral || account.Correo_electr_nico || '';
      contactPhone = propietario.Tel_fono_Contacto_Propietario || account.Phone || '';
    } else {
      // Usar datos del Account principal
      contactFirstName = account.Nombre_s || '';
      contactLastName = account.Apellidos || '';
      contactEmail = account.Email_Laboral || account.Correo_electr_nico || '';
      contactPhone = account.Phone || '';
    }
    
    // Parsear countriesWhereBusiness desde string o array
    let countriesWhereBusiness: string | undefined = undefined;
    if (account.Pa_ses_donde_la_LLC_realiza_negocios) {
      if (Array.isArray(account.Pa_ses_donde_la_LLC_realiza_negocios)) {
        countriesWhereBusiness = account.Pa_ses_donde_la_LLC_realiza_negocios.join(', ');
      } else if (typeof account.Pa_ses_donde_la_LLC_realiza_negocios === 'string') {
        countriesWhereBusiness = account.Pa_ses_donde_la_LLC_realiza_negocios;
      }
    }

    const cuentaData: Partial<CuentaBancariaRequest> = {
      requestId: request.id,
      currentStepNumber: 1,
      // Campos según mapeo proporcionado
      legalBusinessIdentifier: account.Account_Name || '',
      businessType: account.Tipo_de_negocio || undefined,
      industry: account.Industria_Rubro || undefined,
      numberOfEmployees: account.Cantidad_de_empleados || undefined,
      economicActivity: account.Descripci_n_breve || undefined,
      websiteOrSocialMedia: account.Sitio_web_o_Red_Social || undefined,
      llcType: this.mapEstructuraToLLCType(account.Estructura_Societaria),
      // Dirección comercial (Registered Agent) - campos individuales
      registeredAgentStreet: account.Direcci_n_comercial_Calle_y_numero || account.Calle_y_n_mero || undefined,
      registeredAgentUnit: account.Direcci_n_comercial_Suite || account.Suite_Apto || undefined,
      registeredAgentCity: account.Direcci_n_comercial_Ciudad || account.Ciudad || undefined,
      registeredAgentState: account.Direcci_n_comercial_Estado || account.Estado_Provincia || undefined,
      registeredAgentZipCode: account.Direcci_n_comercial_Postal || account.Postal_Zip_Code || undefined,
      registeredAgentCountry: account.Direcci_n_postal_Pais || account.Pais || undefined,
      // Información adicional
      ein: account.N_mero_de_EIN || undefined,
      bankService: account.Banco || 'Relay', // Banco: Relay o Mercury, por defecto Relay
      incorporationState: account.Estado_de_constituci_n || account.Estado_de_Registro || undefined,
      incorporationMonthYear: account.Mes_y_A_o || undefined,
      countriesWhereBusiness: countriesWhereBusiness,
      // Dirección personal del propietario (desde campos del Account principal)
      // Nota: Estos campos también se usan para la dirección comercial, pero según el CSV
      // la dirección personal del propietario se mapea a estos mismos campos en Zoho
      ownerPersonalAddress: (account.Calle_y_n_mero || account.Ciudad) && !account.Direcci_n_comercial_Calle_y_numero ? {
        street: account.Calle_y_n_mero || '',
        unit: account.Suite_Apto || undefined,
        city: account.Ciudad || '',
        state: account.Estado_Provincia || '',
        postalCode: account.Postal_Zip_Code || '',
        country: account.Pais || '',
      } : undefined,
    };

    if (cuenta) {
      Object.assign(cuenta, cuentaData);
      await queryRunner.manager.save(CuentaBancariaRequest, cuenta);
    } else {
      cuenta = queryRunner.manager.create(CuentaBancariaRequest, cuentaData);
      await queryRunner.manager.save(CuentaBancariaRequest, cuenta);
      request.cuentaBancariaRequest = cuenta;
    }
  }

  /**
   * Mapea Estructura_Societaria a llcType
   */
  private mapEstructuraToLLCType(estructura: string | null | undefined): 'single' | 'multi' {
    if (!estructura) return 'single';
    if (estructura.includes('single') || estructura.includes('solo miembro')) {
      return 'single';
    }
    if (
      estructura.includes('multi') ||
      estructura.includes('multi-miembro') ||
      estructura.includes('múltiples') ||
      estructura.includes('múltiples miembros')
    ) {
      return 'multi';
    }
    return 'single'; // Default
  }

  /**
   * Procesa Members desde subformularios del Account
   */
  private async processMembersFromAccount(
    account: any,
    request: Request,
    queryRunner: any,
    org: string,
  ) {
    // Deshabilitar temporalmente el trigger de validación de porcentajes
    // para permitir eliminar y guardar miembros sin validación durante la importación
    // Los triggers se mantendrán deshabilitados durante todo el proceso
    try {
      await queryRunner.query('ALTER TABLE members DISABLE TRIGGER ALL');
      this.logger.log(`Triggers deshabilitados para procesamiento de miembros (Request ${request.id})`);
    } catch (error: any) {
      this.logger.warn(`No se pudo deshabilitar triggers (puede que no existan): ${error.message}`);
    }

    try {
      // Eliminar Members existentes para este Request
      await queryRunner.manager.delete(Member, { requestId: request.id });
      
      const members: Member[] = [];

      // Prioridad 1: Propietarios_LLC (nuevo módulo)
      const accountId = account.id || request.zohoAccountId;
      if (accountId) {
        try {
          const propietarios = await this.getPropietariosLlcByAccountId(accountId, org);
          if (propietarios.length > 0) {
            this.logger.log(`Propietarios_LLC encontrado para Account ${accountId}: ${propietarios.length} registro(s)`);

            const sortedPropietarios = [...propietarios].sort((a, b) => {
              const aPrimary = this.parseBoolean(a.Es_propietario_Primario) ? 1 : 0;
              const bPrimary = this.parseBoolean(b.Es_propietario_Primario) ? 1 : 0;
              return bPrimary - aPrimary;
            });

            for (const propietario of sortedPropietarios) {
              const member = queryRunner.manager.create(Member, {
                requestId: request.id,
                firstName: propietario.Nombres || '',
                lastName: propietario.Apellidos || '',
                email: propietario.Email || propietario.Secondary_Email || '',
                phoneNumber: this.normalizePhoneNumber(propietario.Tel_fono) || '',
                passportNumber: propietario.N_mero_de_pasaporte || '',
                nationality: propietario.Nacionalidad || propietario.Ciudadania || '',
                dateOfBirth: propietario.Fecha_de_nacimiento
                  ? new Date(propietario.Fecha_de_nacimiento)
                  : new Date(),
                percentageOfParticipation: propietario.Porcentaje_Participacion
                  ? parseFloat(propietario.Porcentaje_Participacion)
                  : (this.parseBoolean(propietario.Es_propietario_Primario) ? 100 : 0),
                memberAddress: {
                  street: propietario.Calle_y_n_mero_exterior || '',
                  unit: propietario.Apartamento_Suite || '',
                  city: propietario.Ciudad || '',
                  stateRegion: propietario.Estado || '',
                  postalCode: propietario.Codigo_postal || '',
                  country: propietario.Pa_s || '',
                },
                ssnOrItin: propietario.SSN_ITIN || null,
                nationalTaxId: propietario.ID_Fiscal_Nacional || null,
                taxFilingCountry: propietario.Pais_Declaracion_Impuestos || propietario.Pa_s_bajo_cuyas_leyes_el_propietario_presenta_impu || null,
                ownerContributions: propietario.Aportes_de_Capital
                  ? parseFloat(propietario.Aportes_de_Capital)
                  : null,
                ownerLoansToLLC: propietario.Prestamos_a_LLC
                  ? parseFloat(propietario.Prestamos_a_LLC)
                  : null,
                loansReimbursedByLLC: propietario.Prestamos_Reembolsados
                  ? parseFloat(propietario.Prestamos_Reembolsados)
                  : null,
                profitDistributions: propietario.Distribuciones_Retiros || propietario.Retiros_de_Capital
                  ? parseFloat(propietario.Distribuciones_Retiros || propietario.Retiros_de_Capital)
                  : null,
                spentMoreThan31DaysInUS: this.parseZohoBooleanToMemberValue(propietario.Mas_de_31_dias_en_EEUU),
                hasUSFinancialInvestments: this.parseZohoBooleanToMemberValue(propietario.Posee_Activos_en_EEUU),
                isUSCitizen: this.parseZohoBooleanToMemberValue(propietario.Ciudadano_EEUU),
              });
              members.push(member);
            }

            if (members.length > 0) {
              await queryRunner.manager.save(Member, members);
              this.logger.log(`Members creados desde Propietarios_LLC: ${members.length} (Request ${request.id})`);
              return;
            }
          }
          this.logger.log(`Sin registros en Propietarios_LLC para Account ${accountId}; se usará fallback a subforms`);
        } catch (propError: any) {
          this.logger.warn(`Error consultando Propietarios_LLC para Account ${accountId}: ${propError.message}. Se continuará con fallback.`);
        }
      }

    // Log para validar que se están obteniendo los subforms
    this.logger.log(`Procesando miembros para Request ${request.id} - Account ${account.id || account.Account_Name}`);
    this.logger.log(`Contacto_Principal_LLC presente: ${!!account.Contacto_Principal_LLC}, tipo: ${Array.isArray(account.Contacto_Principal_LLC) ? 'array' : typeof account.Contacto_Principal_LLC}, longitud: ${Array.isArray(account.Contacto_Principal_LLC) ? account.Contacto_Principal_LLC.length : 'N/A'}`);
    this.logger.log(`Socios_LLC presente: ${!!account.Socios_LLC}, tipo: ${Array.isArray(account.Socios_LLC) ? 'array' : typeof account.Socios_LLC}, longitud: ${Array.isArray(account.Socios_LLC) ? account.Socios_LLC.length : 'N/A'}`);

    // Procesar Contacto_Principal_LLC
    if (account.Contacto_Principal_LLC && Array.isArray(account.Contacto_Principal_LLC) && account.Contacto_Principal_LLC.length > 0) {
      const propietario = account.Contacto_Principal_LLC[0];
      
      // Log de los datos del propietario
      this.logger.log(`Procesando Contacto Principal: ${propietario.Nombres_del_propietario || ''} ${propietario.Apellidos_del_propietario || ''}`);
      
      // Determinar email y phone según Empresa y tipo de request
      let email: string;
      let phone: string;
      
      // Para Cuenta Bancaria, puede venir del Account principal o del subform
      if (request.type === 'cuenta-bancaria') {
        email = propietario.Correo_electr_nico_Propietario || account.Email_Laboral || account.Correo_electr_nico || '';
        phone = propietario.Tel_fono_Contacto_Propietario || account.Phone || '';
      } else if (account.Empresa === 'Partner') {
        // Para Apertura y Renovación con Partner
        email = account.Partner_Email || propietario.Correo_electr_nico_Propietario || '';
        phone = account.Partner_Phone || propietario.Tel_fono_Contacto_Propietario || '';
      } else {
        // Para Apertura y Renovación sin Partner
        email = propietario.Correo_electr_nico_Propietario || '';
        phone = propietario.Tel_fono_Contacto_Propietario || '';
      }

      const primaryMember = queryRunner.manager.create(Member, {
        requestId: request.id,
        firstName: propietario.Nombres_del_propietario || '',
        lastName: propietario.Apellidos_del_propietario || '',
        email: email,
        phoneNumber: phone,
        passportNumber: propietario.Nro_de_pasaporte_Propietario || propietario.N_mero_de_pasaporte_Propietario || '',
        nationality: propietario.Nacionalidad_Propietario || '',
        dateOfBirth: propietario.Fecha_Nacimiento_Propietario
          ? new Date(propietario.Fecha_Nacimiento_Propietario)
          : new Date(),
        percentageOfParticipation: propietario.Porcentaje_Participaci_n_Princ
          ? parseFloat(propietario.Porcentaje_Participaci_n_Princ)
          : 100,
        memberAddress: {
          street: propietario.Calle_y_n_mero_exterior_altura || '',
          unit: propietario.N_mero_interior_departamento_P || '',
          city: propietario.Ciudad_Propietario || '',
          stateRegion: propietario.Estado_Regi_n_Provincia_Prop || '',
          postalCode: propietario.C_digo_postal_Propietario || '',
          country: propietario.Pa_s_de_Residencia_Propietario || '',
        },
        ssnOrItin: propietario.N_mero_de_SSN_ITIN || null,
        nationalTaxId: propietario.ID_Fiscal_Nacional_CUIT || null,
        taxFilingCountry: propietario.Pa_s_donde_paga_impuestos || null,
        ownerContributions: propietario.Contribuciones_de_capital_realizadas_en_2024_USD
          ? parseFloat(propietario.Contribuciones_de_capital_realizadas_en_2024_USD)
          : null,
        ownerLoansToLLC: propietario.Pr_stamos_realizados_a_la_LLC_en_2024
          ? parseFloat(propietario.Pr_stamos_realizados_a_la_LLC_en_2024)
          : null,
        loansReimbursedByLLC: propietario.Pr_stamos_repagados_por_la_LLC_a_Propietario_2024
          ? parseFloat(propietario.Pr_stamos_repagados_por_la_LLC_a_Propietario_2024)
          : null,
        profitDistributions: propietario.Retiros_de_capital_realizados_en_2024_USD
          ? parseFloat(propietario.Retiros_de_capital_realizados_en_2024_USD)
          : null,
        spentMoreThan31DaysInUS: propietario.Estuvo_en_EE_UU_m_s_de_31_d_as_en_2024 || null,
        hasUSFinancialInvestments: propietario.Posee_inversiones_o_activos_en_EE_UU || null,
        isUSCitizen: propietario.Es_ciudadano_de_EE_UU || null,
      });

      members.push(primaryMember);
      this.logger.log(`Miembro principal creado: ${primaryMember.firstName} ${primaryMember.lastName}, email: ${primaryMember.email}`);
    } else {
      // Para Cuenta Bancaria, si no hay subform, crear miembro desde Account principal
      if (request.type === 'cuenta-bancaria' && (account.Nombre_s || account.Apellidos || account.Email_Laboral || account.Phone)) {
        this.logger.log(`Cuenta Bancaria sin subform - creando miembro desde Account principal`);
        const primaryMember = queryRunner.manager.create(Member, {
          requestId: request.id,
          firstName: account.Nombre_s || '',
          lastName: account.Apellidos || '',
          email: account.Email_Laboral || account.Correo_electr_nico || '',
          phoneNumber: this.normalizePhoneNumber(account.Phone) || '',
          passportNumber: account.N_mero_de_pasaporte || '',
          nationality: account.Nacionalidad1 || '',
          dateOfBirth: account.Fecha_de_nacimiento ? new Date(account.Fecha_de_nacimiento) : new Date(),
          percentageOfParticipation: 100, // Default para contacto principal
          memberAddress: account.Calle_y_n_mero ? {
            street: account.Calle_y_n_mero || '',
            unit: account.Suite_Apto || undefined,
            city: account.Ciudad || '',
            stateRegion: account.Estado_Provincia || '',
            postalCode: account.Postal_Zip_Code || '',
            country: account.Pais || '',
          } : undefined,
          isUSCitizen: account.Es_ciudadano_de_EE_UU || null,
        });
        members.push(primaryMember);
        this.logger.log(`Miembro principal creado desde Account: ${primaryMember.firstName} ${primaryMember.lastName}, email: ${primaryMember.email}`);
      } else {
        this.logger.warn(`No se encontró Contacto_Principal_LLC para Account ${account.id || account.Account_Name} (tipo: ${request.type})`);
      }
    }

    // Procesar Socios_LLC
    if (account.Socios_LLC && Array.isArray(account.Socios_LLC)) {
      this.logger.log(`Procesando ${account.Socios_LLC.length} socios adicionales`);
      for (const socio of account.Socios_LLC) {
        this.logger.log(`Procesando Socio: ${socio.Nombres_del_Socio || ''} ${socio.Apellidos_del_Socio || ''}`);
        const socioMember = queryRunner.manager.create(Member, {
          requestId: request.id,
          firstName: socio.Nombres_del_Socio || '',
          lastName: socio.Apellidos_del_Socio || '',
          email: socio.Correo_electr_nico_Socio || '',
          phoneNumber: socio.Tel_fono_Socio || '',
          passportNumber: socio.N_mero_de_pasaporte_Socio || socio.Nro_de_pasaporte_Socio || '',
          nationality: socio.Nacionalidad_Socio || '',
          dateOfBirth: socio.Fecha_de_Nacimiento_Socio
            ? new Date(socio.Fecha_de_Nacimiento_Socio)
            : new Date(),
          percentageOfParticipation: socio.Porcentaje_Participaci_n_Socio
            ? parseFloat(socio.Porcentaje_Participaci_n_Socio)
            : 0,
          memberAddress: {
            street: socio.Calle_y_n_mero_exterior_altura || '',
            unit: socio.N_mero_interior_departamento_S || '',
            city: socio.Ciudad_Propietario || '', // Nota: mismo campo que propietario
            stateRegion: socio.Estado_Regi_n_Provincia_Socio || '',
            postalCode: socio.C_digo_postal_Socio || '',
            country: socio.Pa_s_de_Residencia_Socio || '',
          },
          ssnOrItin: socio.N_mero_de_SSN_ITIN || null,
          nationalTaxId: socio.ID_Fiscal_Nacional_CUIT || null,
          taxFilingCountry: socio.Pa_s_donde_paga_impuestos || null,
          ownerContributions: socio.Contribuciones_de_capital_realizadas_en_2024
            ? parseFloat(socio.Contribuciones_de_capital_realizadas_en_2024)
            : null,
          ownerLoansToLLC: socio.Pr_stamos_realizados_a_la_LLC_en_2024
            ? parseFloat(socio.Pr_stamos_realizados_a_la_LLC_en_2024)
            : null,
          loansReimbursedByLLC: socio.Pr_stamos_repagados_por_la_LLC_a_Propietario_2024
            ? parseFloat(socio.Pr_stamos_repagados_por_la_LLC_a_Propietario_2024)
            : null,
          profitDistributions: socio.Retiros_de_Capital_2024
            ? parseFloat(socio.Retiros_de_Capital_2024)
            : null,
          spentMoreThan31DaysInUS: socio.Estuvo_en_EE_UU_m_s_de_31_d_as_en_2024 || null,
          hasUSFinancialInvestments: socio.Posee_inversiones_o_activos_en_EE_UU || null,
          isUSCitizen: socio.Es_ciudadano_de_EE_UU || null,
        });

        members.push(socioMember);
        this.logger.log(`Socio creado: ${socioMember.firstName} ${socioMember.lastName}, email: ${socioMember.email}, participación: ${socioMember.percentageOfParticipation}%`);
      }
    } else {
      this.logger.warn(`No se encontró Socios_LLC para Account ${account.id || account.Account_Name}`);
    }

      // Guardar todos los Members (con triggers deshabilitados para evitar validación de porcentajes)
      if (members.length > 0) {
        await queryRunner.manager.save(Member, members);
        this.logger.log(`Total de ${members.length} miembros guardados en BD para Request ${request.id} (validación de porcentajes deshabilitada)`);
      } else {
        this.logger.warn(`No se guardaron miembros para Request ${request.id} - Account ${account.id || account.Account_Name}`);
      }
    } finally {
      // Rehabilitar los triggers al final del proceso
      try {
        await queryRunner.query('ALTER TABLE members ENABLE TRIGGER ALL');
        this.logger.log(`Triggers rehabilitados después de procesar miembros (Request ${request.id})`);
      } catch (error: any) {
        this.logger.warn(`No se pudo rehabilitar triggers: ${error.message}`);
      }
    }
  }

  /**
   * Actualiza Request.status, Request.stage y Request.workDriveUrlExternal basado en Deals y Account relacionados
   */
  private async updateRequestStatusFromDeals(
    request: Request,
    org: string,
  ) {
    try {
      if (!request.zohoAccountId) {
        return; // No hay Account ID de Zoho, no se puede buscar Deal
      }

      // Buscar Deals relacionados con este Account
      const coqlQuery = `SELECT Stage, Type FROM Deals WHERE Account_Name.id = '${request.zohoAccountId}' ORDER BY Modified_Time DESC LIMIT 1`;
      const dealsResponse = await this.zohoCrmService.queryWithCoql(coqlQuery, undefined, org);
      const deals = dealsResponse.data || [];

      let needsUpdate = false;

      if (deals.length > 0) {
        const deal = deals[0];
        const dealStage = this.normalizeZohoDealStage(deal);
        const newStatus = this.mapDealStageToRequestStatus(dealStage, deal.Type);
        
        // Actualizar status si cambió
        if (newStatus && newStatus !== request.status) {
          request.status = newStatus;
          needsUpdate = true;
        }
        
        const stageForRequest =
          request.type === 'renovacion-llc'
            ? applyRenovacionClientStageAlias(dealStage)
            : dealStage;
        if (dealStage && stageForRequest !== request.stage) {
          request.stage = stageForRequest;
          needsUpdate = true;
          this.logger.log(`Request ${request.id} actualizado a stage: ${stageForRequest} desde Deal`);
        }
      }

      // Actualizar workDriveUrlExternal desde Account
      try {
        const accountResponse = await this.zohoCrmService.getRecordById(
          'Accounts',
          request.zohoAccountId,
          org,
          undefined, // Obtener todos los campos
        );
        
        if (accountResponse.data && accountResponse.data.length > 0) {
          const account = accountResponse.data[0];
          
          // Si Account tiene workDriveId Y el Request no tiene workDriveUrlExternal, generar permalink
          if (account.workDriveId && !request.workDriveUrlExternal) {
            try {
              this.logger.log(`Generando permalink para workDriveId: ${account.workDriveId} (Request ${request.id})`);
              // No pasar org, dejar que el servicio busque cualquier configuración de WorkDrive disponible
              const permalink = await this.zohoWorkDriveService.generateEmbedPermalink(
                account.workDriveId,
              );
              
              // Guardar el permalink completo tal como viene de la API
              request.workDriveUrlExternal = permalink;
              needsUpdate = true;
              this.logger.log(`Request ${request.id} actualizado con permalink completo: ${permalink}`);
            } catch (embedError: any) {
              this.logger.warn(
                `Error al generar permalink para workDriveId ${account.workDriveId} (Request ${request.id}):`,
                embedError.message,
              );
              // Si falla, intentar usar workDriveUrlExternal directamente si existe
              if (account.workDriveUrlExternal) {
                request.workDriveUrlExternal = account.workDriveUrlExternal;
                needsUpdate = true;
                this.logger.log(`Request ${request.id} actualizado con workDriveUrlExternal directo: ${account.workDriveUrlExternal}`);
              }
            }
          } else if (account.workDriveUrlExternal && !request.workDriveUrlExternal) {
            // Si no hay workDriveId pero sí workDriveUrlExternal, y el Request no tiene uno, usarlo directamente
            request.workDriveUrlExternal = account.workDriveUrlExternal;
            needsUpdate = true;
            this.logger.log(`Request ${request.id} actualizado con workDriveUrlExternal: ${account.workDriveUrlExternal}`);
          } else if (request.workDriveUrlExternal) {
            this.logger.log(`Request ${request.id} ya tiene workDriveUrlExternal, no se actualizará: ${request.workDriveUrlExternal}`);
          }
        }
      } catch (accountError: any) {
        this.logger.warn(`Error al obtener Account para actualizar workDriveUrlExternal (Request ${request.id}):`, accountError.message);
        // No lanzar error, solo loguear
      }
      
      if (needsUpdate) {
        await this.requestRepository.save(request);
        const dealStage = deals.length > 0 ? this.normalizeZohoDealStage(deals[0]) : '';
        this.logger.log(`Request ${request.id} actualizado - status: ${request.status}, stage: ${request.stage || 'N/A'}, workDriveUrlExternal: ${request.workDriveUrlExternal ? 'Sí' : 'No'}`);
      }
    } catch (error: any) {
      this.logger.error(`Error al actualizar status/stage/workDriveUrlExternal desde Deals/Account para Request ${request.id}:`, error);
      // No lanzar error, solo loguear
    }
  }

  /**
   * Mapea Deal.Stage a Request.status
   */
  private mapDealStageToRequestStatus(
    stage: string,
    type: string,
  ): 'pendiente' | 'en-proceso' | 'completada' | 'rechazada' | null {
    // Aperturas
    if (type === 'Apertura') {
      if (stage === 'Apertura Activa') return 'completada';
      if (stage === 'Apertura Perdida') return 'rechazada';
      // Todos los demás stages Open → en-proceso
      return 'en-proceso';
    }
    
    // Cuenta Bancaria
    if (type === 'Cuenta Bancaria') {
      if (stage === 'Cuenta Bancaria Finalizada') return 'completada';
      if (stage === 'Cuenta Bancaria Perdida') return 'rechazada';
      // Todos los demás stages Open → en-proceso
      return 'en-proceso';
    }

    // Renovaciones (Stage crudo de Zoho; no aplicar alias aquí)
    if (type === 'Renovación') {
      if (stage === 'Renovado' || stage === 'Renovación completa') return 'completada';
      if (stage === 'Renovación Abierta') return 'pendiente';
      // Todos los demás → en-proceso
      return 'en-proceso';
    }

    // Cuentas Bancarias
    if (type === 'Cuenta Bancaria') {
      if (stage === 'Cuenta Bancaria Finalizada') return 'completada';
      if (stage === 'Cuenta Bancaria Perdida') return 'rechazada';
      // Todos los demás → en-proceso
      return 'en-proceso';
    }

    return null;
  }

  /**
   * Importa Deals desde Zoho y actualiza status de Requests
   */
  async importDealsFromZoho(
    org: string = 'startcompanies',
    limit: number = 200,
  ) {
    try {
      this.logger.log(`Iniciando importación de Deals desde Zoho CRM`);

      // COQL sintaxis según ejemplo funcional: limit X offset Y
      const coqlQuery = `select Deal_Name, Type, Stage, Account_Name, Contact_Name, Created_Time, Modified_Time from Deals where (Type in ('Apertura', 'Renovación', 'Cuenta Bancaria')) order by Modified_Time desc limit ${limit} offset 0`;
      
      const response = await this.zohoCrmService.queryWithCoql(coqlQuery, undefined, org);
      const deals = response.data || [];

      this.logger.log(`Obtenidos ${deals.length} Deals de Zoho`);

      const results = {
        updated: 0,
        errors: [] as any[],
      };

      for (const deal of deals) {
        try {
          const accountId = deal.Account_Name?.id;
          if (!accountId) {
            continue;
          }

          // Buscar Request por zohoAccountId
          const request = await this.requestRepository.findOne({
            where: { zohoAccountId: accountId },
          });

          if (!request) {
            this.logger.warn(`No se encontró Request para Account ${accountId} del Deal ${deal.id}`);
            continue;
          }

          // Mapear Stage → status
          const dealStage = this.normalizeZohoDealStage(deal);
          const newStatus = this.mapDealStageToRequestStatus(dealStage, deal.Type);
          
          let needsUpdate = false;
          
          // Actualizar status si cambió
          if (newStatus && newStatus !== request.status) {
            request.status = newStatus;
            needsUpdate = true;
          }
          
          const stageForRequest =
            request.type === 'renovacion-llc'
              ? applyRenovacionClientStageAlias(dealStage)
              : dealStage;
          if (dealStage && stageForRequest !== request.stage) {
            request.stage = stageForRequest;
            needsUpdate = true;
          }
          
          if (needsUpdate) {
            await this.requestRepository.save(request);
            results.updated++;
            this.logger.log(`Request ${request.id} actualizado a status: ${newStatus || request.status} y stage: ${stageForRequest || request.stage} desde Deal Stage: ${dealStage}`);
          }
        } catch (error: any) {
          results.errors.push({
            dealId: deal.id,
            dealName: deal.Deal_Name,
            error: error.message,
          });
          this.logger.error(`Error al procesar Deal ${deal.id}:`, error);
        }
      }

      return {
        success: true,
        total: deals.length,
        ...results,
      };
    } catch (error: any) {
      this.logger.error('Error al importar Deals desde Zoho:', error);
      throw new HttpException(
        error.message || 'Error al importar Deals desde Zoho CRM',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private parseZohoLookupField(
    field: unknown,
  ): { id?: string; name?: string } {
    if (!field || typeof field !== 'object') return {};
    const o = field as Record<string, unknown>;
    const id = o.id != null ? String(o.id) : undefined;
    const name = o.name != null ? String(o.name) : undefined;
    return { id, name };
  }

  private parseZohoDateTimeForTimeline(value: unknown): Date | undefined {
    if (value == null || value === '') return undefined;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? undefined : value;
    }
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  private async fetchContactDetailsForTimeline(
    contactIds: string[],
    org: string,
  ): Promise<
    Map<
      string,
      {
        email?: string;
        firstName?: string;
        lastName?: string;
        tipoContacto?: string;
      }
    >
  > {
    const map = new Map<
      string,
      {
        email?: string;
        firstName?: string;
        lastName?: string;
        tipoContacto?: string;
      }
    >();
    const fields = 'Email,First_Name,Last_Name,Tipo_de_Contacto';
    for (const id of contactIds) {
      try {
        const res = await this.zohoCrmService.getRecordById(
          'Contacts',
          id,
          org,
          fields,
        );
        const row = res?.data?.[0];
        if (row) {
          map.set(id, {
            email: row.Email != null ? String(row.Email) : undefined,
            firstName: row.First_Name != null ? String(row.First_Name) : undefined,
            lastName: row.Last_Name != null ? String(row.Last_Name) : undefined,
            tipoContacto:
              row.Tipo_de_Contacto != null ? String(row.Tipo_de_Contacto) : undefined,
          });
        }
      } catch (e: any) {
        this.logger.warn(
          `Timeline: no se pudo obtener Contact ${id}: ${e.message}`,
        );
      }
    }
    return map;
  }

  private async resolveClientIdsByEmailBatch(
    emailsLower: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (emailsLower.length === 0) return map;
    const clients = await this.clientRepo
      .createQueryBuilder('c')
      .where('LOWER(TRIM(c.email)) IN (:...emails)', { emails: emailsLower })
      .getMany();
    for (const c of clients) {
      map.set(c.email.trim().toLowerCase(), c.id);
    }
    return map;
  }

  /**
   * Importa Deals (Apertura / Renovación / Cuenta Bancaria) a la tabla local de historial para el portal.
   * No modifica Requests; una fila por Deal Zoho.
   */
  async importDealTimelineFromZoho(
    org: string = 'startcompanies',
    limitPerPage: number = 200,
    maxPages?: number,
  ) {
    const coqlFields = [
      'id',
      'Deal_Name',
      'Type',
      'Stage',
      'Status',
      'Account_Name',
      'Contact_Name',
      'LLC_Principal',
      'Partner',
      'Amount',
      'Closing_Date',
      'Fecha',
      'Fecha_de_constituci_n',
      'Fecha_de_renovacion',
      'Created_Time',
      'Modified_Time',
    ].join(', ');
    const whereClause = "(Type in ('Apertura', 'Renovación', 'Cuenta Bancaria'))";
    let offset = 0;
    let page = 0;
    let totalUpserted = 0;
    const errors: { dealId?: string; error: string }[] = [];
    const syncedAt = new Date();

    while (true) {
      if (maxPages != null && page >= maxPages) {
        break;
      }
      const coqlQuery = `select ${coqlFields} from Deals where ${whereClause} order by Modified_Time desc limit ${limitPerPage} offset ${offset}`;
      let response: { data?: Record<string, unknown>[] };
      try {
        response = await this.zohoCrmService.queryWithCoql(coqlQuery, undefined, org);
      } catch (e: any) {
        this.logger.error('importDealTimeline COQL error', e);
        throw e;
      }
      const deals = response.data || [];
      if (deals.length === 0) {
        break;
      }

      const contactIdSet = new Set<string>();
      for (const d of deals) {
        const cn = this.parseZohoLookupField(d.Contact_Name);
        if (cn.id) {
          contactIdSet.add(cn.id);
        }
      }
      const contactIds = [...contactIdSet];
      const contactMap = await this.fetchContactDetailsForTimeline(contactIds, org);

      const emailsLower = new Set<string>();
      for (const id of contactIds) {
        const e = contactMap.get(id)?.email?.trim();
        if (e) {
          emailsLower.add(e.toLowerCase());
        }
      }
      const clientByEmailLower = await this.resolveClientIdsByEmailBatch([
        ...emailsLower,
      ]);

      for (const deal of deals) {
        try {
          const dealId = deal.id != null ? String(deal.id) : null;
          if (!dealId) {
            continue;
          }
          const acc = this.parseZohoLookupField(deal.Account_Name);
          const principal = this.parseZohoLookupField(deal.LLC_Principal);
          const cn = this.parseZohoLookupField(deal.Contact_Name);
          const cinfo = cn.id ? contactMap.get(cn.id) : undefined;

          let amount: number | undefined;
          if (deal.Amount != null && deal.Amount !== '') {
            const n = parseFloat(String(deal.Amount).replace(/,/g, ''));
            if (Number.isFinite(n)) {
              amount = n;
            }
          }

          const contactEmail = cinfo?.email?.trim() || undefined;
          const clientId = contactEmail
            ? clientByEmailLower.get(contactEmail.toLowerCase())
            : undefined;

          let row = await this.zohoDealTimelineRepo.findOne({
            where: { zohoDealId: dealId },
          });
          if (!row) {
            row = this.zohoDealTimelineRepo.create({ zohoDealId: dealId });
          }
          row.dealName = deal.Deal_Name != null ? String(deal.Deal_Name) : undefined;
          row.dealType = deal.Type != null ? String(deal.Type) : undefined;
          row.stage = this.normalizeZohoDealStage(deal) || undefined;
          row.status = deal.Status != null ? String(deal.Status) : undefined;
          row.zohoAccountId = acc.id;
          row.accountName = acc.name;
          row.zohoLlcPrincipalId = principal.id;
          row.llcPrincipalName = principal.name;
          row.zohoContactId = cn.id;
          row.contactEmail = contactEmail;
          row.contactFirstName = cinfo?.firstName;
          row.contactLastName = cinfo?.lastName;
          row.tipoContacto = cinfo?.tipoContacto;
          row.partnerPicklist =
            deal.Partner != null ? String(deal.Partner) : undefined;
          row.amount = amount;
          row.closingDate = this.parseZohoDateTimeForTimeline(deal.Closing_Date);
          row.fecha = this.parseZohoDateTimeForTimeline(deal.Fecha);
          row.fechaConstitucion = this.parseZohoDateTimeForTimeline(
            deal.Fecha_de_constituci_n,
          );
          row.fechaRenovacion = this.parseZohoDateTimeForTimeline(
            deal.Fecha_de_renovacion,
          );
          row.createdTimeZoho = this.parseZohoDateTimeForTimeline(deal.Created_Time);
          row.modifiedTimeZoho = this.parseZohoDateTimeForTimeline(deal.Modified_Time);
          row.clientId = clientId;
          row.syncedAt = syncedAt;

          await this.zohoDealTimelineRepo.save(row);
          totalUpserted++;
        } catch (err: any) {
          errors.push({ dealId: String(deal.id), error: err.message });
          this.logger.warn(`Timeline deal ${deal.id}: ${err.message}`);
        }
      }

      if (deals.length < limitPerPage) {
        break;
      }
      offset += limitPerPage;
      page++;
    }

    return {
      success: true,
      upserted: totalUpserted,
      errors,
    };
  }

  /**
   * Sincronización completa: importa TODOS los Accounts sin límite (incluye contactos y deals automáticamente)
   */
  async fullSyncFromZoho(
    org: string = 'startcompanies',
    accountsLimit: number = 200, // No se usa, se traen todos
    dealsLimit: number = 200, // Mantenido por compatibilidad, pero no se usa
    onProgress?: (event: ZohoImportAccountsProgressEvent) => void | Promise<void>,
  ) {
    try {
      this.logger.log(`Iniciando sincronización completa desde Zoho CRM`);
      this.logger.log(`Nota: Al importar Accounts, se procesan automáticamente los contactos (subforms) y deals relacionados`);
      this.logger.log(`Importando TODOS los Accounts sin límite...`);

      const batchSize = 200;
      const allAccounts = await this.fetchAllAccountsCoqlPagesForFullSync(
        org,
        batchSize,
        onProgress,
      );

      await this.emitImportProgress(onProgress, {
        phase: 'list_ready',
        totalAccounts: allAccounts.length,
      });

      if (allAccounts.length === 0) {
        return {
          success: true,
          accounts: {
            success: true,
            total: 0,
            imported: 0,
            updated: 0,
            errors: [],
            details: [],
          },
          message:
            'Sincronización completa finalizada. No hay Accounts que coincidan con el filtro.',
        };
      }

      const metadata = await this.getMetadata(org);
      const fullSyncMeta: ZohoImportFullSyncMeta = {
        batchIndex: 1,
        batchOffset: 0,
        estimatedTotal: allAccounts.length,
      };

      const batchResult = await this.processAccountRowsFromCoql(
        org,
        allAccounts,
        metadata,
        onProgress,
        fullSyncMeta,
      );

      this.logger.log(
        `Sincronización completa finalizada. Total procesado: ${batchResult.total} Accounts`,
      );

      return {
        success: true,
        accounts: {
          success: true,
          total: batchResult.total,
          imported: batchResult.imported,
          updated: batchResult.updated,
          errors: batchResult.errors,
          details: batchResult.details,
        },
        message: `Sincronización completa finalizada. Se procesaron ${batchResult.total} Accounts (${batchResult.imported} nuevos, ${batchResult.updated} actualizados). Los contactos y deals se procesaron automáticamente con cada Account.`,
      };
    } catch (error: any) {
      this.logger.error('Error en sincronización completa:', error);
      throw error;
    }
  }

  /**
   * Genera una contraseña temporal segura
   */
  private generateTemporaryPassword(): string {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    // Asegurar al menos una mayúscula, una minúscula, un número y un carácter especial
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Mezclar los caracteres
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}









