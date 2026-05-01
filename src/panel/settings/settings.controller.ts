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

@ApiTags('Panel - Settings')
@ApiBearerAuth('JWT-auth')
@Controller('panel/settings')
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly userAiCredentials: UserAiCredentialsService,
  ) {}

  @Get('preferences')
  @ApiOperation({ summary: 'Obtener preferencias del usuario (idioma, tema, etc.)' })
  getPreferences(@Req() req: { user: { id: number } }) {
    return this.settingsService.getPreferences(req.user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Actualizar preferencias del usuario (idioma, tema, etc.)' })
  updatePreferences(
    @Req() req: { user: { id: number } },
    @Body() dto: UpdateUserPreferencesDto,
  ) {
    return this.settingsService.updatePreferences(req.user.id, dto);
  }

  @Get('ai-credentials')
  @ApiOperation({
    summary: 'Estado de credenciales IA (Anthropic/OpenAI) para contabilidad',
    description: 'No devuelve la API key; solo proveedor, si hay clave guardada y últimos 4 caracteres.',
  })
  getAiCredentials(@Req() req: { user: { id: number } }) {
    return this.userAiCredentials.getStatus(req.user.id);
  }

  @Put('ai-credentials')
  @ApiOperation({ summary: 'Guardar o actualizar API key de Anthropic u OpenAI (cifrada en servidor)' })
  putAiCredentials(@Req() req: { user: { id: number } }, @Body() dto: PutUserAiCredentialsDto) {
    return this.userAiCredentials.upsert(req.user.id, dto.provider, dto.apiKey);
  }

  @Delete('ai-credentials')
  @ApiOperation({ summary: 'Eliminar credenciales IA guardadas' })
  async deleteAiCredentials(@Req() req: { user: { id: number } }) {
    await this.userAiCredentials.remove(req.user.id);
    return { ok: true };
  }

  @Get('company')
  @UseGuards(RolesGuard)
  @Roles('client')
  @ApiOperation({ summary: 'Perfil de empresa del cliente (emisor en facturas)' })
  getCompany(@Req() req: { user: { id: number } }) {
    return this.settingsService.getCompanyProfile(req.user.id);
  }

  @Patch('company')
  @UseGuards(RolesGuard)
  @Roles('client')
  @ApiOperation({ summary: 'Actualizar perfil de empresa del cliente' })
  updateCompany(
    @Req() req: { user: { id: number } },
    @Body() dto: UpdateClientCompanyProfileDto,
  ) {
    return this.settingsService.updateCompanyProfile(req.user.id, dto);
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
    @Req() req: { user: { id: number } },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Campo file requerido (multipart/form-data)');
    }
    return this.settingsService.uploadCompanyLogo(req.user.id, file);
  }

  @Delete('company/logo')
  @UseGuards(RolesGuard)
  @Roles('client')
  @ApiOperation({ summary: 'Quitar logo de empresa' })
  removeCompanyLogo(@Req() req: { user: { id: number } }) {
    return this.settingsService.clearCompanyLogo(req.user.id);
  }
}

