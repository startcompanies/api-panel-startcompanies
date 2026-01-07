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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dtos/create-client.dto';
import { UpdateClientDto } from './dtos/update-client.dto';
import { GetClientByUuidDto } from './dtos/get-client-by-uuid.dto';
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
    description: 'Obtiene solo los clientes del admin (sin partner asignado). Los partners gestionan sus propios clientes a través de /my-clients.',
  })
  getAdminClients() {
    return this.clientsService.getAdminClients();
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









