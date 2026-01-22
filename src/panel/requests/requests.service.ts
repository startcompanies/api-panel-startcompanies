import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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
  ) {}

  async findAllByUser(userId: number, role: 'client' | 'partner') {
    const client = await this.clientRepo.findOne({
      where: { userId },
    });
    
    const where = role === 'client' ? { clientId: client?.id } : { partnerId: userId };

    const requests = await this.requestRepository.find({ 
      where, 
      order: { createdAt: 'DESC' },
      relations: [
        'client',
        'partner',
        'aperturaLlcRequest',
        'renovacionLlcRequest',
        'cuentaBancariaRequest',
      ],
    });

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
      einNumber: request.aperturaLlcRequest?.einNumber || '',
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
        
        // Mapear campos del validador desde CuentaBancariaRequest (ya no hay BankAccountValidator separado)
        if (cuentaData.validatorFirstName || cuentaData.validatorLastName) {
          (request as any).bankAccountValidator = {
            firstName: cuentaData.validatorFirstName || '',
            lastName: cuentaData.validatorLastName || '',
            dateOfBirth: cuentaData.validatorDateOfBirth || null,
            nationality: cuentaData.validatorNationality || '',
            citizenship: cuentaData.validatorCitizenship || '',
            passportNumber: cuentaData.validatorPassportNumber || '',
            scannedPassportUrl: cuentaData.validatorScannedPassportUrl || '',
            workEmail: cuentaData.validatorWorkEmail || '',
            useEmailForRelayLogin: cuentaData.validatorUseEmailForRelayLogin || false,
            phone: cuentaData.validatorPhone || '',
            canReceiveSMS: cuentaData.validatorCanReceiveSMS || false,
            isUSResident: cuentaData.validatorIsUSResident || false,
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
        
        // Mapear campos del validador desde CuentaBancariaRequest (ya no hay BankAccountValidator separado)
        if (cuentaData.validatorFirstName || cuentaData.validatorLastName) {
          (request as any).bankAccountValidator = {
            firstName: cuentaData.validatorFirstName || '',
            lastName: cuentaData.validatorLastName || '',
            dateOfBirth: cuentaData.validatorDateOfBirth || null,
            nationality: cuentaData.validatorNationality || '',
            citizenship: cuentaData.validatorCitizenship || '',
            passportNumber: cuentaData.validatorPassportNumber || '',
            scannedPassportUrl: cuentaData.validatorScannedPassportUrl || '',
            workEmail: cuentaData.validatorWorkEmail || '',
            useEmailForRelayLogin: cuentaData.validatorUseEmailForRelayLogin || false,
            phone: cuentaData.validatorPhone || '',
            canReceiveSMS: cuentaData.validatorCanReceiveSMS || false,
            isUSResident: cuentaData.validatorIsUSResident || false,
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

  async create(createRequestDto: CreateRequestDto) {
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

      // Validar currentStepNumber según el tipo
      const maxSteps = {
        'apertura-llc': 6,
        'renovacion-llc': 6,
        'cuenta-bancaria': 7,
      };
      if (
        createRequestDto.currentStepNumber < 1 ||
        createRequestDto.currentStepNumber > maxSteps[createRequestDto.type]
      ) {
        throw new BadRequestException(
          `currentStepNumber debe estar entre 1 y ${maxSteps[createRequestDto.type]} para tipo ${createRequestDto.type}`,
        );
      }

      // Determinar el status: si hay pago, será 'solicitud-recibida', sino 'pendiente'
      // Durante el flujo del wizard, siempre es 'pendiente' hasta que se procesa el pago
      const willProcessPayment = !!(createRequestDto.stripeToken && createRequestDto.paymentAmount);
      const requestStatus = willProcessPayment 
        ? (createRequestDto.status || 'solicitud-recibida')
        : 'pendiente'; // Siempre pendiente durante el flujo del wizard

      // Validación dinámica según tipo de servicio y sección
      // Si se va a procesar el pago, validar todo estrictamente
      // Si es borrador (pendiente), validar solo campos de la sección actual
      const serviceData = this.getServiceData(createRequestDto);
      
      try {
        validateRequestData(
          serviceData,
          createRequestDto.type,
          createRequestDto.currentStepNumber,
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
      const request = this.requestRepository.create({
        type: createRequestDto.type,
        status: requestStatus, // Ya determinado arriba: 'pendiente' o 'solicitud-recibida'
        currentStep: createRequestDto.currentStep, // Paso principal del wizard
        clientId: clientId,
        partnerId: createRequestDto.partnerId,
        notes: createRequestDto.notes,
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
        if (createRequestDto.currentStepNumber >= 6) {
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
        const currentStep = createRequestDto.currentStepNumber || 1;
        const aperturaDataToCreate: any = {
          requestId: savedRequest.id,
          currentStepNumber: createRequestDto.currentStepNumber,
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
        
        // Sección 3 - solo procesar si currentStepNumber >= 3
        if (currentStep < 3) {
          delete aperturaDataToCreate.serviceBillUrl;
          delete aperturaDataToCreate.bankStatementUrl;
          delete aperturaDataToCreate.periodicIncome10k;
          delete aperturaDataToCreate.bankAccountLinkedEmail;
          delete aperturaDataToCreate.bankAccountLinkedPhone;
          delete aperturaDataToCreate.actividadFinancieraEsperada;
          delete aperturaDataToCreate.projectOrCompanyUrl;
        }
        
        // Solo incluir llcType si tiene un valor válido ('single' o 'multi')
        if (aperturaDataToCreate.llcType !== 'single' && aperturaDataToCreate.llcType !== 'multi') {
          delete aperturaDataToCreate.llcType;
        }
        
        const aperturaData = this.aperturaRepo.create(aperturaDataToCreate);
        await queryRunner.manager.save(AperturaLlcRequest, aperturaData);

        // Crear miembros solo si estamos en la sección 2 o superior (donde se capturan los miembros)
        // Filtrar miembros vacíos (sin datos básicos)
        if (createRequestDto.currentStepNumber >= 2 && members && members.length > 0) {
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
        if (createRequestDto.currentStepNumber >= 2) {
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

        const renovacionData = this.renovacionRepo.create({
          requestId: savedRequest.id,
          currentStepNumber: createRequestDto.currentStepNumber,
          ...renovacionDataFields,
        });
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
        
        // Construir registeredAgentAddress desde campos individuales (sección 2)
        // Guardar registeredAgentState por separado además de la dirección completa
        if (cuentaDataRaw.registeredAgentState !== undefined) {
          cuentaDataRaw.registeredAgentState = cuentaDataRaw.registeredAgentState || '';
        }
        
        if (cuentaDataRaw.registeredAgentStreet || cuentaDataRaw.registeredAgentCity || cuentaDataRaw.registeredAgentState) {
          cuentaDataRaw.registeredAgentAddress = [
            cuentaDataRaw.registeredAgentStreet || '',
            cuentaDataRaw.registeredAgentUnit || '',
            cuentaDataRaw.registeredAgentCity || '',
            cuentaDataRaw.registeredAgentState || '',
            cuentaDataRaw.registeredAgentZipCode || '',
            cuentaDataRaw.registeredAgentCountry || ''
          ].filter(Boolean).join(', ');
          
          // Eliminar campos individuales después de construir la dirección (excepto registeredAgentState que se guarda por separado)
          delete cuentaDataRaw.registeredAgentStreet;
          delete cuentaDataRaw.registeredAgentUnit;
          delete cuentaDataRaw.registeredAgentCity;
          // NO eliminar registeredAgentState - se guarda por separado
          delete cuentaDataRaw.registeredAgentZipCode;
          delete cuentaDataRaw.registeredAgentCountry;
        }
        
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
          if (cuentaDataRaw.isMultiMember === 'yes') {
            cuentaDataRaw.llcType = 'multi';
          } else if (cuentaDataRaw.isMultiMember === 'no') {
            cuentaDataRaw.llcType = 'single';
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
        
        // Eliminar campos de secciones que aún no se han completado
        // Sección 3 (validador) - solo procesar si currentStepNumber >= 3
        if (currentStep < 3) {
          // Eliminar todos los campos del validador si estamos antes de la sección 3
          delete cuentaDataRaw.validatorFirstName;
          delete cuentaDataRaw.validatorLastName;
          delete cuentaDataRaw.validatorDateOfBirth;
          delete cuentaDataRaw.validatorNationality;
          delete cuentaDataRaw.validatorCitizenship;
          delete cuentaDataRaw.validatorPassportNumber;
          delete cuentaDataRaw.validatorPassportUrl;
          delete cuentaDataRaw.validatorScannedPassportUrl;
          delete cuentaDataRaw.validatorWorkEmail;
          delete cuentaDataRaw.validatorUseEmailForRelayLogin;
          delete cuentaDataRaw.validatorPhone;
          delete cuentaDataRaw.validatorCanReceiveSMS;
          delete cuentaDataRaw.validatorIsUSResident;
          delete cuentaDataRaw.validatorTitle;
          delete cuentaDataRaw.validatorIncomeSource;
          delete cuentaDataRaw.validatorAnnualIncome;
        }
        
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
        
        // Procesar validator: guardar directamente en CuentaBancariaRequest
        // Solo procesar si estamos en la sección 3 o superior
        if (currentStep >= 3) {
          // Los campos del validador pueden venir en validators[] o directamente en cuentaDataRaw
          // Priorizar validators[] si existe, sino usar cuentaDataRaw directamente
          let validatorData: any = null;
          
          if (validators && validators.length > 0) {
            validatorData = validators[0]; // Solo hay un validador
          } else {
            // Si no hay validators[], verificar si los campos vienen directamente en cuentaDataRaw
            if (cuentaDataRaw.validatorFirstName || cuentaDataRaw.validatorLastName || 
                cuentaDataRaw.validatorDateOfBirth || cuentaDataRaw.validatorPassportNumber ||
                cuentaDataRaw.validatorPassportUrl || cuentaDataRaw.validatorScannedPassportUrl ||
                cuentaDataRaw.isUSResident || cuentaDataRaw.validatorIsUSResident) {
              validatorData = cuentaDataRaw;
            }
          }
          
          if (validatorData) {
            // Mapear campos del frontend a campos del validador en cuentaDataRaw
            // Solo asignar si el campo tiene un valor válido (no cadena vacía)
            if (validatorData.validatorFirstName !== undefined && validatorData.validatorFirstName !== '') {
              cuentaDataRaw.validatorFirstName = validatorData.validatorFirstName || validatorData.firstName || '';
            }
            if (validatorData.validatorLastName !== undefined && validatorData.validatorLastName !== '') {
              cuentaDataRaw.validatorLastName = validatorData.validatorLastName || validatorData.lastName || '';
            }
            if (validatorData.validatorNationality !== undefined && validatorData.validatorNationality !== '') {
              cuentaDataRaw.validatorNationality = validatorData.validatorNationality || validatorData.nationality || '';
            }
            if (validatorData.validatorCitizenship !== undefined && validatorData.validatorCitizenship !== '') {
              cuentaDataRaw.validatorCitizenship = validatorData.validatorCitizenship || validatorData.citizenship || '';
            }
            if (validatorData.validatorPassportNumber !== undefined && validatorData.validatorPassportNumber !== '') {
              cuentaDataRaw.validatorPassportNumber = validatorData.validatorPassportNumber || validatorData.passportNumber || '';
            }
            // Guardar URL del pasaporte - puede venir como validatorPassportUrl o validatorScannedPassportUrl
            // Priorizar validatorData, pero si está vacío, verificar en cuentaDataRaw
            const passportUrl = (validatorData.validatorPassportUrl && validatorData.validatorPassportUrl !== '') 
              ? validatorData.validatorPassportUrl 
              : (validatorData.scannedPassportUrl && validatorData.scannedPassportUrl !== '')
                ? validatorData.scannedPassportUrl
                : (cuentaDataRaw.validatorPassportUrl && cuentaDataRaw.validatorPassportUrl !== '')
                  ? cuentaDataRaw.validatorPassportUrl
                  : (cuentaDataRaw.validatorScannedPassportUrl && cuentaDataRaw.validatorScannedPassportUrl !== '')
                    ? cuentaDataRaw.validatorScannedPassportUrl
                    : '';
            
            if (passportUrl !== '') {
              cuentaDataRaw.validatorScannedPassportUrl = passportUrl;
            }
            if (validatorData.validatorWorkEmail !== undefined && validatorData.validatorWorkEmail !== '') {
              cuentaDataRaw.validatorWorkEmail = validatorData.validatorWorkEmail || validatorData.workEmail || '';
            }
            if (validatorData.validatorPhone !== undefined && validatorData.validatorPhone !== '') {
              cuentaDataRaw.validatorPhone = validatorData.validatorPhone || validatorData.phone || '';
            }
            
            // Campos adicionales del validador
            if (validatorData.validatorTitle !== undefined && validatorData.validatorTitle !== '') {
              cuentaDataRaw.validatorTitle = validatorData.validatorTitle || '';
            }
            if (validatorData.validatorIncomeSource !== undefined && validatorData.validatorIncomeSource !== '') {
              cuentaDataRaw.validatorIncomeSource = validatorData.validatorIncomeSource || '';
            }
            if (validatorData.validatorAnnualIncome !== undefined && validatorData.validatorAnnualIncome !== '') {
              // Convertir a número si viene como string
              const annualIncome = typeof validatorData.validatorAnnualIncome === 'string' 
                ? parseFloat(validatorData.validatorAnnualIncome) 
                : validatorData.validatorAnnualIncome;
              if (!isNaN(annualIncome)) {
                cuentaDataRaw.validatorAnnualIncome = annualIncome;
              }
            }
            
            // Campos booleanos
            if (validatorData.useEmailForRelayLogin !== undefined) {
              cuentaDataRaw.validatorUseEmailForRelayLogin = validatorData.useEmailForRelayLogin || false;
            }
            if (validatorData.canReceiveSMS !== undefined) {
              cuentaDataRaw.validatorCanReceiveSMS = validatorData.canReceiveSMS || false;
            }
            // Guardar isUSResident - puede venir como 'yes'/'no' o boolean
            // Priorizar validatorData, pero si no está definido, verificar en cuentaDataRaw
            const isUSResidentValue = validatorData.isUSResident !== undefined && validatorData.isUSResident !== ''
              ? validatorData.isUSResident 
              : cuentaDataRaw.isUSResident !== undefined && cuentaDataRaw.isUSResident !== ''
                ? cuentaDataRaw.isUSResident
                : undefined;
            
            if (isUSResidentValue !== undefined && isUSResidentValue !== '') {
              cuentaDataRaw.validatorIsUSResident = isUSResidentValue === 'yes' || isUSResidentValue === true;
            }
            
            // Parsear fecha de nacimiento - solo si tiene un valor válido (no cadena vacía)
            const dateOfBirth = validatorData.validatorDateOfBirth || validatorData.dateOfBirth;
            if (dateOfBirth && dateOfBirth.trim() !== '') {
              const parsedDate = this.parseDate(dateOfBirth);
              if (parsedDate) {
                cuentaDataRaw.validatorDateOfBirth = parsedDate;
              } else {
                // Si no se puede parsear, no asignar (no incluir en cuentaDataRaw)
                delete cuentaDataRaw.validatorDateOfBirth;
              }
            } else {
              // Si viene como cadena vacía, no incluir en cuentaDataRaw
              delete cuentaDataRaw.validatorDateOfBirth;
            }
          }
        }
        
        // Preparar datos para crear, excluyendo llcType si no tiene un valor válido
        const cuentaDataToCreate: any = {
          requestId: savedRequest.id,
          currentStepNumber: createRequestDto.currentStepNumber,
          ...cuentaDataRaw,
          firstRegistrationDate: cuentaDataRaw.firstRegistrationDate
            ? new Date(cuentaDataRaw.firstRegistrationDate)
            : undefined,
        };
        
        // Solo incluir llcType si tiene un valor válido ('single' o 'multi')
        if (cuentaDataRaw.llcType === 'single' || cuentaDataRaw.llcType === 'multi') {
          cuentaDataToCreate.llcType = cuentaDataRaw.llcType;
        }
        
        const cuentaData = this.cuentaRepo.create(cuentaDataToCreate);
        await queryRunner.manager.save(CuentaBancariaRequest, cuentaData);
        
        // Procesar owners (ahora como Members) si hay datos en el payload
        // Si hay owners en el payload, significa que el usuario está en la sección 6 y quiere guardarlos
        // Independientemente del currentStepNumber (puede ser que se haya reseteado después de avanzar al paso de pago)
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

      await queryRunner.commitTransaction();

      // Mover archivos de request/{servicio}/ a request/{servicio}/{uuid}/ si existen
      // Esto organiza los archivos subidos antes de crear el request
      if (savedRequest.uuid && createRequestDto.type) {
        try {
          this.logger.log(`Moviendo archivos para request ${savedRequest.uuid} de tipo ${createRequestDto.type}`);
          const moveResult = await this.uploadFileService.moveFilesToRequestFolder(
            createRequestDto.type,
            savedRequest.uuid,
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

  async update(id: number, updateRequestDto: UpdateRequestDto) {
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

      // Validación dinámica según tipo de servicio y sección (si se proporcionan datos)
      if (updateRequestDto.currentStepNumber !== undefined) {
        // Combinar datos existentes con los nuevos para validación completa
        const serviceData = await this.getServiceDataForValidation(updateRequestDto, request);
        
        // Determinar el status: si se está procesando un pago (Stripe o transferencia), será 'solicitud-recibida', sino mantener 'pendiente'
        // Durante el flujo del wizard, siempre es 'pendiente' hasta que se procesa el pago
        const hasStripePayment = !!(updateRequestDto.stripeToken && updateRequestDto.paymentAmount);
        const hasTransferPayment = !!(updateRequestDto.paymentMethod === 'transferencia' && updateRequestDto.paymentAmount);
        const willProcessPayment = hasStripePayment || hasTransferPayment;
        const requestStatus = willProcessPayment 
          ? (updateRequestDto.status || 'solicitud-recibida')
          : (updateRequestDto.status || request.status || 'pendiente'); // Mantener pendiente durante wizard
        
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
      
      this.logger.log(`[Update Request ${id}] Guardando request con datos:`, {
        status: request.status,
        paymentMethod: request.paymentMethod,
        paymentAmount: request.paymentAmount,
        paymentStatus: request.paymentStatus,
        stripeChargeId: request.stripeChargeId,
        paymentProofUrl: request.paymentProofUrl,
        currentStep: request.currentStep,
      });
      
      await queryRunner.manager.save(Request, request);
      
      this.logger.log(`[Update Request ${id}] Request guardada exitosamente`);

      // Actualizar la solicitud específica según el tipo
      if (request.type === 'apertura-llc') {
        const aperturaRequest = await this.aperturaRepo.findOne({
          where: { requestId: id },
        });

        if (!aperturaRequest) {
          throw new NotFoundException(
            `Solicitud de Apertura LLC con ID ${id} no encontrada`,
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
          
          // Sección 3 - solo procesar si currentStepNumber >= 3
          if (currentStep < 3) {
            delete aperturaData.serviceBillUrl;
            delete aperturaData.bankStatementUrl;
            delete aperturaData.periodicIncome10k;
            delete aperturaData.bankAccountLinkedEmail;
            delete aperturaData.bankAccountLinkedPhone;
            delete aperturaData.actividadFinancieraEsperada;
            delete aperturaData.projectOrCompanyUrl;
          }
          
          // Sección 2 (members) - se procesa por separado, no debe estar en aperturaData
          // (ya se eliminó en la desestructuración)
          
          // Solo asignar llcType si tiene un valor válido ('single' o 'multi')
          const dataToAssign = { ...aperturaData };
          if (dataToAssign.llcType !== 'single' && dataToAssign.llcType !== 'multi') {
            delete dataToAssign.llcType;
          }
          
          // Asegurarse de que los campos de secciones no completadas no estén en dataToAssign
          if (currentStep < 1) {
            delete dataToAssign.llcName;
            delete dataToAssign.llcNameOption2;
            delete dataToAssign.llcNameOption3;
            delete dataToAssign.incorporationState;
            delete dataToAssign.businessDescription;
            delete dataToAssign.linkedin;
          }
          
          if (currentStep < 3) {
            delete dataToAssign.serviceBillUrl;
            delete dataToAssign.bankStatementUrl;
            delete dataToAssign.periodicIncome10k;
            delete dataToAssign.bankAccountLinkedEmail;
            delete dataToAssign.bankAccountLinkedPhone;
            delete dataToAssign.actividadFinancieraEsperada;
            delete dataToAssign.projectOrCompanyUrl;
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
        const renovacionRequest = await this.renovacionRepo.findOne({
          where: { requestId: id },
        });

        if (!renovacionRequest) {
          throw new NotFoundException(
            `Solicitud de Renovación LLC con ID ${id} no encontrada`,
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
          
          Object.keys(mappedData).forEach(key => {
            if (key !== 'owners' && key !== 'members' && key !== 'currentStepNumber' && key !== 'requestId' && key !== 'totalRevenue2025') {
              let value = mappedData[key];
              
              // Convertir strings vacíos a null para campos numéricos
              if (numericFields.includes(key) && value === '') {
                value = null;
              }
              
              // Convertir strings vacíos a null para fechas
              if (key === 'llcCreationDate' && value === '') {
                value = null;
              }
              
              (renovacionRequest as any)[key] = value;
            }
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
        const cuentaRequest = await this.cuentaRepo.findOne({
          where: { requestId: id },
        });

        if (!cuentaRequest) {
          throw new NotFoundException(
            `Solicitud de Cuenta Bancaria con ID ${id} no encontrada`,
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
          
          // Eliminar campos de secciones que aún no se han completado
          // Sección 3 (validador) - solo procesar si currentStepNumber >= 3
          if (currentStep < 3) {
            // Eliminar todos los campos del validador si estamos antes de la sección 3
            delete cuentaData.validatorFirstName;
            delete cuentaData.validatorLastName;
            delete cuentaData.validatorDateOfBirth;
            delete cuentaData.validatorNationality;
            delete cuentaData.validatorCitizenship;
            delete cuentaData.validatorPassportNumber;
            delete cuentaData.validatorPassportUrl;
            delete cuentaData.validatorScannedPassportUrl;
            delete cuentaData.validatorWorkEmail;
            delete cuentaData.validatorUseEmailForRelayLogin;
            delete cuentaData.validatorPhone;
            delete cuentaData.validatorCanReceiveSMS;
            delete cuentaData.validatorIsUSResident;
            delete cuentaData.validatorTitle;
            delete cuentaData.validatorIncomeSource;
            delete cuentaData.validatorAnnualIncome;
          }
          
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
          if (currentStep < 5) {
            delete cuentaData.isMultiMember;
            delete cuentaData.llcType;
          }
          
          // Sección 6 (owners) - se procesa por separado, no debe estar en cuentaData
          // (ya se eliminó en la desestructuración)
          
          // Convertir fecha si viene, o eliminar si está vacía
          if (cuentaData.firstRegistrationDate !== undefined) {
            if (cuentaData.firstRegistrationDate && cuentaData.firstRegistrationDate.trim() !== '') {
              const parsedDate = this.parseDate(cuentaData.firstRegistrationDate);
              if (parsedDate) {
                cuentaData.firstRegistrationDate = parsedDate;
              } else {
                // Si no se puede parsear, eliminar el campo para no intentar guardar un valor inválido
                delete cuentaData.firstRegistrationDate;
              }
            } else {
              // Si está vacío o es cadena vacía, eliminar el campo (no actualizar)
              delete cuentaData.firstRegistrationDate;
            }
          }
          
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
          
          // Construir registeredAgentAddress desde campos individuales (sección 2)
          // Guardar registeredAgentState por separado además de la dirección completa
          if (cuentaData.registeredAgentState !== undefined) {
            cuentaData.registeredAgentState = cuentaData.registeredAgentState || '';
          }
          
          if (cuentaData.registeredAgentStreet !== undefined || cuentaData.registeredAgentCity !== undefined || cuentaData.registeredAgentState !== undefined) {
            cuentaData.registeredAgentAddress = [
              cuentaData.registeredAgentStreet || '',
              cuentaData.registeredAgentUnit || '',
              cuentaData.registeredAgentCity || '',
              cuentaData.registeredAgentState || '',
              cuentaData.registeredAgentZipCode || '',
              cuentaData.registeredAgentCountry || ''
            ].filter(Boolean).join(', ');
            
            // Eliminar campos individuales después de construir la dirección (excepto registeredAgentState que se guarda por separado)
            delete cuentaData.registeredAgentStreet;
            delete cuentaData.registeredAgentUnit;
            delete cuentaData.registeredAgentCity;
            // NO eliminar registeredAgentState - se guarda por separado
            delete cuentaData.registeredAgentZipCode;
            delete cuentaData.registeredAgentCountry;
          }
          
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
          if (cuentaData.incorporationState !== undefined) {
            cuentaData.incorporationState = cuentaData.incorporationState || '';
          }
          
          if (cuentaData.incorporationMonthYear !== undefined) {
            cuentaData.incorporationMonthYear = cuentaData.incorporationMonthYear || '';
          }
          
          // Mapear isMultiMember a llcType
          // 'yes' -> 'multi', 'no' -> 'single'
          // Solo mapear si isMultiMember tiene un valor válido Y estamos en la sección 5 o superior
          // El campo isMultiMember solo se completa en la sección 5, antes de eso no debe incluirse llcType
          // El constraint check_cuenta_llc_type solo permite 'single' o 'multi', no NULL ni cadena vacía
          // Reutilizar currentStep ya declarado arriba (línea 1755)
          const isSection5OrHigher = currentStep >= 5;
          
          if (isSection5OrHigher && cuentaData.isMultiMember !== undefined && cuentaData.isMultiMember !== '' && cuentaData.isMultiMember !== null) {
            // Solo mapear si estamos en la sección 5 o superior y hay un valor válido
            if (cuentaData.isMultiMember === 'yes') {
              cuentaData.llcType = 'multi';
            } else if (cuentaData.isMultiMember === 'no') {
              cuentaData.llcType = 'single';
            }
            delete cuentaData.isMultiMember;
          } else {
            // Si no estamos en la sección 5 o superior, o isMultiMember no tiene valor válido,
            // eliminar llcType si existe para que no se intente actualizar con un valor inválido
            delete cuentaData.llcType;
            delete cuentaData.isMultiMember;
          }
          
          // Si llcType viene como null o undefined, eliminarlo (no se ha completado la sección 5)
          // Nota: llcType no puede ser cadena vacía según el tipo, solo 'single' | 'multi' | undefined
          if (cuentaData.llcType === null || cuentaData.llcType === undefined) {
            delete cuentaData.llcType;
          }
          
          // Solo asignar llcType si tiene un valor válido ('single' o 'multi')
          // Esto evita que se intente actualizar con un valor inválido
          const dataToAssign = { ...cuentaData };
          if (dataToAssign.llcType !== 'single' && dataToAssign.llcType !== 'multi') {
            delete dataToAssign.llcType;
          }
          
          // Asegurarse de que los campos del validador no estén en dataToAssign si currentStep < 3
          // Esto previene que se asignen cadenas vacías a campos de tipo date
          if (currentStep < 3) {
            delete dataToAssign.validatorFirstName;
            delete dataToAssign.validatorLastName;
            delete dataToAssign.validatorDateOfBirth;
            delete dataToAssign.validatorNationality;
            delete dataToAssign.validatorCitizenship;
            delete dataToAssign.validatorPassportNumber;
            delete dataToAssign.validatorPassportUrl;
            delete dataToAssign.validatorScannedPassportUrl;
            delete dataToAssign.validatorWorkEmail;
            delete dataToAssign.validatorUseEmailForRelayLogin;
            delete dataToAssign.validatorPhone;
            delete dataToAssign.validatorCanReceiveSMS;
            delete dataToAssign.validatorIsUSResident;
            delete dataToAssign.validatorTitle;
            delete dataToAssign.validatorIncomeSource;
            delete dataToAssign.validatorAnnualIncome;
          }
          
          Object.assign(cuentaRequest, dataToAssign);
        }

        await queryRunner.manager.save(CuentaBancariaRequest, cuentaRequest);

        // Procesar validator: guardar directamente en CuentaBancariaRequest
        // Solo procesar si estamos en la sección 3 o superior
        if (updateRequestDto.cuentaBancariaData) {
          const cuentaDataUpdate = updateRequestDto.cuentaBancariaData as any;
          const validators = cuentaDataUpdate.validators || [];
          // Reutilizar currentStep ya declarado arriba (línea 1755)
          
          if (currentStep >= 3) {
            // Los campos del validador pueden venir en validators[] o directamente en cuentaData
            // Priorizar validators[] si existe, sino usar cuentaData directamente
            let validatorData: any = null;
            
            if (validators && validators.length > 0) {
              validatorData = validators[0]; // Solo hay un validador
            } else {
              // Si no hay validators[], verificar si los campos vienen directamente en cuentaData
              // Verificar también si isUSResident tiene un valor válido ('yes' o 'no')
              const hasIsUSResident = cuentaDataUpdate.isUSResident !== undefined && 
                                      cuentaDataUpdate.isUSResident !== '' && 
                                      cuentaDataUpdate.isUSResident !== null;
              const hasValidatorIsUSResident = cuentaDataUpdate.validatorIsUSResident !== undefined;
              const hasValidatorPassportUrl = cuentaDataUpdate.validatorPassportUrl !== undefined && 
                                             cuentaDataUpdate.validatorPassportUrl !== '';
              const hasValidatorScannedPassportUrl = cuentaDataUpdate.validatorScannedPassportUrl !== undefined && 
                                                    cuentaDataUpdate.validatorScannedPassportUrl !== '';
              
              if (cuentaDataUpdate.validatorFirstName || cuentaDataUpdate.validatorLastName || 
                  cuentaDataUpdate.validatorDateOfBirth || cuentaDataUpdate.validatorPassportNumber ||
                  hasValidatorPassportUrl || hasValidatorScannedPassportUrl ||
                  hasIsUSResident || hasValidatorIsUSResident) {
                validatorData = cuentaDataUpdate;
              }
            }
            
            // Log para debugging
            this.logger.log(`[Update Request ${id}] Procesando validador (currentStep: ${currentStep}):`, {
              hasValidators: !!(validators && validators.length > 0),
              hasValidatorData: !!validatorData,
              validatorPassportUrl: cuentaDataUpdate.validatorPassportUrl,
              validatorScannedPassportUrl: cuentaDataUpdate.validatorScannedPassportUrl,
              isUSResident: cuentaDataUpdate.isUSResident,
              validatorIsUSResident: cuentaDataUpdate.validatorIsUSResident
            });
            
            if (validatorData) {
              // Mapear campos del frontend a campos del validador en cuentaRequest
              // Solo asignar si el campo tiene un valor válido (no cadena vacía)
              if (validatorData.validatorFirstName !== undefined && validatorData.validatorFirstName !== '') {
                cuentaRequest.validatorFirstName = validatorData.validatorFirstName || validatorData.firstName || '';
              }
              if (validatorData.validatorLastName !== undefined && validatorData.validatorLastName !== '') {
                cuentaRequest.validatorLastName = validatorData.validatorLastName || validatorData.lastName || '';
              }
              if (validatorData.validatorNationality !== undefined && validatorData.validatorNationality !== '') {
                cuentaRequest.validatorNationality = validatorData.validatorNationality || validatorData.nationality || '';
              }
              if (validatorData.validatorCitizenship !== undefined && validatorData.validatorCitizenship !== '') {
                cuentaRequest.validatorCitizenship = validatorData.validatorCitizenship || validatorData.citizenship || '';
              }
              if (validatorData.validatorPassportNumber !== undefined && validatorData.validatorPassportNumber !== '') {
                cuentaRequest.validatorPassportNumber = validatorData.validatorPassportNumber || validatorData.passportNumber || '';
              }
              // Guardar URL del pasaporte - puede venir como validatorPassportUrl o validatorScannedPassportUrl
              // Priorizar validatorData, pero si está vacío, verificar en cuentaDataUpdate
              const passportUrl = (validatorData.validatorPassportUrl && validatorData.validatorPassportUrl !== '') 
                ? validatorData.validatorPassportUrl 
                : (validatorData.scannedPassportUrl && validatorData.scannedPassportUrl !== '')
                  ? validatorData.scannedPassportUrl
                  : (cuentaDataUpdate.validatorPassportUrl && cuentaDataUpdate.validatorPassportUrl !== '')
                    ? cuentaDataUpdate.validatorPassportUrl
                    : (cuentaDataUpdate.validatorScannedPassportUrl && cuentaDataUpdate.validatorScannedPassportUrl !== '')
                      ? cuentaDataUpdate.validatorScannedPassportUrl
                      : '';
              
              if (passportUrl !== '') {
                cuentaRequest.validatorScannedPassportUrl = passportUrl;
              }
              if (validatorData.validatorWorkEmail !== undefined && validatorData.validatorWorkEmail !== '') {
                cuentaRequest.validatorWorkEmail = validatorData.validatorWorkEmail || validatorData.workEmail || '';
              }
              if (validatorData.validatorPhone !== undefined && validatorData.validatorPhone !== '') {
                cuentaRequest.validatorPhone = validatorData.validatorPhone || validatorData.phone || '';
              }
              
              // Campos adicionales del validador
              if (validatorData.validatorTitle !== undefined && validatorData.validatorTitle !== '') {
                cuentaRequest.validatorTitle = validatorData.validatorTitle || '';
              }
              if (validatorData.validatorIncomeSource !== undefined && validatorData.validatorIncomeSource !== '') {
                cuentaRequest.validatorIncomeSource = validatorData.validatorIncomeSource || '';
              }
              if (validatorData.validatorAnnualIncome !== undefined && validatorData.validatorAnnualIncome !== '') {
                // Convertir a número si viene como string
                const annualIncome = typeof validatorData.validatorAnnualIncome === 'string' 
                  ? parseFloat(validatorData.validatorAnnualIncome) 
                  : validatorData.validatorAnnualIncome;
                if (!isNaN(annualIncome)) {
                  cuentaRequest.validatorAnnualIncome = annualIncome;
                }
              }
              
              // Campos booleanos
              if (validatorData.useEmailForRelayLogin !== undefined) {
                cuentaRequest.validatorUseEmailForRelayLogin = validatorData.useEmailForRelayLogin || false;
              }
              if (validatorData.canReceiveSMS !== undefined) {
                cuentaRequest.validatorCanReceiveSMS = validatorData.canReceiveSMS || false;
              }
              // Guardar isUSResident - puede venir como 'yes'/'no' o boolean
              // Priorizar validatorData, pero si no está definido, verificar en cuentaDataUpdate
              const isUSResidentValue = validatorData.isUSResident !== undefined && validatorData.isUSResident !== ''
                ? validatorData.isUSResident 
                : cuentaDataUpdate.isUSResident !== undefined && cuentaDataUpdate.isUSResident !== ''
                  ? cuentaDataUpdate.isUSResident
                  : undefined;
              
              if (isUSResidentValue !== undefined && isUSResidentValue !== '') {
                cuentaRequest.validatorIsUSResident = isUSResidentValue === 'yes' || isUSResidentValue === true;
              }
              
              // Parsear fecha de nacimiento - solo si tiene un valor válido (no cadena vacía)
              const dateOfBirth = validatorData.validatorDateOfBirth || validatorData.dateOfBirth;
              if (dateOfBirth && dateOfBirth.trim() !== '') {
                const parsedDate = this.parseDate(dateOfBirth);
                if (parsedDate) {
                  cuentaRequest.validatorDateOfBirth = parsedDate;
                } else {
                  // Si no se puede parsear, establecer a null en lugar de cadena vacía
                  cuentaRequest.validatorDateOfBirth = null;
                }
              } else if (dateOfBirth === '' || dateOfBirth === null || dateOfBirth === undefined) {
                // Si viene como cadena vacía, no actualizar (mantener el valor existente o null)
                // No asignar nada para evitar que se intente guardar una cadena vacía
              }
            } else {
              // Si no hay validatorData pero hay campos directamente en cuentaDataUpdate, guardarlos
              // Esto asegura que los campos se guarden incluso si no se detecta validatorData
              if (currentStep >= 3) {
                // Procesar validatorPassportUrl / validatorScannedPassportUrl
                const passportUrlDirect = (cuentaDataUpdate.validatorPassportUrl && cuentaDataUpdate.validatorPassportUrl !== '') 
                  ? cuentaDataUpdate.validatorPassportUrl
                  : (cuentaDataUpdate.validatorScannedPassportUrl && cuentaDataUpdate.validatorScannedPassportUrl !== '')
                    ? cuentaDataUpdate.validatorScannedPassportUrl
                    : '';
                
                if (passportUrlDirect !== '') {
                  cuentaRequest.validatorScannedPassportUrl = passportUrlDirect;
                }
                
                // Procesar isUSResident / validatorIsUSResident
                // Verificar ambos campos: isUSResident y validatorIsUSResident
                const isUSResidentFromIsUSResident = cuentaDataUpdate.isUSResident !== undefined && 
                                                      cuentaDataUpdate.isUSResident !== '' && 
                                                      cuentaDataUpdate.isUSResident !== null;
                const isUSResidentFromValidator = cuentaDataUpdate.validatorIsUSResident !== undefined;
                
                if (isUSResidentFromIsUSResident) {
                  cuentaRequest.validatorIsUSResident = cuentaDataUpdate.isUSResident === 'yes' || cuentaDataUpdate.isUSResident === true;
                } else if (isUSResidentFromValidator) {
                  cuentaRequest.validatorIsUSResident = cuentaDataUpdate.validatorIsUSResident === true || cuentaDataUpdate.validatorIsUSResident === 'yes';
                }
              }
            }
          } else {
            // Si estamos antes de la sección 3, asegurarse de que los campos del validador no se actualicen
            // (ya se eliminaron de cuentaData arriba)
          }
          
          // Guardar cuentaRequest después de actualizar los campos del validador
          await queryRunner.manager.save(CuentaBancariaRequest, cuentaRequest);
        }
        
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

      // Mover archivos de request/{servicio}/ a request/{servicio}/{uuid}/ si existen y actualizar URLs
      // Esto organiza los archivos subidos antes de crear el request o cuando se actualiza un request existente
      if (request.uuid && request.type) {
        try {
          this.logger.log(`Moviendo archivos para request ${request.uuid} de tipo ${request.type}`);
          const moveResult = await this.uploadFileService.moveFilesToRequestFolder(
            request.type,
            request.uuid,
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
        error instanceof BadRequestException
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
    if (filters?.clientId) {
      queryBuilder.andWhere('request.clientId = :clientId', { clientId: filters.clientId });
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

    // Eliminar la solicitud (las relaciones en cascada eliminarán los datos relacionados)
    await this.requestRepository.remove(request);

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
    let defaultStage = 'Apertura Confirmada';
    if (request.type === 'cuenta-bancaria') {
      defaultStage = 'Cuenta Bancaria Confirmada';
    } else if (request.type === 'renovacion-llc') {
      defaultStage = 'Renovación Confirmada';
    }
    
    const initialStage = approveDto.initialStage || defaultStage;

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
    request.status = 'en-proceso';
    request.stage = initialStage;
    if (approveDto.notes) {
      request.notes = approveDto.notes;
    }

    await this.requestRepository.save(request);

    this.logger.log(
      `Solicitud ${id} aprobada exitosamente. Etapa inicial: ${initialStage}`,
    );

    return {
      message: 'Solicitud aprobada correctamente',
      request: {
        id: request.id,
        status: request.status,
        stage: request.stage,
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
      'EIN Solicitado',
      'Operating Agreement',
      'BOI Enviado',
      'Cuenta Bancaria Confirmada',
      'Confirmación pago',
      'Apertura Activa',
      'Apertura Perdida',
      'Apertura Cuenta Bancaria',
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
          'validatorScannedPassportUrl', // Validador ahora está en CuentaBancariaRequest
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

