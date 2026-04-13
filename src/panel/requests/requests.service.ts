import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Request } from './entities/request.entity';
import { AperturaLlcRequest } from './entities/apertura-llc-request.entity';
import { RenovacionLlcRequest } from './entities/renovacion-llc-request.entity';
import { CuentaBancariaRequest } from './entities/cuenta-bancaria-request.entity';
import { Member } from './entities/member.entity';
// BankAccountOwner y BankAccountValidator ya no se usan - consolidados en Member y CuentaBancariaRequest
// RequestRequiredDocument ya no se usa - eliminado
import { User } from '../../shared/user/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { CreateRequestDto } from './dtos/create-request.dto';
import { UpdateRequestDto } from './dtos/update-request.dto';
import { ApproveRequestDto } from './dtos/approve-request.dto';
import { RejectRequestDto } from './dtos/reject-request.dto';
import { CreateMemberDto } from './dtos/create-member.dto';
import { UpdateMemberDto } from './dtos/update-member.dto';
// CreateOwnerDto, UpdateOwnerDto, CreateBankAccountValidatorDto y UpdateBankAccountValidatorDto ya no se usan
import { StripeService } from '../../shared/payments/stripe.service';
import { UserService } from '../../shared/user/user.service';
import { encodePassword } from '../../shared/common/utils/bcrypt';
import { validateRequestData } from './validation/request-validation-rules';
import { UploadFileService } from '../../shared/upload-file/upload-file.service';
import { awsConfigService } from '../../config/aws.config.service';
// ZohoCrmService ya no se usa en findOne - solo se consulta la BD local
// import { ZohoCrmService } from '../../zoho-config/zoho-crm.service';
import { ZohoSyncService } from '../../zoho-config/zoho-sync.service';
import { ZohoContactService } from '../../zoho-config/zoho-contact.service';
import { applyAperturaClientStageAlias } from '../../zoho-config/zoho-apertura-stage-client';
import { applyRenovacionClientStageAlias } from '../../zoho-config/zoho-renovacion-stage-client';
import {
  PanelRequestActorUser,
  RequestSubmittedNotificationsService,
} from '../notifications/request-submitted-notifications.service';
import { applyOptionalPublicWebUrlsToObject } from '../../shared/common/utils/public-web-url.util';
export type { RequestType } from './types/request-type';

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  /**
   * Convierte una fecha string a Date de manera segura
   * Retorna null si la fecha está vacía o es inválida
   */
  private parseDate(dateString: string | null | undefined): Date | null {
    if (!dateString || dateString.trim() === '' || dateString === '0NaN-aN-aN') {
      return null;
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  }

  /**
   * Postgres rechaza '' en columnas numeric/decimal. El front puede enviar strings vacíos en pasos incompletos.
   */
  private sanitizeRenovacionLlcNumericFields(obj: Record<string, unknown>): void {
    const numericFields = [
      'llcOpeningCost',
      'paidToFamilyMembers',
      'paidToLocalCompanies',
      'paidForLLCFormation',
      'paidForLLCDissolution',
      'bankAccountBalanceEndOfYear',
      'totalRevenue',
    ];
    for (const key of numericFields) {
      if (!(key in obj)) continue;
      const v = obj[key];
      if (v === null || v === undefined) {
        delete obj[key];
        continue;
      }
      if (typeof v === 'string') {
        const t = v.trim();
        if (t === '') {
          delete obj[key];
          continue;
        }
        const n = parseFloat(t.replace(/,/g, ''));
        if (Number.isFinite(n)) {
          obj[key] = n;
        } else {
          delete obj[key];
        }
        continue;
      }
      if (typeof v === 'number' && !Number.isFinite(v)) {
        delete obj[key];
      }
    }
  }

  private static readonly WIZARD_MAX_STEPS_BY_TYPE: Record<
    'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria',
    number
  > = {
    'apertura-llc': 6,
    'renovacion-llc': 6,
    'cuenta-bancaria': 7,
  };

  private maxWizardStepForType(
    type: 'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria',
  ): number {
    return RequestsService.WIZARD_MAX_STEPS_BY_TYPE[type];
  }

  private isPartnerContext(partnerId?: number | null): boolean {
    return partnerId != null;
  }

  /** Misma normalización que UploadFileService para servicio en rutas S3 */
  private normalizeServicioForUpload(servicio: string): string {
    return servicio
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private normalizeRequestUuidForUpload(uuid: string): string {
    return uuid.trim().replace(/[^a-zA-Z0-9-]/g, '');
  }

  /**
   * Recorre el payload (create/update) y obtiene claves S3 bajo request/{servicio}/
   * que aún no están en request/{servicio}/{uuid}/ (archivos temporales a mover).
   */
  private collectS3KeysFromRequestPayload(
    servicioRaw: string,
    requestUuid: string,
    payload: unknown,
  ): string[] {
    const servicio = this.normalizeServicioForUpload(servicioRaw);
    const uuidNorm = this.normalizeRequestUuidForUpload(requestUuid);

    const alreadyPlacedPrefix = `request/${servicio}/${uuidNorm}/`;
    const tempPrefix = `request/${servicio}/`;
    const keys = new Set<string>();

    const tryAddFromString = (s: string) => {
      const trimmed = s.trim();
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        return;
      }
      let key: string;
      try {
        key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
      } catch {
        return;
      }
      if (!key.startsWith(tempPrefix) || key.startsWith(alreadyPlacedPrefix)) {
        return;
      }
      keys.add(key);
    };

    const walk = (val: unknown): void => {
      if (val === null || val === undefined) {
        return;
      }
      if (typeof val === 'string') {
        tryAddFromString(val);
        return;
      }
      if (Array.isArray(val)) {
        val.forEach(walk);
        return;
      }
      if (typeof val === 'object') {
        for (const k of Object.keys(val as object)) {
          walk((val as Record<string, unknown>)[k]);
        }
      }
    };

    walk(payload);
    return Array.from(keys);
  }

  /**
   * Extrae los datos del servicio según el tipo de request
   */
  private getServiceData(createRequestDto: CreateRequestDto): any {
    if (createRequestDto.type === 'apertura-llc' && createRequestDto.aperturaLlcData) {
      return {
        ...createRequestDto.aperturaLlcData,
        llcType: createRequestDto.aperturaLlcData.llcType,
        members: createRequestDto.aperturaLlcData.members || [],
      };
    }
    if (createRequestDto.type === 'renovacion-llc' && createRequestDto.renovacionLlcData) {
      // Homologado: el frontend envía 'members' (igual que apertura-llc)
      const renovacionData = createRequestDto.renovacionLlcData as any;
      return {
        ...renovacionData,
        llcType: renovacionData.llcType,
        members: renovacionData.members || [], // Usar solo 'members' (homologado con apertura-llc)
      };
    }
    if (createRequestDto.type === 'cuenta-bancaria' && createRequestDto.cuentaBancariaData) {
      // El frontend envía 'owners' en cuentaBancariaData
      const cuentaData = createRequestDto.cuentaBancariaData as any;
      return {
        ...cuentaData,
        owners: cuentaData.owners || [],
      };
    }
    return {};
  }

  /**
   * Obtiene los datos del servicio para validación, combinando datos existentes con nuevos
   */
  private async getServiceDataForValidation(updateRequestDto: UpdateRequestDto, existingRequest: Request): Promise<any> {
    let existingData: any = {};
    
    // Obtener datos existentes según el tipo
    if (existingRequest.type === 'apertura-llc') {
      const aperturaRequest = await this.aperturaRepo.findOne({
        where: { requestId: existingRequest.id },
      });
      if (aperturaRequest) {
        existingData = { ...aperturaRequest };
        // Obtener miembros existentes
        const members = await this.memberRepo.find({
          where: { requestId: existingRequest.id },
        });
        existingData.members = members.map(m => ({
          firstName: m.firstName,
          lastName: m.lastName,
          passportNumber: m.passportNumber,
          scannedPassportUrl: m.scannedPassportUrl,
          nationality: m.nationality,
          email: m.email,
          phoneNumber: m.phoneNumber,
          percentageOfParticipation: m.percentageOfParticipation,
          memberAddress: m.memberAddress,
          validatesBankAccount: m.validatesBankAccount,
        }));
      }
    } else if (existingRequest.type === 'renovacion-llc') {
      const renovacionRequest = await this.renovacionRepo.findOne({
        where: { requestId: existingRequest.id },
      });
      if (renovacionRequest) {
        existingData = { ...renovacionRequest };
        // Los propietarios en renovación se manejan diferente, pero por ahora usamos los datos del DTO
      }
    } else if (existingRequest.type === 'cuenta-bancaria') {
      const cuentaRequest = await this.cuentaRepo.findOne({
        where: { requestId: existingRequest.id },
      });
      if (cuentaRequest) {
        existingData = { ...cuentaRequest };
      }
    }
    
    // Combinar datos existentes con los nuevos (los nuevos tienen prioridad)
    if (existingRequest.type === 'apertura-llc' && updateRequestDto.aperturaLlcData) {
      return {
        ...existingData,
        ...updateRequestDto.aperturaLlcData,
        llcType: updateRequestDto.aperturaLlcData.llcType || existingData.llcType,
        members: updateRequestDto.aperturaLlcData.members || existingData.members || [],
      };
    }
    if (existingRequest.type === 'renovacion-llc' && updateRequestDto.renovacionLlcData) {
      // Homologado: el frontend envía 'members' (igual que apertura-llc)
      const renovacionData = updateRequestDto.renovacionLlcData as any;
      return {
        ...existingData,
        ...renovacionData,
        llcType: renovacionData.llcType || existingData.llcType,
        members: renovacionData.members || existingData.members || [], // Usar solo 'members' (homologado con apertura-llc)
      };
    }
    if (existingRequest.type === 'cuenta-bancaria' && updateRequestDto.cuentaBancariaData) {
      // El frontend envía 'owners' en cuentaBancariaData
      const cuentaData = updateRequestDto.cuentaBancariaData as any;
      return {
        ...existingData,
        ...cuentaData,
        owners: cuentaData.owners || existingData.owners || [],
      };
    }
    
    return existingData;
  }

  constructor(
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
    // BankAccountOwner y BankAccountValidator ya no se usan - consolidados en Member y CuentaBancariaRequest
    // RequestRequiredDocument ya no se usa - eliminado
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stripeService: StripeService,
    private readonly userService: UserService,
    private readonly uploadFileService: UploadFileService,
    // ZohoCrmService ya no se usa - solo consultamos BD local
    // private readonly zohoCrmService: ZohoCrmService,
    private readonly zohoSyncService: ZohoSyncService,
    private readonly zohoContactService: ZohoContactService,
    private readonly requestSubmittedNotifications: RequestSubmittedNotificationsService,
  ) {}

  async findAllByUser(userId: number, role: 'client' | 'partner') {
    let requests: Request[];

    if (role === 'client') {
      // Una sola consulta: (client.userId = usuario) OR (email del Client = email del User).
      // Antes, si había un Client con userId pero la solicitud quedó ligada a otro Client (mismo email,
      // userId null o duplicados de flujo), solo se listaba por client.id del primero → lista vacía.
      const user = await this.userRepo.findOne({
        where: { id: userId },
      });
      const email = user?.email?.trim();
      if (!email) {
        this.logger.log(`[findAllByUser] role=client userId=${userId} sin email en User → []`);
        requests = [];
      } else {
        const emailNorm = email.toLowerCase();
        const qb = this.requestRepository
          .createQueryBuilder('request')
          .innerJoinAndSelect('request.client', 'client')
          .leftJoinAndSelect('request.partner', 'partner')
          .leftJoinAndSelect('request.aperturaLlcRequest', 'aperturaLlcRequest')
          .leftJoinAndSelect('request.renovacionLlcRequest', 'renovacionLlcRequest')
          .leftJoinAndSelect('request.cuentaBancariaRequest', 'cuentaBancariaRequest')
          .where(
            '(client.userId = :uid OR LOWER(TRIM(client.email)) = :emailNorm)',
            { uid: userId, emailNorm },
          )
          .andWhere('request.partnerId IS NULL')
          .orderBy('request.createdAt', 'DESC');
        requests = await qb.getMany();
        this.logger.log(
          `[findAllByUser] role=client userId=${userId} email=${email} unified count=${requests.length}`,
        );
        // Vincular Client al User cuando coincide el email y aún no hay user_id
        await this.clientRepo
          .createQueryBuilder()
          .update(Client)
          .set({ userId })
          .where('LOWER(TRIM(email)) = :emailNorm', { emailNorm })
          .andWhere('user_id IS NULL')
          .execute();
      }
    } else {
      requests = await this.requestRepository.find({
        where: { partnerId: userId },
        order: { createdAt: 'DESC' },
        relations: [
          'client',
          'partner',
          'aperturaLlcRequest',
          'renovacionLlcRequest',
          'cuentaBancariaRequest',
        ],
      });
    }

    // Cargar Members para cada solicitud de Apertura LLC o Renovación LLC
    for (const request of requests) {
      if (request.aperturaLlcRequest || request.renovacionLlcRequest) {
        const members = await this.memberRepo.find({
          where: { requestId: request.id },
          order: { id: 'ASC' },
        });
        (request as any).members = members;
        
        // Para renovación-llc, también agregar members como owners dentro de renovacionLlcRequest
        if (request.renovacionLlcRequest && members.length > 0) {
          const owners = members.map((member: any) => ({
            name: member.firstName || '',
            lastName: member.lastName || '',
            dateOfBirth: member.dateOfBirth || '',
            email: member.email || '',
            phone: member.phoneNumber || '',
            fullAddress: member.memberAddress?.street || '',
            unit: member.memberAddress?.unit || '',
            city: member.memberAddress?.city || '',
            stateRegion: member.memberAddress?.stateRegion || '',
            postalCode: member.memberAddress?.postalCode || '',
            country: member.memberAddress?.country || '',
            nationality: member.nationality || '',
            passportNumber: member.passportNumber || '',
            ssnItin: member.ssnOrItin || '',
            cuit: member.nationalTaxId || '',
            capitalContributions2025: member.ownerContributions2024 || 0,
            loansToLLC2025: member.ownerLoansToLLC2024 || 0,
            loansRepaid2025: member.loansReimbursedByLLC2024 || 0,
            capitalWithdrawals2025: member.profitDistributions2024 || 0,
            hasInvestmentsInUSA: member.hasUSFinancialInvestments || '',
            isUSCitizen: member.isUSCitizen || '',
            taxCountry: member.taxFilingCountry 
              ? (typeof member.taxFilingCountry === 'string' && member.taxFilingCountry.includes(',') 
                  ? member.taxFilingCountry.split(',').map((c: string) => c.trim())
                  : [member.taxFilingCountry])
              : [],
            wasInUSA31Days: member.spentMoreThan31DaysInUS || '',
            participationPercentage: member.percentageOfParticipation || 0,
          }));
          (request.renovacionLlcRequest as any).owners = owners;
        }
      }
    }

    return requests;
  }

  /**
   * Obtiene todas las aperturas LLC de un cliente para renovación
   * Puede buscar por clientId o por email del cliente
   */
  async getClientAperturas(clientId?: number, clientEmail?: string) {
    let whereCondition: any = {
      type: 'apertura-llc',
      status: 'completada', // Solo aperturas completadas pueden renovarse
    };

    if (clientId) {
      whereCondition.clientId = clientId;
    } else if (clientEmail) {
      // Buscar el cliente por email primero
      const client = await this.userRepo.findOne({
        where: { email: clientEmail, type: 'client' },
      });
      if (!client) {
        return []; // No hay cliente con ese email, retornar array vacío
      }
      whereCondition.clientId = client.id;
    } else {
      throw new BadRequestException('Se requiere clientId o clientEmail');
    }

    const aperturas = await this.requestRepository.find({
      where: whereCondition,
      relations: ['aperturaLlcRequest'],
      order: { createdAt: 'DESC' },
    });

    // Formatear la respuesta con información relevante para la selección
    return aperturas.map((request) => ({
      id: request.id,
      llcName: request.aperturaLlcRequest?.llcName || 'Sin nombre',
      incorporationState: request.aperturaLlcRequest?.incorporationState || '',
      llcType: request.aperturaLlcRequest?.llcType || 'single',
      createdAt: request.createdAt,
      // Incluir todos los datos de apertura para precargar
      aperturaData: request.aperturaLlcRequest,
    }));
  }

  async findOneByUuid(uuid: string) {
    const request = await this.requestRepository.findOne({
      where: { uuid },
      relations: [
        'client',
        'partner',
        'aperturaLlcRequest',
        'renovacionLlcRequest',
        'cuentaBancariaRequest',
      ],
    });
    if (!request) {
      throw new NotFoundException(`Request with UUID ${uuid} not found`);
    }

    // Corregir paso cuando el pago ya está pero currentStep quedó en 3 (wizard no actualizó al crear)
    const paymentDone =
      request.paymentMethod &&
      (request.paymentProofUrl || request.stripeChargeId || request.paymentStatus === 'succeeded');
    if (paymentDone && request.currentStep === 3) {
      request.currentStep = 4;
      await this.requestRepository.update(request.id, { currentStep: 4 });
    }

    // Cargar Members relacionados si es una solicitud de Apertura LLC o Renovación LLC
    if (request.aperturaLlcRequest || request.renovacionLlcRequest) {
      const members = await this.memberRepo.find({
        where: { requestId: request.id },
        order: { id: 'ASC' },
      });
      // Agregar members al objeto de respuesta
      (request as any).members = members;
      
      // Para renovación-llc, también agregar members como owners dentro de renovacionLlcRequest
      // para que el frontend pueda cargarlos correctamente
      if (request.renovacionLlcRequest && members.length > 0) {
        // Mapear members a formato owners que espera el frontend
        const owners = members.map((member: any) => ({
          name: member.firstName || '',
          lastName: member.lastName || '',
          dateOfBirth: member.dateOfBirth || '',
          email: member.email || '',
          phone: member.phoneNumber || '',
          fullAddress: member.memberAddress?.street || '',
          unit: member.memberAddress?.unit || '',
          city: member.memberAddress?.city || '',
          stateRegion: member.memberAddress?.stateRegion || '',
          postalCode: member.memberAddress?.postalCode || '',
          country: member.memberAddress?.country || '',
          nationality: member.nationality || '',
          passportNumber: member.passportNumber || '',
          ssnItin: member.ssnOrItin || '',
          cuit: member.nationalTaxId || '',
          capitalContributions: member.ownerContributions || 0,
          loansToLLC: member.ownerLoansToLLC || 0,
          loansRepaid: member.loansReimbursedByLLC || 0,
          capitalWithdrawals: member.profitDistributions || 0,
          hasInvestmentsInUSA: member.hasUSFinancialInvestments || '',
          isUSCitizen: member.isUSCitizen || '',
          taxCountry: member.taxFilingCountry 
            ? (typeof member.taxFilingCountry === 'string' && member.taxFilingCountry.includes(',') 
                ? member.taxFilingCountry.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0)
                : [member.taxFilingCountry])
            : [],
          wasInUSA31Days: member.spentMoreThan31DaysInUS || '',
          participationPercentage: member.percentageOfParticipation || 0,
        }));
        (request.renovacionLlcRequest as any).owners = owners;
      }
      
      // Mapear totalRevenue a totalRevenue2025 para compatibilidad con el frontend
      if (request.renovacionLlcRequest && request.renovacionLlcRequest.totalRevenue !== undefined) {
        (request.renovacionLlcRequest as any).totalRevenue2025 = request.renovacionLlcRequest.totalRevenue;
      }
    }

    // Cargar Members relacionados si es una solicitud de Cuenta Bancaria (ahora usan Member en lugar de BankAccountOwner)
    if (request.cuentaBancariaRequest) {
      // Cargar members (antes eran owners)
      const members = await this.memberRepo.find({
        where: { requestId: request.id },
        order: { id: 'ASC' },
      });
      (request as any).members = members;
      
      // Mapeo inverso: convertir campos de la entidad a nombres del frontend
      if (request.cuentaBancariaRequest) {
        const cuentaData = request.cuentaBancariaRequest as any;
        
        // legalBusinessIdentifier -> legalBusinessName
        if (cuentaData.legalBusinessIdentifier) {
          cuentaData.legalBusinessName = cuentaData.legalBusinessIdentifier;
        }
        
        // ein -> einNumber
        if (cuentaData.ein) {
          cuentaData.einNumber = cuentaData.ein;
        }
        
        // economicActivity -> briefDescription
        if (cuentaData.economicActivity) {
          cuentaData.briefDescription = cuentaData.economicActivity;
        }
        
        // certificateOfConstitutionOrArticlesUrl -> articlesOrCertificateUrl
        if (cuentaData.certificateOfConstitutionOrArticlesUrl) {
          cuentaData.articlesOrCertificateUrl = cuentaData.certificateOfConstitutionOrArticlesUrl;
        }
        
        // proofOfAddressUrl -> serviceBillUrl
        if (cuentaData.proofOfAddressUrl) {
          cuentaData.serviceBillUrl = cuentaData.proofOfAddressUrl;
        }
        
        // llcType -> isMultiMember
        if (cuentaData.llcType) {
          cuentaData.isMultiMember = cuentaData.llcType === 'multi' ? 'yes' : 'no';
        }
        
        // Construir campos individuales de registeredAgentAddress desde el string
        // Si registeredAgentState existe por separado, usarlo; sino, extraerlo de la dirección
        if (cuentaData.registeredAgentAddress && typeof cuentaData.registeredAgentAddress === 'string') {
          const addressParts = cuentaData.registeredAgentAddress.split(',').map((s: string) => s.trim());
          cuentaData.registeredAgentStreet = addressParts[0] || '';
          cuentaData.registeredAgentUnit = addressParts[1] || '';
          cuentaData.registeredAgentCity = addressParts[2] || '';
          // Usar registeredAgentState de la BD si existe, sino extraerlo de la dirección
          cuentaData.registeredAgentState = cuentaData.registeredAgentState || addressParts[3] || '';
          cuentaData.registeredAgentZipCode = addressParts[4] || '';
          cuentaData.registeredAgentCountry = addressParts[5] || '';
        } else if (cuentaData.registeredAgentState) {
          // Si solo existe registeredAgentState pero no la dirección completa, mantenerlo
          cuentaData.registeredAgentState = cuentaData.registeredAgentState;
        }
        
        // Construir campos individuales de ownerPersonalAddress desde el objeto JSONB
        if (cuentaData.ownerPersonalAddress && typeof cuentaData.ownerPersonalAddress === 'object') {
          cuentaData.ownerPersonalStreet = cuentaData.ownerPersonalAddress.street || '';
          cuentaData.ownerPersonalUnit = cuentaData.ownerPersonalAddress.unit || '';
          cuentaData.ownerPersonalCity = cuentaData.ownerPersonalAddress.city || '';
          cuentaData.ownerPersonalState = cuentaData.ownerPersonalAddress.state || '';
          cuentaData.ownerPersonalPostalCode = cuentaData.ownerPersonalAddress.postalCode || '';
          cuentaData.ownerPersonalCountry = cuentaData.ownerPersonalAddress.country || '';
        }
        
        // Cargar campos de la sección 2 (incorporationState, incorporationMonthYear, countriesWhereBusiness)
        // countriesWhereBusiness puede venir como string separado por comas, convertirlo a array para el frontend
        if (cuentaData.countriesWhereBusiness && typeof cuentaData.countriesWhereBusiness === 'string') {
          cuentaData.countriesWhereBusiness = cuentaData.countriesWhereBusiness 
            ? cuentaData.countriesWhereBusiness.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0)
            : [];
        } else if (!cuentaData.countriesWhereBusiness) {
          cuentaData.countriesWhereBusiness = [];
        }
        
        // IncorporationState e incorporationMonthYear se cargan directamente si existen
        if (cuentaData.incorporationState === undefined) {
          cuentaData.incorporationState = '';
        }
        if (cuentaData.incorporationMonthYear === undefined) {
          cuentaData.incorporationMonthYear = '';
        }
        
        // Mapear campos del validador desde Members (con validatesBankAccount = true)
        const validator = members.find((m: any) => m.validatesBankAccount === true);
        if (validator) {
          (request as any).bankAccountValidator = {
            firstName: validator.firstName || '',
            lastName: validator.lastName || '',
            dateOfBirth: validator.dateOfBirth || null,
            nationality: validator.nationality || '',
            passportNumber: validator.passportNumber || '',
            scannedPassportUrl: validator.scannedPassportUrl || '',
            workEmail: validator.email || '',
            phone: validator.phoneNumber || '',
            isUSResident: validator.isUSCitizen === 'si',
          };
        }
      }
    }

    // No consultamos Zoho - usamos solo datos de la BD local
    // Los datos ya están sincronizados en aperturaLlcRequest/renovacionLlcRequest/cuentaBancariaRequest
    // y en las relaciones con Members, Owners, Validators, etc.
    // El zohoAccountId se mantiene solo como referencia
    
    return request;
  }

  async findOne(id: number) {
    const request = await this.requestRepository.findOne({
      where: { id },
      relations: [
        'client',
        'partner',
        'aperturaLlcRequest',
        'renovacionLlcRequest',
        'cuentaBancariaRequest',
      ],
    });
    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    // Cargar Members relacionados si es una solicitud de Apertura LLC o Renovación LLC
    if (request.aperturaLlcRequest || request.renovacionLlcRequest) {
      const members = await this.memberRepo.find({
        where: { requestId: id },
        order: { id: 'ASC' },
      });
      // Agregar members al objeto de respuesta
      (request as any).members = members;
      
      // Para renovación-llc, también agregar members como owners dentro de renovacionLlcRequest
      // para que el frontend pueda cargarlos correctamente
      if (request.renovacionLlcRequest && members.length > 0) {
        // Mapear members a formato owners que espera el frontend
        const owners = members.map((member: any) => ({
          name: member.firstName || '',
          lastName: member.lastName || '',
          dateOfBirth: member.dateOfBirth || '',
          email: member.email || '',
          phone: member.phoneNumber || '',
          fullAddress: member.memberAddress?.street || '',
          unit: member.memberAddress?.unit || '',
          city: member.memberAddress?.city || '',
          stateRegion: member.memberAddress?.stateRegion || '',
          postalCode: member.memberAddress?.postalCode || '',
          country: member.memberAddress?.country || '',
          nationality: member.nationality || '',
          passportNumber: member.passportNumber || '',
          ssnItin: member.ssnOrItin || '',
          cuit: member.nationalTaxId || '',
          capitalContributions: member.ownerContributions || 0,
          loansToLLC: member.ownerLoansToLLC || 0,
          loansRepaid: member.loansReimbursedByLLC || 0,
          capitalWithdrawals: member.profitDistributions || 0,
          hasInvestmentsInUSA: member.hasUSFinancialInvestments || '',
          isUSCitizen: member.isUSCitizen || '',
          taxCountry: member.taxFilingCountry 
            ? (typeof member.taxFilingCountry === 'string' && member.taxFilingCountry.includes(',') 
                ? member.taxFilingCountry.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0)
                : [member.taxFilingCountry])
            : [],
          wasInUSA31Days: member.spentMoreThan31DaysInUS || '',
          participationPercentage: member.percentageOfParticipation || 0,
        }));
        (request.renovacionLlcRequest as any).owners = owners;
      }
      
      // Mapear totalRevenue a totalRevenue2025 para compatibilidad con el frontend
      if (request.renovacionLlcRequest && request.renovacionLlcRequest.totalRevenue !== undefined) {
        (request.renovacionLlcRequest as any).totalRevenue2025 = request.renovacionLlcRequest.totalRevenue;
      }
    }

    // Cargar Members relacionados si es una solicitud de Cuenta Bancaria (ahora usan Member en lugar de BankAccountOwner)
    if (request.cuentaBancariaRequest) {
      // Cargar members (antes eran owners)
      const members = await this.memberRepo.find({
        where: { requestId: id },
        order: { id: 'ASC' },
      });
      (request as any).members = members;
      
      // Mapeo inverso: convertir campos de la entidad a nombres del frontend
      if (request.cuentaBancariaRequest) {
        const cuentaData = request.cuentaBancariaRequest as any;
        
        // legalBusinessIdentifier -> legalBusinessName
        if (cuentaData.legalBusinessIdentifier) {
          cuentaData.legalBusinessName = cuentaData.legalBusinessIdentifier;
        }
        
        // ein -> einNumber
        if (cuentaData.ein) {
          cuentaData.einNumber = cuentaData.ein;
        }
        
        // economicActivity -> briefDescription
        if (cuentaData.economicActivity) {
          cuentaData.briefDescription = cuentaData.economicActivity;
        }
        
        // certificateOfConstitutionOrArticlesUrl -> articlesOrCertificateUrl
        if (cuentaData.certificateOfConstitutionOrArticlesUrl) {
          cuentaData.articlesOrCertificateUrl = cuentaData.certificateOfConstitutionOrArticlesUrl;
        }
        
        // proofOfAddressUrl -> serviceBillUrl
        if (cuentaData.proofOfAddressUrl) {
          cuentaData.serviceBillUrl = cuentaData.proofOfAddressUrl;
        }
        
        // llcType -> isMultiMember
        if (cuentaData.llcType) {
          cuentaData.isMultiMember = cuentaData.llcType === 'multi' ? 'yes' : 'no';
        }
        
        // Construir campos individuales de registeredAgentAddress desde el string
        // Si registeredAgentState existe por separado, usarlo; sino, extraerlo de la dirección
        if (cuentaData.registeredAgentAddress && typeof cuentaData.registeredAgentAddress === 'string') {
          const addressParts = cuentaData.registeredAgentAddress.split(',').map((s: string) => s.trim());
          cuentaData.registeredAgentStreet = addressParts[0] || '';
          cuentaData.registeredAgentUnit = addressParts[1] || '';
          cuentaData.registeredAgentCity = addressParts[2] || '';
          // Usar registeredAgentState de la BD si existe, sino extraerlo de la dirección
          cuentaData.registeredAgentState = cuentaData.registeredAgentState || addressParts[3] || '';
          cuentaData.registeredAgentZipCode = addressParts[4] || '';
          cuentaData.registeredAgentCountry = addressParts[5] || '';
        } else if (cuentaData.registeredAgentState) {
          // Si solo existe registeredAgentState pero no la dirección completa, mantenerlo
          cuentaData.registeredAgentState = cuentaData.registeredAgentState;
        }
        
        // Construir campos individuales de ownerPersonalAddress desde el objeto JSONB
        if (cuentaData.ownerPersonalAddress && typeof cuentaData.ownerPersonalAddress === 'object') {
          cuentaData.ownerPersonalStreet = cuentaData.ownerPersonalAddress.street || '';
          cuentaData.ownerPersonalUnit = cuentaData.ownerPersonalAddress.unit || '';
          cuentaData.ownerPersonalCity = cuentaData.ownerPersonalAddress.city || '';
          cuentaData.ownerPersonalState = cuentaData.ownerPersonalAddress.state || '';
          cuentaData.ownerPersonalPostalCode = cuentaData.ownerPersonalAddress.postalCode || '';
          cuentaData.ownerPersonalCountry = cuentaData.ownerPersonalAddress.country || '';
        }
        
        // Cargar campos de la sección 2 (incorporationState, incorporationMonthYear, countriesWhereBusiness)
        // countriesWhereBusiness puede venir como string separado por comas, convertirlo a array para el frontend
        if (cuentaData.countriesWhereBusiness && typeof cuentaData.countriesWhereBusiness === 'string') {
          cuentaData.countriesWhereBusiness = cuentaData.countriesWhereBusiness 
            ? cuentaData.countriesWhereBusiness.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0)
            : [];
        } else if (!cuentaData.countriesWhereBusiness) {
          cuentaData.countriesWhereBusiness = [];
        }
        
        // IncorporationState e incorporationMonthYear se cargan directamente si existen
        if (cuentaData.incorporationState === undefined) {
          cuentaData.incorporationState = '';
        }
        if (cuentaData.incorporationMonthYear === undefined) {
          cuentaData.incorporationMonthYear = '';
        }
        
        // Mapear campos del validador desde Members (con validatesBankAccount = true)
        const validator = members.find((m: any) => m.validatesBankAccount === true);
        if (validator) {
          (request as any).bankAccountValidator = {
            firstName: validator.firstName || '',
            lastName: validator.lastName || '',
            dateOfBirth: validator.dateOfBirth || null,
            nationality: validator.nationality || '',
            passportNumber: validator.passportNumber || '',
            scannedPassportUrl: validator.scannedPassportUrl || '',
            workEmail: validator.email || '',
            phone: validator.phoneNumber || '',
            isUSResident: validator.isUSCitizen === 'si',
          };
        }
      }
    }

    // No consultamos Zoho - usamos solo datos de la BD local
    // Los datos ya están sincronizados en aperturaLlcRequest/renovacionLlcRequest/cuentaBancariaRequest
    // y en las relaciones con Members, Owners, Validators, etc.
    // El zohoAccountId se mantiene solo como referencia
    
    return request;
  }

  async create(
    createRequestDto: CreateRequestDto,
    actorUser?: PanelRequestActorUser | null,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let clientId = createRequestDto.clientId;
      let client: Client | null = null;

      // Si clientId es 0 y hay clientData, crear o obtener el cliente
      if (clientId === 0 && createRequestDto.clientData) {
        const { email, firstName, lastName, phone } = createRequestDto.clientData;
        
        // Buscar si el cliente ya existe por email (en clients)
        client = await this.clientRepo.findOne({
          where: { email },
        });

        if (!client) {
          // Buscar en users si existe un usuario con ese email
          const existingUser = await this.userRepo.findOne({
            where: { email, type: 'client' },
          });

          if (existingUser) {
            // Si existe un User, crear un Client asociado
            client = this.clientRepo.create({
              email,
              full_name: `${firstName} ${lastName}`.trim(),
              phone: phone || '',
              userId: existingUser.id,
              partnerId: createRequestDto.partnerId,
              status: true,
            });
            client = await queryRunner.manager.save(Client, client);
            this.logger.log(`Cliente creado desde User existente: ${client.id} - ${client.email}`);
          } else {
            // Lógica según si hay partner o no
            if (createRequestDto.partnerId) {
              // Si hay partner: solo crear Client (sin User)
              client = this.clientRepo.create({
                email,
                full_name: `${firstName} ${lastName}`.trim(),
                phone: phone || '',
                partnerId: createRequestDto.partnerId,
                status: true,
              });
              client = await queryRunner.manager.save(Client, client);
              this.logger.log(`Cliente creado (sin User, con partner): ${client.id} - ${client.email}`);
            } else {
              // Si NO hay partner: crear User y Client asociado
              // Generar una contraseña temporal
              const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';
              
              // Crear nuevo usuario
              const newUser = this.userRepo.create({
                email,
                first_name: firstName,
                last_name: lastName,
                phone: phone || '',
                type: 'client',
                status: true,
                // Generar un username basado en el email
                username: email.split('@')[0] + Math.floor(Math.random() * 1000),
                // Generar una contraseña temporal (el usuario deberá cambiarla)
                password: encodePassword(tempPassword),
              });
              const savedUser = await queryRunner.manager.save(User, newUser);
              this.logger.log(`Usuario creado: ${savedUser.id} - ${savedUser.email}`);
              
              // Crear Client asociado al User
              client = this.clientRepo.create({
                email,
                full_name: `${firstName} ${lastName}`.trim(),
                phone: phone || '',
                userId: savedUser.id,
                // partnerId: undefined (sin partner, no se incluye)
                status: true,
              });
              client = await queryRunner.manager.save(Client, client);
              this.logger.log(`Cliente creado (con User, sin partner): ${client.id} - ${client.email}`);
              // TODO: Enviar email con la contraseña temporal (comentado por ahora)
              // await this.userService.sendWelcomeEmail(savedUser.email, tempPassword);
            }
          }
        }
        
        clientId = client.id;
      } else {
        // Validar que el cliente existe
        // Primero buscar en la tabla clients (PartnerClient)
        client = await this.clientRepo.findOne({
          where: { id: clientId },
        });
        
        if (!client) {
          // Si no se encuentra en clients, buscar en users
          // Si existe un User con type='client', crear un Client asociado
          const existingUser = await this.userRepo.findOne({
            where: { id: clientId, type: 'client' },
          });
          
          if (existingUser) {
            // Crear un Client asociado al User existente
            // Si hay partnerId, asociarlo; si no, no incluir partnerId (cliente independiente)
            const clientData: Partial<Client> = {
              email: existingUser.email,
              full_name: `${existingUser.first_name || ''} ${existingUser.last_name || ''}`.trim() || existingUser.email,
              phone: existingUser.phone || '',
              userId: existingUser.id,
              status: existingUser.status,
            };
            // Solo incluir partnerId si existe
            if (createRequestDto.partnerId) {
              clientData.partnerId = createRequestDto.partnerId;
            }
            const newClient = this.clientRepo.create(clientData);
            client = await queryRunner.manager.save(Client, newClient);
            this.logger.log(`Cliente creado desde User existente: ${client.id} - ${client.email}`);
            clientId = client.id; // Actualizar clientId para usar el nuevo Client
          } else {
            throw new NotFoundException(
              `Cliente con ID ${clientId} no encontrado`,
            );
          }
        }
      }

      // Validar que el partner existe si se proporciona
      if (createRequestDto.partnerId) {
        const partner = await this.userRepo.findOne({
          where: { id: createRequestDto.partnerId },
        });
        if (!partner) {
          throw new NotFoundException(
            `Partner con ID ${createRequestDto.partnerId} no encontrado`,
          );
        }
      }

      // Validar currentStepNumber según el tipo (omitido en borrador → 1)
      const maxSteps = RequestsService.WIZARD_MAX_STEPS_BY_TYPE;
      const sectionStep =
        createRequestDto.currentStepNumber == null
          ? 1
          : createRequestDto.currentStepNumber;
      if (
        sectionStep < 1 ||
        sectionStep > maxSteps[createRequestDto.type]
      ) {
        throw new BadRequestException(
          `currentStepNumber debe estar entre 1 y ${maxSteps[createRequestDto.type]} para tipo ${createRequestDto.type}`,
        );
      }

      // Prioridad: pago en este request → solicitud-recibida (o status explícito);
      // partner + último paso sin pago → solicitud-recibida; si no → pendiente.
      const willProcessPayment = !!(createRequestDto.stripeToken && createRequestDto.paymentAmount);
      let requestStatus: 'pendiente' | 'solicitud-recibida';
      if (willProcessPayment) {
        requestStatus = (createRequestDto.status || 'solicitud-recibida') as
          | 'pendiente'
          | 'solicitud-recibida';
      } else if (
        this.isPartnerContext(createRequestDto.partnerId) &&
        sectionStep === this.maxWizardStepForType(createRequestDto.type)
      ) {
        requestStatus = 'solicitud-recibida';
      } else {
        requestStatus = 'pendiente';
      }

      // Validación dinámica según tipo de servicio y sección
      // Si se va a procesar el pago, validar todo estrictamente
      // Si es borrador (pendiente), validar solo campos de la sección actual
      const serviceData = this.getServiceData(createRequestDto);
      
      try {
        validateRequestData(
          serviceData,
          createRequestDto.type,
          sectionStep,
          requestStatus, // 'pendiente' durante wizard, 'solicitud-recibida' al procesar pago
        );
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(`Error de validación: ${error.message}`);
      }

      // Procesar pago con Stripe si se proporciona un token
      let paymentResult: any = null;
      if (createRequestDto.stripeToken && createRequestDto.paymentAmount) {
        try {
          this.logger.log(
            `Procesando pago con Stripe: ${createRequestDto.paymentAmount} USD`,
          );
          
          const charge = await this.stripeService.createCharge(
            createRequestDto.stripeToken,
            createRequestDto.paymentAmount,
            'usd',
            `Pago de solicitud - ${createRequestDto.type}`,
          );

          paymentResult = {
            chargeId: charge.id,
            amount: charge.amount / 100, // Convertir de centavos a dólares
            currency: charge.currency,
            status: charge.status,
            paid: charge.paid,
            receiptUrl: charge.receipt_url,
          };

          this.logger.log(`Pago procesado exitosamente: ${charge.id}`);
        } catch (error: any) {
          this.logger.error(`Error al procesar pago: ${error.message}`);
          await queryRunner.rollbackTransaction();
          throw error; // Re-lanzar el error para que el cliente lo vea
        }
      }

      // Crear la solicitud base
      // Si se procesó el pago, status es 'solicitud-recibida', sino 'pendiente' (borrador)
      // Plan: aceptar desde createRequestDto.plan o desde aperturaLlcData.plan (apertura-llc)
      const plan =
        createRequestDto.type === 'apertura-llc'
          ? (createRequestDto.plan ??
              (createRequestDto.aperturaLlcData as any)?.plan ??
              null)
          : undefined;
      const request = this.requestRepository.create({
        type: createRequestDto.type,
        status: requestStatus, // Ya determinado arriba: 'pendiente' o 'solicitud-recibida'
        currentStep: createRequestDto.currentStep, // Paso principal del wizard
        clientId: clientId,
        partnerId: createRequestDto.partnerId,
        notes: createRequestDto.notes,
        plan,
        // Información de pago
        paymentMethod: createRequestDto.paymentMethod,
        paymentAmount: createRequestDto.paymentAmount,
        stripeChargeId: paymentResult?.chargeId,
        paymentStatus: paymentResult?.status || (createRequestDto.paymentMethod === 'transferencia' ? 'pending' : null),
        paymentProofUrl: createRequestDto.paymentProofUrl,
      });
      const savedRequest = await queryRunner.manager.save(Request, request);

      // Crear la solicitud específica según el tipo
      if (createRequestDto.type === 'apertura-llc') {
        if (!createRequestDto.aperturaLlcData) {
          throw new BadRequestException(
            'aperturaLlcData es requerido para tipo apertura-llc',
          );
        }

        const { members, ...aperturaDataFields } =
          createRequestDto.aperturaLlcData;

        // Validar miembros según el tipo de LLC
        if (sectionStep >= 6) {
          if (aperturaDataFields.llcType === 'multi') {
            if (!members || members.length < 2) {
              throw new BadRequestException(
                'Una LLC multi-member requiere al menos 2 miembros',
              );
            }
          } else if (aperturaDataFields.llcType === 'single') {
            if (!members || members.length !== 1) {
              throw new BadRequestException(
                'Una LLC single-member requiere exactamente 1 miembro',
              );
            }
          }
        }

        // Determinar qué secciones se deben procesar según currentStepNumber
        const currentStep = sectionStep;
        const aperturaDataToCreate: any = {
          requestId: savedRequest.id,
          currentStepNumber: sectionStep,
          ...aperturaDataFields,
        };
        
        // Eliminar campos de secciones que aún no se han completado
        // Sección 1 - solo procesar si currentStepNumber >= 1
        if (currentStep < 1) {
          delete aperturaDataToCreate.llcName;
          delete aperturaDataToCreate.llcNameOption2;
          delete aperturaDataToCreate.llcNameOption3;
          delete aperturaDataToCreate.incorporationState;
          delete aperturaDataToCreate.businessDescription;
          delete aperturaDataToCreate.llcType;
          delete aperturaDataToCreate.linkedin;
        }
        
        // Sección 3 - Si los datos están presentes, guardarlos independientemente del currentStep
        // Solo eliminar si currentStep < 3 Y los campos no están presentes en el payload
        // (Si están presentes, significa que el usuario los está enviando y deben guardarse)
        const aperturaDataFieldsAny = aperturaDataFields as any;
        if (currentStep < 3) {
          // Solo eliminar si no están presentes (permitir guardar si vienen en el payload)
          if (aperturaDataFieldsAny.serviceBillUrl === undefined) delete aperturaDataToCreate.serviceBillUrl;
          if (aperturaDataFieldsAny.bankStatementUrl === undefined) delete aperturaDataToCreate.bankStatementUrl;
          if (aperturaDataFieldsAny.periodicIncome10k === undefined) delete aperturaDataToCreate.periodicIncome10k;
          if (aperturaDataFieldsAny.bankAccountLinkedEmail === undefined) delete aperturaDataToCreate.bankAccountLinkedEmail;
          if (aperturaDataFieldsAny.bankAccountLinkedPhone === undefined) delete aperturaDataToCreate.bankAccountLinkedPhone;
          if (aperturaDataFieldsAny.actividadFinancieraEsperada === undefined) delete aperturaDataToCreate.actividadFinancieraEsperada;
          if (aperturaDataFieldsAny.projectOrCompanyUrl === undefined) delete aperturaDataToCreate.projectOrCompanyUrl;
        }
        
        // Eliminar campos que no existen en el formulario (EIN relacionados)
        delete aperturaDataToCreate.hasEin;
        delete aperturaDataToCreate.einNumber;
        delete aperturaDataToCreate.einDocumentUrl;
        delete aperturaDataToCreate.noEinReason;
        delete aperturaDataToCreate.incorporationDate;
        delete aperturaDataToCreate.certificateOfFormationUrl;
        delete aperturaDataToCreate.accountType;
        delete aperturaDataToCreate.estadoConstitucion;
        delete aperturaDataToCreate.annualRevenue;
        delete aperturaDataToCreate.llcPhoneNumber;
        delete aperturaDataToCreate.website;
        delete aperturaDataToCreate.llcEmail;
        delete aperturaDataToCreate.registeredAgentAddress;
        delete aperturaDataToCreate.registeredAgentName;
        delete aperturaDataToCreate.registeredAgentEmail;
        delete aperturaDataToCreate.registeredAgentPhone;
        delete aperturaDataToCreate.registeredAgentType;
        delete aperturaDataToCreate.needsBankVerificationHelp;
        delete aperturaDataToCreate.bankAccountType;
        delete aperturaDataToCreate.bankName;
        delete aperturaDataToCreate.bankAccountNumber;
        delete aperturaDataToCreate.bankRoutingNumber;
        delete aperturaDataToCreate.veracityConfirmation;
        delete aperturaDataToCreate.ownerNationality;
        delete aperturaDataToCreate.ownerCountryOfResidence;
        delete aperturaDataToCreate.ownerPersonalAddress;
        delete aperturaDataToCreate.ownerPhoneNumber;
        delete aperturaDataToCreate.ownerEmail;
        delete aperturaDataToCreate.almacenaProductosDepositoUSA;
        delete aperturaDataToCreate.declaroImpuestosAntes;
        delete aperturaDataToCreate.llcConStartCompanies;
        delete aperturaDataToCreate.ingresosMayor250k;
        delete aperturaDataToCreate.activosEnUSA;
        delete aperturaDataToCreate.ingresosPeriodicos10k;
        delete aperturaDataToCreate.contrataServiciosUSA;
        delete aperturaDataToCreate.propiedadEnUSA;
        delete aperturaDataToCreate.tieneCuentasBancarias;
        
        // Solo incluir llcType si tiene un valor válido ('single' o 'multi')
        if (aperturaDataToCreate.llcType !== 'single' && aperturaDataToCreate.llcType !== 'multi') {
          delete aperturaDataToCreate.llcType;
        }

        const webErr = applyOptionalPublicWebUrlsToObject(aperturaDataToCreate, [
          'linkedin',
          'projectOrCompanyUrl',
        ]);
        if (webErr) {
          throw new BadRequestException(webErr);
        }

        const aperturaData = this.aperturaRepo.create(aperturaDataToCreate);
        await queryRunner.manager.save(AperturaLlcRequest, aperturaData);

        // Crear miembros solo si estamos en la sección 2 o superior (donde se capturan los miembros)
        // Filtrar miembros vacíos (sin datos básicos)
        if (sectionStep >= 2 && members && members.length > 0) {
          // Filtrar miembros que tengan al menos algún dato (no completamente vacíos)
          const validMembers = members.filter((m: any) => 
            m.firstName || m.lastName || m.email || m.passportNumber
          );
          
          if (validMembers.length > 0) {
            // Validar que solo un miembro valide la cuenta bancaria
            const validators = validMembers.filter((m: any) => m.validatesBankAccount);
            if (validators.length > 1) {
              throw new BadRequestException(
                'Solo un miembro puede validar la cuenta bancaria',
              );
            }

            const membersToSave = validMembers.map((memberDto: any) => {
              const { dateOfBirth, ...memberDataWithoutDate } = memberDto;
              const parsedDate = this.parseDate(dateOfBirth);
              return this.memberRepo.create({
                requestId: savedRequest.id,
                ...memberDataWithoutDate,
                ...(parsedDate ? { dateOfBirth: parsedDate } : {}),
              });
            }) as unknown as Member[];
            await queryRunner.manager.save(Member, membersToSave);
          }
        }
      } else if (createRequestDto.type === 'renovacion-llc') {
        if (!createRequestDto.renovacionLlcData) {
          throw new BadRequestException(
            'renovacionLlcData es requerido para tipo renovacion-llc',
          );
        }

        const { members, ...renovacionDataFields } =
          createRequestDto.renovacionLlcData;

        // Validar miembros según el tipo de LLC
        if (sectionStep >= 2) {
          if (renovacionDataFields.llcType === 'multi') {
            if (!members || members.length < 2) {
              throw new BadRequestException(
                'Una LLC multi-member requiere al menos 2 miembros',
              );
            }
          } else if (renovacionDataFields.llcType === 'single') {
            if (!members || members.length !== 1) {
              throw new BadRequestException(
                'Una LLC single-member requiere exactamente 1 miembro',
              );
            }
          }
        }

        // Eliminar campos que no existen en el formulario (campos obsoletos o no usados)
        const renovacionDataToCreate: any = {
          requestId: savedRequest.id,
          currentStepNumber: sectionStep,
          ...renovacionDataFields,
        };
        
        // Eliminar campos obsoletos
        delete renovacionDataToCreate.declaracionInicial;
        delete renovacionDataToCreate.cambioDireccionRA;
        delete renovacionDataToCreate.agregarCambiarSocio;
        delete renovacionDataToCreate.declaracionCierre;
        delete renovacionDataToCreate.owners; // Ya se procesa por separado como members
        delete renovacionDataToCreate.members; // Se procesa por separado
        // Eliminar campos obsoletos que existen en BD pero no en la entidad
        delete renovacionDataToCreate.data_is_correct;
        delete renovacionDataToCreate.dataIsCorrect;
        delete renovacionDataToCreate.observations;
        delete renovacionDataToCreate.payment_method;
        delete renovacionDataToCreate.paymentMethod;
        delete renovacionDataToCreate.amount_to_pay;
        delete renovacionDataToCreate.amountToPay;
        delete renovacionDataToCreate.wants_invoice;
        delete renovacionDataToCreate.wantsInvoice;
        delete renovacionDataToCreate.payment_proof_url;
        delete renovacionDataToCreate.paymentProofUrl;
        // Mapear totalRevenue2025 a totalRevenue si existe
        if (renovacionDataToCreate.totalRevenue2025 !== undefined) {
          renovacionDataToCreate.totalRevenue = renovacionDataToCreate.totalRevenue2025;
          delete renovacionDataToCreate.totalRevenue2025;
        }

        this.sanitizeRenovacionLlcNumericFields(renovacionDataToCreate);

        const renovacionData = this.renovacionRepo.create(renovacionDataToCreate);
        await queryRunner.manager.save(RenovacionLlcRequest, renovacionData);

        // Crear miembros solo si estamos en la sección 2 o superior (donde se capturan los miembros)
        // Filtrar miembros vacíos (sin datos básicos)
        if (createRequestDto.currentStepNumber >= 2 && members && members.length > 0) {
          // Filtrar miembros que tengan al menos algún dato (no completamente vacíos)
          const validMembers = members.filter((m: any) => 
            m.firstName || m.lastName || m.email || m.passportNumber || m.name || m.lastName
          );
          
          if (validMembers.length > 0) {
            const membersToSave = validMembers.map((memberDto: any) => {
              const { dateOfBirth, ...memberDataWithoutDate } = memberDto;
              const parsedDate = this.parseDate(dateOfBirth);
              return this.memberRepo.create({
                requestId: savedRequest.id,
                ...memberDataWithoutDate,
                ...(parsedDate ? { dateOfBirth: parsedDate } : {}),
              });
            }) as unknown as Member[];
            await queryRunner.manager.save(Member, membersToSave);
          }
        }
      } else if (createRequestDto.type === 'cuenta-bancaria') {
        if (!createRequestDto.cuentaBancariaData) {
          throw new BadRequestException(
            'cuentaBancariaData es requerido para tipo cuenta-bancaria',
          );
        }

        const cuentaDataRaw: any = { ...createRequestDto.cuentaBancariaData };
        
        // Mapear campos del frontend a nombres de la entidad
        // articlesOrCertificateUrl -> certificateOfConstitutionOrArticlesUrl
        if (cuentaDataRaw.articlesOrCertificateUrl !== undefined) {
          cuentaDataRaw.certificateOfConstitutionOrArticlesUrl = cuentaDataRaw.articlesOrCertificateUrl;
          delete cuentaDataRaw.articlesOrCertificateUrl;
        }
        
        // serviceBillUrl -> proofOfAddressUrl
        if (cuentaDataRaw.serviceBillUrl !== undefined) {
          cuentaDataRaw.proofOfAddressUrl = cuentaDataRaw.serviceBillUrl;
          delete cuentaDataRaw.serviceBillUrl;
        }
        
        // legalBusinessName -> legalBusinessIdentifier
        if (cuentaDataRaw.legalBusinessName !== undefined) {
          cuentaDataRaw.legalBusinessIdentifier = cuentaDataRaw.legalBusinessName;
          delete cuentaDataRaw.legalBusinessName;
        }
        
        // einNumber -> ein
        if (cuentaDataRaw.einNumber !== undefined) {
          cuentaDataRaw.ein = cuentaDataRaw.einNumber;
          delete cuentaDataRaw.einNumber;
        }
        
        // briefDescription -> economicActivity
        if (cuentaDataRaw.briefDescription !== undefined) {
          cuentaDataRaw.economicActivity = cuentaDataRaw.briefDescription;
          delete cuentaDataRaw.briefDescription;
        }
        
        // Guardar campos individuales de registeredAgent (sección 2)
        // Los campos se guardan directamente como columnas individuales, no como JSONB
        // No es necesario construir companyAddress, los campos se guardan directamente
        // registeredAgentStreet, registeredAgentUnit, registeredAgentCity, registeredAgentState,
        // registeredAgentZipCode, registeredAgentCountry se guardan como columnas individuales
        
        // Construir ownerPersonalAddress desde campos individuales (sección 4)
        if (cuentaDataRaw.ownerPersonalStreet || cuentaDataRaw.ownerPersonalCity || cuentaDataRaw.ownerPersonalState) {
          cuentaDataRaw.ownerPersonalAddress = {
            street: cuentaDataRaw.ownerPersonalStreet || '',
            unit: cuentaDataRaw.ownerPersonalUnit || '',
            city: cuentaDataRaw.ownerPersonalCity || '',
            state: cuentaDataRaw.ownerPersonalState || '',
            postalCode: cuentaDataRaw.ownerPersonalPostalCode || '',
            country: cuentaDataRaw.ownerPersonalCountry || ''
          };
          
          // Eliminar campos individuales después de construir la dirección
          delete cuentaDataRaw.ownerPersonalStreet;
          delete cuentaDataRaw.ownerPersonalUnit;
          delete cuentaDataRaw.ownerPersonalCity;
          delete cuentaDataRaw.ownerPersonalState;
          delete cuentaDataRaw.ownerPersonalPostalCode;
          delete cuentaDataRaw.ownerPersonalCountry;
        }
        
        // Eliminar campos que se procesan por separado
        delete cuentaDataRaw.owners; // Se procesa por separado
        delete cuentaDataRaw.validators; // Se procesa por separado
        
        // Guardar campos de la sección 2 (incorporationState, incorporationMonthYear, countriesWhereBusiness)
        // Convertir countriesWhereBusiness de array a string separado por comas si viene como array
        if (cuentaDataRaw.countriesWhereBusiness !== undefined) {
          if (Array.isArray(cuentaDataRaw.countriesWhereBusiness)) {
            cuentaDataRaw.countriesWhereBusiness = cuentaDataRaw.countriesWhereBusiness.length > 0 
              ? cuentaDataRaw.countriesWhereBusiness.join(', ') 
              : '';
          } else if (cuentaDataRaw.countriesWhereBusiness === '' || cuentaDataRaw.countriesWhereBusiness === null) {
            cuentaDataRaw.countriesWhereBusiness = '';
          }
          // Si ya es string, mantenerlo tal cual
        }
        
        // Guardar incorporationState e incorporationMonthYear si vienen
        if (cuentaDataRaw.incorporationState !== undefined) {
          cuentaDataRaw.incorporationState = cuentaDataRaw.incorporationState || '';
        }
        
        if (cuentaDataRaw.incorporationMonthYear !== undefined) {
          cuentaDataRaw.incorporationMonthYear = cuentaDataRaw.incorporationMonthYear || '';
        }
        
        // Mapear isMultiMember a llcType
        // 'yes' -> 'multi', 'no' -> 'single'
        // Solo mapear si isMultiMember tiene un valor válido Y estamos en la sección 5 o superior
        // El campo isMultiMember solo se completa en la sección 5, antes de eso no debe incluirse llcType
        // El constraint check_cuenta_llc_type solo permite 'single' o 'multi', no NULL ni cadena vacía
        const currentStep = createRequestDto.currentStepNumber || 1;
        const isSection5OrHigher = currentStep >= 5;
        
        if (isSection5OrHigher && cuentaDataRaw.isMultiMember !== undefined && cuentaDataRaw.isMultiMember !== '' && cuentaDataRaw.isMultiMember !== null) {
          // Solo mapear si estamos en la sección 5 o superior y hay un valor válido
          // 'no' -> 'single', 'yes' -> 'multi'
          if (cuentaDataRaw.isMultiMember === 'no') {
            cuentaDataRaw.llcType = 'single';
          } else if (cuentaDataRaw.isMultiMember === 'yes') {
            cuentaDataRaw.llcType = 'multi';
          }
          delete cuentaDataRaw.isMultiMember;
        } else {
          // Si no estamos en la sección 5 o superior, o isMultiMember no tiene valor válido,
          // eliminar llcType si existe para que no se intente guardar un valor inválido
          delete cuentaDataRaw.llcType;
          delete cuentaDataRaw.isMultiMember;
        }
        
        // Si llcType viene como null o undefined, eliminarlo (no se ha completado la sección 5)
        // Nota: llcType no puede ser cadena vacía según el tipo, solo 'single' | 'multi' | undefined
        if (cuentaDataRaw.llcType === null || cuentaDataRaw.llcType === undefined) {
          delete cuentaDataRaw.llcType;
        }
        
        // Procesar owners y validators antes de crear cuentaData
        const cuentaBancariaData = createRequestDto.cuentaBancariaData as any;
        const owners = cuentaBancariaData?.owners || [];
        const validators = cuentaBancariaData?.validators || [];
        
        // Sección 4 (dirección personal) - solo procesar si currentStepNumber >= 4
        if (currentStep < 4) {
          delete cuentaDataRaw.ownerPersonalStreet;
          delete cuentaDataRaw.ownerPersonalUnit;
          delete cuentaDataRaw.ownerPersonalCity;
          delete cuentaDataRaw.ownerPersonalState;
          delete cuentaDataRaw.ownerPersonalCountry;
          delete cuentaDataRaw.ownerPersonalPostalCode;
          delete cuentaDataRaw.ownerPersonalAddress;
          delete cuentaDataRaw.serviceBillUrl;
          delete cuentaDataRaw.proofOfAddressUrl;
        }
        
        // El validator ahora se guarda como un member con validatesBankAccount = true
        // No se guarda en cuenta_bancaria_requests
        
        // Establecer bankService por defecto a "Relay" si no viene
        if (cuentaDataRaw.bankService === undefined || cuentaDataRaw.bankService === null || cuentaDataRaw.bankService === '') {
          cuentaDataRaw.bankService = 'Relay';
        }
        
        // current_step_number es NOT NULL en BD; el panel a veces no envía currentStepNumber en el DTO raíz
        const cuentaStepNumber =
          [cuentaDataRaw.currentStepNumber, cuentaDataRaw.currentSection, createRequestDto.currentStepNumber, currentStep].find(
            (v) => typeof v === 'number' && !Number.isNaN(v) && v >= 1,
          ) ?? 1;
        delete cuentaDataRaw.currentSection;

        // Preparar datos para crear, excluyendo llcType si no tiene un valor válido
        const cuentaDataToCreate: any = {
          requestId: savedRequest.id,
          ...cuentaDataRaw,
          currentStepNumber: cuentaStepNumber,
        };
        
        // Solo incluir llcType si tiene un valor válido ('single' o 'multi')
        if (cuentaDataRaw.llcType === 'single' || cuentaDataRaw.llcType === 'multi') {
          cuentaDataToCreate.llcType = cuentaDataRaw.llcType;
        }

        const cuentaWebErr = applyOptionalPublicWebUrlsToObject(
          cuentaDataToCreate as Record<string, unknown>,
          ['websiteOrSocialMedia'],
        );
        if (cuentaWebErr) {
          throw new BadRequestException(cuentaWebErr);
        }

        const cuentaData = this.cuentaRepo.create(cuentaDataToCreate);
        await queryRunner.manager.save(CuentaBancariaRequest, cuentaData);
        
        // Procesar owners (ahora como Members) si hay datos en el payload
        // El validator también viene en el array owners con validatesBankAccount: true
        // Si hay owners en el payload, significa que el usuario está en la sección 3 o superior
        if (owners.length > 0) {
          // Filtrar owners que tengan al menos algún dato válido
          const validOwners = owners.filter((o: any) => 
            o.firstName || o.lastName || o.passportNumber
          );
          
          if (validOwners.length > 0) {
            const membersToSave = validOwners.map((ownerDto: any) => {
              const { dateOfBirth, passportFileUrl, lastName, passportNumber, ssnItin, cuit, participationPercentage, ...ownerDataWithoutDate } = ownerDto;
              const parsedDate = this.parseDate(dateOfBirth);
              
              // Mapear campos del frontend a la estructura de Member
              // Member ahora incluye: firstName, lastName, paternalLastName, maternalLastName, passportNumber, passportOrNationalId, scannedPassportUrl, identityDocumentUrl
              const memberData: any = {
                requestId: savedRequest.id,
                firstName: ownerDto.firstName || '',
                lastName: lastName || ownerDto.lastName || '',
                // Separar lastName en paternal y maternal si es necesario
                paternalLastName: ownerDto.paternalLastName || '',
                maternalLastName: ownerDto.maternalLastName || '',
                // Usar passportNumber o passportOrNationalId
                passportNumber: passportNumber || ownerDto.passportNumber || '',
                passportOrNationalId: passportNumber || ownerDto.passportOrNationalId || ownerDto.passportNumber || '',
                // Mapear passportFileUrl a identityDocumentUrl y scannedPassportUrl
                // Solo asignar si hay un valor válido (no cadena vacía)
                identityDocumentUrl: (passportFileUrl && passportFileUrl !== '') 
                  ? passportFileUrl 
                  : (ownerDto.identityDocumentUrl && ownerDto.identityDocumentUrl !== '') 
                    ? ownerDto.identityDocumentUrl 
                    : '',
                scannedPassportUrl: (passportFileUrl && passportFileUrl !== '') 
                  ? passportFileUrl 
                  : (ownerDto.scannedPassportUrl && ownerDto.scannedPassportUrl !== '') 
                    ? ownerDto.scannedPassportUrl 
                    : '',
                facialPhotographUrl: ownerDto.facialPhotographUrl || '',
                nationality: ownerDto.nationality || '',
                // Campos opcionales que pueden venir del frontend
                ssnOrItin: ssnItin || ownerDto.ssnItin || null,
                nationalTaxId: cuit || ownerDto.cuit || null,
                percentageOfParticipation: participationPercentage || ownerDto.participationPercentage || ownerDto.percentageOfParticipation || 0,
                // Campos requeridos de Member (valores por defecto si no vienen)
                email: ownerDto.email || '',
                phoneNumber: ownerDto.phoneNumber || '',
                memberAddress: ownerDto.memberAddress || {
                  street: '',
                  city: '',
                  stateRegion: '',
                  postalCode: '',
                  country: ''
                },
                // El validator tiene validatesBankAccount: true, los owners tienen false
                validatesBankAccount: ownerDto.validatesBankAccount || false,
                ...(parsedDate ? { dateOfBirth: parsedDate } : {}),
              };
              
              return this.memberRepo.create(memberData);
            }) as unknown as Member[];
            
            await queryRunner.manager.save(Member, membersToSave);
          }
        }
      }

      await queryRunner.commitTransaction();

      if (savedRequest.status === 'solicitud-recibida') {
        const clientRow = await this.clientRepo.findOne({
          where: { id: savedRequest.clientId },
        });
        await this.requestSubmittedNotifications.notifyAfterSolicitudRecibida(
          savedRequest,
          clientRow,
          actorUser ?? null,
          { channel: 'panel' },
        );
      }

      // Mover archivos de request/{servicio}/ a request/{servicio}/{uuid}/ si existen
      // Esto organiza los archivos subidos antes de crear el request
      if (savedRequest.uuid && createRequestDto.type) {
        try {
          const keysToMove = this.collectS3KeysFromRequestPayload(
            createRequestDto.type,
            savedRequest.uuid,
            createRequestDto,
          );
          this.logger.log(`Moviendo archivos para request ${savedRequest.uuid} de tipo ${createRequestDto.type}`);
          const moveResult = await this.uploadFileService.moveFilesToRequestFolder(
            createRequestDto.type,
            savedRequest.uuid,
            keysToMove,
          );
          
          if (moveResult.moved > 0) {
            this.logger.log(`Archivos movidos: ${moveResult.moved} exitosos, ${moveResult.errors} errores`);
            
            // Actualizar URLs en la base de datos después de mover los archivos
            await this.updateFileUrlsAfterMove(createRequestDto.type, savedRequest.uuid, savedRequest.id);
          }
        } catch (error) {
          // No fallar la creación del request si falla el movimiento de archivos
          this.logger.error(`Error al mover archivos para request ${savedRequest.uuid}:`, error);
        }
      }

      // Retornar la solicitud completa con relaciones
      const result = await this.findOne(savedRequest.id);
      
      // Agregar información del pago a la respuesta si existe
      if (paymentResult) {
        return {
          ...result,
          payment: {
            chargeId: paymentResult.chargeId,
            amount: paymentResult.amount,
            currency: paymentResult.currency,
            status: paymentResult.status,
            paid: paymentResult.paid,
            receiptUrl: paymentResult.receiptUrl,
          },
        };
      }
      
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al crear solicitud:', error);
      throw new InternalServerErrorException(
        'Error al crear la solicitud. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async update(
    id: number,
    updateRequestDto: UpdateRequestDto,
    actorUser?: PanelRequestActorUser | null,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Buscar la solicitud existente
      const request = await this.requestRepository.findOne({
        where: { id },
        relations: [
          'aperturaLlcRequest',
          'renovacionLlcRequest',
          'cuentaBancariaRequest',
        ],
      });

      if (!request) {
        throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
      }

      this.assertStaffPanelUpdateAllowed(request, actorUser);

      const statusBeforeUpdate = request.status;

      // Validación dinámica según tipo de servicio y sección (si se proporcionan datos)
      if (updateRequestDto.currentStepNumber !== undefined) {
        // Combinar datos existentes con los nuevos para validación completa
        const serviceData = await this.getServiceDataForValidation(updateRequestDto, request);
        
        // Determinar el status: si se está procesando un pago (Stripe o transferencia), será 'solicitud-recibida', sino mantener 'pendiente'
        // Durante el flujo del wizard, siempre es 'pendiente' hasta que se procesa el pago
        const hasStripePayment = !!(updateRequestDto.stripeToken && updateRequestDto.paymentAmount);
        const hasTransferPayment = !!(updateRequestDto.paymentMethod === 'transferencia' && updateRequestDto.paymentAmount);
        const willProcessPayment = hasStripePayment || hasTransferPayment;
        let requestStatus: 'pendiente' | 'solicitud-recibida';
        if (willProcessPayment) {
          requestStatus = (updateRequestDto.status || 'solicitud-recibida') as
            | 'pendiente'
            | 'solicitud-recibida';
        } else if (
          request.partnerId != null &&
          updateRequestDto.currentStepNumber ===
            this.maxWizardStepForType(request.type)
        ) {
          requestStatus = 'solicitud-recibida';
        } else {
          requestStatus = (updateRequestDto.status ||
            request.status ||
            'pendiente') as 'pendiente' | 'solicitud-recibida';
        }

        try {
          validateRequestData(
            serviceData,
            request.type,
            updateRequestDto.currentStepNumber,
            requestStatus, // 'pendiente' durante wizard, 'solicitud-recibida' al procesar pago
          );
        } catch (error) {
          if (error instanceof BadRequestException) {
            throw error;
          }
          throw new BadRequestException(`Error de validación: ${error.message}`);
        }
      }

      // Log de datos recibidos para debugging
      this.logger.log(`[Update Request ${id}] Datos recibidos:`, {
        paymentMethod: updateRequestDto.paymentMethod,
        paymentAmount: updateRequestDto.paymentAmount,
        stripeToken: updateRequestDto.stripeToken ? 'presente' : 'ausente',
        paymentProofUrl: updateRequestDto.paymentProofUrl,
        status: updateRequestDto.status,
      });

      // Procesar pago con Stripe si se proporciona un token (solo cuando se hace clic en "Procesar Pago")
      let paymentResult: any = null;
      
      // Verificar si el pago ya fue procesado previamente
      const paymentAlreadyProcessed = !!(request.stripeChargeId && request.paymentMethod === 'stripe');
      
      if (updateRequestDto.stripeToken && updateRequestDto.paymentAmount) {
        // Si ya hay un chargeId, no procesar de nuevo (evitar duplicados)
        if (paymentAlreadyProcessed) {
          this.logger.log(
            `[Update Request ${id}] Pago ya procesado previamente (chargeId: ${request.stripeChargeId}). No se procesará de nuevo.`,
          );
          // Usar los datos del pago existente
          paymentResult = {
            chargeId: request.stripeChargeId,
            amount: request.paymentAmount,
            status: request.paymentStatus || 'succeeded',
          };
        } else {
          // Procesar el pago con Stripe
          try {
            this.logger.log(
              `[Update Request ${id}] Procesando pago con Stripe: ${updateRequestDto.paymentAmount} USD`,
            );
            
            const charge = await this.stripeService.createCharge(
              updateRequestDto.stripeToken,
              updateRequestDto.paymentAmount,
              'usd',
              `Pago de solicitud - ${request.type}`,
            );

            paymentResult = {
              chargeId: charge.id,
              amount: charge.amount / 100, // Convertir de centavos a dólares
              currency: charge.currency,
              status: charge.status,
              paid: charge.paid,
              receiptUrl: charge.receipt_url,
            };

            this.logger.log(`[Update Request ${id}] Pago procesado exitosamente: ${charge.id}`);
          } catch (error: any) {
            this.logger.error(`[Update Request ${id}] Error al procesar pago: ${error.message}`);
            await queryRunner.rollbackTransaction();
            throw error; // Re-lanzar el error para que el cliente lo vea
          }
        }
      } else if (updateRequestDto.paymentMethod === 'stripe' && paymentAlreadyProcessed) {
        // Si no hay token pero el pago ya fue procesado, usar los datos existentes
        this.logger.log(
          `[Update Request ${id}] Pago Stripe ya procesado. Solo actualizando status a 'solicitud-recibida'.`,
        );
        paymentResult = {
          chargeId: request.stripeChargeId,
          amount: request.paymentAmount,
          status: request.paymentStatus || 'succeeded',
        };
      }

      // Actualizar campos básicos de la solicitud
      // Si se procesó el pago (Stripe o transferencia), cambiar status a 'solicitud-recibida' y guardar datos de pago
      const hasPayment = !!(updateRequestDto.paymentMethod && updateRequestDto.paymentAmount);
      
      this.logger.log(`[Update Request ${id}] hasPayment: ${hasPayment}, paymentResult: ${!!paymentResult}, paymentMethod: ${updateRequestDto.paymentMethod}`);
      
      if (paymentResult) {
        // Pago con Stripe procesado exitosamente
        // IMPORTANTE: NO cambiar el status aquí, solo guardar los datos del pago
        // El status se cambiará a 'solicitud-recibida' cuando se haga clic en "Crear Solicitud"
        this.logger.log(`[Update Request ${id}] Guardando datos de pago Stripe (sin cambiar status)`);
        // Mantener el status actual (pendiente) hasta que se finalice la solicitud
        request.status = updateRequestDto.status || request.status || 'pendiente';
        request.paymentMethod = updateRequestDto.paymentMethod;
        request.paymentAmount = updateRequestDto.paymentAmount;
        request.stripeChargeId = paymentResult.chargeId;
        request.paymentStatus = paymentResult.status;
        request.paymentProofUrl = updateRequestDto.paymentProofUrl;
      } else if (hasPayment) {
        // Hay datos de pago (transferencia o cuenta gratuita)
        this.logger.log(`[Update Request ${id}] Guardando datos de pago (transferencia o cuenta gratuita)`);
        request.status = updateRequestDto.status || 'solicitud-recibida';
        request.paymentMethod = updateRequestDto.paymentMethod;
        request.paymentAmount = updateRequestDto.paymentAmount;
        if (updateRequestDto.paymentMethod === 'transferencia') {
          request.paymentStatus = 'pending';
        }
        if (updateRequestDto.paymentProofUrl !== undefined) {
          request.paymentProofUrl = updateRequestDto.paymentProofUrl;
        }
      } else if (updateRequestDto.status !== undefined) {
        request.status = updateRequestDto.status;
        // Si se proporcionan datos de pago aunque no se procese, guardarlos
        if (updateRequestDto.paymentMethod) {
          request.paymentMethod = updateRequestDto.paymentMethod;
        }
        if (updateRequestDto.paymentAmount !== undefined) {
          request.paymentAmount = updateRequestDto.paymentAmount;
        }
        if (updateRequestDto.paymentProofUrl !== undefined) {
          request.paymentProofUrl = updateRequestDto.paymentProofUrl;
        }
      } else {
        // Si no hay pago y no se especifica status, mantener 'pendiente' (borrador)
        request.status = request.status || 'pendiente';
      }

      // Partner: último paso sin pago en este update → solicitud-recibida si aún está pendiente
      if (
        request.partnerId != null &&
        updateRequestDto.currentStepNumber !== undefined &&
        updateRequestDto.currentStepNumber ===
          this.maxWizardStepForType(request.type) &&
        request.status === 'pendiente'
      ) {
        request.status = 'solicitud-recibida';
      }

      this.logger.log(`[Update Request ${id}] Datos de pago a guardar:`, {
        paymentMethod: request.paymentMethod,
        paymentAmount: request.paymentAmount,
        paymentStatus: request.paymentStatus,
        stripeChargeId: request.stripeChargeId,
        paymentProofUrl: request.paymentProofUrl,
        status: request.status,
      });

      // Actualizar currentStep si se proporciona
      if (updateRequestDto.currentStep !== undefined) {
        request.currentStep = updateRequestDto.currentStep;
      }
      
      if (updateRequestDto.notes !== undefined) {
        request.notes = updateRequestDto.notes;
      }
      
      if (updateRequestDto.signatureUrl !== undefined) {
        request.signatureUrl = updateRequestDto.signatureUrl;
      }

      if (updateRequestDto.plan !== undefined) {
        request.plan = updateRequestDto.plan;
      }
      if (request.type === 'apertura-llc' && updateRequestDto.aperturaLlcData?.plan !== undefined) {
        request.plan = (updateRequestDto.aperturaLlcData as any).plan;
      }
      
      this.logger.log(`[Update Request ${id}] Guardando request con datos:`, {
        status: request.status,
        paymentMethod: request.paymentMethod,
        paymentAmount: request.paymentAmount,
        paymentStatus: request.paymentStatus,
        stripeChargeId: request.stripeChargeId,
        paymentProofUrl: request.paymentProofUrl,
        signatureUrl: request.signatureUrl,
        currentStep: request.currentStep,
      });
      
      await queryRunner.manager.save(Request, request);
      
      this.logger.log(`[Update Request ${id}] Request guardada exitosamente`);

      // Actualizar la solicitud específica según el tipo
      if (request.type === 'apertura-llc') {
        let aperturaRequest = await queryRunner.manager.findOne(AperturaLlcRequest, {
          where: { requestId: id },
        });

        if (!aperturaRequest) {
          const initialStep = updateRequestDto.currentStepNumber ?? 1;
          aperturaRequest = queryRunner.manager.create(AperturaLlcRequest, {
            requestId: id,
            currentStepNumber: initialStep,
          });
          aperturaRequest = await queryRunner.manager.save(
            AperturaLlcRequest,
            aperturaRequest,
          );
        }

        if (updateRequestDto.currentStepNumber !== undefined) {
          aperturaRequest.currentStepNumber = updateRequestDto.currentStepNumber;
        }

        // Determinar qué secciones se deben procesar según currentStepNumber
        const currentStep = updateRequestDto.currentStepNumber || aperturaRequest.currentStepNumber || 1;

        if (updateRequestDto.aperturaLlcData) {
          const { members, ...aperturaDataFields } = updateRequestDto.aperturaLlcData as any;
          const aperturaData: any = { ...aperturaDataFields };
          const aperturaDataFieldsAny = aperturaDataFields as any; // Declarar una sola vez
          
          // Eliminar campos de secciones que aún no se han completado
          // Sección 1: llcName, llcNameOption2, llcNameOption3, incorporationState, businessDescription, llcType, linkedin
          // Sección 2: members (se procesa por separado)
          // Sección 3: serviceBillUrl, bankStatementUrl, periodicIncome10k, bankAccountLinkedEmail, bankAccountLinkedPhone, actividadFinancieraEsperada, projectOrCompanyUrl
          
          // Sección 1 - solo procesar si currentStepNumber >= 1
          if (currentStep < 1) {
            delete aperturaData.llcName;
            delete aperturaData.llcNameOption2;
            delete aperturaData.llcNameOption3;
            delete aperturaData.incorporationState;
            delete aperturaData.businessDescription;
            delete aperturaData.llcType;
            delete aperturaData.linkedin;
          }
          
          // Sección 3 - Si los datos están presentes, guardarlos independientemente del currentStep
          // Solo eliminar si currentStep < 3 Y los campos no están presentes en el payload
          // (Si están presentes, significa que el usuario los está enviando y deben guardarse)
          
          // Sección 2 (members) - se procesa por separado, no debe estar en aperturaData
          // (ya se eliminó en la desestructuración)
          
          // Solo asignar llcType si tiene un valor válido ('single' o 'multi')
          const dataToAssign = { ...aperturaData };
          if (dataToAssign.llcType !== 'single' && dataToAssign.llcType !== 'multi') {
            delete dataToAssign.llcType;
          }
          
          // Eliminar campos de sección 1 solo si currentStep < 1 Y no están presentes en el payload
          if (currentStep < 1) {
            // Solo eliminar si no están presentes (no sobrescribir datos existentes si no vienen en el payload)
            if (!(aperturaDataFieldsAny.llcName !== undefined)) delete dataToAssign.llcName;
            if (!(aperturaDataFieldsAny.llcNameOption2 !== undefined)) delete dataToAssign.llcNameOption2;
            if (!(aperturaDataFieldsAny.llcNameOption3 !== undefined)) delete dataToAssign.llcNameOption3;
            if (!(aperturaDataFieldsAny.incorporationState !== undefined)) delete dataToAssign.incorporationState;
            if (!(aperturaDataFieldsAny.businessDescription !== undefined)) delete dataToAssign.businessDescription;
            if (!(aperturaDataFieldsAny.linkedin !== undefined)) delete dataToAssign.linkedin;
          }
          
          // Eliminar campos de sección 3 solo si currentStep < 3 Y no están presentes en el payload
          // Si están presentes, guardarlos (el usuario los está enviando)
          if (currentStep < 3) {
            // Solo eliminar si no están presentes en el payload
            if (!(aperturaDataFieldsAny.serviceBillUrl !== undefined)) delete dataToAssign.serviceBillUrl;
            if (!(aperturaDataFieldsAny.bankStatementUrl !== undefined)) delete dataToAssign.bankStatementUrl;
            if (!(aperturaDataFieldsAny.periodicIncome10k !== undefined)) delete dataToAssign.periodicIncome10k;
            if (!(aperturaDataFieldsAny.bankAccountLinkedEmail !== undefined)) delete dataToAssign.bankAccountLinkedEmail;
            if (!(aperturaDataFieldsAny.bankAccountLinkedPhone !== undefined)) delete dataToAssign.bankAccountLinkedPhone;
            if (!(aperturaDataFieldsAny.actividadFinancieraEsperada !== undefined)) delete dataToAssign.actividadFinancieraEsperada;
            if (!(aperturaDataFieldsAny.projectOrCompanyUrl !== undefined)) delete dataToAssign.projectOrCompanyUrl;
          }
          
          // Eliminar campos que no existen en el formulario (EIN relacionados y otros campos no usados)
          delete dataToAssign.hasEin;
          delete dataToAssign.einNumber;
          delete dataToAssign.einDocumentUrl;
          delete dataToAssign.noEinReason;
          delete dataToAssign.incorporationDate;
          delete dataToAssign.certificateOfFormationUrl;
          delete dataToAssign.accountType;
          delete dataToAssign.estadoConstitucion;
          delete dataToAssign.annualRevenue;
          delete dataToAssign.llcPhoneNumber;
          delete dataToAssign.website;
          delete dataToAssign.llcEmail;
          delete dataToAssign.registeredAgentAddress;
          delete dataToAssign.registeredAgentName;
          delete dataToAssign.registeredAgentEmail;
          delete dataToAssign.registeredAgentPhone;
          delete dataToAssign.registeredAgentType;
          delete dataToAssign.needsBankVerificationHelp;
          delete dataToAssign.bankAccountType;
          delete dataToAssign.bankName;
          delete dataToAssign.bankAccountNumber;
          delete dataToAssign.bankRoutingNumber;
          delete dataToAssign.veracityConfirmation;
          delete dataToAssign.ownerNationality;
          delete dataToAssign.ownerCountryOfResidence;
          delete dataToAssign.ownerPersonalAddress;
          delete dataToAssign.ownerPhoneNumber;
          delete dataToAssign.ownerEmail;
          delete dataToAssign.almacenaProductosDepositoUSA;
          delete dataToAssign.declaroImpuestosAntes;
          delete dataToAssign.llcConStartCompanies;
          delete dataToAssign.ingresosMayor250k;
          delete dataToAssign.activosEnUSA;
          delete dataToAssign.ingresosPeriodicos10k;
          delete dataToAssign.contrataServiciosUSA;
          delete dataToAssign.propiedadEnUSA;
          delete dataToAssign.tieneCuentasBancarias;

          const aperturaWebErr = applyOptionalPublicWebUrlsToObject(
            dataToAssign as Record<string, unknown>,
            ['linkedin', 'projectOrCompanyUrl'],
          );
          if (aperturaWebErr) {
            throw new BadRequestException(aperturaWebErr);
          }

          Object.assign(aperturaRequest, dataToAssign);
        }

        await queryRunner.manager.save(AperturaLlcRequest, aperturaRequest);

        // Procesar members si se proporcionan
        if (updateRequestDto.aperturaLlcData) {
          const aperturaData = updateRequestDto.aperturaLlcData as any;
          const members = aperturaData.members || [];
          
          // Solo procesar si estamos en el paso 2 o superior y hay datos
          if (updateRequestDto.currentStepNumber !== undefined && updateRequestDto.currentStepNumber >= 2 && members.length > 0) {
            // Eliminar miembros existentes para reemplazarlos con los nuevos
            const existingMembers = await this.memberRepo.find({
              where: { requestId: id },
            });
            if (existingMembers.length > 0) {
              await queryRunner.manager.remove(Member, existingMembers);
            }

            // Filtrar miembros que tengan al menos algún dato válido
            const validMembers = members.filter((m: any) => 
              m.firstName || m.name || m.lastName || m.email || m.passportNumber
            );
            
            if (validMembers.length > 0) {
              // Validar que solo un miembro valide la cuenta bancaria
              const validators = validMembers.filter((m: any) => m.validatesBankAccount);
              if (validators.length > 1) {
                throw new BadRequestException(
                  'Solo un miembro puede validar la cuenta bancaria',
                );
              }

              const membersToSave = validMembers.map((memberDto: any) => {
                const { dateOfBirth, ...memberDataWithoutDate } = memberDto;
                const parsedDate = this.parseDate(dateOfBirth);
                return this.memberRepo.create({
                  requestId: id,
                  ...memberDataWithoutDate,
                  ...(parsedDate ? { dateOfBirth: parsedDate } : {}),
                });
              }) as unknown as Member[];
              
              await queryRunner.manager.save(Member, membersToSave);
            }
          }
        }
      } else if (request.type === 'renovacion-llc') {
        let renovacionRequest = await queryRunner.manager.findOne(
          RenovacionLlcRequest,
          { where: { requestId: id } },
        );

        if (!renovacionRequest) {
          const initialStep = updateRequestDto.currentStepNumber ?? 1;
          renovacionRequest = queryRunner.manager.create(RenovacionLlcRequest, {
            requestId: id,
            currentStepNumber: initialStep,
          });
          renovacionRequest = await queryRunner.manager.save(
            RenovacionLlcRequest,
            renovacionRequest,
          );
        }

        if (updateRequestDto.currentStepNumber !== undefined) {
          renovacionRequest.currentStepNumber =
            updateRequestDto.currentStepNumber;
        }

        if (updateRequestDto.renovacionLlcData) {
          const { owners, members, ...renovacionDataFields } = updateRequestDto.renovacionLlcData as any;
          
          // Actualizar campos de renovación (sin owners/members)
          // Asignar explícitamente todos los campos para asegurar que TypeORM los detecte
          // Mapear totalRevenue2025 del frontend a totalRevenue en la entidad
          const mappedData = { ...renovacionDataFields };
          if (mappedData.totalRevenue2025 !== undefined) {
            mappedData.totalRevenue = mappedData.totalRevenue2025;
            delete mappedData.totalRevenue2025;
          }
          
          // Lista de campos numéricos que deben convertirse de string vacío a null
          const numericFields = [
            'llcOpeningCost',
            'paidToFamilyMembers',
            'paidToLocalCompanies',
            'paidForLLCFormation',
            'paidForLLCDissolution',
            'bankAccountBalanceEndOfYear',
            'totalRevenue',
          ];
          
          // Eliminar campos que no existen en el formulario (campos obsoletos o no usados)
          const dataToAssign: any = { ...mappedData };
          delete dataToAssign.owners; // Ya se procesa por separado como members
          delete dataToAssign.members; // Se procesa por separado
          delete dataToAssign.currentStepNumber;
          delete dataToAssign.requestId;
          delete dataToAssign.totalRevenue2025; // Ya se mapeó a totalRevenue
          delete dataToAssign.declaracionInicial; // Campo eliminado
          delete dataToAssign.cambioDireccionRA; // Campo eliminado
          delete dataToAssign.agregarCambiarSocio; // Campo eliminado
          delete dataToAssign.declaracionCierre; // Campo eliminado
          // Eliminar campos obsoletos que existen en BD pero no en la entidad
          delete dataToAssign.data_is_correct;
          delete dataToAssign.dataIsCorrect;
          delete dataToAssign.observations;
          delete dataToAssign.payment_method;
          delete dataToAssign.paymentMethod;
          delete dataToAssign.amount_to_pay;
          delete dataToAssign.amountToPay;
          delete dataToAssign.wants_invoice;
          delete dataToAssign.wantsInvoice;
          delete dataToAssign.payment_proof_url;
          delete dataToAssign.paymentProofUrl;

          this.sanitizeRenovacionLlcNumericFields(dataToAssign);

          Object.keys(dataToAssign).forEach(key => {
            let value = dataToAssign[key];
            
            // Convertir strings vacíos a null para campos numéricos (residuo tras sanitize)
            if (numericFields.includes(key) && value === '') {
              value = null;
            }
            
            // Convertir strings vacíos a null para fechas
            if (key === 'llcCreationDate' && value === '') {
              value = null;
            }
            
            (renovacionRequest as any)[key] = value;
          });
        }

        await queryRunner.manager.save(
          RenovacionLlcRequest,
          renovacionRequest,
        );

        // Procesar members si se proporcionan (homologado: usar 'members' igual que apertura-llc)
        if (updateRequestDto.renovacionLlcData) {
          const renovacionData = updateRequestDto.renovacionLlcData as any;
          const members = renovacionData.members || [];
          
          // Solo procesar si estamos en el paso 2 o superior y hay datos
          if (updateRequestDto.currentStepNumber !== undefined && updateRequestDto.currentStepNumber >= 2 && members.length > 0) {
            // Eliminar miembros existentes para reemplazarlos con los nuevos
            const existingMembers = await this.memberRepo.find({
              where: { requestId: id },
            });
            if (existingMembers.length > 0) {
              await queryRunner.manager.remove(Member, existingMembers);
            }

            // Filtrar miembros que tengan al menos algún dato válido
            const validMembers = members.filter((m: any) => 
              m.firstName || m.name || m.lastName || m.email || m.passportNumber
            );
            
            if (validMembers.length > 0) {
              const membersToSave = validMembers.map((memberDto: any) => {
                const { dateOfBirth, name, phone, fullAddress, unit, city, stateRegion, postalCode, country, participationPercentage, ...rest } = memberDto;
                
                // Mapear campos del frontend a la estructura de Member
                const memberData: any = {
                  requestId: id,
                  firstName: name || memberDto.firstName || '',
                  lastName: memberDto.lastName || '',
                  phoneNumber: phone || memberDto.phoneNumber || '',
                  email: memberDto.email || '',
                  passportNumber: memberDto.passportNumber || '',
                  nationality: memberDto.nationality || '',
                  percentageOfParticipation: participationPercentage !== undefined ? participationPercentage : (memberDto.percentageOfParticipation || 0),
                  // Construir memberAddress desde los campos individuales o usar el objeto completo
                  memberAddress: fullAddress ? {
                    street: fullAddress,
                    unit: unit || '',
                    city: city || '',
                    stateRegion: stateRegion || '',
                    postalCode: postalCode || '',
                    country: country || '',
                  } : (memberDto.memberAddress || {}),
                  // Campos adicionales para renovación
                  ssnOrItin: memberDto.ssnItin || memberDto.ssnOrItin || null,
                  nationalTaxId: memberDto.cuit || memberDto.nationalTaxId || null,
                  // Convertir array de taxCountry a string separado por comas para guardar en BD
                  taxFilingCountry: Array.isArray(memberDto.taxCountry) 
                    ? (memberDto.taxCountry.length > 0 ? memberDto.taxCountry.join(', ') : null)
                    : (memberDto.taxCountry || memberDto.taxFilingCountry || null),
                  ownerContributions: memberDto.capitalContributions !== undefined ? memberDto.capitalContributions : (memberDto.ownerContributions || null),
                  ownerLoansToLLC: memberDto.loansToLLC !== undefined ? memberDto.loansToLLC : (memberDto.ownerLoansToLLC || null),
                  loansReimbursedByLLC: memberDto.loansRepaid !== undefined ? memberDto.loansRepaid : (memberDto.loansReimbursedByLLC || null),
                  profitDistributions: memberDto.capitalWithdrawals !== undefined ? memberDto.capitalWithdrawals : (memberDto.profitDistributions || null),
                  spentMoreThan31DaysInUS: memberDto.wasInUSA31Days || memberDto.spentMoreThan31DaysInUS || null,
                  hasUSFinancialInvestments: memberDto.hasInvestmentsInUSA || memberDto.hasUSFinancialInvestments || null,
                  isUSCitizen: memberDto.isUSCitizen || null,
                  scannedPassportUrl: memberDto.scannedPassportUrl || null,
                  additionalBankDocsUrl: memberDto.additionalBankDocsUrl || null,
                  validatesBankAccount: memberDto.validatesBankAccount || false,
                };
                
                // Parsear fecha de nacimiento si existe
                const parsedDate = this.parseDate(dateOfBirth);
                if (parsedDate) {
                  memberData.dateOfBirth = parsedDate;
                }
                
                return this.memberRepo.create(memberData);
              }) as unknown as Member[];
              
              await queryRunner.manager.save(Member, membersToSave);
            }
          }
        }
      } else if (request.type === 'cuenta-bancaria') {
        let cuentaRequest = await queryRunner.manager.findOne(
          CuentaBancariaRequest,
          { where: { requestId: id } },
        );

        if (!cuentaRequest) {
          const initialStep = updateRequestDto.currentStepNumber ?? 1;
          cuentaRequest = queryRunner.manager.create(CuentaBancariaRequest, {
            requestId: id,
            currentStepNumber: initialStep,
          });
          cuentaRequest = await queryRunner.manager.save(
            CuentaBancariaRequest,
            cuentaRequest,
          );
        }

        if (updateRequestDto.currentStepNumber !== undefined) {
          cuentaRequest.currentStepNumber = updateRequestDto.currentStepNumber;
        }

        // Determinar qué secciones se deben procesar según currentStepNumber
        // Declarar fuera de los bloques if para que esté disponible en todos los bloques anidados
        const currentStep = updateRequestDto.currentStepNumber || cuentaRequest.currentStepNumber || 1;

        if (updateRequestDto.cuentaBancariaData) {
          const { owners, validators, ...cuentaDataFields } = updateRequestDto.cuentaBancariaData as any;
          const cuentaData: any = { ...cuentaDataFields };
          
          // El validator ahora se guarda como un member con validatesBankAccount = true
          // No se guarda en cuenta_bancaria_requests
          
          // Sección 4 (dirección personal) - solo procesar si currentStepNumber >= 4
          if (currentStep < 4) {
            delete cuentaData.ownerPersonalStreet;
            delete cuentaData.ownerPersonalUnit;
            delete cuentaData.ownerPersonalCity;
            delete cuentaData.ownerPersonalState;
            delete cuentaData.ownerPersonalCountry;
            delete cuentaData.ownerPersonalPostalCode;
            delete cuentaData.ownerPersonalAddress;
            delete cuentaData.serviceBillUrl;
            delete cuentaData.proofOfAddressUrl;
          }
          
          // Sección 5 (tipo de LLC) - solo procesar si currentStepNumber >= 5
          // Eliminar llcType si viene como cadena vacía (no es válido)
          if (cuentaData.llcType === '') {
            delete cuentaData.llcType;
          }
          
          if (currentStep < 5) {
            delete cuentaData.isMultiMember;
            delete cuentaData.llcType;
          }
          
          // Sección 6 (owners) - se procesa por separado, no debe estar en cuentaData
          // (ya se eliminó en la desestructuración)
          
          // Mapear campos del frontend a nombres de la entidad
          // articlesOrCertificateUrl -> certificateOfConstitutionOrArticlesUrl
          if (cuentaData.articlesOrCertificateUrl !== undefined) {
            cuentaData.certificateOfConstitutionOrArticlesUrl = cuentaData.articlesOrCertificateUrl;
            delete cuentaData.articlesOrCertificateUrl;
          }
          
          // serviceBillUrl -> proofOfAddressUrl
          if (cuentaData.serviceBillUrl !== undefined) {
            cuentaData.proofOfAddressUrl = cuentaData.serviceBillUrl;
            delete cuentaData.serviceBillUrl;
          }
          
          // legalBusinessName -> legalBusinessIdentifier
          if (cuentaData.legalBusinessName !== undefined) {
            cuentaData.legalBusinessIdentifier = cuentaData.legalBusinessName;
            delete cuentaData.legalBusinessName;
          }
          
          // einNumber -> ein
          if (cuentaData.einNumber !== undefined) {
            cuentaData.ein = cuentaData.einNumber;
            delete cuentaData.einNumber;
          }
          
          // briefDescription -> economicActivity
          if (cuentaData.briefDescription !== undefined) {
            cuentaData.economicActivity = cuentaData.briefDescription;
            delete cuentaData.briefDescription;
          }
          
          // Guardar campos individuales de registeredAgent (sección 2)
          // Los campos se guardan directamente como columnas individuales, no como JSONB
          // No es necesario construir companyAddress, los campos se guardan directamente
          // registeredAgentStreet, registeredAgentUnit, registeredAgentCity, registeredAgentState,
          // registeredAgentZipCode, registeredAgentCountry se guardan como columnas individuales
          
          // Construir ownerPersonalAddress desde campos individuales (sección 4)
          if (cuentaData.ownerPersonalStreet !== undefined || cuentaData.ownerPersonalCity !== undefined || cuentaData.ownerPersonalState !== undefined) {
            cuentaData.ownerPersonalAddress = {
              street: cuentaData.ownerPersonalStreet || '',
              unit: cuentaData.ownerPersonalUnit || '',
              city: cuentaData.ownerPersonalCity || '',
              state: cuentaData.ownerPersonalState || '',
              postalCode: cuentaData.ownerPersonalPostalCode || '',
              country: cuentaData.ownerPersonalCountry || ''
            };
            
            // Eliminar campos individuales después de construir la dirección
            delete cuentaData.ownerPersonalStreet;
            delete cuentaData.ownerPersonalUnit;
            delete cuentaData.ownerPersonalCity;
            delete cuentaData.ownerPersonalState;
            delete cuentaData.ownerPersonalPostalCode;
            delete cuentaData.ownerPersonalCountry;
          }
          
          // Guardar campos de la sección 2 (incorporationState, incorporationMonthYear, countriesWhereBusiness)
          // Convertir countriesWhereBusiness de array a string separado por comas si viene como array
          if (cuentaData.countriesWhereBusiness !== undefined) {
            if (Array.isArray(cuentaData.countriesWhereBusiness)) {
              cuentaData.countriesWhereBusiness = cuentaData.countriesWhereBusiness.length > 0 
                ? cuentaData.countriesWhereBusiness.join(', ') 
                : '';
            } else if (cuentaData.countriesWhereBusiness === '' || cuentaData.countriesWhereBusiness === null) {
              cuentaData.countriesWhereBusiness = '';
            }
            // Si ya es string, mantenerlo tal cual
          }
          
          // Guardar incorporationState e incorporationMonthYear si vienen
          // incorporationMonthYear debe guardarse como string (ej: "Jan-2023"), no como fecha
          if (cuentaData.incorporationState !== undefined) {
            cuentaData.incorporationState = cuentaData.incorporationState || '';
          }
          
          if (cuentaData.incorporationMonthYear !== undefined) {
            // Guardar como string sin conversión a fecha
            cuentaData.incorporationMonthYear = cuentaData.incorporationMonthYear || '';
          }
          
          // Mapear isMultiMember a llcType
          // 'yes' -> 'multi', 'no' -> 'single'
          // Solo mapear si isMultiMember tiene un valor válido Y estamos en la sección 5 o superior
          // El campo isMultiMember solo se completa en la sección 5, antes de eso no debe incluirse llcType
          // El constraint check_cuenta_llc_type solo permite 'single' o 'multi', no NULL ni cadena vacía
          // Reutilizar currentStep ya declarado arriba (línea 1991)
          const isSection5OrHigher = currentStep >= 5;
          
          // Eliminar llcType si viene como cadena vacía (no es válido)
          if (cuentaData.llcType === '') {
            delete cuentaData.llcType;
          }
          
          if (isSection5OrHigher && cuentaData.isMultiMember !== undefined && cuentaData.isMultiMember !== '' && cuentaData.isMultiMember !== null) {
            // Solo mapear si estamos en la sección 5 o superior y hay un valor válido
            // 'no' -> 'single', 'yes' -> 'multi'
            if (cuentaData.isMultiMember === 'no') {
              cuentaData.llcType = 'single';
            } else if (cuentaData.isMultiMember === 'yes') {
              cuentaData.llcType = 'multi';
            }
            delete cuentaData.isMultiMember;
          } else if (!isSection5OrHigher) {
            // Si no estamos en la sección 5 o superior, eliminar ambos campos
            delete cuentaData.llcType;
            delete cuentaData.isMultiMember;
          } else if (cuentaData.isMultiMember === undefined || cuentaData.isMultiMember === '' || cuentaData.isMultiMember === null) {
            // Si estamos en la sección 5 pero isMultiMember no tiene valor válido, eliminar ambos
            delete cuentaData.llcType;
            delete cuentaData.isMultiMember;
          }
          
          // Si llcType viene como null o undefined después del mapeo, eliminarlo (no se ha completado la sección 5)
          // Nota: llcType no puede ser cadena vacía según el tipo, solo 'single' | 'multi' | undefined
          if (cuentaData.llcType === null || cuentaData.llcType === undefined || cuentaData.llcType === '') {
            delete cuentaData.llcType;
          }
          
          // Establecer bankService por defecto a "Relay" si no viene
          // Esto debe hacerse ANTES de crear dataToAssign para que se incluya en el spread
          if (cuentaData.bankService === undefined || cuentaData.bankService === null || cuentaData.bankService === '') {
            cuentaData.bankService = 'Relay';
          }
          
          // Asegurar que operatingAgreementUrl no se elimine (es un campo válido)
          // No hacer nada, solo asegurar que no se elimine
          
          // Solo asignar llcType si tiene un valor válido ('single' o 'multi')
          // Esto evita que se intente actualizar con un valor inválido
          const dataToAssign: any = { ...cuentaData };
          if (dataToAssign.llcType !== 'single' && dataToAssign.llcType !== 'multi') {
            delete dataToAssign.llcType;
          }
          
          // Asegurar que llcType se incluya explícitamente en dataToAssign si tiene un valor válido
          if (cuentaData.llcType === 'single' || cuentaData.llcType === 'multi') {
            dataToAssign.llcType = cuentaData.llcType;
          }
          
          // Asegurar que los campos de registeredAgent se incluyan explícitamente en dataToAssign
          if (cuentaData.registeredAgentStreet !== undefined) {
            dataToAssign.registeredAgentStreet = cuentaData.registeredAgentStreet;
          }
          if (cuentaData.registeredAgentUnit !== undefined) {
            dataToAssign.registeredAgentUnit = cuentaData.registeredAgentUnit;
          }
          if (cuentaData.registeredAgentCity !== undefined) {
            dataToAssign.registeredAgentCity = cuentaData.registeredAgentCity;
          }
          if (cuentaData.registeredAgentState !== undefined) {
            dataToAssign.registeredAgentState = cuentaData.registeredAgentState;
          }
          if (cuentaData.registeredAgentZipCode !== undefined) {
            dataToAssign.registeredAgentZipCode = cuentaData.registeredAgentZipCode;
          }
          if (cuentaData.registeredAgentCountry !== undefined) {
            dataToAssign.registeredAgentCountry = cuentaData.registeredAgentCountry;
          }
          
          // Asegurar que incorporationMonthYear se incluya como string (no como fecha)
          if (cuentaData.incorporationMonthYear !== undefined) {
            dataToAssign.incorporationMonthYear = cuentaData.incorporationMonthYear;
          }
          
          // Asegurar que bankService se incluya en dataToAssign (ya debería estar establecido arriba)
          if (cuentaData.bankService !== undefined && cuentaData.bankService !== null && cuentaData.bankService !== '') {
            dataToAssign.bankService = cuentaData.bankService;
            this.logger.debug(`bankService agregado a dataToAssign: ${cuentaData.bankService}`);
          }
          
          // Log para depuración
          this.logger.debug(`Campos de registeredAgent en dataToAssign: street=${dataToAssign.registeredAgentStreet}, unit=${dataToAssign.registeredAgentUnit}, city=${dataToAssign.registeredAgentCity}, state=${dataToAssign.registeredAgentState}, zipCode=${dataToAssign.registeredAgentZipCode}, country=${dataToAssign.registeredAgentCountry}`);
          this.logger.debug(`incorporationMonthYear en dataToAssign: ${dataToAssign.incorporationMonthYear}`);

          const cuentaUpWebErr = applyOptionalPublicWebUrlsToObject(
            dataToAssign as Record<string, unknown>,
            ['websiteOrSocialMedia'],
          );
          if (cuentaUpWebErr) {
            throw new BadRequestException(cuentaUpWebErr);
          }

          // El validator ahora se guarda como un member con validatesBankAccount = true
          // No se guarda en cuenta_bancaria_requests

          // Asignar todos los campos a la entidad
          Object.assign(cuentaRequest, dataToAssign);
          
          // Asegurar que los campos de registeredAgent se asignen explícitamente después de Object.assign
          // para que TypeORM detecte el cambio incluso si el valor previo era null
          if (dataToAssign.registeredAgentStreet !== undefined) {
            cuentaRequest.registeredAgentStreet = dataToAssign.registeredAgentStreet;
          }
          if (dataToAssign.registeredAgentUnit !== undefined) {
            cuentaRequest.registeredAgentUnit = dataToAssign.registeredAgentUnit;
          }
          if (dataToAssign.registeredAgentCity !== undefined) {
            cuentaRequest.registeredAgentCity = dataToAssign.registeredAgentCity;
          }
          if (dataToAssign.registeredAgentState !== undefined) {
            cuentaRequest.registeredAgentState = dataToAssign.registeredAgentState;
          }
          if (dataToAssign.registeredAgentZipCode !== undefined) {
            cuentaRequest.registeredAgentZipCode = dataToAssign.registeredAgentZipCode;
          }
          if (dataToAssign.registeredAgentCountry !== undefined) {
            cuentaRequest.registeredAgentCountry = dataToAssign.registeredAgentCountry;
          }
          
          // Asegurar que incorporationMonthYear se asigne explícitamente como string
          if (dataToAssign.incorporationMonthYear !== undefined) {
            cuentaRequest.incorporationMonthYear = dataToAssign.incorporationMonthYear;
          }
          
          // Asegurar que bankService se asigne explícitamente después de Object.assign
          // para que TypeORM detecte el cambio incluso si el valor previo era null
          if (cuentaData.bankService !== undefined && cuentaData.bankService !== null && cuentaData.bankService !== '') {
            cuentaRequest.bankService = cuentaData.bankService;
            this.logger.debug(`bankService asignado explícitamente a cuentaRequest: ${cuentaData.bankService}`);
          }
          
          // Log final para verificar qué se va a guardar
          this.logger.debug(`Valores finales antes de guardar - registeredAgentStreet: ${cuentaRequest.registeredAgentStreet}, registeredAgentCity: ${cuentaRequest.registeredAgentCity}, incorporationMonthYear: ${cuentaRequest.incorporationMonthYear}`);
        }

        // Guardar la entidad
        await queryRunner.manager.save(CuentaBancariaRequest, cuentaRequest);
        
        // Si los campos de registeredAgent, incorporationMonthYear o bankService fueron asignados,
        // actualizarlos explícitamente usando update para asegurar que TypeORM detecte el cambio
        // incluso si el valor previo era null
        const updateFields: any = {};
        
        if (cuentaRequest.registeredAgentStreet !== undefined) {
          updateFields.registeredAgentStreet = cuentaRequest.registeredAgentStreet;
        }
        if (cuentaRequest.registeredAgentUnit !== undefined) {
          updateFields.registeredAgentUnit = cuentaRequest.registeredAgentUnit;
        }
        if (cuentaRequest.registeredAgentCity !== undefined) {
          updateFields.registeredAgentCity = cuentaRequest.registeredAgentCity;
        }
        if (cuentaRequest.registeredAgentState !== undefined) {
          updateFields.registeredAgentState = cuentaRequest.registeredAgentState;
        }
        if (cuentaRequest.registeredAgentZipCode !== undefined) {
          updateFields.registeredAgentZipCode = cuentaRequest.registeredAgentZipCode;
        }
        if (cuentaRequest.registeredAgentCountry !== undefined) {
          updateFields.registeredAgentCountry = cuentaRequest.registeredAgentCountry;
        }
        if (cuentaRequest.incorporationMonthYear !== undefined) {
          updateFields.incorporationMonthYear = cuentaRequest.incorporationMonthYear;
        }
        if (cuentaRequest.bankService !== undefined && cuentaRequest.bankService !== null && cuentaRequest.bankService !== '') {
          updateFields.bankService = cuentaRequest.bankService;
        }
        
        if (Object.keys(updateFields).length > 0) {
          await queryRunner.manager.update(
            CuentaBancariaRequest,
            { requestId: id },
            updateFields
          );
          this.logger.debug(`Campos actualizados explícitamente: ${JSON.stringify(updateFields)}`);
        }

        // El validator ahora se guarda como un member con validatesBankAccount = true
        // No se guarda en cuenta_bancaria_requests
        
        // Procesar owners (ahora como Members) si se proporcionan
        if (updateRequestDto.cuentaBancariaData) {
          const cuentaDataUpdate = updateRequestDto.cuentaBancariaData as any;
          const owners = cuentaDataUpdate.owners || [];
          
          // Procesar owners (ahora como Members) si hay datos en el payload
          // Si hay owners en el payload, significa que el usuario está en la sección 6 y quiere guardarlos
          // Independientemente del currentStepNumber (puede ser que se haya reseteado después de avanzar al paso de pago)
          if (owners.length > 0) {
            // Eliminar members existentes para reemplazarlos con los nuevos
            const existingMembers = await this.memberRepo.find({
              where: { requestId: id },
            });
            if (existingMembers.length > 0) {
              await queryRunner.manager.remove(Member, existingMembers);
            }

            // Filtrar owners que tengan al menos algún dato válido
            const validOwners = owners.filter((o: any) => 
              o.firstName || o.lastName || o.passportNumber
            );
            
            if (validOwners.length > 0) {
              const membersToSave = validOwners.map((ownerDto: any) => {
                const { dateOfBirth, passportFileUrl, lastName, passportNumber, ssnItin, cuit, participationPercentage, ...ownerDataWithoutDate } = ownerDto;
                const parsedDate = this.parseDate(dateOfBirth);
                
                // Mapear campos del frontend a la estructura de Member
                const memberData: any = {
                  requestId: id,
                  firstName: ownerDto.firstName || '',
                  lastName: lastName || ownerDto.lastName || '',
                  // Separar lastName en paternal y maternal si es necesario
                  paternalLastName: ownerDto.paternalLastName || '',
                  maternalLastName: ownerDto.maternalLastName || '',
                  // Usar passportNumber o passportOrNationalId
                  passportNumber: passportNumber || ownerDto.passportNumber || '',
                  passportOrNationalId: passportNumber || ownerDto.passportOrNationalId || ownerDto.passportNumber || '',
                  // Mapear passportFileUrl a identityDocumentUrl y scannedPassportUrl
                  // Solo asignar si hay un valor válido (no cadena vacía)
                  identityDocumentUrl: (passportFileUrl && passportFileUrl !== '') 
                    ? passportFileUrl 
                    : (ownerDto.identityDocumentUrl && ownerDto.identityDocumentUrl !== '') 
                      ? ownerDto.identityDocumentUrl 
                      : '',
                  scannedPassportUrl: (passportFileUrl && passportFileUrl !== '') 
                    ? passportFileUrl 
                    : (ownerDto.scannedPassportUrl && ownerDto.scannedPassportUrl !== '') 
                      ? ownerDto.scannedPassportUrl 
                      : '',
                  facialPhotographUrl: ownerDto.facialPhotographUrl || '',
                  nationality: ownerDto.nationality || '',
                  // Campos opcionales que pueden venir del frontend
                  ssnOrItin: ssnItin || ownerDto.ssnItin || null,
                  nationalTaxId: cuit || ownerDto.cuit || null,
                  percentageOfParticipation: participationPercentage || ownerDto.participationPercentage || 0,
                  // Campos requeridos de Member (valores por defecto si no vienen)
                  email: ownerDto.email || '',
                  phoneNumber: ownerDto.phoneNumber || '',
                  memberAddress: ownerDto.memberAddress || {
                    street: '',
                    city: '',
                    stateRegion: '',
                    postalCode: '',
                    country: ''
                  },
                  validatesBankAccount: false,
                  ...(parsedDate ? { dateOfBirth: parsedDate } : {}),
                };
                
                return this.memberRepo.create(memberData);
              }) as unknown as Member[];
              
              await queryRunner.manager.save(Member, membersToSave);
            }
          }
        }
      }

      await queryRunner.commitTransaction();

      if (
        request.status === 'solicitud-recibida' &&
        statusBeforeUpdate !== 'solicitud-recibida'
      ) {
        const clientRow = await this.clientRepo.findOne({
          where: { id: request.clientId },
        });
        const skipZohoContactForPartnerFlow =
          request.partnerId != null || (clientRow != null && clientRow.partnerId != null);
        if (clientRow && !clientRow.zohoContactId && !skipZohoContactForPartnerFlow) {
          void this.zohoContactService.findOrCreateContact(clientRow);
        }
        await this.requestSubmittedNotifications.notifyAfterSolicitudRecibida(
          request,
          clientRow,
          actorUser ?? null,
          { channel: 'panel' },
        );
      }

      // Mover archivos de request/{servicio}/ a request/{servicio}/{uuid}/ si existen y actualizar URLs
      // Esto organiza los archivos subidos antes de crear el request o cuando se actualiza un request existente
      if (request.uuid && request.type) {
        try {
          const keysToMove = this.collectS3KeysFromRequestPayload(
            request.type,
            request.uuid,
            updateRequestDto,
          );
          this.logger.log(`Moviendo archivos para request ${request.uuid} de tipo ${request.type}`);
          const moveResult = await this.uploadFileService.moveFilesToRequestFolder(
            request.type,
            request.uuid,
            keysToMove,
          );
          
          if (moveResult.moved > 0) {
            this.logger.log(`Archivos movidos: ${moveResult.moved} exitosos, ${moveResult.errors} errores`);
            
            // Actualizar URLs en la base de datos después de mover los archivos
            await this.updateFileUrlsAfterMove(request.type, request.uuid, id);
          }
        } catch (error) {
          // No fallar la actualización del request si falla el movimiento de archivos
          this.logger.error(`Error al mover archivos para request ${request.uuid}:`, error);
        }
      }

      // Retornar la solicitud actualizada con relaciones
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      console.error('Error al actualizar solicitud:', error);
      throw new InternalServerErrorException(
        'Error al actualizar la solicitud. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Staff del panel (admin / user operativo): solo puede actualizar solicitudes
   * en pendiente o solicitud-recibida y sin cuenta Zoho asociada.
   */
  private assertStaffPanelUpdateAllowed(
    request: Request,
    actorUser?: PanelRequestActorUser | null,
  ): void {
    const t = actorUser?.type;
    if (t !== 'admin' && t !== 'user') {
      return;
    }
    const okStatus =
      request.status === 'pendiente' || request.status === 'solicitud-recibida';
    if (!okStatus || request.zohoAccountId) {
      throw new ForbiddenException(
        'Solo se pueden editar solicitudes en estado pendiente o solicitud-recibida sin cuenta Zoho asociada.',
      );
    }
  }

  // ========== MÉTODOS DE MIEMBROS ==========

  async findMembersByRequest(requestId: number) {
    // Verificar que la solicitud existe
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }

    return this.memberRepo.find({
      where: { requestId },
      order: { createdAt: 'ASC' },
    });
  }

  async createMember(requestId: number, createMemberDto: CreateMemberDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que la solicitud existe
      const request = await this.requestRepository.findOne({
        where: { id: requestId },
        relations: ['aperturaLlcRequest', 'renovacionLlcRequest'],
      });
      if (!request) {
        throw new NotFoundException(
          `Solicitud con ID ${requestId} no encontrada`,
        );
      }

      // Verificar que la solicitud es de tipo LLC o cuenta-bancaria
      if (
        request.type !== 'apertura-llc' &&
        request.type !== 'renovacion-llc' &&
        request.type !== 'cuenta-bancaria'
      ) {
        throw new BadRequestException(
          'Los miembros solo pueden agregarse a solicitudes de Apertura LLC, Renovación LLC o Cuenta Bancaria',
        );
      }

      // Si el miembro valida cuenta bancaria, verificar que no haya otro validador
      if (createMemberDto.validatesBankAccount) {
        const existingValidator = await this.memberRepo.findOne({
          where: {
            requestId,
            validatesBankAccount: true,
          },
        });
        if (existingValidator) {
          throw new BadRequestException(
            'Ya existe un miembro que valida la cuenta bancaria. Solo puede haber uno.',
          );
        }
      }

      // Crear el miembro
      const { dateOfBirth, ...memberDataWithoutDate } = createMemberDto;
      const parsedDate = this.parseDate(dateOfBirth);
      const member = this.memberRepo.create({
        requestId,
        ...memberDataWithoutDate,
        ...(parsedDate ? { dateOfBirth: parsedDate } : {}),
      });

      const savedMember = await queryRunner.manager.save(Member, member);

      await queryRunner.commitTransaction();
      return savedMember;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al crear miembro:', error);
      throw new InternalServerErrorException(
        'Error al crear el miembro. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async updateMember(
    requestId: number,
    memberId: number,
    updateMemberDto: UpdateMemberDto,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que la solicitud existe
      const request = await this.requestRepository.findOne({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException(
          `Solicitud con ID ${requestId} no encontrada`,
        );
      }

      // Buscar el miembro
      const member = await this.memberRepo.findOne({
        where: { id: memberId, requestId },
      });
      if (!member) {
        throw new NotFoundException(
          `Miembro con ID ${memberId} no encontrado en la solicitud ${requestId}`,
        );
      }

      // Si se está actualizando validatesBankAccount a true, verificar que no haya otro validador
      if (
        updateMemberDto.validatesBankAccount === true &&
        !member.validatesBankAccount
      ) {
        const existingValidator = await this.memberRepo.findOne({
          where: {
            requestId,
            validatesBankAccount: true,
            id: memberId, // Excluir el miembro actual
          },
        });
        if (existingValidator) {
          throw new BadRequestException(
            'Ya existe otro miembro que valida la cuenta bancaria. Solo puede haber uno.',
          );
        }
      }

      // Actualizar campos
      if (updateMemberDto.dateOfBirth) {
        const parsedDate = this.parseDate(updateMemberDto.dateOfBirth as string);
        if (parsedDate) {
          updateMemberDto.dateOfBirth = parsedDate as any;
        } else {
          delete updateMemberDto.dateOfBirth;
        }
      }
      Object.assign(member, updateMemberDto);

      const updatedMember = await queryRunner.manager.save(Member, member);

      await queryRunner.commitTransaction();
      return updatedMember;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al actualizar miembro:', error);
      throw new InternalServerErrorException(
        'Error al actualizar el miembro. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async deleteMember(requestId: number, memberId: number) {
    // Verificar que la solicitud existe
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }

    // Buscar el miembro
    const member = await this.memberRepo.findOne({
      where: { id: memberId, requestId },
    });
    if (!member) {
      throw new NotFoundException(
        `Miembro con ID ${memberId} no encontrado en la solicitud ${requestId}`,
      );
    }

    await this.memberRepo.remove(member);
    return { message: 'Miembro eliminado correctamente' };
  }

  async validateMemberPercentages(requestId: number) {
    const members = await this.memberRepo.find({
      where: { requestId },
    });

    if (members.length === 0) {
      throw new BadRequestException(
        'No hay miembros en esta solicitud para validar',
      );
    }

    const totalPercentage = members.reduce(
      (sum, member) => sum + Number(member.percentageOfParticipation),
      0,
    );

    const isValid = Math.abs(totalPercentage - 100) < 0.01; // Tolerancia para decimales

    return {
      isValid,
      totalPercentage,
      expectedPercentage: 100,
      difference: Math.abs(totalPercentage - 100),
      members: members.map((m) => ({
        id: m.id,
        name: `${m.firstName} ${m.lastName}`,
        percentage: Number(m.percentageOfParticipation),
      })),
    };
  }

  // ========== MÉTODOS DE PROPIETARIOS Y VALIDADORES (DEPRECADOS) ==========
  // NOTA: Estos métodos ya no se usan. Los owners ahora se manejan como Members
  // y los validators se guardan directamente en CuentaBancariaRequest con campos validator_*
  // Se mantienen comentados por compatibilidad temporal, pero pueden eliminarse después de verificar
  // que no hay código externo que los use.

  // ========== MÉTODOS ADICIONALES ==========

  async findAll(
    filters?: {
      status?: string;
      type?: string;
      clientId?: number;
      partnerId?: number;
      search?: string;
    },
    page: number = 1,
    limit: number = 10,
  ) {
    const queryBuilder = this.requestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.client', 'client')
      .leftJoinAndSelect('request.partner', 'partner');

    // Aplicar filtros básicos
    if (filters?.status) {
      queryBuilder.andWhere('request.status = :status', { status: filters.status });
    }
    if (filters?.type) {
      queryBuilder.andWhere('request.type = :type', { type: filters.type });
    }
    if (filters?.clientId != null) {
      queryBuilder.andWhere('request.clientId = :clientId', {
        clientId: filters.clientId,
      });
    }
    if (filters?.partnerId) {
      queryBuilder.andWhere('request.partnerId = :partnerId', { partnerId: filters.partnerId });
    }

    // Aplicar búsqueda en nombre, email del cliente o partner
    if (filters?.search && filters.search.length > 0) {
      const searchPattern = `%${filters.search}%`;
      queryBuilder.andWhere(
        '(client.email ILIKE :search OR client.username ILIKE :search OR client.first_name ILIKE :search OR client.last_name ILIKE :search OR partner.email ILIKE :search OR partner.username ILIKE :search OR partner.first_name ILIKE :search OR partner.last_name ILIKE :search)',
        { search: searchPattern }
      );
    }

    // Ordenar por fecha de creación descendente
    queryBuilder.orderBy('request.createdAt', 'DESC');

    // Aplicar paginación
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Ejecutar consulta
    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // getRequiredDocuments eliminado - RequestRequiredDocument ya no se usa

  /**
   * DELETE por request_id solo si la tabla existe en `public`.
   * No usar try/catch sobre DELETE inexistente: en PostgreSQL el error aborta la transacción (25P02 en los siguientes comandos).
   */
  private async deleteFromOptionalTableIfExists(
    manager: EntityManager,
    tableName: 'process_steps' | 'documents' | 'notifications',
    requestId: number,
  ): Promise<void> {
    const check = await manager.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS "exists"`,
      [tableName],
    );
    if (!check[0]?.exists) {
      return;
    }
    await manager.query(
      `DELETE FROM ${tableName} WHERE request_id = $1`,
      [requestId],
    );
  }

  async delete(id: number, userId: number, userRole: string) {
    const request = await this.requestRepository.findOne({
      where: { id },
      relations: ['client', 'partner'],
    });

    if (!request) {
      throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
    }

    // Solo admin puede eliminar cualquier solicitud
    // Usuarios normales solo pueden eliminar sus propias solicitudes si están pendientes
    if (userRole !== 'admin') {
      // Verificar que el usuario es el cliente o partner de la solicitud
      const isOwner =
        request.clientId === userId || request.partnerId === userId;

      if (!isOwner) {
        throw new BadRequestException(
          'No tienes permiso para eliminar esta solicitud',
        );
      }

      // Solo se pueden eliminar solicitudes pendientes o solicitud-recibida
      if (request.status !== 'pendiente' && request.status !== 'solicitud-recibida') {
        throw new BadRequestException(
          'Solo se pueden eliminar solicitudes en estado pendiente o solicitud recibida',
        );
      }
    }

    // Borrado explícito de hijos: el FK apunta desde tablas como apertura_llc_requests hacia requests;
    // TypeORM cascade en OneToOne no elimina el hijo al borrar el padre en todos los casos.
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Member, { requestId: id });
      await manager.delete(AperturaLlcRequest, { requestId: id });
      await manager.delete(RenovacionLlcRequest, { requestId: id });
      await manager.delete(CuentaBancariaRequest, { requestId: id });

      await this.deleteFromOptionalTableIfExists(manager, 'process_steps', id);
      await this.deleteFromOptionalTableIfExists(manager, 'documents', id);
      await this.deleteFromOptionalTableIfExists(manager, 'notifications', id);

      const del = await manager.delete(Request, { id });
      if (!del.affected) {
        throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
      }
    });

    return { message: 'Solicitud eliminada correctamente' };
  }

  /**
   * Aprobar una solicitud - cambia de 'solicitud-recibida' a 'en-proceso' con etapa inicial del blueprint
   */
  async approveRequest(id: number, approveDto: ApproveRequestDto) {
    const request = await this.requestRepository.findOne({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
    }

    if (request.status !== 'solicitud-recibida') {
      throw new BadRequestException(
        'Solo se pueden aprobar solicitudes en estado "Solicitud Recibida"',
      );
    }

    // Etapa inicial del blueprint según el tipo de solicitud
    let defaultStage = 'Solicitud Recibida';
    if (request.type === 'cuenta-bancaria') {
      defaultStage = 'Cuenta Bancaria Confirmada';
    } else if (request.type === 'renovacion-llc') {
      defaultStage = 'Solicitud Recibida';
    }
    
    const initialStageRaw = approveDto.initialStage || defaultStage;
    const initialStage =
      request.type === 'apertura-llc'
        ? applyAperturaClientStageAlias(initialStageRaw)
        : request.type === 'renovacion-llc'
          ? applyRenovacionClientStageAlias(initialStageRaw)
          : initialStageRaw;

    // PRIMERO: Sincronizar con Zoho CRM antes de aprobar
    // Si la sincronización falla, no se aprueba la solicitud
    try {
      this.logger.log(`Iniciando sincronización con Zoho para solicitud ${id} antes de aprobar`);
      await this.zohoSyncService.syncRequestToZoho(id);
      this.logger.log(`Sincronización con Zoho completada exitosamente para solicitud ${id}`);
    } catch (error: any) {
      // Si la sincronización falla, no aprobar la solicitud
      this.logger.error(
        `Error al sincronizar solicitud ${id} con Zoho. La solicitud NO será aprobada:`,
        error.message || error,
      );
      throw new BadRequestException(
        `No se pudo aprobar la solicitud porque falló la sincronización con Zoho: ${error.message || 'Error desconocido'}`,
      );
    }

    // SOLO si la sincronización fue exitosa, aprobar la solicitud
    // Recargar la solicitud para obtener el zohoAccountId actualizado por syncRequestToZoho
    const updatedRequest = await this.requestRepository.findOne({ where: { id } });
    if (!updatedRequest) {
      throw new NotFoundException(`Solicitud con ID ${id} no encontrada tras sincronización`);
    }

    updatedRequest.status = 'en-proceso';
    updatedRequest.stage = initialStage;
    if (approveDto.notes) {
      updatedRequest.notes = approveDto.notes;
    }

    await this.requestRepository.save(updatedRequest);

    this.logger.log(
      `Solicitud ${id} aprobada exitosamente. Etapa inicial: ${initialStage}. zohoAccountId: ${updatedRequest.zohoAccountId ?? 'no asignado'}`,
    );

    return {
      message: 'Solicitud aprobada correctamente',
      request: {
        id: updatedRequest.id,
        status: updatedRequest.status,
        stage: updatedRequest.stage,
        zohoAccountId: updatedRequest.zohoAccountId,
      },
    };
  }

  /**
   * Rechazar una solicitud - cambia de 'solicitud-recibida' a 'rechazada'
   */
  async rejectRequest(id: number, rejectDto: RejectRequestDto) {
    const request = await this.requestRepository.findOne({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(`Solicitud con ID ${id} no encontrada`);
    }

    if (request.status !== 'solicitud-recibida') {
      throw new BadRequestException(
        'Solo se pueden rechazar solicitudes en estado "Solicitud Recibida"',
      );
    }

    // Actualizar estado a rechazada
    request.status = 'rechazada';
    if (rejectDto.notes) {
      request.notes = rejectDto.notes;
    }

    await this.requestRepository.save(request);

    this.logger.log(`Solicitud ${id} rechazada`);

    return {
      message: 'Solicitud rechazada correctamente',
      request: {
        id: request.id,
        status: request.status,
      },
    };
  }

  /**
   * Obtener las etapas del blueprint para Apertura LLC
   */
  getBlueprintStages(): string[] {
    return [
      'Apertura Confirmada',
      'Filing Iniciado',
      'Documentación completada',
      'Apertura Cuenta Bancaria',
      'Cuenta Bancaria Confirmada',
      'Confirmación pago',
      'Apertura Activa',
      'Apertura Perdida',
    ];
  }

  /**
   * Obtener las etapas del blueprint para Cuenta Bancaria
   */
  getCuentaBancariaBlueprintStages(): string[] {
    return [
      'Cuenta Bancaria Confirmada',
      'Onboarding',
      // Las siguientes 2 etapas son especiales y se muestran condicionalmente:
      // 'Cuenta Bancaria Finalizada' - Solo se muestra si es el stage actual
      // 'Cuenta Bancaria Perdida' - Solo se muestra si es el stage actual (y ahí se queda)
    ];
  }

  /**
   * Actualiza las URLs de archivos después de moverlos de request/{servicio}/ a request/{servicio}/{uuid}/
   */
  private async updateFileUrlsAfterMove(
    servicio: string,
    requestUuid: string,
    requestId: number,
  ): Promise<void> {
    const servicioNormalizado = servicio
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const mediaDomain = awsConfigService.getMediaDomain().replace(/\/$/, '');
    const oldPrefix = `${mediaDomain}/request/${servicioNormalizado}/`;
    const newPrefix = `${mediaDomain}/request/${servicioNormalizado}/${requestUuid}/`;

    this.logger.log(`Actualizando URLs de archivos: ${oldPrefix} -> ${newPrefix}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Buscar la request para determinar el tipo
      const request = await this.requestRepository.findOne({
        where: { id: requestId },
        relations: ['aperturaLlcRequest', 'renovacionLlcRequest', 'cuentaBancariaRequest'],
      });

      if (!request) {
        throw new NotFoundException(`Request ${requestId} no encontrada`);
      }

      // Función helper para actualizar URLs en un objeto
      const updateUrlsInObject = (obj: any, urlFields: string[]): boolean => {
        let updated = false;
        for (const field of urlFields) {
          if (obj[field] && typeof obj[field] === 'string' && obj[field].startsWith(oldPrefix)) {
            obj[field] = obj[field].replace(oldPrefix, newPrefix);
            updated = true;
          }
        }
        return updated;
      };

      // Actualizar URLs según el tipo de request
      if (request.type === 'apertura-llc' && request.aperturaLlcRequest) {
        const urlFields = [
          'einDocumentUrl',
          'certificateOfFormationUrl',
          'serviceBillUrl',
          'bankStatementUrl',
        ];
        if (updateUrlsInObject(request.aperturaLlcRequest, urlFields)) {
          await queryRunner.manager.save(AperturaLlcRequest, request.aperturaLlcRequest);
        }

        // Actualizar URLs en miembros
        const members = await this.memberRepo.find({ where: { requestId } });
        for (const member of members) {
          const memberUrlFields = ['scannedPassportUrl', 'additionalBankDocsUrl'];
          if (updateUrlsInObject(member, memberUrlFields)) {
            await queryRunner.manager.save(Member, member);
          }
        }
      } else if (request.type === 'renovacion-llc' && request.renovacionLlcRequest) {
        const urlFields = [
          'identityDocumentUrl',
          'proofOfAddressUrl',
          'llcContractOrOperatingAgreementUrl',
          'articlesOfIncorporationUrl',
          'capitalContributionsUrl',
          'stateRegistrationUrl',
          'certificateOfGoodStandingUrl',
          'partnersPassportsFileUrl',
          'operatingAgreementAdditionalFileUrl',
          'form147Or575FileUrl',
          'articlesOfOrganizationAdditionalFileUrl',
          'boiReportFileUrl',
          'bankStatementsFileUrl',
        ];
        if (updateUrlsInObject(request.renovacionLlcRequest, urlFields)) {
          await queryRunner.manager.save(RenovacionLlcRequest, request.renovacionLlcRequest);
        }

        // Actualizar URLs en miembros
        const members = await this.memberRepo.find({ where: { requestId } });
        for (const member of members) {
          const memberUrlFields = ['scannedPassportUrl', 'additionalBankDocsUrl'];
          if (updateUrlsInObject(member, memberUrlFields)) {
            await queryRunner.manager.save(Member, member);
          }
        }
      } else if (request.type === 'cuenta-bancaria' && request.cuentaBancariaRequest) {
        const urlFields = [
          'einLetterUrl',
          'certificateOfConstitutionOrArticlesUrl',
          'proofOfAddressUrl',
          // El validator ahora está en Members, no en CuentaBancariaRequest
        ];
        if (updateUrlsInObject(request.cuentaBancariaRequest, urlFields)) {
          await queryRunner.manager.save(CuentaBancariaRequest, request.cuentaBancariaRequest);
        }

        // Actualizar URLs en members (ahora usan Member en lugar de BankAccountOwner)
        const members = await this.memberRepo.find({ where: { requestId } });
        for (const member of members) {
          const memberUrlFields = ['identityDocumentUrl', 'scannedPassportUrl'];
          if (updateUrlsInObject(member, memberUrlFields)) {
            await queryRunner.manager.save(Member, member);
          }
        }
      }

      await queryRunner.commitTransaction();
      this.logger.log(`URLs actualizadas para request ${requestId}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al actualizar URLs para request ${requestId}:`, error);
      // No lanzar error, solo loguear
    } finally {
      await queryRunner.release();
    }
  }
}

