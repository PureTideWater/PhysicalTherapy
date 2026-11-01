import type { CookieJar } from '../http/route';
import { emailAddress } from '../routes/schemas';
import type { Sealer } from './seal';
import { DEVICE_COOKIE, DEVICE_COOKIE_DAYS, KEPT_EMAIL_COOKIE, type OpenedSession, SESSION_COOKIE, SESSION_LIMITS, SIGN_IN_COOKIE } from './sessions';
import type { Pending } from './sign-in';
import { KEPT_EMAIL_EXTRA_SECONDS, type StepName, pendingSeconds, stepSeconds } from './step-limits';

/**
 * The cookies sign-in writes. The pending step is sealed (it carries the provider's challenge, and
 * during enrollment the TOTP secret) and lasts five minutes, or fifteen for hardware-key registration
 * (the provider's access token), counted from when its challenge was asked for, so no rewrite extends
 * it; the step itself closes earlier, at the limit step-limits.ts names (docs/adr/0081). Once the
 * provider has accepted the password, a second sealed cookie keeps the email for fifteen minutes past
 * the step, so starting again fills it in; it holds nothing else and ends wherever the attempt does,
 * except at a step's expiry, which is what it is for. The session cookie lasts the 12-hour absolute
 * limit; the device cookie lasts 400 days. The adapters set HttpOnly, Secure, SameSite=Lax and path /
 * on every cookie.
 */

const PENDING_PURPOSE = 'sign-in-pending';
const KEPT_EMAIL_PURPOSE = 'sign-in-email';

/** What the web layer seals beside the flow's Pending: added properties, so a value sealed by the release before reads as a Pending with none. */
export interface StepMeta {
  /** When the provider issued this step's challenge (the server's clock, epoch ms): the limit counts from here. */
  readonly startedAt?: number;
  /** An invited person's setup steps: this one's number and how many (absent: no marker). */
  readonly setup?: { readonly at: number; readonly of: number };
  /** A new password was saved earlier in this attempt: a restart uses it, never the temporary one. */
  readonly passwordSaved?: true;
}

/** A pending step as the cookie holds it: the flow's value and the web layer's StepMeta. */
export type SealedPending = Pending & StepMeta;

/** Which password a restart takes: the invitation's temporary one, or the one chosen in this attempt. */
export type PasswordToUse = 'temporary' | 'chosen';

/** What the kept-email cookie holds: the address, and which password a restart takes when one changed in this attempt. */
export interface KeptEmail {
  readonly email: string;
  readonly use?: PasswordToUse;
}

/** The StepMeta of a sealed value, and nothing else: what a rewrite of the same step carries forward. */
export function stepMetaOf(pending: SealedPending): StepMeta {
  const { startedAt, setup, passwordSaved } = pending;
  return { ...(startedAt === undefined ? {} : { startedAt }), ...(setup === undefined ? {} : { setup }), ...(passwordSaved === undefined ? {} : { passwordSaved }) };
}

/** The flow's own value, without any StepMeta a spread carried along: the meta sealed is always the one given. */
function flowOf(pending: Pending): Pending {
  const { startedAt: _startedAt, setup: _setup, passwordSaved: _passwordSaved, ...flow } = pending as SealedPending;
  return flow;
}

/** Whole seconds from `now` to `expiresAt`, at least one: a cookie's Max-Age. */
function secondsLeft(expiresAt: Date, now: Date): number {
  return Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

export function readPending(cookies: CookieJar, sealer: Sealer, now: Date): SealedPending | undefined {
  return sealer.open(PENDING_PURPOSE, cookies.get(SIGN_IN_COOKIE), now) as SealedPending | undefined;
}

/**
 * Seals the step with its meta. The seal's expiry and the cookie's Max-Age count from `meta.startedAt`, so a rewrite
 * (a refused new password, key registration's options) extends nothing; a value with no stamp counts from `now`.
 */
export function writePending(cookies: CookieJar, sealer: Sealer, pending: Pending, meta: StepMeta, now: Date): void {
  const expiresAt = new Date((meta.startedAt ?? now.getTime()) + pendingSeconds(pending.step) * 1000);
  cookies.set(SIGN_IN_COOKIE, sealer.seal(PENDING_PURPOSE, { ...flowOf(pending), ...meta }, expiresAt), { maxAgeSeconds: secondsLeft(expiresAt, now) });
}

/** When the step closes (epoch ms on the server's clock): its start and its limit; nothing for a value with no stamp. */
export function stepClosesAt(pending: SealedPending): number | undefined {
  return pending.startedAt === undefined ? undefined : pending.startedAt + stepSeconds(pending.step) * 1000;
}

export function clearPending(cookies: CookieJar): void {
  cookies.delete(SIGN_IN_COOKIE);
}

/**
 * Keeps the email for a restart, until fifteen minutes past the step's limit, counted from its start. Written only
 * once the provider has accepted the password, never for the hardware-key step, which any typed address reaches.
 */
export function writeKeptEmail(cookies: CookieJar, sealer: Sealer, kept: KeptEmail, step: StepName, startedAt: number, now: Date): void {
  const expiresAt = new Date(startedAt + (stepSeconds(step) + KEPT_EMAIL_EXTRA_SECONDS) * 1000);
  const value: KeptEmail = kept.use === undefined ? { email: kept.email } : { email: kept.email, use: kept.use };
  cookies.set(KEPT_EMAIL_COOKIE, sealer.seal(KEPT_EMAIL_PURPOSE, value, expiresAt), { maxAgeSeconds: secondsLeft(expiresAt, now) });
}

/** The kept email, or undefined when there is none, or it is expired, tampered, sealed for another purpose or not an address. Never throws. */
export function readKeptEmail(cookies: CookieJar, sealer: Sealer, now: Date): KeptEmail | undefined {
  const opened = sealer.open(KEPT_EMAIL_PURPOSE, cookies.get(KEPT_EMAIL_COOKIE), now);
  if (typeof opened !== 'object' || opened === null) {
    return undefined;
  }
  const { email, use } = opened as { readonly email?: unknown; readonly use?: unknown };
  const parsed = emailAddress.safeParse(email);
  if (!parsed.success || (use !== undefined && use !== 'temporary' && use !== 'chosen')) {
    return undefined;
  }
  return use === undefined ? { email: parsed.data } : { email: parsed.data, use };
}

/** Ends the kept email alone, leaving the pending step: the hardware-key step, which any typed address reaches, keeps none. */
export function clearKeptEmail(cookies: CookieJar): void {
  cookies.delete(KEPT_EMAIL_COOKIE);
}

/** Ends the attempt: no pending step and no kept email. */
export function clearSignIn(cookies: CookieJar): void {
  clearPending(cookies);
  clearKeptEmail(cookies);
}

/** After a successful sign-in: the session and device cookies, and no pending step or kept email. */
export function writeSession(cookies: CookieJar, session: OpenedSession): void {
  clearSignIn(cookies);
  cookies.set(SESSION_COOKIE, session.sessionToken, { maxAgeSeconds: SESSION_LIMITS.absoluteHours * 3600 });
  cookies.set(DEVICE_COOKIE, session.deviceToken, { maxAgeSeconds: DEVICE_COOKIE_DAYS * 24 * 3600 });
}

export function clearSession(cookies: CookieJar): void {
  cookies.delete(SESSION_COOKIE);
}
