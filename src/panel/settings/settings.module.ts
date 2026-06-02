import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadFileModule } from '../../shared/upload-file/upload-file.module';
import { User } from '../../shared/user/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { UserPreferences } from './entities/user-preferences.entity';
import { ClientCompanyProfile } from './entities/client-company-profile.entity';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { PlatformAiService } from './platform-ai.service';
import { AccountTeamModule } from '../account-team/account-team.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User, Client, UserPreferences, ClientCompanyProfile]),
    UploadFileModule,
    AccountTeamModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService, PlatformAiService, RolesGuard],
  exports: [SettingsService, PlatformAiService],
})
export class SettingsModule {}
