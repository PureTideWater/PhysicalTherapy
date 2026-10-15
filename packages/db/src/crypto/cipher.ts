import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

import { DATA_KEY_BYTES, DataKeyError, requirePractice } from './key-provider';

/**
 * Field encryption with a practice's data key (Data dictionary: "Columns marked (enc) are encrypted at
 * the application layer with the practice's data key before storage").
 *
 * - encrypt/decrypt: AES-256-GCM with a fresh 96-bit nonce per value. The additional data binds each
 *   ciphertext to its practice and column, so a value copied into another practice's row, or into
 *   another column, does not decrypt.
 * - lookupHash: a deterministic keyed hash (HMAC-SHA-256) for the one indexed lookup the data
 *   dictionary names, claim (practice_id, payer_claim_control_number). Equal values hash equally within
 *   a practice and column, and differently across practices, so the index never reveals a value or
 *   links practices.
 *
 * Both keys are derived from the data key with HKDF, so destroying the data key destroys them too.
 */

/** Every column the data dictionary marks (enc). */
export const ENCRYPTED_COLUMNS = [
  'claim.patient_control_number',
  'claim.payer_claim_control_number',
  'patient_ref.last_name',
  'patient_ref.first_name',
  'patient_ref.dob',
  'patient_ref.member_id',
  'patient_ref.group_number',
  'posting_row.claim_reference',
] as const;
export type EncryptedColumn = (typeof ENCRYPTED_COLUMNS)[number];

/** The encrypted columns with an indexed lookup on their deterministic hash. */
export const LOOKUP_COLUMNS = ['claim.payer_claim_control_number'] as const;
export type LookupColumn = (typeof LOOKUP_COLUMNS)[number];

const PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** A value did not decrypt: tampered, from another practice or column, or not a ciphertext at all. */
export class CiphertextError extends Error {
  override readonly name = 'CiphertextError';
}

function derive(dataKey: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', dataKey, Buffer.alloc(0), info, DATA_KEY_BYTES));
}

export class PracticeCipher {
  private readonly encryptionKey: Buffer;
  private readonly lookupKey: Buffer;

  constructor(
    readonly practiceId: string,
    dataKey: Uint8Array,
  ) {
    requirePractice(practiceId);
    if (dataKey.length !== DATA_KEY_BYTES) {
      throw new DataKeyError('a data key is 32 bytes');
    }
    const key = Buffer.from(dataKey);
    this.encryptionKey = derive(key, 'tp field encryption v1');
    this.lookupKey = derive(key, 'tp lookup hash v1');
  }

  private aad(column: EncryptedColumn): Buffer {
    return Buffer.from(`${this.practiceId}:${column}`);
  }

  encrypt(column: EncryptedColumn, plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    cipher.setAAD(this.aad(column));
    const sealed = Buffer.concat([iv, cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    return `${PREFIX}${sealed.toString('base64url')}`;
  }

  decrypt(column: EncryptedColumn, ciphertext: string): string {
    if (!ciphertext.startsWith(PREFIX)) {
      throw new CiphertextError('the value is not an enc:v1 ciphertext');
    }
    const sealed = Buffer.from(ciphertext.slice(PREFIX.length), 'base64url');
    if (sealed.length < IV_BYTES + TAG_BYTES) {
      throw new CiphertextError('the ciphertext is truncated');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, sealed.subarray(0, IV_BYTES));
    decipher.setAAD(this.aad(column));
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    try {
      return Buffer.concat([decipher.update(sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES)), decipher.final()]).toString('utf8');
    } catch {
      throw new CiphertextError('the ciphertext does not decrypt under this practice’s key for this column');
    }
  }

  /** The deterministic keyed hash stored beside the ciphertext for an indexed lookup. Hex, 64 characters. */
  lookupHash(column: LookupColumn, value: string): string {
    return createHmac('sha256', this.lookupKey).update(`${column}\u0000${value}`, 'utf8').digest('hex');
  }
}
