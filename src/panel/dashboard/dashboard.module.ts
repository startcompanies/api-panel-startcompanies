import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Request as RequestEntity } from '../requests/entities/request.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../../shared/user/entities/user.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { RolesGuard } from '../../shared/auth/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([RequestEntity, Client, User])],
  controllers: [DashboardController],
  providers: [DashboardService, RolesGuard],
})
export class DashboardModule {}
