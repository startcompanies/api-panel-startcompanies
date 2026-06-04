import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ViewAsController } from './view-as.controller';
import { ViewAsService } from './view-as.service';
import { ViewAsReadOnlyInterceptor } from './view-as-read-only.interceptor';
import { Client } from '../clients/entities/client.entity';
import { User } from '../../shared/user/entities/user.entity';
import { AuthModule } from '../../shared/auth/auth.module';
import { RolesGuard } from '../../shared/auth/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Client]),
    AuthModule,
  ],
  controllers: [ViewAsController],
  providers: [ViewAsService, ViewAsReadOnlyInterceptor, RolesGuard],
  exports: [ViewAsReadOnlyInterceptor],
})
export class ViewAsModule {}
