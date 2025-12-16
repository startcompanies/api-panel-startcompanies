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
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dtos/create-request.dto';
import { UpdateRequestDto } from './dtos/update-request.dto';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Panel - Requests')
@Controller('panel/requests')
@UseGuards(AuthGuard)
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  // Crear nueva solicitud
  @Post()
  create(@Body() createRequestDto: CreateRequestDto) {
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
  ) {
    const filters: any = {};
    if (status) filters.status = status;
    if (type) filters.type = type;
    if (clientId) filters.clientId = parseInt(clientId, 10);
    if (partnerId) filters.partnerId = parseInt(partnerId, 10);

    return this.requestsService.findAll(filters);
  }

  // Detalle de una solicitud
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

  // Eliminar solicitud (solo admin, o si está pendiente y es el dueño)
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user.id;
    const userRole = req.user.type || req.user.role || 'client';
    return this.requestsService.delete(id, userId, userRole);
  }
}

