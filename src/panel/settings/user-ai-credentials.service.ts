import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { UserAiCredential, AiProvider } from './entities/user-ai-credential.entity';
import { UserSecretEncryptionService } from '../../shared/common/services/user-secret-encryption.service';

export type UserAiCredentialsStatus = {
  provider: AiProvider | null;
  hasKey: boolean;
  keyLast4: string | null;
};

export type DecryptedUserAiCredentials = {
  provider: AiProvider;
  apiKey: string;
};

@Injectable()
export class UserAiCredentialsService {
  constructor(
    @InjectRepository(UserAiCredential)
    private readonly repo: Repository<UserAiCredential>,
    private readonly encryption: UserSecretEncryptionService,
  ) {}

  /** Quita espacios, saltos de línea y BOM (muy habitual al pegar claves). */
  private normalizeApiKey(raw: string): string {
    return String(raw || '')
      .replace(/\uFEFF/g, '')
      .replace(/\s/g, '')
      .trim();
  }

  private anthropicModelForPing(): string {
    return process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  }

  private openaiModelForPing(): string {
    return process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  private extractProviderErrorMessage(e: unknown): string {
    const err = e as {
      message?: string;
      error?: { message?: string; error?: { message?: string } };
      status?: number;
    };
    const nested = err?.error;
    const m =
      (typeof nested === 'object' && nested && 'message' in nested && (nested as { message?: string }).message) ||
      (typeof nested === 'object' && nested && 'error' in nested && (nested as { error?: { message?: string } }).error?.message) ||
      err?.message ||
      '';
    const s = String(m).replace(/\s+/g, ' ').trim().slice(0, 220);
    return s || 'Error del proveedor (revisa la clave y el modelo configurado).';
  }

  private async assertProviderKeyValid(provider: AiProvider, apiKey: string): Promise<void> {
    if (!apiKey || apiKey.length < 8) {
      throw new BadRequestException('La API key es demasiado corta.');
    }
    try {
      if (provider === 'anthropic') {
        const client = new Anthropic({ apiKey });
        await client.messages.create({
          model: this.anthropicModelForPing(),
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
        });
      } else {
        const client = new OpenAI({ apiKey });
        await client.chat.completions.create({
          model: this.openaiModelForPing(),
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Reply with OK only.' }],
        });
      }
    } catch (e: unknown) {
      const detail = this.extractProviderErrorMessage(e);
      throw new BadRequestException(
        provider === 'anthropic'
          ? `No se pudo validar la clave con Anthropic. ${detail}`
          : `No se pudo validar la clave con OpenAI. ${detail}`,
      );
    }
  }

  async getStatus(userId: number): Promise<UserAiCredentialsStatus> {
    const row = await this.repo.findOne({ where: { userId } });
    if (!row) {
      return { provider: null, hasKey: false, keyLast4: null };
    }
    return {
      provider: row.provider,
      hasKey: true,
      keyLast4: row.keyLast4,
    };
  }

  async getDecryptedForUser(userId: number): Promise<DecryptedUserAiCredentials | null> {
    const row = await this.repo.findOne({ where: { userId } });
    if (!row) return null;
    const apiKey = this.encryption.decrypt(row.keyCiphertext, row.keyIv, row.keyAuthTag);
    return { provider: row.provider, apiKey };
  }

  async upsert(userId: number, provider: AiProvider, apiKey: string): Promise<UserAiCredentialsStatus> {
    const normalized = this.normalizeApiKey(apiKey);
    await this.assertProviderKeyValid(provider, normalized);

    const { ciphertext, iv, authTag } = this.encryption.encrypt(normalized);
    const keyLast4 = normalized.length >= 4 ? normalized.slice(-4) : null;
    let row = await this.repo.findOne({ where: { userId } });
    if (!row) {
      row = this.repo.create({
        userId,
        provider,
        keyCiphertext: ciphertext,
        keyIv: iv,
        keyAuthTag: authTag,
        keyLast4,
      });
    } else {
      row.provider = provider;
      row.keyCiphertext = ciphertext;
      row.keyIv = iv;
      row.keyAuthTag = authTag;
      row.keyLast4 = keyLast4;
    }
    await this.repo.save(row);
    return this.getStatus(userId);
  }

  async remove(userId: number): Promise<void> {
    await this.repo.delete({ userId });
  }
}
