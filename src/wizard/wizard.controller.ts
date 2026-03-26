import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
  Logger,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WizardService } from './wizard.service';
import { CreateWizardRequestDto } from './dtos/create-wizard-request.dto';
import { ConfirmEmailDto } from './dtos/confirm-email.dto';
import { RegisterWizardUserDto } from './dtos/register-wizard-user.dto';
import { UpdateRequestDto } from '../panel/requests/dtos/update-request.dto';
import { AuthGuard } from '../shared/auth/auth.guard';

@ApiTags('Common - Request')
@Controller('wizard/requests')
export class WizardController {
  private readonly logger = new Logger(WizardController.name);

  constructor(private readonly wizardService: WizardService) {}

  @Get('check-email')
  @ApiOperation({
    summary: 'Verificar disponibilidad de email',
    description: 'Verifica si un email está disponible para registro. NO requiere autenticación.',
  })
  @ApiResponse({
    status: 200,
    description: 'Información sobre la disponibilidad del email',
    schema: {
      type: 'object',
      properties: {
        available: { type: 'boolean' },
        message: { type: 'string' },
        emailVerified: { type: 'boolean' },
      },
      required: ['available', 'message'],
    },
  })
  async checkEmail(@Query('email') email: string) {
    if (!email) {
      throw new Error('Email es requerido');
    }
    return this.wizardService.checkEmailAvailability(email);
  }

  @Post('register')
  @ApiOperation({
    summary: 'Registrar nuevo usuario en wizard',
    description: 'Crea un nuevo usuario y cliente en el flujo wizard. Envía correo de confirmación. NO requiere autenticación.',
  })
  @ApiBody({ type: RegisterWizardUserDto })
  @ApiResponse({
    status: 201,
    description: 'Usuario registrado exitosamente. Se envió correo de confirmación.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        email: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Email ya registrado o datos inválidos' })
  async registerUser(@Body() registerDto: RegisterWizardUserDto) {
    return this.wizardService.registerWizardUser(registerDto);
  }

  @Post('confirm-email')
  @ApiOperation({
    summary: 'Confirmar email del usuario',
    description: 'Confirma el email del usuario usando el token recibido por correo. Retorna tokens de acceso para continuar el flujo.',
  })
  @ApiBody({ type: ConfirmEmailDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Email confirmado exitosamente. Retorna tokens de acceso.',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            username: { type: 'string' },
            email: { type: 'string' },
            status: { type: 'boolean' },
            type: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async confirmEmail(@Body() confirmEmailDto: ConfirmEmailDto) {
    return this.wizardService.confirmEmail(confirmEmailDto);
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Crear solicitud desde wizard',
    description: 'Crea una solicitud desde el flujo wizard. Requiere usuario autenticado con email confirmado. El pago se procesa ANTES de crear el request. Solo si el pago es exitoso se crea el request.',
  })
  @ApiBody({ type: CreateWizardRequestDto })
  @ApiResponse({ 
    status: 201, 
    description: 'Solicitud creada exitosamente con pago asociado',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        type: { type: 'string' },
        status: { type: 'string', example: 'pendiente' },
        payment: {
          type: 'object',
          properties: {
            chargeId: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string' },
            status: { type: 'string' },
            paid: { type: 'boolean' },
            receiptUrl: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos o pago fallido' })
  @ApiResponse({ status: 401, description: 'No autorizado o email no confirmado' })
  async createWizardRequest(
    @Body() createWizardRequestDto: CreateWizardRequestDto,
    @Req() req: any,
  ) {
    // Validar que el usuario esté autenticado y su email confirmado
    const user = req.user;
    if (!user) {
      throw new Error('Usuario no autenticado');
    }

    // Verificar que el email del usuario coincida con el del clientData
    if (createWizardRequestDto.clientData.email !== user.email) {
      throw new Error('El email del usuario autenticado no coincide con el email proporcionado');
    }

    this.logger.log(`[Wizard] Creando solicitud para usuario: ${user.email}`);
    return this.wizardService.createWizardRequest(createWizardRequestDto, user);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Actualizar solicitud del wizard',
    description: 'Actualiza una solicitud del flujo wizard. NO procesa pagos (ya se procesaron al crear). Requiere usuario autenticado.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la solicitud' })
  @ApiBody({ type: UpdateRequestDto })
  @ApiResponse({ status: 200, description: 'Solicitud actualizada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  async updateWizardRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRequestDto: UpdateRequestDto,
    @Req() req: any,
  ) {
    // Validar que el usuario esté autenticado
    const user = req.user;
    if (!user) {
      throw new Error('Usuario no autenticado');
    }

    this.logger.log(`[Wizard] Actualizando solicitud ${id} para usuario: ${user.email}`);
    return this.wizardService.updateWizardRequest(id, updateRequestDto);
  }
}
