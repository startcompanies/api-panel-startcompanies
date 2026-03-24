import { IsString, IsOptional, IsNumber, IsArray, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncRequestToZohoDto {
  @IsNumber()
  @ApiProperty({ description: 'ID de la solicitud a sincronizar' })
  requestId: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Organización/cliente (por defecto: startcompanies)' })
  org?: string;
}

export class SyncMultipleRequestsDto {
  @IsArray()
  @IsNumber({}, { each: true })
  @ApiProperty({ description: 'Array de IDs de solicitudes a sincronizar' })
  requestIds: number[];

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Organización/cliente (por defecto: startcompanies)' })
  org?: string;
}

export class SyncFromZohoDto {
  @IsEnum(['Accounts', 'Contacts', 'Deals'])
  @ApiProperty({ description: 'Módulo de Zoho a sincronizar', enum: ['Accounts', 'Contacts', 'Deals'] })
  module: 'Accounts' | 'Contacts' | 'Deals';

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Organización/cliente (por defecto: startcompanies)' })
  org?: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Límite de registros a sincronizar (por defecto: 200)' })
  limit?: number;
}

/**
 * Payload para webhook desde Zoho CRM (workflow / función Deluge) que dispara
 * la actualización de Request en BD leyendo Deals + Account en Zoho.
 */
export class ZohoCrmRequestStageWebhookDto {
  @IsString()
  @ApiProperty({
    description: 'ID del Account en Zoho CRM (mismo valor guardado en Request.zohoAccountId)',
  })
  zohoAccountId: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Organización/cliente Zoho (por defecto: startcompanies)' })
  org?: string;
}

/** Metadatos opcionales cuando el import ocurre dentro de un lote de sync completo */
export interface ZohoImportFullSyncMeta {
  batchIndex: number;
  batchOffset: number;
  estimatedTotal?: number;
}

export type ZohoImportAccountsProgressEvent =
  | {
      phase: 'count';
      totalAccounts: number;
    }
  | {
      phase: 'prefetch_list';
      accumulated: number;
    }
  | {
      phase: 'list_ready';
      totalAccounts: number;
    }
  | {
      phase: 'coql';
      pageTotal: number;
      offset: number;
      limit: number;
      fullSync?: ZohoImportFullSyncMeta;
    }
  | {
      phase: 'fetch_detail' | 'import';
      current: number;
      total: number;
      accountId: string;
      accountName?: string;
      fullSync?: ZohoImportFullSyncMeta;
    };

export type ZohoImportAccountsNdjsonLine =
  | { type: 'progress'; data: ZohoImportAccountsProgressEvent }
  | { type: 'done'; payload: unknown }
  | { type: 'error'; message: string };




