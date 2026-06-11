import { Injectable } from '@nestjs/common';
import { createHmac, createVerify, timingSafeEqual } from 'crypto';

const MAX_AGE_MS = 10 * 60 * 1000;

@Injectable()
export class BridgeWebhookVerifyService {
  verify(payload: Buffer, signatureHeader: string | undefined): boolean {
    if (process.env.BRIDGE_WEBHOOK_SKIP_VERIFY === 'true') {
      return true;
    }

    const publicKeyPem = this.resolvePublicKeyPem();
    if (!publicKeyPem || !signatureHeader?.trim()) {
      return false;
    }

    const timestamp = this.extractPart(signatureHeader, 't');
    const signatureB64 = this.extractPart(signatureHeader, 'v0');
    if (!timestamp || !signatureB64) {
      return false;
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Date.now() - ts > MAX_AGE_MS) {
      return false;
    }

    try {
      const signedPayload = `${timestamp}.${payload.toString('utf8')}`;
      const verifier = createVerify('RSA-SHA256');
      verifier.update(signedPayload);
      verifier.end();
      return verifier.verify(publicKeyPem, signatureB64, 'base64');
    } catch {
      return false;
    }
  }

  /** Compatibilidad temporal con guía interna HMAC (header bridge-signature). */
  verifyLegacyHmac(payload: Buffer, signature: string | undefined): boolean {
    const secret = process.env.BRIDGE_WEBHOOK_SECRET?.trim();
    if (!secret || !signature?.trim()) return false;

    const expected = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(signature.trim(), 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      return false;
    }
  }

  verifyAny(
    payload: Buffer,
    headers: { webhookSignature?: string; legacySignature?: string },
  ): boolean {
    if (process.env.BRIDGE_WEBHOOK_SKIP_VERIFY === 'true') {
      return true;
    }

    if (headers.webhookSignature) {
      return this.verify(payload, headers.webhookSignature);
    }

    if (headers.legacySignature && process.env.BRIDGE_WEBHOOK_SECRET?.trim()) {
      return this.verifyLegacyHmac(payload, headers.legacySignature);
    }

    return false;
  }

  private resolvePublicKeyPem(): string | null {
    const raw =
      process.env.BRIDGE_WEBHOOK_PUBLIC_KEY?.trim() ||
      process.env.BRIDGE_WEBHOOK_SECRET?.trim();
    if (!raw) return null;

    if (raw.includes('BEGIN PUBLIC KEY')) {
      return raw.replace(/\\n/g, '\n');
    }

    return null;
  }

  private extractPart(header: string, key: string): string | null {
    for (const part of header.split(',')) {
      const trimmed = part.trim();
      if (trimmed.startsWith(`${key}=`)) {
        return trimmed.slice(key.length + 1);
      }
    }
    return null;
  }
}
