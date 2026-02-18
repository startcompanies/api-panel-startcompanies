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
import { CreateMemberDto } from './dtos/create-member.dto';
import { UpdateMemberDto } from './dtos/update-member.dto';
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
@Controller('panel/requests/:requestId/members')
@UseGuards(AuthGuard)
export class MembersController {
  constructor(private readonly requestsService: RequestsService) {}

  // Validar que la suma de porcentajes sea 100% (debe ir antes de las rutas con parámetros)
  @Post('validate-percentages')
  @ApiOperation({
    summary: 'Validar porcentajes de miembros',
    description: 'Valida que la suma de los porcentajes de todos los miembros de una solicitud sea exactamente 100%.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Validación completada' })
  validatePercentages(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.requestsService.validateMemberPercentages(requestId);
  }

  // Listar todos los miembros de una solicitud
  @Get()
  findMembers(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.requestsService.findMembersByRequest(requestId);
  }

  // Agregar un miembro a una solicitud
  @Post()
  @ApiOperation({
    summary: 'Agregar un miembro a una solicitud',
    description: 'Crea un nuevo miembro y lo asocia a una solicitud.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiBody({ type: CreateMemberDto })
  @ApiResponse({ status: 201, description: 'Miembro creado exitosamente' })
  createMember(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() createMemberDto: CreateMemberDto,
  ) {
    return this.requestsService.createMember(requestId, createMemberDto);
  }

  // Actualizar información de un miembro
  @Patch(':memberId')
  updateMember(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() updateMemberDto: UpdateMemberDto,
  ) {
    return this.requestsService.updateMember(
      requestId,
      memberId,
      updateMemberDto,
    );
  }

  // Eliminar un miembro
  @Delete(':memberId')
  @ApiOperation({
    summary: 'Eliminar un miembro',
    description: 'Elimina un miembro de una solicitud.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiParam({ name: 'memberId', type: Number, description: 'ID del miembro' })
  @ApiResponse({ status: 200, description: 'Miembro eliminado exitosamente' })
  deleteMember(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.requestsService.deleteMember(requestId, memberId);
  }
}

