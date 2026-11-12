import { createHash, randomInt } from 'node:crypto';

/**
 * The one-time code that opens registration of a hardware key after a removal (docs/adr/0095; Queues item 37). An
 * administrator's console makes it, shows it once and passes only its SHA-256 to the database; the member types it at
 * sign-in, and again only the digest travels. The code itself is never stored, logged, sealed in a cookie or put in a
 * URL. Eight symbols of thirty-two, so forty bits; no 0, 1, I or O, which are misread aloud and on a screen.
 */
export const REGISTRATION_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const REGISTRATION_CODE_LENGTH = 8;

/** A new code from the operating system's random source. */
export function newRegistrationCode(): string {
  let code = '';
  for (let index = 0; index < REGISTRATION_CODE_LENGTH; index += 1) {
    code += REGISTRATION_CODE_ALPHABET[randomInt(REGISTRATION_CODE_ALPHABET.length)];
  }
  return code;
}

/** The code as it is compared: upper case, without the spaces and hyphens a person adds when reading it out. */
export function normalizeRegistrationCode(typed: string): string {
  return typed.replace(/[\s-]/g, '').toUpperCase();
}

/** Whether the typed text has a code's shape. It says nothing about whether the code is right. */
export function isRegistrationCodeShaped(typed: string): boolean {
  const code = normalizeRegistrationCode(typed);
  return code.length === REGISTRATION_CODE_LENGTH && [...code].every((symbol) => REGISTRATION_CODE_ALPHABET.includes(symbol));
}

/** The digest the database holds and compares: SHA-256 of the normalized code. */
export function registrationCodeDigest(typed: string): Buffer {
  return createHash('sha256').update(normalizeRegistrationCode(typed), 'utf8').digest();
}
