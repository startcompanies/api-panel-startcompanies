import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dtos/create-request.dto';
import { UpdateRequestDto } from './dtos/update-request.dto';
import { ApproveRequestDto } from './dtos/approve-request.dto';
import { RejectRequestDto } from './dtos/reject-request.dto';
import { PanelRequestActorUser } from '../notifications/request-submitted-notifications.service';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Panel - Requests')
@ApiBearerAuth('JWT-auth')
@Controller('panel/requests')
@UseGuards(AuthGuard)
export class RequestsController {
  private readonly logger = new Logger(RequestsController.name);
  
  constructor(private readonly requestsService: RequestsService) {}

  private toActorUser(req: any): PanelRequestActorUser | undefined {
    const u = req?.user;
    if (!u?.id || !u?.email) return undefined;
    return {
      id: u.id,
      email: u.email,
      type: u.type,
      first_name: u.first_name,
      username: u.username,
    };
  }

  // Crear nueva solicitud
  @Post()
  @ApiOperation({
    summary: 'Crear una nueva solicitud',
    description: 'Crea una nueva solicitud (apertura-llc, renovacion-llc o cuenta-bancaria). Si el usuario es partner, se asigna automáticamente su ID como partnerId.',
  })
  @ApiBody({ type: CreateRequestDto })
  @ApiResponse({ status: 201, description: 'Solicitud creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  create(@Body() createRequestDto: CreateRequestDto, @Req() req: any) {
    // Si el usuario es partner, asignar automáticamente su ID como partnerId
    if (req.user?.type === 'partner' && !createRequestDto.partnerId) {
      createRequestDto.partnerId = req.user.id;
    }
    return this.requestsService.create(createRequestDto, this.toActorUser(req));
  }

  // Lista de solicitudes para el usuario actual (cliente/partner)
  @Get('me')
  @ApiOperation({
    summary: 'Obtener mis solicitudes',
    description: 'Obtiene todas las solicitudes del usuario autenticado. Puede filtrar por rol (client o partner).',
  })
  @ApiQuery({ name: 'role', required: false, enum: ['client', 'partner'], description: 'Rol para filtrar las solicitudes' })
  @ApiResponse({ status: 200, description: 'Lista de solicitudes del usuario' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  findMyRequests(@Req() req: any, @Query('role') role?: 'client' | 'partner') {
    const user = req.user; // asume AuthGuard que inyecta user
    const effectiveRole =
      (role as 'client' | 'partner') || (user?.type ?? 'client');
    return this.requestsService.findAllByUser(user.id, effectiveRole);
  }

  // Listar todas las solicitudes con filtros (admin y staff user)
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  @ApiOperation({
    summary: 'Listar todas las solicitudes (Admin)',
    description: 'Obtiene todas las solicitudes con filtros opcionales. Administradores y usuarios operativos.',
  })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por estado' })
  @ApiQuery({ name: 'type', required: false, description: 'Filtrar por tipo de solicitud' })
  @ApiQuery({ name: 'clientId', required: false, description: 'Filtrar por ID de cliente' })
  @ApiQuery({ name: 'partnerId', required: false, description: 'Filtrar por ID de partner' })
  @ApiQuery({ name: 'search', required: false, description: 'Búsqueda de texto' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Límite de resultados por página (default: 10, max: 100)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de solicitudes' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (solo admin)' })
  findAll(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('clientId') clientId?: string,
    @Query('partnerId') partnerId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: any = {};
    if (status) filters.status = status;
    if (type) filters.type = type;
    if (clientId) filters.clientId = parseInt(clientId, 10);
    if (partnerId) filters.partnerId = parseInt(partnerId, 10);
    if (search) filters.search = search.trim();

    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;

    // Validar que page y limit sean números positivos
    const validPage = pageNumber > 0 ? pageNumber : 1;
    const validLimit = limitNumber > 0 && limitNumber <= 100 ? limitNumber : 10; // Máximo 100 por página

    return this.requestsService.findAll(filters, validPage, validLimit);
  }

  // Detalle de una solicitud por UUID
  @Get('uuid/:uuid')
  @ApiOperation({
    summary: 'Obtener solicitud por UUID',
    description: 'Obtiene los detalles de una solicitud usando su UUID.',
  })
  @ApiParam({ name: 'uuid', description: 'UUID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Detalles de la solicitud' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  findOneByUuid(@Param('uuid') uuid: string) {
    return this.requestsService.findOneByUuid(uuid);
  }

  // Detalle de una solicitud por ID
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener solicitud por ID',
    description: 'Obtiene los detalles de una solicitud usando su ID numérico.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Detalles de la solicitud' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.requestsService.findOne(id);
  }

  // Actualizar solicitud
  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar una solicitud',
    description: 'Actualiza una solicitud existente. Permite actualizar estado, pasos, datos específicos y procesar pagos.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la solicitud' })
  @ApiBody({ type: UpdateRequestDto })
  @ApiResponse({ status: 200, description: 'Solicitud actualizada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRequestDto: UpdateRequestDto,
    @Req() req: any,
  ) {
    this.logger.log(`[Controller] PATCH /panel/requests/${id} recibido`);
    this.logger.log(`[Controller] Datos recibidos:`, {
      paymentMethod: updateRequestDto.paymentMethod,
      paymentAmount: updateRequestDto.paymentAmount,
      stripeToken: updateRequestDto.stripeToken ? 'presente' : 'ausente',
      paymentProofUrl: updateRequestDto.paymentProofUrl,
      status: updateRequestDto.status,
      currentStep: updateRequestDto.currentStep,
      currentStepNumber: updateRequestDto.currentStepNumber,
    });
    return this.requestsService.update(id, updateRequestDto, this.toActorUser(req));
  }

  // getRequiredDocuments eliminado - RequestRequiredDocument ya no se usa

  // Obtener aperturas de un cliente para renovación
  @Get('client/:clientId/aperturas')
  @ApiOperation({
    summary: 'Obtener aperturas de un cliente por ID',
    description: 'Obtiene todas las aperturas LLC completadas de un cliente para usar en renovaciones.',
  })
  @ApiParam({ name: 'clientId', type: Number, description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Lista de aperturas del cliente' })
  getClientAperturasById(@Param('clientId', ParseIntPipe) clientId: number) {
    return this.requestsService.getClientAperturas(clientId);
  }

  // Obtener aperturas de un cliente por email para renovación
  @Get('client/email/:email/aperturas')
  @ApiOperation({
    summary: 'Obtener aperturas de un cliente por email',
    description: 'Obtiene todas las aperturas LLC completadas de un cliente usando su email para usar en renovaciones.',
  })
  @ApiParam({ name: 'email', description: 'Email del cliente' })
  @ApiResponse({ status: 200, description: 'Lista de aperturas del cliente' })
  getClientAperturasByEmail(@Param('email') email: string) {
    return this.requestsService.getClientAperturas(undefined, email);
  }

  // Aprobar solicitud (solo admin) - cambia de 'solicitud-recibida' a 'en-proceso' con etapa inicial
  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Aprobar una solicitud (Admin)',
    description: 'Aprueba una solicitud cambiando su estado de "solicitud-recibida" a "en-proceso" con una etapa inicial. Solo disponible para administradores.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la solicitud' })
  @ApiBody({ type: ApproveRequestDto })
  @ApiResponse({ status: 200, description: 'Solicitud aprobada exitosamente' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (solo admin)' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() approveDto: ApproveRequestDto,
  ) {
    return this.requestsService.approveRequest(id, approveDto);
  }

  // Rechazar solicitud (solo admin) - cambia de 'solicitud-recibida' a 'rechazada'
  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Rechazar una solicitud (Admin)',
    description: 'Rechaza una solicitud cambiando su estado a "rechazada". Solo disponible para administradores.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la solicitud' })
  @ApiBody({ type: RejectRequestDto })
  @ApiResponse({ status: 200, description: 'Solicitud rechazada exitosamente' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (solo admin)' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() rejectDto: RejectRequestDto,
  ) {
    return this.requestsService.rejectRequest(id, rejectDto);
  }

  // Eliminar solicitud (solo admin, o si está pendiente y es el dueño)
  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar una solicitud',
    description: 'Elimina una solicitud. Solo administradores pueden eliminar cualquier solicitud. Los usuarios solo pueden eliminar sus propias solicitudes si están en estado pendiente.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud eliminada exitosamente' })
  @ApiResponse({ status: 403, description: 'No tiene permisos para eliminar esta solicitud' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    const userRole = req.user.type || req.user.role || 'client';
    return this.requestsService.delete(id, userId, userRole);
  }
}

