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
import { CreateBankAccountValidatorDto } from './dtos/create-bank-account-validator.dto';
import { UpdateBankAccountValidatorDto } from './dtos/update-bank-account-validator.dto';
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
@Controller('panel/requests/:requestId/bank-account-validator')
@UseGuards(AuthGuard)
export class BankAccountValidatorController {
  constructor(private readonly requestsService: RequestsService) {}

  // Obtener el miembro validador de una solicitud
  @Get()
  @ApiOperation({
    summary: 'Obtener validador de cuenta bancaria',
    description: 'Obtiene el miembro validador de cuenta bancaria asociado a una solicitud.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Información del validador' })
  findValidator(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.requestsService.findBankAccountValidator(requestId);
  }

  // Crear/actualizar el miembro validador
  @Post()
  createOrUpdateValidator(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() createValidatorDto: CreateBankAccountValidatorDto,
  ) {
    return this.requestsService.createOrUpdateBankAccountValidator(
      requestId,
      createValidatorDto,
    );
  }

  // Actualizar información del miembro validador
  @Patch()
  @ApiOperation({
    summary: 'Actualizar validador de cuenta bancaria',
    description: 'Actualiza la información del miembro validador de cuenta bancaria.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiBody({ type: UpdateBankAccountValidatorDto })
  @ApiResponse({ status: 200, description: 'Validador actualizado exitosamente' })
  updateValidator(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() updateValidatorDto: UpdateBankAccountValidatorDto,
  ) {
    return this.requestsService.updateBankAccountValidator(
      requestId,
      updateValidatorDto,
    );
  }

  // Eliminar el miembro validador
  @Delete()
  @ApiOperation({
    summary: 'Eliminar validador de cuenta bancaria',
    description: 'Elimina el miembro validador de cuenta bancaria de una solicitud.',
  })
  @ApiParam({ name: 'requestId', type: Number, description: 'ID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Validador eliminado exitosamente' })
  deleteValidator(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.requestsService.deleteBankAccountValidator(requestId);
  }
}

