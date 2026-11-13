import { randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl, recordAuditEvent, withActor } from '@tp/db';
import { type MigratedDatabase, createMigratedDatabase, createUser, endPool } from '@tp/db/testing';
import { type Logger, createLogger, isAllowedLogField } from '@tp/observability';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPlatformHandlers } from '../jobs/platform';
import { MemoryMailSender } from '../mail/mail';
import { PROVIDER_SIGN_OUT_NOT_DELIVERED, type ProviderSignOutAdapter, type ProviderSignOutOutcome, ProviderSignOutRunFailed, runProviderSignOuts } from './provider-sign-outs';
import type { NoticeClient } from './support-notices';

/**
 * JOB-08, the worker's rows (docs/adr/0095; the design's section 7 and 16.6): the platform's provider_sign_outs job
 * against a real database. Each crash point of the run is made by refusing one of the job's own statements (the
 * transaction it belongs to rolls back, as a stopped worker's would) or by a provider that throws: the row is asked
 * again and recorded once; a stale worker's answer changes nothing; the paging line is written before its
 * acknowledgement, so it is written again after a crash between the two; a failing step never stops the others. Log
 * lines carry IDs and codes only: the provider's subject and the account's address are asserted absent from every
 * captured line. Synthetic data only.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let operator: DatabasePool;
let app: DatabasePool;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  operator = openPool(database.url, 4);
  app = openPool(database.appUrl, 2);
}, 120_000);

afterAll(async () => {
  await endPool(app);
  await endPool(operator);
  await owner.end();
  await database.drop();
});

/** Each test sees only its own rows: every run claims whatever is due. */
beforeEach(async () => {
  await owner.query('DELETE FROM provider_sign_out');
});

/**
 * The captured lines: `lines` holds every line but the run's own ('provider sign-outs run', once a run, which the
 * absence alarm reads), so each test names exactly the lines its case writes; `runs` holds the run's own.
 */
function capture() {
  const lines: Record<string, unknown>[] = [];
  const runs: Record<string, unknown>[] = [];
  const sink = (line: string) => {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    (parsed.msg === 'provider sign-outs run' ? runs : lines).push(parsed);
  };
  return { lines, runs, logger: createLogger({ sink }) };
}

interface Queued {
  readonly user: string;
  readonly subject: string;
  readonly id: string;
  readonly cause: string;
}

/** A recorded reset, which queues the account's sign-out in its own transaction (the trigger on audit_event). */
async function queued(): Promise<Queued> {
  const user = await createUser(owner, {});
  const cause = `test-${randomUUID()}`;
  await withActor(app, user, (scope) => recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user', objectId: user, purpose: 'email_code', requestId: cause }));
  const { rows } = await owner.query<{ id: string; cognito_sub: string }>('SELECT p.id, u.cognito_sub FROM provider_sign_out p JOIN "user" u ON u.id = p.user_id WHERE p.user_id = $1', [user]);
  expect(rows).toHaveLength(1);
  return { user, subject: rows[0]?.cognito_sub ?? '', id: rows[0]?.id ?? '', cause };
}

interface RowState {
  readonly attempts: number;
  readonly leased: boolean;
  readonly done: boolean;
  readonly last_error_code: string | null;
  readonly late: boolean;
  readonly late_reported: boolean;
  readonly gave_up: boolean;
  readonly gave_up_reported: boolean;
  readonly next_in_seconds: number;
}

async function row(id: string): Promise<RowState | undefined> {
  const { rows } = await owner.query<RowState>(
    `SELECT attempts, leased_until IS NOT NULL AS leased, done_at IS NOT NULL AS done, last_error_code, late_at IS NOT NULL AS late,
            late_reported_at IS NOT NULL AS late_reported, gave_up_at IS NOT NULL AS gave_up, gave_up_reported_at IS NOT NULL AS gave_up_reported,
            round(extract(epoch FROM next_attempt_at - now()))::int AS next_in_seconds
       FROM provider_sign_out WHERE id = $1`,
    [id],
  );
  return rows[0];
}

/** The lease lapsed and the row is due again: what two minutes do. */
async function lapse(id: string): Promise<void> {
  await owner.query("UPDATE provider_sign_out SET leased_until = now() - interval '1 second', next_attempt_at = now() - interval '1 second' WHERE id = $1", [id]);
}

async function audits(action: string, user: string): Promise<Record<string, unknown>[]> {
  const { rows } = await owner.query<Record<string, unknown>>("SELECT actor_kind, purpose, request_id FROM audit_event WHERE action = $1 AND object_type = 'user' AND object_id = $2 ORDER BY at", [action, user]);
  return rows;
}

/** A provider twin: answers each subject as told (signed out unless told), and keeps the subjects it was asked for. */
function provider(answer: (subject: string, call: number) => Promise<ProviderSignOutOutcome> | ProviderSignOutOutcome = () => 'signed_out') {
  const asked: string[] = [];
  const adapter: ProviderSignOutAdapter = {
    signOut: async (subject) => {
      asked.push(subject);
      return answer(subject, asked.length);
    },
  };
  return { asked, adapter };
}

class Crash extends Error {
  override readonly name = 'Crash';
}

/** An operator connection for one step of a run, given back when the step settles, every statement through `query`. */
function stepClient(query: (client: NoticeClient, text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>) {
  return async <T>(use: (client: NoticeClient) => Promise<T>): Promise<T> => {
    const client = await operator.connect();
    try {
      return await use({ query: (text, values) => query(client, text, values) });
    } finally {
      client.release();
    }
  };
}

/** One run, a connection a step as the job takes them; `refuse` names a statement refused once, as a crash there would. */
async function run(adapter: ProviderSignOutAdapter, logger: Logger, options: { readonly requestId?: string; readonly refuse?: string; readonly now?: () => number } = {}) {
  let refused = false;
  const withClient = stepClient((client, text, values) => {
    if (options.refuse !== undefined && !refused && text.includes(options.refuse)) {
      refused = true;
      return Promise.reject(new Crash('stopped here'));
    }
    return client.query(text, values);
  });
  return await runProviderSignOuts({ withClient, provider: adapter, requestId: options.requestId ?? `job-${randomUUID()}`, logger, ...(options.now === undefined ? {} : { now: options.now }) });
}

/** Every key is allowlisted, and neither a subject nor an address is in any line. */
function idsOnly(lines: readonly Record<string, unknown>[], rows: readonly Queued[]): void {
  for (const line of lines) {
    for (const key of Object.keys(line).filter((field) => !['level', 'msg', 'time', 'service'].includes(field))) {
      expect(isAllowedLogField(key), key).toBe(true);
    }
  }
  const text = JSON.stringify(lines);
  expect(text).not.toMatch(/@/);
  for (const queuedRow of rows) {
    expect(queuedRow.subject).not.toBe('');
    expect(text).not.toContain(queuedRow.subject);
  }
}

describe('the provider_sign_outs job (JOB-08; docs/adr/0095)', () => {
  it('asks the provider once for a queued row, by the account’s subject, records it done with one audit row, and asks no more', async () => {
    const one = await queued();
    const twin = provider();
    const { lines, logger } = capture();
    const requestId = `job-${randomUUID()}`;
    expect(await run(twin.adapter, logger, { requestId })).toEqual({ done: 1, failed: 0, reported: 0, removalsExpired: 0, deleted: 0 });
    expect(twin.asked).toEqual([one.subject]);
    expect(await row(one.id)).toMatchObject({ attempts: 1, leased: false, done: true });
    expect(await audits('provider_signed_out', one.user)).toEqual([{ actor_kind: 'system', purpose: 'password_reset_completed', request_id: requestId }]);
    expect(lines).toEqual([expect.objectContaining({ level: 'info', msg: 'provider sign-out done', sign_out_id: one.id, user_id: one.user, outcome_code: 'signed_out' })]);
    idsOnly(lines, [one]);
    expect(await run(twin.adapter, logger)).toMatchObject({ done: 0, failed: 0 });
    expect(twin.asked).toHaveLength(1);
    expect(await audits('provider_signed_out', one.user)).toHaveLength(1);
  });

  it('records the provider’s “no such user” as done, and the line says which answer it was', async () => {
    const one = await queued();
    const { lines, logger } = capture();
    await run(provider(() => 'no_such_user').adapter, logger);
    expect(await row(one.id)).toMatchObject({ done: true });
    expect(lines).toEqual([expect.objectContaining({ msg: 'provider sign-out done', outcome_code: 'no_such_user' })]);
  });

  it('records a failed try by the error’s name alone, tries it again a minute later, and never logs the error’s words', async () => {
    const one = await queued();
    const { lines, logger } = capture();
    const failing = provider((subject) => {
      const error = new Error(`no answer for ${subject}`);
      error.name = 'TooManyRequestsException';
      throw error;
    });
    expect(await run(failing.adapter, logger)).toMatchObject({ done: 0, failed: 1 });
    const state = await row(one.id);
    expect(state).toMatchObject({ attempts: 1, leased: false, done: false, last_error_code: 'TooManyRequestsException' });
    expect(state?.next_in_seconds).toBeGreaterThan(50);
    expect(state?.next_in_seconds).toBeLessThanOrEqual(60);
    expect(lines).toEqual([expect.objectContaining({ level: 'warn', msg: 'provider sign-out attempt failed', sign_out_id: one.id, user_id: one.user, error_code: 'TooManyRequestsException' })]);
    idsOnly(lines, [one]);
    // Not due: the next run does not claim it.
    expect(await run(failing.adapter, logger)).toMatchObject({ failed: 0 });
    expect(failing.asked).toHaveLength(1);
  });

  it('JOB-07: a failed try’s line names the request of the event that queued the row, so the reset and its sign-out read as one story (owed red until operator_provider_sign_out_claim returns cause_request_id)', async () => {
    const one = await queued();
    const { lines, logger } = capture();
    const failing = provider(() => {
      const error = new Error('synthetic words');
      error.name = 'TooManyRequestsException';
      throw error;
    });
    await run(failing.adapter, logger);
    expect(lines).toEqual([expect.objectContaining({ level: 'warn', msg: 'provider sign-out attempt failed', sign_out_id: one.id, user_id: one.user, request_id: one.cause, error_code: 'TooManyRequestsException' })]);
    idsOnly(lines, [one]);
  });

  it('a step the database fails says the failure’s SQLSTATE, a code and nothing of its words; an error with no SQLSTATE says none', async () => {
    await queued();
    const refusing = (error: Error) =>
      stepClient((client, text, values) => (text.includes('operator_provider_sign_out_claim') ? Promise.reject(error) : client.query(text, values)));
    const database = capture();
    const deadlock = Object.assign(new Error('synthetic: deadlock detected while reading a private row'), { name: 'DatabaseError', code: '40P01' });
    await expect(runProviderSignOuts({ withClient: refusing(deadlock), provider: provider().adapter, requestId: `job-${randomUUID()}`, logger: database.logger })).rejects.toBeInstanceOf(ProviderSignOutRunFailed);
    expect(database.lines.filter((line) => line.msg === 'provider sign-out step failed')).toEqual([expect.objectContaining({ level: 'error', error_code: 'sign_outs:DatabaseError', sqlstate: '40P01' })]);
    expect(JSON.stringify(database.lines)).not.toContain('synthetic');
    // A code that is not a SQLSTATE (a socket's, or anything longer or lower-case) is not passed off as one.
    for (const code of ['ECONNREFUSED', '40p01', 'a private row', 42601]) {
      const other = capture();
      const failure = Object.assign(new Error('synthetic'), { name: 'Crash', code });
      await expect(runProviderSignOuts({ withClient: refusing(failure), provider: provider().adapter, requestId: `job-${randomUUID()}`, logger: other.logger })).rejects.toBeInstanceOf(ProviderSignOutRunFailed);
      const [line] = other.lines.filter((entry) => entry.msg === 'provider sign-out step failed');
      expect(line).toMatchObject({ error_code: 'sign_outs:Crash' });
      expect(line).not.toHaveProperty('sqlstate');
    }
  });

  it('stores an error whose name is not a class name as unknown', async () => {
    const one = await queued();
    const { lines, logger } = capture();
    await run(
      provider(() => {
        const error = new Error('x');
        error.name = 'not a name: 42';
        throw error;
      }).adapter,
      logger,
    );
    expect(await row(one.id)).toMatchObject({ last_error_code: 'unknown' });
    expect(lines).toEqual([expect.objectContaining({ error_code: 'unknown' })]);
  });

  it('a crash after the claim and before the answer is recorded leaves a counted try and a lease; once the lease lapses the row is asked again and done once', async () => {
    const one = await queued();
    const twin = provider();
    const { lines, logger } = capture();
    // The provider answered; the worker stops before done commits.
    await expect(run(twin.adapter, logger, { refuse: 'operator_provider_sign_out_done' })).rejects.toEqual(new ProviderSignOutRunFailed(['sign_outs']));
    expect(await row(one.id)).toMatchObject({ attempts: 1, leased: true, done: false });
    expect(await audits('provider_signed_out', one.user)).toEqual([]);
    // Leased: the next run does not take it.
    expect(await run(twin.adapter, logger)).toMatchObject({ done: 0 });
    expect(twin.asked).toHaveLength(1);
    await lapse(one.id);
    expect(await run(twin.adapter, logger)).toMatchObject({ done: 1 });
    expect(twin.asked).toEqual([one.subject, one.subject]);
    expect(await row(one.id)).toMatchObject({ attempts: 2, done: true });
    expect(await audits('provider_signed_out', one.user)).toHaveLength(1);
    expect(lines.filter((line) => line.msg === 'provider sign-out step failed')).toEqual([expect.objectContaining({ level: 'error', error_code: 'sign_outs:Crash' })]);
    idsOnly(lines, [one]);
  });

  it('a crash while a failed try is recorded leaves the same, and the sweep and the expiries still run', async () => {
    const one = await queued();
    const { lines, logger } = capture();
    const failing = provider(() => {
      throw new Crash('the provider is down');
    });
    await expect(run(failing.adapter, logger, { refuse: 'operator_provider_sign_out_failed' })).rejects.toBeInstanceOf(ProviderSignOutRunFailed);
    expect(await row(one.id)).toMatchObject({ attempts: 1, leased: true, done: false, last_error_code: null });
    expect(lines.map((line) => line.msg)).toEqual(['provider sign-out step failed']);
  });

  it('a stale worker’s answer changes nothing: the row another worker claimed since is recorded by that worker alone', async () => {
    const one = await queued();
    const second = provider();
    const { lines, logger } = capture();
    const slow = provider(async () => {
      // This call outlived its lease: another worker claims the row and records it, before this one answers.
      await lapse(one.id);
      expect(await run(second.adapter, logger)).toMatchObject({ done: 1 });
      return 'signed_out' as const;
    });
    expect(await run(slow.adapter, logger)).toMatchObject({ done: 0, failed: 0 });
    expect(await row(one.id)).toMatchObject({ attempts: 2, done: true });
    expect(await audits('provider_signed_out', one.user)).toHaveLength(1);
    expect(lines.filter((line) => line.msg === 'provider sign-out done')).toHaveLength(1);
  });

  it('a stale worker’s failure moves nothing either', async () => {
    const one = await queued();
    const { logger } = capture();
    const slow = provider(async () => {
      await lapse(one.id);
      await run(provider().adapter, logger);
      throw new Crash('late');
    });
    await run(slow.adapter, logger);
    expect(await row(one.id)).toMatchObject({ attempts: 2, done: true, last_error_code: null });
  });

  it('writes the LATE line once, by IDs and the cause’s request, and acknowledges it only after it is written', async () => {
    const one = await queued();
    await owner.query("UPDATE provider_sign_out SET attempts = 4, next_attempt_at = now() + interval '1 hour' WHERE id = $1", [one.id]);
    const { lines, logger } = capture();
    expect(await run(provider().adapter, logger)).toMatchObject({ reported: 1 });
    expect(lines).toEqual([
      expect.objectContaining({ level: 'error', msg: PROVIDER_SIGN_OUT_NOT_DELIVERED, sign_out_id: one.id, user_id: one.user, request_id: one.cause, error_code: 'LATE' }),
    ]);
    expect(PROVIDER_SIGN_OUT_NOT_DELIVERED).toBe('security event: provider sign-out not delivered');
    expect(await row(one.id)).toMatchObject({ late: true, late_reported: true, gave_up: false });
    expect(await run(provider().adapter, logger)).toMatchObject({ reported: 0 });
    expect(lines).toHaveLength(1);
    idsOnly(lines, [one]);
  });

  it('a crash between the sweep’s mark and the line, or between the line and its acknowledgement, writes the line on the next run', async () => {
    const one = await queued();
    await owner.query("UPDATE provider_sign_out SET attempts = 4, next_attempt_at = now() + interval '1 hour' WHERE id = $1", [one.id]);
    // The worker stops after the sweep committed its mark and before any line: a logger that cannot write.
    const broken = createLogger({
      sink: () => {
        throw new Crash('stopped before the line');
      },
    });
    await expect(run(provider().adapter, broken)).rejects.toBeInstanceOf(Crash);
    expect(await row(one.id)).toMatchObject({ late: true, late_reported: false });
    // The line is written; the worker stops before the acknowledgement.
    const { lines, logger } = capture();
    await expect(run(provider().adapter, logger, { refuse: 'operator_provider_sign_out_reported' })).rejects.toEqual(new ProviderSignOutRunFailed(['overdue']));
    expect(lines.filter((line) => line.msg === PROVIDER_SIGN_OUT_NOT_DELIVERED)).toHaveLength(1);
    expect(await row(one.id)).toMatchObject({ late_reported: false });
    expect(await run(provider().adapter, logger)).toMatchObject({ reported: 1 });
    expect(lines.filter((line) => line.msg === PROVIDER_SIGN_OUT_NOT_DELIVERED)).toHaveLength(2);
    expect(await row(one.id)).toMatchObject({ late_reported: true });
    await run(provider().adapter, logger);
    expect(lines.filter((line) => line.msg === PROVIDER_SIGN_OUT_NOT_DELIVERED)).toHaveLength(2);
  });

  it('writes GAVE_UP for a row at thirty tries, beside its LATE line, with the undelivered event once; the row is claimed no more', async () => {
    const one = await queued();
    await owner.query("UPDATE provider_sign_out SET attempts = 30, next_attempt_at = now() - interval '1 minute' WHERE id = $1", [one.id]);
    const twin = provider();
    const { lines, logger } = capture();
    expect(await run(twin.adapter, logger)).toMatchObject({ done: 0, reported: 2 });
    expect(twin.asked).toEqual([]);
    expect(lines.map((line) => line.error_code).sort()).toEqual(['GAVE_UP', 'LATE']);
    expect(await row(one.id)).toMatchObject({ gave_up: true, gave_up_reported: true, late_reported: true });
    expect(await audits('provider_sign_out_undelivered', one.user)).toHaveLength(1);
    await run(twin.adapter, logger);
    expect(await audits('provider_sign_out_undelivered', one.user)).toHaveLength(1);
    expect(lines).toHaveLength(2);
  });

  // The absence alarm reads this line (ProviderSignOutsNotRunning; docs/adr/0095, D16): a schedule that stops firing the
  // job writes none, and nothing else says so.
  it('writes its run line once a run, with a count and nothing else, when rows were due and when a step failed', async () => {
    await queued();
    const first = capture();
    await run(provider().adapter, first.logger);
    const written = first.runs;
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ level: 'info' });
    expect(Number(written[0]?.record_count)).toBeGreaterThanOrEqual(1);
    expect(Object.keys(written[0] ?? {}).filter((key) => !['level', 'time', 'msg', 'service', 'env', 'record_count'].includes(key))).toEqual([]);
    const failing = capture();
    await expect(run(provider().adapter, failing.logger, { refuse: 'operator_key_removals_expire' })).rejects.toEqual(new ProviderSignOutRunFailed(['removals_expire']));
    expect(failing.runs).toHaveLength(1);
    // Nothing but the step's own line beside it.
    expect(failing.lines.map((line) => line.msg)).toEqual(['provider sign-out step failed']);
  });

  it('a failing expiry step stops neither the sign-outs before it nor the step after it, and the run fails naming it', async () => {
    const one = await queued();
    const twin = provider();
    const { lines, logger } = capture();
    const texts: string[] = [];
    await expect(
      runProviderSignOuts({
        withClient: stepClient((client, text, values) => {
          texts.push(text);
          return text.includes('operator_key_removals_expire') ? Promise.reject(new Crash('stopped')) : client.query(text, values);
        }),
        provider: twin.adapter,
        requestId: `job-${randomUUID()}`,
        logger,
      }),
    ).rejects.toEqual(new ProviderSignOutRunFailed(['removals_expire']));
    expect(await row(one.id)).toMatchObject({ done: true });
    expect(texts.some((text) => text.includes('operator_provider_sign_outs_expire'))).toBe(true);
    expect(lines.map((line) => line.msg)).toEqual(['provider sign-out done', 'provider sign-out step failed']);
  });

  it('stops claiming once the run has spent 8 seconds: a row it did not reach has no try counted and goes on the next run', async () => {
    const rows = [await queued(), await queued(), await queued()];
    const twin = provider();
    const { logger } = capture();
    let clock = 0;
    // Each reading is 5 seconds on: the loop's start, then one before each claim.
    const now = () => (clock += 5_000);
    expect(await run(twin.adapter, logger, { now })).toMatchObject({ done: 1 });
    const states = await Promise.all(rows.map((queuedRow) => row(queuedRow.id)));
    expect(states.filter((state) => state?.done === true)).toHaveLength(1);
    expect(states.filter((state) => state?.attempts === 0)).toHaveLength(2);
    expect(await run(twin.adapter, logger)).toMatchObject({ done: 2 });
  });

  // The round-1 review, B3: the operator pool is two connections for every platform job, and the provider may take 10
  // seconds to answer. The run holds none of them while it waits.
  it('holds no operator connection while the provider is being called, and gives every one back at its end', async () => {
    const rows = [await queued(), await queued()];
    let held = 0;
    const counting = {
      connect: async () => {
        const client = await operator.connect();
        held += 1;
        return {
          query: (text: string, values?: unknown[]) => client.query(text, values),
          release: (destroy?: boolean) => {
            held -= 1;
            client.release(destroy);
          },
        };
      },
    };
    const heldDuringCall: number[] = [];
    const twin = provider(() => {
      heldDuringCall.push(held);
      return 'signed_out';
    });
    const handlers = createPlatformHandlers({
      operator: counting,
      store: { putImmutable: () => Promise.reject(new Error('unused')), head: () => Promise.resolve(null) },
      restorer: { restoreLatest: () => Promise.reject(new Error('unused')) },
      mail: new MemoryMailSender(),
      appOrigin: 'http://localhost:3000',
      supportEmail: 'support@synthetic.test',
      providerSignOut: twin.adapter,
    });
    const { runs, logger } = capture();
    await handlers.provider_sign_outs({}, { jobId: randomUUID(), logger });
    expect(heldDuringCall).toEqual([0, 0]);
    expect(held).toBe(0);
    expect(await Promise.all(rows.map(async (queuedRow) => (await row(queuedRow.id))?.done))).toEqual([true, true]);
    expect(runs).toHaveLength(1);
  });

  it('writes its run line, and fails naming every step, when no operator connection can be had', async () => {
    class PoolTimeout extends Error {
      override readonly name = 'PoolTimeout';
    }
    const handlers = createPlatformHandlers({
      operator: { connect: () => Promise.reject(new PoolTimeout('no connection')) },
      store: { putImmutable: () => Promise.reject(new Error('unused')), head: () => Promise.resolve(null) },
      restorer: { restoreLatest: () => Promise.reject(new Error('unused')) },
      mail: new MemoryMailSender(),
      appOrigin: 'http://localhost:3000',
      supportEmail: 'support@synthetic.test',
      providerSignOut: provider().adapter,
    });
    const { runs, lines, logger } = capture();
    await expect(handlers.provider_sign_outs({}, { jobId: randomUUID(), logger })).rejects.toEqual(new ProviderSignOutRunFailed(['sign_outs', 'overdue', 'removals_expire', 'sign_outs_expire']));
    expect(runs).toHaveLength(1);
    expect(lines.map((line) => line.error_code)).toEqual(['sign_outs:PoolTimeout', 'overdue:PoolTimeout', 'removals_expire:PoolTimeout', 'sign_outs_expire:PoolTimeout']);
  });

  // The round-1 review, B1: a provider that hangs costs the run its 10 seconds once, not once a row.
  it('stops asking after the provider’s first timeout: the try is recorded failed, and the rows it did not reach have no try counted', async () => {
    const rows = [await queued(), await queued(), await queued()];
    class Aborted extends Error {
      override readonly name = 'AbortError';
    }
    const twin = provider(() => Promise.reject(new Aborted('the request was aborted')));
    const { lines, runs, logger } = capture();
    expect(await run(twin.adapter, logger)).toMatchObject({ done: 0, failed: 1 });
    expect(twin.asked).toHaveLength(1);
    const states = await Promise.all(rows.map((queuedRow) => row(queuedRow.id)));
    expect(states.filter((state) => state?.attempts === 1 && state.last_error_code === 'AbortError')).toHaveLength(1);
    expect(states.filter((state) => state?.attempts === 0)).toHaveLength(2);
    expect(lines.map((line) => line.msg)).toEqual(['provider sign-out attempt failed']);
    expect(runs).toHaveLength(1);
    // Any other failure is the row's own, and the run goes on to the next row.
    await owner.query('DELETE FROM provider_sign_out');
    await queued();
    await queued();
    class Refused extends Error {
      override readonly name = 'TooManyRequestsException';
    }
    const other = provider(() => Promise.reject(new Refused('slow down')));
    expect(await run(other.adapter, capture().logger)).toMatchObject({ failed: 2 });
  });

  it('claims each row for one worker when two runs overlap', async () => {
    const rows = [await queued(), await queued(), await queued(), await queued()];
    const twin = provider();
    const { logger } = capture();
    const results = await Promise.all([run(twin.adapter, logger), run(twin.adapter, logger)]);
    expect(results.reduce((sum, result) => sum + result.done, 0)).toBe(4);
    expect([...twin.asked].sort()).toEqual(rows.map((queuedRow) => queuedRow.subject).sort());
  });

  it('runs as the platform’s provider_sign_outs job, with the job’s ID on its audit rows and IDs only in its lines', async () => {
    const one = await queued();
    const twin = provider();
    const handlers = createPlatformHandlers({
      operator,
      store: { putImmutable: () => Promise.reject(new Error('unused')), head: () => Promise.resolve(null) },
      restorer: { restoreLatest: () => Promise.reject(new Error('unused')) },
      mail: new MemoryMailSender(),
      appOrigin: 'http://localhost:3000',
      supportEmail: 'support@synthetic.test',
      providerSignOut: twin.adapter,
    });
    const { lines, logger } = capture();
    const jobId = randomUUID();
    await handlers.provider_sign_outs({}, { jobId, logger });
    expect(twin.asked).toEqual([one.subject]);
    expect(await audits('provider_signed_out', one.user)).toEqual([expect.objectContaining({ request_id: jobId })]);
    expect(lines).toEqual([expect.objectContaining({ msg: 'provider sign-out done', job_id: jobId, sign_out_id: one.id, user_id: one.user })]);
    idsOnly(lines, [one]);
  });
});
