import { assertNoPhi, createLogger } from '@tp/observability';
import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { MemoryMailSender } from '../mail/mail';
import { RestoreDrillFailedError } from '../platform/restore-drill';
import type { ObjectStore, PutImmutableRequest } from '../storage/object-store';
import { PLATFORM_JOB_TYPES, PLATFORM_SCHEDULES, createPlatformHandlers, parsePlatformPayload } from './platform';

function capture() {
  const lines: Record<string, unknown>[] = [];
  return { lines, logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }) };
}

const JOB = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382701';

describe('platform job registry', () => {
  it('names the platform jobs and validates their payloads', () => {
    expect(PLATFORM_JOB_TYPES).toEqual(['audit_copy', 'restore_drill', 'support_grant_notices']);
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
});
