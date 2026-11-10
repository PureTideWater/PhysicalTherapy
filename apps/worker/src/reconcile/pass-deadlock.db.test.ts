import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { type DatabaseClient, appDevLoginUrl, databaseClient, openPool, readDatabaseUrl, withPracticeScope, workerDevLoginUrl } from '@tp/db';
import { endPool } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { reconcilePractice } from './pass';
import { type Middleware, type Pass, type SideResult, clone, compare, idsBefore, runSide, template } from './test-support/pass-compare';
import { referencePass } from './test-support/per-line';
import { type CrossingWorld, buildCrossingWorld } from './test-support/stage-world';

/**
 * CAS-49.6 (SUITE-CAP-3 D3; design sections 5.2 and 7; review rounds 1-3; docs/adr/0087): a person's reopen crossing the
 * pass's stage write. insertStages takes every event line's head row and then, at the statement's end, the cases it
 * touches (line_status_refresh_cases), where the web's reopen takes the case first (its UPDATE case_line refreshes the
 * case) and then the line's head (its INSERT line_status). In the fixed world (test-support/stage-world.ts) session B,
 * the reopen of the written-off line L of case C, runs its UPDATE and holds; the pass's stage write takes L's head and
 * waits on C; B's INSERT then waits on L's head: a deadlock, whose victim each test forces with deadlock_timeout set per
 * login on the test's clone.
 *
 * - The pass the victim: the savepoint retry re-issues the same statement once B has committed, and the pass's rows
 *   equal the reference interleaving's (the same pass from the same template with B's two statements committed from
 *   session B just before the per-line reference's first stage insert, where the pass holds neither C nor L's head, so
 *   B waits on nothing: its lock_timeout fails the test if it does). The pass read L as written off before B, so it
 *   never searches L, though a claim waits that would pair with it.
 * - B the victim: B gets 40P01, its transaction rolls back, and the pass's rows equal the pass's alone.
 * - The pass the victim with its retry not held (as in the product): the rollback to the savepoint wakes B's INSERT, so
 *   the retry waits on B and meets no second deadlock, and every line's own events and head row equal the reference
 *   interleaving's; only B's row's place in the global seq order among the pass's other lines' rows may differ, which
 *   no reader compares (section 5.2).
 *
 * Session B begins at the hook in every interleaving (its UPDATE and INSERT both run there), so it holds nothing while
 * the pass reads; its statements are the web's own, held to their source by the first test.
 *
 * line_status and line_status_head are compared by their seq order, never their seq values (review round 3): a statement
 * rolled back keeps the values it drew. Every other row as CAS-49.1 compares it, encrypted text by its decrypted hash.
 * No identifier is logged; synthetic data only.
 */

const adminUrl = readDatabaseUrl();
const shipped: Pass = (context, services, practiceId) => reconcilePractice(context, services, practiceId);
const reference: Pass = (context, services, practiceId) => referencePass(context, services, practiceId);
/** A stage write: the per-line reference's one-row inserts, or the shipped pass's one statement. */
const STAGE_EVENTS = /^\s*INSERT INTO line_status\b/;
const REOPEN_REASON = 'SYNTHETIC reopen: the payer asked for it again';

/**
 * Session B's three statements, copied from the web's reopen (reopenLineAction, apps/web/src/lib/routes/triage.ts, and
 * currentStage, apps/web/src/lib/triage/queries.ts), whose audit row B leaves out (it takes no lock the crossing needs).
 * The worker cannot import the web; the first test below holds each copy to its source, word for word.
 */
const REOPEN_STATEMENTS = {
  update: 'UPDATE case_line SET written_off_reason = NULL, written_off_text = NULL, written_off_by = NULL, reopen_reason = $3, reopened_by = app_actor_id() WHERE id = $1 AND practice_id = $2',
  stage: 'SELECT stage FROM line_status WHERE service_line_id = $1 ORDER BY seq DESC LIMIT 1',
  insert: 'INSERT INTO line_status (practice_id, service_line_id, stage, set_by, reason, reopened_from) VALUES ($1, $2, $3, app_actor_id(), $4, $3)',
} as const;
const REOPEN_SOURCES = { update: '../../../web/src/lib/routes/triage.ts', stage: '../../../web/src/lib/triage/queries.ts', insert: '../../../web/src/lib/routes/triage.ts' } as const;

let crossing: CrossingWorld;
let database: { readonly name: string; readonly url: string };
let before: Map<string, Set<string>>;
const clones: { drop: () => Promise<void> }[] = [];

beforeAll(async () => {
  crossing = await buildCrossingWorld(adminUrl);
  database = await template(crossing);
  before = await idsBefore(database.url, crossing.practice.practiceId);
}, 600_000);

afterAll(async () => {
  for (const copy of clones) {
    await copy.drop();
  }
  await crossing.world.triage.pricing.database.drop();
});

/** A clone of the world, with each login's deadlock_timeout set in it (the victim is the side whose timeout fires first). */
async function cloneWith(timeouts: { readonly pass: string; readonly reopen: string } | null): Promise<{ readonly name: string; readonly url: string }> {
  const copy = await clone(adminUrl, database);
  clones.push(copy);
  if (timeouts !== null) {
    const admin = databaseClient(copy.url);
    await admin.connect();
    try {
      // Role names from the logins' own URLs; the database's name is the clone's generated one; neither is input.
      for (const [url, timeout] of [
        [workerDevLoginUrl(copy.url), timeouts.pass],
        [appDevLoginUrl(copy.url), timeouts.reopen],
      ] as const) {
        await admin.query(`ALTER ROLE ${new URL(url).username} IN DATABASE ${copy.name} SET deadlock_timeout = '${timeout}'`);
      }
    } finally {
      await admin.end();
    }
  }
  return copy;
}

/**
 * Session B: the Triage page's reopen of L (reopenLineAction's two statements), started only when told to begin (at the
 * hook, so B holds nothing of C or L while the pass runs up to its stage write) and held between its statements until
 * told to go on.
 */
interface Reopen {
  /** Opens B's transaction and runs its UPDATE case_line. */
  readonly begin: () => void;
  /** Settles once its UPDATE case_line (and so the case refresh) has run. */
  readonly updated: Promise<void>;
  /** Lets it go on to its INSERT line_status. */
  readonly go: () => void;
  /** Settles when its transaction commits, or rejects with its error (rolled back). */
  readonly done: Promise<void>;
}

function reopen(url: string, lockTimeout: string): Reopen {
  const { practice, reopened } = crossing;
  const pool = openPool(appDevLoginUrl(url), 1);
  let markUpdated: () => void = () => undefined;
  let go: () => void = () => undefined;
  let begin: () => void = () => undefined;
  const updated = new Promise<void>((resolve) => (markUpdated = resolve));
  const proceed = new Promise<void>((resolve) => (go = resolve));
  const started = new Promise<void>((resolve) => (begin = resolve));
  const done = started
    .then(() =>
      withPracticeScope(pool, { actorId: practice.manager, practiceIds: [practice.practiceId] }, async (scope) => {
        // A fixed setting, never input: how long B may wait on a lock before the test fails.
        await scope.client.query(`SET LOCAL lock_timeout = '${lockTimeout}'`);
        await scope.client.query(REOPEN_STATEMENTS.update, [reopened.caseLineId, practice.practiceId, practice.cipher.encrypt('case_line.reopen_reason', REOPEN_REASON)]);
        markUpdated();
        await proceed;
        const { rows } = await scope.client.query<{ stage: string }>(REOPEN_STATEMENTS.stage, [reopened.serviceLineId]);
        await scope.client.query(REOPEN_STATEMENTS.insert, [practice.practiceId, reopened.serviceLineId, rows[0]?.stage, practice.cipher.encrypt('line_status.reason', REOPEN_REASON)]);
      }),
    )
    .finally(() => endPool(pool));
  // Observed by the test; an unobserved rejection must not end the run first.
  done.catch(() => undefined);
  return { begin, updated, go, done };
}

const codeOf = (error: unknown) => (typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'none');

/** Waits until the pass's stage write is waiting on a lock (on C), read from pg_stat_activity as the superuser. */
async function passWaiting(url: string): Promise<void> {
  const admin: DatabaseClient = databaseClient(url);
  await admin.connect();
  try {
    const login = new URL(workerDevLoginUrl(url)).username;
    for (let tries = 0; tries < 1_500; tries += 1) {
      const { rows } = await admin.query<{ waiting: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND usename = $1 AND wait_event_type = 'Lock' AND query ~ '^\\s*INSERT INTO line_status') AS waiting",
        [login],
      );
      if (rows[0]?.waiting === true) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('the pass’s stage write never waited on the case');
  } finally {
    await admin.end();
  }
}

/** What the crossing saw of the pass's stage write. */
interface Seen {
  attempts: number;
  readonly failures: string[];
}

/**
 * The crossing, at the pass's first stage write: B begins and runs its UPDATE first (B holds C), then the pass's
 * statement (it takes the heads and waits on C), then, once it waits, B's INSERT (it waits on L's head). With `hold`, a
 * later attempt (the savepoint's retry) goes on only once B has settled, so B's event stands ahead of every retried row
 * as in the reference; without it the retry goes on at once, as in the product, and races B's INSERT (which the
 * rollback to the savepoint has already woken) only for the global seq order of B's row among the pass's other lines'.
 */
function crossAt(b: Reopen, url: string, seen: Seen, hold = true): Middleware {
  return (next) => async (text, values) => {
    if (!STAGE_EVENTS.test(text)) {
      return next(text, values);
    }
    seen.attempts += 1;
    if (seen.attempts > 1) {
      if (hold) {
        await b.done.catch(() => undefined);
      }
      return next(text, values);
    }
    b.begin();
    await Promise.race([b.updated, b.done]);
    const pending = next(text, values);
    pending.catch(() => undefined);
    await passWaiting(url);
    b.go();
    try {
      return await pending;
    } catch (error) {
      seen.failures.push(codeOf(error));
      throw error;
    }
  };
}

/** The reference interleaving: B's two statements committed before the per-line reference's first stage insert. */
function reopenFirst(b: Reopen): Middleware {
  let first = true;
  return (next) => async (text, values) => {
    if (first && STAGE_EVENTS.test(text)) {
      first = false;
      b.begin();
      await Promise.race([b.updated, b.done]);
      b.go();
      await b.done;
    }
    return next(text, values);
  };
}

async function side(name: string, pass: Pass, url: string, middleware?: Middleware): Promise<SideResult> {
  return runSide(name, url, crossing, randomUUID(), pass, middleware === undefined ? {} : { middleware });
}

/**
 * Each line's new events after the pass, from a side's rows, in seq order: who set each (B the manager, the pass no
 * one), its stage and the stage it moved back from; and each line's head row's stage. The order readers use (a line's
 * own events by seq, or its head), not the global seq order across lines.
 */
function eventsByLine(result: SideResult): Map<string, string[]> {
  const { practice } = crossing;
  const lines = new Map<string, string[]>();
  const written = (result.after.get('line_status') ?? []).filter((event) => !(before.get('line_status')?.has(String(event.id)) ?? false));
  for (const row of written.sort((a, b) => Number(BigInt(String(a.seq)) - BigInt(String(b.seq))))) {
    const line = String(row.service_line_id);
    const who = row.set_by === practice.manager ? 'reopen' : row.set_by === null ? 'pass' : 'other';
    lines.set(line, [...(lines.get(line) ?? []), `${who}:${String(row.stage)}:${String(row.reopened_from)}`]);
  }
  for (const row of result.after.get('line_status_head') ?? []) {
    const line = String(row.service_line_id);
    lines.set(line, [...(lines.get(line) ?? []), `head:${String(row.stage)}`]);
  }
  return lines;
}

/** L's events after the pass, in seq order: who set each and its stage. */
function eventsOfL(result: SideResult): string[] {
  return (eventsByLine(result).get(crossing.reopened.serviceLineId) ?? []).filter((event) => !event.startsWith('head:')).map((event) => event.replace(/:[^:]*$/, ''));
}

/** The reference interleaving's side: the per-line reference with B committed at its first stage insert. */
async function referenceInterleaving(): Promise<SideResult> {
  const copy = await cloneWith(null);
  const b = reopen(copy.url, '5s');
  const ref = await side('reference interleaving', reference, copy.url, reopenFirst(b));
  await b.done;
  return ref;
}

describe('a person’s reopen crossing the pass’s stage write (CAS-49.6)', () => {
  it('session B issues the web reopen’s own statements, word for word', () => {
    for (const key of ['update', 'stage', 'insert'] as const) {
      expect(readFileSync(new URL(REOPEN_SOURCES[key], import.meta.url), 'utf8'), key).toContain(REOPEN_STATEMENTS[key]);
    }
  });

  it('when the pass is the victim, the savepoint retry re-issues the stage write and the pass writes what the reference interleaving wrote', async () => {
    const ref = await referenceInterleaving();
    // B's reopen stands ahead of the pass's event for L; the pass never searched L (no claim match on it).
    expect(eventsOfL(ref)).toEqual(['reopen:payer_approved', 'pass:recovered']);

    const crossed = await cloneWith({ pass: '1s', reopen: '60s' });
    const b = reopen(crossed.url, '60s');
    const seen: Seen = { attempts: 0, failures: [] };
    const result = await side('the pass the victim', shipped, crossed.url, crossAt(b, crossed.url, seen));
    await expect(b.done).resolves.toBeUndefined();
    expect(seen.failures, 'the pass’s stage write was aborted by the deadlock detector').toEqual(['40P01']);
    expect(seen.attempts, 'and re-issued once').toBe(2);
    expect(eventsOfL(result)).toEqual(['reopen:payer_approved', 'pass:recovered']);
    expect(compare(ref, result, before, crossing.practice, { seqByOrder: true }).differences).toEqual([]);
  }, 600_000);

  it('when the reopen is the victim, it gets 40P01 and the pass writes what it writes alone', async () => {
    const aloneCopy = await cloneWith(null);
    const alone = await side('the pass alone', shipped, aloneCopy.url);
    expect(eventsOfL(alone)).toEqual(['pass:recovered']);

    const crossed = await cloneWith({ pass: '60s', reopen: '200ms' });
    const b = reopen(crossed.url, '60s');
    const seen: Seen = { attempts: 0, failures: [] };
    const result = await side('the reopen the victim', shipped, crossed.url, crossAt(b, crossed.url, seen));
    expect(await b.done.then(() => 'committed', codeOf)).toBe('40P01');
    expect(seen.failures).toEqual([]);
    expect(seen.attempts).toBe(1);
    expect(compare(alone, result, before, crossing.practice, { seqByOrder: true }).differences).toEqual([]);
  }, 600_000);

  it('when the pass is the victim and its retry is not held, the retry meets no second deadlock and every line’s events are the reference interleaving’s', async () => {
    const ref = await referenceInterleaving();

    const crossed = await cloneWith({ pass: '1s', reopen: '60s' });
    const b = reopen(crossed.url, '60s');
    const seen: Seen = { attempts: 0, failures: [] };
    const result = await side('the retry unheld', shipped, crossed.url, crossAt(b, crossed.url, seen, false));
    await expect(b.done).resolves.toBeUndefined();
    // The rollback to the savepoint wakes B's INSERT, which takes L's head before the retry asks for it: the retry then
    // waits on B, which waits on nothing, so there is no second deadlock.
    expect(seen.failures, 'one deadlock, and none on the retry').toEqual(['40P01']);
    expect(seen.attempts, 'the stage write re-issued once').toBe(2);
    expect(eventsOfL(result)).toEqual(['reopen:payer_approved', 'pass:recovered']);
    // Only B's row's place in the global seq order among the pass's other lines' rows may differ from the reference's;
    // every line's own events and head row, which every reader uses, are the same.
    expect(eventsByLine(result)).toEqual(eventsByLine(ref));
  }, 600_000);
});
