import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type DatabaseClient, OWNER_ROLE, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, asOwner, createMigratedDatabase, createScratchDatabase, createTenantWorld } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPlatformHandlers } from '../jobs/platform';
import { MemoryMailSender } from '../mail/mail';
import { PgDumpRestorer } from './pg-dump-restorer';
import { type EvidenceClient, RestoreDrillFailedError, type RestoredInstance, type SnapshotRestorer, countRows, runRestoreDrill } from './restore-drill';

/**
 * A restorer for this test only: the "snapshot" is a server-side copy of the source database
 * (CREATE DATABASE ... TEMPLATE), which works with client tools of any version. The source must have
 * no other connections while it is copied, so its sessions are closed first.
 */
class TemplateRestorer implements SnapshotRestorer {
  constructor(private readonly options: { readonly adminUrl: string; readonly source: string }) {}

  async restoreLatest(): Promise<RestoredInstance> {
    const scratch = `tp_restore_${randomUUID().replaceAll('-', '')}`;
    const admin = databaseClient(this.options.adminUrl);
    await admin.connect();
    try {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [this.options.source]);
      await admin.query(`CREATE DATABASE ${scratch} TEMPLATE ${this.options.source}`);
    } finally {
      await admin.end();
    }
    const url = new URL(this.options.adminUrl);
    url.pathname = `/${scratch}`;
    return {
      snapshotRef: `template:${this.options.source}`,
      targetRef: `database:${scratch}`,
      databaseUrl: url.toString(),
      destroy: async () => {
        const dropper = databaseClient(this.options.adminUrl);
        await dropper.connect();
        try {
          await dropper.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`);
        } finally {
          await dropper.end();
        }
      },
    };
  }
}

/** An evidence connection opened on first use: the copy above closes the source's sessions first. */
function lazyEvidence(url: string): EvidenceClient & { end(): Promise<void> } {
  let client: DatabaseClient | undefined;
  return {
    query: async (text, values) => {
      if (client === undefined) {
        client = databaseClient(url);
        await client.connect();
      }
      return client.query(text, values);
    },
    end: async () => {
      await client?.end();
    },
  };
}

/**
 * The restore drill against PostgreSQL (test matrix SEC-13): the latest snapshot is restored to a
 * scratch database, the row counts and the catalog test pass on it, the evidence row is written, and
 * the scratch copy is destroyed. The local restorer needs pg_dump and pg_restore at least as new as
 * the server; where they are older (a newer server than the installed client tools, as on a CI
 * runner against the postgres:18 service), the drill through them is skipped with that reason. A
 * restore of the source itself still runs everywhere: a server-side copy (CREATE DATABASE ...
 * TEMPLATE, which needs no client tools) restores the source, and the row counts and the catalog test
 * must pass on it.
 */

const adminUrl = readDatabaseUrl();
let source: MigratedDatabase;
let owner: DatabaseClient;
let workDir: string;
let restorer: PgDumpRestorer;
let compatible: { ok: true } | { ok: false; reason: string };

beforeAll(async () => {
  source = await createMigratedDatabase(adminUrl);
  owner = databaseClient(source.url);
  await owner.connect();
  const world = await createTenantWorld(owner, 'A');
  await createTenantWorld(owner, 'B');
  await asOwner(owner, [world.practiceId], () =>
    owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, practice_id) VALUES ($1, 'user', 'grant_created', 'grant', $2)", [world.adminUserId, world.practiceId]),
  );
  workDir = mkdtempSync(path.join(tmpdir(), 'restore-drill-'));
  restorer = new PgDumpRestorer({ sourceUrl: source.url, adminUrl, workDir, ...(process.env.PG_BIN_DIR === undefined ? {} : { binDir: process.env.PG_BIN_DIR }) });
  compatible = await restorer.compatibility();
  if (!compatible.ok) {
    process.stderr.write(`restore-drill.db.test: the pg_dump drill is skipped: ${compatible.reason}\n`);
  }
});

afterAll(async () => {
  await owner.end();
  await source.drop();
  rmSync(workDir, { recursive: true, force: true });
});

async function evidence(id: string) {
  const { rows } = await owner.query<Record<string, unknown>>('SELECT snapshot_ref, target_ref, outcome, row_counts, catalog_problems, error_code, duration_ms FROM restore_drill WHERE id = $1', [id]);
  return rows[0];
}

async function databaseExists(name: string): Promise<boolean> {
  const admin = databaseClient(adminUrl);
  await admin.connect();
  try {
    return (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount === 1;
  } finally {
    await admin.end();
  }
}

describe('the restore_drill job handler', () => {
  it('runs a passing drill on the operator connection and logs its evidence ID', async () => {
    const copy = await createMigratedDatabase(adminUrl);
    const operator = openPool(source.url, 1);
    const lines: Record<string, unknown>[] = [];
    try {
      const handlers = createPlatformHandlers({
        operator,
        store: { putImmutable: () => Promise.reject(new Error('unused')), head: () => Promise.resolve(null) },
        restorer: { restoreLatest: () => Promise.resolve({ snapshotRef: 'synthetic', targetRef: `database:${copy.name}`, databaseUrl: copy.url, destroy: () => copy.drop() }) },
        mail: new MemoryMailSender(),
        appOrigin: 'http://localhost:3000',
      });
      const jobId = randomUUID();
      await handlers.restore_drill({}, { jobId, logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }) });
      expect(lines).toEqual([expect.objectContaining({ msg: 'restore drill passed', job_id: jobId, restore_drill_id: expect.any(String) })]);
      expect(await evidence(String(lines[0]?.restore_drill_id))).toMatchObject({ outcome: 'passed', snapshot_ref: 'synthetic' });
    } finally {
      await operator.end();
    }
  });
});

describe('countRows', () => {
  it('counts every table exactly, PHI tables included, as the owner with every practice in scope', async () => {
    const counts = await countRows(owner);
    // audit_event: the one written above, and the security event each practice administrator's membership raised.
    // phi_table_registry: one row per PHI table the migrations register (practice, grant, support_grant, ...).
    const registered = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM phi_table_registry');
    expect(counts).toMatchObject({ practice: 2, organization: 2, user: 2, membership: 2, agreement: 2, audit_event: 3, grant: 0, phi_table_registry: registered.rows[0]?.n, source_document: 0, payer: 0, plan: 0 });
    expect(counts.phi_table_registry).toBeGreaterThanOrEqual(6);
    expect(counts.schema_migrations).toBeGreaterThan(0);
  });
});

describe('the restore drill on a server-side copy of the source (any client tools)', () => {
  it('restores the source, passes the row counts and the catalog test on the copy, records the evidence and destroys the copy', async () => {
    const copySource = await createMigratedDatabase(adminUrl);
    const seed = databaseClient(copySource.url);
    await seed.connect();
    const world = await createTenantWorld(seed, 'copied');
    await createTenantWorld(seed, 'copied too');
    await asOwner(seed, [world.practiceId], () =>
      seed.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, practice_id) VALUES ($1, 'user', 'grant_created', 'grant', $2)", [world.adminUserId, world.practiceId]),
    );
    const before = await countRows(seed);
    await seed.end();
    const evidenceClient = lazyEvidence(copySource.url);
    try {
      const result = await runRestoreDrill({ restorer: new TemplateRestorer({ adminUrl, source: copySource.name }), evidence: evidenceClient });
      expect(result).toMatchObject({ outcome: 'passed', catalogProblems: [], errorCode: null, snapshotRef: `template:${copySource.name}` });
      expect(result.rowCounts).toEqual(before);
      expect(result.rowCounts).toMatchObject({ practice: 2, organization: 2, user: 2, membership: 2, agreement: 2 });
      expect(await databaseExists(result.targetRef.replace('database:', ''))).toBe(false);
      const { rows } = await evidenceClient.query('SELECT outcome, row_counts FROM restore_drill WHERE id = $1', [result.id]);
      expect(rows).toEqual([{ outcome: 'passed', row_counts: before }]);
    } finally {
      await evidenceClient.end();
      await copySource.drop();
    }
  });
});

describe('the restore drill', () => {
  it('restores the latest snapshot to a scratch database, passes the row counts and the catalog test there, records the evidence and destroys the copy', async (context) => {
    if (!compatible.ok) {
      context.skip();
    }
    const before = await countRows(owner);
    const result = await runRestoreDrill({ restorer, evidence: owner });
    expect(result.outcome).toBe('passed');
    expect(result.catalogProblems).toEqual([]);
    // The snapshot is the source as it was: every count matches, the evidence row aside.
    expect(result.rowCounts).toEqual(before);
    expect((await countRows(owner)).restore_drill).toBe((before.restore_drill ?? 0) + 1);
    const row = await evidence(result.id);
    expect(row).toMatchObject({ outcome: 'passed', snapshot_ref: result.snapshotRef, target_ref: result.targetRef, catalog_problems: [], error_code: null });
    expect(row?.row_counts).toEqual(result.rowCounts);
    expect(await databaseExists(result.targetRef.replace('database:', ''))).toBe(false);
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('fails, with evidence, when the restored copy breaks the catalog test', async () => {
    const copy = await createMigratedDatabase(adminUrl);
    const broken = databaseClient(copy.url);
    await broken.connect();
    await broken.query(`SET ROLE ${OWNER_ROLE}`);
    await broken.query('CREATE TABLE stray_phi (id uuid PRIMARY KEY, practice_id uuid NOT NULL)');
    await broken.end();
    let destroyed = false;
    const error = await runRestoreDrill({
      restorer: { restoreLatest: () => Promise.resolve({ snapshotRef: 'synthetic-snapshot', targetRef: `database:${copy.name}`, databaseUrl: copy.url, destroy: async () => ((destroyed = true), await copy.drop()) }) },
      evidence: owner,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RestoreDrillFailedError);
    const { result } = error as RestoreDrillFailedError;
    expect(result.errorCode).toBe('CATALOG_FAILED');
    expect(result.catalogProblems).toEqual(expect.arrayContaining(['table stray_phi has practice_id but does not ENABLE and FORCE ROW LEVEL SECURITY']));
    expect(await evidence(result.id)).toMatchObject({ outcome: 'failed', error_code: 'CATALOG_FAILED' });
    expect(destroyed).toBe(true);
  });

  it('fails, with evidence, when nothing could be restored or the copy cannot be read', async () => {
    const failed = await runRestoreDrill({ restorer: { restoreLatest: () => Promise.reject(new Error('no snapshot')) }, evidence: owner }).catch((caught: unknown) => caught);
    expect((failed as RestoreDrillFailedError).result).toMatchObject({ outcome: 'failed', errorCode: 'RESTORE_FAILED', snapshotRef: 'unavailable', targetRef: 'none' });
    const empty = await createScratchDatabase(adminUrl);
    const unreadable = await runRestoreDrill({
      restorer: { restoreLatest: () => Promise.resolve({ snapshotRef: 's', targetRef: 't', databaseUrl: empty.url, destroy: () => empty.drop() }) },
      evidence: owner,
    }).catch((caught: unknown) => caught);
    expect((unreadable as RestoreDrillFailedError).result.errorCode).toBe('VERIFY_FAILED');
    expect(existsSync(workDir)).toBe(true);
  });

  it('fails when the copy holds no applied migrations, or cannot be destroyed', async () => {
    const copy = await createMigratedDatabase(adminUrl);
    const cleaner = databaseClient(copy.url);
    await cleaner.connect();
    await cleaner.query('DELETE FROM schema_migrations');
    await cleaner.end();
    const empty = await runRestoreDrill({
      restorer: { restoreLatest: () => Promise.resolve({ snapshotRef: 's', targetRef: 't', databaseUrl: copy.url, destroy: () => Promise.reject(new Error('stuck')) }) },
      evidence: owner,
    }).catch((caught: unknown) => caught);
    expect((empty as RestoreDrillFailedError).result.errorCode).toBe('NO_MIGRATIONS_RESTORED');
    const stuck = await createMigratedDatabase(adminUrl);
    const undestroyed = await runRestoreDrill({
      restorer: { restoreLatest: () => Promise.resolve({ snapshotRef: 's', targetRef: 't', databaseUrl: stuck.url, destroy: () => Promise.reject(new Error('stuck')) }) },
      evidence: owner,
    }).catch((caught: unknown) => caught);
    expect((undestroyed as RestoreDrillFailedError).result.errorCode).toBe('DESTROY_FAILED');
    await copy.drop();
    await stuck.drop();
  });
});
