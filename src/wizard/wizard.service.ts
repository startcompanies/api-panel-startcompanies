import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Request } from '../panel/requests/entities/request.entity';
import { AperturaLlcRequest } from '../panel/requests/entities/apertura-llc-request.entity';
import { RenovacionLlcRequest } from '../panel/requests/entities/renovacion-llc-request.entity';
import { CuentaBancariaRequest } from '../panel/requests/entities/cuenta-bancaria-request.entity';
import { Member } from '../panel/requests/entities/member.entity';
// BankAccountOwner y BankAccountValidator ya no se usan - consolidados en Member y CuentaBancariaRequest
import { User } from '../shared/user/entities/user.entity';
import { Client } from '../panel/clients/entities/client.entity';
import { CreateWizardRequestDto } from './dtos/create-wizard-request.dto';
import { ConfirmEmailDto } from './dtos/confirm-email.dto';
import { UpdateRequestDto } from '../panel/requests/dtos/update-request.dto';
import { StripeService } from '../shared/payments/stripe.service';
import { EmailService } from '../shared/common/services/email.service';
import { JwtService } from '@nestjs/jwt';
import { encodePassword } from '../shared/common/utils/bcrypt';
import { validateRequestData } from '../panel/requests/validation/request-validation-rules';
import * as crypto from 'crypto';

@Injectable()
export class WizardService {
  private readonly logger = new Logger(WizardService.name);

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
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stripeService: StripeService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
  ) { }

  /**
   * Convierte una fecha string a Date de manera segura
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
  private getServiceData(createWizardRequestDto: CreateWizardRequestDto): any {
    if (createWizardRequestDto.type === 'apertura-llc' && createWizardRequestDto.aperturaLlcData) {
      return {
        ...createWizardRequestDto.aperturaLlcData,
        llcType: createWizardRequestDto.aperturaLlcData.llcType,
        members: createWizardRequestDto.aperturaLlcData.members || [],
      };
    }
    if (createWizardRequestDto.type === 'renovacion-llc' && createWizardRequestDto.renovacionLlcData) {
      const renovacionData = createWizardRequestDto.renovacionLlcData as any;
      return {
        ...renovacionData,
        llcType: renovacionData.llcType,
        owners: renovacionData.owners || renovacionData.members || [],
      };
    }
    if (createWizardRequestDto.type === 'cuenta-bancaria' && createWizardRequestDto.cuentaBancariaData) {
      const cuentaData = createWizardRequestDto.cuentaBancariaData as any;
      return {
        ...cuentaData,
        owners: cuentaData.owners || [],
      };
    }
    return {};
  }

  /**
   * Registra un nuevo usuario en el flujo wizard
   * Crea usuario y cliente, envía correo de confirmación
   */
  async registerWizardUser(clientData: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    password: string;
  }) {
    // Verificar si el usuario ya existe
    const existingUser = await this.userRepo.findOne({
      where: { email: clientData.email },
    });

    if (existingUser) {
      if (existingUser.emailVerified) {
        throw new BadRequestException(
          'El email ya está registrado y confirmado. Por favor, inicia sesión.',
        );
      } else {
        throw new BadRequestException(
          'El email ya está registrado pero no ha sido confirmado. Por favor, revisa tu correo para confirmar tu cuenta.',
        );
      }
    }

    // Crear nuevo usuario con contraseña
    const hashedPassword = encodePassword(clientData.password);
    const username = clientData.email.split('@')[0] + Math.floor(Math.random() * 1000);
    const emailVerificationToken = this.generateEmailVerificationCode();

    const user = this.userRepo.create({
      email: clientData.email,
      username,
      password: hashedPassword,
      first_name: clientData.firstName,
      last_name: clientData.lastName,
      phone: clientData.phone || '',
      type: 'client',
      status: true,
      emailVerified: false,
      emailVerificationToken,
    });

    const savedUser = await this.userRepo.save(user);
    this.logger.log(`Usuario creado en wizard: ${savedUser.id} - ${savedUser.email}`);

    // Crear cliente asociado (sin partnerId)
    const client = this.clientRepo.create({
      email: clientData.email,
      full_name: `${clientData.firstName} ${clientData.lastName}`.trim(),
      phone: clientData.phone || '',
      userId: savedUser.id,
      // NO asociar partnerId en wizard
      status: true,
    });

    const savedClient = await this.clientRepo.save(client);
    this.logger.log(`Cliente creado en wizard: ${savedClient.id}`);

    // Enviar correo de confirmación
    try {
      const userName = `${clientData.firstName} ${clientData.lastName}`.trim() || clientData.email;
      await this.emailService.sendCodeEmailValidation(
        clientData.email,
        userName,
        emailVerificationToken,
      );
      this.logger.log(`Correo de validación enviado a: ${clientData.email}`);
    } catch (emailError) {
      this.logger.error(`Error al enviar correo de validación: ${emailError}`);
      // No fallar si el email falla, pero loguear el error
    }

    return {
      message: 'Usuario registrado exitosamente. Por favor, confirma tu email para continuar.',
      email: savedUser.email,
      id: savedUser.id,
    };
  }

  /**
   * Crea o obtiene usuario y cliente para el flujo wizard (DEPRECADO - usar registerWizardUser)
   * En wizard NO se asocian partners
   */
  private async createOrGetWizardUser(clientData: any, queryRunner: any): Promise<{ user: User; client: Client }> {
    const { email, firstName, lastName, phone, password } = clientData;

    // Buscar si el usuario ya existe
    let user = await this.userRepo.findOne({
      where: { email },
    });

    if (user) {
      // Si el usuario existe pero NO está confirmado, lanzar error
      if (!user.emailVerified) {
        throw new BadRequestException(
          'El email ya está registrado pero no ha sido confirmado. Por favor, confirma tu email primero.',
        );
      }

      // Si el usuario existe y está confirmado, verificar contraseña
      // (En este caso, el usuario ya debería estar autenticado, pero validamos por seguridad)
      this.logger.log(`Usuario existente encontrado: ${user.id} - ${user.email}`);

      // Buscar o crear cliente asociado
      let client = await this.clientRepo.findOne({
        where: { email },
      });

      if (!client) {
        const newClient = this.clientRepo.create({
          email,
          full_name: `${firstName} ${lastName}`.trim(),
          phone: phone || '',
          userId: user.id,
          // NO asociar partnerId en wizard
          status: true,
        });
        const savedClient = await queryRunner.manager.save(Client, newClient);
        if (!savedClient) {
          throw new InternalServerErrorException('Error al crear cliente');
        }
        client = savedClient;
        this.logger.log(`Cliente creado para usuario existente: ${savedClient.id}`);
      }

      // TypeScript necesita esta validación para entender que client no es null
      if (!client) {
        throw new InternalServerErrorException('Error: cliente no encontrado ni creado');
      }

      return { user, client };
    }

    // Crear nuevo usuario con contraseña
    const hashedPassword = encodePassword(password);
    const username = email.split('@')[0] + Math.floor(Math.random() * 1000);

    user = this.userRepo.create({
      email,
      username,
      password: hashedPassword,
      first_name: firstName,
      last_name: lastName,
      phone: phone || '',
      type: 'client',
      status: true,
      emailVerified: false, // Inicialmente no verificado
      emailVerificationToken: this.generateEmailVerificationCode(), // Generar token
    });

    const savedUser = await queryRunner.manager.save(User, user);
    if (!savedUser) {
      throw new InternalServerErrorException('Error al crear usuario');
    }
    this.logger.log(`Usuario creado en wizard: ${savedUser.id} - ${savedUser.email}`);
    // Crear cliente asociado (sin partnerId)
    const client = this.clientRepo.create({
      email,
      full_name: `${firstName} ${lastName}`.trim(),
      phone: phone || '',
      userId: savedUser.id,
      // NO asociar partnerId en wizard
      status: true,
    });

    const savedClient = await queryRunner.manager.save(Client, client);
    if (!savedClient) {
      throw new InternalServerErrorException('Error al crear cliente');
    }
    this.logger.log(`Cliente creado en wizard: ${savedClient.id}`);

    // Enviar correo de confirmación
    try {
      const userName = `${firstName} ${lastName}`.trim() || email;
      if (savedUser.emailVerificationToken) {
        await this.emailService.sendEmailConfirmation(
          email,
          userName,
          savedUser.emailVerificationToken,
        );
        this.logger.log(`Correo de confirmación enviado a: ${email}`);
      }
    } catch (emailError) {
      this.logger.error(`Error al enviar correo de confirmación: ${emailError}`);
      // No fallar si el email falla, pero loguear el error
    }

    return { user: savedUser, client: savedClient };
  }

  /**
   * Genera un token de verificación de email
   */
  private generateEmailVerificationToken(email: string): string {
    const secret = process.env.EMAIL_VERIFICATION_SECRET || 'default-secret-change-in-production';
    const timestamp = Date.now();
    const token = crypto
      .createHmac('sha256', secret)
      .update(`${email}-${timestamp}`)
      .digest('hex');
    return `${token}-${timestamp}`;
  }

  /**
   * Genera un código de verificación de email
   */
  private generateEmailVerificationCode(): string {
    const code = Math.floor(100000 + Math.random() * 900000); // Código de 6 dígitos
    return code.toString();
  }

  /**
   * Valida el token de verificación de email
   */
  private validateEmailVerificationToken(token: string, email: string): boolean {
    const secret = process.env.EMAIL_VERIFICATION_SECRET || 'default-secret-change-in-production';
    const parts = token.split('-');
    if (parts.length < 2) return false;

    const timestamp = parseInt(parts[parts.length - 1], 10);
    const tokenHash = parts.slice(0, -1).join('-');

    // Verificar que el token no sea muy viejo (24 horas)
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas
    if (Date.now() - timestamp > maxAge) {
      return false;
    }

    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(`${email}-${timestamp}`)
      .digest('hex');

    return tokenHash === expectedHash;
  }

  /**
   * Confirma el email del usuario y genera tokens
   */
  async confirmEmail(confirmEmailDto: ConfirmEmailDto) {
    const { email, confirmationToken } = confirmEmailDto;

    // Buscar usuario
    const user = await this.userRepo.findOne({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar que el token coincida
    if (user.emailVerificationToken !== confirmationToken) {
      throw new BadRequestException('Token de confirmación no coincide');
    }

    // Si ya está verificado, retornar tokens directamente
    if (user.emailVerified) {
      this.logger.log(`Email ya confirmado previamente para: ${email}`);
      return this.generateTokens(user);
    }

    // Marcar email como verificado
    user.emailVerified = true;
    user.emailVerificationToken = null; // Limpiar token después de usar
    await this.userRepo.save(user);

    this.logger.log(`Email confirmado exitosamente para: ${email}`);

    // Generar y retornar tokens
    return this.generateTokens(user);
  }

  /**
   * Genera tokens de acceso y refresh
   */
  private generateTokens(user: User) {
    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      status: user.status,
      type: user.type,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '5d' });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        type: user.type,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
      },
    };
  }

  /**
   * Crea una solicitud desde el wizard
   * IMPORTANTE: El pago se procesa ANTES de crear el request
   */
  async createWizardRequest(createWizardRequestDto: CreateWizardRequestDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validar que NO venga partnerId (wizard no tiene partners)
      if ((createWizardRequestDto as any).partnerId) {
        throw new BadRequestException('El flujo wizard no permite asociar partners');
      }

      // Validar que el usuario esté autenticado y su email confirmado
      // El usuario viene del AuthGuard en el controlador
      const user = await this.userRepo.findOne({
        where: { email: createWizardRequestDto.clientData.email },
      });

      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      if (!user.emailVerified) {
        throw new BadRequestException(
          'Debes confirmar tu email antes de crear una solicitud. Por favor, confirma tu email primero.',
        );
      }

      // Validar currentStepNumber según el tipo
      const maxSteps = {
        'apertura-llc': 6,
        'renovacion-llc': 6,
        'cuenta-bancaria': 7,
      };
      if (
        createWizardRequestDto.currentStepNumber < 1 ||
        createWizardRequestDto.currentStepNumber > maxSteps[createWizardRequestDto.type]
      ) {
        throw new BadRequestException(
          `currentStepNumber debe estar entre 1 y ${maxSteps[createWizardRequestDto.type]} para tipo ${createWizardRequestDto.type}`,
        );
      }

      // Buscar o crear cliente asociado
      let client = await this.clientRepo.findOne({
        where: { email: user.email },
      });

      if (!client) {
        const { firstName, lastName, phone } = createWizardRequestDto.clientData;
        const newClient = this.clientRepo.create({
          email: user.email,
          full_name: `${firstName} ${lastName}`.trim(),
          phone: phone || '',
          userId: user.id,
          // NO asociar partnerId en wizard
          status: true,
        });
        client = await queryRunner.manager.save(Client, newClient);
        if (!client) {
          throw new InternalServerErrorException('Error al crear cliente');
        }
        this.logger.log(`Cliente creado para usuario wizard: ${client.id}`);
      }

      // PASO 2: Procesar pago PRIMERO (antes de crear request)
      let paymentResult: any = null;

      if (createWizardRequestDto.paymentMethod === 'stripe' && createWizardRequestDto.stripeToken) {
        try {
          this.logger.log(
            `[Wizard] Procesando pago con Stripe: ${createWizardRequestDto.paymentAmount} USD`,
          );

          const charge = await this.stripeService.createCharge(
            createWizardRequestDto.stripeToken,
            createWizardRequestDto.paymentAmount,
            'usd',
            `Pago de solicitud wizard - ${createWizardRequestDto.type}`,
          );

          paymentResult = {
            chargeId: charge.id,
            amount: charge.amount / 100,
            currency: charge.currency,
            status: charge.status,
            paid: charge.paid,
            receiptUrl: charge.receipt_url,
          };

          this.logger.log(`[Wizard] Pago procesado exitosamente: ${charge.id}`);
        } catch (error: any) {
          this.logger.error(`[Wizard] Error al procesar pago: ${error.message}`);
          await queryRunner.rollbackTransaction();
          throw new BadRequestException(`Error al procesar el pago: ${error.message}`);
        }
      } else if (createWizardRequestDto.paymentMethod === 'transferencia') {
        // Para transferencia, solo validamos que venga el comprobante
        if (!createWizardRequestDto.paymentProofUrl) {
          throw new BadRequestException('Se requiere comprobante de transferencia');
        }
        paymentResult = {
          status: 'pending',
          amount: createWizardRequestDto.paymentAmount,
        };
      }

      // Si el pago falló o no se procesó, no crear request
      if (!paymentResult) {
        throw new BadRequestException('No se pudo procesar el pago');
      }

      // PASO 3: Validar datos del servicio
      const serviceData = this.getServiceData(createWizardRequestDto);
      const requestStatus = 'pendiente'; // Siempre pendiente al crear desde wizard

      /*try {
        validateRequestData(
          serviceData,
          createWizardRequestDto.type,
          createWizardRequestDto.currentStepNumber,
          requestStatus,
        );
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(`Error de validación: ${error.message}`);
      }*/

      // PASO 4: Crear la solicitud base con pago ya asociado
      const request = this.requestRepository.create({
        type: createWizardRequestDto.type,
        status: 'pendiente', // Siempre pendiente al crear desde wizard
        currentStep: createWizardRequestDto.currentStep || 1,
        clientId: client.id,
        partnerId: undefined, // Wizard no tiene partners
        notes: createWizardRequestDto.notes,
        // Información de pago (ya procesado)
        paymentMethod: createWizardRequestDto.paymentMethod,
        paymentAmount: createWizardRequestDto.paymentAmount,
        stripeChargeId: paymentResult?.chargeId,
        paymentStatus: paymentResult?.status || (createWizardRequestDto.paymentMethod === 'transferencia' ? 'pending' : 'succeeded'),
        paymentProofUrl: createWizardRequestDto.paymentProofUrl,
      });
      const savedRequest = await queryRunner.manager.save(Request, request);

      // PASO 5: Crear la solicitud específica según el tipo
      if (createWizardRequestDto.type === 'apertura-llc' && createWizardRequestDto.aperturaLlcData) {
        if (!createWizardRequestDto.aperturaLlcData) {
          throw new BadRequestException(
            'aperturaLlcData es requerido para tipo apertura-llc',
          );
        }

        const { members, ...aperturaDataFields } = createWizardRequestDto.aperturaLlcData;

        const aperturaData = this.aperturaRepo.create({
          requestId: savedRequest.id,
          currentStepNumber: createWizardRequestDto.currentStepNumber,
          ...aperturaDataFields,
        });
        await queryRunner.manager.save(AperturaLlcRequest, aperturaData);

        // Crear miembros si están presentes
        if (createWizardRequestDto.currentStepNumber >= 2 && members && members.length > 0) {
          const validMembers = members.filter((m: any) =>
            m.firstName || m.lastName || m.email || m.passportNumber
          );

          if (validMembers.length > 0) {
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
      } else if (createWizardRequestDto.type === 'renovacion-llc' && createWizardRequestDto.renovacionLlcData) {
        if (!createWizardRequestDto.renovacionLlcData) {
          throw new BadRequestException(
            'renovacionLlcData es requerido para tipo renovacion-llc',
          );
        }

        const { members, ...renovacionDataFields } = createWizardRequestDto.renovacionLlcData;

        const renovacionData = this.renovacionRepo.create({
          requestId: savedRequest.id,
          currentStepNumber: createWizardRequestDto.currentStepNumber,
          ...renovacionDataFields,
        });
        await queryRunner.manager.save(RenovacionLlcRequest, renovacionData);

        // Crear miembros si están presentes
        if (createWizardRequestDto.currentStepNumber >= 2 && members && members.length > 0) {
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
      } else if (createWizardRequestDto.type === 'cuenta-bancaria' && createWizardRequestDto.cuentaBancariaData) {
        if (!createWizardRequestDto.cuentaBancariaData) {
          throw new BadRequestException(
            'cuentaBancariaData es requerido para tipo cuenta-bancaria',
          );
        }

        const cuentaData = this.cuentaRepo.create({
          requestId: savedRequest.id,
          currentStepNumber: createWizardRequestDto.currentStepNumber,
          ...createWizardRequestDto.cuentaBancariaData,
          firstRegistrationDate: createWizardRequestDto.cuentaBancariaData.firstRegistrationDate
            ? new Date(createWizardRequestDto.cuentaBancariaData.firstRegistrationDate)
            : undefined,
        });
        await queryRunner.manager.save(CuentaBancariaRequest, cuentaData);
      }

      await queryRunner.commitTransaction();

      // Retornar la solicitud completa
      const result = await this.requestRepository.findOne({
        where: { id: savedRequest.id },
        relations: [
          'client',
          'aperturaLlcRequest',
          'renovacionLlcRequest',
          'cuentaBancariaRequest',
        ],
      });

      // Agregar información del pago
      return {
        ...result,
        payment: {
          chargeId: paymentResult?.chargeId,
          amount: paymentResult?.amount || createWizardRequestDto.paymentAmount,
          currency: paymentResult?.currency || 'usd',
          status: paymentResult?.status || 'succeeded',
          paid: paymentResult?.paid || true,
          receiptUrl: paymentResult?.receiptUrl,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('Error al crear solicitud desde wizard:', error);
      throw new InternalServerErrorException(
        'Error al crear la solicitud. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
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
      const renovacionData = updateRequestDto.renovacionLlcData as any;
      return {
        ...existingData,
        ...renovacionData,
        llcType: renovacionData.llcType || existingData.llcType,
        owners: renovacionData.owners || renovacionData.members || existingData.owners || [],
      };
    }
    if (existingRequest.type === 'cuenta-bancaria' && updateRequestDto.cuentaBancariaData) {
      const cuentaData = updateRequestDto.cuentaBancariaData as any;
      return {
        ...existingData,
        ...cuentaData,
        owners: cuentaData.owners || existingData.owners || [],
      };
    }

    return existingData;
  }

  /**
   * Actualiza una solicitud del wizard
   * En wizard NO se procesan pagos al actualizar (ya se procesaron al crear)
   */
  async updateWizardRequest(id: number, updateRequestDto: UpdateRequestDto) {
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

      // Validar que NO tenga partnerId (wizard no tiene partners)
      if (request.partnerId) {
        throw new BadRequestException('Esta solicitud no pertenece al flujo wizard');
      }

      // Validación dinámica según tipo de servicio y sección (si se proporcionan datos)
      if (updateRequestDto.currentStepNumber !== undefined) {
        const serviceData = await this.getServiceDataForValidation(updateRequestDto, request);
        const requestStatus = updateRequestDto.status || request.status || 'pendiente';

        try {
          validateRequestData(
            serviceData,
            request.type,
            updateRequestDto.currentStepNumber,
            requestStatus,
          );
        } catch (error) {
          if (error instanceof BadRequestException) {
            throw error;
          }
          throw new BadRequestException(`Error de validación: ${error.message}`);
        }
      }

      // Actualizar campos básicos de la solicitud
      // En wizard NO se procesan pagos al actualizar (ya se procesaron al crear)
      if (updateRequestDto.status !== undefined) {
        request.status = updateRequestDto.status;
      }

      if (updateRequestDto.currentStep !== undefined) {
        request.currentStep = updateRequestDto.currentStep;
      }

      if (updateRequestDto.notes !== undefined) {
        request.notes = updateRequestDto.notes;
      }

      await queryRunner.manager.save(Request, request);

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
          renovacionRequest.currentStepNumber = updateRequestDto.currentStepNumber;
        }

        if (updateRequestDto.renovacionLlcData) {
          Object.assign(renovacionRequest, updateRequestDto.renovacionLlcData);
        }

        await queryRunner.manager.save(RenovacionLlcRequest, renovacionRequest);
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

      // Retornar la solicitud actualizada
      return await this.requestRepository.findOne({
        where: { id },
        relations: [
          'client',
          'aperturaLlcRequest',
          'renovacionLlcRequest',
          'cuentaBancariaRequest',
        ],
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('Error al actualizar solicitud wizard:', error);
      throw new InternalServerErrorException(
        'Error al actualizar la solicitud. Por favor, intente nuevamente.',
      );
    } finally {
      await queryRunner.release();
    }
  }
}
