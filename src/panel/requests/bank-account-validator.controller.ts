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
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Panel - Requests')
@Controller('panel/requests/:requestId/bank-account-validator')
@UseGuards(AuthGuard)
export class BankAccountValidatorController {
  constructor(private readonly requestsService: RequestsService) {}

  // Obtener el miembro validador de una solicitud
  @Get()
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
  deleteValidator(@Param('requestId', ParseIntPipe) requestId: number) {
    return this.requestsService.deleteBankAccountValidator(requestId);
  }
}

