import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateOwnerDto } from './dtos/create-owner.dto';
import { UpdateOwnerDto } from './dtos/update-owner.dto';
import { AuthGuard } from '../../shared/auth/auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Panel - Requests')
@ApiBearerAuth('JWT-auth')
@Controller('panel/requests/:requestId/owners')
@UseGuards(AuthGuard)
export class OwnersController {
  constructor(private readonly requestsService: RequestsService) {}

  // Listar todos los propietarios de una solicitud
  @Get()
  @ApiOperation({
    summary: 'Listar propietarios de una solicitud',
    description: 'Obtiene todos los propietarios asociados a una solicitud específica.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Lista de propietarios' })
  findOwners(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.requestsService.findOwnersByRequest(requestId);
  }

  // Agregar un propietario a una solicitud
  @Post()
  @ApiOperation({
    summary: 'Agregar un propietario a una solicitud',
    description: 'Crea un nuevo propietario y lo asocia a una solicitud.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiBody({ type: CreateOwnerDto })
  @ApiResponse({ status: 201, description: 'Propietario creado exitosamente' })
  createOwner(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() createOwnerDto: CreateOwnerDto,
  ) {
    return this.requestsService.createOwner(requestId, createOwnerDto);
  }

  // Actualizar información de un propietario
  @Patch(':ownerId')
  @ApiOperation({
    summary: 'Actualizar un propietario',
    description: 'Actualiza la información de un propietario existente en una solicitud.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiParam({ name: 'ownerId', type: Number, description: 'ID del propietario' })
  @ApiBody({ type: UpdateOwnerDto })
  @ApiResponse({ status: 200, description: 'Propietario actualizado exitosamente' })
  updateOwner(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param('ownerId', ParseIntPipe) ownerId: number,
    @Body() updateOwnerDto: UpdateOwnerDto,
  ) {
    return this.requestsService.updateOwner(
      requestId,
      ownerId,
      updateOwnerDto,
    );
  }

  // Eliminar un propietario
  @Delete(':ownerId')
  @ApiOperation({
    summary: 'Eliminar un propietario',
    description: 'Elimina un propietario de una solicitud.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiParam({ name: 'ownerId', type: Number, description: 'ID del propietario' })
  @ApiResponse({ status: 200, description: 'Propietario eliminado exitosamente' })
  deleteOwner(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param('ownerId', ParseIntPipe) ownerId: number,
  ) {
    return this.requestsService.deleteOwner(requestId, ownerId);
  }
}

