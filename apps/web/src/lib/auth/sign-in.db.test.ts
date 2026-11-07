import { randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl, withActor } from '@tp/db';
import type { ScopeClient, ScopePool } from '@tp/db/runtime';
import { type MigratedDatabase, addMembership, asOwner, createMigratedDatabase, createOrganization, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { type CognitoClient, CognitoAuthProvider } from './cognito-provider';
import { DevAuthProvider } from './dev-provider';
import { MemoryDevStore } from './dev-store';
import { hashPassword } from './password';
import { Sealer } from './seal';
import { ClientSecret } from './secret-hash';
import { listDevices, resolveSession } from './sessions';
import { type FlowResult, type Pending, RESET_REQUEST_FLOOR_MS, SignInFlow } from './sign-in';
import { SoftAuthenticator } from './test-support/soft-authenticator';
import { totpCode } from './totp';

/**
 * The sign-in flow against a real database and the local provider (docs/adr/0016): invitations,
 * TOTP enrollment, the ten-failure lockout, failed-MFA bursts, the hardware-key rule for internal
 * roles with real WebAuthn verification, devices and their security events, and the audit trail.
 */

const ORIGIN = 'http://localhost:3100';
const CHEAP = { n: 1024, r: 8, p: 1 };
const PASSWORD = 'Synthetic-Pass-2026';
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let store: MemoryDevStore;
let provider: DevAuthProvider;
let flow: SignInFlow;
let clock = new Date();
/** The reset codes the provider mailed, oldest first (synthetic accounts only). */
const mailed: { readonly email: string; readonly code: string }[] = [];

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  store = new MemoryDevStore();
  provider = new DevAuthProvider({
    store,
    sealer: new Sealer(Buffer.alloc(32, 9)),
    webauthn: { rpId: 'localhost', rpName: 'Test', origin: ORIGIN },
    deliverInvitation: () => Promise.resolve(),
    deliverResetCode: (email, code) => {
      mailed.push({ email, code });
      return Promise.resolve();
    },
    now: () => clock,
    scryptCost: CHEAP,
  });
  flow = new SignInFlow({ pool: app, provider, logger: createLogger({ sink: () => undefined }) });
});

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

interface PersonOptions {
  readonly status?: 'invited' | 'active' | 'disabled';
  readonly mfa?: boolean;
  readonly internal?: boolean;
  readonly temporary?: boolean;
  readonly totp?: boolean;
}

/** A synthetic person in both places: the provider's store and the user table. */
async function person(options: PersonOptions = {}): Promise<{ id: string; email: string; sub: string }> {
  const id = randomUUID();
  const sub = randomUUID();
  const email = `${id}@synthetic.test`;
  await store.put({ sub, email, passwordHash: await hashPassword(PASSWORD, CHEAP), temporary: options.temporary ?? false, totpSecret: options.totp === false ? null : SECRET, totpLastStep: -1, credentials: [] });
  await asOwner(owner, [], () =>
    owner.query('INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status) VALUES ($1, $2, $3, $4, $5, $6)', [
      id,
      sub,
      email,
      options.mfa ?? true,
      options.internal ?? false,
      options.status ?? 'active',
    ]),
  );
  if (options.internal === true) {
    await addMembership(owner, await createOrganization(owner, 'internal'), id, 'platform_admin');
  }
  return { id, email, sub };
}

const context = (deviceToken?: string) => ({ deviceToken, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0', requestId: `test-${randomUUID()}` });

function pendingOf(result: FlowResult): Pending {
  if (result.kind !== 'pending') {
    throw new Error(`expected a pending step, got ${JSON.stringify(result)}`);
  }
  return result.pending;
}

/** The next TOTP code, a step later each time (a code is accepted once). */
function nextCode(): string {
  clock = new Date(clock.getTime() + 30_000);
  return totpCode(SECRET, clock);
}

async function events(userId: string): Promise<string[]> {
  const { rows } = await owner.query<{ event: string }>(
    "SELECT action || ':' || coalesce(purpose, '') AS event FROM audit_event WHERE object_id = $1 OR actor_id = $1 ORDER BY at, action",
    [userId],
  );
  return rows.map((row) => row.event);
}

describe('sign-in with a password and TOTP', () => {
  it('takes an invited user through a new password and TOTP enrollment to an active session', async () => {
    const invited = await person({ status: 'invited', mfa: false, temporary: true, totp: false });
    await invitation(invited.id, 'live');
    const step1 = pendingOf(await flow.start(invited.email, PASSWORD, context()));
    expect(step1.step).toBe('new_password');
    const invalid = await flow.newPassword(step1, 'weak', context());
    expect(invalid).toMatchObject({ kind: 'invalid_password', problems: expect.arrayContaining(['at least 12 characters']) });
    const step2 = pendingOf(await flow.newPassword(step1, 'Chosen-Pass-2026', context()));
    expect(step2.step).toBe('mfa_setup');
    const step3 = pendingOf(await flow.beginTotpSetup(step2, context()));
    if (step3.step !== 'mfa_setup' || step3.totp === undefined) {
      throw new Error('expected a TOTP secret');
    }
    clock = new Date(clock.getTime() + 30_000);
    const done = await flow.completeTotpSetup(step3, totpCode(step3.totp.secret, clock), context());
    expect(done.kind).toBe('signed_in');
    if (done.kind !== 'signed_in') {
      return;
    }
    const { rows } = await owner.query('SELECT status, mfa_enrolled FROM "user" WHERE id = $1', [invited.id]);
    expect(rows).toEqual([{ status: 'active', mfa_enrolled: true }]);
    const resolved = await resolveSession(app, done.session.sessionToken, 'test');
    expect(resolved).toMatchObject({ state: 'active', session: { userId: invited.id, mfaMethod: 'totp', userStatus: 'active', mfaEnrolled: true, hardwareKeyRequired: false } });
    expect(await events(invited.id)).toEqual(['password_changed:', 'mfa_enrolled:totp', 'sign_in:totp']);
    // The invitation's first password queues no password-changed email (docs/adr/0091, D2).
    expect(await notices(invited.id)).toEqual([]);
  });

  it('SGN-04: reports on the first step’s pending result that the account must also register a hardware key, and nothing for a customer', async () => {
    const staff = await person({ internal: true });
    expect(await flow.start(staff.email, PASSWORD, context())).toMatchObject({ kind: 'pending', pending: { step: 'mfa' }, keyRequired: true });
    const invitedStaff = await person({ status: 'invited', mfa: false, internal: true, temporary: true, totp: false });
    await invitation(invitedStaff.id, 'live');
    expect(await flow.start(invitedStaff.email, PASSWORD, context())).toMatchObject({ kind: 'pending', pending: { step: 'new_password' }, keyRequired: true });
    const customer = await person();
    const result = await flow.start(customer.email, PASSWORD, context());
    expect(result).toMatchObject({ kind: 'pending', pending: { step: 'mfa' } });
    expect(result).not.toHaveProperty('keyRequired');
    // A refusal carries no flag, whatever the account: nothing address-dependent is added before the provider answers.
    expect(await flow.start(staff.email, 'Wrong-Pass-2026!', context())).toEqual({ kind: 'refused', reason: 'credentials' });
  });

  it('signs in an enrolled user with a code, and refuses the wrong step or an expired one', async () => {
    const user = await person();
    const step = pendingOf(await flow.start(user.email.toUpperCase(), PASSWORD, context()));
    expect(step.step).toBe('mfa');
    expect(await flow.newPassword(step, 'x', context())).toEqual({ kind: 'refused', reason: 'expired' });
    expect(await flow.beginTotpSetup(step, context())).toEqual({ kind: 'refused', reason: 'expired' });
    expect(await flow.completeTotpSetup(step, '123456', context())).toEqual({ kind: 'refused', reason: 'expired' });
    expect(await flow.completeKey(step, {} as never, context())).toEqual({ kind: 'refused', reason: 'expired' });
    expect(await flow.beginKeyRegistration(step)).toEqual({ kind: 'refused', reason: 'expired' });
    expect(await flow.completeKeyRegistration(step, {} as never, context())).toEqual({ kind: 'refused', reason: 'expired' });
    expect((await flow.answerTotp(step, nextCode(), context())).kind).toBe('signed_in');
    expect(await flow.answerTotp({ step: 'new_password', email: user.email, challenge: 'x' }, '123456', context())).toEqual({ kind: 'refused', reason: 'expired' });
    clock = new Date(clock.getTime() + 10 * 60_000);
    expect(await flow.answerTotp(step, nextCode(), context())).toEqual({ kind: 'refused', reason: 'expired' });
  });

  it('refuses a disabled user without asking the provider, and an account only the provider knows', async () => {
    const disabled = await person({ status: 'disabled' });
    const signIn = vi.spyOn(provider, 'signIn');
    expect(await flow.start(disabled.email, PASSWORD, context())).toEqual({ kind: 'refused', reason: 'credentials' });
    expect(signIn).not.toHaveBeenCalled();
    signIn.mockRestore();
    const sub = randomUUID();
    await store.put({ sub, email: 'orphan@synthetic.test', passwordHash: await hashPassword(PASSWORD, CHEAP), temporary: false, totpSecret: SECRET, totpLastStep: -1, credentials: [] });
    const step = pendingOf(await flow.start('orphan@synthetic.test', PASSWORD, context()));
    expect(await flow.answerTotp(step, nextCode(), context())).toEqual({ kind: 'refused', reason: 'no_account' });
    expect(await flow.start('nobody@synthetic.test', PASSWORD, context())).toEqual({ kind: 'refused', reason: 'credentials' });
  });
});

describe('lockout and security events', () => {
  it('locks after ten failures, then refuses even the right password without trying it', async () => {
    const user = await person();
    for (let attempt = 1; attempt < 10; attempt += 1) {
      expect(await flow.start(user.email, 'Wrong-Pass-2026!', context())).toEqual({ kind: 'refused', reason: 'credentials' });
    }
    expect(await flow.start(user.email, 'Wrong-Pass-2026!', context())).toEqual({ kind: 'refused', reason: 'locked' });
    const signIn = vi.spyOn(provider, 'signIn');
    expect(await flow.start(user.email, PASSWORD, context())).toEqual({ kind: 'refused', reason: 'locked' });
    expect(await flow.beginKey(user.email)).toEqual({ kind: 'refused', reason: 'locked' });
    expect(signIn).not.toHaveBeenCalled();
    signIn.mockRestore();
    expect((await events(user.id)).filter((event) => event.startsWith('security_event'))).toEqual(['security_event:account_locked']);
  });

  it('raises a failed-MFA burst at the third wrong code, and clears the count on success', async () => {
    const user = await person();
    const step = pendingOf(await flow.start(user.email, PASSWORD, context()));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await flow.answerTotp(step, '000000', context())).toEqual({ kind: 'refused', reason: 'credentials' });
    }
    expect((await events(user.id)).filter((event) => event.startsWith('security_event'))).toEqual(['security_event:failed_mfa_burst']);
    expect((await flow.answerTotp(step, nextCode(), context())).kind).toBe('signed_in');
    expect((await owner.query('SELECT failed_sign_ins FROM "user" WHERE id = $1', [user.id])).rows).toEqual([{ failed_sign_ins: 0 }]);
  });

  it('records a new device as a security event only when the user had devices before, and recognizes a known one', async () => {
    const user = await person();
    const signIn = async (deviceToken?: string) => {
      const result = await flow.answerTotp(pendingOf(await flow.start(user.email, PASSWORD, context(deviceToken))), nextCode(), context(deviceToken));
      if (result.kind !== 'signed_in') {
        throw new Error('expected a session');
      }
      return result.session;
    };
    const first = await signIn();
    expect(first.newDevice).toBe(false);
    const again = await signIn(first.deviceToken);
    expect(again).toMatchObject({ deviceId: first.deviceId, deviceToken: first.deviceToken, newDevice: false });
    const elsewhere = await signIn();
    expect(elsewhere.newDevice).toBe(true);
    expect((await events(user.id)).filter((event) => event.startsWith('security_event'))).toEqual(['security_event:new_device_sign_in']);
    const { rows } = await owner.query<{ purpose: string }>("SELECT purpose FROM audit_event WHERE action = 'security_event' AND object_id = $1", [elsewhere.deviceId]);
    expect(rows).toEqual([{ purpose: 'new_device_sign_in' }]);
    // A revoked device signs in as a new one, with a new cookie.
    await withActor(app, user.id, (scope) => scope.client.query('UPDATE user_device SET revoked_at = now() WHERE id = $1', [first.deviceId]));
    const afterRevoke = await signIn(first.deviceToken);
    expect(afterRevoke.newDevice).toBe(true);
    expect(afterRevoke.deviceToken).not.toBe(first.deviceToken);
    const devices = await withActor(app, user.id, (scope) => listDevices(scope));
    expect(devices.map((device) => [device.label, device.revokedAt === null])).toEqual([
      ['Chrome on Linux', true],
      ['Chrome on Linux', true],
      ['Chrome on Linux', false],
    ]);
  });
});

describe('internal roles must use a hardware key', () => {
  it('lets a TOTP sign-in only register a key, then signs in with the key and nothing else', async () => {
    const staff = await person({ internal: true });
    const key = new SoftAuthenticator(ORIGIN);
    const registration = pendingOf(await flow.answerTotp(pendingOf(await flow.start(staff.email, PASSWORD, context())), nextCode(), context()));
    expect(registration).toMatchObject({ step: 'register_key', userId: staff.id });
    const begun = await flow.beginKeyRegistration(registration);
    if ('kind' in begun) {
      throw new Error('expected options');
    }
    expect(await flow.completeKeyRegistration(registration, key.create(begun.options), context())).toEqual({ kind: 'refused', reason: 'expired' });
    expect(await flow.completeKeyRegistration(begun.pending, new SoftAuthenticator(ORIGIN, false).create(begun.options), context())).toEqual({ kind: 'refused', reason: 'key_not_registered' });
    expect(await flow.completeKeyRegistration(begun.pending, key.create(begun.options), context())).toEqual({ kind: 'key_registered' });
    // With a key registered, password and TOTP open nothing.
    const again = await flow.answerTotp(pendingOf(await flow.start(staff.email, PASSWORD, context())), nextCode(), context());
    expect(again).toEqual({ kind: 'refused', reason: 'hardware_key_required' });
    const keyStart = await flow.beginKey(staff.email);
    if ('kind' in keyStart) {
      throw new Error('expected options');
    }
    const done = await flow.completeKey(keyStart.pending, key.get(keyStart.options), context());
    expect(done.kind).toBe('signed_in');
    if (done.kind === 'signed_in') {
      expect(await resolveSession(app, done.session.sessionToken, 'test')).toMatchObject({ state: 'active', session: { mfaMethod: 'webauthn', hardwareKeyRequired: true } });
    }
    expect(await events(staff.id)).toEqual(expect.arrayContaining(['hardware_key_registered:webauthn', 'sign_in:webauthn']));
  });

  it('counts a rejected hardware key as a failed attempt', async () => {
    const staff = await person({ internal: true });
    const begun = await flow.beginKey(staff.email);
    if ('kind' in begun) {
      throw new Error('expected options');
    }
    expect(await flow.completeKey(begun.pending, new SoftAuthenticator(ORIGIN).get(begun.options), context())).toEqual({ kind: 'refused', reason: 'credentials' });
    expect(await events(staff.id)).toEqual(['sign_in_failed:hardware_key']);
  });

  it('refuses a locked account that proves its key anyway', async () => {
    const staff = await person({ internal: true });
    const key = new SoftAuthenticator(ORIGIN);
    const registration = pendingOf(await flow.answerTotp(pendingOf(await flow.start(staff.email, PASSWORD, context())), nextCode(), context()));
    const begun = await flow.beginKeyRegistration(registration);
    if ('kind' in begun) {
      throw new Error('expected options');
    }
    await flow.completeKeyRegistration(begun.pending, key.create(begun.options), context());
    const keyStart = await flow.beginKey(staff.email);
    if ('kind' in keyStart) {
      throw new Error('expected options');
    }
    await owner.query('UPDATE "user" SET locked_at = now() WHERE id = $1', [staff.id]);
    expect(await flow.completeKey(keyStart.pending, key.get(keyStart.options), context())).toEqual({ kind: 'refused', reason: 'locked' });
  });
});

/** The reset request's floor runs on a clock the test moves: only the provider's work (a spy) and each sleep advance it. */
interface Pace {
  at: number;
  readonly slept: number[];
}

let current: Pace = { at: 0, slept: [] };

/** A flow on a fresh paced clock, logging to lines the test reads; optionally on another pool. */
function paced(pool: ScopePool<ScopeClient> = app): { readonly flow: SignInFlow; readonly pace: Pace; readonly lines: string[] } {
  const pace: Pace = { at: 0, slept: [] };
  current = pace;
  const lines: string[] = [];
  const logger = createLogger({ sink: (line) => lines.push(line) });
  const sleep = (ms: number): Promise<void> => {
    pace.slept.push(ms);
    pace.at += ms;
    return Promise.resolve();
  };
  return { flow: new SignInFlow({ pool, provider, logger, now: () => pace.at, sleep }), pace, lines };
}

/** The structured log lines with this message. */
function logged(lines: readonly string[], message: string): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((entry) => entry.msg === message);
}

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

/** The last code mailed to an address. */
function codeFor(email: string): string {
  const code = mailed.filter((entry) => entry.email === email).at(-1)?.code;
  if (code === undefined) {
    throw new Error('expected a mailed code');
  }
  return code;
}

/** A code that is not the one mailed. */
const wrong = (code: string): string => `${code.slice(0, 5)}${String((Number(code.slice(5)) + 1) % 10)}`;

async function requested(): Promise<number> {
  const { rows } = await owner.query<{ count: string }>("SELECT count(*) AS count FROM audit_event WHERE action = 'password_reset_requested'");
  return Number(rows[0]?.count ?? -1);
}

async function openSessions(userId: string): Promise<number> {
  const { rows } = await owner.query<{ count: string }>('SELECT count(*) AS count FROM user_session WHERE user_id = $1 AND ended_at IS NULL', [userId]);
  return Number(rows[0]?.count ?? -1);
}

/** A password-changed notice the database queued (docs/adr/0091; SGN-16): its state, and the event that queued it. */
interface QueuedNotice {
  readonly state: string;
  readonly attempts: number;
  readonly unsent: boolean;
  readonly event: string;
  readonly at_event: boolean;
}

/** The user's password-changed notices, oldest first, each with the action and purpose of the audit event that queued it. */
async function notices(userId: string): Promise<QueuedNotice[]> {
  const { rows } = await owner.query<QueuedNotice>(
    `SELECT n.state, n.attempts, n.ses_message_id IS NULL AS unsent, e.action || ':' || coalesce(e.purpose, '') AS event, n.changed_at = e.at AS at_event
       FROM password_notice n JOIN audit_event e ON e.id = n.audit_event_id
      WHERE n.user_id = $1 ORDER BY n.changed_at, n.id`,
    [userId],
  );
  return rows;
}

/** Every password-changed notice in this file's database. */
async function noticeCount(): Promise<number> {
  const { rows } = await owner.query<{ count: string }>('SELECT count(*) AS count FROM password_notice');
  return Number(rows[0]?.count ?? -1);
}

/** The one pending notice a completed reset queues, from its own password_reset_completed event. */
const QUEUED: QueuedNotice = { state: 'pending', attempts: 0, unsent: true, event: 'password_reset_completed:email_code', at_event: true };

/** Signs a person in with the password and a code: their open session. */
async function signedIn(email: string, password = PASSWORD) {
  const result = await flow.answerTotp(pendingOf(await flow.start(email, password, context())), nextCode(), context());
  if (result.kind !== 'signed_in') {
    throw new Error('expected a session');
  }
  return result.session;
}

const CHOSEN = 'Chosen-Pass-2026';

describe('a forgotten password (UX-006; docs/adr/0081, the forgotten password)', () => {
  it('SGN-05: asks the provider only for an active account with a second factor, records the request for every account and nothing for an unknown address, and answers each at the floor', async () => {
    const active = await person();
    const locked = await person();
    await owner.query('UPDATE "user" SET locked_at = now() WHERE id = $1', [locked.id]);
    const invited = await person({ status: 'invited', mfa: false, temporary: true, totp: false });
    // A person who chose a password at the invitation and stopped before enrolling: no second factor (SEC-B1).
    const notEnrolled = await person({ status: 'invited', mfa: false, temporary: false, totp: false });
    // An active account with no second factor, as a console factor reset (UX PR 65) leaves one: no code (SEC-B1).
    const activeNotEnrolled = await person({ mfa: false, totp: false });
    const disabled = await person({ status: 'disabled' });
    const unknown = `${randomUUID()}@synthetic.test`;
    const ask = provider.requestPasswordReset.bind(provider);
    const asked = vi.spyOn(provider, 'requestPasswordReset').mockImplementation(async (...args) => {
      current.at += 600;
      return ask(...args);
    });
    const before = await requested();
    const sent = mailed.length;
    const paces: Record<string, Pace> = {};
    const addresses = {
      active: active.email,
      locked: locked.email,
      invited: invited.email,
      notEnrolled: notEnrolled.email,
      activeNotEnrolled: activeNotEnrolled.email,
      disabled: disabled.email,
      unknown,
    };
    for (const [name, email] of Object.entries(addresses)) {
      const { flow: asking, pace, lines } = paced();
      const request = context();
      expect(await asking.requestPasswordReset(email, request)).toEqual({ step: 'reset', email });
      paces[name] = pace;
      expect(logged(lines, 'password reset request timed'), name).toEqual([expect.objectContaining({ level: 'info', request_id: request.requestId, elapsed_ms: expect.any(Number) })]);
      expect(lines.join('\n'), name).not.toContain(email);
    }
    const calls = [...asked.mock.calls];
    asked.mockRestore();
    // Every path answers at the floor: the provider's work is padded, and a skipped send is padded the more.
    for (const [name, pace] of Object.entries(paces)) {
      expect(pace.at, name).toBe(RESET_REQUEST_FLOOR_MS);
    }
    expect(paces.active?.slept).toEqual([RESET_REQUEST_FLOOR_MS - 600]);
    expect(paces.unknown?.slept).toEqual([RESET_REQUEST_FLOOR_MS]);
    expect(paces.notEnrolled?.slept).toEqual([RESET_REQUEST_FLOOR_MS]);
    expect(paces.activeNotEnrolled?.slept).toEqual([RESET_REQUEST_FLOOR_MS]);
    expect(calls.map(([email]) => email)).toEqual([active.email, locked.email]);
    // The flow passes the request ID (the dev twin's own signature does not name it, so the call is read as sent).
    expect(calls.map((call) => (call as unknown[])[1])).toEqual([expect.stringMatching(/^test-/), expect.stringMatching(/^test-/)]);
    expect(mailed.slice(sent).map((entry) => entry.email)).toEqual([active.email, locked.email]);
    for (const account of [active, locked, invited, notEnrolled, activeNotEnrolled, disabled]) {
      expect(await events(account.id)).toEqual(['password_reset_requested:unverified_request']);
    }
    expect(await requested()).toBe(before + 6);
  });

  it('SGN-05: answers a failed audit write or provider send as an unknown address, at the floor, with one error log of IDs only (S-3), and warns of a run over it', async () => {
    const user = await person();
    const unknown = `${randomUUID()}@synthetic.test`;
    const nobody = paced();
    expect(await nobody.flow.requestPasswordReset(unknown, context())).toEqual({ step: 'reset', email: unknown });
    expect(nobody.pace.slept).toEqual([RESET_REQUEST_FLOOR_MS]);
    expect(logged(nobody.lines, 'password reset request failed')).toEqual([]);

    /** A failed request: the unknown address's answer and floor, and one error line that names IDs only. */
    const failedAlike = async (run: { readonly flow: SignInFlow; readonly pace: Pace; readonly lines: string[] }, name: string): Promise<void> => {
      const request = context();
      expect(await run.flow.requestPasswordReset(user.email, request), name).toEqual({ step: 'reset', email: user.email });
      expect(run.pace.slept, name).toEqual([RESET_REQUEST_FLOOR_MS]);
      const failed = logged(run.lines, 'password reset request failed');
      expect(failed, name).toEqual([{ level: 'error', msg: 'password reset request failed', time: expect.any(String), request_id: request.requestId, error_code: 'Error' }]);
      expect(run.lines.join('\n'), name).not.toMatch(new RegExp(`${user.email}|synthetic`));
    };

    await failedAlike(paced(failing(/INSERT INTO audit_event/, 1)), 'audit');

    const thrown = paced();
    const broken = vi.spyOn(provider, 'requestPasswordReset').mockRejectedValueOnce(new Error('synthetic provider failure'));
    await failedAlike(thrown, 'provider');
    broken.mockRestore();
    // The send failed, and the request is still recorded.
    expect(await events(user.id)).toContain('password_reset_requested:unverified_request');

    const slow = paced();
    const ask = provider.requestPasswordReset.bind(provider);
    const late = vi.spyOn(provider, 'requestPasswordReset').mockImplementation(async (...args) => {
      current.at += RESET_REQUEST_FLOOR_MS + 500;
      return ask(...args);
    });
    const request = context();
    await slow.flow.requestPasswordReset(user.email, request);
    late.mockRestore();
    expect(slow.pace.slept).toEqual([]);
    expect(logged(slow.lines, 'password reset request over floor')).toEqual([
      expect.objectContaining({ level: 'warn', request_id: request.requestId, elapsed_ms: RESET_REQUEST_FLOOR_MS + 500 }),
    ]);
    expect(slow.lines.join('\n')).not.toContain(user.email);
  });

  it('SGN-05: a request ends no session (review SEC-N3)', async () => {
    const user = await person();
    await signedIn(user.email);
    expect(await openSessions(user.id)).toBe(1);
    await paced().flow.requestPasswordReset(user.email, context());
    expect(await openSessions(user.id)).toBe(1);
  });

  it('SGN-06: a wrong code, an unknown address and a weak password are refused; a wrong code counts no failure, records nothing and signs nothing out', async () => {
    const user = await person();
    const queued = await noticeCount();
    const { flow: reset, lines } = paced();
    await reset.requestPasswordReset(user.email, context());
    const code = codeFor(user.email);
    const signOut = vi.spyOn(provider, 'globalSignOut');
    const request = context();
    expect(await reset.confirmPasswordReset(user.email, wrong(code), CHOSEN, request)).toEqual({ kind: 'rejected' });
    expect(await reset.confirmPasswordReset(`${randomUUID()}@synthetic.test`, code, CHOSEN, context())).toEqual({ kind: 'rejected' });
    expect(await reset.confirmPasswordReset(user.email, code, 'weakpassword', context())).toMatchObject({ kind: 'invalid_password', problems: expect.arrayContaining(['a digit']) });
    expect(signOut).not.toHaveBeenCalled();
    signOut.mockRestore();
    expect(await events(user.id)).toEqual(['password_reset_requested:unverified_request']);
    expect((await owner.query('SELECT failed_sign_ins, locked_at FROM "user" WHERE id = $1', [user.id])).rows).toEqual([{ failed_sign_ins: 0, locked_at: null }]);
    expect(logged(lines, 'password reset code refused')).toContainEqual(expect.objectContaining({ level: 'warn', request_id: request.requestId, error_code: expect.any(String) }));
    expect(lines.join('\n')).not.toContain(user.email);
    expect(lines.join('\n')).not.toContain(code);
    // A refused code, an unknown address and a weak password queue no password-changed email (SGN-16).
    expect(await noticeCount()).toBe(queued);
  });

  it('SGN-16: a reset the provider completes for an address the app has no account for records nothing and queues no password-changed email', async () => {
    const stray = `${randomUUID()}@synthetic.test`;
    await store.put({ sub: randomUUID(), email: stray, passwordHash: await hashPassword(PASSWORD, CHEAP), temporary: false, totpSecret: SECRET, totpLastStep: -1, credentials: [] });
    const queued = await noticeCount();
    const recorded = (await owner.query<{ count: string }>("SELECT count(*) AS count FROM audit_event WHERE action = 'password_reset_completed'")).rows[0]?.count;
    await provider.requestPasswordReset(stray);
    expect(await paced().flow.confirmPasswordReset(stray, codeFor(stray), CHOSEN, context())).toEqual({ kind: 'reset', locked: false, keepEmail: false });
    expect((await owner.query<{ count: string }>("SELECT count(*) AS count FROM audit_event WHERE action = 'password_reset_completed'")).rows[0]?.count).toBe(recorded);
    expect(await noticeCount()).toBe(queued);
  });

  it('SGN-07: a reset ends every session, then signs out at the provider, records the reset, and still asks for the second factor', async () => {
    const user = await person();
    const session = await signedIn(user.email);
    const { flow: reset, lines } = paced();
    await reset.requestPasswordReset(user.email, context());
    let openAtSignOut = -1;
    const signOut = vi.spyOn(provider, 'globalSignOut').mockImplementation(async () => {
      openAtSignOut = await openSessions(user.id);
    });
    const request = context();
    expect(await reset.confirmPasswordReset(user.email, codeFor(user.email), CHOSEN, request)).toEqual({ kind: 'reset', locked: false, keepEmail: true });
    expect(signOut.mock.calls).toEqual([[user.sub]]);
    signOut.mockRestore();
    expect(openAtSignOut).toBe(0);
    expect((await resolveSession(app, session.sessionToken, 'test')).state).not.toBe('active');
    expect(await events(user.id)).toEqual(expect.arrayContaining(['password_reset_requested:unverified_request', 'password_reset_completed:email_code']));
    expect((await events(user.id)).filter((event) => event.startsWith('sign_in_failed'))).toEqual([]);
    expect(logged(lines, 'security event: password reset completed')).toEqual([expect.objectContaining({ level: 'warn', user_id: user.id, request_id: request.requestId })]);
    expect((await store.byEmail(user.email))?.totpSecret).toBe(SECRET);
    // The code is spent; the new password leads to the code step; the old one is refused.
    expect(await reset.confirmPasswordReset(user.email, codeFor(user.email), 'Another-Pass-2026', context())).toEqual({ kind: 'rejected' });
    expect(pendingOf(await flow.start(user.email, CHOSEN, context())).step).toBe('mfa');
    expect(await flow.start(user.email, PASSWORD, context())).toEqual({ kind: 'refused', reason: 'credentials' });
    // The database queued exactly one password-changed email in the reset's own transaction, from its event, pending for
    // the platform's job (SGN-16; docs/adr/0091, D1); the refused second try and the sign-ins queued none.
    expect(await notices(user.id)).toEqual([QUEUED]);
  });

  it('SGN-07: a locked account is reset and stays locked, keeping no email; an account disabled after the request keeps none either', async () => {
    const lockedUser = await person();
    await owner.query('UPDATE "user" SET locked_at = now() WHERE id = $1', [lockedUser.id]);
    const { flow: reset } = paced();
    await reset.requestPasswordReset(lockedUser.email, context());
    expect(await reset.confirmPasswordReset(lockedUser.email, codeFor(lockedUser.email), CHOSEN, context())).toEqual({ kind: 'reset', locked: true, keepEmail: false });
    expect((await owner.query<{ locked: boolean }>('SELECT locked_at IS NOT NULL AS locked FROM "user" WHERE id = $1', [lockedUser.id])).rows).toEqual([{ locked: true }]);
    expect(await flow.start(lockedUser.email, CHOSEN, context())).toEqual({ kind: 'refused', reason: 'locked' });

    const later = await person();
    await reset.requestPasswordReset(later.email, context());
    await owner.query('UPDATE "user" SET status = \'disabled\' WHERE id = $1', [later.id]);
    expect(await reset.confirmPasswordReset(later.email, codeFor(later.email), CHOSEN, context())).toEqual({ kind: 'reset', locked: false, keepEmail: false });
    // Each is still told its password changed: the guard reads no lock and no status (SGN-16; docs/adr/0091, D3 and D4).
    expect(await notices(lockedUser.id)).toEqual([QUEUED]);
    expect(await notices(later.id)).toEqual([QUEUED]);
  });

  it('SGN-07: a provider sign-out that fails is logged and the reset still lands (review SEC-N1)', async () => {
    const user = await person();
    await signedIn(user.email);
    const { flow: reset, lines } = paced();
    await reset.requestPasswordReset(user.email, context());
    const signOut = vi.spyOn(provider, 'globalSignOut').mockRejectedValueOnce(Object.assign(new Error('synthetic'), { name: 'InternalErrorException' }));
    const request = context();
    expect(await reset.confirmPasswordReset(user.email, codeFor(user.email), CHOSEN, request)).toEqual({ kind: 'reset', locked: false, keepEmail: true });
    signOut.mockRestore();
    expect(logged(lines, 'security event: password reset provider sign-out failed')).toEqual([
      expect.objectContaining({ level: 'error', user_id: user.id, request_id: request.requestId, error_code: 'InternalErrorException' }),
    ]);
    // The sessions ended before the sign-out was tried, so the password-changed email is queued all the same (SGN-16).
    expect(await openSessions(user.id)).toBe(0);
    expect(await notices(user.id)).toEqual([QUEUED]);
  });

  it('SGN-07: a revoke that fails once is retried; failing twice it is logged, the provider still signs out, and the reset answers the generic failure (review R-3)', async () => {
    const once = await person();
    await signedIn(once.email);
    const retried = paced(failing(/revoke_user_sessions/, 1));
    await retried.flow.requestPasswordReset(once.email, context());
    expect(await retried.flow.confirmPasswordReset(once.email, codeFor(once.email), CHOSEN, context())).toEqual({ kind: 'reset', locked: false, keepEmail: true });
    expect(await openSessions(once.id)).toBe(0);
    expect((await events(once.id)).filter((event) => event.startsWith('password_reset_completed'))).toEqual(['password_reset_completed:email_code']);
    // One notice: the failed try rolled back with everything it wrote (SGN-16).
    expect(await notices(once.id)).toEqual([QUEUED]);

    const twice = await person();
    await signedIn(twice.email);
    const failed = paced(failing(/revoke_user_sessions/, 2));
    await failed.flow.requestPasswordReset(twice.email, context());
    const signOut = vi.spyOn(provider, 'globalSignOut');
    const request = context();
    expect(await failed.flow.confirmPasswordReset(twice.email, codeFor(twice.email), CHOSEN, request)).toEqual({ kind: 'sessions_not_ended' });
    expect(signOut.mock.calls).toEqual([[twice.sub]]);
    signOut.mockRestore();
    expect(await openSessions(twice.id)).toBe(1);
    expect(logged(failed.lines, 'security event: password reset sessions not ended')).toEqual([expect.objectContaining({ level: 'error', user_id: twice.id, request_id: request.requestId })]);
    // Neither try recorded the reset, so no password-changed email is queued: this line, which pages the operator
    // (PasswordResetSessionsNotEnded), is the one signal of this path (SGN-16; docs/adr/0091, D15).
    expect((await events(twice.id)).filter((event) => event.startsWith('password_reset_completed'))).toEqual([]);
    expect(await notices(twice.id)).toEqual([]);
  });
});

/** The enrolment rule's refusal (docs/adr/0088, D3). */
const NOT_OPEN: FlowResult = { kind: 'refused', reason: 'enrolment_not_open' };
const ENROLMENT_REFUSED = 'security event: second-factor enrolment refused';

/** An invitation of the person, live (sent a minute ago) or lapsed (sent eight days ago), as the console writes one. */
async function invitation(userId: string, state: 'live' | 'lapsed'): Promise<void> {
  // On the person's membership when they have one (an internal user's), else on a group's made for it.
  const [held] = (await owner.query<{ id: string; organization_id: string }>('SELECT id, organization_id FROM membership WHERE user_id = $1', [userId])).rows;
  const organization = held?.organization_id ?? (await createOrganization(owner, 'group'));
  const inviter = await person();
  const membership = held?.id ?? (await addMembership(owner, organization, userId, 'viewer'));
  await asOwner(owner, [], () =>
    owner.query(
      `INSERT INTO invitation (organization_id, membership_id, user_id, invited_by, sent_at, expires_at, last_sent_by)
       VALUES ($1, $2, $3, $4, now() - $5::interval, now() - $5::interval + interval '7 days', $4)`,
      [organization, membership, userId, inviter.id, state === 'live' ? '1 minute' : '8 days'],
    ),
  );
}

/** Every invitation of the person lapses now. */
async function lapse(userId: string): Promise<void> {
  await asOwner(owner, [], () => owner.query("UPDATE invitation SET sent_at = now() - interval '8 days', expires_at = now() - interval '1 day' WHERE user_id = $1", [userId]));
}

/** An invitee who chose a password and has not enrolled, inside a live invitation: the one state that may enrol. */
async function invitee(): Promise<{ id: string; email: string; sub: string }> {
  const invited = await person({ status: 'invited', mfa: false, totp: false });
  await invitation(invited.id, 'live');
  return invited;
}

/** The enrolment step with its setup key. */
async function withSetupKey(pending: Pending): Promise<Pending> {
  const begun = pendingOf(await flow.beginTotpSetup(pending, context()));
  if (begun.step !== 'mfa_setup' || begun.totp === undefined) {
    throw new Error('expected a setup key');
  }
  return begun;
}

/** A code for the setup key the step holds. */
function setupCode(pending: Pending): string {
  if (pending.step !== 'mfa_setup' || pending.totp === undefined) {
    throw new Error('expected a setup key');
  }
  clock = new Date(clock.getTime() + 30_000);
  return totpCode(pending.totp.secret, clock);
}

/** Whether the provider holds a second factor for the subject. */
async function factorOf(sub: string): Promise<string | null | undefined> {
  return (await store.bySub(sub))?.totpSecret;
}

describe('SEC-22: a second factor is enrolled only inside a live invitation (docs/adr/0088, D3)', () => {
  it('SEC-22: refuses an active account with no factor, and one the provider cleared, before any enrolment call, storing nothing, and logs a security event of IDs only', async () => {
    const active = await person({ mfa: false, totp: false });
    // The row says enrolled, but the provider's factor is gone (a console or CLI clear: routes B1, D1).
    const cleared = await person({ totp: false });
    const { flow: enrolling, lines } = paced();
    const begin = vi.spyOn(provider, 'beginTotpSetup');
    const complete = vi.spyOn(provider, 'completeTotpSetup');
    const request = context();
    expect(await enrolling.start(active.email, PASSWORD, request)).toEqual(NOT_OPEN);
    expect(await enrolling.start(cleared.email, PASSWORD, context())).toEqual(NOT_OPEN);
    expect(begin).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    begin.mockRestore();
    complete.mockRestore();
    expect(await factorOf(active.sub)).toBeNull();
    expect(await factorOf(cleared.sub)).toBeNull();
    const refusals = logged(lines, ENROLMENT_REFUSED);
    expect(refusals[0]).toEqual({ level: 'warn', msg: ENROLMENT_REFUSED, time: expect.any(String), user_id: active.id, request_id: request.requestId });
    expect(refusals.map((entry) => entry.user_id)).toEqual([active.id, cleared.id]);
    expect(lines.join('\n')).not.toMatch(new RegExp(`${active.email}|${cleared.email}|${active.sub}`));
    // A refused enrolment is no failed sign-in: nothing counted, nothing locked.
    expect(await events(active.id)).toEqual([]);
    expect((await owner.query('SELECT failed_sign_ins, mfa_enrolled FROM "user" WHERE id = $1', [active.id])).rows).toEqual([{ failed_sign_ins: 0, mfa_enrolled: false }]);
  });

  it('SEC-22: refuses an account only the provider knows (an orphan) before the provider stores anything, logging no user', async () => {
    const sub = randomUUID();
    const email = `${randomUUID()}@synthetic.test`;
    await store.put({ sub, email, passwordHash: await hashPassword(PASSWORD, CHEAP), temporary: false, totpSecret: null, totpLastStep: -1, credentials: [] });
    const { flow: enrolling, lines } = paced();
    const request = context();
    expect(await enrolling.start(email, PASSWORD, request)).toEqual(NOT_OPEN);
    expect(await factorOf(sub)).toBeNull();
    expect(logged(lines, ENROLMENT_REFUSED)).toEqual([{ level: 'warn', msg: ENROLMENT_REFUSED, time: expect.any(String), user_id: null, request_id: request.requestId }]);
  });

  it('SEC-22: refuses an invited, unenrolled, unlocked account with no invitation at all, at the challenge, before any enrolment call (review security-S1)', async () => {
    // Inserted with no actor, as a seed or a bootstrap insert writes one: the membership trigger records no invitation.
    const uninvited = await person({ status: 'invited', mfa: false, totp: false });
    await addMembership(owner, await createOrganization(owner, 'group'), uninvited.id, 'viewer');
    expect((await owner.query('SELECT count(*)::int AS n FROM invitation WHERE user_id = $1', [uninvited.id])).rows).toEqual([{ n: 0 }]);
    const { flow: enrolling, lines } = paced();
    const begin = vi.spyOn(provider, 'beginTotpSetup');
    const complete = vi.spyOn(provider, 'completeTotpSetup');
    const request = context();
    expect(await enrolling.start(uninvited.email, PASSWORD, request)).toEqual(NOT_OPEN);
    expect(begin).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    begin.mockRestore();
    complete.mockRestore();
    expect(await factorOf(uninvited.sub)).toBeNull();
    expect(logged(lines, ENROLMENT_REFUSED)).toEqual([{ level: 'warn', msg: ENROLMENT_REFUSED, time: expect.any(String), user_id: uninvited.id, request_id: request.requestId }]);
  });

  it('SEC-22: refuses at a new password an invitee whose invitation lapsed or who was locked after the step began, before the provider stores the password (review security-N2)', async () => {
    for (const change of ['lapsed', 'locked'] as const) {
      const invited = await person({ status: 'invited', mfa: false, temporary: true, totp: false });
      await invitation(invited.id, 'live');
      const step = pendingOf(await flow.start(invited.email, PASSWORD, context()));
      expect(step.step, change).toBe('new_password');
      if (change === 'lapsed') {
        await lapse(invited.id);
      } else {
        await owner.query('UPDATE "user" SET locked_at = now() WHERE id = $1', [invited.id]);
      }
      const choose = vi.spyOn(provider, 'setNewPassword');
      expect(await flow.newPassword(step, CHOSEN, context()), change).toEqual(NOT_OPEN);
      expect(choose, change).not.toHaveBeenCalled();
      choose.mockRestore();
      expect((await store.bySub(invited.sub))?.temporary, change).toBe(true);
      expect(await factorOf(invited.sub), change).toBeNull();
    }
  });

  it('SEC-22: refuses the new password of an account only the provider knows, or an invitee with no invitation, so the provider keeps its temporary password (review security-N2)', async () => {
    const sub = randomUUID();
    const email = `${randomUUID()}@synthetic.test`;
    await store.put({ sub, email, passwordHash: await hashPassword(PASSWORD, CHEAP), temporary: true, totpSecret: null, totpLastStep: -1, credentials: [] });
    const uninvited = await person({ status: 'invited', mfa: false, temporary: true, totp: false });
    const { flow: choosing, lines } = paced();
    const choose = vi.spyOn(provider, 'setNewPassword');
    expect(await choosing.start(email, PASSWORD, context())).toEqual(NOT_OPEN);
    expect(await choosing.start(uninvited.email, PASSWORD, context())).toEqual(NOT_OPEN);
    expect(choose).not.toHaveBeenCalled();
    choose.mockRestore();
    expect((await store.bySub(sub))?.temporary).toBe(true);
    expect((await store.bySub(uninvited.sub))?.temporary).toBe(true);
    expect(logged(lines, ENROLMENT_REFUSED).map((entry) => entry.user_id)).toEqual([null, uninvited.id]);
  });

  it('SEC-22: re-checks the account at the setup key and again at the code: a change after the step was sealed is refused, and the provider stores nothing', async () => {
    const changes: Record<string, (id: string) => Promise<unknown>> = {
      lapsed: lapse,
      locked: (id) => owner.query('UPDATE "user" SET locked_at = now() WHERE id = $1', [id]),
      disabled: (id) => owner.query('UPDATE "user" SET status = \'disabled\' WHERE id = $1', [id]),
      activated: (id) => owner.query('UPDATE "user" SET status = \'active\' WHERE id = $1', [id]),
      enrolled: (id) => owner.query('UPDATE "user" SET mfa_enrolled = true WHERE id = $1', [id]),
    };
    for (const [name, change] of Object.entries(changes)) {
      // At the setup key: the step was sealed while the invitation lived.
      const early = await invitee();
      const sealed = pendingOf(await flow.start(early.email, PASSWORD, context()));
      expect(sealed.step, name).toBe('mfa_setup');
      await change(early.id);
      const begin = vi.spyOn(provider, 'beginTotpSetup');
      expect(await flow.beginTotpSetup(sealed, context()), name).toEqual(NOT_OPEN);
      expect(begin, name).not.toHaveBeenCalled();
      begin.mockRestore();

      // At the code: the setup key was shown while the invitation lived.
      const late = await invitee();
      const keyed = await withSetupKey(pendingOf(await flow.start(late.email, PASSWORD, context())));
      await change(late.id);
      const complete = vi.spyOn(provider, 'completeTotpSetup');
      expect(await flow.completeTotpSetup(keyed, setupCode(keyed), context()), name).toEqual(NOT_OPEN);
      expect(complete, name).not.toHaveBeenCalled();
      complete.mockRestore();
      expect(await factorOf(late.sub), name).toBeNull();
    }
  });

  it('SEC-22: matches the account by the enrolling subject and the email, never by the typed email alone (review security-S2)', async () => {
    // (a) A live invitee's address, but the provider's user for it is another subject, with no row of its own.
    const unmatched = await invitee();
    const stranger = randomUUID();
    await store.update(unmatched.sub, (record) => ({ ...record, sub: stranger }));
    expect(await flow.start(unmatched.email, PASSWORD, context())).toEqual(NOT_OPEN);
    expect(await factorOf(stranger)).toBeNull();

    // (b) The provider names no subject on the step: refused, never matched by the email.
    const nameless = await invitee();
    const signIn = vi.spyOn(provider, 'signIn').mockResolvedValueOnce({ kind: 'mfa_setup_required', challenge: 'synthetic-challenge' });
    expect(await flow.start(nameless.email, PASSWORD, context())).toEqual(NOT_OPEN);
    signIn.mockRestore();

    // (c) A row for the address and a row for the subject, and they are different users.
    const byEmail = await invitee();
    const bySub = await invitee();
    await store.update(bySub.sub, (record) => ({ ...record, sub: randomUUID() }));
    await store.update(byEmail.sub, (record) => ({ ...record, sub: bySub.sub }));
    expect(await flow.start(byEmail.email, PASSWORD, context())).toEqual(NOT_OPEN);
    expect(await factorOf(bySub.sub)).toBeNull();

    // The same at the setup key and at the code, for a step sealed while both matched.
    const moved = await invitee();
    const sealed = pendingOf(await flow.start(moved.email, PASSWORD, context()));
    await owner.query('UPDATE "user" SET cognito_sub = $2 WHERE id = $1', [moved.id, randomUUID()]);
    expect(await flow.beginTotpSetup(sealed, context())).toEqual(NOT_OPEN);

    const taken = await invitee();
    const keyed = await withSetupKey(pendingOf(await flow.start(taken.email, PASSWORD, context())));
    const other = await person({ status: 'invited', mfa: false, totp: false });
    await owner.query('UPDATE "user" SET cognito_sub = $2 WHERE id = $1', [taken.id, randomUUID()]);
    await owner.query('UPDATE "user" SET cognito_sub = $2 WHERE id = $1', [other.id, taken.sub]);
    expect(await flow.completeTotpSetup(keyed, setupCode(keyed), context())).toEqual(NOT_OPEN);
    expect(await factorOf(taken.sub)).toBeNull();

    // A step whose sealed subject is another live invitee's: that row's address is not the step's.
    const first = await invitee();
    const second = await invitee();
    const swapped = pendingOf(await flow.start(first.email, PASSWORD, context()));
    if (swapped.step !== 'mfa_setup') {
      throw new Error('expected the enrolment step');
    }
    expect(await flow.beginTotpSetup({ ...swapped, subject: second.sub }, context())).toEqual(NOT_OPEN);
    expect(await factorOf(first.sub)).toBeNull();
  });

  it('SEC-22: refuses a verified setup whose tokens name another subject than the rule approved, opening no session and auditing no factor (review security-N1)', async () => {
    const invited = await invitee();
    const keyed = await withSetupKey(pendingOf(await flow.start(invited.email, PASSWORD, context())));
    const { flow: enrolling, lines } = paced();
    const complete = vi.spyOn(provider, 'completeTotpSetup').mockResolvedValueOnce({ kind: 'authenticated', identity: { sub: randomUUID(), email: invited.email, method: 'totp' }, grant: 'synthetic-grant' });
    const release = vi.spyOn(provider, 'release').mockResolvedValueOnce(undefined);
    const request = context();
    expect(await enrolling.completeTotpSetup(keyed, setupCode(keyed), request)).toEqual(NOT_OPEN);
    expect(release).toHaveBeenCalledWith('synthetic-grant');
    complete.mockRestore();
    release.mockRestore();
    expect(await events(invited.id)).toEqual([]);
    expect(await openSessions(invited.id)).toBe(0);
    expect(logged(lines, ENROLMENT_REFUSED)).toEqual([{ level: 'warn', msg: ENROLMENT_REFUSED, time: expect.any(String), user_id: invited.id, request_id: request.requestId }]);
  });

  it('SEC-22: a step sealed by the release before, with no subject, starts again', async () => {
    const invited = await invitee();
    const sealed = pendingOf(await flow.start(invited.email, PASSWORD, context()));
    if (sealed.step !== 'mfa_setup') {
      throw new Error('expected the enrolment step');
    }
    const { subject: _subject, ...before } = sealed;
    expect(await flow.beginTotpSetup(before, context())).toEqual({ kind: 'refused', reason: 'expired' });
    expect(await flow.completeTotpSetup({ ...before, totp: { secret: SECRET, uri: 'otpauth://totp/x' } }, '123456', context())).toEqual({ kind: 'refused', reason: 'expired' });
  });

  it('SEC-22: enrols an invitee inside a live invitation, the address typed in any case, on the subject the provider named', async () => {
    const invited = await invitee();
    const sealed = pendingOf(await flow.start(invited.email.toUpperCase(), PASSWORD, context()));
    expect(sealed).toMatchObject({ step: 'mfa_setup', subject: invited.sub });
    const keyed = await withSetupKey(sealed);
    expect(keyed).toMatchObject({ step: 'mfa_setup', subject: invited.sub });
    const done = await flow.completeTotpSetup(keyed, setupCode(keyed), context());
    expect(done.kind).toBe('signed_in');
    expect((await owner.query('SELECT status, mfa_enrolled FROM "user" WHERE id = $1', [invited.id])).rows).toEqual([{ status: 'active', mfa_enrolled: true }]);
    expect(await factorOf(invited.sub)).toEqual(expect.any(String));
  });
});

/** A Cognito provider whose every call is refused for the client's credential, as Cognito refuses a wrong secret hash. */
function credentialRefused(): { readonly flow: SignInFlow; readonly pace: Pace; readonly lines: string[]; readonly sent: string[] } {
  const sent: string[] = [];
  const client = {
    send: (command: { constructor: { name: string } }) => {
      sent.push(command.constructor.name);
      const error = new Error('Unable to verify secret hash for client syntheticclient');
      error.name = command.constructor.name === 'RevokeTokenCommand' ? 'UnauthorizedException' : 'NotAuthorizedException';
      return Promise.reject(error);
    },
  } as unknown as CognitoClient;
  const refusing = new CognitoAuthProvider({
    client,
    userPoolId: 'us-east-1_Synthetic',
    clientId: 'syntheticclient',
    verifier: { verify: () => Promise.reject(new Error('unreached')) },
    clientSecret: new ClientSecret('synthetic-client-secret-0000000000000000000000000000'),
    logger: createLogger({ sink: () => undefined }),
  });
  const pace: Pace = { at: 0, slept: [] };
  current = pace;
  const lines: string[] = [];
  const sleep = (ms: number): Promise<void> => {
    pace.slept.push(ms);
    pace.at += ms;
    return Promise.resolve();
  };
  return { flow: new SignInFlow({ pool: app, provider: refusing, logger: createLogger({ sink: (line) => lines.push(line) }), now: () => pace.at, sleep }), pace, lines, sent };
}

const CREDENTIAL_REFUSED = 'security event: client credential refused';
const UNAVAILABLE: FlowResult = { kind: 'refused', reason: 'client_credential' };

describe('SEC-20: a refused client credential is the platform’s failure, never the person’s (docs/adr/0088, D2)', () => {
  it('SEC-20: a sign-in refused for the credential counts no failure, locks nothing even past ten, and logs a security event of its name alone', async () => {
    const user = await person();
    const { flow: refusing, lines } = credentialRefused();
    const request = context();
    expect(await refusing.start(user.email, PASSWORD, request)).toEqual(UNAVAILABLE);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(await refusing.start(user.email, PASSWORD, context())).toEqual(UNAVAILABLE);
    }
    expect((await owner.query('SELECT failed_sign_ins, locked_at FROM "user" WHERE id = $1', [user.id])).rows).toEqual([{ failed_sign_ins: 0, locked_at: null }]);
    expect(await events(user.id)).toEqual([]);
    const refusals = logged(lines, CREDENTIAL_REFUSED);
    expect(refusals).toHaveLength(11);
    expect(refusals[0]).toEqual({ level: 'error', msg: CREDENTIAL_REFUSED, time: expect.any(String), request_id: request.requestId, error_code: 'NotAuthorizedException' });
    expect(lines.join('\n')).not.toMatch(new RegExp(`${user.email}|syntheticclient|secret hash`, 'i'));
    // The person can still sign in once the credential is right.
    expect((await flow.start(user.email, PASSWORD, context())).kind).toBe('pending');
  });

  it('SEC-20: a code step refused for the credential is neither a wrong code nor an expired step, and counts nothing', async () => {
    const user = await person();
    const { flow: refusing, lines } = credentialRefused();
    const challenge = JSON.stringify({ s: 'session', u: user.sub, email: user.email });
    expect(await refusing.answerTotp({ step: 'mfa', email: user.email, challenge }, '123456', context())).toEqual(UNAVAILABLE);
    expect(await refusing.newPassword({ step: 'new_password', email: user.email, challenge }, CHOSEN, context())).toEqual(UNAVAILABLE);
    expect(await refusing.completeKey({ step: 'key', email: user.email, challenge }, {} as never, context())).toEqual(UNAVAILABLE);
    expect(await refusing.beginKey(user.email)).toEqual(UNAVAILABLE);
    expect((await owner.query('SELECT failed_sign_ins FROM "user" WHERE id = $1', [user.id])).rows).toEqual([{ failed_sign_ins: 0 }]);
    expect(await events(user.id)).toEqual([]);
    expect(logged(lines, CREDENTIAL_REFUSED).map((entry) => entry.error_code)).toEqual(['NotAuthorizedException', 'NotAuthorizedException', 'NotAuthorizedException', 'NotAuthorizedException']);
  });

  it('SEC-20: a reset request refused for the credential answers alike at the floor and logs the failure by its name, and a confirmation refused for it is no code refusal', async () => {
    const user = await person();
    const { flow: refusing, pace, lines, sent } = credentialRefused();
    const request = context();
    expect(await refusing.requestPasswordReset(user.email, request)).toEqual({ step: 'reset', email: user.email });
    expect(pace.at).toBe(RESET_REQUEST_FLOOR_MS);
    expect(sent).toEqual(['ForgotPasswordCommand']);
    expect(logged(lines, 'password reset request not delivered')).toEqual([]);
    expect(logged(lines, 'password reset request failed')).toEqual([{ level: 'error', msg: 'password reset request failed', time: expect.any(String), request_id: request.requestId, error_code: 'ClientCredentialError' }]);
    expect(await refusing.confirmPasswordReset(user.email, '123456', 'Chosen-Reset-Pass-2026', context())).toEqual({ kind: 'client_credential' });
    expect(logged(lines, 'password reset code refused')).toEqual([]);
    expect(logged(lines, CREDENTIAL_REFUSED).map((entry) => entry.error_code)).toEqual(['NotAuthorizedException']);
    expect(await events(user.id)).toEqual(['password_reset_requested:unverified_request']);
  });

  it('SEC-20: leaving a key-registration step whose grant the provider refuses for the credential still leaves, and logs the event', async () => {
    const user = await person();
    const { flow: refusing, lines } = credentialRefused();
    const request = context();
    await expect(refusing.abandon({ step: 'register_key', email: user.email, userId: user.id, grant: JSON.stringify({ a: 'access', r: 'refresh' }) }, request)).resolves.toBeUndefined();
    expect(logged(lines, CREDENTIAL_REFUSED)).toEqual([expect.objectContaining({ level: 'error', error_code: 'UnauthorizedException', request_id: request.requestId })]);
  });
});

const RESET_REQUESTED = 'password reset requested';

describe('SEC-23: each reset request for an account is logged by its user ID alone, for the per-user alarm (docs/adr/0088, D7)', () => {
  it('SEC-23: logs one line at info with the user ID and the request ID for every account, a code sent or not, and none for an unknown address', async () => {
    const active = await person();
    const locked = await person();
    await owner.query('UPDATE "user" SET locked_at = now() WHERE id = $1', [locked.id]);
    const notEnrolled = await person({ status: 'invited', mfa: false, temporary: false, totp: false });
    const disabled = await person({ status: 'disabled' });
    for (const account of [active, locked, notEnrolled, disabled]) {
      const { flow: asking, pace, lines } = paced();
      const request = context();
      expect(await asking.requestPasswordReset(account.email, request)).toEqual({ step: 'reset', email: account.email });
      expect(pace.at).toBe(RESET_REQUEST_FLOOR_MS);
      expect(logged(lines, RESET_REQUESTED), account.id).toEqual([{ level: 'info', msg: RESET_REQUESTED, time: expect.any(String), user_id: account.id, request_id: request.requestId }]);
      expect(lines.join('\n'), account.id).not.toContain(account.email);
    }
    const unknown = `${randomUUID()}@synthetic.test`;
    const { flow: nobody, lines } = paced();
    await nobody.requestPasswordReset(unknown, context());
    expect(logged(lines, RESET_REQUESTED)).toEqual([]);
    expect(lines.join('\n')).not.toContain(unknown);
  });

  it('SEC-23: logs the request even when its audit write fails, so the per-user count does not hang on the write', async () => {
    const user = await person();
    const { flow: failed, lines } = paced(failing(/INSERT INTO audit_event/, 1));
    const request = context();
    expect(await failed.requestPasswordReset(user.email, request)).toEqual({ step: 'reset', email: user.email });
    expect(logged(lines, 'password reset request failed')).toHaveLength(1);
    expect(logged(lines, RESET_REQUESTED)).toEqual([{ level: 'info', msg: RESET_REQUESTED, time: expect.any(String), user_id: user.id, request_id: request.requestId }]);
  });
});
