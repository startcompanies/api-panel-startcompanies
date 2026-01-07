import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Patch,
  Param,
  Request,
  Query,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UserDto } from './dtos/user.dto';
import { CreateUserDto } from './dtos/create-user.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AuthGuard } from 'src/shared/auth/auth.guard';
import { RolesGuard } from 'src/shared/auth/roles.guard';
import { Roles } from 'src/shared/auth/roles.decorator';
import { UpdateUserDto } from './dtos/update_user.dto';
import { PaginationDto } from 'src/shared/common/dtos/pagination.dto';

@ApiTags('Common - Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Crear un nuevo usuario (solo admin)',
    description: 'Permite a un administrador crear usuarios con cualquier tipo y campos adicionales',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 403, description: 'Acceso denegado (solo admin)' })
  createUser(@Body() createUserDto: CreateUserDto) {
    return this.userService.createUserByAdmin(createUserDto);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener todos los usuarios excepto el autenticado',
  })
  findAll(@Request() req) {
    const userId = req.user.id;
    return this.userService.findAllExceptCurrent(userId);
  }

  // Rutas específicas deben ir ANTES de las rutas con parámetros dinámicos
  @Get('/me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener usuario actual autenticado',
  })
  getCurrentUser(@Request() req) {
    const userId = req.user.id;
    return this.userService.getCurrentUser(userId);
  }

  @Get('/partners')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Listar todos los partners (solo admin)',
  })
  getPartners() {
    return this.userService.getPartners();
  }

  @Get('/partners/:id/stats')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener estadísticas de un partner (conteo de clientes y solicitudes)',
  })
  getPartnerStats(@Param('id') id: string) {
    return this.userService.getPartnerStats(parseInt(id, 10));
  }

  @Get('/clients')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Listar todos los clientes (solo admin)',
  })
  getClients() {
    return this.userService.getClients();
  }

  @Get('/my-clients')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('partner')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Listar clientes del partner actual',
  })
  getMyClients(@Request() req) {
    const partnerId = req.user.id;
    return this.userService.getMyClients(partnerId);
  }

  @Patch('/me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Actualizar perfil del usuario actual',
  })
  updateCurrentUser(
    @Request() req,
    @Body() updateDto: UpdateUserDto,
  ) {
    const userId = req.user.id;
    return this.userService.updateCurrentUser(userId, updateDto);
  }

  // Rutas con parámetros dinámicos deben ir DESPUÉS de las rutas específicas
  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener un usuario por su ID',
  })
  getUserById(@Param('id') id: string) {
    return this.userService.findUserById(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Actualizar la información de un usuario',
    description: 'Actualiza la información de un usuario específico por su ID.',
  })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'Usuario actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  updateUserInfo(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.updateUserById(id, updateUserDto);
  }

  @Patch('/:id/status')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Activar/Desactivar usuario (solo admin)',
  })
  toggleUserStatus(@Param('id') id: string) {
    return this.userService.toggleUserStatus(id);
  }
}
