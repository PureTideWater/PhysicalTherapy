import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type DatabaseClient, databaseClient, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, asOwner, createMigratedDatabase, createTenantWorld } from '@tp/db/testing';
import { assertNoPhi } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LocalObjectStore } from '../storage/local-object-store';
import { ObjectConflictError } from '../storage/object-store';
import { AuditCopyError, auditCopyKey, copyAuditDay, previousDay } from './audit-copy';

/** The nightly audit copy against PostgreSQL: one write-once object per closed UTC day, idempotent. */

let database: MigratedDatabase;
let owner: DatabaseClient;
let root: string;
const NOW = new Date('2026-10-15T01:20:00.000Z');

async function event(at: string, practiceId: string | null, actorId: string): Promise<string> {
  const id = randomUUID();
  await asOwner(owner, [], () =>
    owner.query("INSERT INTO audit_event (id, actor_id, actor_kind, action, object_type, object_id, practice_id, purpose, request_id, at) VALUES ($1, $2, 'user', 'read', 'practice', $3, $3, 'case_review', 'req-1', $4)", [
      id,
      actorId,
      practiceId,
      at,
    ]),
  );
  return id;
}

let ids: string[] = [];
let actor = '';
let practice = '';

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  root = mkdtempSync(path.join(tmpdir(), 'audit-copy-'));
  const world = await createTenantWorld(owner, 'A');
  actor = world.adminUserId;
  practice = world.practiceId;
  ids = [
    await event('2026-10-14T23:59:59.999999Z', practice, actor),
    await event('2026-10-14T00:00:00Z', practice, actor),
    await event('2026-10-14T12:00:00Z', null, actor),
  ];
  await event('2026-10-13T23:59:59Z', practice, actor);
  await event('2026-10-15T00:00:00Z', practice, actor);
});

afterAll(async () => {
  await owner.end();
  await database.drop();
  rmSync(root, { recursive: true, force: true });
});

describe('copyAuditDay', () => {
  it('copies exactly the day’s events, in time order, as JSON lines with seven years of retention', async () => {
    const store = new LocalObjectStore(root);
    const result = await copyAuditDay({ client: owner, store, day: '2026-10-14', now: NOW });
    expect(result).toMatchObject({ day: '2026-10-14', key: 'audit-events/v1/2026/10/14.jsonl', rows: 3, outcome: 'written' });
    const lines = readFileSync(path.join(root, result.key), 'utf8').trimEnd().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines.map((line) => line.id)).toEqual([ids[1], ids[2], ids[0]]);
    expect(lines[0]).toEqual({
      id: ids[1],
      at: '2026-10-14T00:00:00.000000Z',
      actor_id: actor,
      actor_kind: 'user',
      action: 'read',
      object_type: 'practice',
      object_id: practice,
      practice_id: practice,
      grant_id: null,
      purpose: 'case_review',
      request_id: 'req-1',
    });
    expect((await store.head(result.key))?.retainUntil).toEqual(new Date('2033-10-15T00:00:00.000Z'));
    assertNoPhi('s3_key', result.key);
  });

  it('is idempotent per day: a re-run writes nothing and reports the same object', async () => {
    const store = new LocalObjectStore(root);
    const first = await copyAuditDay({ client: owner, store, day: '2026-10-14', now: NOW });
    const again = await copyAuditDay({ client: owner, store, day: '2026-10-14', now: NOW });
    expect(again).toEqual({ ...first, outcome: 'unchanged' });
  });

  it('writes an empty object for a day without events, so every day is accounted for', async () => {
    const result = await copyAuditDay({ client: owner, store: new LocalObjectStore(root), day: '2026-10-01', now: NOW });
    expect(result).toMatchObject({ rows: 0, outcome: 'written' });
    expect(readFileSync(path.join(root, result.key))).toHaveLength(0);
  });

  it('refuses a day that is not over, and a day that is not a date', async () => {
    const store = new LocalObjectStore(root);
    await expect(copyAuditDay({ client: owner, store, day: '2026-10-15', now: NOW })).rejects.toThrow(new AuditCopyError('a day is copied once it is over'));
    await expect(copyAuditDay({ client: owner, store, day: '2026-02-30', now: NOW })).rejects.toThrow(/calendar day/);
    await expect(copyAuditDay({ client: owner, store, day: '14/10/2026', now: NOW })).rejects.toThrow(/calendar day/);
  });

  it('refuses to replace a copy that differs from its day (the tamper alarm)', async () => {
    const other = mkdtempSync(path.join(tmpdir(), 'audit-copy-tampered-'));
    try {
      const store = new LocalObjectStore(other);
      await store.putImmutable({ key: auditCopyKey('2026-10-13'), body: Buffer.from('{}\n'), contentType: 'application/x-ndjson', retainUntil: new Date('2033-10-14T00:00:00Z') });
      await expect(copyAuditDay({ client: owner, store, day: '2026-10-13', now: NOW })).rejects.toThrow(ObjectConflictError);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('defaults to the previous UTC day', () => {
    expect(previousDay(NOW)).toBe('2026-10-14');
    expect(previousDay(new Date('2026-03-01T00:30:00Z'))).toBe('2026-02-28');
    expect(() => auditCopyKey('2026-1-1')).toThrow(AuditCopyError);
  });
});
