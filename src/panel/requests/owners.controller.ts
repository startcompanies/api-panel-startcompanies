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
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Panel - Requests')
@Controller('panel/requests/:requestId/owners')
@UseGuards(AuthGuard)
export class OwnersController {
  constructor(private readonly requestsService: RequestsService) {}

  // Listar todos los propietarios de una solicitud
  @Get()
  findOwners(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.requestsService.findOwnersByRequest(requestId);
  }

  // Agregar un propietario a una solicitud
  @Post()
  createOwner(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() createOwnerDto: CreateOwnerDto,
  ) {
    return this.requestsService.createOwner(requestId, createOwnerDto);
  }

  // Actualizar información de un propietario
  @Patch(':ownerId')
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
  deleteOwner(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param('ownerId', ParseIntPipe) ownerId: number,
  ) {
    return this.requestsService.deleteOwner(requestId, ownerId);
  }
}

