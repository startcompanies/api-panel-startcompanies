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
import { encodePassword } from 'src/shared/common/utils/bcrypt';

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

      // Guardar zohoAccountId en Request usando update directo para asegurar que se guarde
      await this.requestRepository.update(
        { id: requestId },
        { zohoAccountId: accountId },
      );

      // Actualizar también el objeto en memoria para consistencia
      request.zohoAccountId = accountId;

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
   * Mapea una Request a un Account de Zoho
   */
  private async mapRequestToAccount(
    request: Request,
    members: Member[],
  ): Promise<Record<string, any>> {
    // Determinar Empresa: si tiene partner = nombre del partner, si no = "Start Companies"
    let empresa = 'Start Companies';
    if (request.partner) {
      // Priorizar company, luego username, luego first_name + last_name
      empresa = request.partner.company || 
                request.partner.username || 
                `${request.partner.first_name || ''} ${request.partner.last_name || ''}`.trim() ||
                'Start Companies';
    } else if (request.company) {
      // Si ya está guardado en BD, usarlo
      empresa = request.company;
    }

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
      accountData = {
        ...accountData,
        // Mapeo según CSV - campos del formulario
        Account_Name: apertura.llcName || '',
        Nombre_de_la_LLC_Opci_n_2: apertura.llcNameOption2 || '',
        Nombre_de_la_LLC_Opci_n_3: apertura.llcNameOption3 || '',
        Estado_de_Registro: apertura.incorporationState || '',
        Actividad_Principal_de_la_LLC: apertura.businessDescription || '',
        Estructura_Societaria:
          apertura.llcType === 'single'
            ? 'LLC de un solo miembro (Single Member LLC)'
            : 'LLC multi-miembro (Multi-Member LLC)',
        LinkedIn: apertura.linkedin || '',
        Website: apertura.projectOrCompanyUrl || '', // Usar projectOrCompanyUrl según CSV
        P_gina_web_de_la_LLC: apertura.projectOrCompanyUrl || '',
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
        Estado_de_Registro: renovacion.state || '',
        Actividad_Principal_de_la_LLC: renovacion.mainActivity || '',
        N_mero_de_EIN: renovacion.einNumber || '',
        Estructura_Societaria:
          renovacion.llcType === 'single'
            ? 'LLC de un solo miembro (Single Member LLC)'
            : 'LLC multi-miembro (Multi-Member LLC)',
        // Campos AGREGAR según data.md - usando Pick List (Sí/No)
        Tu_empresa_posee_o_renta_una_propiedad_en_EE_UU: this.mapBooleanToPickList(renovacion.hasPropertyInUSA),
        Almacena_productos_en_un_dep_sito_en_EE_UU: this.mapBooleanToPickList(renovacion.almacenaProductosDepositoUSA),
        Tu_empresa_contrata_servicios_en_EE_UU: this.mapBooleanToPickList(renovacion.contrataServiciosUSA),
        Tu_LLC_tiene_cuentas_bancarias_a_su_nombre: this.mapBooleanToPickList(renovacion.tieneCuentasBancarias),
        Fecha_de_Constituci_n: this.formatDate(renovacion.llcCreationDate),
        Pa_ses_donde_la_LLC_realiza_negocios: (() => {
          const value: any = renovacion.countriesWhereLLCDoesBusiness;
          if (Array.isArray(value)) {
            return value;
          }
          if (value && typeof value === 'string' && value.trim()) {
            return value.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
          }
          return [];
        })(),
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
        state: cuenta.registeredAgentState || '',
        postalCode: cuenta.registeredAgentZipCode || '',
        country: cuenta.registeredAgentCountry || '',
      };
      
      accountData = {
        ...accountData,
        // Mapeo según CSV - campos del formulario
        Account_Name: cuenta.legalBusinessIdentifier || '',
        Tipo_de_negocio: cuenta.businessType || '',
        Industria_Rubro: cuenta.industry || '',
        Cantidad_de_empleados: cuenta.numberOfEmployees || '',
        Descripci_n_breve: cuenta.economicActivity || '',
        Sitio_web_o_Red_Social: cuenta.websiteOrSocialMedia || '',
        N_mero_de_EIN: cuenta.ein || '',
        Estructura_Societaria:
          cuenta.llcType === 'single'
            ? 'LLC de un solo miembro (Single Member LLC)'
            : cuenta.llcType === 'multi'
            ? 'LLC multi-miembro (Multi-Member LLC)'
            : 'LLC de un solo miembro (Single Member LLC)',
        // Dirección Comercial (Registered Agent) - desde companyAddress (JSONB)
        Direcci_n_comercial_Calle_y_numero: companyAddr.street || '',
        Direcci_n_comercial_Suite: companyAddr.unit || '',
        Direcci_n_comercial_Ciudad: companyAddr.city || '',
        Direcci_n_comercial_Estado: companyAddr.state || '',
        Direcci_n_comercial_Postal: companyAddr.postalCode || '',
        Direcci_n_postal_Pais: companyAddr.country || '',
        Estado_de_constituci_n: cuenta.incorporationState || '',
        Mes_y_A_o: cuenta.incorporationMonthYear || '',
        Pa_ses_donde_la_LLC_realiza_negocios: (() => {
          const value: any = cuenta.countriesWhereBusiness;
          if (Array.isArray(value)) {
            return value;
          }
          if (value && typeof value === 'string' && value.trim()) {
            return value.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
          }
          return [];
        })(),
        Banco: banco,
        // Dirección Personal del Propietario (desde ownerPersonalAddress JSONB)
        Calle_y_n_mero: cuenta.ownerPersonalAddress?.street || '',
        Suite_Apto: cuenta.ownerPersonalAddress?.unit || '',
        Ciudad: cuenta.ownerPersonalAddress?.city || '',
        Estado_Provincia: cuenta.ownerPersonalAddress?.state || '',
        Postal_Zip_Code: cuenta.ownerPersonalAddress?.postalCode || '',
        Pais: cuenta.ownerPersonalAddress?.country || '',
      };
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
      Mailing_State: member.memberAddress?.stateRegion || '',
      Mailing_Zip: member.memberAddress?.postalCode || '',
      Mailing_Country: member.memberAddress?.country || '',
      // Campos adicionales si existen
      ...(member.nationality && { Mailing_Country: member.nationality }),
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
          ? 'LLC de un solo miembro (Single Member LLC)'
          : 'LLC multi-miembro (Multi-Member LLC)';
      dealData.Estado_de_Registro = apertura.incorporationState || '';
    } else if (request.type === 'renovacion-llc' && request.renovacionLlcRequest) {
      const renovacion = request.renovacionLlcRequest;
      dealData.Estructura_Societaria =
        renovacion.llcType === 'single'
          ? 'LLC de un solo miembro (Single Member LLC)'
          : 'LLC multi-miembro (Multi-Member LLC)';
      dealData.Estado_de_Registro = renovacion.state || '';
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
      Nacionalidad_Propietario: member.nationality,
      Fecha_Nacimiento_Propietario: this.formatDate(member.dateOfBirth),
      Correo_electr_nico_Propietario: member.email,
      Tel_fono_Contacto_Propietario: this.normalizePhoneNumber(member.phoneNumber),
      Calle_y_n_mero_exterior_altura: member.memberAddress?.street || '',
      N_mero_interior_departamento_P: member.memberAddress?.unit || '',
      Ciudad_Propietario: member.memberAddress?.city || '',
      Estado_Regi_n_Provincia_Prop: member.memberAddress?.stateRegion || '',
      C_digo_postal_Propietario: member.memberAddress?.postalCode || '',
      Pa_s_de_Residencia_Propietario: member.memberAddress?.country || '',
      Porcentaje_Participaci_n_Princ: member.percentageOfParticipation || 100,
      ...(member.ssnOrItin && { N_mero_de_SSN_ITIN: member.ssnOrItin }),
      ...(member.nationalTaxId && { ID_Fiscal_Nacional_CUIT: member.nationalTaxId }),
      ...(member.taxFilingCountry && { Pa_s_donde_paga_impuestos: member.taxFilingCountry }),
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
      Nacionalidad_Socio: member.nationality,
      Fecha_de_Nacimiento_Socio: this.formatDate(member.dateOfBirth),
      Correo_electr_nico_Socio: member.email,
      Tel_fono_Socio: this.normalizePhoneNumber(member.phoneNumber),
      Calle_y_n_mero_exterior_altura: member.memberAddress?.street || '',
      N_mero_interior_departamento_S: member.memberAddress?.unit || '',
      Ciudad_Propietario: member.memberAddress?.city || '',
      Estado_Regi_n_Provincia_Socio: member.memberAddress?.stateRegion || '',
      C_digo_postal_Socio: member.memberAddress?.postalCode || '',
      Pa_s_de_Residencia_Socio: member.memberAddress?.country || '',
      Porcentaje_Participaci_n_Socio: member.percentageOfParticipation || 0,
      ...(member.ssnOrItin && { N_mero_de_SSN_ITIN: member.ssnOrItin }),
      ...(member.nationalTaxId && { ID_Fiscal_Nacional_CUIT: member.nationalTaxId }),
      ...(member.taxFilingCountry && { Pa_s_donde_paga_impuestos: member.taxFilingCountry }),
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

  /**
   * Importa Accounts desde Zoho con subformularios y crea Requests en BD
   */
  async importAccountsFromZoho(
    org: string = 'startcompanies',
    limit: number = 200,
    offset: number = 0,
  ) {
    try {
      this.logger.log(`Iniciando importación de Accounts desde Zoho CRM`);

      // Obtener metadata
      const metadata = await this.getMetadata(org);

      // Obtener Accounts usando COQL
      // Nota: Los subformularios (Contacto_Principal_LLC, Socios_LLC) no se pueden obtener directamente en COQL
      // Se obtendrán después usando getRecordById con el parámetro fields
      // Campos según mapeo proporcionado (solo los que están en el mapeo)
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
        'Declaraciones_Juradas_Anteriores',
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
        'Es_ciudadano_de_EE_UU',
        // Campos necesarios para lógica
        'Tipo', // Necesario para determinar el tipo de request
        'Empresa', // Necesario para determinar si es Partner
        'Partner_Email', // Necesario si es Partner
        'Partner_Phone', // Necesario si es Partner
        'Created_Time',
        'Modified_Time',
      ];

      // COQL sintaxis: LIMIT offset, limit (no LIMIT limit OFFSET offset)
      // Construir la consulta con cuidado para evitar problemas de sintaxis
      // Usar OR en lugar de IN ya que IN no funciona para este campo
      // Nota: Los valores con espacios deben estar entre comillas simples
      // Probar primero con campos básicos para identificar el problema
      // Campos básicos para la consulta COQL (solo los del mapeo)
      const basicFieldsForQuery = [
        'id',
        'Account_Name',
        'Tipo',
        'Estado_de_Registro',
        'Estructura_Societaria',
        'N_mero_de_EIN',
        'Empresa',
        'Partner_Email',
        'Partner_Phone',
        'Created_Time',
        'Modified_Time',
      ];
      
      // COQL sintaxis según ejemplo funcional: limit X offset Y (no limit offset, limit)
      // Usar IN para múltiples valores (funciona según el ejemplo proporcionado)
      const whereClause = "(Tipo in ('Apertura', 'Renovación', 'Cuenta Bancaria'))";
      const coqlQuery = `select ${fields.join(', ')} from Accounts where ${whereClause} order by Created_Time desc limit ${limit} offset ${offset}`;
      
      this.logger.debug(`Consulta COQL: ${coqlQuery}`);
      
      const response = await this.zohoCrmService.queryWithCoql(coqlQuery, undefined, org);
      const accounts = response.data || [];
      
      // Obtener Account completo con todos los campos y subformularios para cada Account
      // Nota: Si no se especifican campos, Zoho devuelve todos los campos automáticamente incluyendo subforms
      this.logger.log(`Obteniendo Account completo con subformularios para ${accounts.length} Accounts...`);
      for (const account of accounts) {
        try {
          // Obtener Account completo SIN especificar campos para que devuelva TODO (incluyendo subforms)
          // Esto asegura que se obtengan todos los campos necesarios y los subformularios
          const fullAccount = await this.zohoCrmService.getRecordById(
            'Accounts',
            account.id,
            org,
            undefined, // No especificar campos = obtener todos los campos + subforms
          );
          
          // Combinar datos del COQL con los datos completos del Account (incluyendo subformularios)
          if (fullAccount.data && fullAccount.data.length > 0) {
            // Combinar todos los campos del Account completo con los datos del COQL
            Object.assign(account, fullAccount.data[0]);
            
            // Log para validar que los subforms se obtuvieron
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
          // Continuar sin subformularios si falla
        }
      }

      this.logger.log(`Obtenidos ${accounts.length} Accounts de Zoho`);

      const results = {
        imported: 0,
        updated: 0,
        errors: [] as any[],
        details: [] as any[],
      };

      // Procesar cada Account
      for (const account of accounts) {
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

      return {
        success: true,
        total: accounts.length,
        ...results,
      };
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
          // Para cuenta bancaria, buscar por legalBusinessIdentifier o applicantEmail
          const cuenta = await this.cuentaRepo
            .createQueryBuilder('c')
            .leftJoinAndSelect('c.request', 'request')
            .where('c.legalBusinessIdentifier = :name OR c.applicantEmail = :email', {
              name: account.Account_Name,
              email: account.Correo_electr_nico,
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

      // PRIMERO: Obtener/crear usuario (cliente o partner) para asignar clientId
      // Esto debe hacerse ANTES de guardar el Request porque clientId es NOT NULL
      let clientId: number | undefined;
      
      if (account.Empresa === 'Partner') {
        // Procesar Partner primero
        if (!account.Partner_Email) {
          throw new Error(`Account ${account.id} tiene Empresa=Partner pero no tiene Partner_Email`);
        }

        let partnerUser = await this.userRepo.findOne({
          where: { email: account.Partner_Email },
        });

        if (!partnerUser) {
          let username = account.Partner_Email.split('@')[0];
          // Verificar si el username ya existe y generar uno único si es necesario
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
          clientId = partnerUser.id; // Para Partners, clientId = partnerId
        }
      } else {
        // PRIMERO: Buscar Deal relacionado para obtener contacto principal
        // SOLO migrar si hay un Deal (ganado o en proceso) con Contact_Name
        let contactEmail: string = '';
        let contactPhone: string = '';
        let contactFirstName: string = '';
        let contactLastName: string = '';
        let dealFound = false;
        let dealStage: string | undefined = undefined;

        try {
          // Buscar Deal relacionado con este Account
          const dealCoqlQuery = `SELECT Contact_Name, Stage FROM Deals WHERE Account_Name.id = '${account.id}' ORDER BY Modified_Time DESC LIMIT 1`;
          const dealsResponse = await this.zohoCrmService.queryWithCoql(dealCoqlQuery, undefined, org);
          const deals = dealsResponse.data || [];

          if (deals.length > 0) {
            const deal = deals[0];
            // Guardar el Stage del Deal para usarlo después
            dealStage = deal.Stage || '';
            
            // Verificar que el Deal esté ganado o en proceso
            const isWonOrInProcess = dealStage && (
              dealStage.includes('Activa') || 
              dealStage.includes('Finalizada') || 
              dealStage.includes('Renovado') ||
              dealStage.includes('Abierta') ||
              dealStage.includes('En Proceso') ||
              !dealStage.includes('Perdida')
            );

            if (isWonOrInProcess && deal.Contact_Name) {
              // Obtener información completa del Contact desde Zoho
              const contactId = typeof deal.Contact_Name === 'object' ? deal.Contact_Name.id : deal.Contact_Name;
              
              if (contactId) {
                try {
                  const contactFields = 'Email, Phone, Mobile, First_Name, Last_Name';
                  const contactResponse = await this.zohoCrmService.getRecordById('Contacts', contactId, org, contactFields);
                  
                  if (contactResponse.data && contactResponse.data.length > 0) {
                    const contact = contactResponse.data[0];
                    contactEmail = contact.Email || '';
                    contactPhone = contact.Phone || contact.Mobile || '';
                    contactFirstName = contact.First_Name || '';
                    contactLastName = contact.Last_Name || '';
                    dealFound = true;
                    
                    this.logger.log(`Contacto principal obtenido desde Deal para Account ${account.id}: ${contactEmail}`);
                  }
                } catch (contactError: any) {
                  this.logger.warn(`Error al obtener Contact ${contactId} del Deal: ${contactError.message}`);
                }
              }
            }
          }
        } catch (dealError: any) {
          this.logger.warn(`Error al buscar Deal para Account ${account.id}: ${dealError.message}`);
        }

        // Si no hay Deal válido, no migrar este Account
        if (!dealFound || !contactEmail) {
          throw new Error(`Account ${account.id} no tiene Deal relacionado válido (ganado o en proceso) con Contact_Name. Se omite la migración.`);
        }
        
        // Guardar el Stage del Deal en la Request (para Apertura LLC y Cuenta Bancaria)
        if ((requestType === 'apertura-llc' || requestType === 'cuenta-bancaria') && dealStage) {
          request.stage = dealStage;
          this.logger.log(`Stage del Deal guardado en Request: ${dealStage} para Account ${account.id}`);
        }

        let clientUser = await this.userRepo.findOne({
          where: { email: contactEmail },
        });

        if (!clientUser) {
          let username = contactEmail.split('@')[0];
          // Verificar si el username ya existe y generar uno único si es necesario
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
            first_name: contactFirstName,
            last_name: contactLastName,
            phone: this.normalizePhoneNumber(contactPhone) || '',
            type: 'client',
            status: true,
          });

          clientUser = await queryRunner.manager.save(User, clientUser);
          if (clientUser) {
            this.logger.log(`Usuario cliente creado: ${clientUser.id} (desde Deal)`);
          }
        }

        if (clientUser) {
          clientId = clientUser.id;
        }
      }

      if (!clientId) {
        throw new Error(`No se pudo obtener/crear usuario para Account ${account.id}`);
      }

      // Asignar clientId al Request
      request.clientId = clientId;

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
    if (estructura.includes('multi') || estructura.includes('multi-miembro')) {
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
        const dealStage = deal.Stage || '';
        const newStatus = this.mapDealStageToRequestStatus(dealStage, deal.Type);
        
        // Actualizar status si cambió
        if (newStatus && newStatus !== request.status) {
          request.status = newStatus;
          needsUpdate = true;
        }
        
        // Actualizar stage con el Stage del Deal (para Apertura LLC y Cuenta Bancaria)
        if ((request.type === 'apertura-llc' || request.type === 'cuenta-bancaria') && dealStage && dealStage !== request.stage) {
          request.stage = dealStage;
          needsUpdate = true;
          this.logger.log(`Request ${request.id} actualizado a stage: ${dealStage} desde Deal`);
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
        const dealStage = deals.length > 0 ? deals[0].Stage || '' : '';
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

    // Renovaciones
    if (type === 'Renovación') {
      if (stage === 'Renovado') return 'completada';
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
          const dealStage = deal.Stage || '';
          const newStatus = this.mapDealStageToRequestStatus(dealStage, deal.Type);
          
          let needsUpdate = false;
          
          // Actualizar status si cambió
          if (newStatus && newStatus !== request.status) {
            request.status = newStatus;
            needsUpdate = true;
          }
          
          // Actualizar stage con el Stage del Deal (para Apertura LLC y Cuenta Bancaria)
          if ((request.type === 'apertura-llc' || request.type === 'cuenta-bancaria') && dealStage && dealStage !== request.stage) {
            request.stage = dealStage;
            needsUpdate = true;
          }
          
          if (needsUpdate) {
            await this.requestRepository.save(request);
            results.updated++;
            this.logger.log(`Request ${request.id} actualizado a status: ${newStatus || request.status} y stage: ${dealStage || request.stage} desde Deal Stage: ${dealStage}`);
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

  /**
   * Sincronización completa: importa TODOS los Accounts sin límite (incluye contactos y deals automáticamente)
   */
  async fullSyncFromZoho(
    org: string = 'startcompanies',
    accountsLimit: number = 200, // No se usa, se traen todos
    dealsLimit: number = 200, // Mantenido por compatibilidad, pero no se usa
  ) {
    try {
      this.logger.log(`Iniciando sincronización completa desde Zoho CRM`);
      this.logger.log(`Nota: Al importar Accounts, se procesan automáticamente los contactos (subforms) y deals relacionados`);
      this.logger.log(`Importando TODOS los Accounts sin límite...`);

      // Importar TODOS los Accounts con paginación automática
      // Esto automáticamente procesa:
      // 1. Contactos desde subforms (Contacto_Principal_LLC, Socios_LLC)
      // 2. Deals relacionados para actualizar el status del Request
      
      const batchSize = 200; // Tamaño de lote para cada petición
      let offset = 0;
      let hasMore = true;
      
      const aggregatedResults = {
        imported: 0,
        updated: 0,
        errors: [] as any[],
        details: [] as any[],
        totalProcessed: 0,
      };

      while (hasMore) {
        this.logger.log(`Importando Accounts: offset ${offset}, límite ${batchSize}`);
        
        const batchResult = await this.importAccountsFromZoho(org, batchSize, offset);
        
        // Acumular resultados
        aggregatedResults.imported += batchResult.imported;
        aggregatedResults.updated += batchResult.updated;
        aggregatedResults.errors.push(...batchResult.errors);
        aggregatedResults.details.push(...batchResult.details);
        aggregatedResults.totalProcessed += batchResult.total;

        // Si trajo menos de batchSize, no hay más registros
        hasMore = batchResult.total === batchSize;
        offset += batchSize;

        this.logger.log(`Lote procesado: ${batchResult.total} Accounts (${batchResult.imported} nuevos, ${batchResult.updated} actualizados)`);
      }

      this.logger.log(`Sincronización completa finalizada. Total procesado: ${aggregatedResults.totalProcessed} Accounts`);

      return {
        success: true,
        accounts: {
          success: true,
          total: aggregatedResults.totalProcessed,
          imported: aggregatedResults.imported,
          updated: aggregatedResults.updated,
          errors: aggregatedResults.errors,
          details: aggregatedResults.details,
        },
        message: `Sincronización completa finalizada. Se procesaron ${aggregatedResults.totalProcessed} Accounts (${aggregatedResults.imported} nuevos, ${aggregatedResults.updated} actualizados). Los contactos y deals se procesaron automáticamente con cada Account.`,
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









