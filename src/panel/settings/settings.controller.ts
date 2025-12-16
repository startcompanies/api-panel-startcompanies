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
import { UpdateProcessConfigDto } from './dtos/update-process-config.dto';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Panel - Settings')
@Controller('panel/settings')
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // Obtener preferencias del usuario actual
  @Get('preferences')
  getUserPreferences(@Req() req: any) {
    const userId = req.user.id;
    return this.settingsService.getUserPreferences(userId);
  }

  // Actualizar preferencias del usuario actual
  @Patch('preferences')
  updateUserPreferences(
    @Req() req: any,
    @Body() updateDto: UpdateUserPreferencesDto,
  ) {
    const userId = req.user.id;
    return this.settingsService.updateUserPreferences(userId, updateDto);
  }

  // Obtener configuración de procesos (admin)
  @Get('process-config')
  getProcessConfig() {
    return this.settingsService.getProcessConfig();
  }

  // Actualizar configuración de procesos (admin)
  @Patch('process-config')
  updateProcessConfig(@Body() updateDto: UpdateProcessConfigDto) {
    return this.settingsService.updateProcessConfig(updateDto);
  }
}

