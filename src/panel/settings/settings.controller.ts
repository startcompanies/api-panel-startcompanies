import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SettingsService } from './settings.service';
import { UserAiCredentialsService } from './user-ai-credentials.service';
import { PutUserAiCredentialsDto } from './dtos/put-user-ai-credentials.dto';
import { UpdateUserPreferencesDto } from './dtos/update-user-preferences.dto';
import { UpdateClientCompanyProfileDto } from './dtos/update-client-company-profile.dto';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  TeamContextService,
  type SessionUserPayload,
} from '../account-team/team-context.service';

@ApiTags('Panel - Settings')
@ApiBearerAuth('JWT-auth')
@Controller('panel/settings')
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly userAiCredentials: UserAiCredentialsService,
    private readonly teamContext: TeamContextService,
  ) {}

  private ownerId(req: { user: SessionUserPayload }): number {
    return this.teamContext.getEffectiveOwnerId(req.user);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Obtener preferencias del usuario (idioma, tema, etc.)' })
  getPreferences(@Req() req: { user: SessionUserPayload }) {
    this.teamContext.requirePermission(req.user, 'preferencesView');
    return this.settingsService.getPreferences(this.ownerId(req));
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Actualizar preferencias del usuario (idioma, tema, etc.)' })
  updatePreferences(
    @Req() req: { user: SessionUserPayload },
    @Body() dto: UpdateUserPreferencesDto,
  ) {
    this.teamContext.requirePermission(req.user, 'preferencesEdit');
    return this.settingsService.updatePreferences(this.ownerId(req), dto);
  }

  @Get('ai-credentials')
  @ApiOperation({
    summary: 'Estado de credenciales IA (Anthropic/OpenAI) para contabilidad',
    description: 'No devuelve la API key; solo proveedor, si hay clave guardada y últimos 4 caracteres.',
  })
  getAiCredentials(@Req() req: { user: SessionUserPayload }) {
    this.teamContext.requirePermission(req.user, 'aiView');
    return this.userAiCredentials.getStatus(this.ownerId(req));
  }

  @Put('ai-credentials')
  @ApiOperation({ summary: 'Guardar o actualizar API key de Anthropic u OpenAI (cifrada en servidor)' })
  putAiCredentials(
    @Req() req: { user: SessionUserPayload },
    @Body() dto: PutUserAiCredentialsDto,
  ) {
    this.teamContext.requirePermission(req.user, 'aiEdit');
    return this.userAiCredentials.upsert(this.ownerId(req), dto.provider, dto.apiKey);
  }

  @Delete('ai-credentials')
  @ApiOperation({ summary: 'Eliminar credenciales IA guardadas' })
  async deleteAiCredentials(@Req() req: { user: SessionUserPayload }) {
    this.teamContext.requirePermission(req.user, 'aiEdit');
    await this.userAiCredentials.remove(this.ownerId(req));
    return { ok: true };
  }

  @Get('company')
  @UseGuards(RolesGuard)
  @Roles('client')
  @ApiOperation({ summary: 'Perfil de empresa del cliente (emisor en facturas)' })
  getCompany(@Req() req: { user: SessionUserPayload }) {
    this.teamContext.requirePermission(req.user, 'companyView');
    return this.settingsService.getCompanyProfile(this.ownerId(req));
  }

  @Patch('company')
  @UseGuards(RolesGuard)
  @Roles('client')
  @ApiOperation({ summary: 'Actualizar perfil de empresa del cliente' })
  updateCompany(
    @Req() req: { user: SessionUserPayload },
    @Body() dto: UpdateClientCompanyProfileDto,
  ) {
    this.teamContext.requirePermission(req.user, 'companyEdit');
    return this.settingsService.updateCompanyProfile(this.ownerId(req), dto);
  }

  @Post('company/logo')
  @UseGuards(RolesGuard)
  @Roles('client')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: 'Subir logo de empresa',
    description: 'Sube una imagen y actualiza el logo del perfil de empresa.',
  })
  uploadCompanyLogo(
    @Req() req: { user: SessionUserPayload },
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.teamContext.requirePermission(req.user, 'companyEdit');
    if (!file) {
      throw new BadRequestException('Campo file requerido (multipart/form-data)');
    }
    return this.settingsService.uploadCompanyLogo(this.ownerId(req), file);
  }

  @Delete('company/logo')
  @UseGuards(RolesGuard)
  @Roles('client')
  @ApiOperation({ summary: 'Quitar logo de empresa' })
  removeCompanyLogo(@Req() req: { user: SessionUserPayload }) {
    this.teamContext.requirePermission(req.user, 'companyEdit');
    return this.settingsService.clearCompanyLogo(this.ownerId(req));
  }
}
