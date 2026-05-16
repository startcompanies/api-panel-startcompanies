import { BadRequestException, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

@Injectable()
export class UserSecretEncryptionService {
  private getKeyBuffer(): Buffer {
    const b64 = process.env.USER_SECRETS_ENCRYPTION_KEY;
    if (!b64?.trim()) {
      throw new BadRequestException(
        'El servidor no tiene USER_SECRETS_ENCRYPTION_KEY (32 bytes en base64). No se pueden guardar claves API.',
      );
    }
    const buf = Buffer.from(b64.trim(), 'base64');
    if (buf.length !== 32) {
      throw new BadRequestException(
        'USER_SECRETS_ENCRYPTION_KEY debe decodificar exactamente 32 bytes (AES-256).',
      );
    }
    return buf;
  }

  encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
    const key = this.getKeyBuffer();
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv, { authTagLength: 16 });
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      ciphertext: enc.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  decrypt(ciphertextB64: string, ivB64: string, authTagB64: string): string {
    const key = this.getKeyBuffer();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  }
}
