import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ZohoSyncService } from './zoho-sync.service';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import {
  SyncRequestToZohoDto,
  SyncMultipleRequestsDto,
  SyncFromZohoDto,
} from './zoho-sync.dto';
import { AuthGuard } from 'src/shared/auth/auth.guard';
import { RolesGuard } from 'src/shared/auth/roles.guard';
import { Roles } from 'src/shared/auth/roles.decorator';

@ApiTags('Zoho Sync')
@Controller('zoho-sync')
export class ZohoSyncController {
  constructor(private readonly zohoSyncService: ZohoSyncService) {}

  @Post('sync-request')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Sincronizar una solicitud completa a Zoho CRM (solo admin)' })
  @ApiBody({ type: SyncRequestToZohoDto })
  syncRequestToZoho(@Body() syncDto: SyncRequestToZohoDto) {
    return this.zohoSyncService.syncRequestToZoho(
      syncDto.requestId,
      syncDto.org,
    );
  }

  @Post('sync-multiple-requests')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Sincronizar múltiples solicitudes a Zoho CRM (solo admin)' })
  @ApiBody({ type: SyncMultipleRequestsDto })
  syncMultipleRequests(@Body() syncDto: SyncMultipleRequestsDto) {
    return this.zohoSyncService.syncMultipleRequestsToZoho(
      syncDto.requestIds,
      syncDto.org,
    );
  }

  @Get('import/accounts')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Importar Accounts desde Zoho CRM al panel admin (solo admin)' })
  @ApiQuery({ name: 'org', required: false, description: 'Organización/cliente' })
  @ApiQuery({ name: 'limit', required: false, description: 'Límite de registros (máx 200)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset para paginación' })
  importAccounts(
    @Query('org') org?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNumber = limit ? parseInt(limit, 10) : 200;
    const offsetNumber = offset ? parseInt(offset, 10) : 0;
    return this.zohoSyncService.importAccountsFromZoho(org, limitNumber, offsetNumber);
  }

  @Post('import/account/:accountId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Importar un Account específico desde Zoho CRM (solo admin)' })
  importAccountById(
    @Param('accountId') accountId: string,
    @Query('org') org?: string,
  ) {
    return this.zohoSyncService.importAccountById(accountId, org);
  }

  @Post('import/account/:zohoAccountId/stage-sync')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Actualizar stage, status y workDriveUrlExternal desde Zoho (Deals + Account) por zohoAccountId (solo admin)',
  })
  @ApiQuery({ name: 'org', required: false, description: 'Organización/cliente' })
  syncStageStatusAndWorkdriveByAccountId(
    @Param('zohoAccountId') zohoAccountId: string,
    @Query('org') org?: string,
  ) {
    return this.zohoSyncService.syncStageStatusAndWorkdriveByAccountId(
      zohoAccountId,
      org,
    );
  }

  @Get('import/deals')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Importar Deals desde Zoho CRM y actualizar status de Requests (solo admin)' })
  @ApiQuery({ name: 'org', required: false, description: 'Organización/cliente' })
  @ApiQuery({ name: 'limit', required: false, description: 'Límite de registros (máx 200)' })
  importDeals(
    @Query('org') org?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNumber = limit ? parseInt(limit, 10) : 200;
    return this.zohoSyncService.importDealsFromZoho(org, limitNumber);
  }

  @Post('import/full-sync')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Sincronización completa: importa Accounts (incluye contactos y deals automáticamente) (solo admin)' })
  @ApiQuery({ name: 'org', required: false, description: 'Organización/cliente' })
  @ApiQuery({ name: 'accountsLimit', required: false, description: 'Límite de Accounts' })
  @ApiQuery({ name: 'dealsLimit', required: false, description: 'Deprecated: Los deals se procesan automáticamente con cada Account' })
  fullSync(
    @Query('org') org?: string,
    @Query('accountsLimit') accountsLimit?: string,
    @Query('dealsLimit') dealsLimit?: string,
  ) {
    const accountsLimitNumber = accountsLimit ? parseInt(accountsLimit, 10) : 200;
    const dealsLimitNumber = dealsLimit ? parseInt(dealsLimit, 10) : 200;
    return this.zohoSyncService.fullSyncFromZoho(org, accountsLimitNumber, dealsLimitNumber);
  }

  @Post('sync-request/:requestId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Sincronizar una solicitud por ID a Zoho CRM (solo admin)' })
  syncRequestById(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Query('org') org?: string,
  ) {
    return this.zohoSyncService.syncRequestToZoho(requestId, org);
  }
}








