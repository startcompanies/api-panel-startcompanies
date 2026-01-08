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
import { BankAccountOwner } from './entities/bank-account-owner.entity';
import { BankAccountValidator } from './entities/bank-account-validator.entity';
import { RequestRequiredDocument } from './entities/request-required-document.entity';
import { User } from '../../shared/user/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { CreateRequestDto } from './dtos/create-request.dto';
import { UpdateRequestDto } from './dtos/update-request.dto';
import { ApproveRequestDto } from './dtos/approve-request.dto';
import { RejectRequestDto } from './dtos/reject-request.dto';
import { CreateMemberDto } from './dtos/create-member.dto';
import { UpdateMemberDto } from './dtos/update-member.dto';
import { CreateOwnerDto } from './dtos/create-owner.dto';
import { UpdateOwnerDto } from './dtos/update-owner.dto';
import { CreateBankAccountValidatorDto } from './dtos/create-bank-account-validator.dto';
import { UpdateBankAccountValidatorDto } from './dtos/update-bank-account-validator.dto';
import { StripeService } from '../../shared/payments/stripe.service';
import { UserService } from '../../shared/user/user.service';
import { encodePassword } from '../../shared/common/utils/bcrypt';
import { validateRequestData } from './validation/request-validation-rules';
// ZohoCrmService ya no se usa en findOne - solo se consulta la BD local
// import { ZohoCrmService } from '../../zoho-config/zoho-crm.service';
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
      // El frontend envía 'members' en renovacionLlcData, pero los tratamos como 'owners' para validación
      const renovacionData = createRequestDto.renovacionLlcData as any;
      return {
        ...renovacionData,
        llcType: renovacionData.llcType,
        owners: renovacionData.owners || renovacionData.members || [],
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
      // El frontend envía 'members' en renovacionLlcData, pero los tratamos como 'owners' para validación
      const renovacionData = updateRequestDto.renovacionLlcData as any;
      return {
        ...existingData,
        ...renovacionData,
        llcType: renovacionData.llcType || existingData.llcType,
        owners: renovacionData.owners || renovacionData.members || existingData.owners || [],
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
    @InjectRepository(BankAccountOwner)
    private readonly ownerRepo: Repository<BankAccountOwner>,
    @InjectRepository(BankAccountValidator)
    private readonly validatorRepo: Repository<BankAccountValidator>,
    @InjectRepository(RequestRequiredDocument)
    private readonly requiredDocRepo: Repository<RequestRequiredDocument>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stripeService: StripeService,
    private readonly userService: UserService,
    // ZohoCrmService ya no se usa - solo consultamos BD local
    // private readonly zohoCrmService: ZohoCrmService,
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

    // Cargar Members para cada solicitud de Apertura LLC
    for (const request of requests) {
      if (request.aperturaLlcRequest) {
        const members = await this.memberRepo.find({
          where: { requestId: request.id },
          order: { id: 'ASC' },
        });
        (request as any).members = members;
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

    // Cargar Members relacionados si es una solicitud de Apertura LLC
    if (request.aperturaLlcRequest) {
      const members = await this.memberRepo.find({
        where: { requestId: request.id },
        order: { id: 'ASC' },
      });
      // Agregar members al objeto de respuesta
      (request as any).members = members;
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

    // Cargar Members relacionados si es una solicitud de Apertura LLC
    if (request.aperturaLlcRequest) {
      const members = await this.memberRepo.find({
        where: { requestId: id },
        order: { id: 'ASC' },
      });
      // Agregar members al objeto de respuesta
      (request as any).members = members;
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

        const aperturaData = this.aperturaRepo.create({
          requestId: savedRequest.id,
          currentStepNumber: createRequestDto.currentStepNumber,
          ...aperturaDataFields,
        });
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

        const cuentaData = this.cuentaRepo.create({
          requestId: savedRequest.id,
          currentStepNumber: createRequestDto.currentStepNumber,
          ...createRequestDto.cuentaBancariaData,
          firstRegistrationDate: createRequestDto.cuentaBancariaData
            .firstRegistrationDate
            ? new Date(createRequestDto.cuentaBancariaData.firstRegistrationDate)
            : undefined,
        });
        await queryRunner.manager.save(CuentaBancariaRequest, cuentaData);
      }

      await queryRunner.commitTransaction();

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

        if (updateRequestDto.aperturaLlcData) {
          Object.assign(aperturaRequest, updateRequestDto.aperturaLlcData);
        }

        await queryRunner.manager.save(AperturaLlcRequest, aperturaRequest);
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
          Object.assign(renovacionRequest, updateRequestDto.renovacionLlcData);
        }

        await queryRunner.manager.save(
          RenovacionLlcRequest,
          renovacionRequest,
        );
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

        if (updateRequestDto.cuentaBancariaData) {
          const cuentaData = { ...updateRequestDto.cuentaBancariaData };
          // Convertir fecha si viene
          if (cuentaData.firstRegistrationDate) {
            cuentaData.firstRegistrationDate = new Date(
              cuentaData.firstRegistrationDate as any,
            ) as any;
          }
          Object.assign(cuentaRequest, cuentaData);
        }

        await queryRunner.manager.save(CuentaBancariaRequest, cuentaRequest);
      }

      await queryRunner.commitTransaction();

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

      // Verificar que la solicitud es de tipo LLC
      if (
        request.type !== 'apertura-llc' &&
        request.type !== 'renovacion-llc'
      ) {
        throw new BadRequestException(
          'Los miembros solo pueden agregarse a solicitudes de Apertura LLC o Renovación LLC',
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

  // ========== MÉTODOS DE PROPIETARIOS (CUENTA BANCARIA) ==========

  async findOwnersByRequest(requestId: number) {
    // Verificar que la solicitud existe y es de tipo cuenta-bancaria
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }
    if (request.type !== 'cuenta-bancaria') {
      throw new BadRequestException(
        'Los propietarios solo pueden agregarse a solicitudes de Cuenta Bancaria',
      );
    }

    return this.ownerRepo.find({
      where: { requestId },
      order: { createdAt: 'ASC' },
    });
  }

  async createOwner(requestId: number, createOwnerDto: CreateOwnerDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que la solicitud existe y es de tipo cuenta-bancaria
      const request = await this.requestRepository.findOne({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException(
          `Solicitud con ID ${requestId} no encontrada`,
        );
      }
      if (request.type !== 'cuenta-bancaria') {
        throw new BadRequestException(
          'Los propietarios solo pueden agregarse a solicitudes de Cuenta Bancaria',
        );
      }

      // Crear el propietario
      const { dateOfBirth, ...ownerDataWithoutDate } = createOwnerDto;
      const parsedDate = this.parseDate(dateOfBirth);
      const owner = this.ownerRepo.create({
        requestId,
        ...ownerDataWithoutDate,
        ...(parsedDate ? { dateOfBirth: parsedDate } : {}),
      });

      const savedOwner = await queryRunner.manager.save(
        BankAccountOwner,
        owner,
      );

      await queryRunner.commitTransaction();
      return savedOwner;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al crear propietario:', error);
      throw new InternalServerErrorException(
        'Error al crear el propietario. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async updateOwner(
    requestId: number,
    ownerId: number,
    updateOwnerDto: UpdateOwnerDto,
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

      // Buscar el propietario
      const owner = await this.ownerRepo.findOne({
        where: { id: ownerId, requestId },
      });
      if (!owner) {
        throw new NotFoundException(
          `Propietario con ID ${ownerId} no encontrado en la solicitud ${requestId}`,
        );
      }

      // Actualizar campos
      if (updateOwnerDto.dateOfBirth) {
        const parsedDate = this.parseDate(updateOwnerDto.dateOfBirth as string);
        if (parsedDate) {
          updateOwnerDto.dateOfBirth = parsedDate as any;
        } else {
          delete updateOwnerDto.dateOfBirth;
        }
      }
      Object.assign(owner, updateOwnerDto);

      const updatedOwner = await queryRunner.manager.save(
        BankAccountOwner,
        owner,
      );

      await queryRunner.commitTransaction();
      return updatedOwner;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al actualizar propietario:', error);
      throw new InternalServerErrorException(
        'Error al actualizar el propietario. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async deleteOwner(requestId: number, ownerId: number) {
    // Verificar que la solicitud existe
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }

    // Buscar el propietario
    const owner = await this.ownerRepo.findOne({
      where: { id: ownerId, requestId },
    });
    if (!owner) {
      throw new NotFoundException(
        `Propietario con ID ${ownerId} no encontrado en la solicitud ${requestId}`,
      );
    }

    await this.ownerRepo.remove(owner);
    return { message: 'Propietario eliminado correctamente' };
  }

  // ========== MÉTODOS DE VALIDADOR DE CUENTA BANCARIA ==========

  async findBankAccountValidator(requestId: number) {
    // Verificar que la solicitud existe y es de tipo cuenta-bancaria
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }
    if (request.type !== 'cuenta-bancaria') {
      throw new BadRequestException(
        'El validador solo puede agregarse a solicitudes de Cuenta Bancaria',
      );
    }

    return this.validatorRepo.findOne({
      where: { requestId },
    });
  }

  async createOrUpdateBankAccountValidator(
    requestId: number,
    createValidatorDto: CreateBankAccountValidatorDto,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que la solicitud existe y es de tipo cuenta-bancaria
      const request = await this.requestRepository.findOne({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException(
          `Solicitud con ID ${requestId} no encontrada`,
        );
      }
      if (request.type !== 'cuenta-bancaria') {
        throw new BadRequestException(
          'El validador solo puede agregarse a solicitudes de Cuenta Bancaria',
        );
      }

      // Buscar si ya existe un validador
      let validator = await this.validatorRepo.findOne({
        where: { requestId },
      });

      const { dateOfBirth, ...validatorDataWithoutDate } = createValidatorDto;
      const parsedDate = this.parseDate(dateOfBirth);
      if (validator) {
        // Actualizar existente
        Object.assign(validator, {
          ...validatorDataWithoutDate,
          ...(parsedDate ? { dateOfBirth: parsedDate } : {}),
        });
        validator = await queryRunner.manager.save(
          BankAccountValidator,
          validator,
        );
      } else {
        // Crear nuevo
        validator = this.validatorRepo.create({
          requestId,
          ...validatorDataWithoutDate,
          ...(parsedDate ? { dateOfBirth: parsedDate } : {}),
        });
        validator = await queryRunner.manager.save(
          BankAccountValidator,
          validator,
        );
      }

      await queryRunner.commitTransaction();
      return validator;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al crear/actualizar validador:', error);
      throw new InternalServerErrorException(
        'Error al crear/actualizar el validador. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async updateBankAccountValidator(
    requestId: number,
    updateValidatorDto: UpdateBankAccountValidatorDto,
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

      // Buscar el validador
      const validator = await this.validatorRepo.findOne({
        where: { requestId },
      });
      if (!validator) {
        throw new NotFoundException(
          `Validador no encontrado para la solicitud ${requestId}`,
        );
      }

      // Actualizar campos
      if (updateValidatorDto.dateOfBirth) {
        const parsedDate = this.parseDate(updateValidatorDto.dateOfBirth as string);
        if (parsedDate) {
          updateValidatorDto.dateOfBirth = parsedDate as any;
        } else {
          delete updateValidatorDto.dateOfBirth;
        }
      }
      Object.assign(validator, updateValidatorDto);

      const updatedValidator = await queryRunner.manager.save(
        BankAccountValidator,
        validator,
      );

      await queryRunner.commitTransaction();
      return updatedValidator;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Error al actualizar validador:', error);
      throw new InternalServerErrorException(
        'Error al actualizar el validador. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async deleteBankAccountValidator(requestId: number) {
    // Verificar que la solicitud existe
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(
        `Solicitud con ID ${requestId} no encontrada`,
      );
    }

    // Buscar el validador
    const validator = await this.validatorRepo.findOne({
      where: { requestId },
    });
    if (!validator) {
      throw new NotFoundException(
        `Validador no encontrado para la solicitud ${requestId}`,
      );
    }

    await this.validatorRepo.remove(validator);
    return { message: 'Validador eliminado correctamente' };
  }

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

  async getRequiredDocuments(
    type: 'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria',
    llcType?: 'single' | 'multi',
  ) {
    const where: any = { requestType: type };

    // Si es tipo LLC y se especifica llcType, filtrar por ese tipo
    if (
      (type === 'apertura-llc' || type === 'renovacion-llc') &&
      llcType
    ) {
      where.llcType = llcType;
    } else if (type === 'cuenta-bancaria') {
      // Para cuenta bancaria, llcType debe ser null
      where.llcType = null;
    }

      return this.requiredDocRepo.find({
        where,
        order: { order: 'ASC' },
      });
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

    // Actualizar estado y etapa
    request.status = 'en-proceso';
    request.stage = initialStage;
    if (approveDto.notes) {
      request.notes = approveDto.notes;
    }

    await this.requestRepository.save(request);

    this.logger.log(
      `Solicitud ${id} aprobada. Etapa inicial: ${initialStage}`,
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
}

