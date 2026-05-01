import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadFileModule } from '../../shared/upload-file/upload-file.module';
import { User } from '../../shared/user/entities/user.entity';
import { UserPreferences } from './entities/user-preferences.entity';
import { ClientCompanyProfile } from './entities/client-company-profile.entity';
import { UserAiCredential } from './entities/user-ai-credential.entity';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { UserSecretEncryptionService } from '../../shared/common/services/user-secret-encryption.service';
import { UserAiCredentialsService } from './user-ai-credentials.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserPreferences, ClientCompanyProfile, UserAiCredential]),
    UploadFileModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService, UserSecretEncryptionService, UserAiCredentialsService, RolesGuard],
  exports: [SettingsService, UserAiCredentialsService],
})
export class SettingsModule {}

