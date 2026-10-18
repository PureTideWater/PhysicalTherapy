import { randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl, withActor } from '@tp/db';
import { type MigratedDatabase, addMembership, asOwner, createMigratedDatabase, createOrganization, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DevAuthProvider } from './dev-provider';
import { MemoryDevStore } from './dev-store';
import { hashPassword } from './password';
import { Sealer } from './seal';
import { listDevices, resolveSession } from './sessions';
import { type FlowResult, type Pending, SignInFlow } from './sign-in';
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
