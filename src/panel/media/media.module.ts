import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { ContentAccessLog } from './entities/content-access-log.entity';
import { LlcGuide } from './entities/llc-guide.entity';
import { PremiumVideo } from './entities/premium-video.entity';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [TypeOrmModule.forFeature([PremiumVideo, LlcGuide, ContentAccessLog]), BillingModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}

