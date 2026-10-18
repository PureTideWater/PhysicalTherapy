import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, type PracticeCipher, databaseClient, documentObjectKey, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { type MigratedDatabase, createMigratedDatabase, createTenantWorld, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LocalLanding } from '../../intake/landing';
import { intakeHandler } from '../../intake/intake';
import { LocalScanService } from '../../intake/scan';
import { MemorySealedBytes } from '../../intake/test-support/memory-bytes';
import type { JobContext } from '../../jobs/handlers';
import type { JobPayload, JobType } from '../../jobs/registry';
import { DocumentStore } from '../../storage/documents';
import { parseHandler } from '../job';
import { TRACE_LOCK_BUCKETS } from '../loader';
import { ERA_EXPORT_MAX_BYTES } from './normalize';
import { oneLinePaymentsExport } from './test-support/one-line-payments';

/**
 * An ERA export at its bounds (docs/adr/0060), with the normalizer's worst case for its size, one line per payment:
 *
 * - At ERA_EXPORT_MAX_BYTES it is read whole within NORMALIZE_HEAP_MIB of heap: the read is synchronous, so it runs
 *   in a child process with its old generation limited to that (test-support/normalize-at-bound.ts), and V8 stops a
 *   process that needs more. Four parse jobs run at once in the worker's 1 GiB task (PARSE_CONCURRENCY).
 * - An export of PAYMENTS payments loads through intake and the parse job against PostgreSQL with no more than
 *   TRACE_LOCK_BUCKETS advisory locks held in this database at any sample, never one per payment (advisory locks share
 *   the cluster's lock table with every other practice's transactions), and what the process holds while it loads
 *   (heap plus buffers, after full collections, as intake.large.db.test.ts measures it) stays under LOAD_MEMORY_BOUND.
 *
 * Synthetic data only.
 */

const MIB = 1024 * 1024;
const NORMALIZE_HEAP_MIB = 128;
const PAYMENTS = 2000;
const LOAD_MEMORY_BOUND = 32 * MIB;
const REPO = path.resolve(import.meta.dirname, '../../../../..');

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
const keys = LocalKeyProvider.random();
const documents = new DocumentStore(new MemorySealedBytes());

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
}, 60_000);

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

/** Heap plus buffers after two full collections (see intake.large.db.test.ts). */
function held(): number {
  const collect = globalThis.gc;
  if (collect === undefined) {
    throw new Error('this test measures memory after full collections: the db project runs with --expose-gc (vitest.config.ts)');
  }
  collect();
  collect();
  const memory = process.memoryUsage();
  return memory.heapUsed + memory.arrayBuffers;
}

function context(practiceId: string, queued: { type: JobType; payload: unknown }[]): JobContext {
  const jobId = randomUUID();
  return {
    jobId,
    logger: createLogger({ sink: () => undefined }),
    transaction: (work) => withJobScope(app, { jobId, practiceId }, work),
    enqueue: <T extends JobType>(type: T, payload: JobPayload<T>) => {
      queued.push({ type, payload });
      return Promise.resolve(randomUUID());
    },
    lastAttempt: false,
  };
}

describe('an ERA export at its bounds', () => {
  it(`reads an export of ERA_EXPORT_MAX_BYTES, one line per payment, within a ${String(NORMALIZE_HEAP_MIB)} MiB heap`, () => {
    const script = path.join(REPO, 'apps/worker/src/parse/era/test-support/normalize-at-bound.ts');
    const child = spawnSync(process.execPath, [`--max-old-space-size=${String(NORMALIZE_HEAP_MIB)}`, '--import', 'tsx', script], { cwd: REPO, encoding: 'utf8', timeout: 120_000 });
    expect(child.status, child.stderr.slice(-2000)).toBe(0);
    const read = JSON.parse(child.stdout.trim().split('\n').at(-1) ?? '{}') as { bytes: number; payments: number; kind: string; loadable: number };
    expect(read.kind).toBe('payments');
    expect(read.bytes).toBeLessThanOrEqual(ERA_EXPORT_MAX_BYTES);
    expect(read.bytes).toBeGreaterThan(ERA_EXPORT_MAX_BYTES - 1024);
    expect(read.loadable).toBe(read.payments);
    expect(read.payments).toBeGreaterThan(20_000);
  }, 150_000);

  it(`loads an export of ${String(PAYMENTS)} payments holding at most ${String(TRACE_LOCK_BUCKETS)} advisory locks, in bounded memory`, async () => {
    const world = await createTenantWorld(owner, 'era export bounds');
    const key = await provisionPracticeKey(keys, world.practiceId);
    await owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, world.practiceId]);
    const cipher: PracticeCipher = key.cipher;
    const { bytes } = oneLinePaymentsExport({ payments: PAYMENTS });
    const id = randomUUID();
    await withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, (scope) =>
      scope.client.query("INSERT INTO source_document (id, practice_id, kind, format_id, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'era_export', 'webpt_billing_era_v0', $3, 'text/csv', $4)", [
        id,
        world.practiceId,
        bytes.byteLength,
        world.adminUserId,
      ]),
    );
    await documents.write(cipher, documentObjectKey(world.practiceId, id), Readable.from([Buffer.from(bytes)]));
    const queued: { type: JobType; payload: unknown }[] = [];
    await intakeHandler({ documents, landing: new LocalLanding(documents), scan: new LocalScanService(), keys, scanWait: { pollMs: 1, timeoutMs: 20 } })(
      { practice_id: world.practiceId, document_id: id },
      context(world.practiceId, queued),
    );
    expect(queued.map((job) => job.type)).toEqual(['parse_835']);

    const baseline = held();
    let peakMemory = 0;
    let peakLocks = 0;
    let samples = 0;
    let sampling = true;
    // The locks every 25 ms; what the process holds every 250 ms, its full collections being slow.
    const sampler = (async () => {
      while (sampling) {
        const { rows } = await owner.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
        );
        peakLocks = Math.max(peakLocks, rows[0]?.n ?? 0);
        if (samples % 10 === 0) {
          peakMemory = Math.max(peakMemory, held() - baseline);
        }
        samples += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    })();
    try {
      await parseHandler({ documents, keys })({ practice_id: world.practiceId, document_id: id }, context(world.practiceId, queued));
    } finally {
      sampling = false;
      await sampler;
    }
    const remittances = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM remittance WHERE practice_id = $1 AND provenance = 'era_export'", [world.practiceId]);
    expect(remittances.rows[0]?.n).toBe(PAYMENTS);
    expect((await owner.query<{ status: string }>('SELECT status FROM source_document WHERE id = $1', [id])).rows[0]?.status).toBe('loaded');
    expect(samples).toBeGreaterThan(3);
    // The load's own locks were seen, and never more than one per bucket however many payments it has.
    expect(peakLocks).toBeGreaterThan(0);
    expect(peakLocks).toBeLessThanOrEqual(TRACE_LOCK_BUCKETS);
    expect(peakMemory).toBeLessThan(LOAD_MEMORY_BOUND);
  }, 300_000);
});
