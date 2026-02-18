import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
// UserPreferences y ProcessConfig ya no se usan - el frontend usa localStorage
import { User } from '../../shared/user/entities/user.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])], // UserPreferences y ProcessConfig eliminados
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

