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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('Panel - Settings')
@ApiBearerAuth('JWT-auth')
@Controller('panel/settings')
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // Obtener preferencias del usuario actual
  @Get('preferences')
  @ApiOperation({
    summary: 'Obtener preferencias del usuario',
    description: 'Obtiene las preferencias del usuario autenticado.',
  })
  @ApiResponse({ status: 200, description: 'Preferencias del usuario' })
  getUserPreferences(@Req() req: any) {
    const userId = req.user.id;
    return this.settingsService.getUserPreferences(userId);
  }

  // Actualizar preferencias del usuario actual
  @Patch('preferences')
  @ApiOperation({
    summary: 'Actualizar preferencias del usuario',
    description: 'Actualiza las preferencias del usuario autenticado.',
  })
  @ApiBody({ type: UpdateUserPreferencesDto })
  @ApiResponse({ status: 200, description: 'Preferencias actualizadas exitosamente' })
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
  @ApiOperation({
    summary: 'Actualizar configuración de procesos',
    description: 'Actualiza la configuración de procesos del sistema.',
  })
  @ApiBody({ type: UpdateProcessConfigDto })
  @ApiResponse({ status: 200, description: 'Configuración actualizada exitosamente' })
  updateProcessConfig(@Body() updateDto: UpdateProcessConfigDto) {
    return this.settingsService.updateProcessConfig(updateDto);
  }
}

