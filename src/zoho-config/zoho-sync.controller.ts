import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
  Headers,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ZohoSyncService } from './zoho-sync.service';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import {
  SyncRequestToZohoDto,
  SyncMultipleRequestsDto,
  SyncFromZohoDto,
  ZohoCrmRequestStageWebhookDto,
} from './zoho-sync.dto';
import { AuthGuard } from 'src/shared/auth/auth.guard';
import { RolesGuard } from 'src/shared/auth/roles.guard';
import { Roles } from 'src/shared/auth/roles.decorator';

/** Header enviado por Zoho (workflow) para autenticar el webhook sin JWT admin. */
const ZOHO_SYNC_SECRET_HEADER = 'x-zoho-sync-secret';

@ApiTags('Zoho Sync')
@Controller('zoho-sync')
export class ZohoSyncController {
  constructor(
    private readonly zohoSyncService: ZohoSyncService,
    private readonly configService: ConfigService,
  ) {}

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

  @Get('import/accounts-stream')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Importar Accounts con eventos de progreso (NDJSON: progress por línea, luego done o error)',
  })
  @ApiQuery({ name: 'org', required: false, description: 'Organización/cliente' })
  @ApiQuery({ name: 'limit', required: false, description: 'Límite de registros (máx 200)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset para paginación' })
  async importAccountsStream(
    @Res({ passthrough: false }) res: Response,
    @Query('org') org?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    const writeLine = (obj: object) => {
      res.write(`${JSON.stringify(obj)}\n`);
    };
    try {
      const limitNumber = limit ? parseInt(limit, 10) : 200;
      const offsetNumber = offset ? parseInt(offset, 10) : 0;
      const result = await this.zohoSyncService.importAccountsFromZoho(
        org,
        limitNumber,
        offsetNumber,
        (evt) => {
          writeLine({ type: 'progress', data: evt });
        },
      );
      writeLine({ type: 'done', payload: result });
    } catch (e: any) {
      const message = e?.message || 'Error al importar Accounts';
      writeLine({ type: 'error', message });
    }
    res.end();
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

  /**
   * Webhook pensado para ser llamado desde Zoho CRM (Workflow / función Deluge)
   * cuando cambia el Stage del Deal u otro evento: actualiza Request en BD
   * leyendo el estado actual en Zoho (misma lógica que stage-sync admin).
   *
   * Requiere env: ZOHOCRM_REQUEST_SYNC_WEBHOOK_SECRET y header X-Zoho-Sync-Secret.
   */
  @Post('webhooks/crm/request-stage-sync')
  @ApiOperation({
    summary:
      'Webhook: Zoho CRM → actualizar Request (stage, status, workDrive) desde Deals + Account',
    description:
      'Sin JWT. Autenticación con header X-Zoho-Sync-Secret igual a ZOHOCRM_REQUEST_SYNC_WEBHOOK_SECRET. ' +
      'Configurar en Zoho un workflow (p. ej. al editar Deal) que POSTee JSON con zohoAccountId del Account.',
  })
  @ApiHeader({
    name: ZOHO_SYNC_SECRET_HEADER,
    description: 'Debe coincidir con la variable de entorno ZOHOCRM_REQUEST_SYNC_WEBHOOK_SECRET',
    required: true,
  })
  @ApiBody({ type: ZohoCrmRequestStageWebhookDto })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  webhookCrmRequestStageSync(
    @Headers(ZOHO_SYNC_SECRET_HEADER) secret: string | undefined,
    @Body() body: ZohoCrmRequestStageWebhookDto,
  ) {
    const expected = this.configService.get<string>('ZOHOCRM_REQUEST_SYNC_WEBHOOK_SECRET');
    if (!expected || !secret || secret !== expected) {
      throw new UnauthorizedException('Webhook: secreto inválido o no configurado');
    }
    return this.zohoSyncService.syncStageStatusAndWorkdriveByAccountId(
      body.zohoAccountId,
      body.org,
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

  @Post('import/deal-timeline')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Importar Deals a la tabla de historial del portal (una fila por Deal; no modifica Requests)',
  })
  @ApiQuery({ name: 'org', required: false, description: 'Organización/cliente' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Registros por página COQL (máx. recomendado 200)',
  })
  @ApiQuery({
    name: 'maxPages',
    required: false,
    description: 'Máximo de páginas a recorrer (omitir para todas)',
  })
  importDealTimeline(
    @Query('org') org?: string,
    @Query('limit') limit?: string,
    @Query('maxPages') maxPages?: string,
  ) {
    const limitPerPage = limit ? parseInt(limit, 10) : 200;
    const maxPagesNum =
      maxPages !== undefined && maxPages !== ''
        ? parseInt(maxPages, 10)
        : undefined;
    return this.zohoSyncService.importDealTimelineFromZoho(
      org,
      limitPerPage,
      Number.isFinite(maxPagesNum as number) ? maxPagesNum : undefined,
    );
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

  @Post('import/full-sync-stream')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Sincronización completa con eventos de progreso (NDJSON: progress por línea, luego done o error)',
  })
  @ApiQuery({ name: 'org', required: false, description: 'Organización/cliente' })
  async fullSyncStream(
    @Res({ passthrough: false }) res: Response,
    @Query('org') org?: string,
  ) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    const writeLine = (obj: object) => {
      res.write(`${JSON.stringify(obj)}\n`);
    };
    try {
      const result = await this.zohoSyncService.fullSyncFromZoho(
        org,
        200,
        200,
        (evt) => {
          writeLine({ type: 'progress', data: evt });
        },
      );
      writeLine({ type: 'done', payload: result });
    } catch (e: any) {
      const message = e?.message || 'Error en sincronización completa';
      writeLine({ type: 'error', message });
    }
    res.end();
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








