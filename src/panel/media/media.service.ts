import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { BillingService } from '../billing/billing.service';
import { User } from '../../shared/user/entities/user.entity';
import { ContentAccessLog } from './entities/content-access-log.entity';
import { LlcGuide } from './entities/llc-guide.entity';
import { PremiumVideo } from './entities/premium-video.entity';
import { TenantAccessService } from '../partner-tenants/tenant-access.service';
import {
  normalizeContentVisibility,
  visibilitiesForTenantKind,
  type ContentVisibility,
} from './content-visibility';

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
    private readonly tenantAccess: TenantAccessService,
  ) {}

  /**
   * Mismo criterio que el acceso al panel: trial activo o suscripción activa.
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

  private async publishedContentWhere(
    tenantHost?: string,
  ): Promise<Record<string, unknown>> {
    try {
      const tenant = await this.tenantAccess.resolveForAuth(tenantHost);
      if (tenant.kind === 'partner' && tenant.partnerId != null) {
        return { isPublished: true, partnerId: tenant.partnerId };
      }
      const allowed = visibilitiesForTenantKind('platform');
      return { isPublished: true, partnerId: IsNull(), visibility: In(allowed) };
    } catch {
      const allowed = visibilitiesForTenantKind('platform');
      return { isPublished: true, partnerId: IsNull(), visibility: In(allowed) };
    }
  }

  private async assertPartnerOwnsVideo(partnerId: number, id: number): Promise<PremiumVideo> {
    const row = await this.videosRepo.findOne({ where: { id, partnerId } });
    if (!row) throw new NotFoundException('Video no encontrado');
    return row;
  }

  private async assertPartnerOwnsGuide(partnerId: number, id: number): Promise<LlcGuide> {
    const row = await this.guidesRepo.findOne({ where: { id, partnerId } });
    if (!row) throw new NotFoundException('Guía no encontrada');
    return row;
  }

  async listVideos(user: User, tenantHost?: string) {
    await this.assertClientMediaAccess(user);
    return this.videosRepo.find({
      where: await this.publishedContentWhere(tenantHost),
      order: { createdAt: 'DESC' },
    });
  }

  async listGuides(user: User, tenantHost?: string) {
    await this.assertClientMediaAccess(user);
    return this.guidesRepo.find({
      where: await this.publishedContentWhere(tenantHost),
      order: { createdAt: 'DESC' },
    });
  }

  async getVideoDetail(id: number, user: User, tenantHost?: string) {
    await this.assertClientMediaAccess(user);
    const video = await this.videosRepo.findOne({
      where: { id, ...(await this.publishedContentWhere(tenantHost)) },
    });
    if (!video) {
      return null;
    }
    await this.logsRepo.save(
      this.logsRepo.create({ userId: user.id, contentType: 'video', contentId: id }),
    );
    return video;
  }

  async getGuideDetail(id: number, user: User, tenantHost?: string) {
    await this.assertClientMediaAccess(user);
    const guide = await this.guidesRepo.findOne({
      where: { id, ...(await this.publishedContentWhere(tenantHost)) },
    });
    if (!guide) {
      return null;
    }
    await this.logsRepo.save(
      this.logsRepo.create({ userId: user.id, contentType: 'guide', contentId: id }),
    );
    return guide;
  }

  adminListVideos() {
    return this.videosRepo.find({ order: { createdAt: 'DESC' } });
  }

  adminCreateVideo(body: {
    title: string;
    description: string;
    videoUrl: string;
    thumbnailUrl?: string | null;
    isPublished?: boolean;
    visibility?: ContentVisibility;
  }) {
    return this.videosRepo.save(
      this.videosRepo.create({
        title: body.title.trim(),
        description: body.description,
        videoUrl: body.videoUrl.trim(),
        thumbnailUrl: body.thumbnailUrl ?? null,
        isPublished: body.isPublished ?? true,
        visibility: normalizeContentVisibility(body.visibility),
        partnerId: null,
      }),
    );
  }

  async adminUpdateVideo(
    id: number,
    body: {
      title?: string;
      description?: string;
      videoUrl?: string;
      thumbnailUrl?: string | null;
      isPublished?: boolean;
      visibility?: ContentVisibility;
    },
  ) {
    await this.videosRepo.update(
      { id },
      {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.videoUrl !== undefined ? { videoUrl: body.videoUrl.trim() } : {}),
        ...(body.thumbnailUrl !== undefined ? { thumbnailUrl: body.thumbnailUrl } : {}),
        ...(body.isPublished !== undefined ? { isPublished: body.isPublished } : {}),
        ...(body.visibility !== undefined
          ? { visibility: normalizeContentVisibility(body.visibility) }
          : {}),
      },
    );
    return this.videosRepo.findOne({ where: { id } });
  }

  async adminDeleteVideo(id: number) {
    await this.videosRepo.delete({ id });
    return { ok: true };
  }

  adminListGuides() {
    return this.guidesRepo.find({ order: { createdAt: 'DESC' } });
  }

  adminCreateGuide(body: {
    title: string;
    content?: string;
    contentHtml?: string | null;
    attachmentUrl?: string | null;
    attachmentMime?: string | null;
    thumbnailUrl?: string | null;
    isPublished?: boolean;
    visibility?: ContentVisibility;
  }) {
    return this.guidesRepo.save(
      this.guidesRepo.create({
        title: body.title.trim(),
        content: body.content || '',
        contentHtml: body.contentHtml ?? body.content ?? '',
        attachmentUrl: body.attachmentUrl ?? null,
        attachmentMime: body.attachmentMime ?? null,
        thumbnailUrl: body.thumbnailUrl ?? null,
        isPublished: body.isPublished ?? true,
        visibility: normalizeContentVisibility(body.visibility),
        partnerId: null,
      }),
    );
  }

  async adminUpdateGuide(
    id: number,
    body: {
      title?: string;
      content?: string;
      contentHtml?: string | null;
      attachmentUrl?: string | null;
      attachmentMime?: string | null;
      thumbnailUrl?: string | null;
      isPublished?: boolean;
      visibility?: ContentVisibility;
    },
  ) {
    await this.guidesRepo.update(
      { id },
      {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.contentHtml !== undefined ? { contentHtml: body.contentHtml } : {}),
        ...(body.attachmentUrl !== undefined ? { attachmentUrl: body.attachmentUrl } : {}),
        ...(body.attachmentMime !== undefined ? { attachmentMime: body.attachmentMime } : {}),
        ...(body.thumbnailUrl !== undefined ? { thumbnailUrl: body.thumbnailUrl } : {}),
        ...(body.isPublished !== undefined ? { isPublished: body.isPublished } : {}),
        ...(body.visibility !== undefined
          ? { visibility: normalizeContentVisibility(body.visibility) }
          : {}),
      },
    );
    return this.guidesRepo.findOne({ where: { id } });
  }

  async adminDeleteGuide(id: number) {
    await this.guidesRepo.delete({ id });
    return { ok: true };
  }

  partnerListVideos(partnerId: number) {
    return this.videosRepo.find({
      where: { partnerId },
      order: { createdAt: 'DESC' },
    });
  }

  partnerCreateVideo(
    partnerId: number,
    body: {
      title: string;
      description: string;
      videoUrl: string;
      thumbnailUrl?: string | null;
      isPublished?: boolean;
    },
  ) {
    return this.videosRepo.save(
      this.videosRepo.create({
        partnerId,
        title: body.title.trim(),
        description: body.description,
        videoUrl: body.videoUrl.trim(),
        thumbnailUrl: body.thumbnailUrl ?? null,
        isPublished: body.isPublished ?? true,
        visibility: 'partners',
      }),
    );
  }

  async partnerUpdateVideo(
    partnerId: number,
    id: number,
    body: {
      title?: string;
      description?: string;
      videoUrl?: string;
      thumbnailUrl?: string | null;
      isPublished?: boolean;
    },
  ) {
    await this.assertPartnerOwnsVideo(partnerId, id);
    await this.videosRepo.update(
      { id, partnerId },
      {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.videoUrl !== undefined ? { videoUrl: body.videoUrl.trim() } : {}),
        ...(body.thumbnailUrl !== undefined ? { thumbnailUrl: body.thumbnailUrl } : {}),
        ...(body.isPublished !== undefined ? { isPublished: body.isPublished } : {}),
      },
    );
    return this.videosRepo.findOne({ where: { id, partnerId } });
  }

  async partnerDeleteVideo(partnerId: number, id: number) {
    await this.assertPartnerOwnsVideo(partnerId, id);
    await this.videosRepo.delete({ id, partnerId });
    return { ok: true };
  }

  partnerListGuides(partnerId: number) {
    return this.guidesRepo.find({
      where: { partnerId },
      order: { createdAt: 'DESC' },
    });
  }

  partnerCreateGuide(
    partnerId: number,
    body: {
      title: string;
      content?: string;
      contentHtml?: string | null;
      attachmentUrl?: string | null;
      attachmentMime?: string | null;
      thumbnailUrl?: string | null;
      isPublished?: boolean;
    },
  ) {
    return this.guidesRepo.save(
      this.guidesRepo.create({
        partnerId,
        title: body.title.trim(),
        content: body.content || '',
        contentHtml: body.contentHtml ?? body.content ?? '',
        attachmentUrl: body.attachmentUrl ?? null,
        attachmentMime: body.attachmentMime ?? null,
        thumbnailUrl: body.thumbnailUrl ?? null,
        isPublished: body.isPublished ?? true,
        visibility: 'partners',
      }),
    );
  }

  async partnerUpdateGuide(
    partnerId: number,
    id: number,
    body: {
      title?: string;
      content?: string;
      contentHtml?: string | null;
      attachmentUrl?: string | null;
      attachmentMime?: string | null;
      thumbnailUrl?: string | null;
      isPublished?: boolean;
    },
  ) {
    await this.assertPartnerOwnsGuide(partnerId, id);
    await this.guidesRepo.update(
      { id, partnerId },
      {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.contentHtml !== undefined ? { contentHtml: body.contentHtml } : {}),
        ...(body.attachmentUrl !== undefined ? { attachmentUrl: body.attachmentUrl } : {}),
        ...(body.attachmentMime !== undefined ? { attachmentMime: body.attachmentMime } : {}),
        ...(body.thumbnailUrl !== undefined ? { thumbnailUrl: body.thumbnailUrl } : {}),
        ...(body.isPublished !== undefined ? { isPublished: body.isPublished } : {}),
      },
    );
    return this.guidesRepo.findOne({ where: { id, partnerId } });
  }

  async partnerDeleteGuide(partnerId: number, id: number) {
    await this.assertPartnerOwnsGuide(partnerId, id);
    await this.guidesRepo.delete({ id, partnerId });
    return { ok: true };
  }
}
