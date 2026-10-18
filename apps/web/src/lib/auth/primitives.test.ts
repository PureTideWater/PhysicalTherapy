import { readFileSync } from 'node:fs';
import path from 'node:path';

import { INVITATION_DAYS } from '@tp/db/runtime';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { PASSWORD_MIN_LENGTH, hashPassword, passwordProblems, verifyPassword } from './password';
import { SealKeyError, Sealer } from './seal';
import { SESSION_LIMITS } from './sessions';
import { cookieToken, deviceLabel, newToken, tokenHash } from './tokens';
import { newTotpSecret, totpCode, totpSecretFromBytes, totpUri, verifyTotp } from './totp';

const KEY = Buffer.alloc(32, 7);
const NOW = new Date('2026-10-15T12:00:00Z');
const LATER = new Date('2026-10-15T12:10:00Z');
const CHEAP = { n: 1024, r: 8, p: 1 };

describe('Sealer', () => {
  const sealer = new Sealer(KEY);

  it('opens what it sealed for the same purpose before it expires', () => {
    const sealed = sealer.seal('pending', { step: 'mfa', email: 'a@synthetic.test' }, LATER);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(sealer.open('pending', sealed, NOW)).toEqual({ step: 'mfa', email: 'a@synthetic.test' });
  });

  it('opens nothing expired, sealed for another purpose, tampered, malformed or absent', () => {
    const sealed = sealer.seal('pending', { x: 1 }, LATER);
    expect(sealer.open('pending', sealed, LATER)).toBeUndefined();
    expect(sealer.open('grant', sealed, NOW)).toBeUndefined();
    const flipped = `${sealed.slice(0, -2)}${sealed.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(sealer.open('pending', flipped, NOW)).toBeUndefined();
    expect(sealer.open('pending', 'v1.short', NOW)).toBeUndefined();
    expect(sealer.open('pending', 'v2.anything', NOW)).toBeUndefined();
    expect(sealer.open('pending', undefined, NOW)).toBeUndefined();
    expect(new Sealer(Buffer.alloc(32, 8)).open('pending', sealed, NOW)).toBeUndefined();
  });

  it('derives an independent key for another use, and refuses a key that is not 32 bytes', () => {
    const derived = sealer.derive('dev-provider');
    expect(derived.open('x', sealer.seal('x', 1, LATER), NOW)).toBeUndefined();
    expect(derived.open('x', derived.seal('x', 1, LATER), NOW)).toBe(1);
    expect(() => new Sealer(Buffer.alloc(16))).toThrow(SealKeyError);
  });

  it('round-trips any JSON value (property)', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(sealer.open('p', sealer.seal('p', value, LATER), NOW)).toEqual(JSON.parse(JSON.stringify(value)));
      }),
      { numRuns: 50 },
    );
  });
});

describe('passwords', () => {
  it('lists what a password lacks under the policy', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(passwordProblems('Synthetic-Pass-2026')).toEqual([]);
    expect(passwordProblems('short')).toEqual(['at least 12 characters', 'an uppercase letter', 'a digit', 'a symbol']);
    expect(passwordProblems('ALLUPPERCASE1!')).toEqual(['a lowercase letter']);
  });

  it('matches the user pool’s policy in infra (12 characters, all four classes)', () => {
    const identity = readFileSync(path.resolve(import.meta.dirname, '../../../../../infra/lib/constructs/identity.ts'), 'utf8');
    expect(identity).toContain('export const PASSWORD_MIN_LENGTH = 12;');
    for (const rule of ['requireLowercase: true', 'requireUppercase: true', 'requireDigits: true', 'requireSymbols: true']) {
      expect(identity).toContain(rule);
    }
  });

  it('lets a temporary password last exactly as long as the invitation it came with', () => {
    const identity = readFileSync(path.resolve(import.meta.dirname, '../../../../../infra/lib/constructs/identity.ts'), 'utf8');
    expect(identity).toContain(`export const INVITATION_DAYS = ${String(INVITATION_DAYS)};`);
    expect(identity).toContain('tempPasswordValidity: Duration.days(INVITATION_DAYS)');
  });

  it('hashes with scrypt and verifies only the same password', async () => {
    const hash = await hashPassword('Synthetic-Pass-2026', CHEAP);
    expect(hash).toMatch(/^scrypt:v1:1024:8:1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(await verifyPassword('Synthetic-Pass-2026', hash)).toBe(true);
    expect(await verifyPassword('Synthetic-Pass-2027', hash)).toBe(false);
    expect(await verifyPassword('Synthetic-Pass-2026', 'plain')).toBe(false);
    expect(await hashPassword('Synthetic-Pass-2026', CHEAP)).not.toBe(hash);
  });

  it('uses OWASP’s minimum cost by default', async () => {
    expect(await hashPassword('Synthetic-Pass-2026')).toMatch(/^scrypt:v1:131072:8:1:/);
  });

  it('refuses a stored hash whose length differs', async () => {
    const hash = await hashPassword('Synthetic-Pass-2026', CHEAP);
    expect(await verifyPassword('Synthetic-Pass-2026', `${hash.slice(0, hash.lastIndexOf(':') + 1)}AAAA`)).toBe(false);
  });
});

describe('TOTP', () => {
  const secret = newTotpSecret();

  it('makes a base32 secret and an otpauth URI naming the account', () => {
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(totpUri(secret, 'a@synthetic.test')).toMatch(/^otpauth:\/\/totp\/Therapy%20Platform:a%40synthetic\.test\?.*secret=/);
  });

  it('accepts the code of this step and the neighbouring ones, never an older or a reused step', () => {
    const step = Math.floor(NOW.getTime() / 30_000);
    expect(verifyTotp(secret, totpCode(secret, NOW), NOW)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, new Date(NOW.getTime() - 30_000)), NOW)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, new Date(NOW.getTime() - 90_000)), NOW)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, NOW), NOW, step)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, NOW), NOW, step - 1)).toBe(step);
  });

  it('turns 20 bytes into a base32 secret', () => {
    expect(totpSecretFromBytes(Buffer.alloc(32, 0))).toBe('A'.repeat(32));
    expect(verifyTotp(totpSecretFromBytes(Buffer.alloc(20, 1)), totpCode(totpSecretFromBytes(Buffer.alloc(20, 1)), NOW), NOW)).not.toBeNull();
  });

  it('refuses anything that is not six digits', () => {
    expect(verifyTotp(secret, '12345', NOW)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', NOW)).toBeNull();
  });
});

describe('tokens and device labels', () => {
  it('makes 256-bit tokens, hashes them, and reads only well-formed cookies', () => {
    const token = newToken();
    expect(cookieToken(token)).toBe(token);
    expect(cookieToken('short')).toBeUndefined();
    expect(cookieToken(undefined)).toBeUndefined();
    expect(tokenHash(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash(token)).not.toBe(tokenHash(newToken()));
  });

  it.each([
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', 'Chrome on Linux'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'Safari on macOS'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox on Windows'],
    ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0', 'Edge on Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/141.0 Mobile Safari/604.1', 'Chrome on iOS'],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36 OPR/80', 'Opera on Android'],
    ['Mozilla/5.0 (X11; CrOS x86_64 15000.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', 'Chrome on ChromeOS'],
    ['curl/8.0', 'Browser'],
    [null, 'Browser'],
  ])('labels %s as %s', (agent, label) => {
    expect(deviceLabel(agent)).toBe(label);
    expect(label).toMatch(/^[A-Za-z0-9 .()/-]{1,64}$/);
  });
});

describe('session limits', () => {
  it('are the ones docs/product/sessions.md states', () => {
    const rules = readFileSync(path.resolve(import.meta.dirname, '../../../../../docs/product/sessions.md'), 'utf8');
    expect(rules).toContain(`| Absolute expiry | ${String(SESSION_LIMITS.absoluteHours)} hours from sign-in |`);
    expect(rules).toContain(`| Idle expiry on PHI screens | ${String(SESSION_LIMITS.idleMinutes)} minutes without activity |`);
  });

  it('are the ones the database holds (migration 20261015170000)', () => {
    const migration = readFileSync(path.resolve(import.meta.dirname, '../../../../../packages/db/migrations/20261015170000_identity_and_permissions.sql'), 'utf8');
    expect(migration).toContain(`interval '${String(SESSION_LIMITS.absoluteHours)} hours'`);
    expect(migration).toContain(`interval '${String(SESSION_LIMITS.idleMinutes)} minutes'`);
  });
});
