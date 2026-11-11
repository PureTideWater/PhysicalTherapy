import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CommitOutcomeUnknownError, TransactionNotCommittedError, recordAuditEvent, withActor, withPracticeScope } from './authz';
import { readDatabaseUrl } from './config';
import { type MigratedDatabase, type TenantWorld, createMigratedDatabase, createTenantWorld, endPool } from './testing';

/**
 * The scopes read COMMIT's answer (Queues item 25 (a); docs/adr/0092's follow-ups): on PostgreSQL itself, work whose
 * code swallowed a failed statement is not reported as done, and nothing of it is saved, its audit event included; an
 * ERROR at COMMIT is the server's own; and a session ended under a COMMIT is an unknown outcome, never a saved one.
 * Synthetic rows only.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let world: TenantWorld;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  world = await createTenantWorld(owner, 'A');
});

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

async function auditEvents(action: string): Promise<number> {
  const { rows } = await owner.query<{ n: string }>('SELECT count(*) AS n FROM audit_event WHERE action = $1 AND actor_id = $2', [action, world.adminUserId]);
  return Number(rows[0]?.n);
}

describe('a scope’s COMMIT is read, on PostgreSQL', () => {
  it('reports work whose failed statement was swallowed as not committed, and saves none of it: no audit event', async () => {
    const before = await auditEvents('settings_changed');
    // A statement fails and the work's own code swallows the error: the transaction is failed from there.
    const swallowed = (client: { query(text: string): Promise<unknown> }) => client.query('SELECT 1 / 0').catch(() => undefined);
    const inPractice = withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, async (scope) => {
      await recordAuditEvent(scope, { action: 'settings_changed', objectType: 'practice', practiceId: world.practiceId, requestId: 'req-commit-answer' });
      await swallowed(scope.client);
      return 'saved';
    });
    await expect(inPractice).rejects.toBeInstanceOf(TransactionNotCommittedError);
    const asActor = withActor(app, world.adminUserId, async (scope) => {
      await recordAuditEvent(scope, { action: 'settings_changed', objectType: 'practice', requestId: 'req-commit-answer' });
      await swallowed(scope.client);
      return 'saved';
    });
    await expect(asActor).rejects.toBeInstanceOf(TransactionNotCommittedError);
    expect(await auditEvents('settings_changed')).toBe(before);
    // The connections went back sound: the next transaction on the pool commits and is saved.
    await expect(
      withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, async (scope) => {
        await recordAuditEvent(scope, { action: 'settings_changed', objectType: 'practice', practiceId: world.practiceId, requestId: 'req-commit-answer' });
        return 'saved';
      }),
    ).resolves.toBe('saved');
    expect(await auditEvents('settings_changed')).toBe(before + 1);
  });

  it('says the outcome is unknown when the session is ended under the COMMIT, and never reports it as saved', async () => {
    const outcome = withActor(app, world.adminUserId, async (scope) => {
      const { rows } = await scope.client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      // pg reports a session ended between two statements as the client's own event; the test listens, so the COMMIT is what fails.
      scope.client.once('error', () => undefined);
      await owner.query('SELECT pg_terminate_backend($1)', [rows[0]?.pid]);
      return 'saved';
    });
    await expect(outcome).rejects.toBeInstanceOf(CommitOutcomeUnknownError);
  });
});
