import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingService } from '../billing/billing.service';
import { User } from '../../shared/user/entities/user.entity';
import { ContentAccessLog } from './entities/content-access-log.entity';
import { LlcGuide } from './entities/llc-guide.entity';
import { PremiumVideo } from './entities/premium-video.entity';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(PremiumVideo)
    private readonly videosRepo: Repository<PremiumVideo>,
    @InjectRepository(LlcGuide)
    private readonly guidesRepo: Repository<LlcGuide>,
    @InjectRepository(ContentAccessLog)
    private readonly logsRepo: Repository<ContentAccessLog>,
    private readonly billingService: BillingService,
  ) {}

  /**
   * Mismo criterio que el acceso al panel: trial activo o suscripción activa.
   * No se aplica un “premium” por sección aparte del billing global.
   */
  async assertClientMediaAccess(user: User) {
    if (user.type !== 'client') {
      throw new ForbiddenException('Solo clientes pueden acceder a videos y guías');
    }
    const snapshot = await this.billingService.getAccessSnapshot(user.id);
    const ok =
      snapshot.accessState === 'trial_active' || snapshot.accessState === 'subscription_active';
    if (!ok) {
      throw new ForbiddenException('No tienes acceso: trial vencido o sin suscripción activa');
    }
  }

  async listVideos(user: User) {
    await this.assertClientMediaAccess(user);
    return this.videosRepo.find({ where: { isPublished: true }, order: { createdAt: 'DESC' } });
  }

  async listGuides(user: User) {
    await this.assertClientMediaAccess(user);
    return this.guidesRepo.find({ where: { isPublished: true }, order: { createdAt: 'DESC' } });
  }

  async getVideoDetail(id: number, user: User) {
    await this.assertClientMediaAccess(user);
    await this.logsRepo.save(this.logsRepo.create({ userId: user.id, contentType: 'video', contentId: id }));
    return this.videosRepo.findOne({ where: { id, isPublished: true } });
  }

  async getGuideDetail(id: number, user: User) {
    await this.assertClientMediaAccess(user);
    await this.logsRepo.save(this.logsRepo.create({ userId: user.id, contentType: 'guide', contentId: id }));
    return this.guidesRepo.findOne({ where: { id, isPublished: true } });
  }
}

