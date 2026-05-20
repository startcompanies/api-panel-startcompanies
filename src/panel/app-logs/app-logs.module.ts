import { Module } from '@nestjs/common';
import { AppLogsController } from './app-logs.controller';
import { AppLogsService } from './app-logs.service';
import { AuthModule } from '../../shared/auth/auth.module';
import { CommonModule } from '../../shared/common/common.module';

@Module({
  imports: [AuthModule, CommonModule],
  controllers: [AppLogsController],
  providers: [AppLogsService],
})
export class AppLogsModule {}
