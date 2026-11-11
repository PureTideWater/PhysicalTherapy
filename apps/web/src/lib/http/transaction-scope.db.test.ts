import { randomBytes, randomUUID } from 'node:crypto';

import { CommitOutcomeUnknownError, type DatabaseClient, type DatabasePool, LocalKeyProvider, type ScopeClient, TransactionNotCommittedError, databaseClient, openPool, readDatabaseUrl, recordAuditEvent } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, createMigratedDatabase, createTenantWorld, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { QUEUE_OPTIONS } from '@tp/worker/jobs';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE } from '../auth/sessions';
import { openSessionNow } from '../routes/test-support/open-session';
import { assignModelPath, modelLimiterOf, modelPathOf } from '../models/path';
import { opaqueId } from '../routes/schemas';
import { type Services, type SignedInServices, createServices } from '../server/services';
import { type JobQueue, MemoryQueue, PgBossQueue } from '../uploads/queue';
import { csrfTokenFor } from './csrf';
import { organizationRoute, practiceRoute, selfRoute } from './invoke';
import type { MutationResult, Outcome, PracticeContext, Route } from './route';

/**
 * The web's transaction scope (Queues item 25 (a); docs/adr/0092's follow-ups), on PostgreSQL and a real queue:
 * - a request whose COMMIT the server answered with ROLLBACK is never answered `ok`, and nothing of it is saved: no
 *   audit event, no request key, no job, no work after the commit;
 * - no job a handler queued survives a request that rolls back, none is visible to a worker before the request's
 *   commit, and none is lost after it;
 * - a signed-in handler has no application pool to take a second connection from, by type and at run time, in a
 *   person's own, a practice's and an organization's routes.
 * The practice-scoped transaction, the role check and the audit event are the wrapper's own, unchanged: the saved
 * request's audit event and scope are read back here. Synthetic rows only.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let world: TenantWorld;
let token: string;
let queue: MemoryQueue;
let services: Services;
let lines: Record<string, unknown>[];

function servicesWith(parts: { pool?: Services['pool']; queue?: JobQueue } = {}): Services {
  const sealer = new Sealer(randomBytes(32));
  return createServices({
    origin: 'http://localhost:3100',
    pool: parts.pool ?? app,
    provider: new DevAuthProvider({ store: new MemoryDevStore(), sealer: sealer.derive('dev-provider'), webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' }, deliverInvitation: () => Promise.resolve() }),
    keys: LocalKeyProvider.random(),
    sealer,
    logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }),
    queue: parts.queue ?? queue,
  });
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  world = await createTenantWorld(owner, 'transaction-scope');
  token = (await openSessionNow(app, { userId: world.adminUserId, method: 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
});

beforeEach(() => {
  lines = [];
  queue = new MemoryQueue();
  services = servicesWith();
});

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

/** What a test's handler does inside the request's transaction. */
type Work = (context: PracticeContext<{ practiceId: string }, unknown>) => Promise<void>;

let work: Work = () => Promise.resolve();

/** A practice's mutation whose handler is the test's: the wrapper's own scope, role check, request key and audit event around it. */
const action = practiceRoute({
  id: 'test.transaction_scope.action',
  kind: 'action',
  path: '/p/[practiceId]/test/transaction-scope',
  phi: false,
  permission: 'proof_level.set',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({}),
  audit: { action: 'transaction_scope_tested', objectType: 'practice' },
  handle: async (context): Promise<MutationResult> => {
    await work(context);
    return { objectId: context.practiceId };
  },
});

interface Sent {
  readonly outcome: Outcome<MutationResult> | { readonly thrown: unknown };
  readonly requestKey: string;
  readonly requestId: string;
}

async function send(route: Route<MutationResult>, using: Services, params: Record<string, unknown>): Promise<Sent> {
  const requestKey = randomUUID();
  const requestId = `test-${randomUUID()}`;
  const cookies = { get: (name: string) => (name === SESSION_COOKIE ? token : undefined), set: () => undefined, delete: () => undefined };
  const outcome = await route.invoke({ cookies, params, input: { csrfToken: csrfTokenFor(using.sealer, token), requestKey }, requestId, userAgent: null }, using).catch((thrown: unknown) => ({ thrown }));
  return { outcome, requestKey, requestId };
}

const press = (using: Services = services) => send(action, using, { practiceId: world.practiceId });

async function saved(sent: Sent): Promise<{ audit: number; key: number }> {
  const audit = await owner.query<{ n: string }>('SELECT count(*) AS n FROM audit_event WHERE request_id = $1', [sent.requestId]);
  const key = await owner.query<{ n: string }>('SELECT count(*) AS n FROM mutation_request WHERE request_key = $1', [sent.requestKey]);
  return { audit: Number(audit.rows[0]?.n), key: Number(key.rows[0]?.n) };
}

const DAILY = () => ({ practice_id: world.practiceId, day: '2026-11-11' });

describe('a COMMIT that fails is reported as not saved', () => {
  it('saves a request whose COMMIT the server answered with COMMIT, with its audit event in the practice’s scope and its request key', async () => {
    let seen: { practices: string; actor: string } | undefined;
    work = async ({ scope }) => {
      const { rows } = await scope.client.query<{ practices: string; actor: string }>("SELECT current_setting('app.practice_ids') AS practices, current_setting('app.actor_id') AS actor");
      seen = rows[0];
    };
    const sent = await press();
    expect(sent.outcome).toEqual({ status: 'ok', data: { objectId: world.practiceId } });
    expect(seen).toEqual({ practices: `{${world.practiceId}}`, actor: world.adminUserId });
    expect(await saved(sent)).toEqual({ audit: 1, key: 1 });
    const { rows } = await owner.query('SELECT actor_id, action, object_type, object_id, practice_id FROM audit_event WHERE request_id = $1', [sent.requestId]);
    expect(rows).toEqual([{ actor_id: world.adminUserId, action: 'transaction_scope_tested', object_type: 'practice', object_id: world.practiceId, practice_id: world.practiceId }]);
  });

  it('never answers `ok` for a mutation whose handler swallowed a failed statement: nothing is saved, queued or run after it', async () => {
    let after = 0;
    work = async ({ scope, services: mine, afterCommit }) => {
      await mine.queue.enqueue('reconcile', DAILY());
      afterCommit(() => Promise.resolve((after += 1)));
      // The statement fails, the handler's own code swallows it, and the handler returns as if it had saved.
      await scope.client.query('SELECT 1 / 0').catch(() => undefined);
    };
    const sent = await press();
    // A mutation's audit event is the next statement, and PostgreSQL refuses it in the failed transaction.
    expect(sent.outcome).toMatchObject({ thrown: { code: '25P02' } });
    expect(await saved(sent)).toEqual({ audit: 0, key: 0 });
    expect([queue.jobs, queue.open, after]).toEqual([[], 0, 0]);
    // The same press sent again does the work: its key was rolled back with the rest.
    work = () => Promise.resolve();
    expect((await press()).outcome).toMatchObject({ status: 'ok' });
  });

  it('never answers a read whose audit event was rolled back: a handler whose last statement failed and was swallowed is not answered `ok`', async () => {
    // A download's shape: no statement of the wrapper's follows the handler's, so only COMMIT's answer tells.
    let after = 0;
    const read = practiceRoute({
      id: 'test.transaction_scope.read',
      kind: 'handler',
      path: '/p/[practiceId]/test/transaction-scope/read',
      phi: true,
      permission: 'proof_level.set',
      params: z.object({ practiceId: opaqueId }),
      handle: async ({ scope, practiceId, request, services: mine, afterCommit }) => {
        await recordAuditEvent(scope, { action: 'export_downloaded', objectType: 'practice', objectId: practiceId, practiceId, requestId: request.requestId });
        await mine.queue.enqueue('reconcile', DAILY());
        afterCommit(() => Promise.resolve((after += 1)));
        await scope.client.query('SELECT 1 / 0').catch(() => undefined);
        return { rows: 'SYNTHETIC rows read under an audit event' };
      },
    });
    const requestId = `test-${randomUUID()}`;
    const cookies = { get: (name: string) => (name === SESSION_COOKIE ? token : undefined), set: () => undefined, delete: () => undefined };
    const outcome = await read.invoke({ cookies, params: { practiceId: world.practiceId }, requestId, userAgent: null }, services).catch((thrown: unknown) => ({ thrown }));
    expect(outcome).toEqual({ thrown: new TransactionNotCommittedError() });
    expect((await owner.query('SELECT 1 FROM audit_event WHERE request_id = $1', [requestId])).rowCount).toBe(0);
    expect([queue.jobs, queue.open, after]).toEqual([[], 0, 0]);
    expect(lines.filter((line) => line.error_code === 'COMMIT_NOT_APPLIED').map((line) => [line.level, line.request_id])).toEqual([['error', requestId]]);
  });

  /**
   * Whether a statement on one connection is the COMMIT of the request's own transaction: the session's resolving
   * transaction commits first on the same pool (auth/sessions.ts, Queues item 25 (d)), and these faults are the
   * request's, so the transaction that resolved the session commits as it is.
   */
  function requestsOwnCommit(): (text: string) => boolean {
    let resolving = false;
    return (text) => {
      if (text.startsWith('BEGIN')) {
        resolving = false;
      }
      resolving ||= text.includes('resolve_session');
      return text === 'COMMIT' && !resolving;
    };
  }

  it('keeps the refusal a known code has when the server refuses the COMMIT itself', async () => {
    const refusing: Services['pool'] = {
      connect: async () => {
        const client = await app.connect();
        const mine = requestsOwnCommit();
        const query = (text: string, values?: unknown[]) => (mine(text) ? client.query('ROLLBACK').then(() => Promise.reject(Object.assign(new Error('SYNTHETIC lock words'), { code: '55P03', severity: 'ERROR' }))) : client.query(text, values));
        return { query: query as ScopeClient['query'], release: (destroy?: boolean | Error) => client.release(destroy) };
      },
    };
    work = ({ services: mine }) => mine.queue.enqueue('reconcile', DAILY());
    const sent = await press(servicesWith({ pool: refusing }));
    expect(sent.outcome).toEqual({ status: 'busy', what: 'records' });
    expect(await saved(sent)).toEqual({ audit: 0, key: 0 });
    expect([queue.jobs, queue.open]).toEqual([[], 0]);
  });

  it('answers neither saved nor unsaved when the COMMIT ends without an answer, and queues the jobs of a request that may have saved', async () => {
    let after = 0;
    const losing: Services['pool'] = {
      connect: async () => {
        const client = await app.connect();
        // The commit is made, and its answer is lost on the way back.
        const mine = requestsOwnCommit();
        const query = (text: string, values?: unknown[]) => (mine(text) ? client.query('COMMIT').then(() => Promise.reject(Object.assign(new Error('SYNTHETIC socket words'), { code: 'ECONNRESET' }))) : client.query(text, values));
        return { query: query as ScopeClient['query'], release: (destroy?: boolean | Error) => client.release(destroy) };
      },
    };
    work = async ({ services: mine, afterCommit }) => {
      await mine.queue.enqueue('reconcile', DAILY());
      afterCommit(() => Promise.resolve((after += 1)));
    };
    const sent = await press(servicesWith({ pool: losing }));
    expect((sent.outcome as { thrown: unknown }).thrown).toBeInstanceOf(CommitOutcomeUnknownError);
    expect(await saved(sent)).toEqual({ audit: 1, key: 1 });
    expect([queue.jobs, queue.open, after]).toEqual([[{ type: 'reconcile', payload: DAILY() }], 0, 0]);
    expect(lines.filter((line) => line.error_code === 'COMMIT_OUTCOME_UNKNOWN').map((line) => [line.level, line.request_id])).toEqual([['error', sent.requestId]]);
    expect(JSON.stringify(lines)).not.toContain('SYNTHETIC');
  });
});

describe('a handler’s queue send is committed with its request', () => {
  it('queues nothing while the request is open, and the job once it has committed', async () => {
    let during: unknown;
    work = async ({ services: mine }) => {
      await mine.queue.enqueue('reconcile', DAILY());
      during = [...queue.jobs];
    };
    const sent = await press();
    expect(sent.outcome).toMatchObject({ status: 'ok' });
    expect(during).toEqual([]);
    expect([queue.jobs, queue.open]).toEqual([[{ type: 'reconcile', payload: DAILY() }], 0]);
  });

  it('queues nothing for a request that fails after its send, or is refused', async () => {
    work = async ({ services: mine }) => {
      await mine.queue.enqueue('reconcile', DAILY());
      throw new Error('SYNTHETIC handler failed');
    };
    const failed = await press();
    expect(failed.outcome).toEqual({ thrown: new Error('SYNTHETIC handler failed') });
    expect(await saved(failed)).toEqual({ audit: 0, key: 0 });
    expect([queue.jobs, queue.open]).toEqual([[], 0]);
  });

  it('undoes the request when its job cannot be queued, as a failed send always has', async () => {
    const down: JobQueue = { enqueue: () => Promise.reject(new Error('SYNTHETIC queue down')), enqueueScreeningRun: () => Promise.resolve(null), hold: () => Promise.reject(new Error('SYNTHETIC queue down')) };
    work = ({ services: mine }) => mine.queue.enqueue('reconcile', DAILY());
    const sent = await press(servicesWith({ queue: down }));
    expect(sent.outcome).toEqual({ thrown: new Error('SYNTHETIC queue down') });
    expect(await saved(sent)).toEqual({ audit: 0, key: 0 });
  });

  it('runs work left for after the commit once the request’s jobs are out, sending at once', async () => {
    work = ({ services: mine, afterCommit, request }) => {
      afterCommit(() => mine.queue.enqueue('monitor', { practice_id: world.practiceId, request_id: request.requestId }));
      return mine.queue.enqueue('reconcile', DAILY());
    };
    const sent = await press();
    expect(sent.outcome).toMatchObject({ status: 'ok' });
    expect(queue.jobs.map((job) => job.type)).toEqual(['reconcile', 'monitor']);
  });

  describe('on pg-boss itself', () => {
    let real: PgBossQueue;

    const jobs = async () => (await owner.query<{ state: string }>("SELECT state FROM pgboss.job WHERE name = 'reconcile'")).rows.map((row) => row.state);

    beforeAll(async () => {
      // The worker makes the queue's schema and queues; the web's producer migrates nothing.
      const maker = new PgBoss(database.url);
      maker.on('error', () => undefined);
      await maker.start();
      await maker.createQueue('reconcile', QUEUE_OPTIONS);
      await maker.stop();
      real = new PgBossQueue(database.url, createLogger({ sink: () => undefined }));
    });

    afterAll(async () => {
      await real.stop();
    });

    beforeEach(async () => {
      await owner.query("DELETE FROM pgboss.job WHERE name = 'reconcile'");
    });

    it('shows a worker no job before the request commits, exactly one after, and none for a request that rolls back', async () => {
      let during: string[] | undefined;
      work = async ({ services: mine }) => {
        await mine.queue.enqueue('reconcile', DAILY());
        during = await jobs();
      };
      const using = servicesWith({ queue: real });
      expect((await press(using)).outcome).toMatchObject({ status: 'ok' });
      expect(during).toEqual([]);
      expect(await jobs()).toEqual(['created']);

      await owner.query("DELETE FROM pgboss.job WHERE name = 'reconcile'");
      work = async ({ scope, services: mine }) => {
        await mine.queue.enqueue('reconcile', DAILY());
        await scope.client.query('SELECT 1 / 0').catch(() => undefined);
      };
      expect((await press(using)).outcome).toMatchObject({ thrown: { code: '25P02' } });
      expect(await jobs()).toEqual([]);
    });

    it('holds the inserted job out of every other connection’s sight until its own commit, and leaves none after a rollback', async () => {
      const held = await real.hold([{ type: 'reconcile', payload: DAILY() }]);
      expect(await jobs()).toEqual([]);
      await held.rollback();
      expect(await jobs()).toEqual([]);
      const again = await real.hold([{ type: 'reconcile', payload: DAILY() }]);
      await again.commit();
      expect(await jobs()).toEqual(['created']);
      // The same singleton key while one is queued: held and committed as nothing, as a send by itself answers null.
      const same = await real.hold([{ type: 'reconcile', payload: DAILY() }]);
      await same.commit();
      await same.rollback();
      expect(await jobs()).toEqual(['created']);
      expect(await real.enqueue('reconcile', DAILY())).toBeNull();
    });

    it('holds nothing when a job cannot be inserted: the queue’s connection is released and the caller is told', async () => {
      // No queue of this name was made: pg-boss refuses the send.
      await expect(real.hold([{ type: 'reconcile', payload: DAILY() }, { type: 'triage', payload: { practice_id: world.practiceId, pricing_run_id: randomUUID() } }])).rejects.toThrow();
      expect(await jobs()).toEqual([]);
      // Both of the producer's two connections are free again.
      const [one, two] = await Promise.all([real.hold([]), real.hold([])]);
      await Promise.all([one.rollback(), two.rollback()]);
    });
  });
});

describe('a signed-in handler cannot take a second connection from the application pool', () => {
  it('is given services without the pool and the sign-in flow built on it, in a person’s own, a practice’s and an organization’s routes', async () => {
    const seen: Record<string, unknown>[] = [];
    const look = (mine: SignedInServices): Promise<MutationResult> => {
      const any = mine as unknown as Record<string, unknown>;
      seen.push({ pool: 'pool' in any, signIn: 'signIn' in any, value: any.pool, frozen: Object.isFrozen(mine), enqueue: typeof mine.queue.enqueue, hold: 'hold' in mine.queue });
      // By type: the property is not there to ask for.
      // @ts-expect-error a signed-in handler's services carry no application pool
      void mine.pool;
      // @ts-expect-error nor the sign-in flow, which is built on it
      void mine.signIn;
      // @ts-expect-error and its queue is the request's own: no send that commits by itself
      void mine.queue.enqueueScreeningRun;
      return Promise.resolve({});
    };
    const common = { kind: 'action' as const, phi: false, input: z.object({}), audit: { action: 'transaction_scope_tested', objectType: 'practice' } };
    const own = selfRoute({ ...common, id: 'test.transaction_scope.self', path: '/test/self', params: z.object({}), handle: ({ services: mine }) => look(mine) });
    const practice = practiceRoute({ ...common, id: 'test.transaction_scope.practice', path: '/p/[practiceId]/test', permission: 'proof_level.set', params: z.object({ practiceId: opaqueId }), handle: ({ services: mine }) => look(mine) });
    const organization = organizationRoute({ ...common, id: 'test.transaction_scope.organization', path: '/o/[organizationId]/test', permission: 'organization.billing', params: z.object({ organizationId: opaqueId }), handle: ({ services: mine }) => look(mine) });
    expect((await send(own, services, {})).outcome).toMatchObject({ status: 'ok' });
    expect((await send(practice, services, { practiceId: world.practiceId })).outcome).toMatchObject({ status: 'ok' });
    expect((await send(organization, services, { organizationId: world.organizationId })).outcome).toMatchObject({ status: 'ok' });
    expect(seen).toEqual(Array.from({ length: 3 }, () => ({ pool: false, signIn: false, value: undefined, frozen: true, enqueue: 'function', hold: false })));
    // The wrapper's own services are untouched: it opens the transaction.
    expect('pool' in services).toBe(true);
  });

  it('keeps what a server keeps once for all its requests: every request’s services share the cap on model calls and a model path given to the server', async () => {
    const limiters: unknown[] = [];
    const paths: unknown[] = [];
    const path = { kind: 'unavailable' as const, reason: 'SYNTHETIC path of this server' } as unknown as Parameters<typeof assignModelPath>[1];
    assignModelPath(services, path);
    work = ({ services: mine }) => {
      limiters.push(modelLimiterOf(mine));
      paths.push(modelPathOf(mine));
      return Promise.resolve();
    };
    expect((await press()).outcome).toMatchObject({ status: 'ok' });
    expect((await press()).outcome).toMatchObject({ status: 'ok' });
    // One limiter for the server, not one for each request (which would cap nothing).
    expect(limiters).toHaveLength(2);
    expect(limiters[0]).toBe(limiters[1]);
    expect(limiters[0]).toBe(modelLimiterOf(services));
    expect(paths).toEqual([path, path]);
    // Another server's services have their own.
    expect(modelLimiterOf(servicesWith())).not.toBe(limiters[0]);
  });
});
