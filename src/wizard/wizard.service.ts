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
import { RequestSubmittedNotificationsService } from '../panel/notifications/request-submitted-notifications.service';
import { applyOptionalPublicWebUrlsToObject } from '../shared/common/utils/public-web-url.util';
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
    private readonly requestSubmittedNotifications: RequestSubmittedNotificationsService,
  ) { }

  /**
   * Convierte una fecha string a Date de manera segura
   */
  private parseDate(dateString: string | null | undefined | Date): Date | null {
    // Si ya es un objeto Date, retornarlo directamente
    if (dateString instanceof Date) {
      return isNaN(dateString.getTime()) ? null : dateString;
    }
    
    // Si no es string, null o undefined, retornar null
    if (typeof dateString !== 'string') {
      return null;
    }
    
    // Si es string vacío o inválido, retornar null
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
   * Verifica si un email está disponible para registro
   * Retorna información sobre el estado del email
   */
  async checkEmailAvailability(email: string) {
    const existingUser = await this.userRepo.findOne({
      where: { email },
    });

    if (!existingUser) {
      return {
        available: true,
        message: 'Email disponible',
      };
    }

    if (existingUser.emailVerified) {
      return {
        available: false,
        message: 'El email ya está registrado y confirmado. Por favor, inicia sesión.',
        emailVerified: true,
      };
    } else {
      return {
        available: false,
        message: 'El email ya está registrado pero no ha sido confirmado. Por favor, revisa tu correo para confirmar tu cuenta.',
        emailVerified: false,
      };
    }
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
    source?: 'wizard' | 'crm-lead' | 'panel';
  }) {
    const source = clientData.source || 'wizard';
    const requiresEmailVerification = source === 'crm-lead';
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
        // Si el email existe pero no está verificado, reenviar el código de verificación
        // Actualizar contraseña si es diferente (por si el usuario olvidó su contraseña)
        const hashedPassword = encodePassword(clientData.password);
        existingUser.password = hashedPassword;
        
        // Actualizar datos del usuario si han cambiado
        if (clientData.firstName) existingUser.first_name = clientData.firstName;
        if (clientData.lastName) existingUser.last_name = clientData.lastName;
        if (clientData.phone) existingUser.phone = clientData.phone;
        
        // Generar nuevo código de verificación
        const emailVerificationToken = this.generateEmailVerificationCode();
        existingUser.emailVerificationToken = emailVerificationToken;
        
        // Guardar cambios
        await this.userRepo.save(existingUser);
        this.logger.log(`Código de verificación reenviado para usuario existente: ${existingUser.id} - ${existingUser.email}`);
        
        // Solo reenviar código cuando el flujo sí requiere verificación explícita
        if (requiresEmailVerification) {
          try {
            const userName = `${clientData.firstName} ${clientData.lastName}`.trim() || clientData.email;
            await this.emailService.sendCodeEmailValidation(
              clientData.email,
              userName,
              emailVerificationToken,
            );
            this.logger.log(`Correo de validación reenviado a: ${clientData.email}`);
          } catch (emailError) {
            this.logger.error(`Error al reenviar correo de validación: ${emailError}`);
            // No fallar si el email falla, pero loguear el error
          }
        }
        
        // Retornar respuesta exitosa como si fuera un nuevo registro
        return {
          message: requiresEmailVerification
            ? 'Código de verificación reenviado. Por favor, revisa tu correo para confirmar tu cuenta.'
            : 'Registro de sesión actualizado exitosamente.',
          email: existingUser.email,
          id: existingUser.id,
          requiresEmailVerification,
          ...this.generateTokens(existingUser),
        };
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

    // Solo enviar correo de validación cuando el flujo lo requiere
    if (requiresEmailVerification) {
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
    }

    return {
      message: requiresEmailVerification
        ? 'Usuario registrado exitosamente. Por favor, confirma tu email para continuar.'
        : 'Usuario registrado exitosamente.',
      email: savedUser.email,
      id: savedUser.id,
      requiresEmailVerification,
      ...this.generateTokens(savedUser),
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
  async createWizardRequest(createWizardRequestDto: CreateWizardRequestDto, authUser?: any) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let transactionCommitted = false;
    let paymentResult: any = null; // Declarar fuera del try para que esté disponible en el catch

    try {
      // Validar que NO venga partnerId (wizard no tiene partners)
      if ((createWizardRequestDto as any).partnerId) {
        throw new BadRequestException('El flujo wizard no permite asociar partners');
      }

      // Validar que el usuario esté autenticado y su email confirmado
      // El usuario viene del AuthGuard en el controlador
      const source = createWizardRequestDto.source || 'wizard';
      const user = authUser?.id
        ? await this.userRepo.findOne({ where: { id: authUser.id } })
        : await this.userRepo.findOne({
            where: { email: createWizardRequestDto.clientData.email },
          });

      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      const requiresVerifiedEmailForRequest = source === 'crm-lead';

      if (requiresVerifiedEmailForRequest && !user.emailVerified) {
        throw new BadRequestException(
          'Debes confirmar tu email antes de crear una solicitud. Por favor, confirma tu email primero.',
        );
      }

      // currentStepNumber: el flujo sin pago (p. ej. crm-lead) a veces no lo envía en el POST.
      // Sin valor, la columna NOT NULL en BD queda NULL. Coerción + fallback a último paso del tipo.
      const maxSteps = {
        'apertura-llc': 6,
        'renovacion-llc': 6,
        'cuenta-bancaria': 7,
      } as const;
      const dto = createWizardRequestDto;
      const coerceStepNumber = (v: unknown): number | undefined => {
        if (typeof v === 'number' && !Number.isNaN(v)) return v;
        if (typeof v === 'string' && v.trim() !== '') {
          const n = Number(v);
          if (!Number.isNaN(n)) return n;
        }
        return undefined;
      };
      const nestedSection =
        dto.type === 'apertura-llc'
          ? (dto.aperturaLlcData as any)?.currentSection
          : dto.type === 'renovacion-llc'
            ? (dto.renovacionLlcData as any)?.currentSection
            : dto.type === 'cuenta-bancaria'
              ? (dto.cuentaBancariaData as any)?.currentSection
              : undefined;
      const resolvedCurrentStepNumber =
        coerceStepNumber(dto.currentStepNumber) ??
        coerceStepNumber(nestedSection) ??
        maxSteps[dto.type];

      if (
        resolvedCurrentStepNumber < 1 ||
        resolvedCurrentStepNumber > maxSteps[dto.type]
      ) {
        throw new BadRequestException(
          `currentStepNumber debe estar entre 1 y ${maxSteps[dto.type]} para tipo ${dto.type}`,
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

      // Datos mínimos de renovación antes de cobrar o crear solicitud
      if (createWizardRequestDto.type === 'renovacion-llc') {
        const rd = createWizardRequestDto.renovacionLlcData;
        if (!rd?.state?.trim() || !rd?.llcType?.trim()) {
          throw new BadRequestException(
            'Para renovación LLC se requiere estado (state) y tipo de LLC (llcType).',
          );
        }
      }

      // PASO 2: Procesar pago PRIMERO (antes de crear request)
      // paymentResult ya está declarado fuera del try

      // Verificar si hay pago requerido
      const isNoInitialPaymentSource =
        createWizardRequestDto.type === 'apertura-llc' &&
        (source === 'crm-lead' || source === 'panel');
      const hasPayment =
        !isNoInitialPaymentSource &&
        createWizardRequestDto.paymentAmount > 0 &&
        createWizardRequestDto.stripeToken !== 'no-payment';

      if (hasPayment) {
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
            // No hacer rollback aquí: el catch externo ya revierte si !transactionCommitted.
            // Un rollback doble provoca TransactionNotStartedError y enmascara el 400 de Stripe.
            throw new BadRequestException(`Error al procesar el pago: ${error.message}`);
          }
        } else if (createWizardRequestDto.paymentMethod === 'transferencia') {
          // Para transferencia, solo validamos que venga el comprobante si hay monto a pagar
          if (!createWizardRequestDto.paymentProofUrl) {
            throw new BadRequestException('Se requiere comprobante de transferencia');
          }
          paymentResult = {
            status: 'pending',
            amount: createWizardRequestDto.paymentAmount,
          };
        }
      } else {
        // No hay pago requerido (flujo sin pago)
        this.logger.log(`[Wizard] Flujo sin pago para tipo: ${createWizardRequestDto.type}`);
        paymentResult = {
          status: 'not_required',
          amount: 0,
        };
      }

      // PASO 3: Validar datos del servicio
      const serviceData = this.getServiceData(createWizardRequestDto);
      const requestStatus = 'pendiente'; // Siempre pendiente al crear desde wizard

      /*try {
        validateRequestData(
          serviceData,
          createWizardRequestDto.type,
          resolvedCurrentStepNumber,
          requestStatus,
        );
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(`Error de validación: ${error.message}`);
      }*/

      // PASO 4: Crear la solicitud base con pago ya asociado
      const plan = createWizardRequestDto.type === 'apertura-llc' && createWizardRequestDto.aperturaLlcData
        ? (createWizardRequestDto.aperturaLlcData as any).plan
        : undefined;
      const request = this.requestRepository.create({
        type: createWizardRequestDto.type,
        status: 'pendiente', // Siempre pendiente al crear desde wizard
        currentStep: createWizardRequestDto.currentStep || 1,
        createdFrom: source === 'panel' ? 'panel' : 'wizard',
        clientId: client.id,
        partnerId: undefined, // Wizard no tiene partners
        notes: createWizardRequestDto.notes,
        plan,
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
        const currentStep = resolvedCurrentStepNumber;

        // Preparar datos según la sección actual (igual que en panel)
        const aperturaDataRaw: any = { ...aperturaDataFields };
        
        // Sección 1 (información básica) - siempre se procesa
        // Sección 2 (miembros) - se procesa si currentStep >= 2
        // Sección 3 (apertura bancaria) - solo procesar si currentStep >= 3
        if (currentStep < 3) {
          delete aperturaDataRaw.serviceBillUrl;
          delete aperturaDataRaw.bankStatementUrl;
          delete aperturaDataRaw.periodicIncome10k;
          delete aperturaDataRaw.bankAccountLinkedEmail;
          delete aperturaDataRaw.bankAccountLinkedPhone;
          delete aperturaDataRaw.actividadFinancieraEsperada;
          delete aperturaDataRaw.projectOrCompanyUrl;
        }

        const wizAperturaWebErr = applyOptionalPublicWebUrlsToObject(
          aperturaDataRaw as Record<string, unknown>,
          ['linkedin', 'projectOrCompanyUrl'],
        );
        if (wizAperturaWebErr) {
          throw new BadRequestException(wizAperturaWebErr);
        }

        const aperturaData = this.aperturaRepo.create({
          requestId: savedRequest.id,
          currentStepNumber: resolvedCurrentStepNumber,
          ...aperturaDataRaw,
        });
        await queryRunner.manager.save(AperturaLlcRequest, aperturaData);

        // Crear miembros si están presentes (igual que en panel)
        if (members && members.length > 0) {
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
              const { dateOfBirth, scannedPassportUrl, ...memberDataWithoutDate } = memberDto;
              const parsedDate = this.parseDate(dateOfBirth);
              return this.memberRepo.create({
                requestId: savedRequest.id,
                firstName: memberDto.firstName || '',
                lastName: memberDto.lastName || '',
                passportNumber: memberDto.passportNumber || '',
                scannedPassportUrl: scannedPassportUrl || memberDto.scannedPassportUrl || '',
                nationality: memberDto.nationality || '',
                email: memberDto.email || '',
                phoneNumber: memberDto.phoneNumber || '',
                percentageOfParticipation: memberDto.percentageOfParticipation || 0,
                memberAddress: memberDto.memberAddress || {
                  street: '',
                  city: '',
                  stateRegion: '',
                  postalCode: '',
                  country: ''
                },
                validatesBankAccount: memberDto.validatesBankAccount || false,
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

        const renovacionDataRaw = createWizardRequestDto.renovacionLlcData as any;
        const { members, owners, ...renovacionDataFields } = renovacionDataRaw;
        const currentStep = resolvedCurrentStepNumber;

        // Preparar datos según la sección actual
        const dataToSave: any = { ...renovacionDataFields };
        
        // Sección 1: Información General de la LLC - siempre se procesa
        // Sección 2: Información de Propietarios - se procesa si currentStep >= 2
        // Sección 3: Información Contable - solo procesar si currentStep >= 3
        if (currentStep < 3) {
          delete dataToSave.llcOpeningCost;
          delete dataToSave.paidToFamilyMembers;
          delete dataToSave.paidToLocalCompanies;
          delete dataToSave.paidForLLCFormation;
          delete dataToSave.paidForLLCDissolution;
          delete dataToSave.bankAccountBalanceEndOfYear;
        }
        
        // Sección 4: Movimientos Financieros - solo procesar si currentStep >= 4
        if (currentStep < 4) {
          delete dataToSave.totalRevenue2025;
        }
        
        // Sección 5: Información Adicional - solo procesar si currentStep >= 5
        if (currentStep < 5) {
          delete dataToSave.hasFinancialInvestmentsInUSA;
          delete dataToSave.hasFiledTaxesBefore;
          delete dataToSave.wasConstitutedWithStartCompanies;
          delete dataToSave.partnersPassportsFileUrl;
          delete dataToSave.operatingAgreementAdditionalFileUrl;
          delete dataToSave.form147Or575FileUrl;
          delete dataToSave.articlesOfOrganizationAdditionalFileUrl;
          delete dataToSave.boiReportFileUrl;
          delete dataToSave.bankStatementsFileUrl;
        }

        const renovacionData = this.renovacionRepo.create({
          requestId: savedRequest.id,
          currentStepNumber: resolvedCurrentStepNumber,
          ...dataToSave,
        });
        await queryRunner.manager.save(RenovacionLlcRequest, renovacionData);

        // Crear miembros si están presentes (homologado: usar 'members' o 'owners')
        const membersArray = members || owners || [];
        if (membersArray.length > 0) {
          const validMembers = membersArray.filter((m: any) =>
            m.firstName || m.lastName || m.email || m.passportNumber || m.name
          );

          if (validMembers.length > 0) {
            const membersToSave = validMembers.map((memberDto: any) => {
              const { dateOfBirth, ...memberDataWithoutDate } = memberDto;
              const parsedDate = this.parseDate(dateOfBirth);
              
              // Mapear campos del frontend a la estructura de Member
              return this.memberRepo.create({
                requestId: savedRequest.id,
                firstName: memberDto.firstName || memberDto.name || '',
                lastName: memberDto.lastName || '',
                passportNumber: memberDto.passportNumber || '',
                scannedPassportUrl: memberDto.scannedPassportUrl || '',
                nationality: memberDto.nationality || '',
                email: memberDto.email || '',
                phoneNumber: memberDto.phoneNumber || memberDto.phone || '',
                percentageOfParticipation: memberDto.percentageOfParticipation || memberDto.participationPercentage || 0,
                memberAddress: memberDto.memberAddress || {
                  street: memberDto.fullAddress || '',
                  unit: memberDto.unit || '',
                  city: memberDto.city || '',
                  stateRegion: memberDto.stateRegion || '',
                  postalCode: memberDto.postalCode || '',
                  country: memberDto.country || ''
                },
                // Campos adicionales para renovación
                ssnOrItin: memberDto.ssnItin || memberDto.ssnOrItin || null,
                nationalTaxId: memberDto.cuit || memberDto.nationalTaxId || null,
                ownerContributions: memberDto.capitalContributions2025 || memberDto.ownerContributions || 0,
                ownerLoansToLLC: memberDto.loansToLLC2025 || memberDto.ownerLoansToLLC || 0,
                loansReimbursedByLLC: memberDto.loansRepaid2025 || memberDto.loansReimbursedByLLC || 0,
                profitDistributions: memberDto.capitalWithdrawals2025 || memberDto.profitDistributions || 0,
                hasUSFinancialInvestments: memberDto.hasInvestmentsInUSA || memberDto.hasUSFinancialInvestments || '',
                isUSCitizen: memberDto.isUSCitizen || '',
                taxFilingCountry: Array.isArray(memberDto.taxCountry) 
                  ? memberDto.taxCountry.join(', ') 
                  : (memberDto.taxCountry || memberDto.taxFilingCountry || ''),
                spentMoreThan31DaysInUS: memberDto.wasInUSA31Days2025 || memberDto.wasInUSA31Days || memberDto.spentMoreThan31DaysInUS || '',
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

        const cuentaDataRaw = createWizardRequestDto.cuentaBancariaData as any;
        const { owners, validators, ...cuentaDataFields } = cuentaDataRaw;
        const currentStep = resolvedCurrentStepNumber;

        // Preparar datos según la sección actual (igual que en panel)
        const dataToSave: any = { ...cuentaDataFields };
        
        // Mapear campos del frontend a la entidad
        // Sección 1: Información de la LLC
        if (cuentaDataRaw.legalBusinessName) {
          dataToSave.legalBusinessIdentifier = cuentaDataRaw.legalBusinessName;
        }
        if (cuentaDataRaw.briefDescription) {
          dataToSave.economicActivity = cuentaDataRaw.briefDescription;
        }
        if (cuentaDataRaw.einNumber) {
          dataToSave.ein = cuentaDataRaw.einNumber;
        }
        if (cuentaDataRaw.articlesOrCertificateUrl) {
          dataToSave.certificateOfConstitutionOrArticlesUrl = cuentaDataRaw.articlesOrCertificateUrl;
        }
        
        // Sección 2: Dirección del Registered Agent
        if (currentStep >= 2) {
          // Guardar campos individuales de registeredAgent directamente (no como JSONB o string concatenado)
          if (cuentaDataRaw.registeredAgentStreet !== undefined) {
            dataToSave.registeredAgentStreet = cuentaDataRaw.registeredAgentStreet;
          }
          if (cuentaDataRaw.registeredAgentUnit !== undefined) {
            dataToSave.registeredAgentUnit = cuentaDataRaw.registeredAgentUnit;
          }
          if (cuentaDataRaw.registeredAgentCity !== undefined) {
            dataToSave.registeredAgentCity = cuentaDataRaw.registeredAgentCity;
          }
          if (cuentaDataRaw.registeredAgentState !== undefined) {
            dataToSave.registeredAgentState = cuentaDataRaw.registeredAgentState;
          }
          if (cuentaDataRaw.registeredAgentZipCode !== undefined) {
            dataToSave.registeredAgentZipCode = cuentaDataRaw.registeredAgentZipCode;
          }
          if (cuentaDataRaw.registeredAgentCountry !== undefined) {
            dataToSave.registeredAgentCountry = cuentaDataRaw.registeredAgentCountry;
          }
          
          // incorporationMonthYear se guarda como string (no como fecha)
          if (cuentaDataRaw.incorporationMonthYear !== undefined) {
            dataToSave.incorporationMonthYear = cuentaDataRaw.incorporationMonthYear;
          }
          
          // Guardar countriesWhereBusiness como string
          if (cuentaDataRaw.countriesWhereBusiness) {
            dataToSave.countriesWhereBusiness = Array.isArray(cuentaDataRaw.countriesWhereBusiness)
              ? cuentaDataRaw.countriesWhereBusiness.join(', ')
              : cuentaDataRaw.countriesWhereBusiness;
          }
        } else {
          // Si currentStep < 2, eliminar estos campos solo si no están presentes en el payload
          if (cuentaDataRaw.registeredAgentStreet === undefined) {
            delete dataToSave.registeredAgentStreet;
          }
          if (cuentaDataRaw.registeredAgentUnit === undefined) {
            delete dataToSave.registeredAgentUnit;
          }
          if (cuentaDataRaw.registeredAgentCity === undefined) {
            delete dataToSave.registeredAgentCity;
          }
          if (cuentaDataRaw.registeredAgentState === undefined) {
            delete dataToSave.registeredAgentState;
          }
          if (cuentaDataRaw.registeredAgentZipCode === undefined) {
            delete dataToSave.registeredAgentZipCode;
          }
          if (cuentaDataRaw.registeredAgentCountry === undefined) {
            delete dataToSave.registeredAgentCountry;
          }
          if (cuentaDataRaw.incorporationState === undefined) {
            delete dataToSave.incorporationState;
          }
          if (cuentaDataRaw.incorporationMonthYear === undefined) {
            delete dataToSave.incorporationMonthYear;
          }
          if (cuentaDataRaw.countriesWhereBusiness === undefined) {
            delete dataToSave.countriesWhereBusiness;
          }
        }
        
        // Sección 3: Información del validador
        if (currentStep >= 3) {
          // Los campos del validador pueden venir en validators[] o directamente
          let validatorData: any = null;
          
          if (validators && validators.length > 0) {
            validatorData = validators[0];
          } else if (cuentaDataRaw.validatorFirstName || cuentaDataRaw.validatorLastName || 
                     cuentaDataRaw.validatorDateOfBirth || cuentaDataRaw.validatorPassportNumber ||
                     cuentaDataRaw.validatorPassportUrl || cuentaDataRaw.isUSResident) {
            validatorData = cuentaDataRaw;
          }
          
          if (validatorData) {
            if (validatorData.validatorFirstName || validatorData.firstName) {
              dataToSave.validatorFirstName = validatorData.validatorFirstName || validatorData.firstName || '';
            }
            if (validatorData.validatorLastName || validatorData.lastName) {
              dataToSave.validatorLastName = validatorData.validatorLastName || validatorData.lastName || '';
            }
            if (validatorData.validatorNationality || validatorData.nationality) {
              dataToSave.validatorNationality = validatorData.validatorNationality || validatorData.nationality || '';
            }
            if (validatorData.validatorCitizenship || validatorData.citizenship) {
              dataToSave.validatorCitizenship = validatorData.validatorCitizenship || validatorData.citizenship || '';
            }
            if (validatorData.validatorPassportNumber || validatorData.passportNumber) {
              dataToSave.validatorPassportNumber = validatorData.validatorPassportNumber || validatorData.passportNumber || '';
            }
            
            // URL del pasaporte
            const passportUrl = validatorData.validatorPassportUrl || validatorData.scannedPassportUrl || 
                               cuentaDataRaw.validatorPassportUrl || '';
            if (passportUrl) {
              dataToSave.validatorScannedPassportUrl = passportUrl;
            }
            
            if (validatorData.validatorWorkEmail || validatorData.workEmail) {
              dataToSave.validatorWorkEmail = validatorData.validatorWorkEmail || validatorData.workEmail || '';
            }
            if (validatorData.validatorPhone || validatorData.phone) {
              dataToSave.validatorPhone = validatorData.validatorPhone || validatorData.phone || '';
            }
            
            // Campos adicionales del validador
            if (validatorData.validatorTitle || validatorData.title) {
              dataToSave.validatorTitle = validatorData.validatorTitle || validatorData.title || '';
            }
            if (validatorData.validatorIncomeSource || validatorData.incomeSource) {
              dataToSave.validatorIncomeSource = validatorData.validatorIncomeSource || validatorData.incomeSource || '';
            }
            if (validatorData.validatorAnnualIncome || validatorData.annualIncome) {
              const annualIncome = typeof (validatorData.validatorAnnualIncome || validatorData.annualIncome) === 'string'
                ? parseFloat(validatorData.validatorAnnualIncome || validatorData.annualIncome)
                : (validatorData.validatorAnnualIncome || validatorData.annualIncome);
              if (!isNaN(annualIncome)) {
                dataToSave.validatorAnnualIncome = annualIncome;
              }
            }
            
            // Campos booleanos
            if (validatorData.useEmailForRelayLogin !== undefined) {
              dataToSave.validatorUseEmailForRelayLogin = validatorData.useEmailForRelayLogin || false;
            }
            if (validatorData.canReceiveSMS !== undefined) {
              dataToSave.validatorCanReceiveSMS = validatorData.canReceiveSMS || false;
            }
            
            // isUSResident
            const isUSResidentValue = validatorData.isUSResident !== undefined && validatorData.isUSResident !== ''
              ? validatorData.isUSResident 
              : cuentaDataRaw.isUSResident;
            if (isUSResidentValue !== undefined && isUSResidentValue !== '') {
              dataToSave.validatorIsUSResident = isUSResidentValue === 'yes' || isUSResidentValue === true;
            }
            
            // Fecha de nacimiento
            const dateOfBirth = validatorData.validatorDateOfBirth || validatorData.dateOfBirth;
            if (dateOfBirth && dateOfBirth.trim && dateOfBirth.trim() !== '') {
              const parsedDate = this.parseDate(dateOfBirth);
              if (parsedDate) {
                dataToSave.validatorDateOfBirth = parsedDate;
              }
            }
          }
        } else {
          // Eliminar campos del validador si no estamos en la sección 3
          delete dataToSave.validatorFirstName;
          delete dataToSave.validatorLastName;
          delete dataToSave.validatorDateOfBirth;
          delete dataToSave.validatorNationality;
          delete dataToSave.validatorCitizenship;
          delete dataToSave.validatorPassportNumber;
          delete dataToSave.validatorPassportUrl;
          delete dataToSave.validatorScannedPassportUrl;
          delete dataToSave.validatorWorkEmail;
          delete dataToSave.validatorPhone;
          delete dataToSave.validatorTitle;
          delete dataToSave.validatorIncomeSource;
          delete dataToSave.validatorAnnualIncome;
        }
        
        // Sección 4: Dirección personal del propietario
        if (currentStep >= 4) {
          // Construir ownerPersonalAddress desde campos individuales
          if (cuentaDataRaw.ownerPersonalStreet || cuentaDataRaw.ownerPersonalCity) {
            dataToSave.ownerPersonalAddress = {
              street: cuentaDataRaw.ownerPersonalStreet || '',
              unit: cuentaDataRaw.ownerPersonalUnit || '',
              city: cuentaDataRaw.ownerPersonalCity || '',
              state: cuentaDataRaw.ownerPersonalState || '',
              postalCode: cuentaDataRaw.ownerPersonalPostalCode || '',
              country: cuentaDataRaw.ownerPersonalCountry || ''
            };
          }
          if (cuentaDataRaw.serviceBillUrl) {
            dataToSave.proofOfAddressUrl = cuentaDataRaw.serviceBillUrl;
          }
        } else {
          delete dataToSave.ownerPersonalStreet;
          delete dataToSave.ownerPersonalUnit;
          delete dataToSave.ownerPersonalCity;
          delete dataToSave.ownerPersonalState;
          delete dataToSave.ownerPersonalCountry;
          delete dataToSave.ownerPersonalPostalCode;
          delete dataToSave.ownerPersonalAddress;
          delete dataToSave.serviceBillUrl;
          delete dataToSave.proofOfAddressUrl;
        }
        
        // Sección 5: Tipo de LLC
        if (currentStep >= 5) {
          // Mapear isMultiMember a llcType
          if (cuentaDataRaw.isMultiMember === 'yes') {
            dataToSave.llcType = 'multi';
          } else if (cuentaDataRaw.isMultiMember === 'no') {
            dataToSave.llcType = 'single';
          }
        }
        
        // Limpiar campos que no deben guardarse directamente
        delete dataToSave.legalBusinessName;
        delete dataToSave.briefDescription;
        delete dataToSave.einNumber;
        delete dataToSave.articlesOrCertificateUrl;
        delete dataToSave.registeredAgentStreet;
        delete dataToSave.registeredAgentUnit;
        delete dataToSave.registeredAgentCity;
        delete dataToSave.registeredAgentZipCode;
        delete dataToSave.registeredAgentCountry;
        delete dataToSave.ownerPersonalStreet;
        delete dataToSave.ownerPersonalUnit;
        delete dataToSave.ownerPersonalCity;
        delete dataToSave.ownerPersonalState;
        delete dataToSave.ownerPersonalCountry;
        delete dataToSave.ownerPersonalPostalCode;
        delete dataToSave.isMultiMember;
        delete dataToSave.validatorPassportUrl;
        
        // Preparar datos para crear
        const cuentaDataToCreate: any = {
          requestId: savedRequest.id,
          currentStepNumber: resolvedCurrentStepNumber,
          ...dataToSave,
        };
        
        
        // Solo incluir llcType si tiene un valor válido
        if (dataToSave.llcType !== 'single' && dataToSave.llcType !== 'multi') {
          delete cuentaDataToCreate.llcType;
        }

        const wizCuentaWebErr = applyOptionalPublicWebUrlsToObject(
          cuentaDataToCreate as Record<string, unknown>,
          ['websiteOrSocialMedia'],
        );
        if (wizCuentaWebErr) {
          throw new BadRequestException(wizCuentaWebErr);
        }

        const cuentaData = this.cuentaRepo.create(cuentaDataToCreate);
        await queryRunner.manager.save(CuentaBancariaRequest, cuentaData);
        
        // Procesar owners como Members si hay datos
        const ownersArray = owners || [];
        if (ownersArray.length > 0) {
          const validOwners = ownersArray.filter((o: any) => 
            o.firstName || o.lastName || o.passportNumber
          );
          
          if (validOwners.length > 0) {
            const membersToSave = validOwners.map((ownerDto: any) => {
              const { dateOfBirth, passportFileUrl, lastName, passportNumber, ssnItin, cuit, participationPercentage, ...ownerDataWithoutDate } = ownerDto;
              const parsedDate = this.parseDate(dateOfBirth);
              
              return this.memberRepo.create({
                requestId: savedRequest.id,
                firstName: ownerDto.firstName || '',
                lastName: lastName || ownerDto.lastName || '',
                paternalLastName: ownerDto.paternalLastName || '',
                maternalLastName: ownerDto.maternalLastName || '',
                passportNumber: passportNumber || ownerDto.passportNumber || '',
                passportOrNationalId: passportNumber || ownerDto.passportOrNationalId || ownerDto.passportNumber || '',
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
                nationality: ownerDto.nationality || '',
                ssnOrItin: ssnItin || ownerDto.ssnItin || null,
                nationalTaxId: cuit || ownerDto.cuit || null,
                percentageOfParticipation: participationPercentage || ownerDto.participationPercentage || 0,
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
              });
            }) as unknown as Member[];
            
            await queryRunner.manager.save(Member, membersToSave);
          }
        }
      }

      await queryRunner.commitTransaction();
      transactionCommitted = true;

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
      // Si el pago fue procesado pero falló la creación del request (y la transacción no fue commiteada),
      // reembolsar el pago para evitar cobrar al cliente por un servicio que no se completó
      if (
        paymentResult?.chargeId &&
        paymentResult?.status === 'succeeded' &&
        !transactionCommitted
      ) {
        try {
          this.logger.warn(
            `[Wizard] Reembolsando pago ${paymentResult.chargeId} debido a error en creación del request (transacción no commiteada)`,
          );
          await this.stripeService.refundCharge(paymentResult.chargeId);
          this.logger.log(
            `[Wizard] Pago ${paymentResult.chargeId} reembolsado exitosamente`,
          );
        } catch (refundError: any) {
          this.logger.error(
            `[Wizard] Error al reembolsar pago ${paymentResult.chargeId}: ${refundError.message}`,
            refundError.stack,
          );
          // No lanzar error aquí, solo loguear. El error principal es más importante.
          // El reembolso puede fallar si el cargo ya fue reembolsado o si hay un problema con Stripe.
        }
      }

      // Solo hacer rollback si la transacción no fue commiteada
      if (!transactionCommitted) {
        await queryRunner.rollbackTransaction();
      }
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
    let transactionCommitted = false;

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

      const previousStatus = request.status;

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

      // Paridad con panel (requests.service): persistir campos raíz del DTO en Request
      if (updateRequestDto.signatureUrl !== undefined) {
        request.signatureUrl = updateRequestDto.signatureUrl;
      }
      if (updateRequestDto.plan !== undefined) {
        request.plan = updateRequestDto.plan;
      }
      if (
        request.type === 'apertura-llc' &&
        updateRequestDto.aperturaLlcData?.plan !== undefined
      ) {
        request.plan = (updateRequestDto.aperturaLlcData as any).plan;
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

        // Paso/sección del formulario LLC: puede venir en el DTO raíz, en BD, o en
        // aperturaLlcData.currentSection (wizard guarda la sub-sección 1–3 del paso "Información").
        // Si solo miramos current_step_number de BD (=1 tras el POST de pago), se borraban
        // URLs y datos de la sección bancaria aunque el payload los trajera completo.
        let effectiveSection = Math.max(
          updateRequestDto.currentStepNumber ?? 0,
          aperturaRequest.currentStepNumber ?? 0,
        );

        if (updateRequestDto.currentStepNumber !== undefined) {
          aperturaRequest.currentStepNumber = updateRequestDto.currentStepNumber;
          effectiveSection = Math.max(
            effectiveSection,
            updateRequestDto.currentStepNumber,
          );
        }

        if (updateRequestDto.aperturaLlcData) {
          const { members, currentSection, ...aperturaDataFields } =
            updateRequestDto.aperturaLlcData as any;
          const aperturaDataRaw: any = { ...aperturaDataFields };

          if (typeof currentSection === 'number') {
            effectiveSection = Math.max(effectiveSection, currentSection);
          }

          const hasBankingSectionPayload = [
            aperturaDataRaw.serviceBillUrl,
            aperturaDataRaw.bankStatementUrl,
            aperturaDataRaw.periodicIncome10k,
            aperturaDataRaw.bankAccountLinkedEmail,
            aperturaDataRaw.bankAccountLinkedPhone,
            aperturaDataRaw.actividadFinancieraEsperada,
            aperturaDataRaw.projectOrCompanyUrl,
          ].some((v) => v !== undefined && v !== null && String(v).trim() !== '');

          // Sección bancaria (última del formulario LLC): no descartar si ya hay datos en el payload
          // o si la sección efectiva es >= 3.
          if (effectiveSection < 3 && !hasBankingSectionPayload) {
            delete aperturaDataRaw.serviceBillUrl;
            delete aperturaDataRaw.bankStatementUrl;
            delete aperturaDataRaw.periodicIncome10k;
            delete aperturaDataRaw.bankAccountLinkedEmail;
            delete aperturaDataRaw.bankAccountLinkedPhone;
            delete aperturaDataRaw.actividadFinancieraEsperada;
            delete aperturaDataRaw.projectOrCompanyUrl;
          }

          const wizAperturaUpWebErr = applyOptionalPublicWebUrlsToObject(
            aperturaDataRaw as Record<string, unknown>,
            ['linkedin', 'projectOrCompanyUrl'],
          );
          if (wizAperturaUpWebErr) {
            throw new BadRequestException(wizAperturaUpWebErr);
          }

          Object.assign(aperturaRequest, aperturaDataRaw);

          if (typeof currentSection === 'number') {
            aperturaRequest.currentStepNumber = Math.max(
              aperturaRequest.currentStepNumber ?? 0,
              currentSection,
            );
          }

          // Actualizar miembros si están presentes
          if (members && members.length > 0) {
            // Eliminar miembros existentes
            await queryRunner.manager.delete(Member, { requestId: id });
            
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
                const { dateOfBirth, scannedPassportUrl, ...memberDataWithoutDate } = memberDto;
                const parsedDate = this.parseDate(dateOfBirth);
                return this.memberRepo.create({
                  requestId: id,
                  firstName: memberDto.firstName || '',
                  lastName: memberDto.lastName || '',
                  passportNumber: memberDto.passportNumber || '',
                  scannedPassportUrl: scannedPassportUrl || memberDto.scannedPassportUrl || '',
                  nationality: memberDto.nationality || '',
                  email: memberDto.email || '',
                  phoneNumber: memberDto.phoneNumber || '',
                  percentageOfParticipation: memberDto.percentageOfParticipation || 0,
                  memberAddress: memberDto.memberAddress || {
                    street: '',
                    city: '',
                    stateRegion: '',
                    postalCode: '',
                    country: ''
                  },
                  validatesBankAccount: memberDto.validatesBankAccount || false,
                  ...(parsedDate ? { dateOfBirth: parsedDate } : {}),
                });
              }) as unknown as Member[];
              await queryRunner.manager.save(Member, membersToSave);
            }
          }
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

        const currentStep = updateRequestDto.currentStepNumber ?? renovacionRequest.currentStepNumber;
        
        if (updateRequestDto.currentStepNumber !== undefined) {
          renovacionRequest.currentStepNumber = updateRequestDto.currentStepNumber;
        }

        if (updateRequestDto.renovacionLlcData) {
          const renovacionDataRaw = updateRequestDto.renovacionLlcData as any;
          const { members, owners, ...renovacionDataFields } = renovacionDataRaw;
          const dataToSave: any = { ...renovacionDataFields };
          
          // Sección 3: Información Contable - solo procesar si currentStep >= 3
          if (currentStep < 3) {
            delete dataToSave.llcOpeningCost;
            delete dataToSave.paidToFamilyMembers;
            delete dataToSave.paidToLocalCompanies;
            delete dataToSave.paidForLLCFormation;
            delete dataToSave.paidForLLCDissolution;
            delete dataToSave.bankAccountBalanceEndOfYear;
          }
          
          // Sección 4: Movimientos Financieros - solo procesar si currentStep >= 4
          if (currentStep < 4) {
            delete dataToSave.totalRevenue2025;
          }
          
          // Sección 5: Información Adicional - solo procesar si currentStep >= 5
          if (currentStep < 5) {
            delete dataToSave.hasFinancialInvestmentsInUSA;
            delete dataToSave.hasFiledTaxesBefore;
            delete dataToSave.wasConstitutedWithStartCompanies;
            delete dataToSave.partnersPassportsFileUrl;
            delete dataToSave.operatingAgreementAdditionalFileUrl;
            delete dataToSave.form147Or575FileUrl;
            delete dataToSave.articlesOfOrganizationAdditionalFileUrl;
            delete dataToSave.boiReportFileUrl;
            delete dataToSave.bankStatementsFileUrl;
          }
          
          // Lista de campos numéricos que deben convertirse de string vacío a null
          const numericFields = [
            'llcOpeningCost',
            'paidToFamilyMembers',
            'paidToLocalCompanies',
            'paidForLLCFormation',
            'paidForLLCDissolution',
            'bankAccountBalanceEndOfYear',
            'totalRevenue2025',
            'totalRevenue',
          ];
          
          // Convertir campos numéricos vacíos a null
          Object.keys(dataToSave).forEach((key) => {
            if (numericFields.includes(key)) {
              const value = dataToSave[key];
              // Si es string vacío, null, undefined, o no es un número válido, convertir a null
              if (value === '' || value === null || value === undefined || (typeof value === 'string' && isNaN(Number(value)))) {
                dataToSave[key] = null;
              } else if (typeof value === 'string') {
                // Si es un string numérico, convertir a número
                const numValue = Number(value);
                dataToSave[key] = isNaN(numValue) ? null : numValue;
              } else if (typeof value === 'number') {
                // Ya es un número, mantenerlo
                dataToSave[key] = value;
              }
            }
          });
          
          // Convertir campos de fecha vacíos a null
          const dateFields = ['llcCreationDate'];
          dateFields.forEach((field) => {
            if (dataToSave[field] !== undefined) {
              const parsedDate = this.parseDate(dataToSave[field]);
              dataToSave[field] = parsedDate;
            }
          });
          
          // Convertir cadenas vacías a null para campos de texto opcionales
          Object.keys(dataToSave).forEach((key) => {
            if (dataToSave[key] === '') {
              // Solo convertir a null si no es un campo booleano o numérico ya procesado
              if (typeof dataToSave[key] !== 'boolean' && !numericFields.includes(key) && !dateFields.includes(key)) {
                dataToSave[key] = null;
              }
            }
          });
          
          Object.assign(renovacionRequest, dataToSave);
          
          // Actualizar miembros si están presentes (homologado: usar 'members' o 'owners')
          const membersArray = members || owners || [];
          if (membersArray.length > 0) {
            // Eliminar miembros existentes
            await queryRunner.manager.delete(Member, { requestId: id });
            
            const validMembers = membersArray.filter((m: any) =>
              m.firstName || m.lastName || m.email || m.passportNumber || m.name
            );

            if (validMembers.length > 0) {
              const membersToSave = validMembers.map((memberDto: any) => {
                const { dateOfBirth, ...memberDataWithoutDate } = memberDto;
                const parsedDate = this.parseDate(dateOfBirth);
                
                return this.memberRepo.create({
                  requestId: id,
                  firstName: memberDto.firstName || memberDto.name || '',
                  lastName: memberDto.lastName || '',
                  passportNumber: memberDto.passportNumber || '',
                  scannedPassportUrl: memberDto.scannedPassportUrl || '',
                  nationality: memberDto.nationality || '',
                  email: memberDto.email || '',
                  phoneNumber: memberDto.phoneNumber || memberDto.phone || '',
                  percentageOfParticipation: memberDto.percentageOfParticipation || memberDto.participationPercentage || 0,
                  memberAddress: memberDto.memberAddress || {
                    street: memberDto.fullAddress || '',
                    unit: memberDto.unit || '',
                    city: memberDto.city || '',
                    stateRegion: memberDto.stateRegion || '',
                    postalCode: memberDto.postalCode || '',
                    country: memberDto.country || ''
                  },
                  ssnOrItin: memberDto.ssnItin || memberDto.ssnOrItin || null,
                  nationalTaxId: memberDto.cuit || memberDto.nationalTaxId || null,
                  ownerContributions: memberDto.capitalContributions2025 || memberDto.ownerContributions || 0,
                  ownerLoansToLLC: memberDto.loansToLLC2025 || memberDto.ownerLoansToLLC || 0,
                  loansReimbursedByLLC: memberDto.loansRepaid2025 || memberDto.loansReimbursedByLLC || 0,
                  profitDistributions: memberDto.capitalWithdrawals2025 || memberDto.profitDistributions || 0,
                  hasUSFinancialInvestments: memberDto.hasInvestmentsInUSA || memberDto.hasUSFinancialInvestments || '',
                  isUSCitizen: memberDto.isUSCitizen || '',
                  taxFilingCountry: Array.isArray(memberDto.taxCountry) 
                    ? memberDto.taxCountry.join(', ') 
                    : (memberDto.taxCountry || memberDto.taxFilingCountry || ''),
                  spentMoreThan31DaysInUS: memberDto.wasInUSA31Days2025 || memberDto.wasInUSA31Days || memberDto.spentMoreThan31DaysInUS || '',
                  ...(parsedDate ? { dateOfBirth: parsedDate } : {}),
                });
              }) as unknown as Member[];
              await queryRunner.manager.save(Member, membersToSave);
            }
          }
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

        const currentStep = updateRequestDto.currentStepNumber ?? cuentaRequest.currentStepNumber;
        
        if (updateRequestDto.currentStepNumber !== undefined) {
          cuentaRequest.currentStepNumber = updateRequestDto.currentStepNumber;
        }

        if (updateRequestDto.cuentaBancariaData) {
          const cuentaDataRaw = updateRequestDto.cuentaBancariaData as any;
          const { owners, validators, ...cuentaDataFields } = cuentaDataRaw;
          const dataToSave: any = { ...cuentaDataFields };
          
          // Mapear campos del frontend a la entidad
          if (cuentaDataRaw.legalBusinessName) {
            dataToSave.legalBusinessIdentifier = cuentaDataRaw.legalBusinessName;
          }
          if (cuentaDataRaw.briefDescription) {
            dataToSave.economicActivity = cuentaDataRaw.briefDescription;
          }
          if (cuentaDataRaw.einNumber) {
            dataToSave.ein = cuentaDataRaw.einNumber;
          }
          if (cuentaDataRaw.articlesOrCertificateUrl) {
            dataToSave.certificateOfConstitutionOrArticlesUrl = cuentaDataRaw.articlesOrCertificateUrl;
          }
          
          // Sección 2: Dirección del Registered Agent
          // Los campos se guardan como columnas individuales, no como JSONB o string concatenado
          if (currentStep >= 2) {
            // Guardar campos individuales de registeredAgent directamente
            if (cuentaDataRaw.registeredAgentStreet !== undefined) {
              dataToSave.registeredAgentStreet = cuentaDataRaw.registeredAgentStreet;
            }
            if (cuentaDataRaw.registeredAgentUnit !== undefined) {
              dataToSave.registeredAgentUnit = cuentaDataRaw.registeredAgentUnit;
            }
            if (cuentaDataRaw.registeredAgentCity !== undefined) {
              dataToSave.registeredAgentCity = cuentaDataRaw.registeredAgentCity;
            }
            if (cuentaDataRaw.registeredAgentState !== undefined) {
              dataToSave.registeredAgentState = cuentaDataRaw.registeredAgentState;
            }
            if (cuentaDataRaw.registeredAgentZipCode !== undefined) {
              dataToSave.registeredAgentZipCode = cuentaDataRaw.registeredAgentZipCode;
            }
            if (cuentaDataRaw.registeredAgentCountry !== undefined) {
              dataToSave.registeredAgentCountry = cuentaDataRaw.registeredAgentCountry;
            }
            
            // incorporationMonthYear se guarda como string (no como fecha)
            if (cuentaDataRaw.incorporationMonthYear !== undefined) {
              dataToSave.incorporationMonthYear = cuentaDataRaw.incorporationMonthYear;
            }
            
            if (cuentaDataRaw.countriesWhereBusiness) {
              dataToSave.countriesWhereBusiness = Array.isArray(cuentaDataRaw.countriesWhereBusiness)
                ? cuentaDataRaw.countriesWhereBusiness.join(', ')
                : cuentaDataRaw.countriesWhereBusiness;
            }
          }
          
          // Sección 3: Información del validador
          if (currentStep >= 3) {
            let validatorData: any = null;
            
            if (validators && validators.length > 0) {
              validatorData = validators[0];
            } else if (cuentaDataRaw.validatorFirstName || cuentaDataRaw.validatorLastName || 
                       cuentaDataRaw.validatorDateOfBirth || cuentaDataRaw.validatorPassportNumber ||
                       cuentaDataRaw.validatorPassportUrl || cuentaDataRaw.isUSResident) {
              validatorData = cuentaDataRaw;
            }
            
            if (validatorData) {
              if (validatorData.validatorFirstName || validatorData.firstName) {
                dataToSave.validatorFirstName = validatorData.validatorFirstName || validatorData.firstName || '';
              }
              if (validatorData.validatorLastName || validatorData.lastName) {
                dataToSave.validatorLastName = validatorData.validatorLastName || validatorData.lastName || '';
              }
              if (validatorData.validatorNationality || validatorData.nationality) {
                dataToSave.validatorNationality = validatorData.validatorNationality || validatorData.nationality || '';
              }
              if (validatorData.validatorCitizenship || validatorData.citizenship) {
                dataToSave.validatorCitizenship = validatorData.validatorCitizenship || validatorData.citizenship || '';
              }
              if (validatorData.validatorPassportNumber || validatorData.passportNumber) {
                dataToSave.validatorPassportNumber = validatorData.validatorPassportNumber || validatorData.passportNumber || '';
              }
              
              const passportUrl = validatorData.validatorPassportUrl || validatorData.scannedPassportUrl || 
                                 cuentaDataRaw.validatorPassportUrl || '';
              if (passportUrl) {
                dataToSave.validatorScannedPassportUrl = passportUrl;
              }
              
              if (validatorData.validatorWorkEmail || validatorData.workEmail) {
                dataToSave.validatorWorkEmail = validatorData.validatorWorkEmail || validatorData.workEmail || '';
              }
              if (validatorData.validatorPhone || validatorData.phone) {
                dataToSave.validatorPhone = validatorData.validatorPhone || validatorData.phone || '';
              }
              
              if (validatorData.validatorTitle || validatorData.title) {
                dataToSave.validatorTitle = validatorData.validatorTitle || validatorData.title || '';
              }
              if (validatorData.validatorIncomeSource || validatorData.incomeSource) {
                dataToSave.validatorIncomeSource = validatorData.validatorIncomeSource || validatorData.incomeSource || '';
              }
              if (validatorData.validatorAnnualIncome !== undefined || validatorData.annualIncome !== undefined) {
                const annualIncomeValue = validatorData.validatorAnnualIncome || validatorData.annualIncome;
                if (annualIncomeValue === '' || annualIncomeValue === null || annualIncomeValue === undefined) {
                  dataToSave.validatorAnnualIncome = null;
                } else {
                  const annualIncome = typeof annualIncomeValue === 'string'
                    ? parseFloat(annualIncomeValue)
                    : annualIncomeValue;
                  if (!isNaN(annualIncome) && annualIncome !== null && annualIncome !== undefined) {
                    dataToSave.validatorAnnualIncome = annualIncome;
                  } else {
                    dataToSave.validatorAnnualIncome = null;
                  }
                }
              }
              
              if (validatorData.useEmailForRelayLogin !== undefined) {
                dataToSave.validatorUseEmailForRelayLogin = validatorData.useEmailForRelayLogin || false;
              }
              if (validatorData.canReceiveSMS !== undefined) {
                dataToSave.validatorCanReceiveSMS = validatorData.canReceiveSMS || false;
              }
              
              const isUSResidentValue = validatorData.isUSResident !== undefined && validatorData.isUSResident !== ''
                ? validatorData.isUSResident 
                : cuentaDataRaw.isUSResident;
              if (isUSResidentValue !== undefined && isUSResidentValue !== '') {
                dataToSave.validatorIsUSResident = isUSResidentValue === 'yes' || isUSResidentValue === true;
              }
              
              const dateOfBirth = validatorData.validatorDateOfBirth || validatorData.dateOfBirth;
              if (dateOfBirth && dateOfBirth.trim && dateOfBirth.trim() !== '') {
                const parsedDate = this.parseDate(dateOfBirth);
                if (parsedDate) {
                  dataToSave.validatorDateOfBirth = parsedDate;
                } else {
                  dataToSave.validatorDateOfBirth = null;
                }
              } else {
                // Si viene como string vacío o no existe, establecer como null
                dataToSave.validatorDateOfBirth = null;
              }
            } else {
              // Si no hay validatorData pero los campos vienen en cuentaDataRaw, limpiarlos
              if (cuentaDataRaw.validatorDateOfBirth !== undefined) {
                const dateOfBirth = cuentaDataRaw.validatorDateOfBirth;
                if (dateOfBirth && typeof dateOfBirth === 'string' && dateOfBirth.trim() !== '') {
                  const parsedDate = this.parseDate(dateOfBirth);
                  dataToSave.validatorDateOfBirth = parsedDate || null;
                } else {
                  dataToSave.validatorDateOfBirth = null;
                }
              }
              if (cuentaDataRaw.validatorAnnualIncome !== undefined) {
                const annualIncomeValue = cuentaDataRaw.validatorAnnualIncome;
                if (annualIncomeValue === '' || annualIncomeValue === null || annualIncomeValue === undefined) {
                  dataToSave.validatorAnnualIncome = null;
                } else {
                  const annualIncome = typeof annualIncomeValue === 'string'
                    ? parseFloat(annualIncomeValue)
                    : annualIncomeValue;
                  if (!isNaN(annualIncome) && annualIncome !== null && annualIncome !== undefined) {
                    dataToSave.validatorAnnualIncome = annualIncome;
                  } else {
                    dataToSave.validatorAnnualIncome = null;
                  }
                }
              }
            }
          }
          
          // Sección 4: Dirección personal del propietario
          if (currentStep >= 4) {
            if (cuentaDataRaw.ownerPersonalStreet || cuentaDataRaw.ownerPersonalCity) {
              dataToSave.ownerPersonalAddress = {
                street: cuentaDataRaw.ownerPersonalStreet || '',
                unit: cuentaDataRaw.ownerPersonalUnit || '',
                city: cuentaDataRaw.ownerPersonalCity || '',
                state: cuentaDataRaw.ownerPersonalState || '',
                postalCode: cuentaDataRaw.ownerPersonalPostalCode || '',
                country: cuentaDataRaw.ownerPersonalCountry || ''
              };
            }
            if (cuentaDataRaw.serviceBillUrl) {
              dataToSave.proofOfAddressUrl = cuentaDataRaw.serviceBillUrl;
            }
          }
          
          // Sección 5: Tipo de LLC
          // Solo establecer llcType si estamos en la sección 5 o superior y hay un valor válido
          if (currentStep >= 5) {
            if (cuentaDataRaw.isMultiMember === 'yes') {
              dataToSave.llcType = 'multi';
            } else if (cuentaDataRaw.isMultiMember === 'no') {
              dataToSave.llcType = 'single';
            } else {
              // Si no hay valor válido, eliminar llcType para no violar el constraint
              delete dataToSave.llcType;
            }
          } else {
            // Si no estamos en la sección 5, eliminar llcType si existe
            delete dataToSave.llcType;
          }
          
          // Asegurar que llcType no sea string vacío (violaría el constraint)
          if (dataToSave.llcType === '' || (typeof dataToSave.llcType === 'string' && dataToSave.llcType.trim() === '')) {
            delete dataToSave.llcType;
          }
          
          // Si llcType es null o undefined, eliminarlo
          if (dataToSave.llcType === null || dataToSave.llcType === undefined) {
            delete dataToSave.llcType;
          }
          
          // Limpiar campos que no deben guardarse directamente
          delete dataToSave.legalBusinessName;
          delete dataToSave.briefDescription;
          delete dataToSave.einNumber;
          delete dataToSave.articlesOrCertificateUrl;
          // NO eliminar los campos individuales de registeredAgent - se guardan como columnas individuales
          // delete dataToSave.registeredAgentStreet;
          // delete dataToSave.registeredAgentUnit;
          // delete dataToSave.registeredAgentCity;
          // delete dataToSave.registeredAgentZipCode;
          // delete dataToSave.registeredAgentCountry;
          delete dataToSave.ownerPersonalStreet;
          delete dataToSave.ownerPersonalUnit;
          delete dataToSave.ownerPersonalCity;
          delete dataToSave.ownerPersonalState;
          delete dataToSave.ownerPersonalCountry;
          delete dataToSave.ownerPersonalPostalCode;
          delete dataToSave.isMultiMember;
          delete dataToSave.validatorPassportUrl;
          // NO eliminar incorporationMonthYear - se guarda como string
          // delete dataToSave.incorporationMonthYear;
          
          // Lista de campos de fecha que deben convertirse de string vacío a null
          // Nota: incorporationMonthYear NO es una fecha, es un string como "Jan-2023"
          const dateFields = ['validatorDateOfBirth'];
          
          // Lista de campos numéricos que deben convertirse de string vacío a null
          const numericFields = ['validatorAnnualIncome', 'numberOfEmployees'];
          
          // Convertir campos de fecha y numéricos vacíos a null
          Object.keys(dataToSave).forEach((key) => {
            const value = dataToSave[key];
            if (dateFields.includes(key)) {
              // Si es un campo de fecha, parsearlo o establecer como null si está vacío
              if (value === '' || value === null || value === undefined) {
                dataToSave[key] = null;
              } else if (value instanceof Date) {
                // Si ya es un objeto Date, mantenerlo
                dataToSave[key] = value;
              } else if (typeof value === 'string') {
                // Solo parsear si es un string
                const parsedDate = this.parseDate(value);
                dataToSave[key] = parsedDate || null;
              } else {
                // Para otros tipos, establecer como null
                dataToSave[key] = null;
              }
            } else if (numericFields.includes(key)) {
              // Si es un campo numérico, convertirlo o establecer como null si está vacío
              if (value === '' || value === null || value === undefined || (typeof value === 'string' && isNaN(Number(value)))) {
                dataToSave[key] = null;
              } else if (typeof value === 'string') {
                const numValue = Number(value);
                dataToSave[key] = isNaN(numValue) ? null : numValue;
              }
            } else if (typeof value === 'string' && value.trim() === '') {
              // Convertir strings vacíos a null para campos de fecha relacionados con validators
              if (key === 'validatorDateOfBirth' || (key.startsWith('validator') && (key.includes('Date') || key.includes('date')))) {
                dataToSave[key] = null;
              }
            }
          });
          
          // Asegurar que validatorDateOfBirth sea null si viene como string vacío
          if (dataToSave.validatorDateOfBirth === '' || (typeof dataToSave.validatorDateOfBirth === 'string' && dataToSave.validatorDateOfBirth.trim() === '')) {
            dataToSave.validatorDateOfBirth = null;
          }
          
          // Asegurar que validatorAnnualIncome sea null si viene como string vacío
          if (dataToSave.validatorAnnualIncome === '' || (typeof dataToSave.validatorAnnualIncome === 'string' && dataToSave.validatorAnnualIncome.trim() === '')) {
            dataToSave.validatorAnnualIncome = null;
          }

          const wizCuentaUpWebErr = applyOptionalPublicWebUrlsToObject(
            dataToSave as Record<string, unknown>,
            ['websiteOrSocialMedia'],
          );
          if (wizCuentaUpWebErr) {
            throw new BadRequestException(wizCuentaUpWebErr);
          }

          Object.assign(cuentaRequest, dataToSave);
          
          // Actualizar owners como Members si hay datos
          const ownersArray = owners || [];
          if (ownersArray.length > 0) {
            // Eliminar miembros existentes
            await queryRunner.manager.delete(Member, { requestId: id });
            
            const validOwners = ownersArray.filter((o: any) => 
              o.firstName || o.lastName || o.passportNumber
            );
            
            if (validOwners.length > 0) {
              const membersToSave = validOwners.map((ownerDto: any) => {
                const { dateOfBirth, passportFileUrl, lastName, passportNumber, ssnItin, cuit, participationPercentage, ...ownerDataWithoutDate } = ownerDto;
                const parsedDate = this.parseDate(dateOfBirth);
                
                return this.memberRepo.create({
                  requestId: id,
                  firstName: ownerDto.firstName || '',
                  lastName: lastName || ownerDto.lastName || '',
                  paternalLastName: ownerDto.paternalLastName || '',
                  maternalLastName: ownerDto.maternalLastName || '',
                  passportNumber: passportNumber || ownerDto.passportNumber || '',
                  passportOrNationalId: passportNumber || ownerDto.passportOrNationalId || ownerDto.passportNumber || '',
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
                  nationality: ownerDto.nationality || '',
                  ssnOrItin: ssnItin || ownerDto.ssnItin || null,
                  nationalTaxId: cuit || ownerDto.cuit || null,
                  percentageOfParticipation: participationPercentage || ownerDto.participationPercentage || 0,
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
                });
              }) as unknown as Member[];
              
              await queryRunner.manager.save(Member, membersToSave);
            }
          }
        }

        await queryRunner.manager.save(CuentaBancariaRequest, cuentaRequest);
      }

      await queryRunner.commitTransaction();
      transactionCommitted = true;

      // Retornar la solicitud actualizada
      const updatedRequest = await this.requestRepository.findOne({
        where: { id },
        relations: [
          'client',
          'aperturaLlcRequest',
          'renovacionLlcRequest',
          'cuentaBancariaRequest',
        ],
      });

      // Enviar email solo cuando la solicitud pasa a "solicitud-recibida" por primera vez
      try {
        if (
          previousStatus !== 'solicitud-recibida' &&
          updatedRequest?.status === 'solicitud-recibida'
        ) {
          const clientEmail = updatedRequest.client?.email;
          if (clientEmail) {
            const clientName = updatedRequest.client?.full_name || clientEmail;
            const paymentAmountNum = Number(updatedRequest.paymentAmount || 0);
            // Lead (crm-lead, sin pago inicial): solo email de solicitud. Wizard /apertura-llc con pago: CTA de activación de cuenta.
            const isLeadAperturaFlow =
              updatedRequest.type === 'apertura-llc' &&
              updatedRequest.createdFrom === 'wizard' &&
              (!updatedRequest.paymentMethod || paymentAmountNum <= 0);
            await this.emailService.sendWizardRequestSubmittedEmail({
              email: clientEmail,
              name: clientName,
              requestId: id,
              requestType: updatedRequest.type,
              includeActivationCta: !isLeadAperturaFlow,
            });
          } else {
            this.logger.warn(
              `[Wizard] No se pudo enviar email de solicitud enviada: client email vacío (request ${id})`,
            );
          }
        }
      } catch (emailError) {
        // No bloquear el flujo si falla el email
        this.logger.error(
          `[Wizard] Error al enviar email de solicitud enviada para request ${id}: ${emailError}`,
        );
      }

      // Notificaciones in-app + correos a staff (mismo flujo que panel al pasar a solicitud-recibida)
      try {
        if (
          previousStatus !== 'solicitud-recibida' &&
          updatedRequest?.status === 'solicitud-recibida'
        ) {
          const clientRow = updatedRequest.clientId
            ? await this.clientRepo.findOne({
                where: { id: updatedRequest.clientId },
              })
            : null;
          await this.requestSubmittedNotifications.notifyAfterSolicitudRecibida(
            updatedRequest,
            clientRow,
            null,
            { channel: 'wizard' },
          );
        }
      } catch (notifyErr) {
        this.logger.error(
          `[Wizard] Error en notifyAfterSolicitudRecibida para request ${id}: ${notifyErr}`,
        );
      }

      return updatedRequest;
    } catch (error) {
      // Solo hacer rollback si la transacción no fue commiteada
      if (!transactionCommitted) {
        await queryRunner.rollbackTransaction();
      }
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
