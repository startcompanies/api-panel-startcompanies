import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiBody,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dtos/create-client.dto';
import { UpdateClientDto } from './dtos/update-client.dto';
import { GetClientByUuidDto } from './dtos/get-client-by-uuid.dto';
import { ConvertClientToPartnerDto } from './dtos/convert-client-to-partner.dto';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';

@ApiTags('Panel - Clients')
@Controller('panel/clients')
@UseGuards(AuthGuard)
@ApiBearerAuth('JWT-auth')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get('my-clients')
  @UseGuards(RolesGuard)
  @Roles('partner')
  @ApiOperation({
    summary: 'Listar clientes del partner actual',
    description: 'Obtiene todos los clientes asociados al partner autenticado',
  })
  getMyClients(@Request() req) {
    const partnerId = req.user.id;
    return this.clientsService.getMyClients(partnerId);
  }

  @Get('admin-clients')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Listar clientes del admin',
    description:
      'Obtiene solo los clientes del admin (sin partner asignado). Paginado con page/limit; filtros opcionales q (búsqueda) y status (all|active|inactive).',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Página (1-based)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Tamaño de página (máx. 100)', example: 12 })
  @ApiQuery({ name: 'q', required: false, description: 'Buscar en nombre, email o empresa' })
  @ApiQuery({ name: 'status', required: false, enum: ['all', 'active', 'inactive'] })
  getAdminClients(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 12;
    return this.clientsService.getAdminClients({
      page: Number.isFinite(p) && p > 0 ? p : 1,
      limit: Number.isFinite(l) && l > 0 ? l : 12,
      q: q?.trim() || undefined,
      status:
        status === 'active' || status === 'inactive' || status === 'all'
          ? status
          : 'all',
    });
  }

  @Get('for-partner/:partnerId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'user')
  @ApiOperation({
    summary: 'Clientes de un partner con estadísticas',
    description: 'Admin y staff. Listado para el detalle de partner.',
  })
  @ApiParam({ name: 'partnerId', description: 'ID del usuario partner' })
  getClientsForPartner(@Param('partnerId', ParseIntPipe) partnerId: number) {
    return this.clientsService.getClientsForPartnerWithStats(partnerId);
  }

  @Post(':id/convert-to-partner')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Convertir usuario cliente en partner',
    description:
      'Solo admin. Si el listado es solo usuario (sin fila en clients), enviar listItemUserOnly: true en el body.',
  })
  @ApiParam({ name: 'id', description: 'ID en tabla clients o ID de usuario si listItemUserOnly' })
  @ApiBody({ type: ConvertClientToPartnerDto })
  @ApiResponse({ status: 200, description: 'Usuario actualizado a partner' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  convertClientToPartner(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ConvertClientToPartnerDto,
  ) {
    return this.clientsService.convertClientToPartner(id, body);
  }

  @Post('by-uuid')
  @ApiOperation({
    summary: 'Obtener un cliente por UUID',
    description: 'Obtiene un cliente usando su UUID enviado en el body. Partners solo pueden ver sus propios clientes',
  })
  @ApiBody({ type: GetClientByUuidDto })
  @ApiResponse({ status: 200, description: 'Cliente encontrado' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  getClientByUuid(@Body() getClientByUuidDto: GetClientByUuidDto, @Request() req) {
    const partnerId = req.user.type === 'partner' ? req.user.id : undefined;
    return this.clientsService.getClientByUuid(getClientByUuidDto.uuid, partnerId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un cliente por ID',
    description: 'Partners solo pueden ver sus propios clientes',
  })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Cliente encontrado' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  getClientById(@Param('id') id: string, @Request() req) {
    const partnerId = req.user.type === 'partner' ? req.user.id : undefined;
    return this.clientsService.getClientById(parseInt(id, 10), partnerId);
  }

  @Get(':id/stats')
  @ApiOperation({
    summary: 'Obtener estadísticas de un cliente',
    description: 'Obtiene estadísticas del cliente (número de solicitudes, etc.)',
  })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Estadísticas del cliente' })
  getClientStats(@Param('id') id: string, @Request() req) {
    const partnerId = req.user.type === 'partner' ? req.user.id : undefined;
    return this.clientsService.getClientStats(parseInt(id, 10), partnerId);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un nuevo cliente',
    description: 'Partners crean clientes automáticamente asociados a ellos. Admin puede asignar partner.',
  })
  @ApiBody({ type: CreateClientDto })
  @ApiResponse({ status: 201, description: 'Cliente creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  createClient(@Body() createClientDto: CreateClientDto, @Request() req) {
    const partnerId = req.user.type === 'partner' ? req.user.id : undefined;
    return this.clientsService.createClient(createClientDto, partnerId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un cliente',
    description: 'Partners solo pueden actualizar sus propios clientes',
  })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiBody({ type: UpdateClientDto })
  @ApiResponse({ status: 200, description: 'Cliente actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  updateClient(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
    @Request() req,
  ) {
    const partnerId = req.user.type === 'partner' ? req.user.id : undefined;
    return this.clientsService.updateClient(
      parseInt(id, 10),
      updateClientDto,
      partnerId,
    );
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Activar/Desactivar un cliente',
    description: 'Partners solo pueden cambiar estado de sus propios clientes',
  })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Estado del cliente actualizado' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  toggleClientStatus(@Param('id') id: string, @Request() req) {
    const partnerId = req.user.type === 'partner' ? req.user.id : undefined;
    return this.clientsService.toggleClientStatus(parseInt(id, 10), partnerId);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar un cliente',
    description: 'Solo se puede eliminar si no tiene solicitudes asociadas. Partners solo pueden eliminar sus propios clientes.',
  })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Cliente eliminado exitosamente' })
  @ApiResponse({ status: 400, description: 'No se puede eliminar, tiene solicitudes asociadas' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  deleteClient(@Param('id') id: string, @Request() req) {
    const partnerId = req.user.type === 'partner' ? req.user.id : undefined;
    return this.clientsService.deleteClient(parseInt(id, 10), partnerId);
  }
}









