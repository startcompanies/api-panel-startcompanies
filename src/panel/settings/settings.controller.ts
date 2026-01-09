import {
  Controller,
  Get,
  Patch,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
// UpdateUserPreferencesDto y UpdateProcessConfigDto ya no se usan - el frontend usa localStorage
import { AuthGuard } from '../../shared/auth/auth.guard';
import {
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Panel - Settings')
@ApiBearerAuth('JWT-auth')
@Controller('panel/settings')
@UseGuards(AuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // Endpoints de UserPreferences y ProcessConfig eliminados - no se usan desde el frontend
  // El frontend guarda estas configuraciones en localStorage
}

