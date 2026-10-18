import type { CookieJar } from '../http/route';
import type { Sealer } from './seal';
import { DEVICE_COOKIE, DEVICE_COOKIE_DAYS, type OpenedSession, SESSION_COOKIE, SESSION_LIMITS, SIGN_IN_COOKIE } from './sessions';
import type { Pending } from './sign-in';

/**
 * The cookies sign-in writes. The pending step is sealed (it carries the provider's challenge, and
 * during enrollment the TOTP secret) and lasts five minutes, or fifteen for hardware-key registration
 * (the provider's access token); the session cookie lasts the 12-hour absolute limit; the device
 * cookie lasts 400 days. The adapters set HttpOnly, Secure, SameSite=Lax and path / on every cookie.
 */

const PENDING_PURPOSE = 'sign-in-pending';

function pendingSeconds(pending: Pending): number {
  return pending.step === 'register_key' ? 15 * 60 : 5 * 60;
}

export function readPending(cookies: CookieJar, sealer: Sealer, now: Date): Pending | undefined {
  return sealer.open(PENDING_PURPOSE, cookies.get(SIGN_IN_COOKIE), now) as Pending | undefined;
}

export function writePending(cookies: CookieJar, sealer: Sealer, pending: Pending, now: Date): void {
  const seconds = pendingSeconds(pending);
  cookies.set(SIGN_IN_COOKIE, sealer.seal(PENDING_PURPOSE, pending, new Date(now.getTime() + seconds * 1000)), { maxAgeSeconds: seconds });
}

export function clearPending(cookies: CookieJar): void {
  cookies.delete(SIGN_IN_COOKIE);
}

/** After a successful sign-in: the session and device cookies, and no pending step. */
export function writeSession(cookies: CookieJar, session: OpenedSession): void {
  clearPending(cookies);
  cookies.set(SESSION_COOKIE, session.sessionToken, { maxAgeSeconds: SESSION_LIMITS.absoluteHours * 3600 });
  cookies.set(DEVICE_COOKIE, session.deviceToken, { maxAgeSeconds: DEVICE_COOKIE_DAYS * 24 * 3600 });
}

export function clearSession(cookies: CookieJar): void {
  cookies.delete(SESSION_COOKIE);
}
