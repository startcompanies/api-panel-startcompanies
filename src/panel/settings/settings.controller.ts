import {
  Controller,
  Get,
  Patch,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateUserPreferencesDto } from './dtos/update-user-preferences.dto';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Panel - Settings')
@ApiBearerAuth('JWT-auth')
@Controller('panel/settings')
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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
}

