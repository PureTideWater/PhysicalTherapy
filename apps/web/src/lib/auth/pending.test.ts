import { describe, expect, it } from 'vitest';

import type { CookieJar } from '../http/route';
import { clearPending, clearSignIn, readKeptEmail, readPending, stepClosesAt, stepMetaOf, writeKeptEmail, writePending } from './pending';
import { Sealer } from './seal';
import { KEPT_EMAIL_COOKIE, SIGN_IN_COOKIE } from './sessions';
import type { Pending } from './sign-in';

/** The pending step's deadline and the kept email's cookie (docs/adr/0081), on an in-memory jar. */

const EMAIL = 'pat.example@synthetic.test';
const T0 = Date.parse('2026-11-01T12:00:00Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000);
const MFA: Pending = { step: 'mfa', email: EMAIL, challenge: 'challenge-1' };

/** A cookie jar that records each write, its Max-Age and each delete. */
class Jar implements CookieJar {
  readonly values = new Map<string, string>();
  readonly writes: { name: string; maxAgeSeconds: number | undefined }[] = [];
  readonly deletes: string[] = [];
  get(name: string): string | undefined {
    return this.values.get(name);
  }
  set(name: string, value: string, options?: { readonly maxAgeSeconds?: number }): void {
    this.values.set(name, value);
    this.writes.push({ name, maxAgeSeconds: options?.maxAgeSeconds });
  }
  delete(name: string): void {
    this.values.delete(name);
    this.deletes.push(name);
  }
}

const sealer = new Sealer(Buffer.alloc(32, 7));

describe('the pending step', () => {
  it('SGN-01: counts the seal and the Max-Age from the step’s start, so a rewrite extends nothing', () => {
    const jar = new Jar();
    writePending(jar, sealer, MFA, { startedAt: T0 }, at(100));
    expect(jar.writes).toEqual([{ name: SIGN_IN_COOKIE, maxAgeSeconds: 200 }]);
    expect(readPending(jar, sealer, at(299))).toEqual({ ...MFA, startedAt: T0 });
    expect(readPending(jar, sealer, at(300))).toBeUndefined();
    // Key registration's cookie lasts fifteen minutes from its start.
    writePending(jar, sealer, { step: 'register_key', email: EMAIL, userId: 'user-1', grant: 'grant-1' }, { startedAt: T0 }, at(60));
    expect(jar.writes.at(-1)).toEqual({ name: SIGN_IN_COOKIE, maxAgeSeconds: 840 });
  });

  it('SGN-01: seals the meta it is given, never meta a spread carried along on the step', () => {
    const jar = new Jar();
    const carried = { ...MFA, startedAt: T0 - 60_000, passwordSaved: true as const };
    writePending(jar, sealer, carried, { startedAt: T0, setup: { at: 2, of: 3 } }, at(0));
    expect(readPending(jar, sealer, at(1))).toEqual({ ...MFA, startedAt: T0, setup: { at: 2, of: 3 } });
  });

  it('SGN-17: the attempt’s start is the flow’s own value: it is sealed with the step and no rewrite or meta changes it (docs/adr/0093, D3)', () => {
    const jar = new Jar();
    const began = T0 - 1234;
    writePending(jar, sealer, { ...MFA, began }, { startedAt: T0 }, at(0));
    expect(readPending(jar, sealer, at(1))).toEqual({ ...MFA, began, startedAt: T0 });
    // A rewrite of the step with other meta keeps the start; meta never carries one.
    const read = readPending(jar, sealer, at(1));
    if (read === undefined) {
      throw new Error('expected the step');
    }
    writePending(jar, sealer, read, { ...stepMetaOf(read), setup: { at: 1, of: 2 } }, at(2));
    expect(readPending(jar, sealer, at(3))).toEqual({ ...MFA, began, startedAt: T0, setup: { at: 1, of: 2 } });
    expect(stepMetaOf({ ...MFA, began, startedAt: T0 })).toEqual({ startedAt: T0 });
    // A step sealed by the release before reads with none.
    writePending(jar, sealer, MFA, { startedAt: T0 }, at(4));
    expect(readPending(jar, sealer, at(5))).not.toHaveProperty('began');
  });

  it('SGN-01: reads a value sealed by the release before as a step with no stamp, which has no deadline', () => {
    const jar = new Jar();
    jar.set(SIGN_IN_COOKIE, sealer.seal('sign-in-pending', MFA, at(300)));
    const read = readPending(jar, sealer, at(10));
    expect(read).toEqual(MFA);
    expect(read?.startedAt).toBeUndefined();
    expect(read === undefined ? 'none' : stepClosesAt(read)).toBeUndefined();
    expect(stepClosesAt({ ...MFA, startedAt: T0 })).toBe(T0 + 180_000);
    expect(stepClosesAt({ step: 'register_key', email: EMAIL, userId: 'user-1', grant: 'grant-1', startedAt: T0 })).toBe(T0 + 900_000);
    // With no stamp, a rewrite counts from now, as before.
    writePending(jar, sealer, MFA, {}, at(10));
    expect(jar.writes.at(-1)).toEqual({ name: SIGN_IN_COOKIE, maxAgeSeconds: 300 });
  });
});

describe('the kept email', () => {
  it('SGN-03: is sealed under its own purpose, lasts fifteen minutes past the step, and reads back only when whole', () => {
    const jar = new Jar();
    writeKeptEmail(jar, sealer, { email: EMAIL, use: 'chosen' }, 'mfa_setup', T0, at(0));
    expect(jar.writes).toEqual([{ name: KEPT_EMAIL_COOKIE, maxAgeSeconds: 1080 }]);
    const value = jar.get(KEPT_EMAIL_COOKIE) ?? '';
    // Sealed, not signed: neither the address, nor its local part, nor its base64url is in the value.
    for (const text of [EMAIL, 'pat.example', Buffer.from(EMAIL).toString('base64url'), Buffer.from('pat.example').toString('base64url')]) {
      expect(value).not.toContain(text);
    }
    expect(readKeptEmail(jar, sealer, at(1079))).toEqual({ email: EMAIL, use: 'chosen' });
    expect(readKeptEmail(jar, sealer, at(1080))).toBeUndefined();
    // Its purpose is its own: it does not open as a pending step, nor a pending step as a kept email.
    expect(sealer.open('sign-in-pending', value, at(1))).toBeUndefined();
    const other = new Jar();
    writePending(other, sealer, MFA, { startedAt: T0 }, at(0));
    other.set(KEPT_EMAIL_COOKIE, other.get(SIGN_IN_COOKIE) ?? '');
    expect(readKeptEmail(other, sealer, at(1))).toBeUndefined();
    // Key registration's: thirty minutes from its start; written later, the Max-Age is what is left.
    writeKeptEmail(jar, sealer, { email: EMAIL }, 'register_key', T0, at(100));
    expect(jar.writes.at(-1)).toEqual({ name: KEPT_EMAIL_COOKIE, maxAgeSeconds: 1700 });
    expect(readKeptEmail(jar, sealer, at(101))).toEqual({ email: EMAIL });
  });

  it('SGN-03: reads nothing for a tampered value, one that is not an address, or a password it does not know', () => {
    const jar = new Jar();
    writeKeptEmail(jar, sealer, { email: EMAIL, use: 'temporary' }, 'new_password', T0, at(0));
    const value = jar.get(KEPT_EMAIL_COOKIE) ?? '';
    jar.set(KEPT_EMAIL_COOKIE, `${value.slice(0, -2)}${value.endsWith('AA') ? 'BB' : 'AA'}`);
    expect(readKeptEmail(jar, sealer, at(1))).toBeUndefined();
    for (const payload of [{ email: 'not an address' }, { email: 42 }, { email: EMAIL, use: 'other' }, 'text', null]) {
      jar.set(KEPT_EMAIL_COOKIE, sealer.seal('sign-in-email', payload, at(600)));
      expect(readKeptEmail(jar, sealer, at(1))).toBeUndefined();
    }
    jar.set(KEPT_EMAIL_COOKIE, 'v1.not-sealed');
    expect(readKeptEmail(jar, sealer, at(1))).toBeUndefined();
    expect(readKeptEmail(new Jar(), sealer, at(1))).toBeUndefined();
  });

  it('SGN-03: ends with the attempt (clearSignIn), and outlives an expiry (clearPending)', () => {
    const jar = new Jar();
    clearPending(jar);
    expect(jar.deletes).toEqual([SIGN_IN_COOKIE]);
    clearSignIn(jar);
    expect(jar.deletes).toEqual([SIGN_IN_COOKIE, SIGN_IN_COOKIE, KEPT_EMAIL_COOKIE]);
  });
});
