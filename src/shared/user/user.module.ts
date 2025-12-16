import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserSeedService } from './user-seed.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserController } from './user.controller';
import { Post } from '../../blog/posts/entities/post.entity';
import { Request } from '../../panel/requests/entities/request.entity';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { CommonModule } from '../common/common.module';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from '../common/constants/jwtConstants';

@Module({
  controllers: [UserController],
  providers: [UserService, UserSeedService, RolesGuard],
  imports: [
    TypeOrmModule.forFeature([User, Post, Request]),
    CommonModule,
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '24h' },
    }),
  ]
})
export class UserModule {}
