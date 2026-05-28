import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from '../../shared/common/constants/jwtConstants';
import { User } from '../../shared/user/entities/user.entity';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { CommonModule } from '../../shared/common/common.module';
import { PartnerTenantsModule } from '../partner-tenants/partner-tenants.module';
import { AccountTeamMember } from './entities/account-team-member.entity';
import { AccountTeamService } from './account-team.service';
import { AccountTeamController } from './account-team.controller';
import { TeamContextService } from './team-context.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountTeamMember, User]),
    CommonModule,
    forwardRef(() => PartnerTenantsModule),
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AccountTeamController],
  providers: [AccountTeamService, TeamContextService, RolesGuard],
  exports: [AccountTeamService, TeamContextService],
})
export class AccountTeamModule {}
