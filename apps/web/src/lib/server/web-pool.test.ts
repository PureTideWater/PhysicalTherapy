import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_LOCK_TIMEOUT_MS } from './web-pool';

/**
 * CAS-57's guard (docs/adr/0092, the amendment of 2026-11-11): the web's request pools are opened by openWebPool, which
 * sets the lock_timeout on every connection, and by nothing else. A pool opened another way in the web's own code (a
 * path that bypasses the timeout) fails here by its file's name. The one exception is the model gateway's pool, opened
 * once in services.ts on purpose (its waits are the gateway's own design, and no request's mutation runs on it).
 */

const SRC = path.resolve(import.meta.dirname, '../..');
const TEST_FILE = /(\.test\.tsx?|\.spec\.ts)$|[/\\](test-support|route-tests|e2e)[/\\]/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(entry.name) && !TEST_FILE.test(file) ? [file] : [];
  });
}

/** Every way the web's code could open a database connection of its own: a pool, or a single client. */
const OPENERS = /\bopenPool\s*\(|\bnew\s+(pg\.)?(Pool|Client)\s*\(|\bdatabaseClient\s*\(/g;

describe('the web’s request pools carry the lock_timeout (CAS-57)', () => {
  it('waits three seconds for a lock, never the length of a reconcile pass', () => {
    expect(WEB_LOCK_TIMEOUT_MS).toBe(3_000);
  });

  it('opens a database connection only through openWebPool, and the model gateway’s pool once in services.ts', () => {
    const found = sources(SRC).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return [...text.matchAll(OPENERS)].map((match) => `${path.relative(SRC, file).split(path.sep).join('/')}: ${text.slice(match.index, text.indexOf('\n', match.index)).trim()}`);
    });
    expect(found.sort()).toEqual([
      'lib/server/services.ts: openPool(config.databaseUrl, WEB_POOL_CONNECTIONS.model),',
      'lib/server/web-pool.ts: openPool(url, max, { lockTimeoutMs: WEB_LOCK_TIMEOUT_MS });',
    ]);
  });

  it('opens the application’s, billing’s and the e-signature vendor’s pools through it', () => {
    const services = readFileSync(path.join(SRC, 'lib/server/services.ts'), 'utf8');
    expect([...services.matchAll(/openWebPool\(config\.(\w+), WEB_POOL_CONNECTIONS\.(\w+)\)/g)].map((match) => `${String(match[1])} ${String(match[2])}`)).toEqual([
      'databaseUrl application',
      'billingDatabaseUrl billing',
      'esignDatabaseUrl esign',
    ]);
  });
});
