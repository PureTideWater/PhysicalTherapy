import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { REGISTRATION_CODE_ALPHABET, REGISTRATION_CODE_LENGTH, isRegistrationCodeShaped, newRegistrationCode, normalizeRegistrationCode, registrationCodeDigest } from './registration-code';

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

  it('compares a code as typed: upper case, without spaces and hyphens, by its SHA-256', () => {
    expect(normalizeRegistrationCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(isRegistrationCodeShaped('abcd efgh')).toBe(true);
    expect(isRegistrationCodeShaped('ABCDEFG')).toBe(false);
    expect(isRegistrationCodeShaped('ABCDEFG0')).toBe(false);
    expect(registrationCodeDigest('abcd efgh')).toEqual(createHash('sha256').update('ABCDEFGH', 'utf8').digest());
    expect(registrationCodeDigest('ABCDEFGH')).toHaveLength(32);
  });
});
