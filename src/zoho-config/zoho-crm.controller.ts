import {
  Controller,
  Get,
  Post,
  Put,
  Query,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ZohoCrmService } from './zoho-crm.service';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import {
  CreateRecordDto,
  UpdateRecordDto,
  GetRecordsDto,
  GetRecordByIdDto,
  CoqlQueryDto,
  SearchRecordsDto,
  UpsertRecordDto,
} from './zoho-crm.dto';
import { AuthGuard } from 'src/shared/auth/auth.guard';
import { RolesGuard } from 'src/shared/auth/roles.guard';
import { Roles } from 'src/shared/auth/roles.decorator';

@ApiTags('Zoho CRM')
@Controller('zoho-crm')
export class ZohoCrmController {
  constructor(private readonly zohoCrmService: ZohoCrmService) {}

  @Post('create')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Crear uno o más registros en un módulo (solo admin)' })
  @ApiBody({ type: CreateRecordDto })
  createRecords(@Body() createRecordDto: CreateRecordDto) {
    const { module, data } = createRecordDto;
    // Convertir data a array si es un objeto único
    const dataArray = Array.isArray(data) ? data : [data];
    return this.zohoCrmService.createRecords(module, dataArray, createRecordDto.org);
  }

  @Put('update')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Actualizar uno o más registros en un módulo (solo admin)' })
  @ApiBody({ type: UpdateRecordDto })
  updateRecords(@Body() updateRecordDto: UpdateRecordDto) {
    const { module, recordId, data } = updateRecordDto;
    // Si se proporciona recordId, actualizar un solo registro
    if (recordId) {
      const singleData = Array.isArray(data) ? data[0] : data;
      return this.zohoCrmService.updateRecords(module, [{ id: recordId, ...singleData }], updateRecordDto.org);
    }
    // Si data es un array, actualizar múltiples registros
    const dataArray = Array.isArray(data) ? data : [{ id: (data as any).id, ...data }];
    return this.zohoCrmService.updateRecords(module, dataArray, updateRecordDto.org);
  }

  @Get('records')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener lista de registros de un módulo (solo admin)' })
  @ApiQuery({ name: 'module', required: true, description: 'Nombre del módulo (ej: Leads, Contacts)' })
  @ApiQuery({ name: 'fields', required: false, description: 'Campos a obtener (separados por comas)' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página' })
  @ApiQuery({ name: 'per_page', required: false, description: 'Registros por página (máx 200)' })
  @ApiQuery({ name: 'page_token', required: false, description: 'Token de paginación' })
  @ApiQuery({ name: 'sort_order', required: false, description: 'Orden (asc o desc)' })
  @ApiQuery({ name: 'sort_by', required: false, description: 'Campo por el cual ordenar' })
  @ApiQuery({ name: 'ids', required: false, description: 'IDs específicos (separados por comas)' })
  @ApiQuery({ name: 'org', required: false, description: 'Organización/cliente' })
  getRecords(
    @Query('module') module: string,
    @Query('fields') fields?: string,
    @Query('page') page?: string,
    @Query('per_page') per_page?: string,
    @Query('page_token') page_token?: string,
    @Query('sort_order') sort_order?: string,
    @Query('sort_by') sort_by?: string,
    @Query('ids') ids?: string,
    @Query('org') org?: string,
  ) {
    const options: any = {};
    if (fields) options.fields = fields;
    if (page) options.page = parseInt(page, 10);
    if (per_page) options.per_page = parseInt(per_page, 10);
    if (page_token) options.page_token = page_token;
    if (sort_order) options.sort_order = sort_order;
    if (sort_by) options.sort_by = sort_by;
    if (ids) options.ids = ids;

    return this.zohoCrmService.getRecords(module, options, org);
  }

  @Get('records/:module/:recordId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener un registro específico por ID (solo admin)' })
  getRecordById(
    @Param('module') module: string,
    @Param('recordId') recordId: string,
    @Query('org') org?: string,
  ) {
    return this.zohoCrmService.getRecordById(module, recordId, org);
  }

  @Post('coql')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Ejecutar consulta COQL (solo admin)' })
  @ApiBody({ type: CoqlQueryDto })
  queryWithCoql(@Body() coqlQueryDto: CoqlQueryDto) {
    return this.zohoCrmService.queryWithCoql(
      coqlQueryDto.select_query,
      coqlQueryDto.include_meta,
      coqlQueryDto.org,
    );
  }

  @Get('search')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Buscar registros en un módulo (solo admin)' })
  @ApiQuery({ name: 'module', required: true, description: 'Nombre del módulo' })
  @ApiQuery({ name: 'criteria', required: false, description: 'Criterios de búsqueda' })
  @ApiQuery({ name: 'email', required: false, description: 'Buscar por email' })
  @ApiQuery({ name: 'phone', required: false, description: 'Buscar por teléfono' })
  @ApiQuery({ name: 'word', required: false, description: 'Buscar por palabra' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página' })
  @ApiQuery({ name: 'per_page', required: false, description: 'Registros por página' })
  @ApiQuery({ name: 'org', required: false, description: 'Organización/cliente' })
  searchRecords(
    @Query('module') module: string,
    @Query('criteria') criteria?: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('word') word?: string,
    @Query('page') page?: string,
    @Query('per_page') per_page?: string,
    @Query('org') org?: string,
  ) {
    const options: any = {};
    if (criteria) options.criteria = criteria;
    if (email) options.email = email;
    if (phone) options.phone = phone;
    if (word) options.word = word;
    if (page) options.page = parseInt(page, 10);
    if (per_page) options.per_page = parseInt(per_page, 10);

    return this.zohoCrmService.searchRecords(module, options, org);
  }

  @Post('upsert')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Crear o actualizar registros (upsert) (solo admin)' })
  @ApiBody({ type: UpsertRecordDto })
  upsertRecords(@Body() upsertRecordDto: UpsertRecordDto) {
    return this.zohoCrmService.upsertRecords(
      upsertRecordDto.module,
      upsertRecordDto.data,
      upsertRecordDto.duplicate_check_fields,
      upsertRecordDto.org,
    );
  }
}





