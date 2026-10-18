import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { catalogProblems } from './catalog';
import { readDatabaseUrl } from './config';
import { APP_ROLE, BILLING_ROLE, ESIGN_ROLE, OPERATOR_ROLE, OWNER_ROLE } from './roles';
import { type MigratedDatabase, addMembership, createMigratedDatabase, createOrganization, createUser, endPool } from './testing';

/**
 * The free screening tables (Change Order 001, CO-04 and CO-12; reconciliation-001 D18 a; migration
 * 20261104090000_free_screening.sql; docs/adr/0062). Test matrix SEC-17: the tables hold no PHI-shaped column,
 * read from the catalog. Beside it, the rules the tables keep: no practice_id and no registry row, row-level
 * security forced with the owner's policy only, no privilege for any other role (the application and the operator
 * reach them through the definer functions alone, each granted to its one role), rejection reasons that cannot hold
 * a header or a cell, MA contracted and commercial rows that are never priced, figures that are the line amount
 * times the count in bigint, runs that move one way, a token stored only as its hash, rows kept until they expire,
 * and a split a contract specialist approves. Synthetic data only.
 */

const SCREENING_TABLES = ['screening_place_of_service_split', 'screening_prospect', 'screening_result', 'screening_run', 'screening_upload'] as const;

/**
 * Column names shaped like the five kinds CO-04 forbids (names, dates of birth, member IDs, dates of service,
 * claim numbers) and the identifiers around them.
 */
const PHI_SHAPED =
  /patient|member|subscriber|insured|beneficiar|guarantor|first_?name|last_?name|middle_?name|full_?name|given_?name|surname|family_?name|^name$|birth|dob|^age$|ssn|social_security|mrn|medical_record|chart|account|policy|mbi|hicn|claim_(no|num|number|id|control)|^clp|icn|pcn|tcn|dcn|ccn|date_of_service|service_date|dos|visit|encounter|admi|discharge|address|phone|street/;

const SPLIT = { '11': 'non_facility', '22': 'facility' };
const hex = (character: string) => character.repeat(64);

let database: MigratedDatabase;
let admin: pg.Pool;
let app: pg.Pool;
let specialist: string;
let analyst: string;

/** One transaction as `role`, with app.actor_id set when an actor is named; committed, or rolled back on error. */
async function as<T extends pg.QueryResultRow = pg.QueryResultRow>(role: string, sql: string, values: unknown[] = [], actorId: string | null = null): Promise<T[]> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [actorId ?? '']);
    const { rows } = await client.query<T>(sql, values);
    await client.query('COMMIT');
    return rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** A SYNTHETIC release with two locality_map records: 00011 (no ZIP+4) and 00012 (ZIP+4 required). */
async function publishSyntheticRelease(releaseNo: number): Promise<void> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO rule_release (release_no, manifest_sha256) VALUES ($1, $2)', [releaseNo, hex('a')]);
    await client.query(
      `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256) VALUES
         ($1, 'locality_map', '{"zip":"00011"}', '{"state":"ZZ","carrier":"99999","locality":"01","rural_indicator":"","plus_four_required":false}', '2026-01-01', '2026-12-31', '{"synthetic":true}', 'L1', $2),
         ($1, 'locality_map', '{"zip":"00012"}', '{"state":"ZZ","carrier":"99999","locality":"01","rural_indicator":"R","plus_four_required":true}', '2026-01-01', '2026-12-31', '{"synthetic":true}', 'L1', $3)`,
      [releaseNo, hex('b'), hex('c')],
    );
    await client.query('UPDATE rule_release SET published_at = now() WHERE release_no = $1', [releaseNo]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

interface SubmitOptions {
  readonly zip?: string;
  readonly email?: string;
  readonly rows?: readonly (readonly [string, string, number, string, string, string, bigint, number])[];
}

const FIRST_ROW = ['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 10_000n, 5] as const;
const ROWS: NonNullable<SubmitOptions['rows']> = [
  FIRST_ROW,
  ['97110', 'CQ GP', 1, '11', 'ma_noncontracted', '2026-Q2', 2_000n, 1],
  ['97140', '', 1, '22', 'ma_contracted', '2026-Q1', 3_000n, 2],
  ['97530', '', 3, '11', 'commercial', '2026-Q3', 4_000n, 3],
  ['97112', '', 1, '11', 'medicaid', '2026-Q1', 500n, 1],
  ['97116', 'GP', 1, '11', 'other', '2026-Q1', 600n, 1],
];

const SUBMIT = 'SELECT submit_screening($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) AS run_id';

function submitValues(options: SubmitOptions = {}): unknown[] {
  const rows = options.rows ?? ROWS;
  return [
    '  Synthetic Therapy Group  ',
    'MN',
    options.zip ?? '00011',
    options.email ?? ` Prospect.${randomUUID().slice(0, 8)}@Synthetic.Test `,
    hex('d'),
    rows.map((row) => row[0]),
    rows.map((row) => row[1]),
    rows.map((row) => row[2]),
    rows.map((row) => row[3]),
    rows.map((row) => row[4]),
    rows.map((row) => row[5]),
    rows.map((row) => row[6].toString()),
    rows.map((row) => row[7]),
    `test-${randomUUID()}`,
  ];
}

async function submit(options: SubmitOptions = {}): Promise<string> {
  const [row] = await as<{ run_id: string }>(APP_ROLE, SUBMIT, submitValues(options));
  return row?.run_id ?? '';
}

async function approveSplit(settings: object = SPLIT): Promise<string> {
  const [row] = await as<{ id: string }>(APP_ROLE, 'SELECT console_approve_screening_split($1) AS id', [JSON.stringify(settings)], specialist);
  return row?.id ?? '';
}

/** Moves a run to complete with the given token hash, pricing its pending rows as the operator would. */
async function complete(runId: string, tokenSha256: string): Promise<void> {
  expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_claim($1)', [runId])).toHaveLength(1);
  const pending = await as<{ row_no: number; claim_count: number; observed_allowed_cents: string }>(OPERATOR_ROLE, 'SELECT * FROM operator_screening_rows($1, 0, 5000)', [runId]);
  const lines = pending.map(() => 5_000n);
  await as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', [
    runId,
    pending.map((row) => row.row_no),
    pending.map(() => 'priced'),
    lines.map(String),
    lines.map((line) => `${line.toString()}.25`),
    pending.map((row, index) => ((lines[index] ?? 0n) * BigInt(row.claim_count)).toString()),
    pending.map((row, index) => ((lines[index] ?? 0n) * BigInt(row.claim_count) - BigInt(row.observed_allowed_cents)).toString()),
    pending.map(() => true),
    pending.map(() => null),
    pending.map(() => null),
    pending.map(() => hex('f')),
  ]);
  expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, $3, $4)', [runId, tokenSha256, 'phase-two/1', `test-${randomUUID()}`])).toHaveLength(1);
}

/** As the superuser, with triggers off for the statement: moves a screening's dates back past its expiry. */
async function age(runId: string, days: number): Promise<void> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    const shift = `${String(days)} days`;
    await client.query(
      `WITH target AS (SELECT r.id AS run_id, u.id AS upload_id, u.prospect_id FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE r.id = $1),
            a AS (UPDATE screening_prospect p SET created_at = p.created_at - $2::interval, expires_at = p.expires_at - $2::interval FROM target WHERE p.id = target.prospect_id),
            b AS (UPDATE screening_upload u SET created_at = u.created_at - $2::interval, expires_at = u.expires_at - $2::interval FROM target WHERE u.id = target.upload_id)
       UPDATE screening_run r SET created_at = r.created_at - $2::interval, expires_at = r.expires_at - $2::interval FROM target WHERE r.id = target.run_id`,
      [runId, shift],
    );
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  admin = new pg.Pool({ connectionString: database.url, max: 4 });
  app = new pg.Pool({ connectionString: database.appUrl, max: 2 });
  const owner = await admin.connect();
  try {
    const internal = await createOrganization(owner, 'internal');
    specialist = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, internal, specialist, 'contract_specialist');
    analyst = await createUser(owner);
    const group = await createOrganization(owner, 'group');
    await addMembership(owner, group, analyst, 'analyst');
  } finally {
    owner.release();
  }
}, 60_000);

afterAll(async () => {
  await endPool(app);
  await endPool(admin);
  await database.drop();
});

describe('SEC-17: the screening tables hold no PHI-shaped column', () => {
  it('names five tables, none of whose columns is shaped like a name, a date of birth, a member ID, a date of service or a claim number', async () => {
    const { rows } = await admin.query<{ table_name: string; column_name: string; type: string }>(
      `SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY ($1) AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY 1, a.attnum`,
      [SCREENING_TABLES],
    );
    expect([...new Set(rows.map((row) => row.table_name))]).toEqual([...SCREENING_TABLES]);
    expect(rows.filter((row) => PHI_SHAPED.test(row.column_name)).map((row) => `${row.table_name}.${row.column_name}`)).toEqual([]);
    // No calendar date at all: a date of birth or of service would be one; the only times are when a row was made and when it expires.
    expect(rows.filter((row) => row.type === 'date').map((row) => `${row.table_name}.${row.column_name}`)).toEqual([]);
    expect(rows.filter((row) => row.type.startsWith('timestamp')).map((row) => row.column_name).sort()).toEqual(
      ['approved_at', 'completed_at', 'converted_at', 'created_at', 'created_at', 'created_at', 'expires_at', 'expires_at', 'expires_at', 'failed_at', 'started_at'].sort(),
    );
    // The prospect's own fields are a practice's, not a patient's: its name, state, ZIP and contact address.
    expect(rows.filter((row) => row.table_name === 'screening_prospect').map((row) => row.column_name)).toEqual([
      'id',
      'practice_name',
      'state',
      'zip',
      'contact_email',
      'created_at',
      'expires_at',
    ]);
    // An upload keeps no byte of its file: no bytea, no free text but the hash and the coded reasons.
    expect(rows.filter((row) => row.type === 'bytea')).toEqual([]);
    expect(rows.filter((row) => row.table_name === 'screening_upload').map((row) => row.column_name)).toEqual([
      'id',
      'prospect_id',
      'file_sha256',
      'row_count',
      'status',
      'rejection_reasons',
      'created_at',
      'expires_at',
    ]);
    // The control: the shape catches each kind CO-04 names.
    for (const shaped of ['patient_name', 'member_id', 'date_of_birth', 'dob', 'date_of_service', 'service_date', 'claim_number', 'clp01', 'icn', 'subscriber_id']) {
      expect(PHI_SHAPED.test(shaped), shaped).toBe(true);
    }
  });

  it('keeps them outside the PHI catalog: no practice_id, no registry row, row-level security forced with the owner’s policy only, and no other role’s privilege', async () => {
    const tables = await admin.query<{ relname: string; rls: boolean; forced: boolean; owner: string; acl: string[] | null; practice_id: boolean }>(
      `SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced, pg_get_userbyid(c.relowner) AS owner, c.relacl::text[] AS acl,
              EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'practice_id' AND NOT a.attisdropped) AS practice_id
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ANY ($1) ORDER BY 1`,
      [SCREENING_TABLES],
    );
    for (const table of tables.rows) {
      expect(table, table.relname).toMatchObject({ rls: true, forced: true, owner: OWNER_ROLE, practice_id: false });
      expect((table.acl ?? []).filter((entry) => !entry.startsWith(`${OWNER_ROLE}=`)), table.relname).toEqual([]);
      for (const role of [APP_ROLE, OPERATOR_ROLE, BILLING_ROLE, ESIGN_ROLE]) {
        const held = await admin.query<{ any: boolean }>(
          `SELECT has_table_privilege($1, $2::regclass, 'SELECT') OR has_table_privilege($1, $2::regclass, 'INSERT') OR has_table_privilege($1, $2::regclass, 'UPDATE')
                  OR has_table_privilege($1, $2::regclass, 'DELETE') OR has_table_privilege($1, $2::regclass, 'TRUNCATE') OR has_any_column_privilege($1, $2::regclass, 'SELECT') AS any`,
          [role, table.relname],
        );
        expect(held.rows[0]?.any, `${role} on ${table.relname}`).toBe(false);
      }
    }
    const policies = await admin.query<{ table_name: string; name: string; command: string; roles: string[]; using_expression: string; check_expression: string }>(
      `SELECT c.relname AS table_name, pol.polname AS name, pol.polcmd::text AS command, ARRAY(SELECT pg_get_userbyid(r)::text FROM unnest(pol.polroles) r) AS roles,
              pg_get_expr(pol.polqual, pol.polrelid) AS using_expression, pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expression
         FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid WHERE c.relname = ANY ($1) ORDER BY 1`,
      [SCREENING_TABLES],
    );
    expect(policies.rows).toEqual(
      SCREENING_TABLES.map((table) => ({ table_name: table, name: `${table}_owner`, command: '*', roles: [OWNER_ROLE], using_expression: 'true', check_expression: 'true' })),
    );
    const registered = await admin.query('SELECT table_name FROM phi_table_registry WHERE table_name = ANY ($1)', [SCREENING_TABLES]);
    expect(registered.rows).toEqual([]);
    expect(await catalogProblems(admin)).toEqual([]);
  });

  it('refuses rejection reasons that would hold a header’s text or a cell’s value', async () => {
    const valid = (reasons: unknown) => admin.query<{ ok: boolean }>('SELECT screening_rejections_valid($1::jsonb) AS ok', [JSON.stringify(reasons)]).then((result) => result.rows[0]?.ok);
    expect(await valid([])).toBe(true);
    expect(await valid([{ code: 'phi_column', column: 4, phi: 'member_id' }])).toBe(true);
    expect(await valid([{ code: 'invalid_value', row: 12, field: 'units' }, { code: 'duplicate_row', row: 40, first_row: 3 }])).toBe(true);
    expect(await valid([{ code: 'phi_column', column: 4, phi: 'member_id', header: 'Member ID' }])).toBe(false);
    expect(await valid([{ code: 'phi_column', column: 'Member ID' }])).toBe(false);
    expect(await valid([{ code: 'invalid_value', row: 12, field: 'units', value: 'SYNTHETIC 1234' }])).toBe(false);
    expect(await valid([{ code: 'invalid_value', row: 12, field: 'Patient Name' }])).toBe(false);
    expect(await valid([{ code: 'phi_column', column: 4, phi: 'Jane' }])).toBe(false);
    expect(await valid([{ code: 'something_else' }])).toBe(false);
    expect(await valid([{ column: 4 }])).toBe(false);
    expect(await valid([{ code: null }])).toBe(false);
    expect(await valid([{ code: 'phi_column', phi: null }])).toBe(false);
    expect(await valid([{ code: 'phi_column', column: 65 }])).toBe(false);
    expect(await valid([{ code: 'phi_column', column: 1.5 }])).toBe(false);
    expect(await valid([{ code: 'invalid_value', row: 10_000_001 }])).toBe(false);
    expect(await valid(['phi_column'])).toBe(false);
    expect(await valid({ code: 'phi_column' })).toBe(false);
    expect(await valid(Array.from({ length: 21 }, () => ({ code: 'no_rows' })))).toBe(false);
  });
});

describe('the roles reach the tables only through their functions', () => {
  it('refuses the application and operator roles every direct read and write', async () => {
    for (const role of [APP_ROLE, OPERATOR_ROLE]) {
      for (const table of SCREENING_TABLES) {
        await expect(as(role, `SELECT count(*) FROM ${table}`), `${role} reads ${table}`).rejects.toMatchObject({ code: '42501' });
        await expect(as(role, `DELETE FROM ${table}`), `${role} deletes ${table}`).rejects.toMatchObject({ code: '42501' });
      }
      await expect(
        as(role, "INSERT INTO screening_prospect (practice_name, state, zip, contact_email) VALUES ('SYNTHETIC', 'MN', '00011', 'p@synthetic.test')"),
      ).rejects.toMatchObject({ code: '42501' });
    }
    // The dev login every request uses, too.
    await expect(app.query('SELECT count(*) FROM screening_result')).rejects.toMatchObject({ code: '42501' });
  });

  it('grants each definer function to its one role, and none to PUBLIC', async () => {
    const { rows } = await admin.query<{ name: string; definer: boolean; app: boolean; operator: boolean; billing: boolean; public: boolean }>(
      `SELECT p.oid::regprocedure::text AS name, p.prosecdef AS definer,
              has_function_privilege($1, p.oid, 'EXECUTE') AS app, has_function_privilege($2, p.oid, 'EXECUTE') AS operator,
              has_function_privilege($3, p.oid, 'EXECUTE') AS billing,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') AS public
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND (p.proname LIKE '%screening%') ORDER BY 1`,
      [APP_ROLE, OPERATOR_ROLE, BILLING_ROLE],
    );
    const byName = Object.fromEntries(rows.map((row) => [row.name.replace(/\(.*$/, ''), row]));
    const forApp = [
      'screening_status',
      'screening_zip_status',
      'submit_screening',
      'reject_screening_upload',
      'screening_result_summary',
      'screening_result_groups',
      'screening_result_coverage',
      'screening_result_rows',
      'convert_screening',
      'console_screening_splits',
      'console_approve_screening_split',
    ];
    const forOperator = [
      'operator_screening_due',
      'operator_screening_claim',
      'operator_screening_release',
      'operator_screening_rows',
      'operator_screening_record',
      'operator_screening_complete',
      'operator_screening_fail',
      'operator_screening_expire',
    ];
    for (const name of [...forApp, ...forOperator]) {
      expect(byName[name], name).toBeDefined();
    }
    for (const row of rows) {
      const name = row.name.replace(/\(.*$/, '');
      expect(row.public, `${name} is executable by PUBLIC`).toBe(false);
      expect(row.billing, name).toBe(false);
      expect(row.app, name).toBe(forApp.includes(name));
      expect(row.operator, name).toBe(forOperator.includes(name));
      // Every function a role may call runs as the owner, but the ZIP check, which reads only global rule content.
      expect(row.definer, name).toBe((forApp.includes(name) || forOperator.includes(name)) && name !== 'screening_zip_status');
    }
  });
});

describe('the screening rules', () => {
  beforeAll(async () => {
    // Closed until a release is in force and a split approved.
    expect(await as(APP_ROLE, 'SELECT * FROM screening_status()')).toEqual([{ release_no: null, place_of_service_split_id: null }]);
    await expect(as(APP_ROLE, SUBMIT, submitValues())).rejects.toMatchObject({ code: '23514', constraint: 'screening_closed' });
    await publishSyntheticRelease(900001);
    expect(await as(APP_ROLE, 'SELECT * FROM screening_status()')).toEqual([{ release_no: null, place_of_service_split_id: null }]);
    await expect(as(APP_ROLE, SUBMIT, submitValues())).rejects.toMatchObject({ code: '23514', constraint: 'screening_closed' });
    await approveSplit();
  }, 60_000);

  it('opens with the release and the split in force, and refuses a ZIP the locality map does not price from five digits', async () => {
    const [status] = await as<{ release_no: number; place_of_service_split_id: string }>(APP_ROLE, 'SELECT * FROM screening_status()');
    expect(status?.release_no).toBe(900001);
    expect(await as(APP_ROLE, 'SELECT * FROM screening_zip_status($1)', ['00011'])).toEqual([{ known: true, plus_four_required: false }]);
    expect(await as(APP_ROLE, 'SELECT * FROM screening_zip_status($1)', ['00012'])).toEqual([{ known: true, plus_four_required: true }]);
    expect(await as(APP_ROLE, 'SELECT * FROM screening_zip_status($1)', ['00099'])).toEqual([{ known: false, plus_four_required: false }]);
    await expect(submit({ zip: '00099' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_zip_unknown' });
    // The engine takes a five-digit ZIP alone, so a ZIP whose locality needs its ZIP+4 is refused and no ZIP+4 is kept.
    await expect(submit({ zip: '00012' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_zip_plus_four' });
    const withoutNeed = await submit({ zip: '00011' });
    const zips = await admin.query<{ id: string; zip: string }>(
      'SELECT r.id, p.zip FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE r.id = ANY ($1)',
      [[withoutNeed]],
    );
    expect(zips.rows).toEqual([{ id: withoutNeed, zip: '00011' }]);
  });

  it('stores the prospect, an accepted upload of hash and count, a queued run pinned to the release and split, and every row, with its audit event', async () => {
    const runId = await submit({ email: ' Prospect.Pinned@Synthetic.Test ' });
    const { rows } = await admin.query(
      `SELECT p.practice_name, p.state, p.zip, p.contact_email, u.file_sha256, u.row_count AS upload_rows, u.status AS upload_status, u.rejection_reasons,
              r.release_no, r.release_manifest_sha256, r.row_count, r.status, r.attempts, r.result_token_sha256,
              r.place_of_service_split_id = screening_split_in_force() AS split_in_force, r.expires_at = r.created_at + interval '30 days' AS thirty_days
         FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE r.id = $1`,
      [runId],
    );
    expect(rows).toEqual([
      {
        practice_name: 'Synthetic Therapy Group',
        state: 'MN',
        zip: '00011',
        contact_email: 'prospect.pinned@synthetic.test',
        file_sha256: hex('d'),
        upload_rows: 6,
        upload_status: 'accepted',
        rejection_reasons: [],
        release_no: 900001,
        release_manifest_sha256: hex('a'),
        row_count: 6,
        status: 'queued',
        attempts: 0,
        result_token_sha256: null,
        split_in_force: true,
        thirty_days: true,
      },
    ]);
    const results = await admin.query<{ row_no: number; modifiers: string[]; payer_product: string; disposition: string; observed_allowed_cents: string }>(
      'SELECT row_no, modifiers, payer_product, disposition, observed_allowed_cents FROM screening_result WHERE run_id = $1 ORDER BY row_no',
      [runId],
    );
    expect(results.rows).toEqual([
      { row_no: 1, modifiers: ['GP'], payer_product: 'medicare_ffs', disposition: 'pending', observed_allowed_cents: '10000' },
      { row_no: 2, modifiers: ['CQ', 'GP'], payer_product: 'ma_noncontracted', disposition: 'pending', observed_allowed_cents: '2000' },
      { row_no: 3, modifiers: [], payer_product: 'ma_contracted', disposition: 'contract_required', observed_allowed_cents: '3000' },
      { row_no: 4, modifiers: [], payer_product: 'commercial', disposition: 'contract_required', observed_allowed_cents: '4000' },
      { row_no: 5, modifiers: [], payer_product: 'medicaid', disposition: 'not_screened', observed_allowed_cents: '500' },
      { row_no: 6, modifiers: ['GP'], payer_product: 'other', disposition: 'not_screened', observed_allowed_cents: '600' },
    ]);
    const audit = await admin.query('SELECT actor_kind, actor_id, action, object_type, purpose FROM audit_event WHERE object_id = $1', [runId]);
    expect(audit.rows).toEqual([{ actor_kind: 'system', actor_id: null, action: 'screening_submitted', object_type: 'screening_run', purpose: 'screening' }]);
  });

  it('refuses arrays of different lengths, no rows, more than 50,000, a repeated row key and a modifier set out of order', async () => {
    const values = submitValues();
    await expect(as(APP_ROLE, SUBMIT, values.map((value, index) => (index === 8 ? [2] : value)))).rejects.toMatchObject({ constraint: 'screening_rows' });
    await expect(submit({ rows: [] })).rejects.toMatchObject({ constraint: 'screening_rows' });
    const many = Array.from({ length: 50_001 }, (_, index) => ['97110', '', 1 + (index % 999), '11', 'medicare_ffs', `20${String(10 + Math.floor(index / 999) % 17)}-Q1`, 0n, 1] as const);
    await expect(submit({ rows: many })).rejects.toMatchObject({ constraint: 'screening_rows' });
    await expect(submit({ rows: [FIRST_ROW, FIRST_ROW] })).rejects.toMatchObject({ code: '23505', constraint: 'screening_result_once' });
    await expect(submit({ rows: [['97110', 'GP CQ', 1, '11', 'medicare_ffs', '2026-Q1', 1n, 1]] })).rejects.toMatchObject({ code: '23514', constraint: 'screening_result_modifiers' });
    await expect(submit({ rows: [['97110', 'GP GP', 1, '11', 'medicare_ffs', '2026-Q1', 1n, 1]] })).rejects.toMatchObject({ constraint: 'screening_result_modifiers' });
    await expect(submit({ rows: [['97110', '', 1, '11', 'medicare_ffs', '2026-01', 1n, 1]] })).rejects.toMatchObject({ constraint: 'screening_result_service_band' });
    await expect(submit({ rows: [['97110', '', 1, '11', 'tricare', '2026-Q1', 1n, 1]] })).rejects.toMatchObject({ constraint: 'screening_result_payer_product' });
    await expect(submit({ email: 'not an address' })).rejects.toMatchObject({ constraint: 'screening_prospect_contact_email' });
    // Only an address the mail service can send to: plain ASCII, a dot-atom before the @, a dotted domain after it.
    for (const email of ['pois,on@clinic.synthetic.test', 'prospect@localhost', 'prospect@clinic.synthetic.test.', 'prospéct@clinic.synthetic.test', '.p@clinic.synthetic.test', 'p..q@clinic.synthetic.test', `${'p'.repeat(65)}@clinic.synthetic.test`]) {
      await expect(submit({ email }), email).rejects.toMatchObject({ constraint: 'screening_prospect_contact_email' });
    }
    // A procedure code has a real code's shape: five letters (a name) are refused, and so are identifiers in the figures.
    for (const code of ['SMITH', 'MARIA', 'A1B2C', 'W1234']) {
      await expect(submit({ rows: [[code, '', 1, '11', 'commercial', '2026-Q1', 1n, 1]] }), code).rejects.toMatchObject({ constraint: 'screening_result_procedure_code' });
    }
    await expect(submit({ rows: [['97110', '', 1, '11', 'medicare_ffs', '2026-Q1', 12_345_678_900n, 24]] })).rejects.toMatchObject({ constraint: 'screening_result_observed' });
    await expect(submit({ rows: [['97110', '', 1, '11', 'medicare_ffs', '2026-Q1', 100n, 100_001]] })).rejects.toMatchObject({ constraint: 'screening_result_claim_count' });
    for (const code of ['97110', '0001F', '0042T', '0001U', '0002M', 'G0283', 'V2020']) {
      expect(await submit({ rows: [[code, '', 1, '11', 'commercial', '2026-Q1', 2_500_000n, 1]] }), code).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('records a rejected upload with its reasons alone, and its audit event', async () => {
    const [row] = await as<{ id: string }>(APP_ROLE, 'SELECT reject_screening_upload($1, $2, $3, $4, $5, $6, $7, $8) AS id', [
      'Synthetic Therapy Group',
      'MN',
      '00011',
      'Prospect.Rejected@Synthetic.Test',
      hex('e'),
      120,
      JSON.stringify([{ code: 'phi_column', column: 4, phi: 'member_id' }]),
      `test-${randomUUID()}`,
    ]);
    const upload = await admin.query('SELECT status, row_count, rejection_reasons FROM screening_upload WHERE id = $1', [row?.id]);
    expect(upload.rows).toEqual([{ status: 'rejected', row_count: 120, rejection_reasons: [{ code: 'phi_column', column: 4, phi: 'member_id' }] }]);
    expect((await admin.query('SELECT count(*)::int AS n FROM screening_run WHERE upload_id = $1', [row?.id])).rows).toEqual([{ n: 0 }]);
    expect((await admin.query('SELECT action, object_type FROM audit_event WHERE object_id = $1', [row?.id])).rows).toEqual([{ action: 'screening_rejected', object_type: 'screening_upload' }]);
    await expect(
      as(APP_ROLE, 'SELECT reject_screening_upload($1, $2, $3, $4, $5, $6, $7, $8)', ['SYNTHETIC', 'MN', '00011', 'p@synthetic.test', hex('e'), 1, JSON.stringify([{ code: 'phi_column', header: 'Member ID' }]), 'x']),
    ).rejects.toMatchObject({ constraint: 'screening_upload_reasons' });
    await expect(as(APP_ROLE, 'SELECT reject_screening_upload($1, $2, $3, $4, $5, $6, $7, $8)', ['SYNTHETIC', 'MN', '00011', 'p@synthetic.test', hex('e'), 1, '[]', 'x'])).rejects.toMatchObject({
      constraint: 'screening_upload_rejected',
    });
  });

  it('never prices an MA contracted or commercial row, and holds a priced row to the line amount times the count in bigint', async () => {
    const runId = await submit();
    // A contract-required row is not pending, so the operator's record leaves it as it is.
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_claim($1)', [runId])).toHaveLength(1);
    const recorded = await as<{ n: number }>(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) AS n', [
      runId,
      [3, 4],
      ['priced', 'priced'],
      ['100', '100'],
      ['100', '100'],
      ['200', '300'],
      ['-2800', '-3700'],
      [true, true],
      [null, null],
      [null, null],
      [hex('f'), hex('f')],
    ]);
    expect(recorded).toEqual([{ n: 0 }]);
    // Even the owner cannot move one back to pending, or insert one priced as non-contracted.
    await expect(admin.query("UPDATE screening_result SET disposition = 'pending' WHERE run_id = $1 AND row_no = 4", [runId])).rejects.toMatchObject({ code: '23514' });
    await expect(submit({ rows: [['97140', '', 1, '22', 'commercial', '2026-Q1', 1n, 1]] }).then((id) =>
      admin.query("UPDATE screening_result SET disposition = 'rates_change_in_band', trace_sha256 = $2 WHERE run_id = $1", [id, hex('f')]),
    )).rejects.toMatchObject({ code: '23514' });
    const figures = (line: string, unrounded: string, expected: string, difference: string, pooled: boolean | null = true) =>
      as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) AS n', [runId, [1], ['priced'], [line], [unrounded], [expected], [difference], [pooled], [null], [null], [hex('f')]]);
    // A priced row says whether its code is in the reduction across a visit's codes.
    await expect(figures('5000', '5000.4', '25000', '15000', null)).rejects.toMatchObject({ code: '23514', constraint: 'screening_result_priced' });
    await expect(figures('5000', '5000.4', '24999', '14999')).rejects.toMatchObject({ code: '23514', constraint: 'screening_result_figures' });
    await expect(figures('5000', '5001', '25000', '15000')).rejects.toMatchObject({ constraint: 'screening_result_figures' });
    await expect(figures('5000', '5000.4', '25000', '15001')).rejects.toMatchObject({ constraint: 'screening_result_figures' });
    await expect(figures('-1', '-1', '-5', '-10005')).rejects.toMatchObject({ constraint: 'screening_result_figures' });
    expect(await figures('5000', '5000.4', '25000', '15000')).toEqual([{ n: 1 }]);
    // A row is priced once.
    expect(await figures('5000', '5000.4', '25000', '15000')).toEqual([{ n: 0 }]);
    // The largest figure a row can hold stays exact: 999 units at about $500 a unit, times 100,000 claim lines.
    const big = await submit({ rows: [['97110', '', 999, '11', 'medicare_ffs', '2026-Q1', 99_999_999_999n, 100_000]] });
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_claim($1)', [big])).toHaveLength(1);
    const line = 49_950_000n;
    const expected = line * 100_000n;
    expect(
      await as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) AS n', [
        big,
        [1],
        ['priced'],
        [line.toString()],
        [`${line.toString()}.4999999`],
        [expected.toString()],
        [(expected - 99_999_999_999n).toString()],
        [false],
        [null],
        [null],
        [hex('f')],
      ]),
    ).toEqual([{ n: 1 }]);
    expect((await admin.query('SELECT expected_cents::text AS e, difference_cents::text AS d FROM screening_result WHERE run_id = $1', [big])).rows).toEqual([
      { e: '4995000000000', d: '4895000000001' },
    ]);
  });

  it('keeps an unpriced row’s reason and the engine’s detail, and a trace hash on every row pricing reached', async () => {
    const runId = await submit();
    await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_claim($1)', [runId]);
    const record = (disposition: string, reason: string | null, detail: string | null, trace: string | null) =>
      as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) AS n', [runId, [2], [disposition], [null], [null], [null], [null], [null], [reason], [detail], [trace]]);
    await expect(record('unpriced', null, null, hex('f'))).rejects.toMatchObject({ constraint: 'screening_result_unpriced' });
    await expect(record('unpriced', 'NO_AGREEMENT', 'no_gpci', hex('f'))).rejects.toMatchObject({ constraint: 'screening_result_unpriced' });
    await expect(record('unpriced', 'GUESSED', null, hex('f'))).rejects.toMatchObject({ constraint: 'screening_result_unpriced_reason' });
    await expect(record('unpriced', 'ENGINE_ERROR', 'locality_needs_zip_plus_four', null)).rejects.toMatchObject({ constraint: 'screening_result_trace' });
    await expect(record('rates_change_in_band', 'NO_PFS_VALUE', null, hex('f'))).rejects.toMatchObject({ constraint: 'screening_result_unpriced' });
    expect(await record('unpriced', 'ENGINE_ERROR', 'locality_needs_zip_plus_four', hex('f'))).toEqual([{ n: 1 }]);
  });

  it('moves a run queued, pricing, then complete or failed, sets its token hash and its conversion once, and refuses the rest', async () => {
    const runId = await submit();
    await expect(admin.query("UPDATE screening_run SET status = 'complete', result_token_sha256 = $2, completed_at = now(), engine_version = 'phase-two/1' WHERE id = $1", [runId, hex('1')])).rejects.toMatchObject({
      code: '23514',
    });
    await expect(admin.query("UPDATE screening_run SET release_no = 900002 WHERE id = $1", [runId])).rejects.toMatchObject({ code: '23514' });
    await expect(admin.query("UPDATE screening_run SET expires_at = expires_at + interval '1 day', created_at = created_at + interval '1 day' WHERE id = $1", [runId])).rejects.toMatchObject({
      code: '23514',
    });
    // A claimed run is not claimed again while its pricing is fresh.
    const [claim] = await as<{ release_no: number; release_available: boolean; zip: string; settings: object; as_of: string; row_count: number; attempt: number }>(
      OPERATOR_ROLE,
      'SELECT release_no, release_available, zip, settings, as_of::text AS as_of, row_count, attempt FROM operator_screening_claim($1)',
      [runId],
    );
    expect(claim).toEqual({ release_no: 900001, release_available: true, zip: '00011', settings: SPLIT, as_of: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string, row_count: 6, attempt: 1 });
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_claim($1)', [runId])).toEqual([]);
    // The release as the engine reads it: the run's ZIP's locality alone.
    const release = await as<{ record_type: string; key: object; sha256: string }>(OPERATOR_ROLE, 'SELECT record_type, key, sha256 FROM operator_screening_release($1)', [runId]);
    expect(release).toEqual([{ record_type: 'locality_map', key: { zip: '00011' }, sha256: hex('b') }]);
    // It completes only once nothing is pending.
    await expect(as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, $3, $4)', [runId, hex('2'), 'phase-two/1', 'x'])).rejects.toMatchObject({ code: '23514' });
    // The trigger refuses moving started_at without a claim, so a stale run is aged as the superuser, triggers off.
    await expect(admin.query("UPDATE screening_run SET started_at = started_at - interval '11 minutes' WHERE id = $1", [runId])).rejects.toMatchObject({ code: '23514' });
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      await client.query("UPDATE screening_run SET started_at = started_at - interval '11 minutes' WHERE id = $1", [runId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect((await as<{ status: string }>(OPERATOR_ROLE, 'SELECT status FROM operator_screening_due(0, 100) WHERE run_id = $1', [runId]))).toEqual([{ status: 'pricing' }]);
    expect(await as<{ attempt: number }>(OPERATOR_ROLE, 'SELECT attempt FROM operator_screening_claim($1)', [runId])).toEqual([{ attempt: 2 }]);
    const pending = await as<{ row_no: number }>(OPERATOR_ROLE, 'SELECT row_no FROM operator_screening_rows($1, 0, 5000)', [runId]);
    expect(pending.map((row) => row.row_no)).toEqual([1, 2]);
    await as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', [
      runId,
      [1, 2],
      ['priced', 'rates_change_in_band'],
      ['5000', null],
      ['5000', null],
      ['25000', null],
      ['15000', null],
      [false, null],
      [null, null],
      [null, null],
      [hex('f'), hex('f')],
    ]);
    // A token is stored only as its hash: a link token itself does not fit the column.
    await expect(as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, $3, $4)', [runId, 'abcdefghijklmnopqrstuvwxyzabcdef', 'phase-two/1', 'x'])).rejects.toMatchObject({
      constraint: 'screening_run_result_token',
    });
    const done = await as<{ contact_email: string; row_count: number }>(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, $3, $4)', [runId, hex('2'), 'phase-two/1', 'x']);
    expect(done).toEqual([{ contact_email: expect.stringMatching(/@synthetic\.test$/) as string, row_count: 6 }]);
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, $3, $4)', [runId, hex('3'), 'phase-two/1', 'x'])).toEqual([]);
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_fail($1, $2, $3)', [runId, 'PRICING_FAILED', 'x'])).toEqual([]);
    await expect(admin.query('UPDATE screening_run SET result_token_sha256 = $2 WHERE id = $1', [runId, hex('4')])).rejects.toMatchObject({ code: '23514' });
    const [summary] = await as<{ priced_rows: number; unpriced_rows: number; contract_rows: number; contract_observed_cents: string; not_screened_rows: number; converted: boolean }>(
      APP_ROLE,
      'SELECT priced_rows, unpriced_rows, contract_rows, contract_observed_cents, not_screened_rows, converted FROM screening_result_summary($1)',
      [hex('2')],
    );
    expect(summary).toEqual({ priced_rows: 1, unpriced_rows: 1, contract_rows: 2, contract_observed_cents: '7000', not_screened_rows: 2, converted: false });
    const [request] = await as<{ id: string }>(APP_ROLE, 'SELECT convert_screening($1, $2, $3, $4, $5, $6) AS id', [hex('2'), 'SYNTHETIC CONTACT', 2, ['SYNTHETIC PAYER'], 'in_house', 'x']);
    await expect(as(APP_ROLE, 'SELECT convert_screening($1, $2, $3, $4, $5, $6)', [hex('2'), 'SYNTHETIC CONTACT', 2, ['SYNTHETIC PAYER'], 'in_house', 'x'])).rejects.toMatchObject({
      constraint: 'screening_converted_once',
    });
    await expect(admin.query('UPDATE screening_run SET converted_at = now() WHERE id = $1', [runId])).rejects.toMatchObject({ constraint: 'screening_converted_once' });
    expect((await admin.query('SELECT organization_name, contact_email, status FROM prospect_request WHERE id = $1', [request?.id])).rows).toEqual([
      { organization_name: 'Synthetic Therapy Group', contact_email: expect.stringMatching(/@synthetic\.test$/) as string, status: 'new' },
    ]);
    // A failed run is done; a queued one may fail.
    const queued = await submit();
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_fail($1, $2, $3)', [queued, 'RELEASE_UNAVAILABLE', 'x'])).toHaveLength(1);
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_claim($1)', [queued])).toEqual([]);
    await expect(admin.query("UPDATE screening_run SET status = 'pricing', attempts = 1, started_at = now(), failed_at = NULL, failure_code = NULL WHERE id = $1", [queued])).rejects.toMatchObject({
      code: '23514',
    });
  });

  it('reads a result only for a complete run before it expires, and inserts rows only with a queued run', async () => {
    const runId = await submit();
    expect(await as(APP_ROLE, 'SELECT * FROM screening_result_summary($1)', [hex('5')])).toEqual([]);
    await complete(runId, hex('5'));
    expect(await as(APP_ROLE, 'SELECT * FROM screening_result_summary($1)', [hex('5')])).toHaveLength(1);
    expect(await as(APP_ROLE, 'SELECT * FROM screening_result_summary($1)', ['not-a-hash'])).toEqual([]);
    await expect(
      admin.query(
        "INSERT INTO screening_result (run_id, row_no, procedure_code, modifiers, units, place_of_service, payer_product, service_band, claim_count, observed_allowed_cents, disposition) VALUES ($1, 99, '97110', '{}', 1, '11', 'medicare_ffs', '2026-Q4', 1, 0, 'pending')",
        [runId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(admin.query('DELETE FROM screening_run WHERE id = $1', [runId])).rejects.toMatchObject({ constraint: 'screening_kept_until_expiry' });
    await expect(admin.query('TRUNCATE screening_result')).rejects.toMatchObject({ code: 'P0001' });
    await age(runId, 30);
    expect(await as(APP_ROLE, 'SELECT * FROM screening_result_summary($1)', [hex('5')])).toEqual([]);
    expect(await as(APP_ROLE, 'SELECT * FROM screening_result_rows($1, 25)', [hex('5')])).toEqual([]);
    await expect(as(APP_ROLE, 'SELECT convert_screening($1, $2, $3, $4, $5, $6)', [hex('5'), 'SYNTHETIC CONTACT', 2, ['SYNTHETIC PAYER'], 'in_house', 'x'])).rejects.toMatchObject({ code: 'P0002' });
  });

  it('keeps the split append-only, valid and approved by a contract specialist, the latest in force', async () => {
    await expect(approveSplit({ '11': 'nonfacility' })).rejects.toMatchObject({ constraint: 'screening_place_of_service_split_settings' });
    await expect(approveSplit({})).rejects.toMatchObject({ constraint: 'screening_place_of_service_split_settings' });
    await expect(approveSplit({ '1': 'facility' })).rejects.toMatchObject({ constraint: 'screening_place_of_service_split_settings' });
    await expect(approveSplit({ '00': 'facility' })).rejects.toMatchObject({ constraint: 'screening_place_of_service_split_settings' });
    await expect(as(APP_ROLE, 'SELECT console_approve_screening_split($1)', [JSON.stringify(SPLIT)], analyst)).rejects.toMatchObject({ code: '42501' });
    await expect(as(APP_ROLE, 'SELECT console_approve_screening_split($1)', [JSON.stringify(SPLIT)])).rejects.toMatchObject({ code: '42501' });
    await expect(as(APP_ROLE, 'SELECT * FROM console_screening_splits()', [], analyst)).rejects.toMatchObject({ code: '42501' });
    const later = await approveSplit({ '11': 'non_facility', '12': 'non_facility', '22': 'facility' });
    const splits = await as<{ id: string; approved_by: string; in_force: boolean }>(APP_ROLE, 'SELECT id, approved_by, in_force FROM console_screening_splits()', [], specialist);
    expect(splits[0]).toEqual({ id: later, approved_by: specialist, in_force: true });
    expect(splits.slice(1).every((split) => !split.in_force)).toBe(true);
    const [status] = await as<{ place_of_service_split_id: string }>(APP_ROLE, 'SELECT place_of_service_split_id FROM screening_status()');
    expect(status?.place_of_service_split_id).toBe(later);
    await expect(admin.query('UPDATE screening_place_of_service_split SET settings = $2 WHERE id = $1', [later, JSON.stringify(SPLIT)])).rejects.toMatchObject({ code: 'P0001' });
    await expect(admin.query('DELETE FROM screening_place_of_service_split WHERE id = $1', [later])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('expires a screening 30 days after its upload: its prospect, upload, run and rows go together, each an audit event, and its conversion stays', async () => {
    const runId = await submit();
    await complete(runId, hex('6'));
    await as(APP_ROLE, 'SELECT convert_screening($1, $2, $3, $4, $5, $6)', [hex('6'), 'SYNTHETIC CONTACT', 1, ['SYNTHETIC PAYER'], 'billing_firm', 'x']);
    const [{ prospect_id: prospectId, upload_id: uploadId, request_id: requestId } = { prospect_id: '', upload_id: '', request_id: '' }] = (
      await admin.query<{ prospect_id: string; upload_id: string; request_id: string }>(
        'SELECT u.prospect_id, u.id AS upload_id, r.converted_prospect_request_id AS request_id FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE r.id = $1',
        [runId],
      )
    ).rows;
    // Not yet: a day short of the 30.
    await age(runId, 29);
    await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_expire(1000, $1)', ['x']);
    expect((await admin.query('SELECT count(*)::int AS n FROM screening_run WHERE id = $1', [runId])).rows).toEqual([{ n: 1 }]);
    await age(runId, 1);
    const [expired] = await as<{ prospects: number; runs: number }>(OPERATOR_ROLE, 'SELECT * FROM operator_screening_expire(1000, $1)', [`test-${randomUUID()}`]);
    expect(expired?.prospects).toBeGreaterThanOrEqual(1);
    expect(expired?.runs).toBeGreaterThanOrEqual(1);
    for (const [table, column, id] of [
      ['screening_prospect', 'id', prospectId],
      ['screening_upload', 'id', uploadId],
      ['screening_run', 'id', runId],
      ['screening_result', 'run_id', runId],
    ] as const) {
      expect((await admin.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`, [id])).rows, table).toEqual([{ n: 0 }]);
    }
    expect((await admin.query("SELECT action FROM audit_event WHERE object_id = $1 AND action = 'screening_expired'", [prospectId])).rows).toEqual([{ action: 'screening_expired' }]);
    expect((await admin.query("SELECT action, object_type FROM audit_event WHERE object_id = $1 AND action = 'screening_converted'", [requestId])).rows).toEqual([
      { action: 'screening_converted', object_type: 'prospect_request' },
    ]);
    expect((await admin.query('SELECT count(*)::int AS n FROM prospect_request WHERE id = $1', [requestId])).rows).toEqual([{ n: 1 }]);
  });
});
