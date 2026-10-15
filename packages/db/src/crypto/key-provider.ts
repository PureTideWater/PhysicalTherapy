import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { isUuid } from '../authz/ids';

/**
 * Envelope encryption for the columns the data dictionary marks (enc) (PRD 3: a practice "has its
 * own KMS data key"; PRD 16, Encryption). Each practice has one data key. The provider generates it
 * and returns it twice: the plaintext, used in memory and never stored, and the wrapped form, which
 * is stored as practice.data_key_ref. Every later use unwraps it with the practice's ID as the
 * binding (KMS encryption context in production, GCM additional data locally), so a key wrapped for
 * one practice never opens for another. Destroying the wrapped key destroys the data key
 * (docs/adr/0015).
 */

export const DATA_KEY_BYTES = 32;

export interface DataKey {
  /** The 256-bit data key. Kept in memory for the request or job, never stored or logged. */
  readonly plaintext: Buffer;
  /** The wrapped key, as stored in practice.data_key_ref: `<provider>:v1:<base64>`. */
  readonly wrapped: string;
}

export interface KeyProvider {
  generateDataKey(practiceId: string): Promise<DataKey>;
  decryptDataKey(practiceId: string, wrapped: string): Promise<Buffer>;
}

/** A data key could not be produced or opened. The message never carries key material or values. */
export class DataKeyError extends Error {
  override readonly name: string = 'DataKeyError';
}

export function requirePractice(practiceId: string): string {
  if (!isUuid(practiceId)) {
    throw new DataKeyError('a data key belongs to one practice, named by its UUID');
  }
  return practiceId;
}

/** The stored reference for a wrapped key, and its parts. */
export function wrappedRef(provider: 'kms' | 'local', blob: Uint8Array): string {
  return `${provider}:v1:${Buffer.from(blob).toString('base64')}`;
}

export function unwrapRef(provider: 'kms' | 'local', ref: string): Buffer {
  const prefix = `${provider}:v1:`;
  if (!ref.startsWith(prefix)) {
    throw new DataKeyError(`this data key reference was not made by the ${provider} key provider`);
  }
  return Buffer.from(ref.slice(prefix.length), 'base64');
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * The local key provider for development and tests: AES-256-GCM under a 32-byte master key, with the
 * practice ID as additional authenticated data. Production uses KmsKeyProvider.
 */
export class LocalKeyProvider implements KeyProvider {
  private readonly masterKey: Buffer;

  constructor(masterKey: Uint8Array) {
    if (masterKey.length !== DATA_KEY_BYTES) {
      throw new DataKeyError('the local master key is 32 bytes');
    }
    this.masterKey = Buffer.from(masterKey);
  }

  /** A provider with a fresh random master key (tests). */
  static random(): LocalKeyProvider {
    return new LocalKeyProvider(randomBytes(DATA_KEY_BYTES));
  }

  generateDataKey(practiceId: string): Promise<DataKey> {
    const practice = requirePractice(practiceId);
    const plaintext = randomBytes(DATA_KEY_BYTES);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    cipher.setAAD(Buffer.from(`practice_id=${practice}`));
    const sealed = Buffer.concat([iv, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    return Promise.resolve({ plaintext, wrapped: wrappedRef('local', sealed) });
  }

  decryptDataKey(practiceId: string, wrapped: string): Promise<Buffer> {
    const practice = requirePractice(practiceId);
    const sealed = unwrapRef('local', wrapped);
    if (sealed.length !== IV_BYTES + DATA_KEY_BYTES + TAG_BYTES) {
      return Promise.reject(new DataKeyError('the wrapped data key is malformed'));
    }
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, sealed.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(`practice_id=${practice}`));
    decipher.setAuthTag(sealed.subarray(IV_BYTES + DATA_KEY_BYTES));
    try {
      return Promise.resolve(Buffer.concat([decipher.update(sealed.subarray(IV_BYTES, IV_BYTES + DATA_KEY_BYTES)), decipher.final()]));
    } catch {
      return Promise.reject(new DataKeyError('the data key does not open for this practice'));
    }
  }
}
