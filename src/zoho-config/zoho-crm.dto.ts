import { IsString, IsOptional, IsArray, IsObject, ValidateNested, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRecordDto {
  @IsString()
  @ApiProperty({ description: 'Nombre del módulo en Zoho CRM (ej: Leads, Contacts, Deals)' })
  module: string;

  @ApiProperty({ description: 'Array de registros a crear (máximo 100) o un objeto único que se convertirá a array' })
  data: Record<string, any>[] | Record<string, any>;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Organización/cliente (por defecto: startcompanies)' })
  org?: string;
}

export class UpdateRecordDto {
  @IsString()
  @ApiProperty({ description: 'Nombre del módulo en Zoho CRM' })
  module: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'ID del registro a actualizar (opcional si data es array con ids)' })
  recordId?: string;

  @ApiProperty({ description: 'Array de registros a actualizar (cada uno debe tener id) o un objeto único. Si se proporciona recordId, puede ser un objeto sin id' })
  data: Array<{ id: string; [key: string]: any }> | Record<string, any>;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Organización/cliente (por defecto: startcompanies)' })
  org?: string;
}

export class GetRecordsDto {
  @IsString()
  @ApiProperty({ description: 'Nombre del módulo en Zoho CRM' })
  module: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Campos a obtener (separados por comas, máximo 50)' })
  fields?: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Número de página (por defecto 1)' })
  page?: number;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Registros por página (máximo 200, por defecto 200)' })
  per_page?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Token de paginación para más de 2000 registros' })
  page_token?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Orden de clasificación (asc o desc)' })
  sort_order?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Campo por el cual ordenar (id, Created_Time, Modified_Time)' })
  sort_by?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'IDs específicos de registros (separados por comas)' })
  ids?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Organización/cliente (por defecto: startcompanies)' })
  org?: string;
}

export class GetRecordByIdDto {
  @IsString()
  @ApiProperty({ description: 'Nombre del módulo en Zoho CRM' })
  module: string;

  @IsString()
  @ApiProperty({ description: 'ID del registro' })
  recordId: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Organización/cliente (por defecto: startcompanies)' })
  org?: string;
}

export class CoqlQueryDto {
  @IsString()
  @ApiProperty({ description: 'Query COQL a ejecutar' })
  select_query: string;

  @IsOptional()
  @IsArray()
  @ApiPropertyOptional({ description: 'Metadata a incluir (ej: ["fields"])' })
  include_meta?: string[];

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Organización/cliente (por defecto: startcompanies)' })
  org?: string;
}

export class SearchRecordsDto {
  @IsString()
  @ApiProperty({ description: 'Nombre del módulo en Zoho CRM' })
  module: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Criterios de búsqueda (formato: ((field:operator:value) and/or (field:operator:value)))' })
  criteria?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Buscar por email' })
  email?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Buscar por teléfono' })
  phone?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Buscar por palabra' })
  word?: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Número de página' })
  page?: number;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Registros por página (máximo 200)' })
  per_page?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Organización/cliente (por defecto: startcompanies)' })
  org?: string;
}

export class UpsertRecordDto {
  @IsString()
  @ApiProperty({ description: 'Nombre del módulo en Zoho CRM' })
  module: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object)
  @ApiProperty({ description: 'Array de registros a crear/actualizar (máximo 100)' })
  data: Record<string, any>[];

  @IsOptional()
  @IsArray()
  @ApiPropertyOptional({ description: 'Campos para verificar duplicados' })
  duplicate_check_fields?: string[];

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Organización/cliente (por defecto: startcompanies)' })
  org?: string;
}







