import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, readDatabaseUrl, withActor } from '@tp/db';
import type { ScopeClient, ScopePool } from '@tp/db/runtime';
import { type MigratedDatabase, addMembership, asOwner, createMigratedDatabase, createOrganization, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { hashPassword } from '../auth/password';
import { newRegistrationCode, registrationCodeDigest } from '../auth/registration-code';
import { Sealer } from '../auth/seal';
import { DEVICE_COOKIE, KEPT_EMAIL_COOKIE, SESSION_COOKIE, SIGN_IN_COOKIE } from '../auth/sessions';
import { SoftAuthenticator } from '../auth/test-support/soft-authenticator';
import { totpCode } from '../auth/totp';
import { routeHandler } from '../http/handler';
import { RATE_LIMITS, takeRateLimit } from '../http/rate-limit';
import { type AuthStep, ClientCredentialError, type TotpSetup } from '../auth/provider';
import type { CookieJar, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { homePage } from './index';
import {
  answerMfa,
  answerRegistrationCode,
  chooseNewPassword,
  enrollPage,
  enrollTotp,
  forgotPasswordPage,
  hardwareKeyOptions,
  hardwareKeyPage,
  hardwareKeyRegistrationOptions,
  mfaPage,
  newPasswordPage,
  registerHardwareKey,
  registerKeyPage,
  resetConfirm,
  resetRequest,
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
/** The refusal of an enrolment outside a live invitation (docs/adr/0088, D3): the way out, by the support address. */
const NOT_OPEN = `This account can’t set up a second factor here. Ask your organization’s administrator, or write to ${SUPPORT}.`;
/** Where a closed hardware-key step goes: back to the key surface, never the password page (UXS-01). */
const KEY_RESTART = { redirect: '/sign-in/hardware-key?reason=step_expired' };

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let store: MemoryDevStore;
let sealer: Sealer;
let services: Services;
let clock = new Date();
/** The reset codes the provider mailed, oldest first (synthetic accounts only). */
const mailed: { readonly email: string; readonly code: string }[] = [];
/** Every structured log line the services wrote. */
const logLines: string[] = [];
/** The reset request's floor runs on its own clock, which only its sleeps move: each sleep, in order. */
const slept: number[] = [];
let paceAt = 0;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  store = new MemoryDevStore();
  sealer = new Sealer(randomBytes(32));
  services = servicesWith(DevAuthProvider);
});

/** The services on this file's store, sealer and clock, with the dev provider or a subclass of it, on this pool. */
function servicesWith(Provider: typeof DevAuthProvider, pool: ScopePool<ScopeClient> = app): Services {
  return createServices({
    origin: ORIGIN,
    pool,
    provider: new Provider({
      store,
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: ORIGIN },
      deliverInvitation: () => Promise.resolve(),
      deliverResetCode: (email, code) => {
        mailed.push({ email, code });
        return Promise.resolve();
      },
      now: () => clock,
      scryptCost: CHEAP,
    }),
    keys: LocalKeyProvider.random(),
    sealer,
    logger: createLogger({ sink: (line) => logLines.push(line) }),
    now: () => clock,
    pace: {
      now: () => paceAt,
      sleep: (ms) => {
        slept.push(ms);
        paceAt += ms;
        return Promise.resolve();
      },
    },
  });
}

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

/** The application's pool, except that queries matching `match` fail the first `times` times (a synthetic failure). */
function failing(match: RegExp, times: number): ScopePool<ScopeClient> {
  let left = times;
  return {
    connect: async () => {
      const client = await app.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') {
            return (text: unknown, values?: unknown[]) => {
              if (left > 0 && typeof text === 'string' && match.test(text)) {
                left -= 1;
                return Promise.reject(new Error('synthetic failure'));
              }
              return target.query(text as string, values);
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
      });
    },
  };
}

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

async function person(options: { readonly temporary?: boolean; readonly totp?: boolean; readonly internal?: boolean; readonly status?: 'invited' | 'active' | 'disabled' } = {}) {
  const id = randomUUID();
  const sub = randomUUID();
  const email = `${id}@synthetic.test`;
  await store.put({ sub, email, passwordHash: await hashPassword(PASSWORD, CHEAP), temporary: options.temporary ?? false, totpSecret: options.totp === false ? null : SECRET, totpLastStep: -1, credentials: [] });
  await asOwner(owner, [], () =>
    owner.query('INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status) VALUES ($1, $2, $3, $4, $5, $6)', [
      id,
      sub,
      email,
      options.totp !== false,
      options.internal ?? false,
      // A person with no second factor is an invitee (docs/adr/0088, D3: only an invitation enrols one).
      options.status ?? (options.totp === false ? 'invited' : 'active'),
    ]),
  );
  // An invitee's invitation is on the membership the console created for it: an internal user's, or a group's.
  const invited = (options.status ?? (options.totp === false ? 'invited' : 'active')) === 'invited';
  if (options.internal === true || invited) {
    const organization = await createOrganization(owner, options.internal === true ? 'internal' : 'group');
    const membership = await addMembership(owner, organization, id, options.internal === true ? 'platform_admin' : 'viewer');
    if (invited) {
      await liveInvitation(organization, membership, id);
    }
  }
  return { id, email };
}

/** A live invitation of the person, sent a minute ago, as the console writes one: only inside one may a factor be enrolled (docs/adr/0088, D3). */
async function liveInvitation(organization: string, membership: string, userId: string): Promise<void> {
  const inviter = randomUUID();
  await asOwner(owner, [], () =>
    owner.query('INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status) VALUES ($1, $2, $3, true, false, $4)', [
      inviter,
      randomUUID(),
      `${inviter}@synthetic.test`,
      'active',
    ]),
  );
  await asOwner(owner, [], () =>
    owner.query(
      `INSERT INTO invitation (organization_id, membership_id, user_id, invited_by, sent_at, expires_at, last_sent_by)
       VALUES ($1, $2, $3, $4, now() - interval '1 minute', now() + interval '7 days' - interval '1 minute', $4)`,
      [organization, membership, userId, inviter],
    ),
  );
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
    expect(await step(mfaPage, browser)).toEqual({ status: 'ok', data: { email: user.email, time: { limitSeconds: 180, warningSeconds: 60, closesAt: started + 180_000, closesIn: 180_000 }, setup: null, supportEmail: SUPPORT } });
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
      issues: [{ field: 'confirm', message: 'the two passwords do not match; type the same password in both fields' }],
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

  it('SEC-22: refuses enrolment outside a live invitation with words that name the way out, ending the attempt (docs/adr/0088, D3)', async () => {
    const active = await person({ status: 'active', totp: false });
    const browser = new Browser();
    expect(await step(signInWithPassword, browser, { email: active.email, password: PASSWORD })).toEqual({ status: 'ok', data: { error: NOT_OPEN, final: true } });
    expect([browser.get(SIGN_IN_COOKIE), browser.get(KEPT_EMAIL_COOKIE)]).toEqual([undefined, undefined]);
    expect(logLines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((entry) => entry.msg === 'security event: second-factor enrolment refused').at(-1)).toMatchObject({
      level: 'warn',
      user_id: active.id,
    });
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
    expect(await step(mfaPage, browser)).toEqual({ status: 'ok', data: { email: user.email, time: { limitSeconds: 180, warningSeconds: 60, closesAt: started + 180_000, closesIn: 180_000 }, setup: null, supportEmail: SUPPORT } });
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
    expect(await step(mfaPage, browser)).toEqual({ status: 'ok', data: { email: user.email, time: { limitSeconds: 180, warningSeconds: 60 }, setup: null, supportEmail: SUPPORT } });
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

/** The last code mailed to an address. */
function codeFor(email: string): string {
  const code = mailed.filter((entry) => entry.email === email).at(-1)?.code;
  if (code === undefined) {
    throw new Error('expected a mailed code');
  }
  return code;
}

/** A code that is not the one mailed. */
const wrongCode = (code: string): string => `${code.slice(0, 5)}${String((Number(code.slice(5)) + 1) % 10)}`;

/** The structured log lines written since `from`, with this message. */
function loggedSince(from: number, message: string): Record<string, unknown>[] {
  return logLines
    .slice(from)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((entry) => entry.msg === message);
}

const CHOSEN = 'Chosen-Pass-2026';
const CODE_SENT = { status: 'ok', data: { redirect: '/sign-in/forgot-password?reason=code_sent' } };
/** Where a closed reset step goes: the forgot page's first phase, which says so (4.5). */
const RESET_CLOSED = { status: 'ok', data: { redirect: '/sign-in/forgot-password?reason=step_expired' } };
/** Every code problem's one refusal, on the code field (4.4). */
const CODE_REFUSED = { status: 'ok', data: { error: 'That did not match.', issues: [{ field: 'code', message: 'the code did not match, or it has expired; check it, or send a new code' }] } };
const PHASE_ONE = { status: 'ok', data: { phase: 'request', reason: null } };

/** Spends an address's `sign_in` count, as password attempts and reset requests spend it. */
async function spendSignIn(email: string, leave = 0): Promise<void> {
  for (let hit = 0; hit < (RATE_LIMITS.sign_in.account?.hits ?? 0) - leave; hit += 1) {
    await takeRateLimit(app, sealer, 'sign_in', { account: email });
  }
}

describe('the forgotten password (UX-006; SGN-05 to SGN-07)', () => {
  it('SGN-05: answers a request alike for every address, with the same redirect, cookies and data, and mails a code only to an active account with a second factor', async () => {
    const helper = await person();
    const active = await person();
    const locked = await person();
    await owner.query('UPDATE "user" SET locked_at = now() WHERE id = $1', [locked.id]);
    const invited = await person({ status: 'invited', temporary: true, totp: false });
    const notEnrolled = await person({ status: 'invited', totp: false });
    // Active with no second factor, as a console factor reset (UX PR 65) leaves an account: no code (review SEC-B1).
    const activeNotEnrolled = await person({ status: 'active', totp: false });
    const disabled = await person({ status: 'disabled' });
    const addresses = {
      active: active.email,
      locked: locked.email,
      invited: invited.email,
      notEnrolled: notEnrolled.email,
      activeNotEnrolled: activeNotEnrolled.email,
      disabled: disabled.email,
      unknown: `${randomUUID()}@synthetic.test`,
    };
    const asked = vi.spyOn(services.provider, 'requestPasswordReset');
    const sent = mailed.length;
    const seen: unknown[] = [];
    for (const [name, email] of Object.entries(addresses)) {
      // A browser holding a kept email from an earlier attempt: any typed address reaches this step, so it ends it.
      const browser = new Browser();
      await step(signInWithPassword, browser, { email: helper.email, password: PASSWORD });
      expect(browser.get(KEPT_EMAIL_COOKIE)).toBeDefined();
      browser.forget();
      slept.length = 0;
      const started = clock.getTime();
      expect(await step(resetRequest, browser, { email }), name).toEqual(CODE_SENT);
      expect(slept, name).toEqual([1500]);
      expect([browser.written, browser.deleted], name).toEqual([[SIGN_IN_COOKIE], [KEPT_EMAIL_COOKIE]]);
      expect(browser.maxAge.get(SIGN_IN_COOKIE), name).toBe(900);
      expect(browser.get(SIGN_IN_COOKIE), name).not.toContain(email);
      const shown = await page(forgotPasswordPage, browser, { reason: 'code_sent' });
      expect(shown, name).toEqual({
        status: 'ok',
        data: { phase: 'confirm', reason: 'code_sent', email, startedAt: started, time: { limitSeconds: 900, warningSeconds: 120, closesAt: started + 900_000, closesIn: 900_000 }, supportEmail: SUPPORT },
      });
      seen.push(JSON.stringify(shown).replace(email, '<typed>'));
      expect(await page(signInPage, browser, { reason: 'password_reset' }), name).toMatchObject({ data: { email: null } });
    }
    expect(new Set(seen).size).toBe(1);
    expect(asked.mock.calls.map(([email]) => email)).toEqual([active.email, locked.email]);
    asked.mockRestore();
    expect(mailed.slice(sent).map((entry) => entry.email)).toEqual([active.email, locked.email]);
  });

  it('SGN-05: answers a request whose provider send or audit write fails as an unknown address, with one error log of IDs only (S-3)', async () => {
    const user = await person();
    /** One request: its answer, cookies, floor and page, the address masked, and the lines it logged. */
    const ask = async (email: string, using: Services = services) => {
      const browser = new Browser();
      slept.length = 0;
      const from = logLines.length;
      const answer = await step(resetRequest, browser, { email }, using);
      const shown = await page(forgotPasswordPage, browser, { reason: 'code_sent' });
      const seen = JSON.stringify({ answer, slept: [...slept], written: browser.written, deleted: browser.deleted, shown }).replace(email, '<typed>');
      return { seen, lines: logLines.slice(from), failed: loggedSince(from, 'password reset request failed') };
    };
    const nobody = await ask(`${randomUUID()}@synthetic.test`);
    expect(JSON.parse(nobody.seen)).toMatchObject({ answer: CODE_SENT, slept: [1500] });
    expect(nobody.failed).toEqual([]);

    const broken = vi.spyOn(services.provider, 'requestPasswordReset').mockRejectedValueOnce(new Error('synthetic provider failure'));
    const provider = await ask(user.email);
    broken.mockRestore();
    const audit = await ask(user.email, servicesWith(DevAuthProvider, failing(/INSERT INTO audit_event/, 1)));
    for (const [name, failed] of Object.entries({ provider, audit })) {
      expect(failed.seen, name).toBe(nobody.seen);
      expect(failed.failed, name).toHaveLength(1);
      expect(Object.keys(failed.failed[0] ?? {}).sort(), name).toEqual(['error_code', 'level', 'msg', 'request_id', 'time']);
      expect(failed.failed[0], name).toMatchObject({ level: 'error', error_code: 'Error' });
      expect(failed.lines.join('\n'), name).not.toMatch(new RegExp(`${user.email}|synthetic`));
    }
  });

  it('SGN-05: counts a request in `sign_in` by the typed address, shared with password attempts; the refusal reads alike and logs the request ID only', async () => {
    const user = await person();
    const unknown = `${randomUUID()}@synthetic.test`;
    // One hit left for each: a wrong password spends the user's, a reset request the unknown address's.
    await spendSignIn(user.email, 1);
    await spendSignIn(unknown, 1);
    expect(await step(signInWithPassword, new Browser(), { email: user.email, password: 'Wrong-Pass-2026!' })).toMatchObject({ status: 'ok' });
    expect(await step(resetRequest, new Browser(), { email: unknown })).toEqual(CODE_SENT);
    const from = logLines.length;
    const refused = { status: 'rate_limited', retryAfterSeconds: expect.any(Number) };
    const known = new Browser();
    const nobody = new Browser();
    expect(await step(resetRequest, known, { email: user.email })).toEqual(refused);
    expect(await step(resetRequest, nobody, { email: unknown })).toEqual(refused);
    expect([known.written, known.deleted]).toEqual([[], []]);
    expect([nobody.written, nobody.deleted]).toEqual([[], []]);
    const limited = loggedSince(from, 'password reset rate limited');
    expect(limited).toHaveLength(2);
    for (const entry of limited) {
      expect(Object.keys(entry).sort()).toEqual(['level', 'msg', 'request_id', 'time']);
    }
    expect(logLines.slice(from).join('\n')).not.toMatch(new RegExp(`${user.email}|${unknown}`));
  });

  it('SGN-06: refuses every code problem alike on the code field, checks the policy first, refuses a changed address without the provider, and keeps the step live', async () => {
    const user = await person();
    const browser = new Browser();
    expect(await step(resetRequest, browser, { email: user.email })).toEqual(CODE_SENT);
    const code = codeFor(user.email);
    const from = logLines.length;
    const confirm = (input: Record<string, unknown>, on: Browser = browser) => step(resetConfirm, on, { email: user.email, code, password: CHOSEN, confirm: CHOSEN, ...input });
    expect(await confirm({ code: wrongCode(code) })).toEqual(CODE_REFUSED);
    expect(await confirm({ code: 'abc' })).toEqual({ status: 'invalid', issues: [{ field: 'code', message: 'enter the six digits from the email' }] });
    expect(await confirm({ password: 'weakpassword', confirm: 'weakpassword' })).toEqual({
      status: 'ok',
      data: { error: 'Choose a stronger password.', issues: [{ field: 'password', message: 'it still needs an uppercase letter, a digit and a symbol' }] },
    });
    expect(await confirm({ confirm: 'Chosen-Pass-2027' })).toEqual({ status: 'invalid', issues: [{ field: 'confirm', message: 'the two passwords do not match; type the same password in both fields' }] });
    // A hidden email changed from the sealed one: the same refusal, and the provider is never asked.
    const asked = vi.spyOn(services.provider, 'confirmPasswordReset');
    expect(await confirm({ email: `${randomUUID()}@synthetic.test` })).toEqual(CODE_REFUSED);
    expect(asked).not.toHaveBeenCalled();
    asked.mockRestore();
    // An unknown address's own step: the same refusal.
    const nobody = new Browser();
    const unknown = `${randomUUID()}@synthetic.test`;
    await step(resetRequest, nobody, { email: unknown });
    expect(await step(resetConfirm, nobody, { email: unknown, code, password: CHOSEN, confirm: CHOSEN })).toEqual(CODE_REFUSED);
    // A replaced code: Send a new code mails another, and the first no longer works.
    expect(await step(resetRequest, browser, { email: user.email })).toEqual(CODE_SENT);
    expect(codeFor(user.email)).not.toBe(code);
    expect(await confirm({})).toEqual(CODE_REFUSED);
    // Nothing above counted a failure, and the step is still live.
    expect(await failures(user.id)).toEqual({ count: 0, events: 0 });
    expect(await step(forgotPasswordPage, browser)).toMatchObject({ status: 'ok', data: { phase: 'confirm', email: user.email } });
    const refusedLogs = loggedSince(from, 'password reset code refused');
    expect(refusedLogs.length).toBeGreaterThanOrEqual(3);
    expect(logLines.slice(from).join('\n')).not.toContain(user.email);
    expect(logLines.slice(from).join('\n')).not.toContain(code);
    // Five wrong tries spend the code (the dev twin's cap): the right one is then refused too.
    const fresh = codeFor(user.email);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await confirm({ code: wrongCode(fresh) })).toEqual(CODE_REFUSED);
    }
    expect(await confirm({ code: fresh })).toEqual(CODE_REFUSED);
    expect(browser.written).not.toContain(KEPT_EMAIL_COOKIE);
  });

  it('SGN-06: counts the confirm in `sign_in` by the sealed address: with that count spent, the right code is refused before the provider and the password is unchanged', async () => {
    const user = await person();
    const browser = new Browser();
    expect(await step(resetRequest, browser, { email: user.email })).toEqual(CODE_SENT);
    const code = codeFor(user.email);
    const before = (await store.byEmail(user.email))?.passwordHash;
    // Password attempts and reset requests spend this count; a fresh step's cookie does not reset it (4.3).
    await spendSignIn(user.email);
    const from = logLines.length;
    const asked = vi.spyOn(services.provider, 'confirmPasswordReset');
    expect(await step(resetConfirm, browser, { email: user.email, code, password: CHOSEN, confirm: CHOSEN })).toEqual({ status: 'rate_limited', retryAfterSeconds: expect.any(Number) });
    expect(asked).not.toHaveBeenCalled();
    asked.mockRestore();
    expect((await store.byEmail(user.email))?.passwordHash).toBe(before);
    expect(loggedSince(from, 'password reset rate limited')).toHaveLength(1);
    expect(await step(forgotPasswordPage, browser)).toMatchObject({ status: 'ok', data: { phase: 'confirm', email: user.email } });
  });

  it('SGN-07: a reset ends every session, lands on the sign-in page with the email kept, and the next sign-in asks for the code; the old password is refused', async () => {
    const user = await person();
    const signedIn = new Browser();
    await step(signInWithPassword, signedIn, { email: user.email, password: PASSWORD });
    expect(await step(answerMfa, signedIn, { code: nextCode() })).toEqual({ status: 'ok', data: { redirect: '/' } });
    const sessionsBefore = await owner.query('SELECT id, ended_at, end_reason FROM user_session WHERE user_id = $1 ORDER BY id', [user.id]);
    const browser = new Browser();
    expect(await step(resetRequest, browser, { email: user.email })).toEqual(CODE_SENT);
    // A request changes no session (review SEC-N3).
    expect((await owner.query('SELECT id, ended_at, end_reason FROM user_session WHERE user_id = $1 ORDER BY id', [user.id])).rows).toEqual(sessionsBefore.rows);
    expect(await step(homePage, signedIn)).toMatchObject({ status: 'ok' });
    browser.forget();
    expect(await step(resetConfirm, browser, { email: user.email, code: codeFor(user.email), password: CHOSEN, confirm: CHOSEN })).toEqual({ status: 'ok', data: { redirect: '/sign-in?reason=password_reset' } });
    expect(browser.deleted).toContain(SIGN_IN_COOKIE);
    expect(browser.written).toEqual([KEPT_EMAIL_COOKIE]);
    expect(await step(homePage, signedIn)).not.toMatchObject({ status: 'ok' });
    expect(await page(signInPage, browser, { reason: 'password_reset' })).toEqual({ status: 'ok', data: { reason: 'password_reset', email: user.email, use: 'chosen', supportEmail: SUPPORT } });
    expect(await page(signInPage, browser, {})).toEqual({ status: 'ok', data: { reason: null, email: null, use: null, supportEmail: SUPPORT } });
    expect(await step(signInWithPassword, new Browser(), { email: user.email, password: PASSWORD })).toEqual({ status: 'ok', data: { error: expect.stringContaining('did not match') } });
    expect(await step(signInWithPassword, browser, { email: user.email, password: CHOSEN })).toEqual({ status: 'ok', data: { redirect: '/sign-in/mfa' } });
  });

  it('SGN-07: a locked account is reset and lands on password_reset_locked, keeping no email', async () => {
    const user = await person();
    await owner.query('UPDATE "user" SET locked_at = now() WHERE id = $1', [user.id]);
    const browser = new Browser();
    expect(await step(resetRequest, browser, { email: user.email })).toEqual(CODE_SENT);
    expect(await step(resetConfirm, browser, { email: user.email, code: codeFor(user.email), password: CHOSEN, confirm: CHOSEN })).toEqual({
      status: 'ok',
      data: { redirect: '/sign-in?reason=password_reset_locked' },
    });
    expect([browser.get(SIGN_IN_COOKIE), browser.get(KEPT_EMAIL_COOKIE)]).toEqual([undefined, undefined]);
    expect(browser.written).not.toContain(KEPT_EMAIL_COOKIE);
    expect(await page(signInPage, browser, { reason: 'password_reset_locked' })).toEqual({ status: 'ok', data: { reason: 'password_reset_locked', email: null, use: null, supportEmail: SUPPORT } });
    expect(await step(signInWithPassword, new Browser(), { email: user.email, password: CHOSEN })).toEqual({ status: 'ok', data: { error: LOCKED, locked: true } });
  });

  it('SGN-06: Send a new code refused by its rate limit keeps the step; Use a different email and Back to sign in end it; a closed step lands on the first phase', async () => {
    const user = await person();
    const browser = new Browser();
    expect(await step(resetRequest, browser, { email: user.email })).toEqual(CODE_SENT);
    // Each phase shows only its own reason (review UXR-12).
    expect(await page(forgotPasswordPage, browser, { reason: 'step_expired' })).toMatchObject({ status: 'ok', data: { phase: 'confirm', reason: null } });
    expect(await page(forgotPasswordPage, new Browser(), { reason: 'code_sent' })).toEqual(PHASE_ONE);
    expect(await page(forgotPasswordPage, new Browser(), { reason: 'step_expired' })).toEqual({ status: 'ok', data: { phase: 'request', reason: 'step_expired' } });
    expect(await page(forgotPasswordPage, new Browser(), {})).toEqual(PHASE_ONE);

    await spendSignIn(user.email);
    browser.forget();
    expect(await step(resetRequest, browser, { email: user.email })).toEqual({ status: 'rate_limited', retryAfterSeconds: expect.any(Number) });
    expect([browser.written, browser.deleted]).toEqual([[], []]);
    expect(await step(forgotPasswordPage, browser)).toMatchObject({ status: 'ok', data: { phase: 'confirm', email: user.email } });

    // Use a different email: the step ends, the first phase shows with nothing filled (review UXR-01).
    expect(await step(restartSignIn, browser, { to: 'forgot_password' })).toEqual({ status: 'ok', data: { redirect: '/sign-in/forgot-password' } });
    expect([browser.written, browser.deleted]).toEqual([[], [SIGN_IN_COOKIE]]);
    expect(await step(forgotPasswordPage, browser)).toEqual(PHASE_ONE);

    // Back to sign in: the step ends and the sign-in page fills nothing.
    const other = await person();
    const back = new Browser();
    await step(resetRequest, back, { email: other.email });
    back.forget();
    expect(await step(restartSignIn, back, { to: 'sign_in' })).toEqual({ status: 'ok', data: { redirect: '/sign-in' } });
    expect([back.written, back.deleted]).toEqual([[], [SIGN_IN_COOKIE]]);
    expect(await step(forgotPasswordPage, back)).toEqual(PHASE_ONE);
    expect(await page(signInPage, back, { reason: 'restarted' })).toMatchObject({ data: { email: null } });

    // Start again on a reset step, with no destination named, goes to the forgot page (4.5).
    const plain = new Browser();
    await step(resetRequest, plain, { email: other.email });
    expect(await step(restartSignIn, plain, {})).toEqual({ status: 'ok', data: { redirect: '/sign-in/forgot-password' } });

    // A step at its limit: the page shows the first phase, and the confirm lands there with the reason.
    const closing = new Browser();
    const started = clock.getTime();
    await step(resetRequest, closing, { email: other.email });
    clock = new Date(started + 899_000);
    expect(await step(forgotPasswordPage, closing)).toMatchObject({ status: 'ok', data: { phase: 'confirm', time: { closesIn: 1000 } } });
    clock = new Date(started + 900_000);
    expect(await step(forgotPasswordPage, closing)).toEqual(PHASE_ONE);
    expect(await step(resetConfirm, closing, { email: other.email, code: codeFor(other.email), password: CHOSEN, confirm: CHOSEN })).toEqual(RESET_CLOSED);
    expect(closing.written).not.toContain(KEPT_EMAIL_COOKIE);
  });
});

describe('SEC-20: a refused client credential (docs/adr/0088, D2)', () => {
  const COULD_NOT_CONTINUE = { status: 'ok', data: { error: 'Sign-in could not continue. Start again.', final: true } };

  it('SEC-20: ends a sign-in, a code step and a reset confirmation with the generic words, counting no failure and keeping no step', async () => {
    const user = await person();
    const browser = new Browser();
    const refused = vi.spyOn(services.provider, 'signIn').mockRejectedValueOnce(new ClientCredentialError('NotAuthorizedException'));
    expect(await step(signInWithPassword, browser, { email: user.email, password: PASSWORD })).toEqual(COULD_NOT_CONTINUE);
    refused.mockRestore();
    expect(browser.get(SIGN_IN_COOKIE)).toBeUndefined();
    // A code step: the step ends, and nothing is counted.
    const coded = new Browser();
    await step(signInWithPassword, coded, { email: user.email, password: PASSWORD });
    const answer = vi.spyOn(services.provider, 'answerTotp').mockRejectedValueOnce(new ClientCredentialError('NotAuthorizedException'));
    expect(await step(answerMfa, coded, { code: nextCode() })).toEqual(COULD_NOT_CONTINUE);
    answer.mockRestore();
    expect(coded.get(SIGN_IN_COOKIE)).toBeUndefined();
    expect(coded.get(KEPT_EMAIL_COOKIE)).toBeUndefined();
    expect(await failures(user.id)).toEqual({ count: 0, events: 0 });
    // A reset confirmation: no code refusal, and the step ends.
    const resetting = new Browser();
    expect(await step(resetRequest, resetting, { email: user.email })).toEqual(CODE_SENT);
    const confirm = vi.spyOn(services.provider, 'confirmPasswordReset').mockRejectedValueOnce(new ClientCredentialError('NotAuthorizedException'));
    expect(await step(resetConfirm, resetting, { email: user.email, code: codeFor(user.email), password: CHOSEN, confirm: CHOSEN })).toEqual(COULD_NOT_CONTINUE);
    confirm.mockRestore();
    expect(resetting.get(SIGN_IN_COOKIE)).toBeUndefined();
  });
});

describe('SGN-17 and SGN-18: a step begun before a password reset, and a reset whose outcome is unknown (docs/adr/0093)', () => {
  const COULD_NOT_CONTINUE = { status: 'ok', data: { error: 'Sign-in could not continue. Start again.', final: true } };

  /** The sealed step as the release before this rule wrote it: with no start of its attempt. */
  function withoutBegan(browser: Browser): void {
    const opened = services.sealer.open('sign-in-pending', browser.get(SIGN_IN_COOKIE), clock) as Record<string, unknown>;
    const { began: _began, ...before } = opened;
    browser.set(SIGN_IN_COOKIE, services.sealer.seal('sign-in-pending', before, new Date(clock.getTime() + 180_000)));
  }

  it('SGN-17: a code step in another browser, begun before the reset, starts again after it in the existing words’ place, opening no session and counting no failure', async () => {
    const user = await person();
    const stale = new Browser();
    await step(signInWithPassword, stale, { email: user.email, password: PASSWORD });
    const resetting = new Browser();
    expect(await step(resetRequest, resetting, { email: user.email })).toEqual(CODE_SENT);
    expect(await step(resetConfirm, resetting, { email: user.email, code: codeFor(user.email), password: CHOSEN, confirm: CHOSEN })).toEqual({ status: 'ok', data: { redirect: '/sign-in?reason=password_reset' } });
    const from = logLines.length;
    stale.forget();
    expect(await step(answerMfa, stale, { code: nextCode() })).toEqual(RESTARTED);
    expect(stale.deleted).toContain(SIGN_IN_COOKIE);
    expect((await owner.query('SELECT 1 FROM user_session WHERE user_id = $1 AND ended_at IS NULL', [user.id])).rowCount).toBe(0);
    expect(await failures(user.id)).toEqual({ count: 0, events: 0 });
    expect(loggedSince(from, 'security event: sign-in step refused after a password reset')).toEqual([expect.objectContaining({ level: 'warn', user_id: user.id, error_code: 'mfa' })]);
  });

  it('SGN-17: a step the release before sealed, with no start, is no step: its page and its action start again, and the provider is not asked', async () => {
    const user = await person();
    const browser = new Browser();
    await step(signInWithPassword, browser, { email: user.email, password: PASSWORD });
    withoutBegan(browser);
    expect(await step(mfaPage, browser)).toEqual(RESTARTED);
    const answer = vi.spyOn(services.provider, 'answerTotp');
    expect(await step(answerMfa, browser, { code: nextCode() })).toEqual(RESTARTED);
    expect(answer.mock.calls).toEqual([]);
    answer.mockRestore();
    // The reset step holds no proof and carries no start: it stays a step.
    const resetting = new Browser();
    expect(await step(resetRequest, resetting, { email: user.email })).toEqual(CODE_SENT);
    expect(await step(resetConfirm, resetting, { email: user.email, code: wrongCode(codeFor(user.email)), password: CHOSEN, confirm: CHOSEN })).toMatchObject({ status: 'ok', data: { error: 'That did not match.' } });
  });

  it('SGN-17: a key-registration step with no start is no step, and the grant it seals is given back before the person starts again', async () => {
    const staff = await person({ internal: true });
    const browser = new Browser();
    await step(signInWithPassword, browser, { email: staff.email, password: PASSWORD });
    expect(await step(answerMfa, browser, { code: nextCode() })).toEqual({ status: 'ok', data: { redirect: '/sign-in/register-key' } });
    withoutBegan(browser);
    const release = vi.spyOn(services.provider, 'release');
    const begin = vi.spyOn(services.provider, 'beginKeyRegistration');
    expect(await json(hardwareKeyRegistrationOptions, browser, {})).toEqual({ status: 200, body: { redirect: '/sign-in?reason=step_expired' } });
    expect(release.mock.calls).toHaveLength(1);
    expect(begin.mock.calls).toEqual([]);
    expect(browser.deleted).toContain(SIGN_IN_COOKIE);
    release.mockRestore();
    begin.mockRestore();
  });

  it('SGN-18: a confirmation whose outcome the provider did not give ends the step with the generic words, never the code’s refusal, and ends the account’s sessions', async () => {
    const user = await person();
    const signedIn = new Browser();
    await step(signInWithPassword, signedIn, { email: user.email, password: PASSWORD });
    expect(await step(answerMfa, signedIn, { code: nextCode() })).toEqual({ status: 'ok', data: { redirect: '/' } });
    const resetting = new Browser();
    expect(await step(resetRequest, resetting, { email: user.email })).toEqual(CODE_SENT);
    const from = logLines.length;
    const confirm = vi.spyOn(services.provider, 'confirmPasswordReset').mockResolvedValueOnce({ kind: 'outcome_unknown', code: 'InternalErrorException' });
    resetting.forget();
    expect(await step(resetConfirm, resetting, { email: user.email, code: codeFor(user.email), password: CHOSEN, confirm: CHOSEN })).toEqual(COULD_NOT_CONTINUE);
    confirm.mockRestore();
    expect(resetting.get(SIGN_IN_COOKIE)).toBeUndefined();
    expect(resetting.get(KEPT_EMAIL_COOKIE)).toBeUndefined();
    expect(await step(homePage, signedIn)).not.toMatchObject({ status: 'ok' });
    expect(loggedSince(from, 'security event: password reset outcome unknown')).toEqual([expect.objectContaining({ level: 'error', user_id: user.id, error_code: 'InternalErrorException' })]);
    expect(loggedSince(from, 'password reset code refused')).toEqual([]);
    expect((await owner.query('SELECT 1 FROM password_notice WHERE user_id = $1', [user.id])).rowCount).toBe(0);
  });
});

describe('SGN-27: the code screen of key registration after a removal (docs/adr/0095)', () => {
  /** One answer whether no registration is open or the code is wrong: nothing in it says which, or that the account exists. */
  const REFUSED = { status: 'ok', data: { error: 'That code did not open registration. Check the code PaidWhole gave you and try again.' } };
  const CODE_SCREEN = { redirect: '/sign-in/register-key' };
  const sha = (value: Uint8Array | string): Buffer => createHash('sha256').update(value).digest();
  const requestId = (): string => `test-${randomUUID()}`;
  const tries = async (removal: string): Promise<number | undefined> =>
    (await owner.query<{ tries: number }>('SELECT registration_code_tries AS tries FROM hardware_key_removal WHERE id = $1', [removal])).rows[0]?.tries;

  async function seededWithTriggersOff(sql: string, values: unknown[]): Promise<void> {
    await owner.query('BEGIN');
    try {
      await owner.query("SET LOCAL session_replication_role = 'replica'");
      await owner.query(sql, values);
      await owner.query('COMMIT');
    } catch (error) {
      await owner.query('ROLLBACK');
      throw error;
    }
  }

  /** A platform administrator eight days in the role, with a recorded key; `session` opens a key session just now. */
  async function administrator(): Promise<{ readonly id: string; session(): Promise<string> }> {
    const { id } = await person();
    await seededWithTriggersOff("INSERT INTO membership (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, 'platform_admin', now() - interval '8 days')", [
      randomUUID(),
      await createOrganization(owner, 'internal'),
      id,
    ]);
    await seededWithTriggersOff('UPDATE "user" SET hardware_key_required = true WHERE id = $1', [id]);
    const credential = sha(randomBytes(16));
    const began = async (): Promise<string> => (await app.query<{ at: string }>('SELECT sign_in_step_began()::text AS at')).rows[0]?.at ?? '';
    const at = await began();
    await withActor(app, id, (scope) => scope.client.query('SELECT * FROM hardware_key_record($1, $2, $3, $4::timestamptz, $5)', [credential, randomBytes(77), null, at, requestId()]));
    return {
      id,
      session: async () => {
        const start = await began();
        return withActor(app, id, async (scope) => {
          const device = await scope.client.query<{ id: string }>("INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, 'Test browser') RETURNING id", [id, sha(randomBytes(32)).toString('hex')]);
          const session = await scope.client.query<{ id: string }>(
            "INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at, key_credential_sha256) VALUES ($1, $2, $3, 'webauthn', $4::timestamptz, $5) RETURNING id",
            [id, device.rows[0]?.id, sha(randomBytes(32)).toString('hex'), start, credential],
          );
          return session.rows[0]?.id ?? '';
        });
      },
    };
  }

  /** A staff member whose key two administrators removed: registration is closed. `open` opens it with a new code. */
  async function closedStaff() {
    const staff = await person({ internal: true });
    const first = new Browser();
    await step(signInWithPassword, first, { email: staff.email, password: PASSWORD });
    await step(answerMfa, first, { code: nextCode() });
    const options = await json(hardwareKeyRegistrationOptions, first, {});
    await json(registerHardwareKey, first, { response: JSON.stringify(new SoftAuthenticator(ORIGIN).create(options.body.options as never)) });
    const [requester, confirmer] = [await administrator(), await administrator()];
    const asked = await requester.session();
    const removal = await withActor(app, requester.id, async (scope) => (await scope.client.query<{ id: string }>('SELECT hardware_key_removal_request($1, $2, $3) AS id', [staff.id, asked, requestId()])).rows[0]?.id ?? '');
    const confirming = await confirmer.session();
    await withActor(app, confirmer.id, (scope) => scope.client.query('SELECT * FROM hardware_key_removal_confirm($1, $2, $3)', [removal, confirming, requestId()]));
    // Past the mark the confirmation wrote: the next sign-in begins after it.
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    const open = async (): Promise<string> => {
      const code = newRegistrationCode();
      const session = await confirmer.session();
      await withActor(app, confirmer.id, (scope) => scope.client.query('SELECT hardware_key_registration_open($1, $2, $3, $4)', [removal, session, registrationCodeDigest(services.registrationCodeKey, code), requestId()]));
      return code;
    };
    return { staff, removal, open };
  }

  /** The password and the authenticator code, up to the key-registration step. */
  async function atRegistration(email: string): Promise<Browser> {
    const browser = new Browser();
    await step(signInWithPassword, browser, { email, password: PASSWORD });
    expect(await step(answerMfa, browser, { code: nextCode() })).toEqual({ status: 'ok', data: CODE_SCREEN });
    return browser;
  }

  it('SGN-27: a closed account’s step shows the code screen, alike with and without an opening; the key routes ask the provider for nothing and count no try', async () => {
    const { staff, removal, open } = await closedStaff();
    const browser = await atRegistration(staff.email);
    const asks = vi.spyOn(services.provider, 'beginKeyRegistration');
    const shown = await step(registerKeyPage, browser);
    expect(shown).toMatchObject({ status: 'ok', data: { email: staff.email, codeRequired: true } });
    expect(await json(hardwareKeyRegistrationOptions, browser, {})).toEqual({ status: 200, body: CODE_SCREEN });
    await open();
    // The same screen, to the last field, once an opening stands: there is nothing to poll.
    expect(await step(registerKeyPage, browser)).toEqual(shown);
    expect(await json(hardwareKeyRegistrationOptions, browser, {})).toEqual({ status: 200, body: CODE_SCREEN });
    expect(await tries(removal)).toBe(0);
    expect(asks.mock.calls).toHaveLength(0);
    asks.mockRestore();
  });

  it('SGN-27: no opening and a wrong code are refused in the same words and keep the step; a code of the wrong shape is an issue on its field and counts no try', async () => {
    const { staff, removal, open } = await closedStaff();
    const browser = await atRegistration(staff.email);
    expect(await step(answerRegistrationCode, browser, { code: newRegistrationCode() })).toEqual(REFUSED);
    expect(await tries(removal)).toBe(0);
    await open();
    for (const misshapen of ['', 'ABC', '2345678', '234567890', 'ABCDEFG1', 'ABCDEFGO']) {
      expect(await step(answerRegistrationCode, browser, { code: misshapen })).toMatchObject({
        status: 'invalid',
        issues: [{ field: 'code', message: misshapen === '' ? 'fill this in' : 'enter the eight letters and digits of the code PaidWhole gave you' }],
      });
    }
    expect(await tries(removal)).toBe(0);
    expect(await step(answerRegistrationCode, browser, { code: newRegistrationCode() })).toEqual(REFUSED);
    expect(await tries(removal)).toBe(1);
    // The step stays, still asking for the code.
    expect(browser.get(SIGN_IN_COOKIE)).toMatch(/^v1\./);
    expect(await step(registerKeyPage, browser)).toMatchObject({ status: 'ok', data: { codeRequired: true } });
  });

  it('SGN-27: the right code, typed in lower case with a space, opens the key step; the code is in no cookie, result or log line, and the key then registers', async () => {
    const { staff, open } = await closedStaff();
    const browser = await atRegistration(staff.email);
    const code = await open();
    logLines.length = 0;
    const answered = await step(answerRegistrationCode, browser, { code: `${code.slice(0, 4).toLowerCase()} ${code.slice(4).toLowerCase()}` });
    expect(answered).toEqual({ status: 'ok', data: CODE_SCREEN });
    // What a refresh keeps: the step, now past the code, and never the code.
    const page = await step(registerKeyPage, browser);
    expect(page).toMatchObject({ status: 'ok', data: { email: staff.email } });
    expect((page as { data: Record<string, unknown> }).data.codeRequired).toBeUndefined();
    const options = await json(hardwareKeyRegistrationOptions, browser, {});
    expect(options.body.options).toBeDefined();
    const everything = [JSON.stringify(answered), JSON.stringify(page), JSON.stringify(options.body), browser.header(), ...logLines].join('\n');
    expect(everything).not.toContain(code);
    expect(everything.toLowerCase()).not.toContain(code.toLowerCase());
    expect(await json(registerHardwareKey, browser, { response: JSON.stringify(new SoftAuthenticator(ORIGIN).create(options.body.options as never)) })).toEqual({
      status: 200,
      body: { redirect: '/sign-in/hardware-key?reason=key_registered' },
    });
  });

  it('SGN-27: a code with no step starts again, and a code for an account that needs none goes on to the key step', async () => {
    expect(await step(answerRegistrationCode, new Browser(), { code: newRegistrationCode() })).toEqual({ status: 'ok', data: { redirect: '/sign-in?reason=step_expired' } });
    const staff = await person({ internal: true });
    const browser = await atRegistration(staff.email);
    expect((await step(registerKeyPage, browser) as { data: Record<string, unknown> }).data.codeRequired).toBeUndefined();
    expect(await step(answerRegistrationCode, browser, { code: newRegistrationCode() })).toEqual({ status: 'ok', data: CODE_SCREEN });
    expect((await json(hardwareKeyRegistrationOptions, browser, {})).body.options).toBeDefined();
  });
});
