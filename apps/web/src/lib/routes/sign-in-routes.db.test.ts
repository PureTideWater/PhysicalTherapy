import { randomBytes, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, addMembership, asOwner, createMigratedDatabase, createOrganization, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { hashPassword } from '../auth/password';
import { Sealer } from '../auth/seal';
import { DEVICE_COOKIE, SESSION_COOKIE, SIGN_IN_COOKIE } from '../auth/sessions';
import { SoftAuthenticator } from '../auth/test-support/soft-authenticator';
import { totpCode } from '../auth/totp';
import { routeHandler } from '../http/handler';
import type { CookieJar, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { homePage } from './index';
import {
  answerMfa,
  chooseNewPassword,
  enrollPage,
  enrollTotp,
  hardwareKeyOptions,
  hardwareKeyRegistrationOptions,
  mfaPage,
  newPasswordPage,
  registerHardwareKey,
  registerKeyPage,
  signInWithPassword,
  verifyHardwareKey,
} from './sign-in';

/**
 * The sign-in routes as the browser drives them: each step's cookies and redirects, the lockout
 * state, TOTP enrollment, and the hardware-key ceremonies through the JSON route handlers.
 */

const ORIGIN = 'http://localhost:3100';
const CHEAP = { n: 1024, r: 8, p: 1 };
const PASSWORD = 'Synthetic-Pass-2026';
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let store: MemoryDevStore;
let services: Services;
let clock = new Date();

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  store = new MemoryDevStore();
  const sealer = new Sealer(randomBytes(32));
  services = createServices({
    origin: ORIGIN,
    pool: app,
    provider: new DevAuthProvider({
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
});

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

/** A browser's cookie jar that remembers what each response set. */
class Browser implements CookieJar {
  readonly values = new Map<string, string>();
  get(name: string): string | undefined {
    return this.values.get(name);
  }
  set(name: string, value: string): void {
    this.values.set(name, value);
  }
  delete(name: string): void {
    this.values.delete(name);
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
        this.values.delete(name);
      } else {
        this.values.set(name, value);
      }
    }
  }
}

function step<R>(route: Route<R>, browser: Browser, input?: Record<string, unknown>) {
  return route.invoke({ cookies: browser, params: {}, input, requestId: `test-${randomUUID()}`, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0' }, services);
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
    expect(await step(signInWithPassword, browser, { email: user.email, password: PASSWORD })).toEqual({ status: 'ok', data: { redirect: '/sign-in/mfa' } });
    expect(browser.get(SIGN_IN_COOKIE)).toMatch(/^v1\./);
    expect(await step(mfaPage, browser)).toEqual({ status: 'ok', data: { email: user.email } });
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
    expect(await step(signInWithPassword, browser, { email: invited.email, password: PASSWORD })).toEqual({ status: 'ok', data: { redirect: '/sign-in/new-password' } });
    expect(await step(newPasswordPage, browser)).toEqual({ status: 'ok', data: { email: invited.email } });
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

  it('shows the lockout state after ten failures', async () => {
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
      data: { error: expect.stringContaining('locked after ten failed attempts'), locked: true },
    });
    expect(await step(signInWithPassword, browser, { email: user.email, password: PASSWORD })).toMatchObject({ status: 'ok', data: { locked: true } });
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
    expect(await step(answerMfa, browser, { code: nextCode() })).toEqual({ status: 'ok', data: { redirect: '/sign-in/register-key' } });
    expect(browser.get(SESSION_COOKIE)).toBeUndefined();
    expect(await step(registerKeyPage, browser)).toEqual({ status: 'ok', data: { email: staff.email } });
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
    expect(await json(verifyHardwareKey, new Browser(), { response: JSON.stringify(key.get(begun.body.options as never)) })).toEqual({ status: 200, body: { redirect: '/sign-in?reason=step_expired' } });
  });

  it('refuses a TOTP-only session for an internal user who has a key, and a locked account its options', async () => {
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
    expect(await json(hardwareKeyOptions, new Browser(), { email: staff.email })).toEqual({ status: 200, body: { error: expect.stringContaining('locked'), locked: true } });
    expect(await json(hardwareKeyOptions, new Browser(), { email: 'not an email' })).toMatchObject({ status: 400 });
  });

  it('answers a body that is not JSON as invalid', async () => {
    const response = await routeHandler(hardwareKeyOptions, () => services)(new Request(`${ORIGIN}/api`, { method: 'POST', body: 'not json' }));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
