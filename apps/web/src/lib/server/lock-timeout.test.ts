import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { CONNECTION_TIMEOUT_MS } from '@tp/db/runtime';
import { createLogger } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import { PgBossQueue, producerOptions } from '../uploads/queue';
import { WEB_LOCK_TIMEOUT_MS, lockTimeoutParameter } from './lock-timeout';
import { WEB_POOL_CONNECTIONS } from './pools';

/**
 * CAS-57's guards (docs/adr/0092, the amendment of 2026-11-11). Every transaction the routes' wrapper opens for a
 * signed-in request carries the bound on its lock waits, which the scope sets as the transaction's first statement, so
 * no handler can leave it out; a signed-in request's work runs on that transaction, so every place the web's code
 * reaches the application pool itself is counted here by its file; and the queue producer's pool, whose sends a
 * handler makes while its transaction is open, carries the same timeout. These read source text and options; that the
 * setting reaches the server, and what a request then answers, are the database tests' (lock-timeout.db.test.ts and
 * CAS-57 in routes/reconciliation-routes.db.test.ts; the scope's own statements, packages/db scope.test.ts).
 */

const SRC = path.resolve(import.meta.dirname, '../..');
const TEST_FILE = /(\.test\.tsx?|\.spec\.ts)$|[/\\](test-support|route-tests|e2e)[/\\]/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(entry.name) && !TEST_FILE.test(file) ? [file] : [];
  });
}

/** A file's code without its comments' lines, so a comment's words are never counted. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
}

const SYNTHETIC_URL = 'postgres://synthetic_login:synthetic-words@db.synthetic.test:5432/synthetic';

describe('a signed-in request’s lock waits are bounded (CAS-57)', () => {
  it('waits three seconds for a lock, never the length of a reconcile pass', () => {
    expect(WEB_LOCK_TIMEOUT_MS).toBe(3_000);
  });

  it('carries the bound on every transaction the routes’ wrapper opens: each of a person’s, a practice’s and an organization’s routes, and a refused page’s frame', () => {
    const invoke = code(path.join(SRC, 'lib/http/invoke.ts'));
    expect(invoke).toContain('const BOUNDED = { lockTimeoutMs: WEB_LOCK_TIMEOUT_MS } as const;');
    // Every transaction opened on the application pool here, by the scope it opens.
    const opened = [...invoke.matchAll(/\b(withActor|withPracticeScope|withClient|withJobScope|withPublicSnapshot)\(services\.pool\b/g)].map((match) => String(match[1]));
    expect(opened).toEqual(['withActor', 'withActor', 'withPracticeScope', 'withActor']);
    // And each carries the bound: as the practice scope's request, or as a person's scope's last argument.
    expect([...invoke.matchAll(/withPracticeScope\(services\.pool, \{[^\n]*\.\.\.BOUNDED \}/g)]).toHaveLength(1);
    expect([...invoke.matchAll(/withActor\(services\.pool,[^\n]*, BOUNDED\)/g)]).toHaveLength(1);
    expect([...invoke.matchAll(/^ {8}\}, BOUNDED\);$/gm)]).toHaveLength(2);
    expect([...invoke.matchAll(/\bBOUNDED\b/g)]).toHaveLength(1 + opened.length);
  });

  it('runs a signed-in request’s work on that transaction: every place the web’s code reaches the application pool itself is one of these, by file and count', () => {
    // The application pool is the services' `pool`; billing's, the e-signature vendor's and the model gateway's are
    // other logins with pools of their own, which no request's own records are written on.
    const reached = /\b(?:services(?:\(\))?|deps)\.pool\b|\{[^}\n]*\bpool\b[^}\n]*\}\s*=\s*(?:this\.)?(?:services|deps)\b/g;
    const found = Object.fromEntries(
      sources(SRC)
        .map((file) => [path.relative(SRC, file).split(path.sep).join('/'), [...code(file).matchAll(reached)].length] as const)
        .filter(([, count]) => count > 0),
    );
    expect(found).toEqual({
      // Sign-in: it commits in steps (a failed attempt's count, a session after the provider's grant), and none may be given up.
      'lib/auth/sign-in.ts': 5,
      // The wrapper: the four transactions above, bounded, and before them the session's read and the rate limit's
      // count, which are not (a session's end and its audit event are two steps).
      'lib/http/invoke.ts': 6,
      // The public forms, pages and webhooks, which open no scope.
      'lib/routes/onboarding.ts': 1,
      'lib/routes/support.ts': 3,
      'lib/screening/routes.ts': 12,
    });
  });
});

describe('the queue producer’s pool carries the same timeout (CAS-57)', () => {
  it('as pg’s own setting, beside what makes pg-boss a producer only', () => {
    expect(producerOptions(SYNTHETIC_URL)).toEqual({
      connectionString: SYNTHETIC_URL,
      supervise: false,
      schedule: false,
      migrate: false,
      max: WEB_POOL_CONNECTIONS.queue,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      lock_timeout: WEB_LOCK_TIMEOUT_MS,
    });
    expect(lockTimeoutParameter(SYNTHETIC_URL)).toEqual({ lock_timeout: 3_000 });
  });

  it('keeps a URL’s own options, which cannot replace it: a production login’s role, or another setting whose name holds the words', () => {
    for (const query of ['?sslmode=verify-full&options=-c%20role%3Dtp_queue', '?options=-c%20deadlock_timeout%3D2s', '?options=-c%20lock_timeout%3D0']) {
      expect(producerOptions(`${SYNTHETIC_URL}${query}`)).toMatchObject({ lock_timeout: WEB_LOCK_TIMEOUT_MS });
    }
  });

  it('refuses a URL that names lock_timeout (pg lets a URL’s query replace the pool’s own setting), as the queue is made and in words that never hold the URL', () => {
    for (const query of ['?lock_timeout=0', '?sslmode=verify-full&lock_timeout=60000', '?lock%5Ftimeout=0']) {
      let message = '';
      try {
        lockTimeoutParameter(`${SYNTHETIC_URL}${query}`);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toBe('the database URL sets lock_timeout itself, which would replace the pool’s own: take it out of the URL');
      // The server's start stops, not a person's first request that queues.
      expect(() => new PgBossQueue(`${SYNTHETIC_URL}${query}`, createLogger())).toThrow('sets lock_timeout itself');
    }
    expect(() => new PgBossQueue(SYNTHETIC_URL, createLogger())).not.toThrow();
  });

  it('refuses a URL it cannot read, without repeating it', () => {
    let message = '';
    try {
      lockTimeoutParameter('synthetic-words not a url');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('the database URL could not be read to check that it sets no lock_timeout');
    expect(message).not.toContain('synthetic-words');
  });
});
