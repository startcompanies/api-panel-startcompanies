import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { PartnerTenantsService } from './partner-tenants.service';
import { UpdatePartnerTenantDto } from './dtos/update-partner-tenant.dto';
import { PartnerTenantPanelDto } from './dtos/partner-tenant-panel.dto';
import {
  TeamContextService,
  type SessionUserPayload,
} from '../account-team/team-context.service';

type LogoAssetKind = 'logo' | 'logo-dark' | 'favicon';

@ApiTags('Panel - Partner brand')
@ApiBearerAuth('JWT-auth')
@Controller('panel/partner-tenants')
@UseGuards(AuthGuard, RolesGuard)
export class PanelPartnerTenantsController {
  constructor(
    private readonly partnerTenantsService: PartnerTenantsService,
    private readonly teamContext: TeamContextService,
  ) {}

  private ownerId(req: { user: SessionUserPayload }): number {
    return this.teamContext.getEffectiveOwnerId(req.user);
  }

  @Get('me')
  @Roles('partner')
  @ApiOperation({ summary: 'Configuración de marca del partner autenticado' })
  getMyTenant(@Req() req: { user: SessionUserPayload }): Promise<PartnerTenantPanelDto | null> {
    this.teamContext.requirePermission(req.user, 'brandView');
    return this.partnerTenantsService.getPanelByPartnerId(this.ownerId(req));
  }

  @Put('me')
  @Roles('partner')
  @ApiOperation({
    summary: 'Crear o actualizar marca del partner autenticado',
    description: 'Primera vez crea la fila en partner_tenants.',
  })
  upsertMyTenant(
    @Req() req: { user: SessionUserPayload },
    @Body() dto: UpdatePartnerTenantDto,
  ): Promise<PartnerTenantPanelDto> {
    this.teamContext.requirePermission(req.user, 'brandEdit');
    return this.partnerTenantsService.upsertForPartner(this.ownerId(req), dto);
  }

  @Post('me/assets/:kind')
  @Roles('partner')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'kind', enum: ['logo', 'logo-dark', 'favicon'] })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  uploadMyAsset(
    @Req() req: { user: SessionUserPayload },
    @Param('kind') kind: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<PartnerTenantPanelDto> {
    this.teamContext.requirePermission(req.user, 'brandEdit');
    if (!file) {
      throw new BadRequestException('Campo file requerido (multipart/form-data)');
    }
    return this.partnerTenantsService.uploadBrandAsset(
      this.ownerId(req),
      this.parseAssetKind(kind),
      file,
    );
  }

  @Get('by-partner/:partnerId')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Marca de un partner (admin/staff)' })
  getByPartnerId(
    @Param('partnerId', ParseIntPipe) partnerId: number,
  ): Promise<PartnerTenantPanelDto | null> {
    return this.partnerTenantsService.getPanelByPartnerId(partnerId);
  }

  @Put('by-partner/:partnerId')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Crear o actualizar marca de un partner (admin/staff)' })
  upsertByPartnerId(
    @Param('partnerId', ParseIntPipe) partnerId: number,
    @Body() dto: UpdatePartnerTenantDto,
  ): Promise<PartnerTenantPanelDto> {
    return this.partnerTenantsService.upsertForPartner(partnerId, dto, {
      allowAdminFields: true,
    });
  }

  @Post('by-partner/:partnerId/assets/:kind')
  @Roles('admin', 'user')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'kind', enum: ['logo', 'logo-dark', 'favicon'] })
  uploadByPartnerId(
    @Param('partnerId', ParseIntPipe) partnerId: number,
    @Param('kind') kind: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<PartnerTenantPanelDto> {
    if (!file) {
      throw new BadRequestException('Campo file requerido (multipart/form-data)');
    }
    return this.partnerTenantsService.uploadBrandAsset(
      partnerId,
      this.parseAssetKind(kind),
      file,
    );
  }

  private parseAssetKind(raw: string): LogoAssetKind {
    if (raw === 'logo' || raw === 'logo-dark' || raw === 'favicon') {
      return raw;
    }
    throw new BadRequestException('kind debe ser logo, logo-dark o favicon');
  }
}
