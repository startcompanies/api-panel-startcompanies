import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../shared/user/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import type { PlatformFeatures } from '../pricing/entities/pricing-plan.entity';

export type PlatformAiScope = 'platform' | 'tenant';

/** Estado de IA de contabilidad (Gemini vía variables de entorno del servidor). */
export type PlatformAiStatus = {
  provider: 'gemini';
  configured: boolean;
  /** Qué clave .env aplica a este cliente (portal SC vs clientes de partner). */
  scope: PlatformAiScope | null;
};

@Injectable()
export class PlatformAiService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly config: ConfigService,
  ) {}

  private resolveOwnerUserId(user: { id: number; accountOwnerId?: number }): number {
    return user.accountOwnerId ?? user.id;
  }

  async assertAccountingAiClient(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'type', 'platformFeatures'],
    });
    if (!user || user.type !== 'client') {
      throw new ForbiddenException(
        'La categorización con IA solo está disponible para clientes.',
      );
    }
    const features = user.platformFeatures as PlatformFeatures | null | undefined;
    if (!features?.accountingAi) {
      throw new ForbiddenException(
        'Tu plan no incluye categorización con IA. Actualiza tu plan para usar esta función.',
      );
    }
  }

  private async canUseAccountingAi(userId: number): Promise<boolean> {
    try {
      await this.assertAccountingAiClient(userId);
      return true;
    } catch {
      return false;
    }
  }

  async resolveScopeForUser(userId: number): Promise<PlatformAiScope> {
    const client = await this.clientRepo.findOne({
      where: { userId },
      select: ['id', 'partnerId'],
    });
    return client?.partnerId ? 'tenant' : 'platform';
  }

  getApiKeyForScope(scope: PlatformAiScope): string | null {
    const envKey =
      scope === 'tenant' ? 'GEMINI_API_KEY_TENANT' : 'GEMINI_API_KEY_PLATFORM';
    const raw = this.config.get<string>(envKey);
    const key = typeof raw === 'string' ? raw.trim() : '';
    return key.length >= 8 ? key : null;
  }

  geminiModel(): string {
    return this.config.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash';
  }

  async getStatus(user: { id: number; accountOwnerId?: number }): Promise<PlatformAiStatus> {
    const ownerId = this.resolveOwnerUserId(user);
    if (!(await this.canUseAccountingAi(ownerId))) {
      return { provider: 'gemini', configured: false, scope: null };
    }
    const scope = await this.resolveScopeForUser(ownerId);
    const configured = !!this.getApiKeyForScope(scope);
    return { provider: 'gemini', configured, scope };
  }

  /** API key Gemini para categorización; null si plan sin IA o falta variable .env. */
  async getApiKeyForUser(user: { id: number; accountOwnerId?: number }): Promise<string | null> {
    const ownerId = this.resolveOwnerUserId(user);
    if (!(await this.canUseAccountingAi(ownerId))) {
      return null;
    }
    const scope = await this.resolveScopeForUser(ownerId);
    return this.getApiKeyForScope(scope);
  }
}
