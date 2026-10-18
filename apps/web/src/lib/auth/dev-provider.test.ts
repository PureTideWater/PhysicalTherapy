import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DevAuthProvider, temporaryPassword } from './dev-provider';
import { type DevUserRecord, FileDevStore, MemoryDevStore } from './dev-store';
import { hashPassword, passwordProblems } from './password';
import type { AuthStep } from './provider';
import { Sealer } from './seal';
import { SoftAuthenticator } from './test-support/soft-authenticator';
import { totpCode } from './totp';

const ORIGIN = 'http://localhost:3100';
const CHEAP = { n: 1024, r: 8, p: 1 };
const PASSWORD = 'Synthetic-Pass-2026';

let clock = new Date('2026-10-15T12:00:00Z');
const advance = (seconds: number) => {
  clock = new Date(clock.getTime() + seconds * 1000);
};

async function provider(records: DevUserRecord[] = []) {
  const store = new MemoryDevStore();
  for (const record of records) {
    await store.put(record);
  }
  const invitations: { email: string; password: string }[] = [];
  const dev = new DevAuthProvider({
    store,
    sealer: new Sealer(Buffer.alloc(32, 3)),
    webauthn: { rpId: 'localhost', rpName: 'Test', origin: ORIGIN },
    deliverInvitation: (email, password) => {
      invitations.push({ email, password });
      return Promise.resolve();
    },
    now: () => clock,
    scryptCost: CHEAP,
  });
  return { dev, store, invitations };
}

async function record(overrides: Partial<DevUserRecord> = {}): Promise<DevUserRecord> {
  return {
    sub: 'sub-1',
    email: 'person@synthetic.test',
    passwordHash: await hashPassword(PASSWORD, CHEAP),
    temporary: false,
    totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
    totpLastStep: -1,
    credentials: [],
    ...overrides,
  };
}

function challengeOf(step: AuthStep): string {
  if (!('challenge' in step)) {
    throw new Error(`expected a challenge, got ${step.kind}`);
  }
  return step.challenge;
}

describe('DevAuthProvider: password and TOTP', () => {
  it('asks for the TOTP code after a right password, and authenticates with it once', async () => {
    const { dev } = await provider([await record()]);
    expect(await dev.signIn('PERSON@synthetic.test', 'wrong')).toEqual({ kind: 'rejected', stage: 'password' });
    const step = await dev.signIn('person@synthetic.test', PASSWORD);
    expect(step.kind).toBe('mfa_required');
    expect(await dev.answerTotp(challengeOf(step), '000000')).toEqual({ kind: 'rejected', stage: 'mfa' });
    const code = totpCode('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', clock);
    const done = await dev.answerTotp(challengeOf(step), code);
    expect(done).toMatchObject({ kind: 'authenticated', identity: { sub: 'sub-1', email: 'person@synthetic.test', method: 'totp' } });
    // The same code is never accepted twice.
    expect(await dev.answerTotp(challengeOf(await dev.signIn('person@synthetic.test', PASSWORD)), code)).toEqual({ kind: 'rejected', stage: 'mfa' });
  });

  it('rejects an unknown email like a wrong password', async () => {
    const { dev } = await provider();
    expect(await dev.signIn('nobody@synthetic.test', PASSWORD)).toEqual({ kind: 'rejected', stage: 'password' });
  });

  it('expires a challenge after three minutes, and refuses one sealed for another step', async () => {
    const { dev } = await provider([await record()]);
    const step = await dev.signIn('person@synthetic.test', PASSWORD);
    expect(await dev.completeTotpSetup(challengeOf(step), '123456')).toEqual({ kind: 'expired' });
    expect(await dev.setNewPassword(challengeOf(step), 'Another-Pass-2026')).toEqual({ kind: 'expired' });
    advance(181);
    expect(await dev.answerTotp(challengeOf(step), totpCode('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', clock))).toEqual({ kind: 'expired' });
    expect(await dev.answerTotp('not a challenge', '123456')).toEqual({ kind: 'expired' });
  });

  it('enrolls TOTP before anything else when none is set, then needs a code every time', async () => {
    const { dev, store } = await provider([await record({ totpSecret: null })]);
    const step = await dev.signIn('person@synthetic.test', PASSWORD);
    expect(step.kind).toBe('mfa_setup_required');
    const setup = await dev.beginTotpSetup(challengeOf(step));
    if ('kind' in setup) {
      throw new Error('expected a setup');
    }
    expect(setup.uri).toContain(`secret=${setup.secret}`);
    expect(await dev.completeTotpSetup(setup.challenge, '000000')).toEqual({ kind: 'rejected', stage: 'mfa' });
    // The secret lives in the challenge until a code proves it: the original challenge carries none.
    expect(await dev.completeTotpSetup(challengeOf(step), totpCode(setup.secret, clock))).toEqual({ kind: 'expired' });
    expect(await dev.completeTotpSetup(setup.challenge, totpCode(setup.secret, clock))).toMatchObject({ kind: 'authenticated', identity: { method: 'totp' } });
    expect((await store.bySub('sub-1'))?.totpSecret).toBe(setup.secret);
    expect(await dev.beginTotpSetup('nothing')).toEqual({ kind: 'expired' });
  });

  it('requires a new password, meeting the policy, after a temporary one', async () => {
    const { dev } = await provider([await record({ temporary: true, totpSecret: null })]);
    const step = await dev.signIn('person@synthetic.test', PASSWORD);
    expect(step.kind).toBe('new_password_required');
    expect(await dev.setNewPassword(challengeOf(step), 'weak')).toEqual({ kind: 'invalid_password', problems: passwordProblems('weak') });
    const next = await dev.setNewPassword(challengeOf(step), 'Chosen-Pass-2026');
    expect(next.kind).toBe('mfa_setup_required');
    expect((await dev.signIn('person@synthetic.test', PASSWORD)).kind).toBe('rejected');
    expect((await dev.signIn('person@synthetic.test', 'Chosen-Pass-2026')).kind).toBe('mfa_setup_required');
  });

  it('answers expired when the account vanished between steps', async () => {
    const { dev } = await provider([await record({ temporary: true })]);
    const challenge = challengeOf(await dev.signIn('person@synthetic.test', PASSWORD));
    // The same sealing key over a store without the account.
    const orphan = new DevAuthProvider({
      store: new MemoryDevStore(),
      sealer: new Sealer(Buffer.alloc(32, 3)),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: ORIGIN },
      deliverInvitation: () => Promise.resolve(),
      now: () => clock,
      scryptCost: CHEAP,
    });
    expect(await orphan.setNewPassword(challenge, 'Chosen-Pass-2026')).toEqual({ kind: 'expired' });
    expect(await orphan.hasHardwareKey('nothing')).toBe(false);
  });
});

describe('DevAuthProvider: invitations and sign-out', () => {
  it('creates an invited account with a temporary password it delivers, once', async () => {
    const { dev, invitations } = await provider();
    const first = await dev.ensureUser('new@synthetic.test');
    expect(first.created).toBe(true);
    expect(await dev.ensureUser('NEW@synthetic.test')).toEqual({ sub: first.sub, created: false });
    expect(invitations).toHaveLength(1);
    const password = invitations[0]?.password ?? '';
    expect(passwordProblems(password)).toEqual([]);
    expect((await dev.signIn('new@synthetic.test', password)).kind).toBe('new_password_required');
    await expect(dev.globalSignOut()).resolves.toBeUndefined();
    await expect(dev.release()).resolves.toBeUndefined();
    expect(passwordProblems(temporaryPassword())).toEqual([]);
  });

  it('sends an invitation again with a new temporary password, and nothing for an account that chose its own (J2)', async () => {
    const { dev, invitations } = await provider();
    await dev.ensureUser('again@synthetic.test');
    const first = invitations[0]?.password ?? '';
    await dev.resendInvitation('again@synthetic.test');
    expect(invitations).toHaveLength(2);
    const second = invitations[1]?.password ?? '';
    expect(second).not.toBe(first);
    expect((await dev.signIn('again@synthetic.test', first)).kind).toBe('rejected');
    const step = await dev.signIn('again@synthetic.test', second);
    expect(step.kind).toBe('new_password_required');
    await dev.setNewPassword(challengeOf(step), 'Chosen-Synthetic-Pass-2026!');
    await dev.resendInvitation('again@synthetic.test');
    await dev.resendInvitation('nobody@synthetic.test');
    expect(invitations).toHaveLength(2);
  });
});

describe('DevAuthProvider: hardware keys (real WebAuthn verification)', () => {
  async function registered() {
    const setup = await provider([await record()]);
    const step = await setup.dev.answerTotp(challengeOf(await setup.dev.signIn('person@synthetic.test', PASSWORD)), totpCode('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', clock));
    if (step.kind !== 'authenticated') {
      throw new Error('expected a sign-in');
    }
    const key = new SoftAuthenticator(ORIGIN);
    expect(await setup.dev.hasHardwareKey(step.grant)).toBe(false);
    const { options, challenge } = await setup.dev.beginKeyRegistration(step.grant);
    expect(options.authenticatorSelection?.userVerification).toBe('required');
    expect(await setup.dev.completeKeyRegistration(step.grant, challenge, key.create(options))).toBe(true);
    expect(await setup.dev.hasHardwareKey(step.grant)).toBe(true);
    return { ...setup, key, grant: step.grant };
  }

  it('registers a key, then signs in with it (user verification required)', async () => {
    const { dev, key, store } = await registered();
    const { options, challenge } = await dev.beginKeySignIn('person@synthetic.test');
    expect(options.userVerification).toBe('required');
    expect(options.allowCredentials?.map((credential) => credential.id)).toEqual([key.credentialId.toString('base64url')]);
    const done = await dev.completeKeySignIn(challenge, key.get(options));
    expect(done).toMatchObject({ kind: 'authenticated', identity: { sub: 'sub-1', method: 'webauthn' } });
    expect((await store.bySub('sub-1'))?.credentials[0]?.counter).toBe(1);
  });

  it('rejects an assertion from an unknown key, a key without user verification, a replayed challenge, or another origin', async () => {
    const { dev, key } = await registered();
    const begun = await dev.beginKeySignIn('person@synthetic.test');
    expect(await dev.completeKeySignIn(begun.challenge, key.get(begun.options, Buffer.from('unknown')))).toEqual({ kind: 'rejected', stage: 'hardware_key' });
    const other = await dev.beginKeySignIn('person@synthetic.test');
    expect(await dev.completeKeySignIn(other.challenge, key.get(begun.options))).toEqual({ kind: 'rejected', stage: 'hardware_key' });
    const elsewhere = new SoftAuthenticator('http://localhost:9999');
    const third = await dev.beginKeySignIn('person@synthetic.test');
    expect(await dev.completeKeySignIn(third.challenge, { ...elsewhere.get(third.options), id: key.credentialId.toString('base64url') })).toEqual({ kind: 'rejected', stage: 'hardware_key' });
    expect(await dev.completeKeySignIn('expired', key.get(third.options))).toEqual({ kind: 'expired' });
  });

  it('refuses to register a key without user verification, for an expired grant, or with a challenge of another user', async () => {
    const { dev, grant } = await registered();
    const { options, challenge } = await dev.beginKeyRegistration(grant);
    expect(await dev.completeKeyRegistration(grant, challenge, new SoftAuthenticator(ORIGIN, false).create(options))).toBe(false);
    expect(await dev.completeKeyRegistration(grant, 'nothing', new SoftAuthenticator(ORIGIN).create(options))).toBe(false);
    advance(16 * 60);
    expect(await dev.completeKeyRegistration(grant, challenge, new SoftAuthenticator(ORIGIN).create(options))).toBe(false);
    await expect(dev.beginKeyRegistration(grant)).rejects.toThrow('expired');
  });

  it('gives an unknown email options that no key can answer', async () => {
    const { dev, key } = await registered();
    const { options, challenge } = await dev.beginKeySignIn('nobody@synthetic.test');
    expect(options.allowCredentials).toEqual([]);
    expect(await dev.completeKeySignIn(challenge, key.get(options))).toEqual({ kind: 'rejected', stage: 'hardware_key' });
  });
});

describe('the credential stores', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps records in a JSON file written atomically, readable by the owner only', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'tp-dev-store-'));
    const file = path.join(dir, 'nested', 'store.json');
    const store = new FileDevStore(file);
    expect(await store.byEmail('person@synthetic.test')).toBeUndefined();
    await store.put(await record());
    await store.put(await record({ sub: 'sub-2', email: 'other@synthetic.test' }));
    expect((await new FileDevStore(file).bySub('sub-2'))?.email).toBe('other@synthetic.test');
    expect(await store.update('sub-1', (current) => ({ ...current, totpLastStep: 9 }))).toMatchObject({ totpLastStep: 9 });
    expect(await store.update('missing', (current) => current)).toBeUndefined();
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ version: 1, users: [{ sub: 'sub-1', totpLastStep: 9 }, { sub: 'sub-2' }] });
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('serializes concurrent updates', async () => {
    const store = new MemoryDevStore();
    await store.put(await record());
    await Promise.all(Array.from({ length: 20 }, () => store.update('sub-1', (current) => ({ ...current, totpLastStep: current.totpLastStep + 1 }))));
    expect((await store.bySub('sub-1'))?.totpLastStep).toBe(19);
  });

  it('surfaces a store it cannot read', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'tp-dev-store-'));
    writeFileSync(path.join(dir, 'store.json'), 'not json');
    await expect(new FileDevStore(path.join(dir, 'store.json')).byEmail('x@synthetic.test')).rejects.toThrow();
    await expect(new FileDevStore(dir).byEmail('x@synthetic.test')).rejects.toThrow();
  });
});
