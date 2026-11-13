import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl, withActor } from '@tp/db';
import { type ScopeClient, type ScopePool, recordAuditEvent } from '@tp/db/runtime';
import { type MigratedDatabase, addMembership, asOwner, createMigratedDatabase, createOrganization, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { type CognitoClient, CognitoAuthProvider } from './cognito-provider';
import { DevAuthProvider } from './dev-provider';
import { MemoryDevStore } from './dev-store';
import { hashPassword } from './password';
import { newRegistrationCode, registrationCodeDigest, registrationCodeKey } from './registration-code';
import { Sealer } from './seal';
import { ClientSecret } from './secret-hash';
import { listDevices, resolveSession } from './sessions';
import { type FlowResult, KEY_REGISTRATION_ALGORITHMS, KeyAlgorithmsNotOffered, type Pending, RELYING_PARTY_MISMATCH, RESET_REQUEST_FLOOR_MS, RelyingPartyMismatch, SignInFlow } from './sign-in';
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
/** What the app's own check of a key's response expects: the provider twin's relying party (docs/adr/0095). */
const WEBAUTHN = { rpId: 'localhost', origin: ORIGIN };
/** The key the flow digests a registration code under (review A3); the console's route holds the same one in the product. */
const CODE_KEY = registrationCodeKey(new Sealer(Buffer.alloc(32, 5)));

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let store: MemoryDevStore;
let provider: DevAuthProvider;
let flow: SignInFlow;
let clock = new Date();
/** The provider twin's faults, switched on around one step (docs/adr/0093, D6 and D9). */
let lostAnswer: 'after' | 'before' | undefined;
let keyRemovalFails = false;
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
    faults: { lostResetAnswer: () => lostAnswer, keyRemovalFails: () => keyRemovalFails },
  });
  flow = new SignInFlow({ registrationCodeKey: CODE_KEY, webauthn: WEBAUTHN, pool: app, provider, logger: createLogger({ sink: () => undefined }) });
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
    expect(await events(staff.id)).toEqual(expect.arrayContaining(['hardware_key_registered:', 'sign_in:webauthn']));
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
  return { flow: new SignInFlow({ registrationCodeKey: CODE_KEY, webauthn: WEBAUTHN, pool, provider, logger, now: () => pace.at, sleep }), pace, lines };
}

/** The structured log lines with this message. */
function logged(lines: readonly string[], message: string): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((entry) => entry.msg === message);
}

/** The application's pool, except that queries matching `match` fail the first `times` times `when` says so (a synthetic failure). */
function failing(match: RegExp, times: number, when: () => boolean = () => true): ScopePool<ScopeClient> {
  let left = times;
  return {
    connect: async () => {
      const client = await app.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') {
            return (text: unknown, values?: unknown[]) => {
              if (left > 0 && typeof text === 'string' && match.test(text) && when()) {
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

/** The application's pool, except that queries matching `match` are not sent and are answered with no row (a function that returns none). */
function answeringNoRow(match: RegExp): ScopePool<ScopeClient> {
  return {
    connect: async () => {
      const client = await app.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') {
            return (text: unknown, values?: unknown[]) =>
              typeof text === 'string' && match.test(text) ? Promise.resolve({ rows: [], rowCount: 0 }) : target.query(text as string, values);
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
      });
    },
  };
}

/** What a database that cannot be reached answers a connection with (a synthetic failure). */
const UNREACHABLE = 'synthetic: the database is unreachable';

/** The application's pool while `reachable()` holds; otherwise every connection is refused, as an unreachable database refuses one. */
function reachableWhile(reachable: () => boolean): ScopePool<ScopeClient> {
  return { connect: () => (reachable() ? app.connect() : Promise.reject(Object.assign(new Error(UNREACHABLE), { code: 'ECONNREFUSED' }))) };
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

/** The provider sign-outs queued for an account, by cause and the cause's request (the outbox job asks: docs/adr/0095). */
async function signOutsQueued(userId: string): Promise<{ reason: string; request_id: string }[]> {
  return (await owner.query<{ reason: string; request_id: string }>('SELECT reason, request_id FROM provider_sign_out WHERE user_id = $1 ORDER BY queued_at, id', [userId])).rows;
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
    const request = context();
    expect(await reset.confirmPasswordReset(user.email, wrong(code), CHOSEN, request)).toEqual({ kind: 'rejected' });
    expect(await reset.confirmPasswordReset(`${randomUUID()}@synthetic.test`, code, CHOSEN, context())).toEqual({ kind: 'rejected' });
    expect(await reset.confirmPasswordReset(user.email, code, 'weakpassword', context())).toMatchObject({ kind: 'invalid_password', problems: expect.arrayContaining(['a digit']) });
    expect(await signOutsQueued(user.id)).toEqual([]);
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
    // The provider was asked all the same, an account or none (docs/adr/0091, D15): it holds the new password.
    expect(await provider.signIn(stray, CHOSEN)).toMatchObject({ kind: 'mfa_required' });
    expect((await owner.query<{ count: string }>("SELECT count(*) AS count FROM audit_event WHERE action = 'password_reset_completed'")).rows[0]?.count).toBe(recorded);
    expect(await noticeCount()).toBe(queued);
  });

  it('SGN-07: a reset ends every session, records the reset and queues the provider’s sign-out for the job in that transaction, calls the provider’s sign-out from nowhere in the web, and still asks for the second factor', async () => {
    const user = await person();
    const session = await signedIn(user.email);
    const { flow: reset, lines } = paced();
    await reset.requestPasswordReset(user.email, context());
    const request = context();
    expect(await reset.confirmPasswordReset(user.email, codeFor(user.email), CHOSEN, request)).toEqual({ kind: 'reset', locked: false, keepEmail: true });
    // The web has no way to ask the provider (docs/adr/0095): the row, written with the reset, is the outbox job's to send.
    expect(provider).not.toHaveProperty('globalSignOut');
    expect(await signOutsQueued(user.id)).toEqual([{ reason: 'password_reset_completed', request_id: request.requestId }]);
    expect(logged(lines, 'security event: password reset provider sign-out failed')).toEqual([]);
    expect(await openSessions(user.id)).toBe(0);
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

  it('SGN-07: the reset lands without waiting on the provider, whose sign-out is one queued row of IDs and no line of the web’s (review SEC-N1; docs/adr/0095)', async () => {
    const user = await person();
    await signedIn(user.email);
    const { flow: reset, lines } = paced();
    await reset.requestPasswordReset(user.email, context());
    const request = context();
    expect(await reset.confirmPasswordReset(user.email, codeFor(user.email), CHOSEN, request)).toEqual({ kind: 'reset', locked: false, keepEmail: true });
    expect(logged(lines, 'security event: password reset provider sign-out failed')).toEqual([]);
    // The row: the account, the cause, the cause's event and request, and no try yet. Nothing of the person.
    const queued = await owner.query<Record<string, unknown>>('SELECT * FROM provider_sign_out WHERE user_id = $1', [user.id]);
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0]).toMatchObject({ user_id: user.id, reason: 'password_reset_completed', request_id: request.requestId, attempts: 0 });
    expect(JSON.stringify(queued.rows)).not.toContain(user.email);
    expect(JSON.stringify(queued.rows)).not.toContain(user.sub);
    // The sessions ended with the reset, and the password-changed email is queued with it (SGN-16).
    expect(await openSessions(user.id)).toBe(0);
    expect(await notices(user.id)).toEqual([QUEUED]);
  });

  it('a reset’s sweep and its audit event are one transaction: while the event cannot be written no session ends, and the try that writes it ends them all (Queues item 25 (d))', async () => {
    // The fault is armed for the confirmation alone: the request's own events are written as they are.
    let confirming = false;
    const kept = await person();
    await signedIn(kept.email);
    const failed = paced(failing(/INSERT INTO audit_event/, 2, () => confirming));
    await failed.flow.requestPasswordReset(kept.email, context());
    confirming = true;
    expect(await failed.flow.confirmPasswordReset(kept.email, codeFor(kept.email), CHOSEN, context())).toEqual({ kind: 'sessions_not_ended' });
    confirming = false;
    // Both tries swept the sessions and then failed at the event: each sweep rolled back with it.
    expect(await openSessions(kept.id)).toBe(1);
    expect((await events(kept.id)).filter((event) => event.startsWith('password_reset_completed'))).toEqual([]);

    const swept = await person();
    await signedIn(swept.email);
    const retried = paced(failing(/INSERT INTO audit_event/, 1, () => confirming));
    await retried.flow.requestPasswordReset(swept.email, context());
    confirming = true;
    expect(await retried.flow.confirmPasswordReset(swept.email, codeFor(swept.email), CHOSEN, context())).toEqual({ kind: 'reset', locked: false, keepEmail: true });
    confirming = false;
    expect(await openSessions(swept.id)).toBe(0);
    expect((await events(swept.id)).filter((event) => event.startsWith('password_reset_completed'))).toEqual(['password_reset_completed:email_code']);
  });

  it('SGN-07: a revoke that fails once is retried; failing twice it is logged, no sign-out is queued for a reset that recorded nothing, and the reset answers the generic failure (review R-3)', async () => {
    const once = await person();
    await signedIn(once.email);
    const retried = paced(failing(/revoke_user_sessions/, 1));
    await retried.flow.requestPasswordReset(once.email, context());
    expect(await retried.flow.confirmPasswordReset(once.email, codeFor(once.email), CHOSEN, context())).toEqual({ kind: 'reset', locked: false, keepEmail: true });
    expect(await openSessions(once.id)).toBe(0);
    expect((await events(once.id)).filter((event) => event.startsWith('password_reset_completed'))).toEqual(['password_reset_completed:email_code']);
    // One notice and one sign-out queued: the failed try rolled back with everything it wrote (SGN-16).
    expect(await notices(once.id)).toEqual([QUEUED]);
    expect((await signOutsQueued(once.id)).map((row) => row.reason)).toEqual(['password_reset_completed']);

    const twice = await person();
    await signedIn(twice.email);
    const failed = paced(failing(/revoke_user_sessions/, 2));
    await failed.flow.requestPasswordReset(twice.email, context());
    const request = context();
    expect(await failed.flow.confirmPasswordReset(twice.email, codeFor(twice.email), CHOSEN, request)).toEqual({ kind: 'sessions_not_ended' });
    // Both tries rolled back, so neither left a row for a recorded reset: the line below is what reaches the operator
    // (the sign-out the unrecorded reset queues on its own is SGN-28's).
    expect((await signOutsQueued(twice.id)).filter((row) => row.reason !== 'password_reset_unrecorded')).toEqual([]);
    expect(await openSessions(twice.id)).toBe(1);
    expect(logged(failed.lines, 'security event: password reset sessions not ended')).toEqual([expect.objectContaining({ level: 'error', user_id: twice.id, request_id: request.requestId })]);
    // Neither try recorded the reset, so no password-changed email is queued: this line, which pages the operator
    // (PasswordResetSessionsNotEnded), is the one signal of this path (SGN-16; docs/adr/0091, D15).
    expect((await events(twice.id)).filter((event) => event.startsWith('password_reset_completed'))).toEqual([]);
    expect(await notices(twice.id)).toEqual([]);
  });

  it('SGN-16: a confirmation made while the database cannot be reached fails before the provider is asked, so the password is unchanged and the same code resets once the database answers (docs/adr/0091, D15; review SEC-02 of 2026-11-11)', async () => {
    const user = await person();
    await signedIn(user.email);
    await paced().flow.requestPasswordReset(user.email, context());
    const code = codeFor(user.email);
    let reachable = false;
    const outage = paced(reachableWhile(() => reachable));
    const asked = vi.spyOn(provider, 'confirmPasswordReset');
    const thrown = await outage.flow.confirmPasswordReset(user.email, code, CHOSEN, context()).catch((error: unknown) => error);
    const providerCalls = asked.mock.calls.length;
    asked.mockRestore();
    // The lookup's own error leaves the confirmation: nothing answers as if the password had been reset.
    expect(thrown).toMatchObject({ message: UNREACHABLE });
    // Nothing changed at the provider, which was never asked: the old password still passes its first step, and the new
    // one does not.
    expect(await provider.signIn(user.email, PASSWORD)).toMatchObject({ kind: 'mfa_required' });
    expect(await provider.signIn(user.email, CHOSEN)).toEqual({ kind: 'rejected', stage: 'password' });
    expect(providerCalls).toBe(0);
    // No reset happened, so none is recorded, told or logged, and the open session rightly stays.
    expect(await openSessions(user.id)).toBe(1);
    expect((await events(user.id)).filter((event) => event.startsWith('password_reset_completed'))).toEqual([]);
    expect(await notices(user.id)).toEqual([]);
    expect(logged(outage.lines, 'security event: password reset completed')).toEqual([]);
    // Nothing was thrown away: the code is unspent, and completes the reset once the database answers.
    reachable = true;
    const request = context();
    expect(await outage.flow.confirmPasswordReset(user.email, code, CHOSEN, request)).toEqual({ kind: 'reset', locked: false, keepEmail: true });
    expect(await openSessions(user.id)).toBe(0);
    expect(await notices(user.id)).toEqual([QUEUED]);
    expect(logged(outage.lines, 'security event: password reset completed')).toEqual([expect.objectContaining({ level: 'warn', user_id: user.id, request_id: request.requestId })]);
  });

  it('SGN-28: a reset whose own transaction fails twice still queues the provider sign-out, alone, and the line says it did', async () => {
    const user = await person();
    await signedIn(user.email);
    const failed = paced(failing(/revoke_user_sessions/, 2));
    await failed.flow.requestPasswordReset(user.email, context());
    const request = context();
    expect(await failed.flow.confirmPasswordReset(user.email, codeFor(user.email), CHOSEN, request)).toEqual({ kind: 'sessions_not_ended' });
    // The third transaction queued the provider's sign-out under this request, and did nothing else: no session ended,
    // no reset recorded, no password-changed email (docs/adr/0091, D15's gap stays for those; the line still pages).
    expect(await signOutsQueued(user.id)).toEqual([{ reason: 'password_reset_unrecorded', request_id: request.requestId }]);
    expect(await openSessions(user.id)).toBe(1);
    expect((await events(user.id)).filter((event) => event.startsWith('password_reset_completed'))).toEqual([]);
    expect(await notices(user.id)).toEqual([]);
    expect(logged(failed.lines, 'security event: password reset sessions not ended')).toEqual([
      expect.objectContaining({ level: 'error', user_id: user.id, request_id: request.requestId, outcome_code: 'provider_sign_out_queued' }),
    ]);
    expect(failed.lines.join('\n')).not.toContain(user.email);
  });

  it('SGN-28: where the sign-out cannot be queued either, the reset answers as before and the line says not queued', async () => {
    const user = await person();
    await signedIn(user.email);
    const failed = paced(failing(/revoke_user_sessions|provider_sign_out_unrecorded_reset/, 3));
    await failed.flow.requestPasswordReset(user.email, context());
    const request = context();
    expect(await failed.flow.confirmPasswordReset(user.email, codeFor(user.email), CHOSEN, request)).toEqual({ kind: 'sessions_not_ended' });
    expect(await signOutsQueued(user.id)).toEqual([]);
    expect(logged(failed.lines, 'security event: password reset sessions not ended')).toEqual([
      expect.objectContaining({ level: 'error', user_id: user.id, request_id: request.requestId, outcome_code: 'provider_sign_out_not_queued' }),
    ]);
  });

  it('SGN-16: a reset the provider completes as the database becomes unreachable is logged as sessions not ended by the user’s ID, queues no sign-out and answers the generic failure (docs/adr/0091, D15; review SEC-02 of 2026-11-11)', async () => {
    const user = await person();
    await signedIn(user.email);
    await paced().flow.requestPasswordReset(user.email, context());
    // The lookup is answered; from the provider's confirmation on, every connection is refused.
    let reachable = true;
    const outage = paced(reachableWhile(() => reachable));
    const confirm = provider.confirmPasswordReset.bind(provider);
    const confirmed = vi.spyOn(provider, 'confirmPasswordReset').mockImplementation(async (...args) => {
      const result = await confirm(...args);
      reachable = false;
      return result;
    });
    const request = context();
    const answered = await outage.flow.confirmPasswordReset(user.email, codeFor(user.email), CHOSEN, request).catch((error: unknown) => error);
    confirmed.mockRestore();
    expect(answered).toEqual({ kind: 'sessions_not_ended' });
    expect(await signOutsQueued(user.id)).toEqual([]);
    // The third transaction, which would queue the provider's sign-out alone (SGN-28), met the same outage: the line says so.
    expect(logged(outage.lines, 'security event: password reset sessions not ended')).toEqual([
      expect.objectContaining({ level: 'error', user_id: user.id, request_id: request.requestId, outcome_code: 'provider_sign_out_not_queued' }),
    ]);
    expect(outage.lines.join('\n')).not.toContain(user.email);
    // The provider holds the new password; the app ended no session and recorded no reset, so no password-changed email
    // is queued: the line above, which pages the operator (PasswordResetSessionsNotEnded), is this reset's signal.
    expect(await provider.signIn(user.email, CHOSEN)).toMatchObject({ kind: 'mfa_required' });
    expect(await provider.signIn(user.email, PASSWORD)).toEqual({ kind: 'rejected', stage: 'password' });
    expect(await openSessions(user.id)).toBe(1);
    expect((await events(user.id)).filter((event) => event.startsWith('password_reset_completed'))).toEqual([]);
    expect(await notices(user.id)).toEqual([]);
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

/** A password reset recorded for the account by the account itself, as the reset's transaction records it: the database moves the account's mark and ends its sessions (docs/adr/0093, D1). */
async function resetRecorded(userId: string): Promise<void> {
  await withActor(app, userId, (scope) => recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user', objectId: userId, purpose: 'email_code', requestId: `test-${randomUUID()}` }));
}

/** The account's mark: its latest recorded password reset on the database's clock, or null. */
async function markOf(userId: string): Promise<Date | null> {
  const { rows } = await owner.query<{ sign_in_not_before: Date | null }>('SELECT sign_in_not_before FROM "user" WHERE id = $1', [userId]);
  return rows[0]?.sign_in_not_before ?? null;
}

/** The security events recorded for the account, by purpose. */
async function securityEvents(userId: string): Promise<string[]> {
  return (await events(userId)).filter((event) => event.startsWith('security_event:')).map((event) => event.slice('security_event:'.length));
}

/** Waits past the mark's millisecond on the real clock, so an attempt begun now is after it (the comparison is never loosened). */
const pastTheMark = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 5);
  });

/** A pending step's start. */
function beganOf(pending: Pending): number | undefined {
  return pending.step === 'reset' ? undefined : pending.began;
}

/** The step as the release before sealed it: with no start. */
function withoutBegan(pending: Pending): Pending {
  const { began: _began, ...before } = pending as Pending & { readonly began?: number };
  return before;
}

/** A staff member (a hardware key is required) with a key registered, and the key. */
async function staffWithKey(): Promise<{ readonly staff: { id: string; email: string; sub: string }; readonly key: SoftAuthenticator }> {
  const staff = await person({ internal: true });
  const key = new SoftAuthenticator(ORIGIN);
  const begun = await flow.beginKeyRegistration(pendingOf(await flow.answerTotp(pendingOf(await flow.start(staff.email, PASSWORD, context())), nextCode(), context())), context());
  if ('kind' in begun) {
    throw new Error('expected options');
  }
  expect(await flow.completeKeyRegistration(begun.pending, key.create(begun.options), context())).toEqual({ kind: 'key_registered' });
  return { staff, key };
}

/** A staff member's key-registration step with its options asked for, and a key to register. */
async function registrationBegun(use: SignInFlow = flow) {
  const staff = await person({ internal: true });
  const step = pendingOf(await use.answerTotp(pendingOf(await use.start(staff.email, PASSWORD, context())), nextCode(), context()));
  const begun = await use.beginKeyRegistration(step, context());
  if ('kind' in begun) {
    throw new Error('expected options');
  }
  return { staff, step, begun, key: new SoftAuthenticator(ORIGIN) };
}

const EXPIRED: FlowResult = { kind: 'refused', reason: 'expired' };
/** The three log lines infra counts (docs/adr/0093, D5, D6 and D9). */
const STEP_REFUSED_LINE = 'security event: sign-in step refused after a password reset';
const KEY_ACROSS_RESET_LINE = 'security event: hardware key registered across a password reset';
const CROSSED_LINE = 'security event: sign-in refused for a crossed account';
const RESET_OUTCOME_UNKNOWN_LINE = 'security event: password reset outcome unknown';

describe('SGN-17: a sign-in step begun before a password reset is refused after it (docs/adr/0093)', () => {
  it('SGN-17: a code step that proved the old password before a reset opens no session when its code is answered after it: refused before the provider is asked, recorded once, counted as no failure; a sign-in begun after the reset opens one', async () => {
    const user = await person();
    await signedIn(user.email);
    // Before the reset: the old password is proved, and the step waits at the code.
    const begun = pendingOf(await flow.start(user.email, PASSWORD, context()));
    expect(begun.step).toBe('mfa');
    const { flow: reset, lines } = paced();
    await reset.requestPasswordReset(user.email, context());
    expect(await reset.confirmPasswordReset(user.email, codeFor(user.email), CHOSEN, context())).toEqual({ kind: 'reset', locked: false, keepEmail: true });
    // The reset ended every session, moved the account's mark, refuses the old password and queued exactly one notice.
    expect(await openSessions(user.id)).toBe(0);
    expect(await markOf(user.id)).toBeInstanceOf(Date);
    expect(await flow.start(user.email, PASSWORD, context())).toEqual({ kind: 'refused', reason: 'credentials' });
    expect(await notices(user.id)).toEqual([QUEUED]);
    // After the reset: the step begun before it is answered with a current code. The provider is never asked.
    const asked = vi.spyOn(provider, 'answerTotp');
    const lastStep = (await store.bySub(user.sub))?.totpLastStep;
    const failuresBefore = (await events(user.id)).filter((event) => event.startsWith('sign_in_failed'));
    const request = context();
    const finished = await reset.answerTotp(begun, nextCode(), request);
    const calls = asked.mock.calls.length;
    asked.mockRestore();
    expect(finished).toEqual(EXPIRED);
    expect(calls).toBe(0);
    expect((await store.bySub(user.sub))?.totpLastStep).toBe(lastStep);
    expect(await openSessions(user.id)).toBe(0);
    expect(await securityEvents(user.id)).toEqual(['step_before_reset_mfa']);
    // The one failure counted is the old password's own refusal above: the stale step counts none.
    expect(failuresBefore).toEqual(['sign_in_failed:password']);
    expect((await events(user.id)).filter((event) => event.startsWith('sign_in_failed'))).toEqual(failuresBefore);
    expect(logged(lines, STEP_REFUSED_LINE)).toEqual([{ level: 'warn', msg: STEP_REFUSED_LINE, time: expect.any(String), user_id: user.id, request_id: request.requestId, error_code: 'mfa' }]);
    expect(lines.join('\n')).not.toContain(user.email);
    // A sign-in begun after the reset, with the new password, opens a session.
    await pastTheMark();
    const fresh = await signedIn(user.email, CHOSEN);
    expect((await resolveSession(app, fresh.sessionToken, 'test')).state).toBe('active');
    const { rows } = await owner.query<{ after_mark: boolean }>(
      'SELECT s.sign_in_began_at > u.sign_in_not_before AS after_mark FROM user_session s JOIN "user" u ON u.id = s.user_id WHERE s.user_id = $1 AND s.ended_at IS NULL',
      [user.id],
    );
    expect(rows).toEqual([{ after_mark: true }]);
    expect(await notices(user.id)).toEqual([QUEUED]);
  });

  it('SGN-17: a key-registration step begun before a reset registers no key after it, though the provider has not yet been asked to sign out: refused at the options and at the verify, before the provider is asked, its grant given back', async () => {
    // Before the reset: two accounts that must use a hardware key and have none prove the old password and a code; the
    // second has also asked for its options.
    const staff = await person({ internal: true });
    const step = pendingOf(await flow.answerTotp(pendingOf(await flow.start(staff.email, PASSWORD, context())), nextCode(), context()));
    expect(step).toMatchObject({ step: 'register_key', userId: staff.id });
    const second = await registrationBegun();
    const { flow: reset, lines } = paced();
    for (const account of [staff, second.staff]) {
      await reset.requestPasswordReset(account.email, context());
      // The provider's sign-out is only queued (the job asks within about a minute), so the grant is still good.
      expect(await reset.confirmPasswordReset(account.email, codeFor(account.email), CHOSEN, context())).toEqual({ kind: 'reset', locked: false, keepEmail: true });
      expect(await notices(account.id)).toEqual([QUEUED]);
      expect((await owner.query('SELECT 1 FROM provider_sign_out WHERE user_id = $1 AND done_at IS NULL', [account.id])).rowCount).toBe(1);
    }
    expect(logged(lines, 'security event: password reset provider sign-out failed')).toEqual([]);
    // After the reset: neither the options nor the verify reaches the provider, and each gives the grant back.
    const options = vi.spyOn(provider, 'beginKeyRegistration');
    const verify = vi.spyOn(provider, 'completeKeyRegistration');
    const release = vi.spyOn(provider, 'release');
    const atOptions = context();
    expect(await reset.beginKeyRegistration(step, atOptions)).toEqual(EXPIRED);
    const atVerify = context();
    expect(await reset.completeKeyRegistration(second.begun.pending, second.key.create(second.begun.options), atVerify)).toEqual(EXPIRED);
    const asked = [options.mock.calls.length, verify.mock.calls.length, release.mock.calls.length];
    options.mockRestore();
    verify.mockRestore();
    release.mockRestore();
    expect(asked).toEqual([0, 0, 2]);
    expect((await store.bySub(staff.sub))?.credentials).toEqual([]);
    expect((await store.bySub(second.staff.sub))?.credentials).toEqual([]);
    expect(await securityEvents(staff.id)).toEqual(['step_before_reset_register_key']);
    expect(await securityEvents(second.staff.id)).toEqual(['step_before_reset_register_key']);
    expect((await events(staff.id)).filter((event) => event.startsWith('hardware_key_registered'))).toEqual([]);
    expect(logged(lines, STEP_REFUSED_LINE)).toEqual([
      expect.objectContaining({ level: 'warn', user_id: staff.id, request_id: atOptions.requestId, error_code: 'register_key' }),
      expect.objectContaining({ level: 'warn', user_id: second.staff.id, request_id: atVerify.requestId, error_code: 'register_key' }),
    ]);
    // No key signs in: the key surface has nothing to assert with.
    const keyStart = await flow.beginKey(staff.email);
    if ('kind' in keyStart) {
      throw new Error('expected options');
    }
    expect(await flow.completeKey(keyStart.pending, second.key.get(keyStart.options), context())).toEqual({ kind: 'refused', reason: 'credentials' });
  });

  it('SGN-17: every step of one attempt carries the one start read from the database before the provider was asked, and the session records it', async () => {
    const invited = await person({ status: 'invited', mfa: false, temporary: true, totp: false });
    await invitation(invited.id, 'live');
    const before = Date.now();
    const step1 = pendingOf(await flow.start(invited.email, PASSWORD, context()));
    const began = beganOf(step1);
    expect(typeof began).toBe('number');
    expect(Math.abs((began ?? 0) - before)).toBeLessThan(60_000);
    const refusedPassword = await flow.newPassword(step1, 'weak', context());
    expect(refusedPassword.kind === 'invalid_password' ? beganOf(refusedPassword.pending) : undefined).toBe(began);
    const step2 = pendingOf(await flow.newPassword(step1, 'Chosen-Pass-2026', context()));
    const step3 = await withSetupKey(step2);
    expect([step2.step, beganOf(step2), beganOf(step3)]).toEqual(['mfa_setup', began, began]);
    const done = await flow.completeTotpSetup(step3, setupCode(step3), context());
    expect(done.kind).toBe('signed_in');
    const { rows } = await owner.query<{ began: Date | null }>('SELECT sign_in_began_at AS began FROM user_session WHERE user_id = $1', [invited.id]);
    expect(rows.map((row) => row.began?.getTime())).toEqual([began]);
    expect(await securityEvents(invited.id)).toEqual([]);
    // A staff member's code step and key-registration step carry it too; a key step reads its own.
    const staff = await person({ internal: true });
    const code = pendingOf(await flow.start(staff.email, PASSWORD, context()));
    const registration = pendingOf(await flow.answerTotp(code, nextCode(), context()));
    const options = await flow.beginKeyRegistration(registration, context());
    expect([registration.step, beganOf(registration), 'kind' in options ? undefined : beganOf(options.pending)]).toEqual(['register_key', beganOf(code), beganOf(code)]);
    expect(registration).not.toHaveProperty('addressUserId');
    const keyStart = await flow.beginKey(staff.email);
    expect('kind' in keyStart ? undefined : typeof beganOf(keyStart.pending)).toBe('number');
  });

  it('SGN-17: a step begun before a reset replaces no temporary password and enrols no factor after it: refused at the new password, at the setup key and at the code, each before the provider is asked, each recorded', async () => {
    const { flow: watched, lines } = paced();
    // The new password.
    const temporary = await person({ status: 'invited', mfa: false, temporary: true, totp: false });
    await invitation(temporary.id, 'live');
    const choose = pendingOf(await flow.start(temporary.email, PASSWORD, context()));
    expect(choose.step).toBe('new_password');
    await resetRecorded(temporary.id);
    const setPassword = vi.spyOn(provider, 'setNewPassword');
    expect(await watched.newPassword(choose, CHOSEN, context())).toEqual(EXPIRED);
    expect(setPassword.mock.calls).toEqual([]);
    setPassword.mockRestore();
    expect((await store.bySub(temporary.sub))?.temporary).toBe(true);
    expect(await securityEvents(temporary.id)).toEqual(['step_before_reset_new_password']);
    expect((await events(temporary.id)).filter((event) => event.startsWith('password_changed'))).toEqual([]);
    // The setup key.
    const atKey = await invitee();
    const enrol = pendingOf(await flow.start(atKey.email, PASSWORD, context()));
    expect(enrol.step).toBe('mfa_setup');
    await resetRecorded(atKey.id);
    const beginSetup = vi.spyOn(provider, 'beginTotpSetup');
    expect(await watched.beginTotpSetup(enrol, context())).toEqual(EXPIRED);
    expect(beginSetup.mock.calls).toEqual([]);
    beginSetup.mockRestore();
    expect(await securityEvents(atKey.id)).toEqual(['step_before_reset_mfa_setup']);
    // The code that would store the factor.
    const atCode = await invitee();
    const withKey = await withSetupKey(pendingOf(await flow.start(atCode.email, PASSWORD, context())));
    await resetRecorded(atCode.id);
    const completeSetup = vi.spyOn(provider, 'completeTotpSetup');
    expect(await watched.completeTotpSetup(withKey, setupCode(withKey), context())).toEqual(EXPIRED);
    expect(completeSetup.mock.calls).toEqual([]);
    completeSetup.mockRestore();
    expect(await factorOf(atCode.sub)).toBeNull();
    expect(await securityEvents(atCode.id)).toEqual(['step_before_reset_mfa_setup']);
    expect((await events(atCode.id)).filter((event) => event.startsWith('mfa_enrolled'))).toEqual([]);
    expect(logged(lines, STEP_REFUSED_LINE).map((line) => [line.user_id, line.error_code])).toEqual([
      [temporary.id, 'new_password'],
      [atKey.id, 'mfa_setup'],
      [atCode.id, 'mfa_setup'],
    ]);
    // An attempt begun after the reset goes on: the account's own later sign-in is not held back.
    await pastTheMark();
    expect(pendingOf(await flow.newPassword(pendingOf(await flow.start(temporary.email, PASSWORD, context())), CHOSEN, context())).step).toBe('mfa_setup');
  });

  it('SGN-17: a key step is decided only after the provider verified the assertion: a wrong key after a reset is a failed key, as for any account, and the right key is then refused, recorded, and opens no session', async () => {
    const { staff, key } = await staffWithKey();
    const stale = await flow.beginKey(staff.email);
    const other = await flow.beginKey(staff.email);
    if ('kind' in stale || 'kind' in other) {
      throw new Error('expected options');
    }
    await resetRecorded(staff.id);
    const { flow: watched, lines } = paced();
    // Not a valid assertion: the answer is the one an account never reset gets, and nothing about the reset is recorded.
    expect(await watched.completeKey(other.pending, new SoftAuthenticator(ORIGIN).get(other.options), context())).toEqual({ kind: 'refused', reason: 'credentials' });
    expect(await securityEvents(staff.id)).toEqual([]);
    expect(logged(lines, STEP_REFUSED_LINE)).toEqual([]);
    // A valid one: the provider is asked first, and the step is refused afterwards.
    const verify = vi.spyOn(provider, 'completeKeySignIn');
    const release = vi.spyOn(provider, 'release');
    const request = context();
    expect(await watched.completeKey(stale.pending, key.get(stale.options), request)).toEqual(EXPIRED);
    const asked = [verify.mock.calls.length, release.mock.calls.length];
    verify.mockRestore();
    release.mockRestore();
    expect(asked).toEqual([1, 1]);
    expect(await openSessions(staff.id)).toBe(0);
    expect(await securityEvents(staff.id)).toEqual(['step_before_reset_key']);
    expect(logged(lines, STEP_REFUSED_LINE)).toEqual([expect.objectContaining({ level: 'warn', user_id: staff.id, request_id: request.requestId, error_code: 'key' })]);
    // The key itself is the account's still (a reset removes no key; ADR 0081 A5): a key step begun after the reset signs in.
    await pastTheMark();
    const fresh = await flow.beginKey(staff.email);
    if ('kind' in fresh) {
      throw new Error('expected options');
    }
    expect((await flow.completeKey(fresh.pending, key.get(fresh.options), context())).kind).toBe('signed_in');
  });

  it('SGN-17: a reset that lands between the flow’s check and the session’s insert is refused by the database under the account’s lock, recorded, and answered as a closed step', async () => {
    const user = await person();
    const begun = pendingOf(await flow.start(user.email, PASSWORD, context()));
    const { flow: watched, lines } = paced();
    // The grant is given back after the flow's check and just before the session is opened: the reset lands there.
    const release = vi.spyOn(provider, 'release').mockImplementationOnce(() => resetRecorded(user.id));
    const request = context();
    const finished = await watched.answerTotp(begun, nextCode(), request);
    release.mockRestore();
    expect(finished).toEqual(EXPIRED);
    expect(await owner.query('SELECT 1 FROM user_session WHERE user_id = $1', [user.id])).toMatchObject({ rowCount: 0 });
    expect(await owner.query('SELECT 1 FROM user_device WHERE user_id = $1', [user.id])).toMatchObject({ rowCount: 0 });
    expect(await securityEvents(user.id)).toEqual(['step_before_reset_mfa']);
    expect((await events(user.id)).filter((event) => event.startsWith('sign_in:'))).toEqual([]);
    expect(logged(lines, STEP_REFUSED_LINE)).toEqual([expect.objectContaining({ level: 'warn', user_id: user.id, request_id: request.requestId, error_code: 'mfa' })]);
  });

  it('SGN-17: in a crossed state (the typed address’s account is not the provider’s subject’s) both accounts are judged, so a reset of either refuses the step with its record; with neither reset the pair is refused outright, opens nothing and is logged by the subject’s ID', async () => {
    // The provider's record under the first account's address names the second account's subject.
    const crossed = async () => {
      const typed = await person();
      const subject = await person();
      await store.update(typed.sub, (record) => ({ ...record, email: `moved-${record.email}` }));
      await store.put({ sub: subject.sub, email: typed.email, passwordHash: await hashPassword(PASSWORD, CHEAP), temporary: false, totpSecret: SECRET, totpLastStep: -1, credentials: [] });
      return { typed, subject };
    };
    const { flow: watched, lines } = paced();
    // The address's account was reset (the reset marks the account its typed address names): refused at the code step.
    const first = await crossed();
    const firstStep = pendingOf(await flow.start(first.typed.email, PASSWORD, context()));
    await resetRecorded(first.typed.id);
    expect(await watched.answerTotp(firstStep, nextCode(), context())).toEqual(EXPIRED);
    expect(await securityEvents(first.typed.id)).toEqual(['step_before_reset_mfa']);
    // The subject's account was reset: the code step sees nothing for the address, and the proven subject is refused.
    const second = await crossed();
    const secondStep = pendingOf(await flow.start(second.typed.email, PASSWORD, context()));
    await resetRecorded(second.subject.id);
    expect(await watched.answerTotp(secondStep, nextCode(), context())).toEqual(EXPIRED);
    expect(await securityEvents(second.subject.id)).toEqual(['step_before_reset_mfa']);
    expect(await securityEvents(second.typed.id)).toEqual([]);
    // The address's account is reset while the provider is being asked: judged again once the subject is proven.
    const third = await crossed();
    const thirdStep = pendingOf(await flow.start(third.typed.email, PASSWORD, context()));
    const answer = provider.answerTotp.bind(provider);
    const during = vi.spyOn(provider, 'answerTotp').mockImplementationOnce(async (...args) => {
      const result = await answer(...args);
      await resetRecorded(third.typed.id);
      return result;
    });
    expect(await watched.answerTotp(thirdStep, nextCode(), context())).toEqual(EXPIRED);
    during.mockRestore();
    expect(await securityEvents(third.typed.id)).toEqual(['step_before_reset_mfa']);
    expect(await securityEvents(third.subject.id)).toEqual([]);
    expect(logged(lines, STEP_REFUSED_LINE).map((line) => line.user_id)).toEqual([first.typed.id, second.subject.id, third.typed.id]);
    expect(logged(lines, CROSSED_LINE)).toEqual([]);
    // With neither reset, the crossed pair is refused outright (review SEC-S1 of 2026-11-11): the reset's mark and sweep
    // and the session's check would each cover one account of the two, so no session opens for either, the grant is
    // given back, and the line names the subject's account by its ID.
    const sound = await crossed();
    const release = vi.spyOn(provider, 'release');
    const request = context();
    expect(await watched.answerTotp(pendingOf(await flow.start(sound.typed.email, PASSWORD, context())), nextCode(), request)).toEqual({ kind: 'refused', reason: 'no_account' });
    expect(release.mock.calls).toHaveLength(1);
    release.mockRestore();
    expect(logged(lines, CROSSED_LINE)).toEqual([expect.objectContaining({ level: 'warn', user_id: sound.subject.id, request_id: request.requestId })]);
    expect(await securityEvents(sound.subject.id)).toEqual([]);
    for (const pair of [first, second, third, sound]) {
      expect(await openSessions(pair.subject.id)).toBe(0);
      expect(await openSessions(pair.typed.id)).toBe(0);
    }
    // One account typed in another case is one account, never crossed.
    const plain = await person();
    expect((await watched.answerTotp(pendingOf(await flow.start(plain.email.toUpperCase(), PASSWORD, context())), nextCode(), context())).kind).toBe('signed_in');
  });

  it('SGN-17: a key whose registration returns after a reset was recorded is removed at the provider and reported; when it cannot be removed the account is locked, so the key signs in to nothing, and it is reported as not removed and audited as registered; either way the step ends', async () => {
    const landsDuring = (userId: string) => {
      const complete = provider.completeKeyRegistration.bind(provider);
      return vi.spyOn(provider, 'completeKeyRegistration').mockImplementationOnce(async (...args) => {
        const registered = await complete(...args);
        // The reset commits while the registration is at the provider.
        await resetRecorded(userId);
        return registered;
      });
    };
    const lockedOf = async (userId: string) => (await owner.query<{ locked: boolean }>('SELECT locked_at IS NOT NULL AS locked FROM "user" WHERE id = $1', [userId])).rows[0]?.locked;
    const { flow: watched, lines } = paced();
    // Removed.
    const removed = await registrationBegun();
    let during = landsDuring(removed.staff.id);
    const release = vi.spyOn(provider, 'release');
    const first = context();
    expect(await watched.completeKeyRegistration(removed.begun.pending, removed.key.create(removed.begun.options), first)).toEqual(EXPIRED);
    during.mockRestore();
    expect(release.mock.calls).toHaveLength(1);
    release.mockRestore();
    expect((await store.bySub(removed.staff.sub))?.credentials).toEqual([]);
    expect(await securityEvents(removed.staff.id)).toEqual(['key_registered_across_reset']);
    expect((await events(removed.staff.id)).filter((event) => event.startsWith('hardware_key_registered'))).toEqual([]);
    expect(await lockedOf(removed.staff.id)).toBe(false);
    // Not removed (the reset's own provider sign-out has ended the token that could remove it; review SEC-B1 of
    // 2026-11-11): the account is locked in the same step.
    const kept = await registrationBegun();
    during = landsDuring(kept.staff.id);
    keyRemovalFails = true;
    const second = context();
    const answered = await watched.completeKeyRegistration(kept.begun.pending, kept.key.create(kept.begun.options), second);
    keyRemovalFails = false;
    during.mockRestore();
    expect(answered).toEqual(EXPIRED);
    expect((await store.bySub(kept.staff.sub))?.credentials).toHaveLength(1);
    expect(await securityEvents(kept.staff.id)).toEqual(['key_registered_across_reset', 'account_locked_key_across_reset']);
    expect((await events(kept.staff.id)).filter((event) => event.startsWith('hardware_key_registered'))).toEqual(['hardware_key_registered:webauthn']);
    expect(await lockedOf(kept.staff.id)).toBe(true);
    // The planted key opens nothing: a key step begun after the reset gets no options, and none of the account's
    // other ways in is open either.
    await pastTheMark();
    expect(await flow.beginKey(kept.staff.email)).toEqual({ kind: 'refused', reason: 'locked' });
    expect(await flow.start(kept.staff.email, PASSWORD, context())).toEqual({ kind: 'refused', reason: 'locked' });
    expect(await openSessions(kept.staff.id)).toBe(0);
    expect(logged(lines, KEY_ACROSS_RESET_LINE)).toEqual([
      { level: 'error', msg: KEY_ACROSS_RESET_LINE, time: expect.any(String), user_id: removed.staff.id, request_id: first.requestId, error_code: 'removed' },
      { level: 'error', msg: KEY_ACROSS_RESET_LINE, time: expect.any(String), user_id: kept.staff.id, request_id: second.requestId, error_code: 'not_removed' },
    ]);
    // This case has its own line: the step's refusal line is not also logged for it.
    expect(logged(lines, STEP_REFUSED_LINE)).toEqual([]);
  });

  it('SGN-17: a key that is neither removed nor locked says so in its line; a judgement that throws once the provider holds the key is read as a refusal, and the grant is given back on every one of these paths', async () => {
    const landsDuring = (userId: string, then: () => void = () => undefined) => {
      const complete = provider.completeKeyRegistration.bind(provider);
      return vi.spyOn(provider, 'completeKeyRegistration').mockImplementationOnce(async (...args) => {
        const registered = await complete(...args);
        await resetRecorded(userId);
        then();
        return registered;
      });
    };
    // The lock fails: the line is the loudest of the three, and the key is still audited as registered.
    const unlocked = await registrationBegun();
    const noLock = paced(failing(/sign_in_lock_key_across_reset/, 1));
    let during = landsDuring(unlocked.staff.id);
    let release = vi.spyOn(provider, 'release');
    keyRemovalFails = true;
    const first = context();
    const answered = await noLock.flow.completeKeyRegistration(unlocked.begun.pending, unlocked.key.create(unlocked.begun.options), first);
    keyRemovalFails = false;
    during.mockRestore();
    expect(answered).toEqual(EXPIRED);
    expect(release.mock.calls).toHaveLength(1);
    release.mockRestore();
    expect(logged(noLock.lines, KEY_ACROSS_RESET_LINE)).toEqual([expect.objectContaining({ level: 'error', user_id: unlocked.staff.id, request_id: first.requestId, error_code: 'not_removed_not_locked' })]);
    expect((await events(unlocked.staff.id)).filter((event) => event.startsWith('hardware_key_registered'))).toEqual(['hardware_key_registered:webauthn']);
    // The judgement after the registration throws (review SEC-S3 of 2026-11-11): read as a refusal. The key is removed
    // and reported; nothing is audited as registered; the grant is given back.
    const unjudged = await registrationBegun();
    let down = false;
    const broken = paced(failing(/sign_in_step_refused/, 1, () => down));
    during = landsDuring(unjudged.staff.id, () => {
      down = true;
    });
    release = vi.spyOn(provider, 'release');
    const second = context();
    expect(await broken.flow.completeKeyRegistration(unjudged.begun.pending, unjudged.key.create(unjudged.begun.options), second)).toEqual(EXPIRED);
    during.mockRestore();
    expect(release.mock.calls).toHaveLength(1);
    release.mockRestore();
    expect((await store.bySub(unjudged.staff.sub))?.credentials).toEqual([]);
    expect(logged(broken.lines, KEY_ACROSS_RESET_LINE)).toEqual([expect.objectContaining({ level: 'error', user_id: unjudged.staff.id, request_id: second.requestId, error_code: 'removed' })]);
    expect((await events(unjudged.staff.id)).filter((event) => event.startsWith('hardware_key_registered'))).toEqual([]);
    // The same, with the key not removed: no judgement is on record, so the database locks nothing and the line says so.
    const neither = await registrationBegun();
    down = false;
    const both = paced(failing(/sign_in_step_refused/, 1, () => down));
    during = landsDuring(neither.staff.id, () => {
      down = true;
    });
    keyRemovalFails = true;
    const third = context();
    expect(await both.flow.completeKeyRegistration(neither.begun.pending, neither.key.create(neither.begun.options), third)).toEqual(EXPIRED);
    keyRemovalFails = false;
    during.mockRestore();
    expect(logged(both.lines, KEY_ACROSS_RESET_LINE)).toEqual([expect.objectContaining({ error_code: 'not_removed_not_locked', user_id: neither.staff.id, request_id: third.requestId })]);
    expect(await securityEvents(neither.staff.id)).toEqual([]);
  });

  it('SGN-17: a crossed pair’s line is logged before the grant is given back, so a release that throws does not take it; a registered key whose audit write fails says so by IDs before the error leaves; a key that stays is locked on its own account first, whichever account the reset marked', async () => {
    // The release throws (review S2 of the fix round): the line is there, and the error leaves.
    const typed = await person();
    const subject = await person();
    await store.update(typed.sub, (record) => ({ ...record, email: `moved-${record.email}` }));
    await store.put({ sub: subject.sub, email: typed.email, passwordHash: await hashPassword(PASSWORD, CHEAP), temporary: false, totpSecret: SECRET, totpLastStep: -1, credentials: [] });
    const crossed = paced();
    const step = pendingOf(await flow.start(typed.email, PASSWORD, context()));
    const thrown = vi.spyOn(provider, 'release').mockRejectedValueOnce(new Error('synthetic release failure'));
    const request = context();
    await expect(crossed.flow.answerTotp(step, nextCode(), request)).rejects.toThrow('synthetic release failure');
    thrown.mockRestore();
    expect(logged(crossed.lines, CROSSED_LINE)).toEqual([expect.objectContaining({ level: 'warn', user_id: subject.id, request_id: request.requestId })]);
    expect(await openSessions(subject.id)).toBe(0);

    // The clean path (review S3 of the fix round, restated by docs/adr/0095): the provider registered the key, no reset,
    // and the registry's record, which carries the audit event, fails. The key is removed at the provider with the
    // grant, said by IDs, and the person is told to try again; a key with no row would open nothing either way.
    const clean = await registrationBegun();
    const broken = paced(failing(/hardware_key_record/, 1));
    const release = vi.spyOn(provider, 'release');
    const second = context();
    expect(await broken.flow.completeKeyRegistration(clean.begun.pending, clean.key.create(clean.begun.options), second)).toEqual({ kind: 'refused', reason: 'key_not_registered' });
    expect(release.mock.calls).toHaveLength(1);
    release.mockRestore();
    expect(logged(broken.lines, 'hardware key registered at the provider but not recorded')).toEqual([
      expect.objectContaining({ level: 'error', user_id: clean.staff.id, request_id: second.requestId, error_code: 'Error', outcome_code: 'removed' }),
    ]);
    expect(logged(broken.lines, KEY_ACROSS_RESET_LINE)).toEqual([]);
    expect((await store.bySub(clean.staff.sub))?.credentials).toEqual([]);

    // SGN-30: the registry answers no row for a wrong one-time code (it counted the try; a raise would have rolled the
    // count back). No row is that refusal, never a registration: the key is removed at the provider and nothing opens.
    const guessed = await registrationBegun();
    const unanswered = paced(answeringNoRow(/hardware_key_record/));
    const fourth = context();
    expect(await unanswered.flow.completeKeyRegistration(guessed.begun.pending, guessed.key.create(guessed.begun.options), fourth)).toEqual({ kind: 'refused', reason: 'key_not_registered' });
    expect(logged(unanswered.lines, 'hardware key registered at the provider but not recorded')).toEqual([
      expect.objectContaining({ level: 'error', user_id: guessed.staff.id, request_id: fourth.requestId, error_code: 'registration_code_refused', outcome_code: 'removed' }),
    ]);
    expect((await store.bySub(guessed.staff.sub))?.credentials).toEqual([]);
    expect((await events(clean.staff.id)).filter((event) => event.startsWith('hardware_key_registered'))).toEqual([]);

    // A step sealed before the crossed state was refused outright carries the address's account (review S4 of the fix
    // round). Only that account is reset; the key stays. The key's own account is asked to lock first: the database has
    // no registration across a reset on record for it and refuses, so the line says not locked; the address's is locked.
    const legacy = await registrationBegun();
    const address = await person();
    const pending = { ...legacy.begun.pending, addressUserId: address.id } as Pending;
    const complete = provider.completeKeyRegistration.bind(provider);
    const during = vi.spyOn(provider, 'completeKeyRegistration').mockImplementationOnce(async (...args) => {
      const registered = await complete(...args);
      await resetRecorded(address.id);
      return registered;
    });
    const asked: unknown[] = [];
    const watching: ScopePool<ScopeClient> = {
      connect: async () => {
        const client = await app.connect();
        return new Proxy(client, {
          get(target, property) {
            if (property === 'query') {
              return (text: unknown, values?: unknown[]) => {
                if (typeof text === 'string' && /sign_in_lock_key_across_reset/.test(text)) {
                  asked.push(values?.[0]);
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
    const watched = paced(watching);
    keyRemovalFails = true;
    const third = context();
    expect(await watched.flow.completeKeyRegistration(pending, legacy.key.create(legacy.begun.options), third)).toEqual(EXPIRED);
    keyRemovalFails = false;
    during.mockRestore();
    expect(asked).toEqual([legacy.staff.id, address.id]);
    expect(logged(watched.lines, KEY_ACROSS_RESET_LINE)).toEqual([expect.objectContaining({ error_code: 'not_removed_not_locked', user_id: legacy.staff.id, request_id: third.requestId })]);
    const lockedOf = async (userId: string) => (await owner.query<{ locked: boolean }>('SELECT locked_at IS NOT NULL AS locked FROM "user" WHERE id = $1', [userId])).rows[0]?.locked;
    expect(await lockedOf(address.id)).toBe(true);
    expect(await lockedOf(legacy.staff.id)).toBe(false);
  });

  it('SGN-17: only a start at or before the mark pages: a start ahead of the database’s clock is refused with an error line of its own and no record, and a replayed stale step adds no second record', async () => {
    const user = await person();
    const begun = pendingOf(await flow.start(user.email, PASSWORD, context()));
    const { flow: watched, lines } = paced();
    // Ahead of the clock (a clock that stepped back, or a value from another clock): refused, not evidence.
    const ahead = { ...begun, began: Date.now() + 3_600_000 } as Pending;
    const request = context();
    expect(await watched.answerTotp(ahead, nextCode(), request)).toEqual(EXPIRED);
    expect(logged(lines, STEP_REFUSED_LINE)).toEqual([]);
    expect(logged(lines, 'sign-in step start is ahead of the database clock')).toEqual([expect.objectContaining({ level: 'error', user_id: user.id, request_id: request.requestId, error_code: 'mfa' })]);
    expect(await securityEvents(user.id)).toEqual([]);
    // A stale step answered twice (the sealed cookie replayed): refused and paged each time, recorded once.
    await resetRecorded(user.id);
    expect(await watched.answerTotp(begun, nextCode(), context())).toEqual(EXPIRED);
    expect(await watched.answerTotp(begun, nextCode(), context())).toEqual(EXPIRED);
    expect(await securityEvents(user.id)).toEqual(['step_before_reset_mfa']);
    expect(logged(lines, STEP_REFUSED_LINE)).toHaveLength(2);
    expect((await events(user.id)).filter((event) => event.startsWith('sign_in_failed'))).toEqual([]);
  });

  it('SGN-17: a lookup or a judgement that throws once the provider has proved the person gives the grant back before the error leaves', async () => {
    const user = await person();
    const begun = pendingOf(await flow.start(user.email, PASSWORD, context()));
    // answerTotp judges the typed address's account first (the first call); the one in authenticated() fails.
    let calls = 0;
    const second = paced(
      failing(/sign_in_step_refused/, 1, () => {
        calls += 1;
        return calls === 2;
      }),
    );
    const release = vi.spyOn(provider, 'release');
    await expect(second.flow.answerTotp(begun, nextCode(), context())).rejects.toThrow('synthetic failure');
    expect(release.mock.calls).toHaveLength(1);
    release.mockRestore();
    expect(await openSessions(user.id)).toBe(0);
  });

  it('SGN-17: a step sealed by the release before, with no start, starts again at every step: nothing is asked of the provider for it, and nothing is recorded, since it is no evidence', async () => {
    const user = await person();
    await resetRecorded(user.id);
    await pastTheMark();
    const { flow: watched, lines } = paced();
    const code = pendingOf(await flow.start(user.email, PASSWORD, context()));
    expect(await watched.answerTotp(withoutBegan(code), nextCode(), context())).toEqual(EXPIRED);
    const { staff, key } = await staffWithKey();
    const keyStart = await flow.beginKey(staff.email);
    if ('kind' in keyStart) {
      throw new Error('expected options');
    }
    const verify = vi.spyOn(provider, 'completeKeySignIn');
    expect(await watched.completeKey(withoutBegan(keyStart.pending), key.get(keyStart.options), context())).toEqual(EXPIRED);
    expect(verify.mock.calls).toEqual([]);
    verify.mockRestore();
    const registration = await registrationBegun();
    expect(await watched.beginKeyRegistration(withoutBegan(registration.step), context())).toEqual(EXPIRED);
    expect(await watched.completeKeyRegistration(withoutBegan(registration.begun.pending), registration.key.create(registration.begun.options), context())).toEqual(EXPIRED);
    expect((await store.bySub(registration.staff.sub))?.credentials).toEqual([]);
    const temporary = await person({ status: 'invited', mfa: false, temporary: true, totp: false });
    await invitation(temporary.id, 'live');
    expect(await watched.newPassword(withoutBegan(pendingOf(await flow.start(temporary.email, PASSWORD, context()))), CHOSEN, context())).toEqual(EXPIRED);
    const invited = await invitee();
    const enrol = pendingOf(await flow.start(invited.email, PASSWORD, context()));
    expect(await watched.beginTotpSetup(withoutBegan(enrol), context())).toEqual(EXPIRED);
    const withKey = await withSetupKey(enrol);
    expect(await watched.completeTotpSetup(withoutBegan(withKey), setupCode(withKey), context())).toEqual(EXPIRED);
    for (const account of [user, staff, registration.staff, temporary, invited]) {
      expect(await securityEvents(account.id)).toEqual([]);
      expect(await openSessions(account.id)).toBe(0);
    }
    expect(logged(lines, STEP_REFUSED_LINE)).toEqual([]);
    // The same steps with their start go on.
    expect((await flow.answerTotp(code, nextCode(), context())).kind).toBe('signed_in');
  });
});

describe('SGN-18: a reset whose outcome at the provider is unknown is never reported as a refused code (docs/adr/0093, D9)', () => {
  /** One confirmation whose answer is lost, before or after the provider applied it. */
  async function lost(when: 'after' | 'before', use: SignInFlow, email: string, code: string, request = context()) {
    lostAnswer = when;
    try {
      return await use.confirmPasswordReset(email, code, CHOSEN, request);
    } finally {
      lostAnswer = undefined;
    }
  }

  it.each(['after', 'before'] as const)(
    'SGN-18: an answer lost %s the provider took the confirmation ends every session, moves the mark, records the unknown outcome and queues the provider’s sign-out with it, queues no password-changed email and pages by the user’s ID',
    async (when) => {
      const user = await person();
      const session = await signedIn(user.email);
      const begun = pendingOf(await flow.start(user.email, PASSWORD, context()));
      const { flow: reset, lines } = paced();
      await reset.requestPasswordReset(user.email, context());
      const request = context();
      const answered = await lost(when, reset, user.email, codeFor(user.email), request);
      // Never the code's refusal: its own answer, which the route says in the generic words.
      expect(answered).toEqual({ kind: 'outcome_unknown' });
      expect(await signOutsQueued(user.id)).toEqual([{ reason: 'password_reset_outcome_unknown', request_id: request.requestId }]);
      expect(await openSessions(user.id)).toBe(0);
      expect((await resolveSession(app, session.sessionToken, 'test')).state).not.toBe('active');
      expect(await markOf(user.id)).toBeInstanceOf(Date);
      expect((await events(user.id)).filter((event) => event.startsWith('password_reset_'))).toEqual(['password_reset_requested:unverified_request', 'password_reset_outcome_unknown:unverified_code']);
      // No email claims a change nobody has proved.
      expect(await notices(user.id)).toEqual([]);
      expect(logged(lines, RESET_OUTCOME_UNKNOWN_LINE)).toEqual([
        { level: 'error', msg: RESET_OUTCOME_UNKNOWN_LINE, time: expect.any(String), user_id: user.id, request_id: request.requestId, error_code: 'DevLostAnswer' },
      ]);
      expect(logged(lines, 'password reset code refused')).toEqual([]);
      expect(logged(lines, 'security event: password reset completed')).toEqual([]);
      expect(lines.join('\n')).not.toContain(user.email);
      // What the provider holds is what it did: the new password when it applied the reset, the old one when it did not.
      const works = when === 'after' ? CHOSEN : PASSWORD;
      const refusedNow = when === 'after' ? PASSWORD : CHOSEN;
      expect(await provider.signIn(user.email, works)).toMatchObject({ kind: 'mfa_required' });
      expect(await provider.signIn(user.email, refusedNow)).toEqual({ kind: 'rejected', stage: 'password' });
      // Either way a step begun before it is refused, and a sign-in begun after it, with the password that works, opens a session.
      expect(await reset.answerTotp(begun, nextCode(), context())).toEqual(EXPIRED);
      expect(await securityEvents(user.id)).toEqual(['step_before_reset_mfa']);
      await pastTheMark();
      expect((await resolveSession(app, (await signedIn(user.email, works)).sessionToken, 'test')).state).toBe('active');
    },
  );

  it('SGN-18: a code the provider definitely refused is still the one refusal: no session ends, no mark moves and nothing is recorded', async () => {
    const user = await person();
    await signedIn(user.email);
    const { flow: reset, lines } = paced();
    await reset.requestPasswordReset(user.email, context());
    expect(await reset.confirmPasswordReset(user.email, wrong(codeFor(user.email)), CHOSEN, context())).toEqual({ kind: 'rejected' });
    expect(await openSessions(user.id)).toBe(1);
    expect(await markOf(user.id)).toBeNull();
    expect((await events(user.id)).filter((event) => event.startsWith('password_reset_'))).toEqual(['password_reset_requested:unverified_request']);
    expect(logged(lines, RESET_OUTCOME_UNKNOWN_LINE)).toEqual([]);
  });

  it('SGN-18: an unknown outcome for an address with no account is paged with no user, and writes nothing', async () => {
    const before = await owner.query<{ count: string }>('SELECT count(*) AS count FROM audit_event');
    const { flow: reset, lines } = paced();
    const request = context();
    const address = `${randomUUID()}@synthetic.test`;
    expect(await lost('before', reset, address, '123456', request)).toEqual({ kind: 'outcome_unknown' });
    expect((await owner.query('SELECT 1 FROM provider_sign_out WHERE request_id = $1', [request.requestId])).rowCount).toBe(0);
    expect((await owner.query<{ count: string }>('SELECT count(*) AS count FROM audit_event')).rows).toEqual(before.rows);
    expect(logged(lines, RESET_OUTCOME_UNKNOWN_LINE)).toEqual([
      { level: 'error', msg: RESET_OUTCOME_UNKNOWN_LINE, time: expect.any(String), user_id: null, request_id: request.requestId, error_code: 'DevLostAnswer' },
    ]);
    expect(lines.join('\n')).not.toContain(address);
  });

  it('SGN-18: an unknown outcome whose transaction fails once is retried; failing twice, the sessions stay, which is logged by the user’s ID beside the unknown outcome, and no sign-out is queued', async () => {
    const once = await person();
    await signedIn(once.email);
    const retried = paced(failing(/sign_in_lock_account/, 1));
    await retried.flow.requestPasswordReset(once.email, context());
    expect(await lost('after', retried.flow, once.email, codeFor(once.email))).toEqual({ kind: 'outcome_unknown' });
    expect(await openSessions(once.id)).toBe(0);
    expect((await events(once.id)).filter((event) => event.startsWith('password_reset_outcome_unknown'))).toEqual(['password_reset_outcome_unknown:unverified_code']);
    expect((await signOutsQueued(once.id)).map((row) => row.reason)).toEqual(['password_reset_outcome_unknown']);

    const twice = await person();
    await signedIn(twice.email);
    const failed = paced(failing(/sign_in_lock_account/, 2));
    await failed.flow.requestPasswordReset(twice.email, context());
    const request = context();
    expect(await lost('after', failed.flow, twice.email, codeFor(twice.email), request)).toEqual({ kind: 'outcome_unknown' });
    expect((await signOutsQueued(twice.id)).filter((row) => row.reason !== 'password_reset_unrecorded')).toEqual([]);
    expect(await openSessions(twice.id)).toBe(1);
    expect(await markOf(twice.id)).toBeNull();
    expect((await events(twice.id)).filter((event) => event.startsWith('password_reset_outcome_unknown'))).toEqual([]);
    expect(logged(failed.lines, RESET_OUTCOME_UNKNOWN_LINE)).toEqual([expect.objectContaining({ level: 'error', user_id: twice.id, request_id: request.requestId })]);
    expect(logged(failed.lines, 'security event: password reset sessions not ended')).toEqual([expect.objectContaining({ level: 'error', user_id: twice.id, request_id: request.requestId })]);
  });

  it('SGN-17: a completed reset takes the account’s row lock before it ends a session, in the transaction that records it', async () => {
    const user = await person();
    await signedIn(user.email);
    const order: string[] = [];
    const watching: ScopePool<ScopeClient> = {
      connect: async () => {
        const client = await app.connect();
        return new Proxy(client, {
          get(target, property) {
            if (property === 'query') {
              return (text: unknown, values?: unknown[]) => {
                if (typeof text === 'string' && /sign_in_lock_account|revoke_user_sessions|INSERT INTO audit_event|INSERT INTO user_session|user_device/.test(text)) {
                  order.push(/sign_in_lock_account/.test(text) ? 'lock' : /revoke_user_sessions/.test(text) ? 'revoke' : /audit_event/.test(text) ? 'audit' : /user_session/.test(text) ? 'session' : 'device');
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
    const { flow: reset } = paced(watching);
    await reset.requestPasswordReset(user.email, context());
    order.length = 0;
    expect(await reset.confirmPasswordReset(user.email, codeFor(user.email), CHOSEN, context())).toEqual({ kind: 'reset', locked: false, keepEmail: true });
    expect(order.slice(0, 2)).toEqual(['lock', 'revoke']);
    // And the transaction that opens a session takes it before any device or session row.
    await pastTheMark();
    order.length = 0;
    expect((await reset.answerTotp(pendingOf(await reset.start(user.email, CHOSEN, context())), nextCode(), context())).kind).toBe('signed_in');
    expect(order[0]).toBe('lock');
    expect(order.indexOf('lock')).toBeLessThan(order.indexOf('session'));
    expect(order.filter((entry) => entry === 'lock')).toHaveLength(1);
  });
});

/**
 * What End membership commits (both routes: the membership ended, every session of the account ended), with the
 * provider's sign-out never performed, as when it fails after the commit (docs/adr/0094).
 */
async function membershipEndedWithoutProviderSignOut(userId: string): Promise<void> {
  await asOwner(owner, [], async () => {
    await owner.query('UPDATE membership SET ends_at = now() WHERE user_id = $1 AND ends_at IS NULL', [userId]);
    await owner.query(`UPDATE user_session SET ended_at = now(), end_reason = 'revoked' WHERE user_id = $1 AND ended_at IS NULL`, [userId]);
  });
}

async function liveMemberships(userId: string): Promise<number> {
  const { rows } = await owner.query<{ count: string }>('SELECT count(*) AS count FROM membership WHERE user_id = $1 AND (ends_at IS NULL OR ends_at > now())', [userId]);
  return Number(rows[0]?.count ?? -1);
}

// A step begun before End membership, with the provider's sign-out not yet performed. Since migration 20261116090000
// (LANES.md Queues item 37; docs/adr/0095, closing docs/adr/0094's "Left open") the membership's end moves the
// account's mark ("user".sign_in_not_before) in its own transaction, whoever ends it, so ADR 0093's rule refuses each
// step as SGN-17 states for a reset: no session opens and no key stays on the account.
describe('SGN-19: a sign-in step begun before End membership is refused after it, the provider’s sign-out not yet performed (docs/adr/0095)', () => {
  it('SGN-19: a code step begun before End membership opens no session after it, and the refusal is recorded', async () => {
    const user = await person();
    await addMembership(owner, await createOrganization(owner, 'group'), user.id, 'analyst');
    const before = await signedIn(user.email);
    const begun = pendingOf(await flow.start(user.email, PASSWORD, context()));
    expect(begun.step).toBe('mfa');
    await membershipEndedWithoutProviderSignOut(user.id);
    // What the commit holds whatever the provider answers: no role, no session that was open, and the mark moved.
    expect(await liveMemberships(user.id)).toBe(0);
    expect(await openSessions(user.id)).toBe(0);
    expect((await resolveSession(app, before.sessionToken, 'test')).state).toBe('ended');
    expect(await markOf(user.id)).toBeInstanceOf(Date);
    // The step is refused before the provider is asked.
    const asked = vi.spyOn(provider, 'answerTotp');
    const finished = await flow.answerTotp(begun, nextCode(), context());
    const calls = asked.mock.calls.length;
    asked.mockRestore();
    expect(finished).toEqual(EXPIRED);
    expect(calls).toBe(0);
    expect(await openSessions(user.id)).toBe(0);
    expect(await liveMemberships(user.id)).toBe(0);
    expect(await securityEvents(user.id)).toEqual(['step_before_reset_mfa']);
  });

  it('SGN-19: a key-registration step begun before End membership registers no key after it: the step is refused before the provider registers anything, and the refusal is recorded', async () => {
    const { staff, begun, key } = await registrationBegun();
    await membershipEndedWithoutProviderSignOut(staff.id);
    expect(await liveMemberships(staff.id)).toBe(0);
    expect(await markOf(staff.id)).toBeInstanceOf(Date);
    expect(await flow.completeKeyRegistration(begun.pending, key.create(begun.options), context())).toEqual(EXPIRED);
    expect((await store.bySub(staff.sub))?.credentials).toEqual([]);
    expect(await securityEvents(staff.id)).toEqual(['step_before_reset_register_key']);
    expect((await events(staff.id)).filter((event) => event.startsWith('hardware_key_registered'))).toEqual([]);
    expect(await openSessions(staff.id)).toBe(0);
    expect(await liveMemberships(staff.id)).toBe(0);
  });
});

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
    confirmClient: { send: client.send.bind(client), config: { maxAttempts: () => Promise.resolve(1) } },
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
  return { flow: new SignInFlow({ registrationCodeKey: CODE_KEY, webauthn: WEBAUTHN, pool: app, provider: refusing, logger: createLogger({ sink: (line) => lines.push(line) }), now: () => pace.at, sleep }), pace, lines, sent };
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
    // Each step carries its attempt's start, as this release seals it (docs/adr/0093, D3).
    const began = Date.now();
    expect(await refusing.answerTotp({ step: 'mfa', email: user.email, challenge, began }, '123456', context())).toEqual(UNAVAILABLE);
    expect(await refusing.newPassword({ step: 'new_password', email: user.email, challenge, began }, CHOSEN, context())).toEqual(UNAVAILABLE);
    expect(await refusing.completeKey({ step: 'key', email: user.email, challenge, began, assertion: 'synthetic' }, {} as never, context())).toEqual(UNAVAILABLE);
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

/**
 * The key registry in the flow (docs/adr/0095; Queues item 37). Synthetic accounts and soft keys only. The two-person
 * removal is the database's own (packages/db/src/key-registry.db.test.ts holds its rules); here it is called as two
 * administrators would, so the flow meets a real confirmed removal.
 */
const sha = (value: Uint8Array | string): Buffer => createHash('sha256').update(value).digest();
const requestId = (): string => `test-${randomUUID()}`;

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

interface Administrator {
  readonly id: string;
  session(): Promise<string>;
}

/** A platform administrator eight days in the role, with a recorded key and, on asking, a key session opened just now. */
async function administrator(): Promise<Administrator> {
  const { id } = await person();
  // Seeded with the triggers off, as the database's own tests do: a membership eight days old with no escalation event.
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

/** Two administrators confirm the removal of every key of the account. Answers the removal and one who may open registration. */
async function keysRemoved(target: string): Promise<{ readonly removal: string; readonly opener: Administrator }> {
  const [requester, confirmer] = [await administrator(), await administrator()];
  const asked = await requester.session();
  const removal = await withActor(app, requester.id, async (scope) => (await scope.client.query<{ id: string }>('SELECT hardware_key_removal_request($1, $2, $3) AS id', [target, asked, requestId()])).rows[0]?.id ?? '');
  const confirming = await confirmer.session();
  await withActor(app, confirmer.id, (scope) => scope.client.query('SELECT * FROM hardware_key_removal_confirm($1, $2, $3)', [removal, confirming, requestId()]));
  return { removal, opener: confirmer };
}

/** An administrator opens registration with a new one-time code, which only its digest reaches the database. */
async function registrationOpened(removal: string, opener: Administrator): Promise<string> {
  const code = newRegistrationCode();
  const session = await opener.session();
  await withActor(app, opener.id, (scope) => scope.client.query('SELECT hardware_key_registration_open($1, $2, $3, $4)', [removal, session, registrationCodeDigest(CODE_KEY, code), requestId()]));
  return code;
}

async function keySignIn(email: string, key: SoftAuthenticator, use: SignInFlow = flow, with_ = context(), credentialId?: Uint8Array): Promise<FlowResult> {
  const start = await use.beginKey(email);
  if ('kind' in start) {
    throw new Error('expected options');
  }
  return use.completeKey(start.pending, key.get(start.options, credentialId), with_);
}

/** Password and code, to the step the flow answers for an account that must hold a key. */
const codeSignIn = async (email: string, use: SignInFlow = flow): Promise<FlowResult> => use.answerTotp(pendingOf(await use.start(email, PASSWORD, context())), nextCode(), context());

async function keyRows(userId: string): Promise<{ digest: string; live: boolean }[]> {
  const { rows } = await owner.query<{ digest: string; live: boolean }>("SELECT encode(credential_sha256, 'hex') AS digest, removed_at IS NULL AS live FROM hardware_key WHERE user_id = $1 ORDER BY registered_at", [userId]);
  return rows;
}

const storedIds = async (sub: string): Promise<string[]> => ((await store.bySub(sub))?.credentials ?? []).map((credential) => credential.id);
const CREDENTIALS = { kind: 'refused', reason: 'credentials' } as const;
const B64 = (value: Uint8Array): string => Buffer.from(value).toString('base64url');

describe('SGN-21: a key sign-in opens a session only for a live key of the registry, checked by the app itself (docs/adr/0095)', () => {
  it('SGN-27: a registration records the key’s digest and public key with its audit event, and the session carries the digest', async () => {
    const { staff, key } = await staffWithKey();
    expect(await keyRows(staff.id)).toEqual([{ digest: sha(key.credentialId).toString('hex'), live: true }]);
    expect((await events(staff.id)).filter((event) => event.startsWith('hardware_key_registered'))).toEqual(['hardware_key_registered:']);
    const done = await keySignIn(staff.email, key);
    expect(done.kind).toBe('signed_in');
    const { rows } = await owner.query<{ digest: string }>("SELECT encode(key_credential_sha256, 'hex') AS digest FROM user_session WHERE user_id = $1", [staff.id]);
    expect(rows).toEqual([{ digest: sha(key.credentialId).toString('hex') }]);
  });

  it('SGN-21: a key the provider holds and the registry does not is refused with the words of a wrong credential, recorded, counts no failure, and the cleaning deletes an old unknown credential, never a live one or a young unknown one', async () => {
    const { staff, key } = await staffWithKey();
    const [old, young] = [await staffWithKey(), await staffWithKey()];
    const [oldCredential] = (await store.bySub(old.staff.sub))?.credentials ?? [];
    const [youngCredential] = (await store.bySub(young.staff.sub))?.credentials ?? [];
    if (oldCredential === undefined || youngCredential === undefined) {
      throw new Error('expected two credentials');
    }
    await store.update(staff.sub, (current) => ({
      ...current,
      credentials: [...current.credentials, { ...oldCredential, createdAt: new Date(Date.now() - 20 * 60_000).toISOString() }, { ...youngCredential, createdAt: new Date().toISOString() }],
    }));
    const { flow: watched, lines } = paced();
    const release = vi.spyOn(provider, 'release');
    const with_ = context();
    expect(await keySignIn(staff.email, old.key, watched, with_)).toEqual(CREDENTIALS);
    expect(release.mock.calls).toHaveLength(1);
    release.mockRestore();
    expect(await securityEvents(staff.id)).toEqual(['key_refused_not_registered']);
    expect(await openSessions(staff.id)).toBe(0);
    expect((await events(staff.id)).filter((event) => event.startsWith('sign_in_failed'))).toEqual([]);
    expect(await storedIds(staff.sub)).toEqual([B64(key.credentialId), B64(young.key.credentialId)]);
    expect(logged(lines, 'hardware key leftovers cleaned')).toEqual([expect.objectContaining({ user_id: staff.id, request_id: with_.requestId, record_count: 1, error_code: null })]);
    expect(logged(lines, 'security event: removed hardware key used')).toEqual([]);
    for (const secret of [B64(old.key.credentialId), sha(old.key.credentialId).toString('hex'), B64(key.credentialId)]) {
      expect(lines.join('\n')).not.toContain(secret);
    }
    expect((await keySignIn(staff.email, key)).kind).toBe('signed_in');
  });

  it('SGN-21: a removed key is refused, recorded, pages with IDs only, and is deleted at the provider by that grant', async () => {
    const { staff, key } = await staffWithKey();
    await keysRemoved(staff.id);
    expect(await keyRows(staff.id)).toEqual([{ digest: sha(key.credentialId).toString('hex'), live: false }]);
    await pastTheMark();
    const { flow: watched, lines } = paced();
    const with_ = context();
    expect(await keySignIn(staff.email, key, watched, with_)).toEqual(CREDENTIALS);
    expect(await securityEvents(staff.id)).toContain('key_refused_removed');
    expect(logged(lines, 'security event: removed hardware key used')).toEqual([expect.objectContaining({ level: 'error', user_id: staff.id, request_id: with_.requestId })]);
    expect(await storedIds(staff.sub)).toEqual([]);
    expect(await openSessions(staff.id)).toBe(0);
  });

  it('SGN-21: an assertion the provider accepts but the registered public key did not sign is refused and logged by the error’s class name alone; a response whose id is not its rawId is refused as malformed', async () => {
    const { staff, key } = await staffWithKey();
    const other = await staffWithKey();
    const [foreign] = (await store.bySub(other.staff.sub))?.credentials ?? [];
    if (foreign === undefined) {
      throw new Error('expected a credential');
    }
    // The provider twin now holds another key's public key under this account's credential ID.
    await store.update(staff.sub, (current) => ({ ...current, credentials: current.credentials.map((credential) => ({ ...credential, publicKey: foreign.publicKey })) }));
    const { flow: watched, lines } = paced();
    expect(await keySignIn(staff.email, other.key, watched, context(), key.credentialId)).toEqual(CREDENTIALS);
    expect(await securityEvents(staff.id)).toEqual(['key_refused_assertion']);
    expect(await openSessions(staff.id)).toBe(0);
    const [line] = logged(lines, 'security event: hardware key assertion refused by the registry');
    expect(line).toMatchObject({ level: 'error', user_id: staff.id });
    expect(String(line?.error_code)).toMatch(/^[A-Za-z]+$/);
    expect(await storedIds(staff.sub)).toEqual([B64(key.credentialId)]);

    // Malformed: the provider twin is made to accept a sound response while the flow is handed one whose id is not its rawId.
    const sound = await staffWithKey();
    const start = await watched.beginKey(sound.staff.email);
    if ('kind' in start) {
      throw new Error('expected options');
    }
    const good = sound.key.get(start.options);
    const complete = provider.completeKeySignIn.bind(provider);
    const accepts = vi.spyOn(provider, 'completeKeySignIn').mockImplementationOnce((challenge) => complete(challenge, good));
    expect(await watched.completeKey(start.pending, { ...good, rawId: B64(randomBytes(16)) }, context())).toEqual(CREDENTIALS);
    accepts.mockRestore();
    expect(await securityEvents(sound.staff.id)).toEqual(['key_refused_malformed']);
    expect(await openSessions(sound.staff.id)).toBe(0);
  });

  it('SGN-27: a registration the provider accepts and the app’s own verification refuses records nothing, removes the key at the provider and says so by IDs', async () => {
    const lines: string[] = [];
    const strict = new SignInFlow({ registrationCodeKey: CODE_KEY, webauthn: { rpId: 'localhost', origin: 'https://another-origin.synthetic.test' }, pool: app, provider, logger: createLogger({ sink: (line) => lines.push(line) }) });
    const staff = await person({ internal: true });
    const key = new SoftAuthenticator(ORIGIN);
    const begun = await strict.beginKeyRegistration(pendingOf(await codeSignIn(staff.email, strict)), context());
    if ('kind' in begun) {
      throw new Error('expected options');
    }
    const with_ = context();
    expect(await strict.completeKeyRegistration(begun.pending, key.create(begun.options), with_)).toEqual({ kind: 'refused', reason: 'key_not_registered' });
    expect(await storedIds(staff.sub)).toEqual([]);
    expect(await keyRows(staff.id)).toEqual([]);
    const [line] = logged(lines, 'hardware key registered at the provider but not recorded');
    expect(line).toMatchObject({ level: 'error', user_id: staff.id, request_id: with_.requestId, outcome_code: 'removed' });
    expect(String(line?.error_code)).toMatch(/^[A-Za-z_]+$/);
  });

  it('SGN-27: a second key beside a live one is refused by the registry and removed at the provider', async () => {
    const staff = await person({ internal: true });
    const first = await flow.beginKeyRegistration(pendingOf(await codeSignIn(staff.email)), context());
    const second = await flow.beginKeyRegistration(pendingOf(await codeSignIn(staff.email)), context());
    if ('kind' in first || 'kind' in second) {
      throw new Error('expected options');
    }
    const [one, two] = [new SoftAuthenticator(ORIGIN), new SoftAuthenticator(ORIGIN)];
    expect(await flow.completeKeyRegistration(first.pending, one.create(first.options), context())).toEqual({ kind: 'key_registered' });
    expect(await flow.completeKeyRegistration(second.pending, two.create(second.options), context())).toEqual({ kind: 'refused', reason: 'key_not_registered' });
    expect(await storedIds(staff.sub)).toEqual([B64(one.credentialId)]);
    expect(await keyRows(staff.id)).toEqual([{ digest: sha(one.credentialId).toString('hex'), live: true }]);
  });
});

describe('SGN-27: after a removal, registration is closed until an administrator opens it with a one-time code (docs/adr/0095)', () => {
  const REFUSED_CODE = { kind: 'refused', reason: 'registration_code' } as const;
  const tries = async (removal: string): Promise<number | undefined> =>
    (await owner.query<{ tries: number }>('SELECT registration_code_tries AS tries FROM hardware_key_removal WHERE id = $1', [removal])).rows[0]?.tries;

  it('SGN-27: a closed account is asked for the code before the provider is asked for anything; no opening and a wrong code answer alike; the right code registers, consumes the opening and leaves its event and notice; the removed key then opens nothing (SGN-26, case 11)', async () => {
    const { staff, key } = await staffWithKey();
    const { removal, opener } = await keysRemoved(staff.id);
    await pastTheMark();
    const asks = vi.spyOn(provider, 'beginKeyRegistration');
    const step = pendingOf(await codeSignIn(staff.email));
    expect(step).toMatchObject({ step: 'register_key', codeRequired: true });
    expect(await flow.beginKeyRegistration(step, context())).toMatchObject({ kind: 'pending', pending: { step: 'register_key', codeRequired: true } });
    // No opening stands: any code is refused, and no try is counted against nothing.
    expect(await flow.answerRegistrationCode(step, newRegistrationCode(), context())).toEqual(REFUSED_CODE);
    expect(await tries(removal)).toBe(0);
    const code = await registrationOpened(removal, opener);
    // Reaching the screen again counts no try.
    expect(await flow.beginKeyRegistration(step, context())).toMatchObject({ kind: 'pending' });
    expect(await tries(removal)).toBe(0);
    expect(await flow.answerRegistrationCode(step, newRegistrationCode(), context())).toEqual(REFUSED_CODE);
    expect(await tries(removal)).toBe(1);
    expect(asks.mock.calls).toHaveLength(0);
    asks.mockRestore();
    expect(await securityEvents(staff.id)).toContain('key_registration_refused');
    // The code as a person types it: lower case, with a space.
    const open = pendingOf(await flow.answerRegistrationCode(step, `${code.slice(0, 4).toLowerCase()} ${code.slice(4).toLowerCase()}`, context()));
    expect(open).toMatchObject({ step: 'register_key' });
    expect(JSON.stringify(open)).not.toContain(code);
    const begun = await flow.beginKeyRegistration(open, context());
    if ('kind' in begun) {
      throw new Error('expected options');
    }
    const next = new SoftAuthenticator(ORIGIN);
    expect(await flow.completeKeyRegistration(begun.pending, next.create(begun.options), context())).toEqual({ kind: 'key_registered' });
    expect(await keyRows(staff.id)).toEqual([
      { digest: sha(key.credentialId).toString('hex'), live: false },
      { digest: sha(next.credentialId).toString('hex'), live: true },
    ]);
    expect(await securityEvents(staff.id)).toContain('key_registered_after_removal');
    expect((await owner.query<{ kind: string }>('SELECT kind FROM hardware_key_notice WHERE user_id = $1 ORDER BY kind', [staff.id])).rows.map((row) => row.kind)).toEqual(['registered_after_removal', 'registration_opened', 'removed']);
    // The removed key is still at the provider twin: it opens nothing and is deleted by its own grant; the new key signs in.
    expect(await storedIds(staff.sub)).toEqual([B64(key.credentialId), B64(next.credentialId)]);
    expect(await keySignIn(staff.email, key)).toEqual(CREDENTIALS);
    expect(await storedIds(staff.sub)).toEqual([B64(next.credentialId)]);
    expect((await keySignIn(staff.email, next)).kind).toBe('signed_in');
    // The opening is consumed: the same code opens nothing more.
    expect(await codeSignIn(staff.email)).toEqual({ kind: 'refused', reason: 'hardware_key_required' });
  });

  it('SGN-27: the fifth wrong code spends the opening, and an opening made before a reset is dead: the right code is then refused like any other', async () => {
    const spent = await staffWithKey();
    const first = await keysRemoved(spent.staff.id);
    await pastTheMark();
    const code = await registrationOpened(first.removal, first.opener);
    const step = pendingOf(await codeSignIn(spent.staff.email));
    for (let wrong = 0; wrong < 5; wrong += 1) {
      expect(await flow.answerRegistrationCode(step, newRegistrationCode(), context())).toEqual(REFUSED_CODE);
    }
    expect(await tries(first.removal)).toBe(5);
    expect(await flow.answerRegistrationCode(step, code, context())).toEqual(REFUSED_CODE);

    const reset = await staffWithKey();
    const second = await keysRemoved(reset.staff.id);
    await pastTheMark();
    const dead = await registrationOpened(second.removal, second.opener);
    await resetRecorded(reset.staff.id);
    await pastTheMark();
    expect(await flow.answerRegistrationCode(pendingOf(await codeSignIn(reset.staff.email)), dead, context())).toEqual(REFUSED_CODE);
    expect(await keyRows(reset.staff.id)).toEqual([{ digest: sha(reset.key.credentialId).toString('hex'), live: false }]);
  });

  it('SGN-27: a pending step that claims an open code it was never given is judged again before the provider is asked, and at the completion', async () => {
    const { staff } = await staffWithKey();
    await keysRemoved(staff.id);
    await pastTheMark();
    const step = pendingOf(await codeSignIn(staff.email));
    if (step.step !== 'register_key') {
      throw new Error('expected the registration step');
    }
    const forged: Pending = { ...step, codeRequired: undefined, code: registrationCodeDigest(CODE_KEY, newRegistrationCode()).toString('hex') };
    const asks = vi.spyOn(provider, 'beginKeyRegistration');
    const completes = vi.spyOn(provider, 'completeKeyRegistration');
    expect(await flow.beginKeyRegistration(forged, context())).toMatchObject({ kind: 'pending', pending: { codeRequired: true } });
    expect(await flow.completeKeyRegistration({ ...forged, challenge: 'forged', creation: 'forged' }, new SoftAuthenticator(ORIGIN).create({ challenge: 'forged', rp: { id: 'localhost', name: 'Test' }, user: { id: 'x', name: 'x', displayName: 'x' }, pubKeyCredParams: [] }), context())).toMatchObject({ kind: 'pending', pending: { codeRequired: true } });
    expect(asks.mock.calls).toHaveLength(0);
    expect(completes.mock.calls).toHaveLength(0);
    asks.mockRestore();
    completes.mockRestore();
    expect(await storedIds(staff.sub)).toHaveLength(1);
  });
});

describe('SGN-27: reaching the code screen counts no try (review A2 of the key registry; docs/adr/0095)', () => {
  const tries = async (removal: string): Promise<number | undefined> =>
    (await owner.query<{ tries: number }>('SELECT registration_code_tries AS tries FROM hardware_key_removal WHERE id = $1', [removal])).rows[0]?.tries;

  it('SGN-27: a step that does not yet know a code is needed reaches the code screen with no try counted, and a wrong typed code counts exactly one', async () => {
    const { staff } = await staffWithKey();
    const { removal, opener } = await keysRemoved(staff.id);
    await pastTheMark();
    await registrationOpened(removal, opener);
    const signedIn = pendingOf(await codeSignIn(staff.email));
    if (signedIn.step !== 'register_key') {
      throw new Error('expected the registration step');
    }
    // The step as it is sealed when the app's read found no key row (a removal of no keys closes too): no codeRequired.
    const { codeRequired: _known, ...step } = signedIn;
    const asks = vi.spyOn(provider, 'beginKeyRegistration');
    const screen = await flow.beginKeyRegistration(step, context());
    expect(screen).toMatchObject({ kind: 'pending', pending: { step: 'register_key', codeRequired: true } });
    expect(await tries(removal)).toBe(0);
    // Asked again, and at a completion with no code: still none.
    expect(await flow.beginKeyRegistration(step, context())).toMatchObject({ kind: 'pending', pending: { codeRequired: true } });
    expect(await flow.completeKeyRegistration({ ...step, challenge: 'x', creation: 'x' }, new SoftAuthenticator(ORIGIN).create({ challenge: 'eA', rp: { name: 'Test', id: 'localhost' }, user: { id: 'eA', name: 'x', displayName: 'x' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }] }), context())).toMatchObject({ kind: 'pending', pending: { codeRequired: true } });
    expect(await tries(removal)).toBe(0);
    expect(asks).not.toHaveBeenCalled();
    asks.mockRestore();
    expect(await flow.answerRegistrationCode(pendingOf(screen as FlowResult), newRegistrationCode(), context())).toEqual({ kind: 'refused', reason: 'registration_code' });
    expect(await tries(removal)).toBe(1);
    // The sign-in after the refusal reaches the screen again: the one wrong code is the one try.
    expect(await flow.beginKeyRegistration(step, context())).toMatchObject({ kind: 'pending', pending: { codeRequired: true } });
    expect(await tries(removal)).toBe(1);
  });
});

describe('SGN-26: a removal’s confirmation beside a sign-in in flight (docs/adr/0095)', () => {
  it('SGN-26, cases 4 and 5: a key step and a code step begun before a confirmation open nothing after it', async () => {
    const { staff, key } = await staffWithKey();
    const keyStep = await flow.beginKey(staff.email);
    if ('kind' in keyStep) {
      throw new Error('expected options');
    }
    await keysRemoved(staff.id);
    expect(await flow.completeKey(keyStep.pending, key.get(keyStep.options), context())).toEqual(EXPIRED);
    expect(await openSessions(staff.id)).toBe(0);
    expect(await securityEvents(staff.id)).toContain('step_before_reset_key');
  });

  it('SGN-26, case 6: a key registration begun before a confirmation registers nothing after it, and the provider is not asked', async () => {
    const waiting = await registrationBegun();
    await keysRemoved(waiting.staff.id);
    expect(await flow.completeKeyRegistration(waiting.begun.pending, waiting.key.create(waiting.begun.options), context())).toEqual(EXPIRED);
    expect(await storedIds(waiting.staff.sub)).toEqual([]);
    expect(await keyRows(waiting.staff.id)).toEqual([]);
  });

  it('SGN-26, case 7: a confirmation that commits after the app read the registry and before the session’s insert is refused by the database under the account’s lock, answered as a stale session and recorded', async () => {
    const { staff, key } = await staffWithKey();
    const give = provider.release.bind(provider);
    // The grant is given back between the app's own check and the insert: the removal commits there.
    const during = vi.spyOn(provider, 'release').mockImplementationOnce(async (...args) => {
      await keysRemoved(staff.id);
      await give(...args);
    });
    expect(await keySignIn(staff.email, key)).toEqual(EXPIRED);
    during.mockRestore();
    expect(await openSessions(staff.id)).toBe(0);
    const recorded = await securityEvents(staff.id);
    expect(recorded.some((event) => event === 'key_refused_removed' || event === 'step_before_reset_key')).toBe(true);
  });

  it('SGN-20: a password-and-code session for an account whose registration is closed is refused by the database although the account is not one that must hold a key, and answered as a key being required', async () => {
    // A removal confirmed for an account with no key closes it too (docs/adr/0095), and this account's flag is false.
    const user = await person();
    await signedIn(user.email);
    await keysRemoved(user.id);
    await pastTheMark();
    const { flow: watched, lines } = paced();
    expect(await codeSignIn(user.email, watched)).toEqual({ kind: 'refused', reason: 'hardware_key_required' });
    expect(await openSessions(user.id)).toBe(0);
    expect(logged(lines, 'security event: code session refused while key registration is closed')).toEqual([expect.objectContaining({ level: 'warn', user_id: user.id })]);
  });
});

describe('one relying-party ID: the web refuses every hardware-key step when the provider’s differs from its own (docs/adr/0095; the key registry’s design, section 5)', () => {
  const LINE = 'configuration: the relying-party ID is not the provider’s; hardware-key steps are refused';
  const THEIRS = 'localhost';
  const OURS = 'app.synthetic.test';

  function differing() {
    const lines: string[] = [];
    const use = new SignInFlow({ registrationCodeKey: CODE_KEY, webauthn: { rpId: OURS, origin: ORIGIN }, pool: app, provider, logger: createLogger({ sink: (line) => lines.push(line) }) });
    const logged = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((entry) => entry.msg === LINE);
    return { use, logged };
  }
  const refusal = (attempt: Promise<unknown>): Promise<unknown> => attempt.then(() => 'answered', (error: unknown) => error);

  it('refuses the first key sign-in step and every key step after it, by a message that names the setting and no value, logged at error on every refused step (delta review D3); the provider is asked once', async () => {
    const { staff, key } = await staffWithKey();
    const honest = await flow.beginKey(staff.email);
    if ('kind' in honest) {
      throw new Error('expected options');
    }
    const { use, logged } = differing();
    const asked = vi.spyOn(provider, 'beginKeySignIn');
    const first = await refusal(use.beginKey(staff.email, context()));
    expect(first).toBeInstanceOf(RelyingPartyMismatch);
    const { message } = first as Error;
    expect(message).toBe(RELYING_PARTY_MISMATCH);
    expect(message).toContain('WEBAUTHN_RP_ID');
    expect(message).not.toContain(THEIRS);
    expect(message).not.toContain(OURS);
    expect(logged()).toEqual([expect.objectContaining({ level: 'error', request_id: expect.any(String) })]);
    expect(JSON.stringify(logged())).not.toContain(OURS);
    // Latched: the next steps are refused before the provider is asked. Each refused step writes the line again, so
    // the operator's alarm stays raised for as long as key steps are refused (delta review D3: it was written once).
    expect(await refusal(use.beginKey(staff.email, context()))).toBeInstanceOf(RelyingPartyMismatch);
    expect(await refusal(use.completeKey(honest.pending, key.get(honest.options), context()))).toBeInstanceOf(RelyingPartyMismatch);
    const unkeyed = await person({ internal: true });
    const step = pendingOf(await use.answerTotp(pendingOf(await use.start(unkeyed.email, PASSWORD, context())), nextCode(), context()));
    const registering = vi.spyOn(provider, 'beginKeyRegistration');
    expect(await refusal(use.beginKeyRegistration(step, context()))).toBeInstanceOf(RelyingPartyMismatch);
    expect(registering).not.toHaveBeenCalled();
    registering.mockRestore();
    expect(asked).toHaveBeenCalledTimes(1);
    asked.mockRestore();
    // Four refused steps, four lines, each with its own request's ID and nothing else.
    expect(logged()).toHaveLength(4);
    for (const line of logged()) {
      expect(line).toMatchObject({ level: 'error', msg: LINE, error_code: 'RELYING_PARTY_MISMATCH', request_id: expect.any(String) });
    }
    expect(new Set(logged().map((line) => line.request_id)).size).toBe(4);
    expect(JSON.stringify(logged())).not.toContain(OURS);
    expect(await openSessions(staff.id)).toBe(0);
  });

  it('refuses when the first key step is a registration, and registers nothing', async () => {
    const staff = await person({ internal: true });
    const { use, logged } = differing();
    const step = pendingOf(await use.answerTotp(pendingOf(await use.start(staff.email, PASSWORD, context())), nextCode(), context()));
    expect(await refusal(use.beginKeyRegistration(step, context()))).toBeInstanceOf(RelyingPartyMismatch);
    expect(logged()).toHaveLength(1);
    expect(await refusal(use.completeKeyRegistration({ ...step, challenge: 'x', creation: 'x' } as Pending, new SoftAuthenticator(ORIGIN).create({ challenge: 'eA', rp: { name: 'Test', id: THEIRS }, user: { id: 'eA', name: 'x', displayName: 'x' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }] }), context()))).toBeInstanceOf(RelyingPartyMismatch);
    expect(logged()).toHaveLength(2);
    expect(await keyRows(staff.id)).toEqual([]);
  });

  it('settles the check when the provider’s options carry no ID: the browser then uses the origin’s host, and that is compared with the app’s (review A7)', async () => {
    const { staff } = await staffWithKey();
    const { use, logged } = differing();
    const real = provider.beginKeySignIn.bind(provider);
    const asked = vi.spyOn(provider, 'beginKeySignIn').mockImplementation(async (email) => {
      const { options, challenge } = await real(email);
      const { rpId: _theirs, ...rest } = options;
      return { options: rest, challenge };
    });
    try {
      // The app's ID is not the origin's host (localhost), which is what a browser uses for options that name none.
      expect(await refusal(use.beginKey(staff.email, context()))).toBeInstanceOf(RelyingPartyMismatch);
      expect(logged()).toEqual([expect.objectContaining({ level: 'error', error_code: 'RELYING_PARTY_MISMATCH', request_id: expect.any(String) })]);
      // An app whose ID is the origin's host goes on, and writes no line.
      const lines: string[] = [];
      const same = new SignInFlow({ registrationCodeKey: CODE_KEY, webauthn: WEBAUTHN, pool: app, provider, logger: createLogger({ sink: (line) => lines.push(line) }) });
      expect(await same.beginKey(staff.email, context())).toMatchObject({ pending: { step: 'key' } });
      expect(lines.filter((line) => line.includes('relying-party'))).toEqual([]);
    } finally {
      asked.mockRestore();
    }
  });

  it('writes the line the alarm counts (review A6): a constant message, the code RELYING_PARTY_MISMATCH and the request’s ID, no setting’s value', async () => {
    const { staff } = await staffWithKey();
    const { use, logged } = differing();
    const with_ = context();
    expect(await refusal(use.beginKey(staff.email, with_))).toBeInstanceOf(RelyingPartyMismatch);
    const [line, ...more] = logged();
    expect(more).toEqual([]);
    expect(line).toMatchObject({ level: 'error', msg: LINE, error_code: 'RELYING_PARTY_MISMATCH', request_id: with_.requestId });
    expect(Object.keys(line ?? {}).filter((field) => !['level', 'msg', 'time', 'ts', 'at', 'service', 'error_code', 'request_id'].includes(field))).toEqual([]);
    expect(JSON.stringify(line)).not.toContain(OURS);
    expect(JSON.stringify(line)).not.toContain(staff.email);
  });

  it('compares once: a flow whose ID is the provider’s goes on, and writes no line', async () => {
    const lines: string[] = [];
    const use = new SignInFlow({ registrationCodeKey: CODE_KEY, webauthn: WEBAUTHN, pool: app, provider, logger: createLogger({ sink: (line) => lines.push(line) }) });
    const { staff, key } = await staffWithKey();
    expect((await keySignIn(staff.email, key, use)).kind).toBe('signed_in');
    expect((await keySignIn(staff.email, key, use)).kind).toBe('signed_in');
    expect(lines.filter((line) => line.includes('relying-party'))).toEqual([]);
  });
});

describe('key registration offers ES256 and RS256 only, whatever the provider lists (ruling R2; docs/adr/0095)', () => {
  // Delta review D4. The flow asks the provider first and verifies after, so the refusal is the app's own: the
  // provider (the local one takes EdDSA, as the library's default list does) registers the key, and the flow removes it.
  it('refuses a registration under an algorithm outside the two (EdDSA, -8) that the provider accepted: not verified, the key removed at the provider, no row', async () => {
    expect(KEY_REGISTRATION_ALGORITHMS).not.toContain(-8);
    const lines: string[] = [];
    const use = new SignInFlow({ registrationCodeKey: CODE_KEY, webauthn: WEBAUTHN, pool: app, provider, logger: createLogger({ sink: (line) => lines.push(line) }) });
    const staff = await person({ internal: true });
    const key = new SoftAuthenticator(ORIGIN, true, 'EdDSA');
    const begun = await use.beginKeyRegistration(pendingOf(await codeSignIn(staff.email, use)), context());
    if ('kind' in begun) {
      throw new Error('expected options');
    }
    const accepted = vi.spyOn(provider, 'completeKeyRegistration');
    const removed = vi.spyOn(provider, 'removeHardwareKey');
    const with_ = context();
    try {
      expect(await use.completeKeyRegistration(begun.pending, key.create(begun.options), with_)).toEqual({ kind: 'refused', reason: 'key_not_registered' });
      // The provider took the credential: the refusal is not its, and not a malformed response's.
      expect(accepted).toHaveBeenCalledTimes(1);
      expect(await accepted.mock.results[0]?.value).toBe(true);
      expect(removed).toHaveBeenCalledTimes(1);
      expect(removed.mock.calls[0]?.[1]).toBe(key.credentialId.toString('base64url'));
    } finally {
      accepted.mockRestore();
      removed.mockRestore();
    }
    expect(await storedIds(staff.sub)).toEqual([]);
    expect(await keyRows(staff.id)).toEqual([]);
    expect(logged(lines, 'hardware key registered at the provider but not recorded')).toEqual([
      expect.objectContaining({ level: 'error', user_id: staff.id, request_id: with_.requestId, error_code: 'not_verified', outcome_code: 'removed' }),
    ]);
    // The same step with an ES256 key registers: nothing but the algorithm refused it.
    const again = await use.beginKeyRegistration(pendingOf(await codeSignIn(staff.email, use)), context());
    if ('kind' in again) {
      throw new Error('expected options');
    }
    const es256 = new SoftAuthenticator(ORIGIN);
    expect(await use.completeKeyRegistration(again.pending, es256.create(again.options), context())).toEqual({ kind: 'key_registered' });
    expect(await keyRows(staff.id)).toEqual([{ digest: sha(es256.credentialId).toString('hex'), live: true }]);
  });

  const LINE = 'configuration: the provider offers neither ES256 nor RS256 at key registration; the step is refused';
  const listing = (algorithms: readonly number[]) => {
    const real = provider.beginKeyRegistration.bind(provider);
    return vi.spyOn(provider, 'beginKeyRegistration').mockImplementation(async (grant) => {
      const begun = await real(grant);
      return { ...begun, options: { ...begun.options, pubKeyCredParams: algorithms.map((alg) => ({ alg, type: 'public-key' as const })) } };
    });
  };
  const registering = async (use: SignInFlow, staff: { email: string }) => pendingOf(await use.answerTotp(pendingOf(await use.start(staff.email, PASSWORD, context())), nextCode(), context()));

  it('sends the browser the two algorithms only, in the product’s order, and a key registers under them', async () => {
    expect(KEY_REGISTRATION_ALGORITHMS).toEqual([-7, -257]);
    const staff = await person({ internal: true });
    const step = await registering(flow, staff);
    for (const listed of [[-48, -8, -7, -257], [-257, -48, -7, -8]]) {
      const asked = listing(listed);
      const begun = await flow.beginKeyRegistration(step, context()).finally(() => asked.mockRestore());
      if ('kind' in begun) {
        throw new Error('expected options');
      }
      expect(begun.options.pubKeyCredParams).toEqual([{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }]);
    }
    const asked = listing([-48, -8, -7, -257]);
    const begun = await flow.beginKeyRegistration(step, context()).finally(() => asked.mockRestore());
    if ('kind' in begun) {
      throw new Error('expected options');
    }
    expect(await flow.completeKeyRegistration(begun.pending, new SoftAuthenticator(ORIGIN).create(begun.options), context())).toEqual({ kind: 'key_registered' });
  });

  it('refuses the step when the provider lists neither, by a line of IDs only', async () => {
    const lines: string[] = [];
    const use = new SignInFlow({ registrationCodeKey: CODE_KEY, webauthn: WEBAUTHN, pool: app, provider, logger: createLogger({ sink: (line) => lines.push(line) }) });
    const staff = await person({ internal: true });
    const step = await registering(use, staff);
    const with_ = context();
    const asked = listing([-48, -8]);
    const answer = await use.beginKeyRegistration(step, with_).then(() => 'answered', (error: unknown) => error).finally(() => asked.mockRestore());
    expect(answer).toBeInstanceOf(KeyAlgorithmsNotOffered);
    expect(logged(lines, LINE)).toEqual([expect.objectContaining({ level: 'error', user_id: staff.id, request_id: with_.requestId, error_code: 'KEY_ALGORITHMS_NOT_OFFERED' })]);
    expect(JSON.stringify(logged(lines, LINE))).not.toContain(staff.email);
  });
});

describe('SGN-30: the count of a wrong code refused at the registry’s row is committed when the web then refuses (review W65 S4)', () => {
  /** The application's pool, with the one-time code's digest on its way to hardware_key_record swapped for another: the judge said open, and the code that reaches the row is wrong. */
  function offering(digest: Buffer): ScopePool<ScopeClient> {
    return {
      connect: async () => {
        const client = await app.connect();
        return new Proxy(client, {
          get(target, property) {
            if (property === 'query') {
              return (text: unknown, values?: unknown[]) =>
                typeof text === 'string' && /hardware_key_record/.test(text) && values !== undefined
                  ? target.query(text, [values[0], values[1], digest, ...values.slice(3)])
                  : target.query(text as string, values);
            }
            const value = Reflect.get(target, property, target) as unknown;
            return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
          },
        });
      },
    };
  }

  it('SGN-30: through a real opening, a wrong code at hardware_key_record is one counted try and one refusal on record after the web has thrown, the key is removed at the provider, and the right code then still registers', async () => {
    const { staff, key } = await staffWithKey();
    const { removal, opener } = await keysRemoved(staff.id);
    await pastTheMark();
    const code = await registrationOpened(removal, opener);
    const tries = async (): Promise<number | undefined> =>
      (await owner.query<{ tries: number }>('SELECT registration_code_tries AS tries FROM hardware_key_removal WHERE id = $1', [removal])).rows[0]?.tries;
    const lines: string[] = [];
    const wrong = new SignInFlow({
      registrationCodeKey: CODE_KEY,
      webauthn: WEBAUTHN,
      pool: offering(registrationCodeDigest(CODE_KEY, newRegistrationCode())),
      provider,
      logger: createLogger({ sink: (line) => lines.push(line) }),
    });
    const step = pendingOf(await codeSignIn(staff.email, wrong));
    const open = pendingOf(await wrong.answerRegistrationCode(step, code, context()));
    const begun = await wrong.beginKeyRegistration(open, context());
    if ('kind' in begun) {
      throw new Error('expected options');
    }
    expect(await tries()).toBe(0);
    const with_ = context();
    const next = new SoftAuthenticator(ORIGIN);
    expect(await wrong.completeKeyRegistration(begun.pending, next.create(begun.options), with_)).toEqual({ kind: 'refused', reason: 'key_not_registered' });
    // The web threw after the registry's transaction returned: the try it counted and the refusal it recorded are committed.
    expect(await tries()).toBe(1);
    expect((await securityEvents(staff.id)).filter((event) => event === 'key_registration_refused')).toHaveLength(1);
    expect(logged(lines, 'hardware key registered at the provider but not recorded')).toEqual([
      expect.objectContaining({ level: 'error', user_id: staff.id, request_id: with_.requestId, error_code: 'registration_code_refused', outcome_code: 'removed' }),
    ]);
    expect(await keyRows(staff.id)).toEqual([{ digest: sha(key.credentialId).toString('hex'), live: false }]);
    expect(await storedIds(staff.sub)).not.toContain(B64(next.credentialId));
    // The opening is not spent by one wrong code: the right one, through the flow as it is, still registers.
    const again = pendingOf(await codeSignIn(staff.email));
    const reopened = pendingOf(await flow.answerRegistrationCode(again, code, context()));
    const second = await flow.beginKeyRegistration(reopened, context());
    if ('kind' in second) {
      throw new Error('expected options');
    }
    expect(await flow.completeKeyRegistration(second.pending, new SoftAuthenticator(ORIGIN).create(second.options), context())).toEqual({ kind: 'key_registered' });
    expect(await tries()).toBe(1);
  });
});
