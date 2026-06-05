import { Injectable, Logger } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from 'jose';
import { PlaidApi } from 'plaid';

@Injectable()
export class PlaidWebhookVerifyService {
  private readonly logger = new Logger(PlaidWebhookVerifyService.name);
  private keyCache = new Map<string, JWK>();

  async verify(
    plaidClient: PlaidApi,
    rawBody: Buffer,
    verificationHeader: string | undefined,
  ): Promise<boolean> {
    const skip = process.env.PLAID_WEBHOOK_SKIP_VERIFY;
    if (skip === 'true' || skip === '1') {
      return true;
    }
    if (!verificationHeader?.trim()) {
      this.logger.warn('Webhook Plaid sin header Plaid-Verification');
      return false;
    }

    try {
      const header = decodeProtectedHeader(verificationHeader);
      if (header.alg !== 'ES256' || !header.kid) {
        return false;
      }

      let jwk = this.keyCache.get(header.kid);
      if (!jwk) {
        const res = await plaidClient.webhookVerificationKeyGet({ key_id: header.kid });
        jwk = res.data.key as JWK;
        this.keyCache.set(header.kid, jwk);
      }

      const key = await importJWK(jwk, 'ES256');
      const { payload } = await jwtVerify(verificationHeader, key, {
        maxTokenAge: '5 min',
      });

      const claimedHash = String((payload as { request_body_sha256?: string }).request_body_sha256 || '');
      const bodyHash = createHash('sha256').update(rawBody).digest('hex');
      if (!claimedHash || claimedHash.length !== bodyHash.length) {
        return false;
      }
      return timingSafeEqual(Buffer.from(claimedHash), Buffer.from(bodyHash));
    } catch (err) {
      this.logger.warn(`Verificación webhook Plaid falló: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }
}
