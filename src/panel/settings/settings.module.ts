import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPreferences } from './entities/user-preferences.entity';
import { ProcessConfig } from './entities/process-config.entity';
import { User } from '../../shared/user/entities/user.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserPreferences, ProcessConfig, User])],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

