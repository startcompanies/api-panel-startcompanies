import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { Client } from './entities/client.entity';
import { Request } from '../requests/entities/request.entity';
import { User } from '../../shared/user/entities/user.entity';
import { RolesGuard } from '../../shared/auth/roles.guard';

@Module({
  controllers: [ClientsController],
  providers: [ClientsService, RolesGuard],
  imports: [TypeOrmModule.forFeature([Client, Request, User])],
  exports: [ClientsService],
})
export class ClientsModule {}








