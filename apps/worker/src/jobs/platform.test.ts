import { assertNoPhi, createLogger } from '@tp/observability';
import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { MemoryMailSender } from '../mail/mail';
import { RestoreDrillFailedError } from '../platform/restore-drill';
import type { ObjectStore, PutImmutableRequest } from '../storage/object-store';
import { NoQueueError, PLATFORM_JOB_TYPES, PLATFORM_SCHEDULES, createPlatformHandlers, parsePlatformPayload } from './platform';

function capture() {
  const lines: Record<string, unknown>[] = [];
  return { lines, logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }) };
}

const JOB = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382701';

describe('platform job registry', () => {
  it('names the platform jobs and validates their payloads', () => {
    expect(PLATFORM_JOB_TYPES).toEqual(['audit_copy', 'restore_drill', 'support_grant_notices', 'monitoring_schedule', 'billing_dunning', 'usage_snapshot', 'support_mail']);
    expect(parsePlatformPayload('billing_dunning', {})).toEqual({});
    expect(parsePlatformPayload('usage_snapshot', { day: '2026-11-01' })).toEqual({ day: '2026-11-01' });
    expect(() => parsePlatformPayload('billing_dunning', { organization_id: JOB })).toThrow(ZodError);
    expect(parsePlatformPayload('monitoring_schedule', {})).toEqual({});
    expect(parsePlatformPayload('monitoring_schedule', { day: '2026-11-01' })).toEqual({ day: '2026-11-01' });
    expect(() => parsePlatformPayload('monitoring_schedule', { practice_id: JOB })).toThrow(ZodError);
    expect(parsePlatformPayload('support_grant_notices', {})).toEqual({});
    expect(() => parsePlatformPayload('support_grant_notices', { practice_id: JOB })).toThrow(ZodError);
    expect(parsePlatformPayload('audit_copy', {})).toEqual({});
    expect(parsePlatformPayload('audit_copy', null)).toEqual({});
    expect(parsePlatformPayload('audit_copy', { day: '2026-10-14' })).toEqual({ day: '2026-10-14' });
    expect(parsePlatformPayload('restore_drill', undefined)).toEqual({});
    expect(() => parsePlatformPayload('audit_copy', { day: '2026-10-14', practice_id: JOB })).toThrow(ZodError);
    expect(() => parsePlatformPayload('audit_copy', { day: '14/10/2026' })).toThrow(ZodError);
    expect(() => parsePlatformPayload('restore_drill', { snapshot: 'x' })).toThrow(ZodError);
  });

  it('carries no PHI in any payload it accepts', () => {
    assertNoPhi('job_payload', parsePlatformPayload('audit_copy', { day: '2026-10-14' }));
    assertNoPhi('job_payload', parsePlatformPayload('restore_drill', {}));
    assertNoPhi('job_payload', parsePlatformPayload('support_grant_notices', {}));
    assertNoPhi('job_payload', parsePlatformPayload('support_mail', {}));
    expect(() => parsePlatformPayload('support_mail', { sender: 'someone@synthetic.test' })).toThrow(ZodError);
  });

  it('reads support mail every five minutes', () => {
    const boss = new PgBoss('postgres://nobody@localhost:1/none');
    const from = new Date('2026-10-15T00:01:00Z');
    expect(boss.previewSchedule(PLATFORM_SCHEDULES.support_mail, { from, count: 2, tz: 'UTC' })).toEqual([new Date('2026-10-15T00:05:00Z'), new Date('2026-10-15T00:10:00Z')]);
  });

  it('queues the monitoring schedule daily at 05:10 UTC', () => {
    const boss = new PgBoss('postgres://nobody@localhost:1/none');
    const from = new Date('2026-10-31T06:00:00Z');
    expect(boss.previewSchedule(PLATFORM_SCHEDULES.monitoring_schedule, { from, count: 2, tz: 'UTC' })).toEqual([new Date('2026-11-01T05:10:00Z'), new Date('2026-11-02T05:10:00Z')]);
  });

  it('sends the dunning notices daily at 14:10 UTC and takes the usage snapshot nightly at 00:40 UTC', () => {
    const boss = new PgBoss('postgres://nobody@localhost:1/none');
    const from = new Date('2026-10-31T06:00:00Z');
    expect(boss.previewSchedule(PLATFORM_SCHEDULES.billing_dunning, { from, count: 2, tz: 'UTC' })).toEqual([new Date('2026-10-31T14:10:00Z'), new Date('2026-11-01T14:10:00Z')]);
    expect(boss.previewSchedule(PLATFORM_SCHEDULES.usage_snapshot, { from, count: 2, tz: 'UTC' })).toEqual([new Date('2026-11-01T00:40:00Z'), new Date('2026-11-02T00:40:00Z')]);
  });

  it('sends the support-grant notices every minute', () => {
    const boss = new PgBoss('postgres://nobody@localhost:1/none');
    const from = new Date('2026-10-15T00:00:30Z');
    expect(boss.previewSchedule(PLATFORM_SCHEDULES.support_grant_notices, { from, count: 2, tz: 'UTC' })).toEqual([new Date('2026-10-15T00:01:00Z'), new Date('2026-10-15T00:02:00Z')]);
  });

  it('copies the audit log nightly after midnight UTC and drills on the first Monday of each month', () => {
    const boss = new PgBoss('postgres://nobody@localhost:1/none');
    const from = new Date('2026-10-15T00:00:00Z');
    expect(boss.previewSchedule(PLATFORM_SCHEDULES.audit_copy, { from, count: 2, tz: 'UTC' })).toEqual([new Date('2026-10-15T01:20:00Z'), new Date('2026-10-16T01:20:00Z')]);
    expect(boss.previewSchedule(PLATFORM_SCHEDULES.restore_drill, { from, count: 3, tz: 'UTC' })).toEqual([
      new Date('2026-11-02T06:00:00Z'),
      new Date('2026-12-07T06:00:00Z'),
      new Date('2027-01-04T06:00:00Z'),
    ]);
  });
});

function operator(answer: (text: string) => unknown[] = () => []) {
  const released: (boolean | undefined)[] = [];
  return {
    released,
    pool: {
      connect: () =>
        Promise.resolve({
          query: (text: string) => Promise.resolve({ rows: answer(text) }),
          release: (destroy?: boolean) => {
            released.push(destroy);
          },
        }),
    },
  };
}

function memoryStore(): ObjectStore & { puts: PutImmutableRequest[] } {
  const puts: PutImmutableRequest[] = [];
  return {
    puts,
    putImmutable: (request) => {
      puts.push(request);
      return Promise.resolve(puts.length === 1 ? 'written' : 'unchanged');
    },
    head: () => Promise.resolve(null),
  };
}

describe('platform handlers', () => {
  const now = () => new Date('2026-10-15T01:20:00Z');
  const neverRestored = { restoreLatest: () => Promise.reject(new Error('not used')) };
  const notices = { mail: new MemoryMailSender(), appOrigin: 'http://localhost:3000' };

  it('copies yesterday by default, a named day when given, and logs IDs only', async () => {
    const store = memoryStore();
    const { pool, released } = operator();
    const handlers = createPlatformHandlers({ operator: pool, store, restorer: neverRestored, now, ...notices });
    const { lines, logger } = capture();
    await handlers.audit_copy({}, { jobId: JOB, logger });
    await handlers.audit_copy({ day: '2026-10-14' }, { jobId: JOB, logger });
    expect(store.puts.map((put) => put.key)).toEqual(['audit-events/v1/2026/10/14.jsonl', 'audit-events/v1/2026/10/14.jsonl']);
    expect(lines.map((line) => line.msg)).toEqual(['audit copy written', 'audit copy already present']);
    expect(lines[0]).toMatchObject({ job_id: JOB });
    expect(released).toEqual([false, false]);
  });

  it('returns a connection it broke to the pool as unusable', async () => {
    const { pool, released } = operator();
    const handlers = createPlatformHandlers({ operator: pool, store: memoryStore(), restorer: neverRestored, now, ...notices });
    await expect(handlers.audit_copy({ day: '2026-10-15' }, { jobId: JOB, logger: capture().logger })).rejects.toThrow(/once it is over/);
    expect(released).toEqual([true]);
  });

  it('logs a failed drill before failing the job, so it retries and then alerts', async () => {
    const { pool } = operator((text) => (text.startsWith('INSERT INTO restore_drill') ? [{ id: JOB }] : text.includes('count(*)') ? [{ n: '1' }] : text.includes('pg_class') ? [] : []));
    const restored = { snapshotRef: 's', targetRef: 't', databaseUrl: 'postgres://x', destroy: () => Promise.resolve() };
    const failing = createPlatformHandlers({ operator: pool, store: memoryStore(), restorer: { restoreLatest: () => Promise.reject(new Error('no snapshot')) }, now, ...notices });
    const { lines, logger } = capture();
    await expect(failing.restore_drill({}, { jobId: JOB, logger })).rejects.toThrow(RestoreDrillFailedError);
    expect(lines.at(-1)).toMatchObject({ msg: 'restore drill failed', job_id: JOB, restore_drill_id: JOB, error_code: 'RESTORE_FAILED' });
    const broken = createPlatformHandlers({
      operator: { connect: () => Promise.reject(new Error('no operator')) },
      store: memoryStore(),
      restorer: { restoreLatest: () => Promise.resolve(restored) },
      now,
      ...notices,
    });
    await expect(broken.restore_drill({}, { jobId: JOB, logger })).rejects.toThrow('no operator');
    expect(lines.at(-1)?.msg).toBe('restore drill failed');
  });

  it('queues each active practice’s own monitor job for the day, digest for the month before and reconcile for the day, as the operator', async () => {
    const practices = ['1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02', '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01'];
    const statements: string[] = [];
    const { pool, released } = operator((text) => {
      statements.push(text);
      return text.includes('operator_active_practice_ids') ? practices.map((id) => ({ id })) : [];
    });
    const sent: { name: string; data: unknown; options: unknown }[] = [];
    const queue = {
      send: (name: string, data: object | null, options: unknown) => {
        sent.push({ name, data, options });
        // The second practice's digest is already queued: the queue refuses its key.
        return Promise.resolve(sent.length === 5 ? null : `job-${String(sent.length)}`);
      },
    } as unknown as NonNullable<Parameters<typeof createPlatformHandlers>[0]['queue']>;
    const handlers = createPlatformHandlers({ operator: pool, store: memoryStore(), restorer: neverRestored, now: () => new Date('2026-11-01T05:10:00Z'), queue, ...notices });
    const { lines, logger } = capture();
    await handlers.monitoring_schedule({}, { jobId: JOB, logger });
    expect(statements.slice(0, 3)).toEqual(['BEGIN', 'SET LOCAL ROLE tp_operator', "SELECT set_config('app.practice_ids', '{}', true)"]);
    expect(statements).toContain('COMMIT');
    expect(sent).toEqual(
      practices.flatMap((practice) => [
        { name: 'monitor', data: { practice_id: practice, day: '2026-11-01' }, options: { singletonKey: `monitor:${practice}:2026-11-01` } },
        { name: 'digest', data: { practice_id: practice, period: '2026-10' }, options: { singletonKey: `digest:${practice}:2026-10` } },
        { name: 'reconcile', data: { practice_id: practice, day: '2026-11-01' }, options: { singletonKey: `reconcile:${practice}:2026-11-01` } },
      ]),
    );
    expect(lines.at(-1)).toMatchObject({ msg: 'monitoring schedule queued the practices’ jobs', job_id: JOB });
    expect(released).toEqual([false]);
    await handlers.monitoring_schedule({ day: '2027-01-15' }, { jobId: JOB, logger });
    expect(sent.slice(6).map((item) => item.data)).toEqual(
      practices.flatMap((practice) => [{ practice_id: practice, day: '2027-01-15' }, { practice_id: practice, period: '2026-12' }, { practice_id: practice, day: '2027-01-15' }]),
    );
  });

  it('says so when there is no active practice, and refuses to run without a queue', async () => {
    const { pool } = operator();
    const queue = { send: () => Promise.resolve('never') } as unknown as NonNullable<Parameters<typeof createPlatformHandlers>[0]['queue']>;
    const { lines, logger } = capture();
    await createPlatformHandlers({ operator: pool, store: memoryStore(), restorer: neverRestored, now, queue, ...notices }).monitoring_schedule({}, { jobId: JOB, logger });
    expect(lines.at(-1)?.msg).toBe('monitoring schedule found no active practice');
    await expect(createPlatformHandlers({ operator: pool, store: memoryStore(), restorer: neverRestored, now, ...notices }).monitoring_schedule({}, { jobId: JOB, logger })).rejects.toThrow(NoQueueError);
  });

  it('rolls the operator’s transaction back when the practices cannot be read', async () => {
    const statements: string[] = [];
    const { pool, released } = operator((text) => {
      statements.push(text);
      if (text.includes('operator_active_practice_ids')) {
        throw new Error('permission denied');
      }
      return [];
    });
    const queue = { send: () => Promise.resolve('never') } as unknown as NonNullable<Parameters<typeof createPlatformHandlers>[0]['queue']>;
    await expect(createPlatformHandlers({ operator: pool, store: memoryStore(), restorer: neverRestored, now, queue, ...notices }).monitoring_schedule({}, { jobId: JOB, logger: capture().logger })).rejects.toThrow('permission denied');
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(released).toEqual([true]);
  });
});
