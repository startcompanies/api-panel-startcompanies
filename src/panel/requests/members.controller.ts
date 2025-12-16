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
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Panel - Requests')
@Controller('panel/requests/:requestId/members')
@UseGuards(AuthGuard)
export class MembersController {
  constructor(private readonly requestsService: RequestsService) {}

  // Validar que la suma de porcentajes sea 100% (debe ir antes de las rutas con parámetros)
  @Post('validate-percentages')
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
  deleteMember(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.requestsService.deleteMember(requestId, memberId);
  }
}

