import { randomBytes, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, addMembership, asOwner, createMigratedDatabase, createOrganization, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { hashPassword } from '../auth/password';
import { Sealer } from '../auth/seal';
import { DEVICE_COOKIE, KEPT_EMAIL_COOKIE, SESSION_COOKIE, SIGN_IN_COOKIE } from '../auth/sessions';
import { SoftAuthenticator } from '../auth/test-support/soft-authenticator';
import { totpCode } from '../auth/totp';
import { routeHandler } from '../http/handler';
import { RATE_LIMITS, takeRateLimit } from '../http/rate-limit';
import type { AuthStep, TotpSetup } from '../auth/provider';
import type { CookieJar, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { homePage } from './index';
import {
  answerMfa,
  chooseNewPassword,
  enrollPage,
  enrollTotp,
  hardwareKeyOptions,
  hardwareKeyPage,
  hardwareKeyRegistrationOptions,
  mfaPage,
  newPasswordPage,
  registerHardwareKey,
  registerKeyPage,
  restartSignIn,
  signInPage,
  signInWithPassword,
  verifyHardwareKey,
} from './sign-in';

/**
 * The sign-in routes as the browser drives them: each step's cookies and redirects, the lockout
 * state, TOTP enrollment, the hardware-key ceremonies through the JSON route handlers, and each
 * step's limit, the kept email and the setup steps' numbers (docs/adr/0081).
 */

const ORIGIN = 'http://localhost:3100';
const CHEAP = { n: 1024, r: 8, p: 1 };
const PASSWORD = 'Synthetic-Pass-2026';
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
/** The services' default support address (synthetic), which the locked words name (UX-066). */
const SUPPORT = 'support@synthetic.test';
/** The refusal of a locked account, on the password step and the key step (UX-066). */
const LOCKED = `This account was locked after ten failed attempts. Write to ${SUPPORT} from this address to have it unlocked.`;
/** Where a closed hardware-key step goes: back to the key surface, never the password page (UXS-01). */
const KEY_RESTART = { redirect: '/sign-in/hardware-key?reason=step_expired' };

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let store: MemoryDevStore;
let sealer: Sealer;
let services: Services;
let clock = new Date();

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  store = new MemoryDevStore();
  sealer = new Sealer(randomBytes(32));
  services = servicesWith(DevAuthProvider);
});

/** The services on this file's store, sealer and clock, with the dev provider or a subclass of it. */
function servicesWith(Provider: typeof DevAuthProvider): Services {
  return createServices({
    origin: ORIGIN,
    pool: app,
    provider: new Provider({
      store,
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: ORIGIN },
      deliverInvitation: () => Promise.resolve(),
      now: () => clock,
      scryptCost: CHEAP,
    }),
    keys: LocalKeyProvider.random(),
    sealer,
    logger: createLogger({ sink: () => undefined }),
    now: () => clock,
  });
}

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

/** A browser's cookie jar that remembers what each response set, with each write's Max-Age and the names written since `forget`. */
class Browser implements CookieJar {
  readonly values = new Map<string, string>();
  readonly maxAge = new Map<string, number | undefined>();
  written: string[] = [];
  deleted: string[] = [];
  get(name: string): string | undefined {
    return this.values.get(name);
  }
  set(name: string, value: string, options?: { readonly maxAgeSeconds?: number }): void {
    this.values.set(name, value);
    this.maxAge.set(name, options?.maxAgeSeconds);
    this.written.push(name);
  }
  delete(name: string): void {
    this.values.delete(name);
    this.deleted.push(name);
  }
  /** Starts a new record of the names written and deleted. */
  forget(): void {
    this.written = [];
    this.deleted = [];
  }
  header(): string {
    return [...this.values].map(([name, value]) => `${name}=${value}`).join('; ');
  }
  absorb(response: Response): void {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (/Max-Age=0/.test(cookie)) {
        this.delete(name);
      } else {
        this.set(name, value, { maxAgeSeconds: Number(/Max-Age=(\d+)/.exec(cookie)?.[1]) });
      }
    }
  }
}

function step<R>(route: Route<R>, browser: Browser, input?: Record<string, unknown>, using: Services = services) {
  return route.invoke({ cookies: browser, params: {}, input, requestId: `test-${randomUUID()}`, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0' }, using);
}

/** A page with the query parameters the URL carries. */
function page<R>(route: Route<R>, browser: Browser, params: Record<string, unknown>) {
  return route.invoke({ cookies: browser, params, requestId: `test-${randomUUID()}`, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0' }, services);
}

async function json(route: Route, browser: Browser, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await routeHandler(route, () => services)(
    new Request(`${ORIGIN}/api`, { method: 'POST', headers: { cookie: browser.header(), 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  );
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  browser.absorb(response);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function person(options: { readonly temporary?: boolean; readonly totp?: boolean; readonly internal?: boolean } = {}) {
  const id = randomUUID();
  const sub = randomUUID();
  const email = `${id}@synthetic.test`;
  await store.put({ sub, email, passwordHash: await hashPassword(PASSWORD, CHEAP), temporary: options.temporary ?? false, totpSecret: options.totp === false ? null : SECRET, totpLastStep: -1, credentials: [] });
  await asOwner(owner, [], () =>
    owner.query("INSERT INTO \"user\" (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status) VALUES ($1, $2, $3, $4, $5, 'active')", [id, sub, email, options.totp !== false, options.internal ?? false]),
  );
  if (options.internal === true) {
    await addMembership(owner, await createOrganization(owner, 'internal'), id, 'platform_admin');
  }
  return { id, email };
}

function nextCode(secret = SECRET): string {
  clock = new Date(clock.getTime() + 30_000);
  return totpCode(secret, clock);
}

describe('the password and TOTP steps', () => {
  it('moves from the password to the code to a session, setting and clearing the cookies; a wrong code names the code, and one written with a space is taken (FRM-07)', async () => {
    const user = await person();
    const browser = new Browser();
    const started = clock.getTime();
    expect(await step(signInWithPassword, browser, { email: user.email, password: PASSWORD })).toEqual({ status: 'ok', data: { redirect: '/sign-in/mfa' } });
    expect(browser.get(SIGN_IN_COOKIE)).toMatch(/^v1\./);
    expect(await step(mfaPage, browser)).toEqual({ status: 'ok', data: { email: user.email, time: { limitSeconds: 180, warningSeconds: 60, closesAt: started + 180_000, closesIn: 180_000 }, setup: null } });
    expect(await step(answerMfa, browser, { code: 'abc' })).toMatchObject({ status: 'invalid' });
    // FRM-07: a wrong code, after the password proved the account, names the code (and still says it did not match).
    expect(await step(answerMfa, browser, { code: '000000' })).toEqual({
      status: 'ok',
      data: { error: expect.stringContaining('did not match'), issues: [{ field: 'code', message: 'enter the code your authenticator app shows now' }] },
    });
    // FRM-07: a code as an authenticator app shows it, "123 456", is accepted.
    const code = nextCode();
    expect(await step(answerMfa, browser, { code: `${code.slice(0, 3)} ${code.slice(3)}` })).toEqual({ status: 'ok', data: { redirect: '/' } });
    expect(browser.get(SIGN_IN_COOKIE)).toBeUndefined();
    expect(browser.get(SESSION_COOKIE)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(browser.get(DEVICE_COOKIE)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await step(homePage, browser)).toMatchObject({ status: 'ok', shell: { email: user.email, practices: [] } });
    // A step without its pending cookie starts again.
    expect(await step(mfaPage, browser)).toEqual({ status: 'ok', data: { redirect: '/sign-in?reason=step_expired' } });
    expect(await step(answerMfa, browser, { code: nextCode() })).toEqual({ status: 'ok', data: { redirect: '/sign-in?reason=step_expired' } });
  });

  it('takes an invited user through a new password and enrollment; a weak or mismatched password is an issue on its own field, and a code with a hyphen is taken (FRM-07)', async () => {
    const invited = await person({ temporary: true, totp: false });
    const browser = new Browser();
    const started = clock.getTime();
    expect(await step(signInWithPassword, browser, { email: invited.email, password: PASSWORD })).toEqual({ status: 'ok', data: { redirect: '/sign-in/new-password' } });
    expect(await step(newPasswordPage, browser)).toEqual({
      status: 'ok',
      data: { email: invited.email, time: { limitSeconds: 180, warningSeconds: 60, closesAt: started + 180_000, closesIn: 180_000 }, setup: { at: 1, of: 2 } },
    });
    // FRM-07: two passwords that differ, and a weak one, are issues on their own fields.
    expect(await step(chooseNewPassword, browser, { password: 'Chosen-Pass-2026', confirm: 'Chosen-Pass-2027' })).toEqual({
      status: 'invalid',
      issues: [{ field: 'confirm', message: 'the two passwords do not match: type the same password in both fields' }],
    });
    expect(await step(chooseNewPassword, browser, { password: '', confirm: '' })).toMatchObject({ status: 'invalid', issues: [{ field: 'password', message: 'fill this in' }] });
    expect(await step(chooseNewPassword, browser, { password: 'weakpassword', confirm: 'weakpassword' })).toEqual({
      status: 'ok',
      data: { error: 'Choose a stronger password.', issues: [{ field: 'password', message: 'it still needs an uppercase letter, a digit and a symbol' }] },
    });
    expect(await step(chooseNewPassword, browser, { password: 'Chosen-Pass-2026', confirm: 'Chosen-Pass-2026' })).toEqual({ status: 'ok', data: { redirect: '/sign-in/enroll' } });
    const enrollment = await step(enrollPage, browser);
    if (enrollment.status !== 'ok' || !('secret' in enrollment.data)) {
      throw new Error('expected the enrollment secret');
    }
    expect(enrollment.data).toMatchObject({ email: invited.email, uri: expect.stringContaining('otpauth://totp/') });
    expect(await step(enrollTotp, browser, { code: '000000' })).toMatchObject({ status: 'ok', data: { error: 'That did not match.', issues: [{ field: 'code' }] } });
    // FRM-07: a code copied with a hyphen, "123-456", is accepted.
    const code = nextCode(enrollment.data.secret);
    expect(await step(enrollTotp, browser, { code: `${code.slice(0, 3)}-${code.slice(3)}` })).toEqual({ status: 'ok', data: { redirect: '/' } });
    expect(await step(enrollPage, new Browser())).toEqual({ status: 'ok', data: { redirect: '/sign-in?reason=step_expired' } });
    expect(await step(newPasswordPage, new Browser())).toEqual({ status: 'ok', data: { redirect: '/sign-in?reason=step_expired' } });
    expect(await step(chooseNewPassword, new Browser(), { password: 'x', confirm: 'x' })).toEqual({ status: 'ok', data: { redirect: '/sign-in?reason=step_expired' } });
    expect(await step(enrollTotp, new Browser(), { code: '123456' })).toEqual({ status: 'ok', data: { redirect: '/sign-in?reason=step_expired' } });
  });

  it('shows the lockout state after ten failures, naming the support address to write to (UX-066)', async () => {
    const user = await person();
    const browser = new Browser();
    for (let attempt = 0; attempt < 9; attempt += 1) {
      // The first step names no field: a wrong password and an unknown email read the same (account enumeration).
      expect(await step(signInWithPassword, browser, { email: user.email, password: 'Wrong-Pass-2026!' })).toEqual({
        status: 'ok',
        data: { error: 'That did not match. Check the email, the password or the code, and try again.' },
      });
    }
    expect(await step(signInWithPassword, browser, { email: user.email, password: 'Wrong-Pass-2026!' })).toEqual({
      status: 'ok',
      data: { error: LOCKED, locked: true },
    });
    expect(await step(signInWithPassword, browser, { email: user.email, password: PASSWORD })).toEqual({ status: 'ok', data: { error: LOCKED, locked: true } });
  });

  it('sends a step that expired back to the start', async () => {
    const user = await person();
    const browser = new Browser();
    await step(signInWithPassword, browser, { email: user.email, password: PASSWORD });
    clock = new Date(clock.getTime() + 6 * 60_000);
    expect(await step(answerMfa, browser, { code: nextCode() })).toEqual({ status: 'ok', data: { redirect: '/sign-in?reason=step_expired' } });
  });
});

describe('the hardware-key route handlers', () => {
  it('registers an internal user’s key after a TOTP sign-in, then signs in with it', async () => {
    const staff = await person({ internal: true });
    const key = new SoftAuthenticator(ORIGIN);
    const browser = new Browser();
    await step(signInWithPassword, browser, { email: staff.email, password: PASSWORD });
    const code = nextCode();
    const started = clock.getTime();
    expect(await step(answerMfa, browser, { code })).toEqual({ status: 'ok', data: { redirect: '/sign-in/register-key' } });
    expect(browser.get(SESSION_COOKIE)).toBeUndefined();
    // SGN-04: a staff member enrolled without a key registers one with no number; key registration lasts fifteen minutes.
    expect(await step(registerKeyPage, browser)).toEqual({
      status: 'ok',
      data: { email: staff.email, time: { limitSeconds: 900, warningSeconds: 120, closesAt: started + 900_000, closesIn: 900_000 }, setup: null },
    });
    const options = await json(hardwareKeyRegistrationOptions, browser, {});
    expect(options.status).toBe(200);
    const created = key.create(options.body.options as never);
    expect(await json(registerHardwareKey, browser, { response: JSON.stringify(created) })).toEqual({ status: 200, body: { redirect: '/sign-in/hardware-key?reason=key_registered' } });
    expect(await json(registerHardwareKey, browser, { response: JSON.stringify(created) })).toEqual({ status: 200, body: { redirect: '/sign-in?reason=step_expired' } });
    expect(await json(hardwareKeyRegistrationOptions, browser, {})).toEqual({ status: 200, body: { redirect: '/sign-in?reason=step_expired' } });

    const signIn = new Browser();
    const begun = await json(hardwareKeyOptions, signIn, { email: staff.email });
    expect(begun.status).toBe(200);
    expect(await json(verifyHardwareKey, signIn, { response: 'not json' })).toMatchObject({ status: 400 });
    expect(await json(verifyHardwareKey, signIn, { response: JSON.stringify(key.get(begun.body.options as never)) })).toEqual({ status: 200, body: { redirect: '/' } });
    expect(signIn.get(SESSION_COOKIE)).toBeDefined();
    expect(await step(registerKeyPage, new Browser())).toEqual({ status: 'ok', data: { redirect: '/sign-in?reason=step_expired' } });
    // UXS-01: a key step that is no longer there goes back to the key surface, not the password page.
    expect(await json(verifyHardwareKey, new Browser(), { response: JSON.stringify(key.get(begun.body.options as never)) })).toEqual({ status: 200, body: KEY_RESTART });
  });

  it('refuses a TOTP-only session for an internal user who has a key, and a locked account its options, naming the support address (UX-066)', async () => {
    const staff = await person({ internal: true });
    const key = new SoftAuthenticator(ORIGIN);
    const browser = new Browser();
    await step(signInWithPassword, browser, { email: staff.email, password: PASSWORD });
    await step(answerMfa, browser, { code: nextCode() });
    const options = await json(hardwareKeyRegistrationOptions, browser, {});
    await json(registerHardwareKey, browser, { response: JSON.stringify(key.create(options.body.options as never)) });
    const again = new Browser();
    await step(signInWithPassword, again, { email: staff.email, password: PASSWORD });
    expect(await step(answerMfa, again, { code: nextCode() })).toEqual({ status: 'ok', data: { redirect: '/sign-in/hardware-key?reason=hardware_key_required' } });
    await owner.query('UPDATE "user" SET locked_at = now() WHERE id = $1', [staff.id]);
    expect(await json(hardwareKeyOptions, new Browser(), { email: staff.email })).toEqual({ status: 200, body: { error: LOCKED, locked: true } });
    expect(await json(hardwareKeyOptions, new Browser(), { email: 'not an email' })).toMatchObject({ status: 400 });
  });

  it('UXS-01: sends a key step that closed, at its limit or at the provider, back to the key surface, keeping no email', async () => {
    const staff = await person({ internal: true });
    const answer = JSON.stringify({ id: 'synthetic-credential', rawId: 'synthetic-credential', type: 'public-key', response: {}, clientExtensionResults: {} });

    const stale = new Browser();
    expect(await step(hardwareKeyOptions, stale, { email: staff.email })).toMatchObject({ status: 'ok', data: { options: expect.any(Object) } });
    clock = new Date(clock.getTime() + 3 * 60_000);
    expect(await step(verifyHardwareKey, stale, { response: answer })).toEqual({ status: 'ok', data: KEY_RESTART });

    const closed = new Browser();
    const expiring = servicesWith(ExpiringKey);
    expect(await step(hardwareKeyOptions, closed, { email: staff.email }, expiring)).toMatchObject({ status: 'ok', data: { options: expect.any(Object) } });
    closed.forget();
    expect(await step(verifyHardwareKey, closed, { response: answer }, expiring)).toEqual({ status: 'ok', data: KEY_RESTART });
    expect(closed.deleted).toEqual([SIGN_IN_COOKIE]);
    expect(closed.written).toEqual([]);
    expect(closed.get(KEPT_EMAIL_COOKIE)).toBeUndefined();
  });

  it('answers a body that is not JSON as invalid', async () => {
    const response = await routeHandler(hardwareKeyOptions, () => services)(new Request(`${ORIGIN}/api`, { method: 'POST', body: 'not json' }));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});

/** A sealed step as the release before this one wrote it: the flow's value with no StepMeta. */
function sealedBefore(browser: Browser, expiresAt: number): void {
  const opened = services.sealer.open('sign-in-pending', browser.get(SIGN_IN_COOKIE), clock) as Record<string, unknown>;
  const { startedAt: _startedAt, setup: _setup, passwordSaved: _passwordSaved, ...flow } = opened;
  browser.set(SIGN_IN_COOKIE, services.sealer.seal('sign-in-pending', flow, new Date(expiresAt)));
}

/** A person's failed sign-ins: the counter and the audit events. */
async function failures(userId: string): Promise<{ readonly count: number; readonly events: number }> {
  const { rows } = await owner.query<{ count: number; events: string }>(
    "SELECT failed_sign_ins AS count, (SELECT count(*) FROM audit_event WHERE object_id = $1 AND action = 'sign_in_failed') AS events FROM \"user\" WHERE id = $1",
    [userId],
  );
  return { count: rows[0]?.count ?? -1, events: Number(rows[0]?.events ?? -1) };
}

/** The dev provider, except that enrolment's setup key is asked for after its sign-in session ended. */
class ExpiringSetup extends DevAuthProvider {
  override beginTotpSetup(): Promise<TotpSetup | { readonly kind: 'expired' }> {
    return Promise.resolve({ kind: 'expired' });
  }
}

/** The dev provider, except that a key's assertion arrives after the provider's challenge lapsed. */
class ExpiringKey extends DevAuthProvider {
  override completeKeySignIn(): Promise<AuthStep> {
    return Promise.resolve({ kind: 'expired' });
  }
}

const RESTARTED = { status: 'ok', data: { redirect: '/sign-in?reason=step_expired' } };
/** Start again's answer: the sign-in page, which fills in the kept email. */
const STARTED_AGAIN = { status: 'ok', data: { redirect: '/sign-in?reason=restarted' } };

/** The grants the provider was given back, in order. */
const released: string[] = [];

/** The dev provider, recording each grant given back (its own release takes none, as it holds none). */
class RecordingRelease extends DevAuthProvider {
  override release(...grant: string[]): Promise<void> {
    released.push(...grant);
    return super.release();
  }
}

describe('the sign-in steps’ limits, the kept email and the setup steps’ numbers (docs/adr/0081)', () => {
  it('SGN-01: closes a step at its limit, counted from the challenge, before asking the provider and counting no failure', async () => {
    const user = await person();
    const browser = new Browser();
    const started = clock.getTime();
    await step(signInWithPassword, browser, { email: user.email, password: PASSWORD });
    expect(await step(mfaPage, browser)).toEqual({ status: 'ok', data: { email: user.email, time: { limitSeconds: 180, warningSeconds: 60, closesAt: started + 180_000, closesIn: 180_000 }, setup: null } });
    clock = new Date(started + 170_000);
    expect(await step(mfaPage, browser)).toMatchObject({ status: 'ok', data: { time: { closesAt: started + 180_000, closesIn: 10_000 } } });
    clock = new Date(started + 180_000);
    browser.forget();
    expect(await step(mfaPage, browser)).toEqual(RESTARTED);
    expect(await step(answerMfa, browser, { code: totpCode(SECRET, clock) })).toEqual(RESTARTED);
    // The pending cookie's own five minutes have not run out, and nothing deleted it: the provider's `expired` would
    // have, through settle, so the provider was never asked.
    expect(browser.get(SIGN_IN_COOKIE)).toBeDefined();
    expect(browser.deleted).toEqual([]);
    expect(browser.written).toEqual([]);
    expect(await failures(user.id)).toEqual({ count: 0, events: 0 });
    // A second before the limit, the press reaches the provider.
    const again = new Browser();
    const restarted = clock.getTime();
    await step(signInWithPassword, again, { email: user.email, password: PASSWORD });
    clock = new Date(restarted + 179_000);
    expect(await step(answerMfa, again, { code: totpCode(SECRET, clock) })).toEqual({ status: 'ok', data: { redirect: '/' } });
  });

  it('SGN-01: keeps the start when a refused new password rewrites the step', async () => {
    const invited = await person({ temporary: true, totp: false });
    const browser = new Browser();
    const started = clock.getTime();
    await step(signInWithPassword, browser, { email: invited.email, password: PASSWORD });
    clock = new Date(started + 60_000);
    browser.forget();
    expect(await step(chooseNewPassword, browser, { password: 'weakpassword', confirm: 'weakpassword' })).toMatchObject({ status: 'ok', data: { error: 'Choose a stronger password.' } });
    expect(browser.written).toEqual([SIGN_IN_COOKIE]);
    expect(browser.maxAge.get(SIGN_IN_COOKIE)).toBe(240);
    expect(await step(newPasswordPage, browser)).toMatchObject({ status: 'ok', data: { time: { closesAt: started + 180_000, closesIn: 120_000 }, setup: { at: 1, of: 2 } } });
    clock = new Date(started + 180_000);
    expect(await step(newPasswordPage, browser)).toEqual(RESTARTED);
  });

  it('SGN-01: leaves a step sealed before the deploy to the provider, with no countdown and no kept email', async () => {
    const user = await person();
    const browser = new Browser();
    const started = clock.getTime();
    await step(signInWithPassword, browser, { email: user.email, password: PASSWORD });
    sealedBefore(browser, started + 300_000);
    browser.delete(KEPT_EMAIL_COOKIE);
    expect(await step(mfaPage, browser)).toEqual({ status: 'ok', data: { email: user.email, time: { limitSeconds: 180, warningSeconds: 60 }, setup: null } });
    clock = new Date(started + 200_000);
    browser.forget();
    expect(await step(answerMfa, browser, { code: totpCode(SECRET, clock) })).toEqual(RESTARTED);
    expect(browser.deleted).toEqual([SIGN_IN_COOKIE]);
    expect(browser.get(KEPT_EMAIL_COOKIE)).toBeUndefined();
  });

  it('SGN-03: keeps the email only once the password is proven, and fills it only after a step closed or a restart', async () => {
    const user = await person();
    const browser = new Browser();
    expect(await page(signInPage, browser, { reason: 'step_expired' })).toEqual({ status: 'ok', data: { reason: 'step_expired', email: null, use: null, supportEmail: SUPPORT } });
    await step(signInWithPassword, browser, { email: user.email, password: PASSWORD });
    expect(browser.maxAge.get(KEPT_EMAIL_COOKIE)).toBe(1080);
    const kept = browser.get(KEPT_EMAIL_COOKIE) ?? '';
    expect(kept).toMatch(/^v1\./);
    expect(kept).not.toContain(user.email);
    expect(kept).not.toContain(Buffer.from(user.email).toString('base64url'));
    expect(await page(signInPage, browser, { reason: 'step_expired' })).toEqual({ status: 'ok', data: { reason: 'step_expired', email: user.email, use: null, supportEmail: SUPPORT } });
    expect(await page(signInPage, browser, { reason: 'restarted' })).toEqual({ status: 'ok', data: { reason: 'restarted', email: user.email, use: null, supportEmail: SUPPORT } });
    expect(await page(signInPage, browser, {})).toEqual({ status: 'ok', data: { reason: null, email: null, use: null, supportEmail: SUPPORT } });
    expect(await page(signInPage, browser, { reason: 'signed_out' })).toEqual({ status: 'ok', data: { reason: 'signed_out', email: null, use: null, supportEmail: SUPPORT } });
    // An email in the URL fills nothing: the parameters are stripped to the reason.
    expect(await page(signInPage, new Browser(), { reason: 'restarted', email: 'someone@synthetic.test' })).toEqual({ status: 'ok', data: { reason: 'restarted', email: null, use: null, supportEmail: SUPPORT } });
    const tampered = new Browser();
    tampered.set(KEPT_EMAIL_COOKIE, `${kept.slice(0, -4)}${kept.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`);
    expect(await page(signInPage, tampered, { reason: 'step_expired' })).toEqual({ status: 'ok', data: { reason: 'step_expired', email: null, use: null, supportEmail: SUPPORT } });
    const copied = new Browser();
    copied.set(KEPT_EMAIL_COOKIE, browser.get(SIGN_IN_COOKIE) ?? '');
    expect(await page(signInPage, copied, { reason: 'step_expired' })).toEqual({ status: 'ok', data: { reason: 'step_expired', email: null, use: null, supportEmail: SUPPORT } });
    // The hardware-key page's data is unchanged: no kept email is ever read there.
    expect(await page(hardwareKeyPage, browser, { reason: 'step_expired' })).toEqual({ status: 'ok', data: { reason: 'step_expired', supportEmail: SUPPORT } });
  });

  it('SGN-03: says which password a restart takes: the temporary one until a new one is saved, then the chosen one', async () => {
    const invited = await person({ temporary: true, totp: false });
    const browser = new Browser();
    await step(signInWithPassword, browser, { email: invited.email, password: PASSWORD });
    expect(await page(signInPage, browser, { reason: 'step_expired' })).toMatchObject({ data: { email: invited.email, use: 'temporary' } });
    expect(await step(chooseNewPassword, browser, { password: 'Chosen-Pass-2026', confirm: 'Chosen-Pass-2026' })).toEqual({ status: 'ok', data: { redirect: '/sign-in/enroll' } });
    expect(await page(signInPage, browser, { reason: 'restarted' })).toMatchObject({ data: { email: invited.email, use: 'chosen' } });
    // The temporary password no longer works; the chosen one leads to enrolment, one step left, so no number.
    const restart = new Browser();
    expect(await step(signInWithPassword, restart, { email: invited.email, password: PASSWORD })).toEqual({ status: 'ok', data: { error: expect.stringContaining('did not match') } });
    expect(await step(signInWithPassword, restart, { email: invited.email, password: 'Chosen-Pass-2026' })).toEqual({ status: 'ok', data: { redirect: '/sign-in/enroll' } });
    expect(await step(enrollPage, restart)).toMatchObject({ status: 'ok', data: { setup: null } });
    expect(await page(signInPage, restart, { reason: 'step_expired' })).toEqual({ status: 'ok', data: { reason: 'step_expired', email: invited.email, use: null, supportEmail: SUPPORT } });
  });

  it('SGN-03: says the chosen password when the setup key is asked for after the new password was saved and the step closed (review R-01)', async () => {
    const invited = await person({ temporary: true, totp: false });
    const browser = new Browser();
    await step(signInWithPassword, browser, { email: invited.email, password: PASSWORD });
    expect(await step(chooseNewPassword, browser, { password: 'Chosen-Pass-2026', confirm: 'Chosen-Pass-2026' }, servicesWith(ExpiringSetup))).toEqual(RESTARTED);
    expect(browser.get(SIGN_IN_COOKIE)).toBeUndefined();
    expect(await page(signInPage, browser, { reason: 'step_expired' })).toEqual({ status: 'ok', data: { reason: 'step_expired', email: invited.email, use: 'chosen', supportEmail: SUPPORT } });
    expect(await step(signInWithPassword, browser, { email: invited.email, password: 'Chosen-Pass-2026' })).toEqual({ status: 'ok', data: { redirect: '/sign-in/enroll' } });
  });

  it('SGN-03: ends the attempt on every first step that opens none, alike for any address (enumeration)', async () => {
    const user = await person();
    /** A browser holding a live code step and a kept email. */
    const primed = async () => {
      const browser = new Browser();
      await step(signInWithPassword, browser, { email: user.email, password: PASSWORD });
      expect(browser.get(KEPT_EMAIL_COOKIE)).toBeDefined();
      browser.forget();
      return browser;
    };
    const unknown = await primed();
    const wrong = await primed();
    const nobody = await step(signInWithPassword, unknown, { email: `${randomUUID()}@synthetic.test`, password: PASSWORD });
    const mistyped = await step(signInWithPassword, wrong, { email: user.email, password: 'Wrong-Pass-2026!' });
    expect(nobody).toEqual(mistyped);
    expect(unknown.written).toEqual(wrong.written);
    expect(unknown.deleted).toEqual(wrong.deleted);
    expect(unknown.written).not.toContain(KEPT_EMAIL_COOKIE);
    expect(unknown.deleted).toEqual(expect.arrayContaining([SIGN_IN_COOKIE, KEPT_EMAIL_COOKIE]));
    expect([...unknown.values.keys(), ...wrong.values.keys()]).toEqual([]);
    // The hardware-key step is open to any typed address: it writes its step and ends a kept email, alike for each.
    for (const email of [user.email, `${randomUUID()}@synthetic.test`]) {
      const browser = await primed();
      expect((await json(hardwareKeyOptions, browser, { email })).status).toBe(200);
      expect(browser.get(SIGN_IN_COOKIE)).toMatch(/^v1\./);
      expect(browser.get(KEPT_EMAIL_COOKIE)).toBeUndefined();
      expect(browser.written).toEqual([SIGN_IN_COOKIE]);
      expect(browser.deleted).toEqual([KEPT_EMAIL_COOKIE]);
    }
  });

  it('SGN-03: ends the kept email at a session, a lock, a key required and a key registered, and keeps it past an expiry', async () => {
    const user = await person();
    const session = new Browser();
    await step(signInWithPassword, session, { email: user.email, password: PASSWORD });
    expect(await step(answerMfa, session, { code: nextCode() })).toEqual({ status: 'ok', data: { redirect: '/' } });
    expect([session.get(SIGN_IN_COOKIE), session.get(KEPT_EMAIL_COOKIE)]).toEqual([undefined, undefined]);

    const locked = new Browser();
    await step(signInWithPassword, locked, { email: user.email, password: PASSWORD });
    await owner.query('UPDATE "user" SET failed_sign_ins = 9 WHERE id = $1', [user.id]);
    expect(await step(answerMfa, locked, { code: '000000' })).toMatchObject({ status: 'ok', data: { locked: true } });
    expect([locked.get(SIGN_IN_COOKIE), locked.get(KEPT_EMAIL_COOKIE)]).toEqual([undefined, undefined]);

    const staff = await person({ internal: true });
    const key = new SoftAuthenticator(ORIGIN);
    const registering = new Browser();
    await step(signInWithPassword, registering, { email: staff.email, password: PASSWORD });
    await step(answerMfa, registering, { code: nextCode() });
    expect(registering.get(KEPT_EMAIL_COOKIE)).toBeDefined();
    const options = await json(hardwareKeyRegistrationOptions, registering, {});
    expect(await json(registerHardwareKey, registering, { response: JSON.stringify(key.create(options.body.options as never)) })).toEqual({
      status: 200,
      body: { redirect: '/sign-in/hardware-key?reason=key_registered' },
    });
    expect([registering.get(SIGN_IN_COOKIE), registering.get(KEPT_EMAIL_COOKIE)]).toEqual([undefined, undefined]);

    const required = new Browser();
    await step(signInWithPassword, required, { email: staff.email, password: PASSWORD });
    expect(await step(answerMfa, required, { code: nextCode() })).toEqual({ status: 'ok', data: { redirect: '/sign-in/hardware-key?reason=hardware_key_required' } });
    expect([required.get(SIGN_IN_COOKIE), required.get(KEPT_EMAIL_COOKIE)]).toEqual([undefined, undefined]);

    // A provider expiry (a step sealed before the deploy, past the provider's three minutes) ends the step only.
    const other = await person();
    const expired = new Browser();
    const started = clock.getTime();
    await step(signInWithPassword, expired, { email: other.email, password: PASSWORD });
    sealedBefore(expired, started + 300_000);
    clock = new Date(started + 200_000);
    expect(await step(answerMfa, expired, { code: totpCode(SECRET, clock) })).toEqual(RESTARTED);
    expect(expired.get(SIGN_IN_COOKIE)).toBeUndefined();
    expect(await page(signInPage, expired, { reason: 'step_expired' })).toMatchObject({ data: { email: other.email } });
  });

  it('SGN-03: ends the attempt, the kept email with it, when the account is found disabled after the password (review SEC-02)', async () => {
    const user = await person();
    const browser = new Browser();
    await step(signInWithPassword, browser, { email: user.email, password: PASSWORD });
    expect(browser.get(KEPT_EMAIL_COOKIE)).toBeDefined();
    await owner.query('UPDATE "user" SET status = \'disabled\' WHERE id = $1', [user.id]);
    expect(await step(answerMfa, browser, { code: nextCode() })).toEqual({ status: 'ok', data: { error: expect.stringContaining('did not match') } });
    expect([browser.get(SIGN_IN_COOKIE), browser.get(KEPT_EMAIL_COOKIE)]).toEqual([undefined, undefined]);
    expect(await page(signInPage, browser, { reason: 'restarted' })).toEqual({ status: 'ok', data: { reason: 'restarted', email: null, use: null, supportEmail: SUPPORT } });
  });

  it('SGN-03: Start again ends the step it leaves, before the sign-in page, and keeps the email (review SEC-01)', async () => {
    // The code step: neither its page nor a valid code opens it again.
    const user = await person();
    const coded = new Browser();
    await step(signInWithPassword, coded, { email: user.email, password: PASSWORD });
    coded.forget();
    expect(await step(restartSignIn, coded, {})).toEqual(STARTED_AGAIN);
    expect(coded.deleted).toEqual([SIGN_IN_COOKIE]);
    expect(coded.written).toEqual([]);
    expect(await step(mfaPage, coded)).toEqual(RESTARTED);
    expect(await step(answerMfa, coded, { code: nextCode() })).toEqual(RESTARTED);
    expect(await page(signInPage, coded, { reason: 'restarted' })).toEqual({ status: 'ok', data: { reason: 'restarted', email: user.email, use: null, supportEmail: SUPPORT } });
    expect(await failures(user.id)).toEqual({ count: 0, events: 0 });

    // An invited person's new password, then enrolment: the setup key's page and its code are closed too.
    const invited = await person({ temporary: true, totp: false });
    const choosing = new Browser();
    await step(signInWithPassword, choosing, { email: invited.email, password: PASSWORD });
    expect(await step(restartSignIn, choosing, {})).toEqual(STARTED_AGAIN);
    expect(await step(newPasswordPage, choosing)).toEqual(RESTARTED);
    expect(await step(chooseNewPassword, choosing, { password: 'Chosen-Pass-2026', confirm: 'Chosen-Pass-2026' })).toEqual(RESTARTED);
    expect(await page(signInPage, choosing, { reason: 'restarted' })).toMatchObject({ data: { email: invited.email, use: 'temporary' } });
    const enrolling = new Browser();
    await step(signInWithPassword, enrolling, { email: invited.email, password: PASSWORD });
    await step(chooseNewPassword, enrolling, { password: 'Chosen-Pass-2026', confirm: 'Chosen-Pass-2026' });
    const setup = await step(enrollPage, enrolling);
    expect(setup).toMatchObject({ status: 'ok', data: { secret: expect.any(String) } });
    const secret = (setup as { readonly data: { readonly secret: string } }).data.secret;
    expect(await step(restartSignIn, enrolling, {})).toEqual(STARTED_AGAIN);
    expect(await step(enrollPage, enrolling)).toEqual(RESTARTED);
    expect(await step(enrollTotp, enrolling, { code: nextCode(secret) })).toEqual(RESTARTED);
    expect(await page(signInPage, enrolling, { reason: 'restarted' })).toMatchObject({ data: { email: invited.email, use: 'chosen' } });

    // Key registration: its page and both ceremonies are closed, and the provider's grant is given back.
    const staff = await person({ internal: true });
    const registering = new Browser();
    await step(signInWithPassword, registering, { email: staff.email, password: PASSWORD });
    await step(answerMfa, registering, { code: nextCode() });
    expect(await step(registerKeyPage, registering)).toMatchObject({ status: 'ok', data: { email: staff.email } });
    // A key's answer made before Start again, to the step's own challenge, and sent after it.
    const options = await json(hardwareKeyRegistrationOptions, registering, {});
    const answer = JSON.stringify(new SoftAuthenticator(ORIGIN).create(options.body.options as never));
    released.length = 0;
    expect(await step(restartSignIn, registering, {}, servicesWith(RecordingRelease))).toEqual(STARTED_AGAIN);
    expect(released).toHaveLength(1);
    expect(await step(registerKeyPage, registering)).toEqual(RESTARTED);
    expect(await json(hardwareKeyRegistrationOptions, registering, {})).toEqual({ status: 200, body: { redirect: '/sign-in?reason=step_expired' } });
    expect(await json(registerHardwareKey, registering, { response: answer })).toEqual({ status: 200, body: { redirect: '/sign-in?reason=step_expired' } });
    expect((await store.byEmail(staff.email))?.credentials).toEqual([]);
    expect(await page(signInPage, registering, { reason: 'restarted' })).toMatchObject({ data: { email: staff.email } });

    // With no step to end, it ends nothing, gives nothing back and still goes to the start.
    const none = new Browser();
    released.length = 0;
    expect(await step(restartSignIn, none, {}, servicesWith(RecordingRelease))).toEqual(STARTED_AGAIN);
    expect(released).toEqual([]);
    expect(none.written).toEqual([]);
  });

  it('SGN-03: a Start again its rate limit refuses still ends the step in the browser, and keeps the email (review SEC-01-R1)', async () => {
    // The step's count spent, as codes and key ceremonies spend it (each counts against the pending step it names).
    const spend = async (browser: Browser) => {
      for (let hit = 0; hit < (RATE_LIMITS.mfa.account?.hits ?? 0); hit += 1) {
        await takeRateLimit(app, sealer, 'mfa', { account: browser.get(SIGN_IN_COOKIE) });
      }
    };
    const refused = { status: 'rate_limited', retryAfterSeconds: expect.any(Number) };

    const user = await person();
    const coded = new Browser();
    await step(signInWithPassword, coded, { email: user.email, password: PASSWORD });
    await spend(coded);
    coded.forget();
    expect(await step(restartSignIn, coded, {})).toEqual(refused);
    expect([coded.deleted, coded.written]).toEqual([[SIGN_IN_COOKIE], []]);
    expect(await step(mfaPage, coded)).toEqual(RESTARTED);
    expect(await page(signInPage, coded, { reason: 'restarted' })).toMatchObject({ data: { email: user.email } });

    const invited = await person({ temporary: true, totp: false });
    const enrolling = new Browser();
    await step(signInWithPassword, enrolling, { email: invited.email, password: PASSWORD });
    await step(chooseNewPassword, enrolling, { password: 'Chosen-Pass-2026', confirm: 'Chosen-Pass-2026' });
    expect(await step(enrollPage, enrolling)).toMatchObject({ status: 'ok', data: { secret: expect.any(String) } });
    await spend(enrolling);
    expect(await step(restartSignIn, enrolling, {})).toEqual(refused);
    expect(await step(enrollPage, enrolling)).toEqual(RESTARTED);
    expect(await page(signInPage, enrolling, { reason: 'restarted' })).toMatchObject({ data: { email: invited.email, use: 'chosen' } });

    // Key registration: the browser holds nothing; the grant, not given back while refused, lapses at the step's limit.
    const staff = await person({ internal: true });
    const registering = new Browser();
    await step(signInWithPassword, registering, { email: staff.email, password: PASSWORD });
    await step(answerMfa, registering, { code: nextCode() });
    await spend(registering);
    released.length = 0;
    expect(await step(restartSignIn, registering, {}, servicesWith(RecordingRelease))).toEqual(refused);
    expect(released).toEqual([]);
    expect(await step(registerKeyPage, registering)).toEqual(RESTARTED);
    expect(await page(signInPage, registering, { reason: 'restarted' })).toMatchObject({ data: { email: staff.email } });
  });

  it('SGN-04: numbers an invited person’s setup steps from the server, two for a customer and three for a staff member', async () => {
    const customer = await person({ temporary: true, totp: false });
    const browser = new Browser();
    await step(signInWithPassword, browser, { email: customer.email, password: PASSWORD });
    expect(await step(newPasswordPage, browser)).toMatchObject({ data: { setup: { at: 1, of: 2 } } });
    await step(chooseNewPassword, browser, { password: 'Chosen-Pass-2026', confirm: 'Chosen-Pass-2026' });
    expect(await step(enrollPage, browser)).toMatchObject({ data: { setup: { at: 2, of: 2 } } });

    const staff = await person({ temporary: true, totp: false, internal: true });
    const invited = new Browser();
    await step(signInWithPassword, invited, { email: staff.email, password: PASSWORD });
    expect(await step(newPasswordPage, invited)).toMatchObject({ data: { setup: { at: 1, of: 3 } } });
    await step(chooseNewPassword, invited, { password: 'Chosen-Pass-2026', confirm: 'Chosen-Pass-2026' });
    const enrollment = await step(enrollPage, invited);
    if (enrollment.status !== 'ok' || !('secret' in enrollment.data)) {
      throw new Error('expected the enrollment secret');
    }
    expect(enrollment.data.setup).toEqual({ at: 2, of: 3 });
    expect(await step(enrollTotp, invited, { code: nextCode(enrollment.data.secret) })).toEqual({ status: 'ok', data: { redirect: '/sign-in/register-key' } });
    const started = clock.getTime();
    expect(await step(registerKeyPage, invited)).toEqual({
      status: 'ok',
      data: { email: staff.email, time: { limitSeconds: 900, warningSeconds: 120, closesAt: started + 900_000, closesIn: 900_000 }, setup: { at: 3, of: 3 } },
    });

    // A staff member who starts again after the password was saved, before enrolling: two steps left, numbered.
    const other = await person({ temporary: true, totp: false, internal: true });
    const first = new Browser();
    await step(signInWithPassword, first, { email: other.email, password: PASSWORD });
    await step(chooseNewPassword, first, { password: 'Chosen-Pass-2026', confirm: 'Chosen-Pass-2026' });
    expect(await page(signInPage, first, { reason: 'restarted' })).toMatchObject({ data: { email: other.email, use: 'chosen' } });
    const restart = new Browser();
    expect(await step(signInWithPassword, restart, { email: other.email, password: 'Chosen-Pass-2026' })).toEqual({ status: 'ok', data: { redirect: '/sign-in/enroll' } });
    const again = await step(enrollPage, restart);
    if (again.status !== 'ok' || !('secret' in again.data)) {
      throw new Error('expected the enrollment secret');
    }
    expect(again.data.setup).toEqual({ at: 1, of: 2 });
    await step(enrollTotp, restart, { code: nextCode(again.data.secret) });
    expect(await step(registerKeyPage, restart)).toMatchObject({ data: { setup: { at: 2, of: 2 } } });
  });
});
