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
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Panel - Requests')
@Controller('panel/requests')
@UseGuards(AuthGuard)
export class RequestsController {
  private readonly logger = new Logger(RequestsController.name);
  
  constructor(private readonly requestsService: RequestsService) {}

  // Crear nueva solicitud
  @Post()
  create(@Body() createRequestDto: CreateRequestDto, @Req() req: any) {
    // Si el usuario es partner, asignar automáticamente su ID como partnerId
    if (req.user?.type === 'partner' && !createRequestDto.partnerId) {
      createRequestDto.partnerId = req.user.id;
    }
    return this.requestsService.create(createRequestDto);
  }

  // Lista de solicitudes para el usuario actual (cliente/partner)
  @Get('me')
  findMyRequests(@Req() req: any, @Query('role') role?: 'client' | 'partner') {
    const user = req.user; // asume AuthGuard que inyecta user
    const effectiveRole =
      (role as 'client' | 'partner') || (user?.type ?? 'client');
    return this.requestsService.findAllByUser(user.id, effectiveRole);
  }

  // Listar todas las solicitudes con filtros (solo admin)
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin')
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
  findOneByUuid(@Param('uuid') uuid: string) {
    return this.requestsService.findOneByUuid(uuid);
  }

  // Detalle de una solicitud por ID
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.requestsService.findOne(id);
  }

  // Actualizar solicitud
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRequestDto: UpdateRequestDto,
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
    return this.requestsService.update(id, updateRequestDto);
  }

  // Obtener lista de documentos requeridos por tipo de solicitud
  @Get('required-documents')
  getRequiredDocuments(
    @Query('type') type: 'apertura-llc' | 'renovacion-llc' | 'cuenta-bancaria',
    @Query('llcType') llcType?: 'single' | 'multi',
  ) {
    if (!type) {
      throw new BadRequestException(
        'El parámetro type es requerido (apertura-llc, renovacion-llc, cuenta-bancaria)',
      );
    }
    return this.requestsService.getRequiredDocuments(type, llcType);
  }

  // Obtener aperturas de un cliente para renovación
  @Get('client/:clientId/aperturas')
  getClientAperturasById(@Param('clientId', ParseIntPipe) clientId: number) {
    return this.requestsService.getClientAperturas(clientId);
  }

  // Obtener aperturas de un cliente por email para renovación
  @Get('client/email/:email/aperturas')
  getClientAperturasByEmail(@Param('email') email: string) {
    return this.requestsService.getClientAperturas(undefined, email);
  }

  // Aprobar solicitud (solo admin) - cambia de 'solicitud-recibida' a 'en-proceso' con etapa inicial
  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('admin')
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
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() rejectDto: RejectRequestDto,
  ) {
    return this.requestsService.rejectRequest(id, rejectDto);
  }

  // Eliminar solicitud (solo admin, o si está pendiente y es el dueño)
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    const userRole = req.user.type || req.user.role || 'client';
    return this.requestsService.delete(id, userId, userRole);
  }
}

