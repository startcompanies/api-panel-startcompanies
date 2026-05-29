import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { BillingModule } from '../billing/billing.module';
import { UploadFileModule } from '../../shared/upload-file/upload-file.module';
import { ContentAccessLog } from './entities/content-access-log.entity';
import { LlcGuide } from './entities/llc-guide.entity';
import { PremiumVideo } from './entities/premium-video.entity';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { PartnerTenantsModule } from '../partner-tenants/partner-tenants.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PremiumVideo, LlcGuide, ContentAccessLog]),
    BillingModule,
    UploadFileModule,
    PartnerTenantsModule,
  ],
  controllers: [MediaController],
  providers: [MediaService, RolesGuard],
})
export class MediaModule {}

