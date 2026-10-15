import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { LocalKeyProvider, databaseClient, documentObjectKey, openPool, provisionPracticeKey, readDatabaseUrl, withPracticeScope } from '@tp/db';
import { asOwner, createMigratedDatabase, createTenantWorld, withScratchDatabase } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import { MemorySealedBytes } from './intake/test-support/memory-bytes';
import { enqueue } from './jobs/enqueue';
import { placeholderHandlers } from './jobs/handlers';
import { QUEUE_OPTIONS } from './jobs/registry';
import { databaseJobRuns } from './jobs/runs';
import { parseHandler } from './parse/job';
import { DocumentStore } from './storage/documents';
import { JOB_FAILED_MESSAGE, type QueueClient, startWorker } from './worker';

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const OTHER_PRACTICE = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';
const DOCUMENT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';
const OTHER_DOCUMENT = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c04';

const silent = createLogger({ sink: () => undefined });

describe('worker against PostgreSQL', () => {
  it('refuses a duplicate singleton key while the first job is queued', async () => {
    await withScratchDatabase(readDatabaseUrl(), async (url) => {
      const boss = new PgBoss(url);
      boss.on('error', () => undefined);
      // Start without subscribing handlers so the jobs stay queued.
      await boss.start();
      try {
        await boss.createQueue('parse_835', { policy: 'exclusive' });
        const first = await enqueue(boss, 'parse_835', { practice_id: PRACTICE, document_id: DOCUMENT });
        const replay = await enqueue(boss, 'parse_835', { practice_id: PRACTICE, document_id: DOCUMENT });
        const otherDocument = await enqueue(boss, 'parse_835', { practice_id: PRACTICE, document_id: OTHER_DOCUMENT });
        const otherPractice = await enqueue(boss, 'parse_835', { practice_id: OTHER_PRACTICE, document_id: DOCUMENT });
        expect(first).toEqual(expect.any(String));
        expect(replay).toBeNull();
        expect(otherDocument).toEqual(expect.any(String));
        expect(otherPractice).toEqual(expect.any(String));
      } finally {
        await boss.stop({ graceful: false, close: true });
      }
    });
  });

  it('runs a queued job through its handler and shuts down gracefully', async () => {
    await withScratchDatabase(readDatabaseUrl(), async (url) => {
      const boss = new PgBoss(url);
      boss.on('error', () => undefined);
      let resolveSeen: (jobId: string) => void = () => undefined;
      const seen = new Promise<string>((resolve) => {
        resolveSeen = resolve;
      });
      const pool = openPool(url, 1);
      const worker = await startWorker({
        boss,
        pool,
        logger: silent,
        heartbeatMs: 60_000,
        handlers: {
          ...placeholderHandlers,
          digest: async (payload, context) => {
            expect(payload).toEqual({ practice_id: PRACTICE, period: '2026-10' });
            // The job's transaction holds exactly its practice and the job as the actor.
            const settings = await context.transaction(async (scope) =>
              (await scope.client.query<{ practices: string; actor: string }>("SELECT current_setting('app.practice_ids') AS practices, current_setting('app.actor_id') AS actor")).rows[0],
            );
            expect(settings).toEqual({ practices: `{${PRACTICE}}`, actor: context.jobId });
            resolveSeen(context.jobId);
          },
        },
      });
      try {
        const id = await enqueue(boss, 'digest', { practice_id: PRACTICE, period: '2026-10' });
        expect(await seen).toBe(id);
      } finally {
        await worker.stop();
        await pool.end();
      }
    });
  }, 30_000);
});

type WorkHandler = (jobs: { id: string; data: unknown; retryCount?: number }[]) => Promise<unknown>;

/** A queue client that hands each queue's handler to the test instead of polling pg-boss. */
function directQueue() {
  const handlers = new Map<string, WorkHandler>();
  const client = {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    createQueue: () => Promise.resolve(),
    work: (name: string, _options: unknown, handler: WorkHandler) => {
      handlers.set(name, handler);
      return Promise.resolve(name);
    },
    schedule: () => Promise.resolve(),
    send: () => Promise.resolve(null),
  } as unknown as QueueClient;
  return { client, handlers };
}

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');

describe('practice jobs against PostgreSQL', () => {
  it('replays the JOB-01 parse job with the same key and has no duplicate effects (JOB-01)', async () => {
    const database = await createMigratedDatabase(readDatabaseUrl());
    const owner = databaseClient(database.url);
    await owner.connect();
    const pool = openPool(database.appUrl, 2);
    try {
      const world = await createTenantWorld(owner, 'job-01');
      const keys = LocalKeyProvider.random();
      const key = await provisionPracticeKey(keys, world.practiceId);
      await owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, world.practiceId]);
      const expected = JSON.parse(readFileSync(path.join(FIXTURES, 'JOB-01/expected.json'), 'utf8')) as { outcome: { remittanceRows: number; claimRows: number } };
      const bytes = readFileSync(path.join(FIXTURES, 'JOB-01/remit.835'));
      const documentId = randomUUID();
      await withPracticeScope(pool, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, (scope) =>
        scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'x12_835', $3, 'application/octet-stream', $4)", [
          documentId,
          world.practiceId,
          bytes.length,
          world.adminUserId,
        ]),
      );
      const documents = new DocumentStore(new MemorySealedBytes());
      await documents.write(key.cipher, documentObjectKey(world.practiceId, documentId), Readable.from([bytes]));
      await asOwner(owner, [world.practiceId], () =>
        owner.query("UPDATE source_document SET sha256 = $2, scan_status = 'clean', scan_at = now(), status = 'scanned' WHERE id = $1", [documentId, createHash('sha256').update(bytes).digest('hex')]),
      );
      const { client, handlers } = directQueue();
      const worker = await startWorker({ boss: client, pool, logger: silent, runs: databaseJobRuns(pool), handlers: { ...placeholderHandlers, parse_835: parseHandler({ documents, keys }) }, heartbeatMs: 60_000 });
      try {
        const job = { id: randomUUID(), data: { practice_id: world.practiceId, document_id: documentId } };
        await handlers.get('parse_835')?.([job]);
        // The same key again, as a replay after the first run finished.
        await handlers.get('parse_835')?.([{ ...job, id: randomUUID() }]);
      } finally {
        await worker.stop();
      }
      const counts = await owner.query<{ remittances: number; claims: number }>(
        'SELECT (SELECT count(*)::int FROM remittance WHERE practice_id = $1) AS remittances, (SELECT count(*)::int FROM claim WHERE practice_id = $1) AS claims',
        [world.practiceId],
      );
      expect(counts.rows[0]).toEqual({ remittances: expected.outcome.remittanceRows, claims: expected.outcome.claimRows });
      expect((await owner.query<{ outcome: string }>('SELECT outcome FROM job_run WHERE practice_id = $1', [world.practiceId])).rows).toEqual([{ outcome: 'succeeded' }, { outcome: 'succeeded' }]);
    } finally {
      await pool.end();
      await owner.end();
      await database.drop();
    }
  });

  it('raises the operator alert on the third failure and records the run failed for the dashboard (JOB-02)', async () => {
    const database = await createMigratedDatabase(readDatabaseUrl());
    const owner = databaseClient(database.url);
    await owner.connect();
    const pool = openPool(database.appUrl, 2);
    const lines: Record<string, unknown>[] = [];
    try {
      const world = await createTenantWorld(owner, 'job-02');
      const { client, handlers } = directQueue();
      const worker = await startWorker({
        boss: client,
        pool,
        logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }),
        runs: databaseJobRuns(pool),
        handlers: { ...placeholderHandlers, parse_835: () => Promise.reject(new Error('synthetic failure')) },
        heartbeatMs: 60_000,
      });
      const jobId = randomUUID();
      const run = (retryCount: number) => handlers.get('parse_835')?.([{ id: jobId, retryCount, data: { practice_id: world.practiceId, document_id: DOCUMENT } }]);
      const states: unknown[] = [];
      try {
        for (let retryCount = 0; retryCount <= QUEUE_OPTIONS.retryLimit; retryCount += 1) {
          await expect(run(retryCount)).rejects.toThrow('synthetic failure');
          states.push((await owner.query('SELECT attempts, outcome, error_code FROM job_run WHERE job_id = $1', [jobId])).rows[0]);
        }
      } finally {
        await worker.stop();
      }
      expect(states).toEqual([
        { attempts: 1, outcome: 'retrying', error_code: 'JOB_FAILED' },
        { attempts: 2, outcome: 'retrying', error_code: 'JOB_FAILED' },
        { attempts: 3, outcome: 'failed', error_code: 'JOB_FAILED' },
      ]);
      expect(lines.filter((line) => line.msg === JOB_FAILED_MESSAGE)).toEqual([expect.objectContaining({ job_id: jobId, job_type: 'parse_835', error_code: 'JOB_FAILED' })]);
      const [row] = (await owner.query('SELECT practice_id, job_type, singleton_key, idempotency_key, finished_at IS NOT NULL AS finished FROM job_run WHERE job_id = $1', [jobId])).rows;
      expect(row).toEqual({ practice_id: world.practiceId, job_type: 'parse_835', singleton_key: `parse_835:${world.practiceId}:${DOCUMENT}`, idempotency_key: DOCUMENT, finished: true });
    } finally {
      await pool.end();
      await owner.end();
      await database.drop();
    }
  });
});
