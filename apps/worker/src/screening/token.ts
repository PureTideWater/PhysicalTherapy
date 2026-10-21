import { createHash, randomBytes } from 'node:crypto';

/**
 * A screening result's link token (Change Order 001, CO-04; reconciliation-001 D21 a; docs/adr/0062): 32 letters a
 * to z, drawn by rejection sampling from the operating system's random bytes (a byte below 234, taken mod 26, so
 * every letter is equally likely), about 150 bits. Letters only, because the URL guard admits a path segment that
 * is a lowercase word (packages/observability, urlPhiFindings) and a base64url token is not one.
 *
 * The worker draws it when a run completes and puts it in the emailed link alone. Only its SHA-256 reaches the
 * database (screening_run.result_token_sha256); it is never logged, never in a job payload and never in an audit
 * event.
 */

export const SCREENING_TOKEN_LENGTH = 32;
export const SCREENING_TOKEN = /^[a-z]{32}$/;

/** The largest multiple of 26 a byte can hold: bytes from it up are drawn again. */
const BYTE_LIMIT = 234;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export class ScreeningTokenError extends Error {
  override readonly name = 'ScreeningTokenError';
}

/** A new token, from `random` (the operating system's bytes; a test's own). */
export function newScreeningToken(random: (size: number) => Uint8Array = randomBytes): string {
  let token = '';
  while (token.length < SCREENING_TOKEN_LENGTH) {
    for (const byte of random(SCREENING_TOKEN_LENGTH)) {
      if (byte < BYTE_LIMIT && token.length < SCREENING_TOKEN_LENGTH) {
        token += LETTERS.charAt(byte % LETTERS.length);
      }
    }
  }
  return token;
}

/** The token's SHA-256, lowercase hex: what the database stores and the reads look up. Refuses anything but a token. */
export function screeningTokenHash(token: string): string {
  if (!SCREENING_TOKEN.test(token)) {
    throw new ScreeningTokenError('a screening token is 32 letters a to z');
  }
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
