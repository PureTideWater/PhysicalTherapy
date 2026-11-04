import { randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl, withActor } from '@tp/db';
import type { ScopeClient, ScopePool } from '@tp/db/runtime';
import { type MigratedDatabase, addMembership, asOwner, createMigratedDatabase, createOrganization, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DevAuthProvider } from './dev-provider';
import { MemoryDevStore } from './dev-store';
import { hashPassword } from './password';
import { Sealer } from './seal';
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
    const step1 = pendingOf(await flow.start(invited.email, PASSWORD, context()));
    expect(step1.step).toBe('new_password');
    const invalid = await flow.newPassword(step1, 'weak', context());
    expect(invalid).toMatchObject({ kind: 'invalid_password', problems: expect.arrayContaining(['at least 12 characters']) });
    const step2 = pendingOf(await flow.newPassword(step1, 'Chosen-Pass-2026', context()));
    expect(step2.step).toBe('mfa_setup');
    const step3 = pendingOf(await flow.beginTotpSetup(step2));
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
  });

  it('SGN-04: reports on the first step’s pending result that the account must also register a hardware key, and nothing for a customer', async () => {
    const staff = await person({ internal: true });
    expect(await flow.start(staff.email, PASSWORD, context())).toMatchObject({ kind: 'pending', pending: { step: 'mfa' }, keyRequired: true });
    const invitedStaff = await person({ status: 'invited', mfa: false, internal: true, temporary: true, totp: false });
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
    expect(await flow.beginTotpSetup(step)).toEqual({ kind: 'refused', reason: 'expired' });
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

  it('SGN-05: answers at the floor when the audit write or the provider throws, and warns of a run over it', async () => {
    const user = await person();
    const audit = paced(failing(/INSERT INTO audit_event/, 1));
    await expect(audit.flow.requestPasswordReset(user.email, context())).rejects.toThrow('synthetic failure');
    expect(audit.pace.slept).toEqual([RESET_REQUEST_FLOOR_MS]);

    const thrown = paced();
    const broken = vi.spyOn(provider, 'requestPasswordReset').mockRejectedValueOnce(new Error('synthetic provider failure'));
    await expect(thrown.flow.requestPasswordReset(user.email, context())).rejects.toThrow('synthetic provider failure');
    expect(thrown.pace.slept).toEqual([RESET_REQUEST_FLOOR_MS]);
    broken.mockRestore();

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
  });

  it('SGN-07: a provider sign-out that fails is logged and the reset still lands (review SEC-N1)', async () => {
    const user = await person();
    const { flow: reset, lines } = paced();
    await reset.requestPasswordReset(user.email, context());
    const signOut = vi.spyOn(provider, 'globalSignOut').mockRejectedValueOnce(Object.assign(new Error('synthetic'), { name: 'InternalErrorException' }));
    const request = context();
    expect(await reset.confirmPasswordReset(user.email, codeFor(user.email), CHOSEN, request)).toEqual({ kind: 'reset', locked: false, keepEmail: true });
    signOut.mockRestore();
    expect(logged(lines, 'security event: password reset provider sign-out failed')).toEqual([
      expect.objectContaining({ level: 'error', user_id: user.id, request_id: request.requestId, error_code: 'InternalErrorException' }),
    ]);
  });

  it('SGN-07: a revoke that fails once is retried; failing twice it is logged, the provider still signs out, and the reset answers the generic failure (review R-3)', async () => {
    const once = await person();
    await signedIn(once.email);
    const retried = paced(failing(/revoke_user_sessions/, 1));
    await retried.flow.requestPasswordReset(once.email, context());
    expect(await retried.flow.confirmPasswordReset(once.email, codeFor(once.email), CHOSEN, context())).toEqual({ kind: 'reset', locked: false, keepEmail: true });
    expect(await openSessions(once.id)).toBe(0);
    expect((await events(once.id)).filter((event) => event.startsWith('password_reset_completed'))).toEqual(['password_reset_completed:email_code']);

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
  });
});
