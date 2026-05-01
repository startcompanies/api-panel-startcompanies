import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    const { ciphertext, iv, authTag } = this.encryption.encrypt(apiKey.trim());
    const keyLast4 = apiKey.trim().length >= 4 ? apiKey.trim().slice(-4) : null;
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
