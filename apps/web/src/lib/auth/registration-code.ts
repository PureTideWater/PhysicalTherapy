import { createHmac, randomInt } from 'node:crypto';

import type { Sealer } from './seal';

/**
 * The one-time code that opens registration of a hardware key after a removal (docs/adr/0095; Queues item 37). An
 * administrator's console makes it, shows it once and passes only its keyed digest to the database; the member types
 * it at sign-in, and again only the digest travels. The code itself is never stored, logged, sealed in a cookie or put
 * in a URL. Eight symbols of thirty-two, so forty bits; no 0, 1, I or O, which are misread aloud and on a screen.
 *
 * The digest is an HMAC-SHA-256 under a key only the web server holds, not a bare SHA-256 (review A3 of the key
 * registry): forty bits fall to an offline search in minutes, so whoever read a bare digest (the column, a backup, a
 * logged bind parameter) would hold the code within its hour. Without the key the stored digest says nothing of the
 * code. It is still 32 bytes; the database compares digests and never sees the key (the column keeps its name,
 * registration_code_sha256).
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

/** The HKDF label of the digest's key: one use, one label. A change of it is a change of every digest. */
export const REGISTRATION_CODE_KEY_INFO = 'paidwhole registration-code digest v1';
export const REGISTRATION_CODE_KEY_BYTES = 32;

/**
 * The key the digest is made under: HKDF-SHA-256 of the web's sealing key under REGISTRATION_CODE_KEY_INFO, so the
 * digest needs no secret, setting or infrastructure of its own. Made once, in createServices (server/services.ts),
 * which hands the same key to the console's route and to the sign-in flow.
 *
 * The sealing key is one value (WebConfig.cookieSecret); there is no set of old and new keys. If it is replaced while
 * an opening stands, the member's code no longer matches the stored digest and is refused like a wrong code, each
 * try counted; an opening lives one hour, and the administrator opens registration again for a new code. That is
 * accepted: nothing is weakened, and the pending sign-in steps sealed under the old key are refused then too.
 */
export function registrationCodeKey(sealer: Sealer): Buffer {
  return sealer.deriveKey(REGISTRATION_CODE_KEY_INFO);
}

/**
 * The digest the database holds and compares: HMAC-SHA-256 of the normalized code under the server's key, 32 bytes.
 * The key is an argument: this module holds no secret.
 */
export function registrationCodeDigest(key: Uint8Array, typed: string): Buffer {
  if (key.length !== REGISTRATION_CODE_KEY_BYTES) {
    throw new Error('the registration code\u2019s digest key is 32 bytes');
  }
  return createHmac('sha256', key).update(normalizeRegistrationCode(typed), 'utf8').digest();
}
