import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * The password policy (PRD 16, Authentication: "password policy"; the user pool enforces the same in
 * infra/lib/constructs/identity.ts): at least twelve characters with a lowercase letter, an uppercase
 * letter, a digit and a symbol. The local provider hashes with scrypt (memory-hard; parameters kept
 * in the hash so they can rise later); Cognito keeps its own.
 */

export const PASSWORD_MIN_LENGTH = 12;

const RULES: readonly { readonly test: RegExp; readonly problem: string }[] = [
  { test: /[a-z]/, problem: 'a lowercase letter' },
  { test: /[A-Z]/, problem: 'an uppercase letter' },
  { test: /[0-9]/, problem: 'a digit' },
  { test: /[^A-Za-z0-9]/, problem: 'a symbol' },
];

/** What the password lacks, in words; empty when it meets the policy. */
export function passwordProblems(password: string): string[] {
  const problems = password.length < PASSWORD_MIN_LENGTH ? [`at least ${String(PASSWORD_MIN_LENGTH)} characters`] : [];
  return [...problems, ...RULES.filter((rule) => !rule.test.test(password)).map((rule) => rule.problem)];
}

export interface ScryptCost {
  /** CPU and memory cost (a power of two). */
  readonly n: number;
  readonly r: number;
  readonly p: number;
}

/** OWASP's minimum for scrypt: N = 2^17, r = 8, p = 1. */
export const DEFAULT_SCRYPT_COST: ScryptCost = { n: 2 ** 17, r: 8, p: 1 };

const KEY_BYTES = 32;

function derive(password: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_BYTES, { N: cost.n, r: cost.r, p: cost.p, maxmem: 256 * cost.n * cost.r + 1024 * 1024 }, (error, key) => {
      if (error === null) {
        resolve(key);
      } else {
        reject(error);
      }
    });
  });
}

/** `scrypt:v1:<N>:<r>:<p>:<salt>:<hash>`, base64url. */
export async function hashPassword(password: string, cost: ScryptCost = DEFAULT_SCRYPT_COST): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, cost);
  return ['scrypt', 'v1', String(cost.n), String(cost.r), String(cost.p), salt.toString('base64url'), key.toString('base64url')].join(':');
}

const HASH = /^scrypt:v1:(\d+):(\d+):(\d+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/;

/** Whether the password matches the stored hash; a malformed hash matches nothing. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = HASH.exec(stored);
  if (match === null) {
    return false;
  }
  const [, n, r, p, salt, hash] = match as unknown as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(password, Buffer.from(salt, 'base64url'), { n: Number.parseInt(n, 10), r: Number.parseInt(r, 10), p: Number.parseInt(p, 10) });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
