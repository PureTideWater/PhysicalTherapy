import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Sealed values for state a browser carries between sign-in steps (the pending step, the identity
 * provider's challenge): AES-256-GCM under a server key, bound to a purpose, with an expiry. A value
 * sealed for one purpose does not open for another; a tampered or expired value opens to nothing.
 */

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const SEAL_KEY_BYTES = 32;

export class SealKeyError extends Error {
  override readonly name = 'SealKeyError';
}

export class Sealer {
  private readonly key: Buffer;

  constructor(key: Uint8Array) {
    if (key.length !== SEAL_KEY_BYTES) {
      throw new SealKeyError('the sealing key is 32 bytes');
    }
    this.key = Buffer.from(key);
  }

  /** A sealer whose key is derived from this one for another use (the dev provider's own challenges). */
  derive(label: string): Sealer {
    return new Sealer(createHash('sha256').update(this.key).update(label).digest());
  }

  seal(purpose: string, payload: unknown, expiresAt: Date): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`${VERSION}:${purpose}`));
    const body = Buffer.from(JSON.stringify({ e: expiresAt.getTime(), p: payload }));
    const sealed = Buffer.concat([iv, cipher.update(body), cipher.final(), cipher.getAuthTag()]);
    return `${VERSION}.${sealed.toString('base64url')}`;
  }

  /** The payload, or undefined when the value is malformed, tampered, sealed for another purpose or expired. */
  open(purpose: string, value: string | undefined, now: Date): unknown {
    if (value === undefined || !value.startsWith(`${VERSION}.`)) {
      return undefined;
    }
    const sealed = Buffer.from(value.slice(VERSION.length + 1), 'base64url');
    if (sealed.length < IV_BYTES + TAG_BYTES + 1) {
      return undefined;
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, sealed.subarray(0, IV_BYTES));
      decipher.setAAD(Buffer.from(`${VERSION}:${purpose}`));
      decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
      const body = Buffer.concat([decipher.update(sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES)), decipher.final()]);
      const parsed = JSON.parse(body.toString('utf8')) as { e: number; p: unknown };
      return parsed.e > now.getTime() ? parsed.p : undefined;
    } catch {
      return undefined;
    }
  }
}
