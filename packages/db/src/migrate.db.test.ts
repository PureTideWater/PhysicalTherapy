import { copyFileSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { POSTGRES_TYPES } from './domain-model/cross-check';
import { MIGRATIONS_DIR, MigrationError, migrate, readMigrations } from './migrate';
import { APP_DEV_LOGIN, APP_ROLE, OWNER_ROLE, SCREENING_DEV_LOGIN, SCREENING_ROLE, appDevLoginUrl } from './roles';
import { createHash, randomUUID } from 'node:crypto';
import * as schema from './schema';
import { withScratchDatabase } from './testing';

const adminUrl = readDatabaseUrl();

async function query<T extends pg.QueryResultRow>(url: string, text: string, values: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

let dir = '';

/**
 * Everything a migration can change, as sorted text: relations and their owners, columns, functions,
 * triggers, schemas, grants on public tables, and the applied migrations. Two equal snapshots mean
 * the database is where it was.
 */
async function catalogSnapshot(url: string): Promise<string[]> {
  const rows = await query<{ line: string }>(
    url,
    `SELECT line FROM (
       SELECT 'relation ' || n.nspname || '.' || c.relname || ' ' || c.relkind::text || ' ' || pg_get_userbyid(c.relowner) || ' ' || coalesce(array_to_string(c.relacl, ','), '') AS line
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
       UNION ALL
       SELECT 'column ' || c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
       UNION ALL
       SELECT 'function ' || p.proname || ' ' || pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
       UNION ALL
       SELECT 'trigger ' || t.tgname || ' on ' || t.tgrelid::regclass::text FROM pg_trigger t WHERE NOT t.tgisinternal
       UNION ALL
       SELECT 'schema ' || nspname || ' ' || pg_get_userbyid(nspowner) || ' ' || coalesce(array_to_string(nspacl, ','), '') FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
       UNION ALL
       SELECT 'migration ' || filename || ' ' || checksum FROM schema_migrations WHERE to_regclass('public.schema_migrations') IS NOT NULL
     ) snapshot ORDER BY line`,
  ).catch(async (error: unknown) => {
    // Before the first migration there is no schema_migrations table to read.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01') {
      return query<{ line: string }>(
        url,
        "SELECT 'relation ' || relname AS line FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' ORDER BY 1",
      );
    }
    throw error;
  });
  return rows.map((row) => row.line);
}

const PROBE = '29991231235959_dry_run_probe.sql';
const PROBE_SQL = `CREATE TABLE dry_run_probe (id integer PRIMARY KEY, note text NOT NULL DEFAULT '');
CREATE FUNCTION dry_run_probe_count() RETURNS bigint LANGUAGE sql AS $$ SELECT count(*) FROM dry_run_probe $$;
ALTER TABLE rule_release ADD COLUMN dry_run_probe text;`;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'migrations-db-'));
  for (const migration of readMigrations(MIGRATIONS_DIR)) {
    copyFileSync(path.join(MIGRATIONS_DIR, migration.name), path.join(dir, migration.name));
  }
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('migrate', () => {
  it('applies every migration to an empty database, as the owner, once', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      const first = await migrate({ databaseUrl: url, migrationsDir: dir });
      expect(first).toEqual({ applied: readMigrations(dir).map((migration) => migration.name), alreadyApplied: [], dryRun: false });
      const second = await migrate({ databaseUrl: url, migrationsDir: dir });
      expect(second).toEqual({ applied: [], alreadyApplied: first.applied, dryRun: false });

      const rows = await query<{ filename: string; checksum: string }>(url, 'SELECT filename, checksum FROM schema_migrations');
      expect(rows).toEqual(readMigrations(dir).map((migration) => ({ filename: migration.name, checksum: migration.checksum })));
      const owners = await query<{ relname: string; owner: string }>(
        url,
        "SELECT c.relname, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1",
      );
      expect(owners).toEqual(
        [
          'adjustment',
          'agreement',
          'agreement_event',
          'anomaly',
          'audit_event',
          'audit_report',
          'audit_report_download',
          'billing_event',
          'case',
          'case_activity',
          'case_line',
          'claim',
          'compliance_record',
          'contract',
          'contract_calendar_event',
          'contract_question',
          'contract_version',
          'digest',
          'dunning_notice_recipient',
          'eft_row',
          'eval_example',
          'feature_flag',
          'grant',
          'invitation',
          'invoice',
          'job_run',
          'ledger_entry',
          'ledger_match',
          'line_note',
          'line_status',
          'line_status_head',
          'mail_recipient_key',
          'mail_send',
          'mail_stream',
          'marketing_campaign',
          'membership',
          'model_budget_hold',
          'model_call',
          'model_proposal',
          'mutation_request',
          'notification',
          'organization',
          'organization_status_change',
          'packet',
          'packet_version',
          'parse_report',
          'patient_ref',
          'payer',
          'payer_plan_mapping',
          'payer_response',
          'phi_table_registry',
          'place_of_service_split',
          'plan',
          'posting_row',
          'practice',
          'practice_site',
          'priced_line',
          'pricing_run',
          'prospect_request',
          'provider_adjustment',
          'rate_limit_counter',
          'rate_record',
          'remittance',
          'report_document',
          'restore_drill',
          'roi_statement',
          'role_permission',
          'rule_record',
          'rule_release',
          'rule_release_withdrawal',
          'schema_migrations',
          'screening_bounce_mark',
          'screening_lead',
          'screening_lead_product',
          'screening_mail_refusal',
          'screening_outcome',
          'screening_prospect',
          'screening_queue_tally',
          'screening_result',
          'screening_run',
          'screening_upload',
          'service_line',
          'source_document',
          'status_component',
          'status_incident',
          'status_incident_update',
          'submission',
          'subscription',
          'subscription_claim',
          'support_grant',
          'support_grant_notice',
          'support_grant_notice_recipient',
          'support_mail_receipt',
          'support_ticket',
          'terms_acceptance',
          'terms_version',
          'usage_snapshot',
          'user',
          'user_device',
          'user_session',
        ].map((relname) => ({ relname, owner: OWNER_ROLE })),
      );
    });
  });

  it('refuses to run when an applied migration changed, and applies nothing new', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      const [applied] = readMigrations(dir);
      writeFileSync(path.join(dir, applied?.name ?? ''), `${applied?.sql ?? ''}\n-- an edit\n`);
      writeFileSync(path.join(dir, '29991231235959_later.sql'), 'CREATE TABLE later (id integer);');
      await expect(migrate({ databaseUrl: url, migrationsDir: dir })).rejects.toThrow(/changed after it was applied/);
      expect(await query(url, "SELECT 1 FROM pg_tables WHERE tablename = 'later'")).toEqual([]);
    });
  });

  it('refuses to run when an applied migration is missing or a new one sorts before it', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      writeFileSync(path.join(dir, '20000101000000_too_early.sql'), 'SELECT 1;');
      await expect(migrate({ databaseUrl: url, migrationsDir: dir })).rejects.toThrow(/sorts before/);
      unlinkSync(path.join(dir, '20000101000000_too_early.sql'));
      const [applied] = readMigrations(dir);
      unlinkSync(path.join(dir, applied?.name ?? ''));
      await expect(migrate({ databaseUrl: url, migrationsDir: dir })).rejects.toThrow(/was applied but its file is missing/);
    });
  });

  it('rolls back a migration that fails, recording nothing', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      writeFileSync(path.join(dir, '29991231235959_broken.sql'), 'CREATE TABLE half_done (id integer);\nSELECT no_such_function();');
      await expect(migrate({ databaseUrl: url, migrationsDir: dir })).rejects.toThrow(MigrationError);
      expect(await query(url, "SELECT 1 FROM pg_tables WHERE tablename = 'half_done'")).toEqual([]);
      expect(await query(url, "SELECT 1 FROM schema_migrations WHERE filename = '29991231235959_broken.sql'")).toEqual([]);
    });
  });

  it('migrates two databases at once (the roles are shared by the cluster)', async () => {
    await withScratchDatabase(adminUrl, (a) =>
      withScratchDatabase(adminUrl, async (b) => {
        const results = await Promise.all([migrate({ databaseUrl: a, devLogin: true }), migrate({ databaseUrl: b, devLogin: true })]);
        const count = readMigrations(MIGRATIONS_DIR).length;
        expect(results.map((result) => result.applied.length)).toEqual([count, count]);
      }),
    );
  });
});

describe('the free screening migration (20261104090000) over requests declined before it', () => {
  it('gives a declined request not_recorded as its reason and keeps when it was reviewed; the exception refuses any other change, and a declined request is fixed', async () => {
    const screening = '20261104090000_free_screening.sql';
    const later = readMigrations(dir).filter((migration) => migration.name >= screening);
    for (const migration of later) {
      unlinkSync(path.join(dir, migration.name));
    }
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      const user = randomUUID();
      await query(url, 'INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status) VALUES ($1, $2, $3, true, false, \'active\')', [user, `synthetic-${user}`, `${user}@synthetic.test`]);
      const [declined] = await query<{ id: string; reviewed_at: Date }>(
        url,
        `INSERT INTO prospect_request (contact_name, contact_email, organization_name, locations, payers, billing_arrangement, status, reviewed_by, reviewed_at)
         VALUES ('SYNTHETIC', 'declined@synthetic.test', 'SYNTHETIC DECLINED ORG', 1, ARRAY['SYNTHETIC PAYER'], 'in_house', 'declined', $1, '2026-10-01T12:00:00Z') RETURNING id, reviewed_at`,
        [user],
      );
      const [open] = await query<{ id: string }>(
        url,
        `INSERT INTO prospect_request (contact_name, contact_email, organization_name, locations, payers, billing_arrangement) VALUES ('SYNTHETIC', 'open@synthetic.test', 'SYNTHETIC OPEN ORG', 1, ARRAY['SYNTHETIC PAYER'], 'in_house') RETURNING id`,
      );
      for (const migration of later) {
        copyFileSync(path.join(MIGRATIONS_DIR, migration.name), path.join(dir, migration.name));
      }
      await migrate({ databaseUrl: url, migrationsDir: dir });
      expect(await query(url, 'SELECT status, declined_reason, reviewed_at FROM prospect_request WHERE id = $1', [declined?.id])).toEqual([
        { status: 'declined', declined_reason: 'not_recorded', reviewed_at: declined?.reviewed_at },
      ]);
      expect(await query(url, 'SELECT status, declined_reason FROM prospect_request WHERE id = $1', [open?.id])).toEqual([{ status: 'new', declined_reason: null }]);
      // After the backfill no row meets the exception: a declined request keeps its status and its reason.
      await expect(query(url, "UPDATE prospect_request SET declined_reason = 'price' WHERE id = $1", [declined?.id])).rejects.toMatchObject({ code: '23514' });
      await expect(query(url, "UPDATE prospect_request SET status = 'contacted', declined_reason = NULL WHERE id = $1", [declined?.id])).rejects.toMatchObject({ code: '23514' });
      // A decline without a reason (the previous image's) records not_recorded; a contacted request takes no reason.
      await query(url, "UPDATE prospect_request SET status = 'declined', reviewed_by = $2 WHERE id = $1", [open?.id, user]);
      expect(await query(url, 'SELECT declined_reason FROM prospect_request WHERE id = $1', [open?.id])).toEqual([{ declined_reason: 'not_recorded' }]);
      // A decline that names not_recorded itself is refused, so that reason only ever means the previous image's.
      const [another] = await query<{ id: string }>(
        url,
        `INSERT INTO prospect_request (contact_name, contact_email, organization_name, locations, payers, billing_arrangement) VALUES ('SYNTHETIC', 'another@synthetic.test', 'SYNTHETIC ANOTHER ORG', 1, ARRAY['SYNTHETIC PAYER'], 'in_house') RETURNING id`,
      );
      await expect(query(url, "UPDATE prospect_request SET status = 'declined', declined_reason = 'not_recorded', reviewed_by = $2 WHERE id = $1", [another?.id, user])).rejects.toMatchObject({
        code: '23514',
        constraint: 'prospect_request_declined_reason',
      });
      await query(url, "UPDATE prospect_request SET status = 'declined', declined_reason = 'price', reviewed_by = $2 WHERE id = $1", [another?.id, user]);
      expect(await query(url, 'SELECT declined_reason FROM prospect_request WHERE id = $1', [another?.id])).toEqual([{ declined_reason: 'price' }]);
      await expect(
        query(
          url,
          `INSERT INTO prospect_request (contact_name, contact_email, organization_name, locations, payers, billing_arrangement, status, reviewed_by, declined_reason)
           VALUES ('SYNTHETIC', 'contacted@synthetic.test', 'SYNTHETIC ORG', 1, ARRAY['SYNTHETIC PAYER'], 'in_house', 'contacted', $1, 'price')`,
          [user],
        ),
      ).rejects.toMatchObject({ constraint: 'prospect_request_declined' });
    });
  });
});

describe('the location migration (20261105090000) over practices, a split and a run before it', () => {
  it('keeps each practice’s ZIP as its location (none for a practice with no ZIP), renames the split with its rows, leaves earlier runs unpinned and takes the new record type', async () => {
    const location = '20261105090000_pricing_location_and_zip_plus_four.sql';
    const later = readMigrations(dir).filter((migration) => migration.name >= location);
    for (const migration of later) {
      unlinkSync(path.join(dir, migration.name));
    }
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      const [group, withZip, withoutZip, person, split, run] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      // The rows as the previous head held them, written with triggers off (no administrator, no published release's checks).
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL session_replication_role = replica');
        await client.query("INSERT INTO organization (id, kind, name) VALUES ($1, 'group', 'SYNTHETIC GROUP')", [group]);
        await client.query('INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, status) VALUES ($1, $2, $3, true, \'active\')', [person, `synthetic-${person}`, `${person}@synthetic.test`]);
        await client.query("INSERT INTO practice (id, organization_id, name, zip, data_key_ref) VALUES ($1, $2, 'SYNTHETIC WITH A ZIP', '27601', 'local:v1:AAAA')", [withZip, group]);
        await client.query("INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, 'SYNTHETIC WITHOUT A ZIP', 'local:v1:AAAA')", [withoutZip, group]);
        await client.query(`INSERT INTO screening_place_of_service_split (id, settings, approved_by) VALUES ($1, '{"11": "non_facility"}', $2)`, [split, person]);
        await client.query("INSERT INTO rule_release (release_no, manifest_sha256, published_at) VALUES (900001, $1, now())", ['a'.repeat(64)]);
        await client.query(
          "INSERT INTO pricing_run (id, practice_id, period_from, period_to, release_no, engine_version, created_by) VALUES ($1, $2, '2026-01-01', '2026-01-31', 900001, 'phase-two/1', $3)",
          [run, withZip, person],
        );
        await client.query('COMMIT');
      } finally {
        await client.end();
      }
      for (const migration of later) {
        copyFileSync(path.join(MIGRATIONS_DIR, migration.name), path.join(dir, migration.name));
      }
      await migrate({ databaseUrl: url, migrationsDir: dir });
      expect(await query(url, 'SELECT practice_id, zip, zip_plus_four, updated_by FROM practice_site ORDER BY practice_id')).toEqual([
        { practice_id: withZip, zip: '27601', zip_plus_four: null, updated_by: null },
      ]);
      // practice.zip keeps its value, deprecated, for the previous image during the deploy.
      expect(await query(url, "SELECT zip, col_description('practice'::regclass, (SELECT attnum FROM pg_attribute WHERE attrelid = 'practice'::regclass AND attname = 'zip')) AS comment FROM practice WHERE id = $1", [withZip])).toEqual([
        { zip: '27601', comment: 'Deprecated by practice_site (ADR 0064): never read or written; dropped by the multi-site PR' },
      ]);
      expect(await query(url, "SELECT id, settings, approved_by FROM place_of_service_split")).toEqual([{ id: split, settings: { '11': 'non_facility' }, approved_by: person }]);
      expect(await query(url, "SELECT to_regclass('public.screening_place_of_service_split') AS old")).toEqual([{ old: null }]);
      expect(await query(url, 'SELECT place_of_service_split_id FROM pricing_run WHERE id = $1', [run])).toEqual([{ place_of_service_split_id: null }]);
      expect(await query(url, "SELECT role, effect FROM role_permission WHERE action = 'pricing_settings.set' ORDER BY role")).toEqual([
        { role: 'billing_manager', effect: 'allow' },
        { role: 'firm_principal', effect: 'allow' },
        { role: 'practice_admin', effect: 'allow' },
        { role: 'reviewer', effect: 'deny' },
      ]);
      await query(url, "INSERT INTO rule_release (release_no, manifest_sha256) VALUES (900006, $1)", ['b'.repeat(64)]);
      await query(
        url,
        `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, source, verification, sha256)
         VALUES (900006, 'locality_map_plus_four', '{"zip":"00012"}', '{}', '2026-01-01', '{"synthetic":true}', 'L1', $1)`,
        ['c'.repeat(64)],
      );
    });
  });
});

describe('the screening consumer migration (20261106090000) over runs before it', () => {
  it('gives each earlier run its creation as its receipt, an account of its own, the normal tier and its claim as its progress, and keeps the run’s rules on', async () => {
    const consumer = '20261106090000_screening_consumer.sql';
    const later = readMigrations(dir).filter((migration) => migration.name >= consumer);
    for (const migration of later) {
      unlinkSync(path.join(dir, migration.name));
    }
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      const person = randomUUID();
      const split = randomUUID();
      const runs = { queued: randomUUID(), pricing: randomUUID(), complete: randomUUID(), failed: randomUUID() };
      // The runs as the previous head held them, in each state, written with triggers off.
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL session_replication_role = replica');
        await client.query('INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, status) VALUES ($1, $2, $3, true, \'active\')', [person, `synthetic-${person}`, `${person}@synthetic.test`]);
        await client.query(`INSERT INTO place_of_service_split (id, settings, approved_by) VALUES ($1, '{"11": "non_facility"}', $2)`, [split, person]);
        await client.query('INSERT INTO rule_release (release_no, manifest_sha256, published_at) VALUES (900001, $1, now())', ['a'.repeat(64)]);
        for (const [state, run] of Object.entries(runs)) {
          const prospect = randomUUID();
          const upload = randomUUID();
          await client.query("INSERT INTO screening_prospect (id, practice_name, state, zip, contact_email) VALUES ($1, 'SYNTHETIC PRACTICE', 'MN', '00011', $2)", [
            prospect,
            `${state}@synthetic.test`,
          ]);
          await client.query("INSERT INTO screening_upload (id, prospect_id, rows_sha256, row_count, status) VALUES ($1, $2, $3, 1, 'accepted')", [upload, prospect, 'b'.repeat(64)]);
          await client.query(
            `INSERT INTO screening_run (id, upload_id, release_no, release_manifest_sha256, place_of_service_split_id, row_count, status, attempts, started_at, completed_at,
                                        engine_version, result_token_sha256, failed_at, failure_code, created_at, expires_at)
             VALUES ($1, $2, 900001, $3, $4, 1, $5, $6, $7, $8, $9, $10, $11, $12, now() - interval '5 minutes', now() - interval '5 minutes' + interval '30 days')`,
            [
              run,
              upload,
              'a'.repeat(64),
              split,
              state,
              state === 'pricing' || state === 'complete' ? 1 : 0,
              state === 'pricing' || state === 'complete' ? new Date(Date.now() - 60_000) : null,
              state === 'complete' ? new Date() : null,
              state === 'complete' ? 'phase-two/1' : null,
              state === 'complete' ? 'c'.repeat(64) : null,
              state === 'failed' ? new Date() : null,
              state === 'failed' ? 'RELEASE_UNAVAILABLE' : null,
            ],
          );
        }
        await client.query('COMMIT');
      } finally {
        await client.end();
      }
      for (const migration of later) {
        copyFileSync(path.join(MIGRATIONS_DIR, migration.name), path.join(dir, migration.name));
      }
      await migrate({ databaseUrl: url, migrationsDir: dir });
      const migrated = await query<{ id: string; received: boolean; rate_subject: string; wait_reason: string | null; queue_priority: number; progress: boolean }>(
        url,
        'SELECT id, received_at = created_at AS received, rate_subject, wait_reason, queue_priority, progress_at IS NOT DISTINCT FROM started_at AS progress FROM screening_run ORDER BY id',
      );
      expect(migrated).toEqual(
        Object.values(runs)
          .sort()
          .map((id) => ({ id, received: true, rate_subject: createHash('sha256').update(`run:${id}`).digest('hex'), wait_reason: null, queue_priority: 0, progress: true })),
      );
      expect(await query(url, 'SELECT progress_at IS NULL AS none FROM screening_run WHERE id = ANY ($1) ORDER BY status', [[runs.failed, runs.queued]])).toEqual([{ none: true }, { none: true }]);
      // The run's rules are on again: a backfilled value is kept for good.
      expect(await query(url, "SELECT tgenabled FROM pg_trigger WHERE tgname = 'screening_run_rules'")).toEqual([{ tgenabled: 'O' }]);
      await expect(query(url, "UPDATE screening_run SET received_at = received_at - interval '1 second' WHERE id = $1", [runs.queued])).rejects.toMatchObject({ code: '23514' });
      // The previous head's pricing run, claimed a minute ago, is stale only a minute from now.
      expect(await query(url, 'SELECT run_id FROM operator_screening_due(0, 100)')).toEqual([{ run_id: runs.queued }]);
    });
  });
});

describe('migrate --dry-run', () => {
  it('applies the pending migrations to a database at the previous head, then leaves it exactly there', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      writeFileSync(path.join(dir, PROBE), PROBE_SQL);
      const before = await catalogSnapshot(url);
      expect(before).toEqual(expect.arrayContaining([expect.stringMatching(/^relation public.rule_release r tp_owner/)]));

      const result = await migrate({ databaseUrl: url, migrationsDir: dir, dryRun: true });
      expect(result).toEqual({ applied: [PROBE], alreadyApplied: readMigrations(MIGRATIONS_DIR).map((migration) => migration.name), dryRun: true });
      expect(await catalogSnapshot(url)).toEqual(before);
      expect(await query(url, "SELECT 1 FROM pg_tables WHERE tablename = 'dry_run_probe'")).toEqual([]);

      // Forward for real, after the dry run said it would work.
      expect((await migrate({ databaseUrl: url, migrationsDir: dir })).applied).toEqual([PROBE]);
      expect(await catalogSnapshot(url)).not.toEqual(before);
      expect(await query(url, 'SELECT dry_run_probe_count()::int AS n')).toEqual([{ n: 0 }]);
    });
  });

  it('leaves an empty database empty', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      const before = await catalogSnapshot(url);
      const result = await migrate({ databaseUrl: url, migrationsDir: dir, dryRun: true, devLogin: true });
      expect(result.applied).toEqual(readMigrations(dir).map((migration) => migration.name));
      expect(await catalogSnapshot(url)).toEqual(before);
      expect(await query(url, "SELECT 1 FROM pg_tables WHERE schemaname = 'public'")).toEqual([]);
    });
  });

  it('reports a migration that would fail, and changes nothing', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      writeFileSync(path.join(dir, PROBE), `${PROBE_SQL}\nSELECT no_such_function();`);
      const before = await catalogSnapshot(url);
      await expect(migrate({ databaseUrl: url, migrationsDir: dir, dryRun: true })).rejects.toThrow(`${PROBE} failed`);
      expect(await catalogSnapshot(url)).toEqual(before);
    });
  });

  it('refuses a broken history before applying anything', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      writeFileSync(path.join(dir, '20000101000000_too_early.sql'), 'SELECT 1;');
      await expect(migrate({ databaseUrl: url, migrationsDir: dir, dryRun: true })).rejects.toThrow(/sorts before/);
    });
  });
});

describe('what every migration is checked for', () => {
  it('refuses a migration that switches role, and rolls it back', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      writeFileSync(path.join(dir, PROBE), 'RESET ROLE;\nCREATE TABLE owned_by_superuser (id integer);');
      for (const dryRun of [true, false]) {
        await expect(migrate({ databaseUrl: url, migrationsDir: dir, dryRun })).rejects.toThrow(/left the session as postgres; migrations run as tp_owner and never change role/);
      }
      expect(await query(url, "SELECT 1 FROM pg_tables WHERE tablename = 'owned_by_superuser'")).toEqual([]);
      expect(await query(url, 'SELECT filename FROM schema_migrations WHERE filename = $1', [PROBE])).toEqual([]);
    });
  });

  it('refuses a migration that leaves an object owned by another role, even after switching back', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      writeFileSync(path.join(dir, PROBE), `RESET ROLE;\nCREATE TABLE owned_by_superuser (id integer);\nSET LOCAL ROLE ${OWNER_ROLE};`);
      await expect(migrate({ databaseUrl: url, migrationsDir: dir })).rejects.toThrow(/relation owned_by_superuser is owned by postgres/);
      writeFileSync(path.join(dir, PROBE), `CREATE TABLE given_away (id integer);\nRESET ROLE;\nALTER TABLE given_away OWNER TO ${APP_ROLE};\nSET LOCAL ROLE ${OWNER_ROLE};`);
      await expect(migrate({ databaseUrl: url, migrationsDir: dir })).rejects.toThrow(/relation given_away is owned by tp_app; the application role tp_app owns 3 object\(s\)/);
      expect(await query(url, "SELECT 1 FROM pg_tables WHERE tablename IN ('owned_by_superuser', 'given_away')")).toEqual([]);
    });
  });
});

describe('a deploy login that is not a superuser', () => {
  it('bootstraps and migrates a fresh database it owns, as the RDS master user would', async () => {
    const login = `tp_test_deployer_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const password = randomUUID();
    // Roles are cluster-wide and other tests share tp_owner and tp_app, so the login is given what it
    // would hold after creating them itself on its first deploy: membership with ADMIN OPTION.
    await query(adminUrl, `CREATE ROLE ${login} LOGIN CREATEROLE NOSUPERUSER PASSWORD '${password}'`);
    try {
      await query(adminUrl, `GRANT ${OWNER_ROLE}, ${APP_ROLE} TO ${login} WITH ADMIN OPTION, SET FALSE`);
      await withScratchDatabase(adminUrl, async (url) => {
        const name = new URL(url).pathname.slice(1);
        await query(adminUrl, `ALTER DATABASE ${name} OWNER TO ${login}`);
        const deployer = new URL(url);
        deployer.username = login;
        deployer.password = password;
        const result = await migrate({ databaseUrl: deployer.toString() });
        expect(result.applied).toEqual(readMigrations(MIGRATIONS_DIR).map((migration) => migration.name));
        expect(await query(deployer.toString(), `SELECT pg_has_role(current_user, '${OWNER_ROLE}', 'SET') AS can_set`)).toEqual([{ can_set: true }]);
        const owners = await query<{ owner: string }>(
          url,
          "SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'",
        );
        expect(owners).toEqual([{ owner: OWNER_ROLE }]);
        expect((await migrate({ databaseUrl: deployer.toString(), dryRun: true })).applied).toEqual([]);
      });
    } finally {
      await query(adminUrl, `DROP ROLE IF EXISTS ${login}`);
    }
  });
});

describe('roles', () => {
  it('gives the application role no superuser, no bypass, no login and no ownership', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, devLogin: true });
      const roles = await query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>(
        url,
        'SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname',
        [[APP_ROLE, APP_DEV_LOGIN, OWNER_ROLE, SCREENING_ROLE, SCREENING_DEV_LOGIN]],
      );
      expect(roles).toEqual([
        { rolname: APP_ROLE, rolsuper: false, rolbypassrls: false, rolcanlogin: false, rolcreatedb: false, rolcreaterole: false },
        { rolname: APP_DEV_LOGIN, rolsuper: false, rolbypassrls: false, rolcanlogin: true, rolcreatedb: false, rolcreaterole: false },
        { rolname: OWNER_ROLE, rolsuper: false, rolbypassrls: false, rolcanlogin: false, rolcreatedb: false, rolcreaterole: false },
        // The screening consumer's role and its dev login (migration 20261106090000): nothing but the login's sign-in.
        { rolname: SCREENING_ROLE, rolsuper: false, rolbypassrls: false, rolcanlogin: false, rolcreatedb: false, rolcreaterole: false },
        { rolname: SCREENING_DEV_LOGIN, rolsuper: false, rolbypassrls: false, rolcanlogin: true, rolcreatedb: false, rolcreaterole: false },
      ]);
      // The consumer's role is a member of nothing, and its dev login only switches to it.
      expect(
        await query(
          url,
          `SELECT m.rolname AS member, r.rolname AS role, a.inherit_option AS inherits, a.set_option AS switches FROM pg_auth_members a
             JOIN pg_roles m ON m.oid = a.member JOIN pg_roles r ON r.oid = a.roleid
            WHERE m.rolname = ANY ($1) ORDER BY 1, 2`,
          [[SCREENING_ROLE, SCREENING_DEV_LOGIN]],
        ),
      ).toEqual([{ member: SCREENING_DEV_LOGIN, role: SCREENING_ROLE, inherits: false, switches: true }]);
      const owned = await query<{ count: string }>(
        url,
        `SELECT (SELECT count(*) FROM pg_class WHERE relowner = $1::regrole)
              + (SELECT count(*) FROM pg_proc WHERE proowner = $1::regrole)
              + (SELECT count(*) FROM pg_namespace WHERE nspowner = $1::regrole)
              + (SELECT count(*) FROM pg_type WHERE typowner = $1::regrole) AS count`,
        [APP_ROLE],
      );
      expect(owned).toEqual([{ count: '0' }]);
    });
  });

  it('lets the dev login read rule content as the application role, and nothing more', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, devLogin: true });
      const appUrl = appDevLoginUrl(url);
      expect(await query(appUrl, 'SELECT count(*)::int AS n FROM rule_record')).toEqual([{ n: 0 }]);
      expect(await query(appUrl, `SELECT pg_has_role(current_user, '${APP_ROLE}', 'MEMBER') AS member`)).toEqual([{ member: true }]);
      await expect(query(appUrl, 'CREATE TABLE mine (id integer)')).rejects.toMatchObject({ code: '42501' });
      await expect(query(appUrl, 'SELECT * FROM schema_migrations')).rejects.toMatchObject({ code: '42501' });
      await expect(query(appUrl, `SET ROLE ${OWNER_ROLE}`)).rejects.toMatchObject({ code: '42501' });
    });
  });
});

describe('the suspension migration (20261108090000) over an internal organization that is not active', () => {
  it('refuses to run, naming no organization, and applies once the owner sets it active', async () => {
    const suspension = '20261108090000_suspension_refusal.sql';
    const later = readMigrations(dir).filter((migration) => migration.name >= suspension);
    for (const migration of later) {
      unlinkSync(path.join(dir, migration.name));
    }
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      const internal = randomUUID();
      await query(url, "INSERT INTO organization (id, kind, name, status) VALUES ($1, 'internal', 'SYNTHETIC INTERNAL', 'suspended')", [internal]);
      for (const migration of later) {
        copyFileSync(path.join(MIGRATIONS_DIR, migration.name), path.join(dir, migration.name));
      }
      const refused = migrate({ databaseUrl: url, migrationsDir: dir });
      await expect(refused).rejects.toThrow(MigrationError);
      await expect(refused).rejects.toThrow(/the internal organization must be active before migration 20261108090000; set it active as the owner, then migrate again/);
      expect(await query(url, 'SELECT 1 FROM schema_migrations WHERE filename = $1', [suspension])).toEqual([]);
      await query(url, "UPDATE organization SET status = 'active' WHERE id = $1", [internal]);
      expect((await migrate({ databaseUrl: url, migrationsDir: dir })).applied).toEqual(later.map((migration) => migration.name));
    });
  });
});

describe('the Drizzle schema', () => {
  const tables = Object.values(schema as Record<string, unknown>).filter((value): value is PgTable => is(value, PgTable));

  it('defines every migrated table', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      const migrated = await query<{ tablename: string }>(url, "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' ORDER BY 1");
      expect(tables.map((table) => getTableConfig(table).name).sort()).toEqual(migrated.map((row) => row.tablename));
    });
  });

  it('matches the migrated columns, types and nullability', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      for (const table of tables) {
        const config = getTableConfig(table);
        const columns = await query<{ column_name: string; data_type: string; is_nullable: string }>(
          url,
          "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
          [config.name],
        );
        expect(
          config.columns.map((column) => ({ column_name: column.name, data_type: POSTGRES_TYPES[column.columnType] ?? column.columnType, is_nullable: column.notNull ? 'NO' : 'YES' })),
          config.name,
        ).toEqual(columns);
      }
    });
  });
});
