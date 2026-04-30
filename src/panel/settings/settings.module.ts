import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadFileModule } from '../../shared/upload-file/upload-file.module';
import { User } from '../../shared/user/entities/user.entity';
import { UserPreferences } from './entities/user-preferences.entity';
import { ClientCompanyProfile } from './entities/client-company-profile.entity';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserPreferences, ClientCompanyProfile]),
    UploadFileModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService, RolesGuard],
  exports: [SettingsService],
})
export class SettingsModule {}

