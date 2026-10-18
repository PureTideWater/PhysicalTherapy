import * as OTPAuth from 'otpauth';

/**
 * TOTP (RFC 6238) through the otpauth library: six digits, 30-second steps, SHA-1, the parameters
 * every authenticator app uses. A code is accepted one step either side of now, and never twice: the
 * step it matched is returned so the caller can refuse it, or an earlier step, next time.
 */

export const TOTP_ISSUER = 'Therapy Platform';
const PERIOD_SECONDS = 30;

function totp(secret: string, label = 'account'): OTPAuth.TOTP {
  return new OTPAuth.TOTP({ issuer: TOTP_ISSUER, label, algorithm: 'SHA1', digits: 6, period: PERIOD_SECONDS, secret: OTPAuth.Secret.fromBase32(secret) });
}

/** A new 160-bit secret, base32 (what an authenticator app is given). */
export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** The base32 secret for 20 given bytes (the synthetic seed derives its secrets this way). */
export function totpSecretFromBytes(bytes: Uint8Array): string {
  return new OTPAuth.Secret({ buffer: Uint8Array.from(bytes.subarray(0, 20)).buffer }).base32;
}

/** The otpauth:// URI an authenticator app reads; the label is the account's email. */
export function totpUri(secret: string, label: string): string {
  return totp(secret, label).toString();
}

/** The code for a moment (tests and the synthetic seed's sign-in helpers). */
export function totpCode(secret: string, at: Date): string {
  return totp(secret).generate({ timestamp: at.getTime() });
}

/**
 * The step the code matches (within one step of now and later than `afterStep`), or null. Anything
 * but six digits is refused without a comparison.
 */
export function verifyTotp(secret: string, code: string, at: Date, afterStep = -1): number | null {
  if (!/^\d{6}$/.test(code)) {
    return null;
  }
  const delta = totp(secret).validate({ token: code, timestamp: at.getTime(), window: 1 });
  if (delta === null) {
    return null;
  }
  const step = Math.floor(at.getTime() / 1000 / PERIOD_SECONDS) + delta;
  return step > afterStep ? step : null;
}
