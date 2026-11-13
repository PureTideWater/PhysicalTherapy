import { createHash, createHmac, hkdfSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { REGISTRATION_CODE_ALPHABET, REGISTRATION_CODE_LENGTH, isRegistrationCodeShaped, newRegistrationCode, normalizeRegistrationCode, registrationCodeDigest, registrationCodeKey } from './registration-code';
import { Sealer } from './seal';

const SEALING = Buffer.alloc(32, 7);
const KEY = registrationCodeKey(new Sealer(SEALING));
const OTHER = registrationCodeKey(new Sealer(Buffer.alloc(32, 8)));

describe('the one-time code that opens key registration (docs/adr/0095)', () => {
  it('makes eight symbols of the thirty-two, none a look-alike, and not the same code twice', () => {
    expect(REGISTRATION_CODE_ALPHABET).toHaveLength(32);
    expect(REGISTRATION_CODE_ALPHABET).not.toMatch(/[01IO]/);
    const codes = Array.from({ length: 200 }, newRegistrationCode);
    for (const code of codes) {
      expect(code).toHaveLength(REGISTRATION_CODE_LENGTH);
      expect(isRegistrationCodeShaped(code)).toBe(true);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('compares a code as typed: upper case, without spaces and hyphens', () => {
    expect(normalizeRegistrationCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(isRegistrationCodeShaped('abcd efgh')).toBe(true);
    expect(isRegistrationCodeShaped('ABCDEFG')).toBe(false);
    expect(isRegistrationCodeShaped('ABCDEFG0')).toBe(false);
  });

  it('digests a code under the server’s key (review A3): 32 bytes, not the code’s SHA-256, another digest under another key, the same for the same key and code as typed', () => {
    const digest = registrationCodeDigest(KEY, 'ABCDEFGH');
    expect(digest).toHaveLength(32);
    expect(digest.equals(createHash('sha256').update('ABCDEFGH', 'utf8').digest())).toBe(false);
    expect(digest.equals(registrationCodeDigest(OTHER, 'ABCDEFGH'))).toBe(false);
    expect(digest.equals(registrationCodeDigest(KEY, 'ABCDEFGH'))).toBe(true);
    expect(digest.equals(registrationCodeDigest(KEY, ' abcd-efgh '))).toBe(true);
    expect(digest.equals(registrationCodeDigest(KEY, 'ABCDEFGJ'))).toBe(false);
    expect(digest.equals(createHmac('sha256', KEY).update('ABCDEFGH', 'utf8').digest())).toBe(true);
    expect(() => registrationCodeDigest(Buffer.alloc(0), 'ABCDEFGH')).toThrow('32 bytes');
  });

  it('derives the digest’s key from the sealing key by HKDF-SHA-256 under its own label: 32 bytes, not the sealing key, another for another sealing key', () => {
    expect(KEY).toHaveLength(32);
    expect(KEY.equals(SEALING)).toBe(false);
    expect(KEY.equals(OTHER)).toBe(false);
    expect(KEY.equals(Buffer.from(hkdfSync('sha256', SEALING, Buffer.alloc(0), 'paidwhole registration-code digest v1', 32)))).toBe(true);
    expect(KEY.equals(registrationCodeKey(new Sealer(SEALING)))).toBe(true);
  });
});
