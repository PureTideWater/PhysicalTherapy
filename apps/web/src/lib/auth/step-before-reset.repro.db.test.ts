import { randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, addMembership, asOwner, createMigratedDatabase, createOrganization, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from './dev-provider';
import { MemoryDevStore } from './dev-store';
import { hashPassword } from './password';
import { Sealer } from './seal';
import { resolveSession } from './sessions';
import { type FlowResult, type Pending, SignInFlow } from './sign-in';
import { SoftAuthenticator } from './test-support/soft-authenticator';
import { totpCode } from './totp';

/**
 * REPRODUCTION ONLY (not for merge): the two cases on the provider twin, on the tree before the close. A sign-in step
 * begun before a password reset opens a session after it, and a key-registration step begun before it registers a key
 * after it (the twin's sign-out revokes nothing, as a failed provider sign-out).
 */

const ORIGIN = 'http://localhost:3100';
const CHEAP = { n: 1024, r: 8, p: 1 };
const BEFORE_RESET = 'Synthetic-Pass-2026';
const AFTER_RESET = 'Chosen-Reset-Pass-2026';
const SEED = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let store: MemoryDevStore;
let flow: SignInFlow;
let clock = new Date();
const mailed: { readonly email: string; readonly code: string }[] = [];

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  store = new MemoryDevStore();
  const provider = new DevAuthProvider({
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
  flow = new SignInFlow({ pool: app, provider, logger: createLogger({ sink: () => undefined }), sleep: () => Promise.resolve() });
});

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

async function person(internal: boolean): Promise<{ id: string; email: string; sub: string }> {
  const id = randomUUID();
  const sub = randomUUID();
  const email = `${id}@synthetic.test`;
  await store.put({ sub, email, passwordHash: await hashPassword(BEFORE_RESET, CHEAP), temporary: false, totpSecret: SEED, totpLastStep: -1, credentials: [] });
  await asOwner(owner, [], () =>
    owner.query('INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status) VALUES ($1, $2, $3, true, $4, $5)', [id, sub, email, internal, 'active']),
  );
  if (internal) {
    await addMembership(owner, await createOrganization(owner, 'internal'), id, 'platform_admin');
  }
  return { id, email, sub };
}

const context = () => ({ deviceToken: undefined, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0', requestId: `test-${randomUUID()}` });

function pendingOf(result: FlowResult): Pending {
  if (result.kind !== 'pending') {
    throw new Error(`expected a pending step, got ${JSON.stringify(result)}`);
  }
  return result.pending;
}

function nextCode(): string {
  clock = new Date(clock.getTime() + 30_000);
  return totpCode(SEED, clock);
}

async function reset(email: string): Promise<void> {
  await flow.requestPasswordReset(email, context());
  const code = mailed.filter((mail) => mail.email === email).at(-1)?.code ?? '';
  expect(await flow.confirmPasswordReset(email, code, AFTER_RESET, context())).toMatchObject({ kind: 'reset' });
}

describe('REPRODUCTION: a step begun before a password reset still finishes after it', () => {
  it('case 1: a code step begun with the old password opens a session after the reset', async () => {
    const user = await person(false);
    const begun = pendingOf(await flow.start(user.email, BEFORE_RESET, context()));
    expect(begun.step).toBe('mfa');
    await reset(user.email);
    // The old password no longer starts a sign-in.
    expect(await flow.start(user.email, BEFORE_RESET, context())).toEqual({ kind: 'refused', reason: 'credentials' });
    // The step begun before the reset still opens a session.
    const done = await flow.answerTotp(begun, nextCode(), context());
    expect(done.kind).toBe('signed_in');
    if (done.kind === 'signed_in') {
      expect(await resolveSession(app, done.session.sessionToken, 'test')).toMatchObject({ state: 'active' });
    }
  });

  it('case 2: a key-registration step begun before the reset registers a key after it, and the key then signs in', async () => {
    const staff = await person(true);
    const registration = pendingOf(await flow.answerTotp(pendingOf(await flow.start(staff.email, BEFORE_RESET, context())), nextCode(), context()));
    expect(registration.step).toBe('register_key');
    await reset(staff.email);
    const key = new SoftAuthenticator(ORIGIN);
    const options = await flow.beginKeyRegistration(registration);
    if ('kind' in options) {
      throw new Error('expected options');
    }
    expect(await flow.completeKeyRegistration(options.pending, key.create(options.options), context())).toEqual({ kind: 'key_registered' });
    const keyStart = await flow.beginKey(staff.email);
    if ('kind' in keyStart) {
      throw new Error('expected options');
    }
    expect((await flow.completeKey(keyStart.pending, key.get(keyStart.options), context())).kind).toBe('signed_in');
  });
});
