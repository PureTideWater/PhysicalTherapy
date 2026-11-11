import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { CONNECTION_TIMEOUT_MS } from '@tp/db/runtime';
import { describe, expect, it } from 'vitest';

import { producerOptions } from '../uploads/queue';
import { WEB_POOL_CONNECTIONS } from './pools';
import { WEB_LOCK_TIMEOUT_MS } from './web-pool';

/**
 * CAS-57's guard (docs/adr/0092, the amendment of 2026-11-11): every database connection the web's own code opens
 * carries the lock_timeout. The request pools are opened by openWebPool, and the queue producer's pool by pg-boss from
 * producerOptions, which sets it too. A connection opened another way (a path that bypasses the timeout) fails here by
 * its file's name. Two are excepted, by name: the model gateway's pool, opened once in services.ts on purpose (a call's
 * record must wait for its lock, never be given up), and the synthetic seed, a command a developer runs, never a
 * request. The scan reads source text; that the setting reaches the server is the database tests' (web-pool.db.test.ts
 * and CAS-57 in reconciliation-routes.db.test.ts).
 */

const WEB = path.resolve(import.meta.dirname, '../../..');
/** Where the web's own code is: the app and its commands. Its end-to-end tests and its build output are not code a request runs. */
const SCANNED = ['src', 'scripts'];
const TEST_FILE = /(\.test\.tsx?|\.spec\.ts)$|[/\\](test-support|route-tests|e2e)[/\\]/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(entry.name) && !TEST_FILE.test(file) ? [file] : [];
  });
}

/** Every way the web's code could open a database connection of its own: a pool, a single client, or pg-boss's pool. */
const OPENERS = /\bopenPool\s*\(|\bnew\s+(pg\.)?(Pool|Client)\s*\(|\bdatabaseClient\s*\(|\bnew\s+PgBoss\s*\(/g;

const SYNTHETIC_URL = 'postgres://synthetic_login:synthetic-words@db.synthetic.test:5432/synthetic';

describe('the web’s database connections carry the lock_timeout (CAS-57)', () => {
  it('waits three seconds for a lock, never the length of a reconcile pass', () => {
    expect(WEB_LOCK_TIMEOUT_MS).toBe(3_000);
  });

  it('opens a connection only through openWebPool and the queue producer’s options; the model gateway’s pool and the synthetic seed are the two exceptions', () => {
    const found = SCANNED.flatMap((dir) => sources(path.join(WEB, dir))).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return [...text.matchAll(OPENERS)].map((match) => `${path.relative(WEB, file).split(path.sep).join('/')}: ${text.slice(match.index, text.indexOf('\n', match.index)).trim()}`);
    });
    expect(found.sort()).toEqual([
      'scripts/seed.ts: databaseClient(options.databaseUrl);',
      'src/lib/server/services.ts: openPool(config.databaseUrl, WEB_POOL_CONNECTIONS.model),',
      'src/lib/server/web-pool.ts: openPool(url, max, { lockTimeoutMs: WEB_LOCK_TIMEOUT_MS });',
      'src/lib/uploads/queue.ts: new PgBoss(producerOptions(this.connectionString));',
    ]);
  });

  it('opens the application’s, billing’s and the e-signature vendor’s pools through it', () => {
    const services = readFileSync(path.join(WEB, 'src/lib/server/services.ts'), 'utf8');
    expect([...services.matchAll(/openWebPool\(config\.(\w+), WEB_POOL_CONNECTIONS\.(\w+)\)/g)].map((match) => `${String(match[1])} ${String(match[2])}`)).toEqual([
      'databaseUrl application',
      'billingDatabaseUrl billing',
      'esignDatabaseUrl esign',
    ]);
  });

  it('gives the queue producer’s pool the same timeout, as pg’s own setting beside what makes pg-boss a producer only', () => {
    expect(producerOptions(SYNTHETIC_URL)).toEqual({
      connectionString: SYNTHETIC_URL,
      supervise: false,
      schedule: false,
      migrate: false,
      max: WEB_POOL_CONNECTIONS.queue,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      lock_timeout: WEB_LOCK_TIMEOUT_MS,
    });
    // Never through `options`, which a production URL's own `options` (the login's role) would replace.
    expect('options' in producerOptions(SYNTHETIC_URL)).toBe(false);
    expect(producerOptions(`${SYNTHETIC_URL}?sslmode=verify-full&options=-c%20role%3Dtp_queue`)).toMatchObject({ lock_timeout: WEB_LOCK_TIMEOUT_MS });
  });

  it('refuses a URL that would replace the timeout, for a request pool and for the queue', () => {
    expect(() => producerOptions(`${SYNTHETIC_URL}?lock_timeout=0`)).toThrow('the database URL sets lock_timeout itself');
    expect(() => producerOptions(`${SYNTHETIC_URL}?options=-c%20lock_timeout%3D0`)).toThrow('the database URL sets lock_timeout itself');
  });
});
