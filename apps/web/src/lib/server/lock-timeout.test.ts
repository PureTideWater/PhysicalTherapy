import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { CONNECTION_TIMEOUT_MS } from '@tp/db/runtime';
import { createLogger } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import { PgBossQueue, producerOptions } from '../uploads/queue';
import { BOUND_LOCK_WAITS, WEB_LOCK_TIMEOUT_MS, lockTimeoutParameter } from './lock-timeout';
import { WEB_POOL_CONNECTIONS } from './pools';

/**
 * CAS-57's guards (docs/adr/0092, the amendment of 2026-11-11). Every transaction the routes' wrapper opens for a
 * signed-in request starts by bounding its lock waits, so no handler can forget to; a signed-in request's work runs on
 * that transaction, so a file that takes a connection of its own from a pool is named here; and the queue producer's
 * pool, whose sends a handler makes inside its transaction, carries the same timeout. These read source text and
 * options; that the setting reaches the server, and what a request then answers, are the database tests'
 * (lock-timeout.db.test.ts and CAS-57 in routes/reconciliation-routes.db.test.ts).
 */

const SRC = path.resolve(import.meta.dirname, '../..');
const TEST_FILE = /(\.test\.tsx?|\.spec\.ts)$|[/\\](test-support|route-tests|e2e)[/\\]/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(entry.name) && !TEST_FILE.test(file) ? [file] : [];
  });
}

const SYNTHETIC_URL = 'postgres://synthetic_login:synthetic-words@db.synthetic.test:5432/synthetic';

describe('a signed-in request’s lock waits are bounded (CAS-57)', () => {
  it('waits three seconds for a lock, never the length of a reconcile pass, in its own transaction only', () => {
    expect(WEB_LOCK_TIMEOUT_MS).toBe(3_000);
    // SET LOCAL ends with the transaction: a pooled connection never carries it to other work.
    expect(BOUND_LOCK_WAITS).toBe('SET LOCAL lock_timeout = 3000');
  });

  it('is set first in every transaction the routes’ wrapper opens: each starts with the gates, and the gates start with the bound', () => {
    const invoke = readFileSync(path.join(SRC, 'lib/http/invoke.ts'), 'utf8');
    // The wrapper's transactions: one for each kind of signed-in route (self and platform, practice, organization).
    const opened = [...invoke.matchAll(/const outcome = await (withActor|withPracticeScope)\(services\.pool,[^\n]*=> \{\n((?:\s*\/\/[^\n]*\n)*)\s*([^\n]*)\n/g)];
    expect(opened.map((match) => `${String(match[1])}: ${String(match[3]).slice(0, 24)}`)).toEqual(['withActor: await gates(scope, { ter', 'withPracticeScope: await gates(scope, { ter', 'withActor: await gates(scope, { ter']);
    // No other transaction of a route's own is opened in the wrapper.
    expect([...invoke.matchAll(/const outcome = await /g)]).toHaveLength(3);
    expect(invoke).toMatch(/async function gates\([^\n]*\): Promise<void> \{\n {2}await scope\.client\.query\(BOUND_LOCK_WAITS\);\n/);
  });

  it('runs a signed-in request’s work on that transaction: a file that takes a connection of its own from a pool is one of these, by name', () => {
    const takers = /\b(withPracticeScope|withActor|withClient|withJobScope)\(\s*[A-Za-z_.]*[pP]ool\b|[A-Za-z_.]*[pP]ool\.(connect|query)\(/;
    const found = sources(SRC)
      .filter((file) => takers.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'));
    expect(found.sort()).toEqual([
      // Sign-in and the session's read: they commit in steps (a session's end and its audit event, a failed attempt's count), and none may be given up.
      'lib/auth/sessions.ts',
      'lib/auth/sign-in.ts',
      // The wrapper itself (its transactions, bounded above), and the rate limit's count before them.
      'lib/http/invoke.ts',
      'lib/http/rate-limit.ts',
      // The model gateway's own pool: a call's limit and record.
      'lib/models/contract-proposals.ts',
      // The public forms, pages and webhooks, which open no scope.
      'lib/routes/onboarding.ts',
      'lib/routes/support.ts',
      'lib/screening/routes.ts',
      'lib/screening/validation.ts',
    ]);
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
