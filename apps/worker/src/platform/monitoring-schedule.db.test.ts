import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl, withJobScope } from '@tp/db';
import { type MigratedDatabase, createMigratedDatabase, createTenantWorld } from '@tp/db/testing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryQueue } from '../monitor/test-support/memory-queue';
import { queueMonitoringSchedule } from './monitoring-schedule';

/**
 * The monitoring schedule against PostgreSQL (PRD 5, J11: "or on a schedule"; docs/adr/0039): as the
 * operator role, which reads no table, the schedule learns the active practices' IDs and queues each
 * practice's own monitor, digest and reconcile jobs; nobody else may list the practices.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let operator: DatabasePool;
let app: DatabasePool;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  // The test's superuser login, which may SET ROLE tp_operator, stands in for the operator's login.
  operator = openPool(database.url, 2);
  app = openPool(database.appUrl, 2);
});

afterAll(async () => {
  await app.end();
  await operator.end();
  await owner.end();
  await database.drop();
});

describe('the monitoring schedule', () => {
  it('queues each active practice’s monitor job and reconcile for the day and its digest for the month before, from IDs alone', async () => {
    const one = await createTenantWorld(owner, 'schedule one');
    const two = await createTenantWorld(owner, 'schedule two');
    const queue = new MemoryQueue();
    const client = await operator.connect();
    try {
      const result = await queueMonitoringSchedule({ client, queue: queue.client, day: '2026-11-01' });
      expect(result).toEqual({ practices: 2, queued: 6 });
      // The same morning again: every key is still queued, so the queue takes nothing more.
      expect(await queueMonitoringSchedule({ client, queue: queue.client, day: '2026-11-01' })).toEqual({ practices: 2, queued: 0 });
    } finally {
      client.release();
    }
    const text = (jobs: readonly (readonly [string, unknown])[]) => jobs.map((job) => JSON.stringify(job)).sort();
    expect(text(queue.queued.map((job) => [job.name, job.data] as const))).toEqual(
      text(
        [one.practiceId, two.practiceId].flatMap((practice) => [
          ['digest', { practice_id: practice, period: '2026-10' }] as const,
          ['monitor', { practice_id: practice, day: '2026-11-01' }] as const,
          ['reconcile', { practice_id: practice, day: '2026-11-01' }] as const,
        ]),
      ),
    );
  });

  it('lists the practices for the operator alone', async () => {
    const world = await createTenantWorld(owner, 'schedule refused');
    await expect(withJobScope(app, { jobId: randomUUID(), practiceId: world.practiceId }, (scope) => scope.client.query('SELECT * FROM operator_active_practice_ids()'))).rejects.toMatchObject({ code: '42501' });
  });
});
