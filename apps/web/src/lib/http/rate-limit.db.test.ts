import { randomBytes, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, createMigratedDatabase, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { signInWithPassword } from '../routes/sign-in';
import { type Services, createServices } from '../server/services';
import { RATE_LIMITS, rateSubjectHash, takeRateLimit } from './rate-limit';
import type { CookieJar } from './route';

/**
 * Rate limits in Postgres (milestone 11: "rate limits per user and per IP on sign-in, MFA, uploads, exports and
 * mutations, stored in Postgres"; docs/adr/0053): the count is the database's, so every web task shares it; a
 * refused attempt still counts; the window ends when it says; subjects are kept only as keyed hashes.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
/** Two web servers: two pools on the same database. */
let serverA: DatabasePool;
let serverB: DatabasePool;
const sealer = new Sealer(randomBytes(32));

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  serverA = openPool(database.appUrl, 2);
  serverB = openPool(database.appUrl, 2);
}, 60_000);

afterAll(async () => {
  await endPool(serverA);
  await endPool(serverB);
  await owner.end();
  await database.drop();
});

class Jar implements CookieJar {
  private readonly values = new Map<string, string>();
  get(name: string) {
    return this.values.get(name);
  }
  set(name: string, value: string) {
    this.values.set(name, value);
  }
  delete(name: string) {
    this.values.delete(name);
  }
}

describe('rate_limit_take', () => {
  it('shares one count across every server, and keeps refusing past the limit until the window ends', async () => {
    const subjects = { address: '203.0.113.7' };
    const limit = RATE_LIMITS.public_form.address?.hits ?? 0;
    const verdicts = [];
    for (let attempt = 0; attempt < limit + 2; attempt += 1) {
      verdicts.push(await takeRateLimit(attempt % 2 === 0 ? serverA : serverB, sealer, 'public_form', subjects));
    }
    expect(verdicts.slice(0, limit).every((verdict) => verdict.allowed)).toBe(true);
    for (const refused of verdicts.slice(limit)) {
      expect(refused.allowed).toBe(false);
      if (!refused.allowed) {
        expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
        expect(refused.retryAfterSeconds).toBeLessThanOrEqual(3600);
      }
    }
    // The refused attempts counted too: one window's row holds every hit.
    const subject = rateSubjectHash(sealer, 'public_form', 'address', subjects.address);
    const { rows } = await owner.query<{ hits: number }>("SELECT hits FROM rate_limit_counter WHERE bucket = 'public_form' AND subject = $1", [subject]);
    expect(rows).toEqual([{ hits: limit + 2 }]);
    // Another address has its own count.
    expect((await takeRateLimit(serverB, sealer, 'public_form', { address: '203.0.113.8' })).allowed).toBe(true);
  });

  it('starts a new window when the old one ends, and forgets the ended one', async () => {
    const client = await serverA.connect();
    try {
      const subject = 'a'.repeat(64);
      const take = async () => (await client.query<{ allowed: boolean; hits: number }>("SELECT allowed, hits FROM rate_limit_take('export', $1, 1, 1)", [subject])).rows[0];
      expect(await take()).toEqual({ allowed: true, hits: 1 });
      // Within the same one-second window a second hit is refused; in the next one it is the first again.
      let second = await take();
      if (second?.allowed === true) {
        // The first hit fell at the very end of its second: the next one is the second hit of the new window.
        second = await take();
      }
      expect(second).toEqual({ allowed: false, hits: 2 });
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(await take()).toEqual({ allowed: true, hits: 1 });
      const windows = await owner.query("SELECT 1 FROM rate_limit_counter WHERE bucket = 'export' AND subject = $1", [subject]);
      expect(windows.rows).toHaveLength(1);
    } finally {
      client.release();
    }
  });

  it('keeps no address, email or user ID in clear, and refuses a malformed limit', async () => {
    await takeRateLimit(serverA, sealer, 'sign_in', { address: '192.0.2.10', account: 'someone@synthetic.test' });
    const { rows } = await owner.query<{ subject: string }>("SELECT subject FROM rate_limit_counter WHERE bucket = 'sign_in'");
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.subject).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(JSON.stringify(rows)).not.toContain('192.0.2.10');
    const client = await serverA.connect();
    try {
      await expect(client.query("SELECT * FROM rate_limit_take('export', $1, 0, 60)", ['b'.repeat(64)])).rejects.toMatchObject({ code: '23514' });
      await expect(client.query("SELECT * FROM rate_limit_take('export', $1, 1, 172800)", ['b'.repeat(64)])).rejects.toMatchObject({ code: '23514' });
      // The application role reads and writes the counters only through the function.
      await expect(client.query('SELECT * FROM rate_limit_counter')).rejects.toMatchObject({ code: '42501' });
    } finally {
      client.release();
    }
    // Nothing to count against: allowed without a query.
    expect(await takeRateLimit(serverA, sealer, 'sign_in', {})).toEqual({ allowed: true });
  });
});

describe('a rate-limited sign-in', () => {
  it('refuses the step past the account’s limit with the seconds to wait', async () => {
    const store = new MemoryDevStore();
    const services: Services = createServices({
      origin: 'http://localhost:3100',
      pool: serverA,
      provider: new DevAuthProvider({
        store,
        sealer: sealer.derive('dev-provider'),
        webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
        deliverInvitation: () => Promise.resolve(),
        scryptCost: { n: 1024, r: 8, p: 1 },
      }),
      keys: LocalKeyProvider.random(),
      sealer,
      logger: createLogger({ sink: () => undefined }),
    });
    await createUser(owner);
    const email = `burst-${randomUUID()}@synthetic.test`;
    const limit = RATE_LIMITS.sign_in.account?.hits ?? 0;
    const statuses: string[] = [];
    for (let attempt = 0; attempt <= limit; attempt += 1) {
      const outcome = await signInWithPassword.invoke({ cookies: new Jar(), params: {}, input: { email, password: 'Wrong-Password-2026!' }, requestId: `test-${randomUUID()}`, userAgent: null }, services);
      statuses.push(outcome.status);
      if (outcome.status === 'rate_limited') {
        expect(outcome.retryAfterSeconds).toBeGreaterThan(0);
      }
    }
    expect(statuses.slice(0, limit).every((status) => status === 'ok')).toBe(true);
    expect(statuses.at(-1)).toBe('rate_limited');
  });
});
