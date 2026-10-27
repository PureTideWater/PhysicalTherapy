import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { catalogProblems } from './catalog';
import { readDatabaseUrl } from './config';
import { MIGRATIONS_DIR } from './migrate';
import { APP_ROLE, BILLING_ROLE, ESIGN_ROLE, OPERATOR_ROLE, OWNER_ROLE, SCREENING_ROLE } from './roles';
import { type MigratedDatabase, addMembership, createMigratedDatabase, createOrganization, createUser, endPool } from './testing';

/**
 * The free screening tables (Change Order 001, CO-04 and CO-12; reconciliation-001 D18 a; migration
 * 20261104090000_free_screening.sql; docs/adr/0062). Test matrix SEC-17: the tables hold no PHI-shaped column,
 * read from the catalog. Beside it, the rules the tables keep: no practice_id and no registry row, row-level
 * security forced with the owner's policy only, no privilege for any other role (the application and the operator
 * reach them through the definer functions alone, each granted to its one role), rejection reasons that cannot hold
 * a header or a cell, MA contracted and commercial rows that are never priced, figures that are the line amount
 * times the count in bigint, runs that move one way, a token stored only as its hash, rows kept until they expire,
 * and a split a contract specialist approves. SCR-07, the database's part: no row of fewer than 11 claim lines is
 * stored (10 refused, 11 taken), and an upload keeps only three numbers of the rows the browser left out, held to what
 * the browser could have counted, beside the SHA-256 of the rows it stored, computed by the database and never taken
 * from the caller (a refused upload keeps no hash); and a practice keeps one accepted screening at a time, so no two of
 * its screenings can be subtracted into a cell of fewer than 11 claim lines. Synthetic data only.
 */

const SCREENING_TABLES = [
  'marketing_campaign',
  // The split, every practice's default since migration 20261105090000 (renamed from screening_place_of_service_split).
  'place_of_service_split',
  'screening_lead',
  'screening_lead_product',
  'screening_outcome',
  'screening_prospect',
  // The day's uploads as the queue's sums count them (migration 20261106090000; Q7).
  'screening_queue_tally',
  'screening_result',
  'screening_run',
  'screening_upload',
] as const;

/**
 * Column names shaped like the five kinds CO-04 forbids (names, dates of birth, member IDs, dates of service,
 * claim numbers) and the identifiers around them.
 */
const PHI_SHAPED =
  /patient|member|subscriber|insured|beneficiar|guarantor|first_?name|last_?name|middle_?name|full_?name|given_?name|surname|family_?name|^name$|birth|dob|^age$|ssn|social_security|mrn|medical_record|chart|account|policy|mbi|hicn|claim_(no|num|number|id|control)|^clp|icn|pcn|tcn|dcn|ccn|date_of_service|service_date|dos|visit|encounter|admi|discharge|address|phone|street/;

const SPLIT = { '11': 'non_facility', '22': 'facility' };
const hex = (character: string) => character.repeat(64);
/** Ten random letters: a practice name of its own for each screening, so none replaces another unless a test says so. */
const letters = () =>
  randomUUID()
    .replace(/-/g, '')
    .slice(0, 10)
    .replace(/[0-9]/g, (digit) => 'ghijklmnop'.charAt(Number(digit)));

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

/** What a test-built release leaves out or adds beside the base below (migration 20261105090000's cases). */
interface ReleaseShape {
  /** 00012's ZIP+4 list: 0000-4999 in locality 01, 5000-8999 in 02, 9000-9999 not listed (as 900006 has it). */
  readonly plusFour?: boolean;
  /** No ncci_mue record at all, or MUE windows that end early. */
  readonly mue?: 'none' | { readonly effectiveTo: string };
  /** No per-code reduction record (the general one stays). */
  readonly perCodeMppr?: false;
}

/**
 * A SYNTHETIC release with two locality_map records, 00011 (no ZIP+4) and 00012 (ZIP+4 required), and for the keyed
 * read (audit #53's SQL) the keyed records of 97110 (its fee schedule values, MUE, own reduction record and same-code
 * pair), the general reduction record, a fee schedule record and a pair no screening row asks for, and a shared
 * conversion factor, all for 2026; and, as `shape` says, 00012's ZIP+4 list or less of the content a Medicare row reads
 * silently (audit #7). Values are SYNTHETIC placeholders: these tests price no row through the engine.
 */
async function publishSyntheticRelease(releaseNo: number, shape: ReleaseShape = {}): Promise<void> {
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
    if (shape.plusFour === true) {
      await client.query(
        `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256)
         VALUES ($1, 'locality_map_plus_four', '{"zip":"00012"}', $2, '2026-01-01', '2026-12-31', '{"synthetic":true}', 'L1', $3)`,
        [
          releaseNo,
          JSON.stringify({
            state: 'ZZ',
            ranges: [
              { from: '0000', to: '4999', carrier: '99999', locality: '01', rural_indicator: 'R' },
              { from: '5000', to: '8999', carrier: '99999', locality: '02', rural_indicator: 'R' },
            ],
          }),
          hex('d'),
        ],
      );
    }
    const keyed: readonly (readonly [string, object])[] = [
      ['pfs_rvu', { hcpcs: '97110', modifier: '' }],
      ['pfs_rvu', { hcpcs: '97999', modifier: '' }],
      ...(shape.mue === 'none' ? [] : [['ncci_mue', { hcpcs: '97110' }] as const]),
      ...(shape.perCodeMppr === false ? [] : [['mppr_rate', { hcpcs: '97110', modifier: '' }] as const]),
      ['mppr_rate', { component: 'practice_expense' }],
      ['ncci_ptp', { column1: '97110', column2: '97110' }],
      ['ncci_ptp', { column1: '97110', column2: '97140' }],
      ['conversion_factor', { applicability: 'non_qualifying_apm' }],
    ];
    for (const [type, key] of keyed) {
      const effectiveTo = type === 'ncci_mue' && typeof shape.mue === 'object' ? shape.mue.effectiveTo : '2026-12-31';
      await client.query(
        `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256)
         VALUES ($1, $2, $3, '{"synthetic":true}', '2026-01-01', $5, '{"synthetic":true}', 'L1', $4)`,
        [releaseNo, type, JSON.stringify(key), sha256(`${type}:${JSON.stringify(key)}`), effectiveTo],
      );
    }
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
  /** The practice's name; one of its own unless given (a screening replaces an earlier one of the same practice). */
  readonly practice?: string;
  readonly zip?: string;
  /** The ZIP+4, kept only when the ZIP's locality_map record needs it (migration 20261105090000). */
  readonly plusFour?: string | null;
  readonly email?: string;
  readonly rows?: readonly (readonly [string, string, number, string, string, string, bigint, number])[];
  /** The rows of fewer than 11 claim lines the browser left out: how many, their claim lines and their allowed cents. */
  readonly leftOut?: readonly [number | null, number | null, bigint | null];
  /** The Medicare rows the browser left out for a quarter outside the release's loaded content: how many, their claim lines and their allowed cents (Q6 (a)). */
  readonly outsideContent?: readonly [number | null, bigint | null, bigint | null];
  /** How the prospect heard of us, the cookie's campaign codes and kind of paid click, and the referring firm. */
  readonly attribution?: {
    readonly source?: string | null;
    readonly utmSource?: string | null;
    readonly utmMedium?: string | null;
    readonly utmCampaign?: string | null;
    readonly paidClick?: string | null;
    readonly firm?: string | null;
  };
  /** The SHA-256 of the consent wording ticked (PR 6e), and of the screening terms accepted. */
  readonly consentSha256?: string | null;
  readonly termsSha256?: string | null;
  /** When the web began receiving the upload (migration 20261106090000); null is the submission's own time. */
  readonly received?: Date | null;
  /** The rate limiter's keyed subject of the account: one of its own unless given, so no test's uploads share a share. */
  readonly rateSubject?: string | null;
  /** The rate limiter's keyed subject of the client address (migration 20261107090000; Q10 (a)); none unless given. */
  readonly clientSubject?: string | null;
}

/** Every row sums at least 11 claim lines (the CMS small-cell standard). */
const FIRST_ROW = ['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 10_000n, 11] as const;
const ROWS: NonNullable<SubmitOptions['rows']> = [
  FIRST_ROW,
  ['97110', 'CQ GP', 1, '11', 'ma_noncontracted', '2026-Q2', 2_000n, 11],
  ['97140', '', 1, '22', 'ma_contracted', '2026-Q1', 3_000n, 12],
  ['97530', '', 3, '11', 'commercial', '2026-Q3', 4_000n, 13],
  ['97112', '', 1, '11', 'medicaid', '2026-Q1', 500n, 11],
  ['97116', 'GP', 1, '11', 'other', '2026-Q1', 600n, 11],
];

/**
 * submit_screening's 31 arguments (migration 20261105090000: the ZIP+4 after the ZIP, the three out-of-content counts
 * after the left-out ones; migration 20261106090000: the receipt and the account's keyed subject before the request;
 * migration 20261107090000: the client's keyed subject after it).
 */
const SUBMIT_ARGUMENTS = 31;
const placeholders = (count: number) => Array.from({ length: count }, (_, index) => `$${String(index + 1)}`).join(', ');
const SUBMIT = `SELECT submit_screening(${placeholders(SUBMIT_ARGUMENTS)}) AS run_id`;

/** The rows in their canonical form (format.ts, encodeScreeningRows): each row's eight fields tab-joined, the rows joined by line feeds. */
function canonicalRows(rows: NonNullable<SubmitOptions['rows']>): string {
  return rows.map((row) => row.map(String).join('\t')).join('\n');
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
/** A keyed subject of an account of its own (the shape of the rate limiter's HMAC: 64 hex characters). */
const accountSubject = () => sha256(`account:${randomUUID()}`);

function submitValues(options: SubmitOptions = {}): unknown[] {
  const rows = options.rows ?? ROWS;
  const [leftRows, leftLines, leftCents] = options.leftOut ?? [0, 0, 0n];
  const [outsideRows, outsideLines, outsideCents] = options.outsideContent ?? [0, 0n, 0n];
  return [
    options.practice ?? `  Synthetic Therapy Group ${letters()}  `,
    'MN',
    options.zip ?? '00011',
    options.plusFour ?? null,
    options.email ?? ` Prospect.${randomUUID().slice(0, 8)}@Synthetic.Test `,
    rows.map((row) => row[0]),
    rows.map((row) => row[1]),
    rows.map((row) => row[2]),
    rows.map((row) => row[3]),
    rows.map((row) => row[4]),
    rows.map((row) => row[5]),
    rows.map((row) => row[6].toString()),
    rows.map((row) => row[7]),
    leftRows,
    leftLines,
    leftCents === null ? null : leftCents.toString(),
    outsideRows,
    outsideLines === null ? null : outsideLines.toString(),
    outsideCents === null ? null : outsideCents.toString(),
    options.attribution?.source ?? null,
    options.attribution?.utmSource ?? null,
    options.attribution?.utmMedium ?? null,
    options.attribution?.utmCampaign ?? null,
    options.attribution?.paidClick ?? null,
    options.attribution?.firm ?? null,
    options.consentSha256 ?? null,
    options.termsSha256 ?? null,
    options.received ?? null,
    options.rateSubject === undefined ? accountSubject() : options.rateSubject,
    `test-${randomUUID()}`,
    options.clientSubject ?? null,
  ];
}

async function submit(options: SubmitOptions = {}): Promise<string> {
  const [row] = await as<{ run_id: string }>(APP_ROLE, SUBMIT, submitValues(options));
  return row?.run_id ?? '';
}

async function approveSplit(settings: object = SPLIT): Promise<string> {
  const [row] = await as<{ id: string }>(APP_ROLE, 'SELECT console_approve_place_of_service_split($1) AS id', [JSON.stringify(settings)], specialist);
  return row?.id ?? '';
}

/** Moves a run to complete with the given token hash, pricing its pending rows as the operator would. */
async function complete(runId: string, tokenSha256: string): Promise<void> {
  const [claimed] = await as<{ attempt: number }>(OPERATOR_ROLE, 'SELECT attempt FROM operator_screening_claim($1)', [runId]);
  expect(claimed).toBeDefined();
  await priceAndComplete(runId, claimed?.attempt ?? 0, tokenSha256);
}

/** Prices a claimed run's pending rows as the operator would, then completes it with the given token hash. */
async function priceAndComplete(runId: string, attempt: number, tokenSha256: string): Promise<void> {
  await priceRows(runId, attempt);
  expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, $5)', [runId, tokenSha256, 'phase-two/1', `test-${randomUUID()}`, attempt])).toHaveLength(1);
}

/** Records a price for every pending row of a claimed run, as the operator would. */
async function priceRows(runId: string, attempt: number): Promise<void> {
  const pending = await as<{ row_no: number; claim_count: number; observed_allowed_cents: string }>(OPERATOR_ROLE, 'SELECT * FROM operator_screening_rows($1, 0, 5000, $2)', [runId, attempt]);
  const lines = pending.map(() => 5_000n);
  const reduced = pending.map(() => 4_000n);
  await as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)', [
    runId,
    pending.map((row) => row.row_no),
    pending.map(() => 'priced'),
    lines.map(String),
    lines.map((line) => `${line.toString()}.25`),
    pending.map((row, index) => ((lines[index] ?? 0n) * BigInt(row.claim_count)).toString()),
    pending.map((row, index) => ((lines[index] ?? 0n) * BigInt(row.claim_count) - BigInt(row.observed_allowed_cents)).toString()),
    pending.map(() => true),
    reduced.map(String),
    reduced.map((line) => `${line.toString()}.4`),
    pending.map((row, index) => ((reduced[index] ?? 0n) * BigInt(row.claim_count)).toString()),
    pending.map((row, index) => ((reduced[index] ?? 0n) * BigInt(row.claim_count) - BigInt(row.observed_allowed_cents)).toString()),
    pending.map(() => hex('e')),
    pending.map(() => null),
    pending.map(() => null),
    pending.map(() => hex('f')),
    attempt,
  ]);
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
       UPDATE screening_run r SET created_at = r.created_at - $2::interval, expires_at = r.expires_at - $2::interval, received_at = r.received_at - $2::interval
         FROM target WHERE r.id = target.run_id`,
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
  it('names ten tables, none of whose columns is shaped like a name, a date of birth, a member ID, a date of service or a claim number', async () => {
    const { rows } = await admin.query<{ table_name: string; column_name: string; type: string }>(
      `SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY ($1) AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY 1, a.attnum`,
      [SCREENING_TABLES],
    );
    expect([...new Set(rows.map((row) => row.table_name))]).toEqual([...SCREENING_TABLES]);
    expect(rows.filter((row) => PHI_SHAPED.test(row.column_name)).map((row) => `${row.table_name}.${row.column_name}`)).toEqual([]);
    // No calendar date at all: a date of birth or of service would be one; the only times are when a row was made, when
    // it expires, and when a run moved, was opened or converted, a split or campaign approved, a summary screened,
    // opened and reminded.
    expect(rows.filter((row) => row.type === 'date').map((row) => `${row.table_name}.${row.column_name}`)).toEqual([]);
    expect(rows.filter((row) => row.type.startsWith('timestamp')).map((row) => `${row.table_name}.${row.column_name}`).sort()).toEqual(
      [
        'marketing_campaign.added_at',
        'screening_lead.created_at',
        'screening_lead.expires_at',
        'screening_lead.reminder_sent_at',
        'screening_lead.result_first_opened_at',
        'screening_lead.screened_at',
        'place_of_service_split.approved_at',
        'screening_prospect.created_at',
        'screening_prospect.expires_at',
        // When an upload entered the queue's day tally (migration 20261106090000; Q7).
        'screening_queue_tally.created_at',
        'screening_run.completed_at',
        'screening_run.converted_at',
        'screening_run.created_at',
        'screening_run.expires_at',
        'screening_run.failed_at',
        'screening_run.first_opened_at',
        'screening_run.started_at',
        // When the web received the upload, and when its pricing last progressed (migration 20261106090000).
        'screening_run.received_at',
        'screening_run.progress_at',
        'screening_upload.created_at',
        'screening_upload.expires_at',
      ].sort(),
    );
    // The prospect's own fields are a practice's, not a patient's: its name, state, ZIP and contact address, how it
    // heard of us (a closed list, the campaign codes of a link and the kind of paid click, a referring firm), and the
    // SHA-256s of the consent and terms wording accepted.
    expect(rows.filter((row) => row.table_name === 'screening_prospect').map((row) => row.column_name)).toEqual([
      'id',
      'practice_name',
      'state',
      'zip',
      'contact_email',
      'source',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'paid_click',
      'referring_firm',
      'followup_consent_sha256',
      'screening_terms_sha256',
      'created_at',
      'expires_at',
      // The ZIP+4, kept only when the ZIP needs it (migration 20261105090000).
      'zip_plus_four',
    ]);
    // An outcome holds no name, email, ZIP, exact count, dollar figure, date or day count: bands, whole percents of a
    // total it never holds, closed codes, flags, the month as text and the release (audit #57).
    const outcome = rows.filter((row) => row.table_name === 'screening_outcome');
    expect(outcome.map((row) => row.column_name)).toEqual([
      'id',
      'upload_id',
      'screened_month',
      'stage',
      'source',
      'channel',
      'campaign',
      'consented',
      'row_band',
      'left_out_band',
      'refusal_codes',
      'after_refusal',
      'release_no',
      'engine_version',
      'priced_share_pct',
      'contract_share_pct',
      'could_not_price_share_pct',
      'not_screened_share_pct',
      'anomaly_band',
      'anomaly_difference_band',
      'first_open_band',
      'converted',
      'superseded',
    ]);
    expect(
      outcome.filter((row) => /cents|claim|count|rows|days|name|email|zip|practice|contact|_at$/.test(row.column_name) || row.type.startsWith('timestamp') || row.type === 'bigint'),
    ).toEqual([]);
    // Its only numbers: the release, and four whole percents.
    expect(outcome.filter((row) => ['integer', 'smallint', 'bigint', 'numeric'].includes(row.type)).map((row) => `${row.column_name} ${row.type}`)).toEqual([
      'release_no integer',
      'priced_share_pct smallint',
      'contract_share_pct smallint',
      'could_not_price_share_pct smallint',
      'not_screened_share_pct smallint',
    ]);
    // Every dollar column of the nine is bigint cents.
    expect(rows.filter((row) => row.column_name.endsWith('_cents') && row.type !== 'bigint')).toEqual([]);
    // An upload keeps no byte of its file and no hash of it: no bytea, no free text but the hash of the rows stored and
    // the coded reasons, and of the rows of fewer than 11 claim lines the browser left out, three numbers alone.
    expect(rows.filter((row) => row.type === 'bytea')).toEqual([]);
    expect(rows.filter((row) => row.table_name === 'screening_upload').map((row) => row.column_name)).toEqual([
      'id',
      'prospect_id',
      'rows_sha256',
      'row_count',
      'status',
      'rejection_reasons',
      'left_out_rows',
      'left_out_claim_lines',
      'left_out_allowed_cents',
      'created_at',
      'expires_at',
      // The Medicare rows left out for a quarter outside the release's loaded content: three numbers (migration 20261105090000).
      'outside_content_rows',
      'outside_content_claim_lines',
      'outside_content_allowed_cents',
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
    // A row of fewer than 11 claim lines is named by its number and field alone, never its count.
    expect(await valid([{ code: 'too_few_claim_lines', row: 2, field: 'claim_count' }])).toBe(true);
    // A Medicare row outside the release's loaded content, sent anyway: its row and field, never its quarter.
    expect(await valid([{ code: 'band_outside_content', row: 7, field: 'service_band' }])).toBe(true);
    expect(await valid([{ code: 'band_outside_content', row: 7, field: 'service_band', band: '2025-Q4' }])).toBe(false);
    expect(await valid([{ code: 'too_few_claim_lines', row: 2, field: 'claim_count', claim_count: 1 }])).toBe(false);
    expect(await valid([{ code: 'too_few_claim_lines', row: 2, field: 'claim_count', value: '97110' }])).toBe(false);
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

  it('grants each definer function to exactly its roles, and none to PUBLIC', async () => {
    const { rows } = await admin.query<{ name: string; definer: boolean; app: boolean; operator: boolean; billing: boolean; screening: boolean; public: boolean }>(
      `SELECT p.oid::regprocedure::text AS name, p.prosecdef AS definer,
              has_function_privilege($1, p.oid, 'EXECUTE') AS app, has_function_privilege($2, p.oid, 'EXECUTE') AS operator,
              has_function_privilege($3, p.oid, 'EXECUTE') AS billing, has_function_privilege($4, p.oid, 'EXECUTE') AS screening,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') AS public
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND (p.proname LIKE '%screening%' OR p.proname LIKE '%marketing%') ORDER BY 1`,
      [APP_ROLE, OPERATOR_ROLE, BILLING_ROLE, SCREENING_ROLE],
    );
    const byName = Object.fromEntries(rows.map((row) => [row.name.replace(/\(.*$/, ''), row]));
    // The split's console functions and the run guard's split are named without 'screening' since migration
    // 20261105090000; location.db.test.ts checks them, and screening_band_days(), by their exact names.
    const forApp = [
      'screening_status',
      'submit_screening',
      'reject_screening_upload',
      'screening_result_summary',
      'screening_result_groups',
      'screening_result_group_totals',
      'screening_result_coverage',
      'screening_result_rows',
      'convert_screening',
      'screening_result_opened',
      'screening_lead_withdraw',
      'console_register_marketing_campaign',
      // The "sent" page's wait state (migration 20261106090000).
      'screening_wait',
      // Whether the screening's mail is paused, and ready (migration 20261107090000; screeningOpen()).
      'screening_mail_status',
    ];
    // The nine that price a screening stay the operator's for the one release the previous image's platform task may
    // still price in (migration 20261106090000); the first schema pull request after it is deployed takes them away.
    const forOperator = [
      'operator_screening_due',
      'operator_screening_claim',
      'operator_screening_release',
      'operator_screening_rows',
      'operator_screening_record',
      'operator_screening_complete',
      'operator_screening_fail',
      'operator_screening_expire',
      'operator_screening_run_keys',
      'operator_screening_run_records',
      'operator_screening_reminders_due',
      'operator_screening_reminder_sent',
    ];
    // The screening consumer (WORKER_JOBS=screening): the nine that price a screening and the queue's gauge, and nothing
    // else; not the expiry, which stays the platform's, nor the reminders, which PR 6e decides.
    const forScreening = [
      'operator_screening_due',
      'operator_screening_claim',
      'operator_screening_release',
      'operator_screening_run_keys',
      'operator_screening_run_records',
      'operator_screening_rows',
      'operator_screening_record',
      'operator_screening_complete',
      'operator_screening_fail',
      'operator_screening_queue',
      // The mail gate it reads before it claims (migration 20261107090000; section 5, D3 and D5).
      'screening_mail_gate',
    ];
    // Read by submit_screening() and the triggers as the owner alone: no role calls them, and they run as their caller.
    // The mail's triggers and screening_mail_sending() since migration 20261107090000 (D5: granted to no role).
    const forNone = [
      'screening_wait_limits',
      'screening_queue_tier',
      'screening_mail_sending',
      'screening_upload_mail_gate',
      'screening_run_mail_gate',
      'screening_run_mail_refusal',
      'screening_bounce_budget_spent',
      'screening_contact_refused',
    ];
    for (const name of [...forApp, ...forOperator, ...forScreening, ...forNone]) {
      expect(byName[name], name).toBeDefined();
    }
    for (const row of rows) {
      const name = row.name.replace(/\(.*$/, '');
      expect(row.public, `${name} is executable by PUBLIC`).toBe(false);
      expect(row.billing, name).toBe(false);
      expect(row.app, name).toBe(forApp.includes(name));
      expect(row.operator, name).toBe(forOperator.includes(name));
      expect(row.screening, name).toBe(forScreening.includes(name));
      // Every function a role may call runs as the owner, and none other does.
      expect(row.definer, name).toBe(forApp.includes(name) || forOperator.includes(name) || forScreening.includes(name));
    }
    expect(rows.filter((row) => !row.definer && forNone.includes(row.name.replace(/\(.*$/, ''))).map((row) => row.name).sort()).toEqual([
      'screening_bounce_budget_spent(text,text)',
      'screening_contact_refused(text)',
      'screening_mail_sending()',
      'screening_queue_tier(text,integer)',
      'screening_run_mail_gate()',
      'screening_run_mail_refusal()',
      'screening_upload_mail_gate()',
      'screening_wait_limits()',
    ]);
    // By exact name: the new signature of submit_screening() (migration 20261107090000: the client's subject last) and the
    // consumer's eleven.
    const exact = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(exact[
      'submit_screening(text,text,text,text,text,text[],text[],integer[],text[],text[],text[],bigint[],integer[],integer,integer,bigint,integer,bigint,bigint,text,text,text,text,text,text,text,text,timestamp with time zone,text,text,text)'
    ]).toMatchObject({ app: true, operator: false, screening: false, definer: true });
    expect(rows.filter((row) => row.name.startsWith('submit_screening(')).map((row) => row.name)).toHaveLength(1);
    expect(rows.filter((row) => row.screening).map((row) => row.name)).toEqual(
      [
        'operator_screening_claim(uuid)',
        'operator_screening_complete(uuid,text,text,text,text,integer)',
        'operator_screening_due(integer,integer)',
        'operator_screening_fail(uuid,text,text,integer)',
        'operator_screening_queue()',
        'operator_screening_record(uuid,integer[],text[],bigint[],numeric[],bigint[],bigint[],boolean[],bigint[],numeric[],bigint[],bigint[],text[],text[],text[],text[],integer)',
        'operator_screening_release(uuid)',
        'operator_screening_rows(uuid,integer,integer,integer)',
        'operator_screening_run_keys(uuid)',
        'operator_screening_run_records(uuid)',
        'screening_mail_gate()',
      ].sort(),
    );
    // tp_screening holds nothing else anywhere: no table, sequence or other function of the schema.
    const elsewhere = await admin.query<{ object: string }>(
      `SELECT c.relname AS object FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND (has_table_privilege($1, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND c.relkind IN ('r', 'v', 'm', 'p'))
       UNION ALL
       SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND has_function_privilege($1, p.oid, 'EXECUTE') AND left(p.proname, 19) <> 'operator_screening_'
          AND p.oid <> 'screening_mail_gate()'::regprocedure`,
      [SCREENING_ROLE],
    );
    expect(elsewhere.rows).toEqual([]);
  });
});

describe('the screening rules', () => {
  beforeAll(async () => {
    // Closed until a release is in force and a split approved.
    expect(await as(APP_ROLE, 'SELECT * FROM screening_status()')).toEqual([{ release_no: null, place_of_service_split_id: null }]);
    await expect(as(APP_ROLE, SUBMIT, submitValues())).rejects.toMatchObject({ code: '23514', constraint: 'screening_closed' });
    // Closed comes first of every refusal (D2): before a paused screening stream, and an address on the refusal list.
    await pauseScreeningMail();
    await admin.query("INSERT INTO screening_mail_refusal (recipient_sha256, reason, expires_at) VALUES (mail_recipient_sha256('closed.first@synthetic.test'), 'bounced', now() + interval '1 day')");
    await expect(submit({ email: 'closed.first@synthetic.test' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_closed' });
    await resetScreeningMail();
    await publishSyntheticRelease(900001);
    expect(await as(APP_ROLE, 'SELECT * FROM screening_status()')).toEqual([{ release_no: null, place_of_service_split_id: null }]);
    await expect(as(APP_ROLE, SUBMIT, submitValues())).rejects.toMatchObject({ code: '23514', constraint: 'screening_closed' });
    await approveSplit();
  }, 60_000);

  it('opens with the release and the split in force, and refuses a ZIP the release does not map, and one whose ZIP+4 list is not loaded with or without a ZIP+4', async () => {
    const [status] = await as<{ release_no: number; place_of_service_split_id: string }>(APP_ROLE, 'SELECT * FROM screening_status()');
    expect(status?.release_no).toBe(900001);
    // The location's status in the release in force (locality_status(), migration 20261105090000), as the web reads it.
    const location = async (zip: string, plusFour: string | null) => (await as<{ status: string }>(APP_ROLE, 'SELECT status FROM locality_status(900001, $1, $2, NULL, NULL)', [zip, plusFour]))[0]?.status;
    expect(await location('00011', null)).toBe('ready');
    expect(await location('00012', null)).toBe('zip_plus_four_needed');
    expect(await location('00012', '0001')).toBe('locality_not_loaded');
    expect(await location('00099', null)).toBe('zip_unknown');
    await expect(submit({ zip: '00099' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_zip_unknown' });
    // A ZIP whose locality needs its ZIP+4, under a release that loads no ZIP+4 list of it: the list is not loaded, said
    // before the prospect is asked for digits the screening could not use (review of PR 6b-2, finding 22), and again
    // when one is given. The practice's own status keeps asking for the ZIP+4 first (locality_status() above).
    await expect(submit({ zip: '00012' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_locality_not_loaded' });
    await expect(submit({ zip: '00012', plusFour: '0001' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_locality_not_loaded' });
    // A ZIP+4 given for a ZIP that needs none is not kept (minimisation).
    const withoutNeed = await submit({ zip: '00011', plusFour: '1234' });
    const zips = await admin.query<{ id: string; zip: string; zip_plus_four: string | null }>(
      'SELECT r.id, p.zip, p.zip_plus_four FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE r.id = ANY ($1)',
      [[withoutNeed]],
    );
    expect(zips.rows).toEqual([{ id: withoutNeed, zip: '00011', zip_plus_four: null }]);
  });

  it('refuses a Medicare row in a quarter outside the release’s loaded content, and takes any other product’s row of that quarter (SCR-16)', async () => {
    // The test release loads its MUE and reduction records for 2026 alone.
    for (const product of ['medicare_ffs', 'ma_noncontracted']) {
      for (const band of ['2025-Q4', '2027-Q1']) {
        await expect(submit({ rows: [['97110', 'GP', 1, '11', product, band, 4_000n, 11]] }), `${product} ${band}`).rejects.toMatchObject({
          code: '23514',
          constraint: 'screening_band_outside_content',
        });
      }
    }
    // Among rows inside the content, one outside refuses the upload: the browser leaves such a row out, so one sent is a bypass.
    await expect(submit({ rows: [...ROWS, ['97530', '', 1, '11', 'medicare_ffs', '2025-Q4', 4_000n, 11]] })).rejects.toMatchObject({ constraint: 'screening_band_outside_content' });
    for (const product of ['ma_contracted', 'commercial', 'medicaid', 'other']) {
      expect(await submit({ rows: [['97110', 'GP', 1, '11', product, '2025-Q4', 4_000n, 11]] }), product).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(await submit({ rows: [['97110', 'GP', 1, '11', 'medicare_ffs', '2026-Q4', 4_000n, 11]] })).toMatch(/^[0-9a-f-]{36}$/);
    // The error names no quarter and no row.
    const refused = await submit({ rows: [['97110', 'GP', 1, '11', 'medicare_ffs', '2025-Q1', 4_000n, 11]] }).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(refused?.message).not.toMatch(/2025|97110/);
  });

  it('keeps of the rows left out for their quarter three numbers alone, beside the floor’s, held to what the browser could have counted (Q6 (a))', async () => {
    const runId = await submit({ leftOut: [1, 4, 1_000n], outsideContent: [2, 30n, 41_200n] });
    const stored = await admin.query(
      `SELECT u.outside_content_rows, u.outside_content_claim_lines::text AS claim_lines, u.outside_content_allowed_cents::text AS cents
         FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE r.id = $1`,
      [runId],
    );
    expect(stored.rows).toEqual([{ outside_content_rows: 2, claim_lines: '30', cents: '41200' }]);
    // The result's summary returns them, beside the floor's.
    await complete(runId, hex('7'));
    expect(await as(APP_ROLE, 'SELECT left_out_rows, outside_content_rows, outside_content_claim_lines::text AS lines, outside_content_observed_cents::text AS cents FROM screening_result_summary($1)', [hex('7')])).toEqual([
      { left_out_rows: 1, outside_content_rows: 2, lines: '30', cents: '41200' },
    ]);
    // Each row left out sums 11 to 100,000 claim lines (the floor runs first), at most $25,000.00 a claim line.
    await expect(submit({ outsideContent: [1, 10n, 0n] })).rejects.toMatchObject({ code: '23514', constraint: 'screening_upload_outside_content_claim_lines' });
    await expect(submit({ outsideContent: [1, 100_001n, 0n] })).rejects.toMatchObject({ constraint: 'screening_upload_outside_content_claim_lines' });
    await expect(submit({ outsideContent: [0, 11n, 0n] })).rejects.toMatchObject({ constraint: 'screening_upload_outside_content_claim_lines' });
    await expect(submit({ outsideContent: [0, 0n, 1n] })).rejects.toMatchObject({ constraint: 'screening_upload_outside_content_allowed' });
    await expect(submit({ outsideContent: [1, 11n, 27_500_001n] })).rejects.toMatchObject({ constraint: 'screening_upload_outside_content_allowed' });
    expect(await submit({ outsideContent: [1, 11n, 27_500_000n] })).toMatch(/^[0-9a-f-]{36}$/);
    await expect(submit({ outsideContent: [-1, 0n, 0n] })).rejects.toMatchObject({ code: '23514' });
    await expect(submit({ outsideContent: [null, 0n, 0n] })).rejects.toMatchObject({ code: '23502' });
    // No more rows in all than a file may hold, with the floor's.
    await expect(submit({ leftOut: [24_997, 24_997, 0n], outsideContent: [24_998, 274_978n, 0n] })).rejects.toMatchObject({ constraint: 'screening_upload_accepted_rows' });
    expect(await submit({ leftOut: [24_997, 24_997, 0n], outsideContent: [24_997, 274_967n, 0n] })).toMatch(/^[0-9a-f-]{36}$/);
    // A rejected upload leaves nothing out.
    const [prospect] = (await admin.query<{ id: string }>("INSERT INTO screening_prospect (practice_name, state, zip, contact_email) VALUES ('SYNTHETIC', 'MN', '00011', 'outside@synthetic.test') RETURNING id")).rows;
    await expect(
      admin.query(
        `INSERT INTO screening_upload (prospect_id, row_count, status, rejection_reasons, outside_content_rows, outside_content_claim_lines) VALUES ($1, 2, 'rejected', '[{"code":"band_outside_content","row":2,"field":"service_band"}]', 1, 11)`,
        [prospect?.id],
      ),
    ).rejects.toMatchObject({ constraint: 'screening_upload_outside_content_accepted' });
    // The reason itself is one a refused upload may keep: its code, row and field, never its quarter.
    expect(
      await as<{ id: string }>(APP_ROLE, 'SELECT reject_screening_upload($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, $7) AS id', [
        'Synthetic Outside Clinic',
        'MN',
        '00011',
        'outside.refused@synthetic.test',
        3,
        JSON.stringify([{ code: 'band_outside_content', row: 2, field: 'service_band' }]),
        `test-${randomUUID()}`,
      ]),
    ).toEqual([{ id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string }]);
  });

  it('stores the prospect, an accepted upload of hash and count, a queued run pinned to the release and split, and every row, with its audit event', async () => {
    const runId = await submit({ practice: '  Synthetic Therapy Group  ', email: ' Prospect.Pinned@Synthetic.Test ' });
    const { rows } = await admin.query(
      `SELECT p.practice_name, p.state, p.zip, p.contact_email, u.rows_sha256, u.row_count AS upload_rows,
              ARRAY[u.left_out_rows::text, u.left_out_claim_lines::text, u.left_out_allowed_cents::text] AS left_out, u.status AS upload_status, u.rejection_reasons,
              r.release_no, r.release_manifest_sha256, r.row_count, r.status, r.attempts, r.result_token_sha256,
              r.place_of_service_split_id = place_of_service_split_in_force() AS split_in_force, r.expires_at = r.created_at + interval '30 days' AS thirty_days
         FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE r.id = $1`,
      [runId],
    );
    expect(rows).toEqual([
      {
        practice_name: 'Synthetic Therapy Group',
        state: 'MN',
        zip: '00011',
        contact_email: 'prospect.pinned@synthetic.test',
        // The SHA-256 of the rows stored, in their canonical form, computed by the database.
        rows_sha256: sha256(canonicalRows(ROWS)),
        upload_rows: 6,
        left_out: ['0', '0', '0'],
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
    await expect(as(APP_ROLE, SUBMIT, values.map((value, index) => (index === 8 ? ['11'] : value)))).rejects.toMatchObject({ constraint: 'screening_rows' });
    await expect(submit({ rows: [] })).rejects.toMatchObject({ constraint: 'screening_rows' });
    const many = Array.from({ length: 50_001 }, (_, index) => ['97110', '', 1 + (index % 999), '11', 'medicare_ffs', `20${String(10 + Math.floor(index / 999) % 17)}-Q1`, 0n, 11] as const);
    await expect(submit({ rows: many })).rejects.toMatchObject({ constraint: 'screening_rows' });
    await expect(submit({ rows: [FIRST_ROW, FIRST_ROW] })).rejects.toMatchObject({ code: '23505', constraint: 'screening_result_once' });
    await expect(submit({ rows: [['97110', 'GP CQ', 1, '11', 'medicare_ffs', '2026-Q1', 1n, 11]] })).rejects.toMatchObject({ code: '23514', constraint: 'screening_result_modifiers' });
    await expect(submit({ rows: [['97110', 'GP GP', 1, '11', 'medicare_ffs', '2026-Q1', 1n, 11]] })).rejects.toMatchObject({ constraint: 'screening_result_modifiers' });
    await expect(submit({ rows: [['97110', '', 1, '11', 'medicare_ffs', '2026-01', 1n, 11]] })).rejects.toMatchObject({ constraint: 'screening_result_service_band' });
    await expect(submit({ rows: [['97110', '', 1, '11', 'tricare', '2026-Q1', 1n, 11]] })).rejects.toMatchObject({ constraint: 'screening_result_payer_product' });
    await expect(submit({ email: 'not an address' })).rejects.toMatchObject({ constraint: 'screening_prospect_contact_email' });
    // Only an address the mail service can send to: plain ASCII, a dot-atom before the @, a dotted domain after it.
    for (const email of ['pois,on@clinic.synthetic.test', 'prospect@localhost', 'prospect@clinic.synthetic.test.', 'prospéct@clinic.synthetic.test', '.p@clinic.synthetic.test', 'p..q@clinic.synthetic.test', `${'p'.repeat(65)}@clinic.synthetic.test`]) {
      await expect(submit({ email }), email).rejects.toMatchObject({ constraint: 'screening_prospect_contact_email' });
    }
    // A procedure code has a real code's shape: five letters (a name) are refused, and so are identifiers in the figures.
    for (const code of ['SMITH', 'MARIA', 'A1B2C', 'W1234']) {
      await expect(submit({ rows: [[code, '', 1, '11', 'commercial', '2026-Q1', 1n, 11]] }), code).rejects.toMatchObject({ constraint: 'screening_result_procedure_code' });
    }
    await expect(submit({ rows: [['97110', '', 1, '11', 'medicare_ffs', '2026-Q1', 12_345_678_900n, 24]] })).rejects.toMatchObject({ constraint: 'screening_result_observed' });
    await expect(submit({ rows: [['97110', '', 1, '11', 'medicare_ffs', '2026-Q1', 100n, 100_001]] })).rejects.toMatchObject({ constraint: 'screening_result_claim_count' });
    for (const code of ['97110', '0001F', '0042T', '0001U', '0002M', 'G0283', 'V2020']) {
      expect(await submit({ rows: [[code, '', 1, '11', 'commercial', '2026-Q1', 27_500_000n, 11]] }), code).toMatch(/^[0-9a-f-]{36}$/);
    }
    await expect(submit({ rows: [['97110', '', 1, '11', 'commercial', '2026-Q1', 27_500_001n, 11]] })).rejects.toMatchObject({ constraint: 'screening_result_observed' });
  });

  it('stores no row of fewer than 11 claim lines, which can be one patient’s service line: 10 refused, 11 taken (SCR-07)', async () => {
    for (const claims of [1, 10]) {
      await expect(submit({ rows: [['97110', 'GP', 1, '11', 'ma_noncontracted', '2026-Q1', 4_500n, claims]] }), String(claims)).rejects.toMatchObject({
        code: '23514',
        constraint: 'screening_result_claim_count',
      });
    }
    const taken = await submit({ rows: [['97110', 'GP', 1, '11', 'ma_noncontracted', '2026-Q1', 4_500n, 11]] });
    expect((await admin.query('SELECT s.claim_count FROM screening_result s WHERE s.run_id = $1', [taken])).rows).toEqual([{ claim_count: 11 }]);
    // Not even the owner can store one: the CHECK, not the function, holds the floor.
    await expect(
      admin.query(
        "INSERT INTO screening_result (run_id, row_no, procedure_code, modifiers, units, place_of_service, payer_product, service_band, claim_count, observed_allowed_cents, disposition) VALUES ($1, 2, '97140', '{}', 1, '11', 'commercial', '2026-Q1', 10, 0, 'contract_required')",
        [taken],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'screening_result_claim_count' });
  });

  it('keeps of the rows the browser left out three numbers alone, held to what it could have counted (SCR-07)', async () => {
    const runId = await submit({ leftOut: [3, 16, 111_233n] });
    const stored = await admin.query(
      'SELECT u.left_out_rows, u.left_out_claim_lines, u.left_out_allowed_cents::text AS cents FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE r.id = $1',
      [runId],
    );
    expect(stored.rows).toEqual([{ left_out_rows: 3, left_out_claim_lines: 16, cents: '111233' }]);
    expect(await submit({ leftOut: [1, 10, 25_000_000n] })).toMatch(/^[0-9a-f-]{36}$/);
    // Each row left out sums 1 to 10 claim lines, at most $25,000.00 a claim line.
    await expect(submit({ leftOut: [1, 11, 0n] })).rejects.toMatchObject({ code: '23514', constraint: 'screening_upload_left_out_claim_lines' });
    await expect(submit({ leftOut: [2, 1, 0n] })).rejects.toMatchObject({ constraint: 'screening_upload_left_out_claim_lines' });
    await expect(submit({ leftOut: [0, 1, 0n] })).rejects.toMatchObject({ constraint: 'screening_upload_left_out_claim_lines' });
    await expect(submit({ leftOut: [0, 0, 1n] })).rejects.toMatchObject({ constraint: 'screening_upload_left_out_allowed' });
    await expect(submit({ leftOut: [1, 1, 2_500_001n] })).rejects.toMatchObject({ constraint: 'screening_upload_left_out_allowed' });
    await expect(submit({ leftOut: [-1, -1, 0n] })).rejects.toMatchObject({ code: '23514' });
    // No more rows in all than a file may hold.
    await expect(submit({ leftOut: [49_995, 49_995, 0n] })).rejects.toMatchObject({ constraint: 'screening_upload_accepted_rows' });
    expect(await submit({ leftOut: [49_994, 49_994, 0n] })).toMatch(/^[0-9a-f-]{36}$/);
    await expect(submit({ leftOut: [null, 0, 0n] })).rejects.toMatchObject({ code: '23502' });
    // A rejected upload leaves nothing out: its rows were never screened.
    const [prospect] = (await admin.query<{ id: string }>("INSERT INTO screening_prospect (practice_name, state, zip, contact_email) VALUES ('SYNTHETIC', 'MN', '00011', 'left.out@synthetic.test') RETURNING id")).rows;
    await expect(
      admin.query(
        `INSERT INTO screening_upload (prospect_id, row_count, status, rejection_reasons, left_out_rows, left_out_claim_lines) VALUES ($1, 2, 'rejected', '[{"code":"no_rows"}]', 1, 1)`,
        [prospect?.id],
      ),
    ).rejects.toMatchObject({ constraint: 'screening_upload_left_out_accepted' });
  });

  it('records a rejected upload with its count and reasons alone, no hash, and its audit event', async () => {
    const [row] = await as<{ id: string }>(APP_ROLE, 'SELECT reject_screening_upload($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, $7) AS id', [
      'Synthetic Therapy Group',
      'MN',
      '00011',
      'Prospect.Rejected@Synthetic.Test',
      120,
      JSON.stringify([{ code: 'phi_column', column: 4, phi: 'member_id' }]),
      `test-${randomUUID()}`,
    ]);
    const upload = await admin.query('SELECT status, row_count, rejection_reasons, rows_sha256 FROM screening_upload WHERE id = $1', [row?.id]);
    expect(upload.rows).toEqual([{ status: 'rejected', row_count: 120, rejection_reasons: [{ code: 'phi_column', column: 4, phi: 'member_id' }], rows_sha256: null }]);
    expect((await admin.query('SELECT count(*)::int AS n FROM screening_run WHERE upload_id = $1', [row?.id])).rows).toEqual([{ n: 0 }]);
    expect((await admin.query('SELECT action, object_type FROM audit_event WHERE object_id = $1', [row?.id])).rows).toEqual([{ action: 'screening_rejected', object_type: 'screening_upload' }]);
    await expect(
      as(APP_ROLE, 'SELECT reject_screening_upload($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, $7)', ['SYNTHETIC', 'MN', '00011', 'p@synthetic.test', 1, JSON.stringify([{ code: 'phi_column', header: 'Member ID' }]), 'x']),
    ).rejects.toMatchObject({ constraint: 'screening_upload_reasons' });
    await expect(as(APP_ROLE, 'SELECT reject_screening_upload($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, $7)', ['SYNTHETIC', 'MN', '00011', 'p@synthetic.test', 1, '[]', 'x'])).rejects.toMatchObject({
      constraint: 'screening_upload_rejected',
    });
  });

  it('hashes the rows it stores, never anything a caller sends: an accepted upload has that hash, a refused one none, whoever writes the row', async () => {
    const rows: NonNullable<SubmitOptions['rows']> = [
      ['97530', 'GP', 2, '11', 'ma_noncontracted', '2026-Q2', 60_000n, 12],
      ['97110', 'CQ GP', 1, '22', 'medicare_ffs', '2026-Q1', 0n, 11],
    ];
    const runId = await submit({ rows });
    const stored = await admin.query<{ rows_sha256: string; again: string }>(
      `SELECT u.rows_sha256,
              encode(sha256(convert_to(string_agg(concat_ws(E'\\t', s.procedure_code, array_to_string(s.modifiers, ' '), s.units, s.place_of_service, s.payer_product, s.service_band,
                                                             s.observed_allowed_cents, s.claim_count), E'\\n' ORDER BY s.row_no), 'UTF8')), 'hex') AS again
         FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_result s ON s.run_id = r.id WHERE r.id = $1 GROUP BY u.rows_sha256`,
      [runId],
    );
    // The canonical rows sent, hashed: and the same hash worked out again from the rows the table holds.
    expect(stored.rows).toEqual([{ rows_sha256: sha256('97530\tGP\t2\t11\tma_noncontracted\t2026-Q2\t60000\t12\n97110\tCQ GP\t1\t22\tmedicare_ffs\t2026-Q1\t0\t11'), again: sha256(canonicalRows(rows)) }]);
    expect(stored.rows[0]?.rows_sha256).toBe(stored.rows[0]?.again);
    // The function takes no hash: one argument more is no submit_screening at all.
    await expect(as(APP_ROLE, `SELECT submit_screening(${placeholders(SUBMIT_ARGUMENTS + 1)})`, [...submitValues().slice(0, 5), hex('d'), ...submitValues().slice(5)])).rejects.toMatchObject({
      code: '42883',
    });
    // The owner either: an accepted upload has the hash of its rows, a refused one none.
    const [prospect] = (await admin.query<{ id: string }>("INSERT INTO screening_prospect (practice_name, state, zip, contact_email) VALUES ('SYNTHETIC', 'MN', '00011', 'hash.rule@synthetic.test') RETURNING id")).rows;
    await expect(admin.query(`INSERT INTO screening_upload (prospect_id, row_count, status) VALUES ($1, 1, 'accepted')`, [prospect?.id])).rejects.toMatchObject({
      code: '23514',
      constraint: 'screening_upload_rows_hashed',
    });
    await expect(
      admin.query(`INSERT INTO screening_upload (prospect_id, rows_sha256, row_count, status, rejection_reasons) VALUES ($1, $2, 1, 'rejected', '[{"code":"no_rows"}]')`, [prospect?.id, hex('e')]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'screening_upload_rows_hashed' });
  });

  it('never prices an MA contracted or commercial row, and holds a priced row to the line amount times the count in bigint', async () => {
    const runId = await submit();
    // A contract-required row is not pending, so the operator's record leaves it as it is.
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_claim($1)', [runId])).toHaveLength(1);
    const recorded = await as<{ n: number }>(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 1) AS n', [
      runId,
      [3, 4],
      ['priced', 'priced'],
      ['100', '100'],
      ['100', '100'],
      ['1200', '1300'],
      ['-1800', '-2700'],
      [true, true],
      ['80', '80'],
      ['80', '80'],
      ['960', '1040'],
      ['-2040', '-2960'],
      [hex('e'), hex('e')],
      [null, null],
      [null, null],
      [hex('f'), hex('f')],
    ]);
    expect(recorded).toEqual([{ n: 0 }]);
    // Even the owner cannot move one back to pending, or insert one priced as non-contracted.
    await expect(admin.query("UPDATE screening_result SET disposition = 'pending' WHERE run_id = $1 AND row_no = 4", [runId])).rejects.toMatchObject({ code: '23514' });
    await expect(submit({ rows: [['97140', '', 1, '22', 'commercial', '2026-Q1', 1n, 11]] }).then((id) =>
      admin.query("UPDATE screening_result SET disposition = 'rates_change_in_band', trace_sha256 = $2 WHERE run_id = $1", [id, hex('f')]),
    )).rejects.toMatchObject({ code: '23514' });
    // Row 1: 11 claim lines, $100.00 allowed in the file. A pooled row's fully reduced figure: $40.00 a line, $440.00, $340.00 above the allowed total.
    type Reduced = readonly [line: string | null, unrounded: string | null, total: string | null, difference: string | null, trace: string | null];
    const REDUCED: Reduced = ['4000', '4000.4', '44000', '34000', hex('e')];
    const NONE: Reduced = [null, null, null, null, null];
    const figures = (line: string, unrounded: string, expected: string, difference: string, pooled: boolean | null = true, reduced: Reduced = pooled === true ? REDUCED : NONE) =>
      as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 1) AS n', [
        runId,
        [1],
        ['priced'],
        [line],
        [unrounded],
        [expected],
        [difference],
        [pooled],
        ...reduced.map((value) => [value]),
        [null],
        [null],
        [hex('f')],
      ]);
    // A priced row says whether its code is in the reduction across a visit's codes.
    await expect(figures('5000', '5000.4', '55000', '45000', null)).rejects.toMatchObject({ code: '23514', constraint: 'screening_result_priced' });
    await expect(figures('5000', '5000.4', '54999', '44999')).rejects.toMatchObject({ code: '23514', constraint: 'screening_result_figures' });
    await expect(figures('5000', '5001', '55000', '45000')).rejects.toMatchObject({ constraint: 'screening_result_figures' });
    await expect(figures('5000', '5000.4', '55000', '45001')).rejects.toMatchObject({ constraint: 'screening_result_figures' });
    await expect(figures('-1', '-1', '-11', '-10011')).rejects.toMatchObject({ constraint: 'screening_result_figures' });
    // A pooled row has its fully reduced figure, and only a pooled row has one (the owner's ruling of 2026-10-18).
    await expect(figures('5000', '5000.4', '55000', '45000', true, NONE)).rejects.toMatchObject({ code: '23514', constraint: 'screening_result_reduced' });
    await expect(figures('5000', '5000.4', '55000', '45000', true, ['4000', '4000.4', '44000', '34000', null])).rejects.toMatchObject({ constraint: 'screening_result_reduced' });
    await expect(figures('5000', '5000.4', '55000', '45000', false, REDUCED)).rejects.toMatchObject({ constraint: 'screening_result_reduced' });
    // It is the line amount times the count, its difference from the allowed total, and never above the figure before the reduction.
    await expect(figures('5000', '5000.4', '55000', '45000', true, ['4000', '4000.4', '43999', '33999', hex('e')])).rejects.toMatchObject({ constraint: 'screening_result_reduced_figures' });
    await expect(figures('5000', '5000.4', '55000', '45000', true, ['4000', '4000.4', '44000', '34001', hex('e')])).rejects.toMatchObject({ constraint: 'screening_result_reduced_figures' });
    await expect(figures('5000', '5000.4', '55000', '45000', true, ['4000', '4001', '44000', '34000', hex('e')])).rejects.toMatchObject({ constraint: 'screening_result_reduced_figures' });
    await expect(figures('5000', '5000.4', '55000', '45000', true, ['5001', '5001', '55011', '45011', hex('e')])).rejects.toMatchObject({ constraint: 'screening_result_reduced_figures' });
    await expect(figures('5000', '5000.4', '55000', '45000', true, ['4000', '4000.4', '44000', '34000', 'not-a-hash'])).rejects.toMatchObject({ constraint: 'screening_result_reduced_trace_sha256' });
    expect(await figures('5000', '5000.4', '55000', '45000')).toEqual([{ n: 1 }]);
    // A row is priced once.
    expect(await figures('5000', '5000.4', '55000', '45000')).toEqual([{ n: 0 }]);
    // The largest figure a row can hold stays exact: 999 units at about $500 a unit, times 100,000 claim lines.
    const big = await submit({ rows: [['97110', '', 999, '11', 'medicare_ffs', '2026-Q1', 99_999_999_999n, 100_000]] });
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_claim($1)', [big])).toHaveLength(1);
    const line = 49_950_000n;
    const expected = line * 100_000n;
    expect(
      await as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 1) AS n', [
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
        [null],
        [null],
        [null],
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
      as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 1) AS n', [runId, [2], [disposition], [null], [null], [null], [null], [null], [null], [null], [null], [null], [null], [reason], [detail], [trace]]);
    await expect(record('unpriced', null, null, hex('f'))).rejects.toMatchObject({ constraint: 'screening_result_unpriced' });
    await expect(record('unpriced', 'NO_AGREEMENT', 'no_gpci', hex('f'))).rejects.toMatchObject({ constraint: 'screening_result_unpriced' });
    await expect(record('unpriced', 'GUESSED', null, hex('f'))).rejects.toMatchObject({ constraint: 'screening_result_unpriced_reason' });
    await expect(record('unpriced', 'ENGINE_ERROR', 'locality_needs_zip_plus_four', null)).rejects.toMatchObject({ constraint: 'screening_result_trace' });
    await expect(record('rates_change_in_band', 'NO_PFS_VALUE', null, hex('f'))).rejects.toMatchObject({ constraint: 'screening_result_unpriced' });
    expect(await record('unpriced', 'ENGINE_ERROR', 'locality_needs_zip_plus_four', hex('f'))).toEqual([{ n: 1 }]);
  });

  it('moves a run queued, pricing, then complete or failed, sets its token hash and its conversion once, and refuses the rest', async () => {
    const runId = await submit({ practice: 'Synthetic Therapy Group' });
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
    // The release as the engine reads it (audit #53): the shared types once (no keyed type among them), and the run's
    // keyed records by the keys its own rows can ask for: its Medicare rows' one code and its ZIP, never another code,
    // pair or ZIP.
    expect(await as(OPERATOR_ROLE, 'SELECT record_type, key FROM operator_screening_release($1)', [runId])).toEqual([
      { record_type: 'conversion_factor', key: { applicability: 'non_qualifying_apm' } },
    ]);
    expect(await as(OPERATOR_ROLE, 'SELECT codes, zip FROM operator_screening_run_keys($1)', [runId])).toEqual([{ codes: ['97110'], zip: '00011' }]);
    const release = await as<{ record_type: string; key: object; sha256: string }>(OPERATOR_ROLE, 'SELECT record_type, key, sha256 FROM operator_screening_run_records($1)', [runId]);
    const byKey = (rows: readonly { record_type: string; key: object }[]) => rows.map((row) => `${row.record_type} ${JSON.stringify(row.key)}`).sort();
    expect(byKey(release)).toEqual(
      [
        'locality_map {"zip":"00011"}',
        'mppr_rate {"hcpcs":"97110","modifier":""}',
        'mppr_rate {"component":"practice_expense"}',
        'ncci_mue {"hcpcs":"97110"}',
        'ncci_ptp {"column1":"97110","column2":"97110"}',
        'pfs_rvu {"hcpcs":"97110","modifier":""}',
      ].sort(),
    );
    expect(release.find((row) => row.record_type === 'locality_map')?.sha256).toBe(hex('b'));
    // It completes only once nothing is pending.
    await expect(as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, 1)', [runId, hex('2'), 'phase-two/1', 'x'])).rejects.toMatchObject({ code: '23514' });
    // The trigger refuses moving started_at without a claim, and progress backwards, so a stale run (no progress for 2
    // minutes: migration 20261106090000) is aged as the superuser, triggers off.
    await expect(admin.query("UPDATE screening_run SET started_at = started_at - interval '3 minutes' WHERE id = $1", [runId])).rejects.toMatchObject({ code: '23514' });
    await expect(admin.query("UPDATE screening_run SET progress_at = progress_at - interval '3 minutes' WHERE id = $1", [runId])).rejects.toMatchObject({ code: '23514' });
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      await client.query("UPDATE screening_run SET started_at = started_at - interval '3 minutes', progress_at = progress_at - interval '3 minutes' WHERE id = $1", [runId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect((await as<{ status: string }>(OPERATOR_ROLE, 'SELECT status FROM operator_screening_due(0, 100) WHERE run_id = $1', [runId]))).toEqual([{ status: 'pricing' }]);
    expect(await as<{ attempt: number }>(OPERATOR_ROLE, 'SELECT attempt FROM operator_screening_claim($1)', [runId])).toEqual([{ attempt: 2 }]);
    // The attempt fences what follows: attempt 1, overtaken by the stale claim, reads no row, records none, completes
    // nothing and fails nothing, so it cannot leave attempt 2 short of a row it read as pending.
    expect(await as(OPERATOR_ROLE, 'SELECT row_no FROM operator_screening_rows($1, 0, 5000, 1)', [runId])).toEqual([]);
    await expect(
      as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 1)', [
        runId,
        [2],
        ['rates_change_in_band'],
        [null],
        [null],
        [null],
        [null],
        [null],
        [null],
        [null],
        [null],
        [null],
        [null],
        [null],
        [null],
        [hex('f')],
      ]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'screening_run_attempt' });
    await expect(as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, 1)', [runId, hex('2'), 'phase-two/1', 'x'])).rejects.toMatchObject({
      code: '23514',
      constraint: 'screening_run_attempt',
    });
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_fail($1, $2, $3, 1)', [runId, 'RELEASE_READ_OUTSIDE_FETCH', 'x'])).toEqual([]);
    const pending = await as<{ row_no: number }>(OPERATOR_ROLE, 'SELECT row_no FROM operator_screening_rows($1, 0, 5000, 2)', [runId]);
    expect(pending.map((row) => row.row_no)).toEqual([1, 2]);
    await as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 2)', [
      runId,
      [1, 2],
      ['priced', 'rates_change_in_band'],
      ['5000', null],
      ['5000', null],
      ['55000', null],
      ['45000', null],
      [false, null],
      [null, null],
      [null, null],
      [null, null],
      [null, null],
      [null, null],
      [null, null],
      [null, null],
      [hex('f'), hex('f')],
    ]);
    // A token is stored only as its hash: a link token itself does not fit the column.
    await expect(as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, 2)', [runId, 'abcdefghijklmnopqrstuvwxyzabcdef', 'phase-two/1', 'x'])).rejects.toMatchObject({
      constraint: 'screening_run_result_token',
    });
    const done = await as<{ contact_email: string; row_count: number }>(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, 2)', [runId, hex('2'), 'phase-two/1', 'x']);
    // With when the web received the upload and why it waited (it did not), for the time to email (migration 20261106090000).
    expect(done).toEqual([{ contact_email: expect.stringMatching(/@synthetic\.test$/) as string, row_count: 6, kept_with: 'none', received_at: expect.any(Date) as Date, wait_reason: null }]);
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, 2)', [runId, hex('3'), 'phase-two/1', 'x'])).toEqual([]);
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_fail($1, $2, $3, NULL)', [runId, 'PRICING_FAILED', 'x'])).toEqual([]);
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
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_fail($1, $2, $3, NULL)', [queued, 'RELEASE_UNAVAILABLE', 'x'])).toHaveLength(1);
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
        "INSERT INTO screening_result (run_id, row_no, procedure_code, modifiers, units, place_of_service, payer_product, service_band, claim_count, observed_allowed_cents, disposition) VALUES ($1, 99, '97110', '{}', 1, '11', 'medicare_ffs', '2026-Q4', 11, 0, 'pending')",
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
    await expect(approveSplit({ '11': 'nonfacility' })).rejects.toMatchObject({ constraint: 'place_of_service_split_settings' });
    await expect(approveSplit({})).rejects.toMatchObject({ constraint: 'place_of_service_split_settings' });
    await expect(approveSplit({ '1': 'facility' })).rejects.toMatchObject({ constraint: 'place_of_service_split_settings' });
    await expect(approveSplit({ '00': 'facility' })).rejects.toMatchObject({ constraint: 'place_of_service_split_settings' });
    await expect(as(APP_ROLE, 'SELECT console_approve_place_of_service_split($1)', [JSON.stringify(SPLIT)], analyst)).rejects.toMatchObject({ code: '42501' });
    await expect(as(APP_ROLE, 'SELECT console_approve_place_of_service_split($1)', [JSON.stringify(SPLIT)])).rejects.toMatchObject({ code: '42501' });
    await expect(as(APP_ROLE, 'SELECT * FROM console_place_of_service_splits()', [], analyst)).rejects.toMatchObject({ code: '42501' });
    const later = await approveSplit({ '11': 'non_facility', '12': 'non_facility', '22': 'facility' });
    const splits = await as<{ id: string; approved_by: string; in_force: boolean }>(APP_ROLE, 'SELECT id, approved_by, in_force FROM console_place_of_service_splits()', [], specialist);
    expect(splits[0]).toEqual({ id: later, approved_by: specialist, in_force: true });
    expect(splits.slice(1).every((split) => !split.in_force)).toBe(true);
    const [status] = await as<{ place_of_service_split_id: string }>(APP_ROLE, 'SELECT place_of_service_split_id FROM screening_status()');
    expect(status?.place_of_service_split_id).toBe(later);
    await expect(admin.query('UPDATE place_of_service_split SET settings = $2 WHERE id = $1', [later, JSON.stringify(SPLIT)])).rejects.toMatchObject({ code: 'P0001' });
    await expect(admin.query('DELETE FROM place_of_service_split WHERE id = $1', [later])).rejects.toMatchObject({ code: 'P0001' });
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

  /** Where a run's screening stands: its run, upload and prospect, and whether each is still held. */
  async function held(runId: string): Promise<{ readonly prospectId: string; readonly uploadId: string }> {
    const [row] = (
      await admin.query<{ prospect_id: string; upload_id: string }>('SELECT u.prospect_id, u.id AS upload_id FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE r.id = $1', [
        runId,
      ])
    ).rows;
    return { prospectId: row?.prospect_id ?? '', uploadId: row?.upload_id ?? '' };
  }

  async function gone(runId: string, ids: { readonly prospectId: string; readonly uploadId: string }): Promise<boolean> {
    const counts = await admin.query<{ n: number }>(
      `SELECT ((SELECT count(*) FROM screening_prospect WHERE id = $1) + (SELECT count(*) FROM screening_upload WHERE id = $2)
              + (SELECT count(*) FROM screening_run WHERE id = $3) + (SELECT count(*) FROM screening_result WHERE run_id = $3))::int AS n`,
      [ids.prospectId, ids.uploadId, runId],
    );
    return counts.rows[0]?.n === 0;
  }

  it('keeps one accepted screening a practice: a row of 12 claim lines and the same row at 11 are never held together to be subtracted into one claim line (SCR-07)', async () => {
    const name = `Synthetic Diff Therapy ${letters()}`;
    const row = (allowed: bigint, claims: number) => [['97530', 'GP', 2, '11', 'ma_noncontracted', '2026-Q2', allowed, claims]] as const;
    const first = await submit({ practice: name, email: `first.${letters()}@synthetic.test`, rows: row(60_000n, 12) });
    const firstIds = await held(first);
    // The same practice again (its name in another case and spacing, the same ZIP), from another address: the first goes.
    const request = `test-${randomUUID()}`;
    const values = submitValues({ practice: `  ${name.toUpperCase().replace(' ', '   ')} `, email: `second.${letters()}@synthetic.test`, rows: row(54_517n, 11) });
    // The request, the argument before the client's keyed subject (migration 20261107090000).
    const [second] = await as<{ run_id: string }>(APP_ROLE, SUBMIT, [...values.slice(0, -2), request, values.at(-1)]);
    expect(await gone(first, firstIds)).toBe(true);
    expect((await admin.query('SELECT claim_count, observed_allowed_cents::text AS cents FROM screening_result WHERE run_id = $1', [second?.run_id])).rows).toEqual([{ claim_count: 11, cents: '54517' }]);
    // No two rows of one key are held for the practice, so no difference of 1 claim line and $54.83 can be read.
    const pairs = await admin.query(
      `SELECT a.claim_count - b.claim_count AS derived_claim_lines
         FROM screening_result a JOIN screening_run ra ON ra.id = a.run_id JOIN screening_upload ua ON ua.id = ra.upload_id JOIN screening_prospect pa ON pa.id = ua.prospect_id
         JOIN screening_result b ON (b.procedure_code, b.modifiers, b.units, b.place_of_service, b.payer_product, b.service_band) = (a.procedure_code, a.modifiers, a.units, a.place_of_service, a.payer_product, a.service_band)
              AND b.run_id <> a.run_id
         JOIN screening_run rb ON rb.id = b.run_id JOIN screening_upload ub ON ub.id = rb.upload_id JOIN screening_prospect pb ON pb.id = ub.prospect_id
        WHERE screening_practice_key(pa.practice_name) = screening_practice_key($1) AND screening_practice_key(pb.practice_name) = screening_practice_key($1)`,
      [name],
    );
    expect(pairs.rows).toEqual([]);
    // The replacement is an audit event of the prospect it deleted, under the request that replaced it.
    expect((await admin.query('SELECT action, object_type, request_id FROM audit_event WHERE object_id = $1', [firstIds.prospectId])).rows).toEqual([
      { action: 'screening_replaced', object_type: 'screening_prospect', request_id: request },
    ]);
  });

  it('replaces a screening from the same contact address, and one whose rows were left out, but never another practice’s, and a refused upload replaces nothing (SCR-07)', async () => {
    const email = `same.${letters()}@synthetic.test`;
    // A row of 10 claim lines left out the first time (its count and dollars are the upload's sums) that reaches 11.
    const first = await submit({ practice: `Synthetic Left Out ${letters()}`, email, rows: [FIRST_ROW], leftOut: [1, 10, 45_170n] });
    const firstIds = await held(first);
    const neighbour = await submit({ practice: `Synthetic Neighbour ${letters()}`, email: `neighbour.${letters()}@synthetic.test` });
    // A refused upload of the same address holds no row: it replaces nothing.
    await as(APP_ROLE, 'SELECT reject_screening_upload($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, $7)', ['Synthetic Refused Clinic', 'MN', '00011', email, 3, JSON.stringify([{ code: 'no_rows' }]), 'x']);
    expect(await gone(first, firstIds)).toBe(false);
    const second = await submit({ practice: `Synthetic Renamed ${letters()}`, email: ` ${email.toUpperCase()} `, rows: [['97110', 'GP', 2, '11', 'ma_noncontracted', '2026-Q2', 49_687n, 11]] });
    expect(await gone(first, firstIds)).toBe(true);
    // The other practice, at the same ZIP from another address, keeps its screening; the refused upload stays to expire.
    expect((await held(neighbour)).uploadId).not.toBe('');
    expect((await admin.query("SELECT count(*)::int AS n FROM screening_prospect WHERE contact_email = $1 AND practice_name = 'Synthetic Refused Clinic'", [email])).rows).toEqual([{ n: 1 }]);
    expect((await held(second)).uploadId).not.toBe('');
  });

  it('keeps a screening until it expires or is replaced, and lets two submissions of one practice at once leave one', async () => {
    const runId = await submit();
    const ids = await held(runId);
    // Nothing replaces it: the owner cannot delete it before it expires, prospect, upload or run.
    for (const [table, id] of [
      ['screening_prospect', ids.prospectId],
      ['screening_upload', ids.uploadId],
      ['screening_run', runId],
    ] as const) {
      await expect(admin.query(`DELETE FROM ${table} WHERE id = $1`, [id]), table).rejects.toMatchObject({ code: '23514', constraint: 'screening_kept_until_expiry' });
    }
    // Two submissions of one practice at once: the second waits for the first, then replaces it.
    const name = `Synthetic Race Clinic ${letters()}`;
    const first = await admin.connect();
    const second = await admin.connect();
    try {
      await first.query('BEGIN');
      await first.query(`SET LOCAL ROLE ${APP_ROLE}`);
      await second.query('BEGIN');
      await second.query(`SET LOCAL ROLE ${APP_ROLE}`);
      const one = (await first.query<{ run_id: string }>(SUBMIT, submitValues({ practice: name }))).rows[0]?.run_id ?? '';
      const waiting = second.query<{ run_id: string }>(SUBMIT, submitValues({ practice: name }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await first.query('COMMIT');
      const two = (await waiting).rows[0]?.run_id ?? '';
      await second.query('COMMIT');
      const runs = await admin.query<{ id: string }>(
        'SELECT r.id FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.practice_name = $1',
        [name],
      );
      expect(runs.rows).toEqual([{ id: two }]);
      expect(one).not.toBe(two);
    } finally {
      first.release();
      second.release();
    }
  });
});

/** The screening stream as migration 20261107090000 seeds it, sending, its window open, and no screening mail kept. */
async function resetScreeningMail(): Promise<void> {
  await admin.query('DELETE FROM screening_bounce_mark');
  await admin.query("DELETE FROM mail_send WHERE stream = 'screening'");
  await admin.query('DELETE FROM screening_mail_refusal');
  await admin.query(
    `UPDATE mail_stream SET paused_at = NULL, paused_reason = NULL, paused_by = NULL, pause_sends = NULL, pause_bounces = NULL, pause_complaints = NULL,
            window_starts_at = now() - interval '30 days', resumed_at = NULL, ses_enabled_confirmed_at = now() WHERE stream = 'screening'`,
  );
}

/** Pauses the screening stream as the cut-off does (account_review), clearing SES's confirmation. */
async function pauseScreeningMail(): Promise<void> {
  await admin.query(
    "UPDATE mail_stream SET paused_at = now(), paused_reason = 'account_review', pause_sends = 0, pause_bounces = 0, pause_complaints = 0, ses_enabled_confirmed_at = NULL WHERE stream = 'screening'",
  );
}

/** One SES event of a screening run's message, recorded as the platform's mail_events job records it (as tp_operator). */
async function mailEvent(
  subject: string,
  event: string,
  recipient: string,
  extra: { readonly stream?: string; readonly kind?: string; readonly bounceKind?: string; readonly bounceSubtype?: string; readonly complaintType?: string } = {},
): Promise<{ recorded: boolean; state: string; stream_paused: string | null; message: string }> {
  const message = `0100019a${randomUUID().replace(/-/g, '')}-000000`;
  const [row] = await as<{ recorded: boolean; state: string; stream_paused: string | null }>(
    OPERATOR_ROLE,
    'SELECT recorded, state, stream_paused FROM operator_record_mail_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
    [
      message,
      extra.stream ?? 'screening',
      event,
      new Date(),
      new Date(),
      recipient,
      extra.kind ?? 'screening_result',
      subject,
      null,
      null,
      extra.bounceKind ?? 'permanent',
      extra.bounceSubtype ?? 'general',
      extra.complaintType ?? 'abuse',
      `test-${randomUUID()}`,
    ],
  );
  return { recorded: row?.recorded ?? false, state: row?.state ?? '', stream_paused: row?.stream_paused ?? null, message };
}

/** Three live bounce marks of a subject, as three permanent bounces of its screenings leave them. */
async function markSubject(subject: string, kind: 'account' | 'client'): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    const message = `mark${randomUUID().replace(/-/g, '')}`;
    await admin.query(
      "INSERT INTO mail_send (ses_message_id, stream, kind, subject_id, state, bounce_kind, bounce_subtype, sent_at) VALUES ($1, 'screening', 'screening_result', gen_random_uuid(), 'bounced', 'permanent', 'general', now())",
      [message],
    );
    await admin.query("INSERT INTO screening_bounce_mark (subject, subject_kind, ses_message_id, bounced_at, expires_at) VALUES ($1, $2, $3, now(), now() + interval '7 days')", [subject, kind, message]);
  }
}

describe('PR 6b-4: the screening’s mail (migration 20261107090000; audit #76, SCR-21; the founder’s Q9, Q10 (a) and Q11 (b))', () => {
  beforeEach(resetScreeningMail);
  afterAll(resetScreeningMail);

  it('D7: submit_screening() is migration 20261106090000’s but for the client’s keyed subject, and is the body the database holds', async () => {
    const statement = (file: string): string => {
      const text = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const start = text.indexOf('CREATE FUNCTION submit_screening(');
      expect(start, file).toBeGreaterThan(0);
      expect(text.indexOf('CREATE FUNCTION submit_screening(', start + 1), file).toBe(-1);
      return text.slice(start, text.indexOf('\n$$;', start) + 4);
    };
    const before = statement('20261106090000_screening_consumer.sql');
    const after = statement('20261107090000_mail_streams.sql');
    const changes: readonly (readonly [string, string])[] = [
      ['  rate_account_subject text, request text) RETURNS uuid', '  rate_account_subject text, request text, client_subject text DEFAULT NULL) RETURNS uuid'],
      ['                               wait_reason, queue_priority)\n', '                               wait_reason, queue_priority, client_subject)\n'],
      ['           tier.wait_reason, tier.queue_priority\n', '           tier.wait_reason, tier.queue_priority, client_subject\n'],
    ];
    for (const [old] of changes) {
      expect(before.split(old).length, old).toBe(2);
    }
    expect(after).toBe(changes.reduce((text, [old, next]) => text.replace(old, next), before));
    const live = (await admin.query<{ body: string; name: string }>("SELECT prosrc AS body, oid::regprocedure::text AS name FROM pg_proc WHERE proname = 'submit_screening'")).rows;
    expect(live).toHaveLength(1);
    expect(after.slice(after.indexOf('AS $$') + 'AS $$'.length, after.lastIndexOf('$$'))).toBe(live[0]?.body);
    // One parameter more, last, with its default: the previous web's thirty arguments still reach it in the deploy window.
    expect(live[0]?.name).toBe(
      'submit_screening(text,text,text,text,text,text[],text[],integer[],text[],text[],text[],bigint[],integer[],integer,integer,bigint,integer,bigint,bigint,text,text,text,text,text,text,text,text,timestamp with time zone,text,text,text)',
    );
    const previous = await as<{ run_id: string }>(APP_ROLE, `SELECT submit_screening(${placeholders(SUBMIT_ARGUMENTS - 1)}) AS run_id`, submitValues().slice(0, -1));
    expect((await admin.query('SELECT client_subject FROM screening_run WHERE id = $1', [previous[0]?.run_id])).rows).toEqual([{ client_subject: null }]);
  });

  it('D2: refuses in its order: closed; the ZIP statuses, the rows and screening_band_outside_content; screening_paused; screening_bounce_budget; screening_contact_undeliverable (S1)', async () => {
    const refused = `refused.${letters()}@synthetic.test`;
    const budgeted = sha256(`budgeted account ${randomUUID()}`);
    await admin.query("INSERT INTO screening_mail_refusal (recipient_sha256, reason, expires_at) VALUES (mail_recipient_sha256($1), 'bounced', now() + interval '1 day')", [refused]);
    await markSubject(budgeted, 'account');
    await pauseScreeningMail();
    const every = { email: ` ${refused.toUpperCase()} `, rateSubject: budgeted };
    const refusal = (options: SubmitOptions) => submit(options).then(() => 'accepted', (error: unknown) => (error as { constraint?: string }).constraint);
    expect(await refusal({ ...every, zip: '00099' })).toBe('screening_zip_unknown');
    expect(await refusal({ ...every, zip: '00012' })).toBe('screening_locality_not_loaded');
    expect(await refusal({ ...every, rows: [] })).toBe('screening_rows');
    expect(await refusal({ ...every, rows: [['97110', 'GP', 1, '11', 'medicare_ffs', '2025-Q4', 4_000n, 11]] })).toBe('screening_band_outside_content');
    expect(await refusal(every)).toBe('screening_paused');
    await resetScreeningMail();
    await admin.query("INSERT INTO screening_mail_refusal (recipient_sha256, reason, expires_at) VALUES (mail_recipient_sha256($1), 'bounced', now() + interval '1 day')", [refused]);
    await markSubject(budgeted, 'account');
    // The submitter past its budget is refused before the address is read (S1): the same answer for an address on the
    // refusal list and one off it, so no client or account past its budget can test an address against the list.
    expect(await refusal(every)).toBe('screening_bounce_budget');
    expect(await refusal({ ...every, email: `other.${letters()}@synthetic.test` })).toBe('screening_bounce_budget');
    expect(await refusal({ ...every, rateSubject: accountSubject() })).toBe('screening_contact_undeliverable');
    expect(await refusal({ ...every, email: `other.${letters()}@synthetic.test`, rateSubject: accountSubject() })).toBe('accepted');
    // The client's subject the same way, and a run with none is held to its account's alone.
    const client = sha256(`budgeted client ${randomUUID()}`);
    await markSubject(client, 'client');
    expect(await refusal({ email: `client.${letters()}@synthetic.test`, clientSubject: client })).toBe('screening_bounce_budget');
    expect(await refusal({ email: every.email, clientSubject: client })).toBe('screening_bounce_budget');
    expect(await refusal({ email: every.email, clientSubject: sha256(randomUUID()) })).toBe('screening_contact_undeliverable');
    // Nothing of either refusal is kept: no prospect, upload, run or audit event.
    const kept = async () =>
      (await admin.query<{ n: number }>("SELECT (SELECT count(*) FROM screening_prospect) + (SELECT count(*) FROM screening_upload) + (SELECT count(*) FROM screening_run) + (SELECT count(*) FROM audit_event WHERE action = 'screening_submitted') AS n")).rows[0]?.n;
    const before = await kept();
    await refusal({ email: every.email, clientSubject: client });
    await refusal({ email: `client.${letters()}@synthetic.test`, clientSubject: client });
    expect(await kept()).toBe(before);
    expect(await refusal({ email: `client.${letters()}@synthetic.test`, clientSubject: sha256(randomUUID()) })).toBe('accepted');
    expect(await refusal({ email: `client.${letters()}@synthetic.test`, clientSubject: null })).toBe('accepted');
    expect(await refusal({ email: `client.${letters()}@synthetic.test`, clientSubject: 'not-a-subject' })).toBe('screening_run_client_subject');
    // No refusal names the address.
    const failure = await submit(every).then(
      () => null,
      (error: unknown) => error as { message: string; detail?: string },
    );
    expect(`${failure?.message ?? ''} ${failure?.detail ?? ''}`).not.toContain('@');
  });

  it('records a refused upload, which is never emailed, whatever the stream’s state or the refusal list says', async () => {
    const refused = `refused.upload.${letters()}@synthetic.test`;
    await admin.query("INSERT INTO screening_mail_refusal (recipient_sha256, reason, expires_at) VALUES (mail_recipient_sha256($1), 'complained', now() + interval '1 day')", [refused]);
    await pauseScreeningMail();
    const [row] = await as<{ id: string }>(APP_ROLE, 'SELECT reject_screening_upload($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) AS id', [
      `Synthetic Refused ${letters()}`,
      'MN',
      '00011',
      refused,
      3,
      JSON.stringify([{ code: 'no_rows' }]),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      `test-${randomUUID()}`,
    ]);
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    await resetScreeningMail();
  });

  it('puts a screening address on the refusal list for a permanent bounce or a complaint, case and spacing aside, never for another outcome or a customer stream’s, for 365 days', async () => {
    const outcome = async (event: string, extra: Parameters<typeof mailEvent>[3] = {}): Promise<string> => {
      const given = `outcome.${letters()}@synthetic.test`;
      const run = await submit({ email: given });
      await mailEvent(extra.stream === undefined ? run : randomUUID(), event, ` ${given.toUpperCase()} `, extra);
      return submit({ email: given, practice: `Synthetic Again ${letters()}` }).then(() => 'accepted', (error: unknown) => (error as { constraint?: string }).constraint ?? 'error');
    };
    expect(await outcome('bounce')).toBe('screening_contact_undeliverable');
    expect(await outcome('bounce', { bounceSubtype: 'no_email' })).toBe('screening_contact_undeliverable');
    expect(await outcome('complaint', { complaintType: 'abuse' })).toBe('screening_contact_undeliverable');
    expect(await outcome('complaint', { complaintType: 'not_spam' })).toBe('accepted');
    expect(await outcome('bounce', { bounceKind: 'transient', bounceSubtype: 'mailbox_full' })).toBe('accepted');
    expect(await outcome('bounce', { bounceKind: 'undetermined', bounceSubtype: 'other' })).toBe('accepted');
    // SES's global suppression list: a hard bounce SES counts toward the account's rate, so a refusal too (M2); the
    // account's own list and a set's override are SES's own suppression, sent to no one and counted toward nothing.
    expect(await outcome('bounce', { bounceSubtype: 'suppressed' })).toBe('screening_contact_undeliverable');
    expect(await outcome('bounce', { bounceSubtype: 'on_account_suppression_list' })).toBe('accepted');
    expect(await outcome('bounce', { bounceSubtype: 'on_configuration_set_suppression_list' })).toBe('accepted');
    expect(await outcome('delivery')).toBe('accepted');
    // A customer stream's bounce or complaint to the same address refuses nothing: the form reveals nothing of a customer's mail.
    expect(await outcome('bounce', { stream: 'transactional', kind: 'digest' })).toBe('accepted');
    expect(await outcome('complaint', { stream: 'notices', kind: 'dunning' })).toBe('accepted');
    // Kept 365 days from its latest outcome, then it refuses no more.
    const kept = await admin.query<{ days: number; reasons: string[] }>(
      "SELECT min(extract(day FROM expires_at - recorded_at))::int AS days, array_agg(DISTINCT reason ORDER BY reason) AS reasons FROM screening_mail_refusal",
    );
    expect(kept.rows).toEqual([{ days: 365, reasons: ['bounced', 'complained'] }]);
    const given = `aged.${letters()}@synthetic.test`;
    await mailEvent(await submit({ email: given }), 'bounce', given);
    await admin.query("UPDATE screening_mail_refusal SET recorded_at = now() - interval '366 days', expires_at = now() - interval '1 day' WHERE recipient_sha256 = mail_recipient_sha256($1)", [given]);
    expect(await submit({ email: given, practice: `Synthetic Aged ${letters()}` })).toMatch(/^[0-9a-f-]{36}$/);
    await resetScreeningMail();
  });

  it('refuses every spelling of a mailbox once one of them bounced permanently or was reported, and no other mailbox (S2)', async () => {
    const refusal = (email: string) => submit({ email, practice: `Synthetic Spelling ${letters()}` }).then(() => 'accepted', (error: unknown) => (error as { constraint?: string }).constraint);
    for (const [event, extra] of [
      ['complaint', { complaintType: 'abuse' }],
      ['bounce', { bounceSubtype: 'no_email' }],
    ] as const) {
      const name = letters();
      // The screening went to one spelling; its outcome refuses the mailbox's others (a trailing dot the prospect's own CHECK
      // refuses first; mail_recipient_canonical() reads it too: mail.db.test.ts).
      const sent = `synthetic.${name}+screening@gmail.com`;
      await mailEvent(await submit({ email: sent }), event, sent, extra);
      for (const spelling of [`synthetic.${name}@gmail.com`, `Synthetic${name}@GoogleMail.com`, ` s.y.n.t.h.e.t.i.c.${name}+other@gmail.com `, `SYNTHETIC.${name.toUpperCase()}@GMAIL.COM`]) {
        expect(await refusal(spelling), `${event} ${spelling}`).toBe('screening_contact_undeliverable');
      }
      // Another mailbox: another local part at Gmail, and the same one at another domain, where dots name another mailbox.
      expect(await refusal(`synthetic.${name}.other@gmail.com`)).toBe('accepted');
      expect(await refusal(`synthetic.${name}@clinic.synthetic.test`)).toBe('accepted');
      expect(await refusal(`synthetic${name}@clinic.synthetic.test`)).toBe('accepted');
    }
    // At a business domain: a sub-address and the case join, dots do not.
    const business = `front.desk.${letters()}`;
    await mailEvent(await submit({ email: `${business}@clinic.synthetic.test` }), 'bounce', `${business}@clinic.synthetic.test`);
    expect(await refusal(`${business}+screening@Clinic.Synthetic.Test`)).toBe('screening_contact_undeliverable');
    expect(await refusal(`${business.replace(/\./g, '')}@clinic.synthetic.test`)).toBe('accepted');
    await resetScreeningMail();
  });

  it('links each screening message to its prospect, holds no address-derived value on it, and lets the link go with the prospect', async () => {
    const given = `linked.${letters()}@synthetic.test`;
    const run = await submit({ email: given });
    const { message } = await mailEvent(run, 'delivery', given);
    const prospect = (await admin.query<{ prospect_id: string }>('SELECT u.prospect_id FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE r.id = $1', [run])).rows[0]?.prospect_id;
    const row = await admin.query('SELECT stream, kind, subject_id, screening_prospect_id, recipient_user_id FROM mail_send WHERE ses_message_id = $1', [message]);
    expect(row.rows).toEqual([{ stream: 'screening', kind: 'screening_result', subject_id: run, screening_prospect_id: prospect, recipient_user_id: null }]);
    // A later screening from the same address replaces this one: its prospect goes, and so does the link.
    await submit({ email: given, practice: `Synthetic Replacing ${letters()}` });
    expect((await admin.query('SELECT screening_prospect_id FROM mail_send WHERE ses_message_id = $1', [message])).rows).toEqual([{ screening_prospect_id: null }]);
  });

  it('marks each subject of a run whose result bounced permanently, refuses a subject’s fourth screening and leaves the stream open; the marks go after 7 days', async () => {
    const account = accountSubject();
    const client = sha256(`client ${randomUUID()}`);
    // A transient bounce marks nothing.
    const transient = `transient.${letters()}@synthetic.test`;
    await mailEvent(await submit({ email: transient, rateSubject: account, clientSubject: client }), 'bounce', transient, { bounceKind: 'transient', bounceSubtype: 'mailbox_full' });
    // Nor does the account's own suppression, which SES sends to no one and counts toward nothing.
    const accountListed = `account.listed.${letters()}@synthetic.test`;
    await mailEvent(await submit({ email: accountListed, rateSubject: account, clientSubject: client }), 'bounce', accountListed, { bounceSubtype: 'on_account_suppression_list' });
    // A bounce from SES's global suppression list marks as any hard bounce does (M2): the third of three.
    for (const subtype of ['general', 'no_email', 'suppressed']) {
      const given = `marked.${letters()}@synthetic.test`;
      const result = await mailEvent(await submit({ email: given, rateSubject: account, clientSubject: client }), 'bounce', given, { bounceSubtype: subtype });
      expect(result).toMatchObject({ recorded: true, state: 'bounced', stream_paused: null });
    }
    const marks = await admin.query<{ subject_kind: string; n: number; week: boolean }>(
      "SELECT subject_kind, count(*)::int AS n, bool_and(expires_at = bounced_at + interval '7 days') AS week FROM screening_bounce_mark WHERE subject IN ($1, $2) GROUP BY 1 ORDER BY 1",
      [account, client],
    );
    expect(marks.rows).toEqual([
      { subject_kind: 'account', n: 3, week: true },
      { subject_kind: 'client', n: 3, week: true },
    ]);
    const attempt = (options: SubmitOptions) => submit({ email: `fourth.${letters()}@synthetic.test`, ...options }).then(() => 'accepted', (error: unknown) => (error as { constraint?: string }).constraint);
    expect(await attempt({ rateSubject: account })).toBe('screening_bounce_budget');
    expect(await attempt({ clientSubject: client })).toBe('screening_bounce_budget');
    expect(await attempt({})).toBe('accepted');
    expect((await admin.query("SELECT paused_at FROM mail_stream WHERE stream = 'screening'")).rows).toEqual([{ paused_at: null }]);
    await admin.query("UPDATE screening_bounce_mark SET bounced_at = now() - interval '8 days', expires_at = now() - interval '1 day' WHERE subject IN ($1, $2)", [account, client]);
    expect(await attempt({ rateSubject: account, clientSubject: client })).toBe('accepted');
    await resetScreeningMail();
  });

  it('pauses the stream at its seventh permanent bounce below the floor, spread over three clients and three accounts, and then takes no screening', async () => {
    const accounts = [accountSubject(), accountSubject(), accountSubject()];
    const clients = [sha256(randomUUID()), sha256(randomUUID()), sha256(randomUUID())];
    const paused: (string | null)[] = [];
    for (let index = 0; index < 7; index += 1) {
      const given = `spread.${letters()}@synthetic.test`;
      const run = await submit({ email: given, rateSubject: accounts[index % 3], clientSubject: clients[(index + 1) % 3] });
      paused.push((await mailEvent(run, 'bounce', given)).stream_paused);
    }
    expect(paused).toEqual([null, null, null, null, null, null, 'bounce_rate']);
    await expect(submit()).rejects.toMatchObject({ code: '23514', constraint: 'screening_paused' });
    await resetScreeningMail();
  });

  it('claims, completes and fails no run while the screening’s mail is not sending; resumed but unconfirmed still none; once SES is confirmed, the run is claimed and completes', async () => {
    const waiting = await submit();
    const priced = await submit();
    const [claimed] = await as<{ attempt: number }>(OPERATOR_ROLE, 'SELECT attempt FROM operator_screening_claim($1)', [priced]);
    expect(claimed?.attempt).toBe(1);
    await pauseScreeningMail();
    const refusal = (attempt: Promise<unknown>) => attempt.then(() => 'accepted', (error: unknown) => (error as { constraint?: string }).constraint);
    expect(await refusal(as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_claim($1)', [waiting]))).toBe('screening_mail_paused');
    expect(await refusal(as(SCREENING_ROLE, 'SELECT * FROM operator_screening_claim($1)', [waiting]))).toBe('screening_mail_paused');
    expect(await refusal(as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_fail($1, $2, $3, NULL)', [waiting, 'RELEASE_UNAVAILABLE', `test-${randomUUID()}`]))).toBe('screening_mail_paused');
    // A batch the claimed attempt records is progress, not mail: taken while paused. Its completion is not.
    await priceRows(priced, 1);
    const completeOnly = () => as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, $5)', [priced, hex('9'), 'phase-two/1', `test-${randomUUID()}`, 1]);
    expect(await refusal(completeOnly())).toBe('screening_mail_paused');
    expect(await refusal(as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_fail($1, $2, $3, $4)', [priced, 'RELEASE_UNAVAILABLE', `test-${randomUUID()}`, 1]))).toBe('screening_mail_paused');
    expect(await as(SCREENING_ROLE, 'SELECT sending FROM screening_mail_gate()')).toEqual([{ sending: false }]);
    // Resumed, as the console resumes it: still unconfirmed, so still nothing.
    await admin.query(
      `UPDATE mail_stream SET paused_at = NULL, paused_reason = NULL, pause_sends = NULL, pause_bounces = NULL, pause_complaints = NULL, window_starts_at = now(),
              resumed_at = now(), probe_sent_at = NULL, ses_enabled_confirmed_at = NULL WHERE stream = 'screening'`,
    );
    expect(await refusal(as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_claim($1)', [waiting]))).toBe('screening_mail_paused');
    expect(await as(SCREENING_ROLE, 'SELECT sending, resumed_at IS NOT NULL AS resumed FROM screening_mail_gate()')).toEqual([{ sending: false, resumed: true }]);
    expect(await as(OPERATOR_ROLE, "SELECT operator_mail_stream_confirmed('screening', true) AS confirmed")).toEqual([{ confirmed: true }]);
    expect(await as(SCREENING_ROLE, 'SELECT sending FROM screening_mail_gate()')).toEqual([{ sending: true }]);
    expect(await completeOnly()).toHaveLength(1);
    await complete(waiting, hex('8'));
    expect((await admin.query('SELECT status FROM screening_run WHERE id = ANY ($1) ORDER BY status', [[waiting, priced]])).rows).toEqual([{ status: 'complete' }, { status: 'complete' }]);
    await resetScreeningMail();
  });
});

// ---------------------------------------------------------------------------------------------------
// Audit #57 (the founder's rulings of 2026-10-20; ADR 0062, Outcomes, leads and attribution): the counts-only outcome
// of every screening, the kept summary of a converted or consenting practice, attribution, and the campaign list. And
// audit #53's keyed reads, the SQL's own guards. Test matrix SCR-09 to SCR-14, the database's part. SYNTHETIC values.
// ---------------------------------------------------------------------------------------------------

/** A column's value as text: a date in ISO form, a string as it is, anything else as JSON. */
const asText = (value: unknown): string => (value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : JSON.stringify(value));

/** A link token's hash, one of its own each time. */
const tokenHash = () => sha256(`token-${randomUUID()}`);

/** The screening's ids: its prospect and upload. */
async function idsOf(runId: string): Promise<{ readonly prospectId: string; readonly uploadId: string }> {
  const { rows } = await admin.query<{ prospect_id: string; upload_id: string }>('SELECT u.prospect_id, r.upload_id FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE r.id = $1', [runId]);
  return { prospectId: rows[0]?.prospect_id ?? '', uploadId: rows[0]?.upload_id ?? '' };
}

/** The outcome of an upload (by id, so it is found once unlinked too). */
async function outcomeOfUpload(uploadId: string): Promise<Record<string, unknown> | undefined> {
  return (await admin.query('SELECT * FROM screening_outcome WHERE upload_id = $1', [uploadId])).rows[0] as Record<string, unknown> | undefined;
}

async function outcomeById(id: string): Promise<Record<string, unknown> | undefined> {
  return (await admin.query('SELECT * FROM screening_outcome WHERE id = $1', [id])).rows[0] as Record<string, unknown> | undefined;
}

/** Completes a run as complete() does, with a withdrawal token's hash for a consent summary. */
async function completeWith(runId: string, token: string, withdrawal: string | null): Promise<void> {
  const [claimed] = await as<{ attempt: number }>(OPERATOR_ROLE, 'SELECT attempt FROM operator_screening_claim($1)', [runId]);
  expect(claimed).toBeDefined();
  const attempt = claimed?.attempt ?? 0;
  const pending = await as<{ row_no: number; claim_count: number; observed_allowed_cents: string }>(OPERATOR_ROLE, 'SELECT * FROM operator_screening_rows($1, 0, 5000, $2)', [runId, attempt]);
  await as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)', [
    runId,
    pending.map((row) => row.row_no),
    pending.map(() => 'priced'),
    pending.map(() => '5000'),
    pending.map(() => '5000.25'),
    pending.map((row) => (5000n * BigInt(row.claim_count)).toString()),
    pending.map((row) => (5000n * BigInt(row.claim_count) - BigInt(row.observed_allowed_cents)).toString()),
    pending.map(() => true),
    pending.map(() => '4000'),
    pending.map(() => '4000.4'),
    pending.map((row) => (4000n * BigInt(row.claim_count)).toString()),
    pending.map((row) => (4000n * BigInt(row.claim_count) - BigInt(row.observed_allowed_cents)).toString()),
    pending.map(() => hex('e')),
    pending.map(() => null),
    pending.map(() => null),
    pending.map(() => hex('f')),
    attempt,
  ]);
  await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, $3, $4, $5, $6)', [runId, token, withdrawal, 'phase-two/1', `test-${randomUUID()}`, attempt]);
}

/** Claims a run and records every pending row as priced, as complete() does, without completing it; the attempt. */
async function priceAll(runId: string): Promise<number> {
  const [claimed] = await as<{ attempt: number }>(OPERATOR_ROLE, 'SELECT attempt FROM operator_screening_claim($1)', [runId]);
  const attempt = claimed?.attempt ?? 0;
  const pending = await as<{ row_no: number; claim_count: number; observed_allowed_cents: string }>(OPERATOR_ROLE, 'SELECT * FROM operator_screening_rows($1, 0, 5000, $2)', [runId, attempt]);
  await as(OPERATOR_ROLE, 'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)', [
    runId,
    pending.map((row) => row.row_no),
    pending.map(() => 'priced'),
    pending.map(() => '5000'),
    pending.map(() => '5000.25'),
    pending.map((row) => (5000n * BigInt(row.claim_count)).toString()),
    pending.map((row) => (5000n * BigInt(row.claim_count) - BigInt(row.observed_allowed_cents)).toString()),
    pending.map(() => false),
    pending.map(() => null),
    pending.map(() => null),
    pending.map(() => null),
    pending.map(() => null),
    pending.map(() => null),
    pending.map(() => null),
    pending.map(() => null),
    pending.map(() => hex('f')),
    attempt,
  ]);
  return attempt;
}

/** One statement as `role` inside the client's open transaction (SET LOCAL, so the role ends with it). */
async function asRole(client: pg.PoolClient, role: string, sql: string, values: unknown[]): Promise<unknown> {
  await client.query(`SET LOCAL ROLE ${role}`);
  await client.query("SELECT set_config('app.practice_ids', '{}', true)");
  return (await client.query(sql, values)).rows;
}

/** Waits until the client's backend waits on a lock (its statement sent and blocked). */
async function blockedOnLock(client: pg.PoolClient): Promise<void> {
  const pid = (client as unknown as { processID: number }).processID;
  for (let tries = 0; tries < 200; tries += 1) {
    const { rows } = await admin.query<{ wait: string | null }>('SELECT wait_event_type AS wait FROM pg_stat_activity WHERE pid = $1', [pid]);
    if (rows[0]?.wait === 'Lock') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('the session never waited on a lock');
}

async function convert(token: string): Promise<string> {
  const [row] = await as<{ id: string }>(APP_ROLE, 'SELECT convert_screening($1, $2, $3, $4, $5, $6) AS id', [token, 'SYNTHETIC CONTACT', 2, ['SYNTHETIC PAYER'], 'in_house', `test-${randomUUID()}`]);
  return row?.id ?? '';
}

async function reject(options: {
  readonly practice?: string;
  readonly email: string;
  readonly rowCount?: number;
  readonly reasons?: readonly object[];
  readonly source?: string | null;
  readonly campaign?: string | null;
}): Promise<string> {
  const [row] = await as<{ id: string }>(APP_ROLE, 'SELECT reject_screening_upload($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) AS id', [
    options.practice ?? `Synthetic Refused ${letters()}`,
    'MN',
    '00011',
    options.email,
    options.rowCount ?? 3,
    JSON.stringify(options.reasons ?? [{ code: 'no_rows' }]),
    options.source ?? null,
    null,
    null,
    options.campaign ?? null,
    null,
    null,
    null,
    `test-${randomUUID()}`,
  ]);
  return row?.id ?? '';
}

async function leadsOf(email: string): Promise<Record<string, unknown>[]> {
  return (await admin.query('SELECT * FROM screening_lead WHERE contact_email = $1 ORDER BY screened_at', [email])).rows as Record<string, unknown>[];
}

/** As the superuser, triggers off: moves a kept summary's dates back by `months`. */
async function ageLead(leadId: string, months: number): Promise<void> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    await client.query('UPDATE screening_lead SET screened_at = screened_at - $2::interval, expires_at = expires_at - $2::interval, created_at = created_at - $2::interval WHERE id = $1', [
      leadId,
      `${String(months)} months`,
    ]);
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}

/** A platform administrator (organization.manage) of an internal organization of their own: who lists campaigns. */
async function platformAdministrator(): Promise<string> {
  const owner = await admin.connect();
  try {
    const internal = await createOrganization(owner, 'internal');
    const administrator = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, internal, administrator, 'platform_admin');
    return administrator;
  } finally {
    owner.release();
  }
}

/** Lists a campaign code as the console does (console_register_marketing_campaign, as the application role). */
async function listCampaign(code: string, administrator: string): Promise<void> {
  await as(APP_ROLE, 'SELECT console_register_marketing_campaign($1, $2)', [code, `SYNTHETIC ${code}`], administrator);
}

/** Every CHECK literal pg_get_constraintdef prints for a constraint, in its order. */
async function constraintLiterals(table: string, name: string): Promise<string[]> {
  const { rows } = await admin.query<{ definition: string }>('SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c WHERE c.conrelid = $1::regclass AND c.conname = $2', [table, name]);
  return [...(rows[0]?.definition ?? '').matchAll(/'((?:[^']|'')*)'::text/g)].map((match) => (match[1] ?? '').replace(/''/g, "'"));
}

describe('audit #57: what a row may hold, and the bands and channel the database computes', () => {
  it('holds every closed list inline in each CHECK, never through a function, equal to the TypeScript lists', async () => {
    const { MARKETING_CHANNELS, PAID_CLICKS, PROSPECT_DECLINED_REASONS, PROSPECT_SOURCES, SCREENING_COUNT_BANDS, SCREENING_DIFFERENCE_BANDS, SCREENING_OPEN_BANDS, SCREENING_WAIT_REASONS } =
      await import('./schema');
    for (const [table, name] of [
      ['screening_prospect', 'screening_prospect_source'],
      ['screening_outcome', 'screening_outcome_source'],
      ['screening_lead', 'screening_lead_source'],
      ['prospect_request', 'prospect_request_source'],
    ] as const) {
      expect(await constraintLiterals(table, name), name).toEqual([...PROSPECT_SOURCES]);
    }
    for (const [table, name] of [
      ['screening_prospect', 'screening_prospect_paid_click'],
      ['screening_lead', 'screening_lead_paid_click'],
      ['prospect_request', 'prospect_request_paid_click'],
    ] as const) {
      expect(await constraintLiterals(table, name), name).toEqual([...PAID_CLICKS]);
    }
    expect(await constraintLiterals('prospect_request', 'prospect_request_declined_reason')).toEqual([...PROSPECT_DECLINED_REASONS]);
    expect(await constraintLiterals('screening_outcome', 'screening_outcome_channel')).toEqual([...MARKETING_CHANNELS]);
    expect(await constraintLiterals('screening_outcome', 'screening_outcome_row_band')).toEqual([...SCREENING_COUNT_BANDS]);
    expect(await constraintLiterals('screening_outcome', 'screening_outcome_left_out_band')).toEqual(SCREENING_COUNT_BANDS.filter((band) => band !== 'over_50k'));
    expect(await constraintLiterals('screening_outcome', 'screening_outcome_anomaly_band')).toEqual(SCREENING_COUNT_BANDS.filter((band) => band !== 'over_50k'));
    expect(await constraintLiterals('screening_outcome', 'screening_outcome_difference_band')).toEqual([...SCREENING_DIFFERENCE_BANDS]);
    expect(await constraintLiterals('screening_outcome', 'screening_outcome_open_band')).toEqual([...SCREENING_OPEN_BANDS]);
    // Why a run waits behind the normal tier (migration 20261106090000; Q7).
    expect(await constraintLiterals('screening_run', 'screening_run_wait_reason')).toEqual([...SCREENING_WAIT_REASONS]);
    // No CHECK on prospect_request calls a function but the one migration 20261030110000 granted (prospect_payers_valid):
    // the application role updates the table directly.
    const calls = await admin.query<{ conname: string; definition: string }>(
      "SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'prospect_request'::regclass AND contype = 'c' AND conname <> 'prospect_request_payers'",
    );
    for (const row of calls.rows) {
      expect(row.definition, row.conname).not.toMatch(/\b(?!btrim|length|lower)[a-z_]+\(/);
    }
  });

  it('computes the channel from the campaign medium and the kind of paid click', async () => {
    const channel = async (medium: string | null, click: string | null) => (await admin.query<{ c: string }>('SELECT marketing_channel($1, $2) AS c', [medium, click])).rows[0]?.c;
    const table: readonly (readonly [string | null, string])[] = [
      [null, 'none'],
      ['email', 'email'],
      ['newsletter', 'email'],
      ['cpc', 'paid_search'],
      ['ppc', 'paid_search'],
      ['paid_search', 'paid_search'],
      ['sem', 'paid_search'],
      ['paid_social', 'paid_social'],
      ['social', 'social'],
      ['organic_social', 'social'],
      ['linkedin', 'social'],
      ['partner', 'partner'],
      ['referral', 'partner'],
      ['affiliate', 'partner'],
      ['event', 'event'],
      ['conference', 'event'],
      ['webinar', 'event'],
      ['content', 'content'],
      ['blog', 'content'],
      ['podcast', 'content'],
      ['article', 'content'],
      ['print', 'other'],
    ];
    for (const [medium, expected] of table) {
      expect(await channel(medium, null), String(medium)).toBe(expected);
    }
    // A paid click names the channel only when the medium names none, or none the list knows.
    expect(await channel(null, 'paid_social')).toBe('paid_social');
    expect(await channel('print', 'paid_search')).toBe('paid_search');
    expect(await channel('email', 'paid_search')).toBe('email');
  });

  it('bands counts, dollars and the first open, never keeping the number, the sum or the date', async () => {
    const band = async (sql: string, value: unknown) => (await admin.query<{ b: string | null }>(`SELECT ${sql} AS b`, [value])).rows[0]?.b;
    for (const [n, expected] of [
      [null, 'none'],
      [0, 'none'],
      [-3, 'none'],
      [1, '1_100'],
      [100, '1_100'],
      [101, '101_1k'],
      [1000, '101_1k'],
      [1001, '1k_10k'],
      [10_000, '1k_10k'],
      [10_001, '10k_50k'],
      [50_000, '10k_50k'],
      [50_001, 'over_50k'],
    ] as const) {
      expect(await band('screening_count_band($1)', n), String(n)).toBe(expected);
    }
    for (const [cents_, expected] of [
      [null, 'none'],
      [-500, 'none'],
      [0, 'none'],
      [1, 'under_1k'],
      [99_999, 'under_1k'],
      [100_000, '1k_to_10k'],
      [999_999, '1k_to_10k'],
      [1_000_000, '10k_to_50k'],
      [4_999_999, '10k_to_50k'],
      [5_000_000, '50k_to_250k'],
      [24_999_999, '50k_to_250k'],
      [25_000_000, '250k_or_more'],
    ] as const) {
      expect(await band('screening_difference_band($1)', cents_), String(cents_)).toBe(expected);
    }
    const open = async (uploaded: string, opened: string) => (await admin.query<{ b: string | null }>('SELECT screening_open_band($1, $2) AS b', [uploaded, opened])).rows[0]?.b;
    // By UTC calendar days from the upload.
    expect(await open('2026-10-01T23:59:00Z', '2026-10-01T23:59:30Z')).toBe('same_day');
    expect(await open('2026-10-01T23:59:00Z', '2026-10-02T00:01:00Z')).toBe('1_2_days');
    expect(await open('2026-10-01T00:00:00Z', '2026-10-03T23:00:00Z')).toBe('1_2_days');
    expect(await open('2026-10-01T00:00:00Z', '2026-10-04T00:00:00Z')).toBe('3_7_days');
    expect(await open('2026-10-01T00:00:00Z', '2026-10-08T12:00:00Z')).toBe('3_7_days');
    expect(await open('2026-10-01T00:00:00Z', '2026-10-09T00:00:00Z')).toBe('8_30_days');
    expect(await open('2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z')).toBe('8_30_days');
    expect(await open('2026-10-01T00:00:00Z', null as unknown as string)).toBeNull();
    // A refused upload's codes: distinct, ascending, each a rejection code, never a row or a field.
    const codes = async (value: unknown) => (await admin.query<{ ok: boolean }>('SELECT screening_refusal_codes_valid($1::text[]) AS ok', [value])).rows[0]?.ok;
    expect(await codes(['no_rows'])).toBe(true);
    expect(await codes(['duplicate_row', 'phi_column', 'too_few_claim_lines'])).toBe(true);
    expect(await codes([])).toBe(true);
    expect(await codes(['phi_column', 'duplicate_row'])).toBe(false);
    expect(await codes(['no_rows', 'no_rows'])).toBe(false);
    expect(await codes(['row 12'])).toBe(false);
    expect(await codes(['no_rows', null])).toBe(false);
    expect(await codes(Array.from({ length: 14 }, () => 'no_rows'))).toBe(false);
    // The 14 codes there are since migration 20261105090000 (band_outside_content, a Medicare row outside the loaded content).
    const all = ['band_holds_date', 'band_in_future', 'band_outside_content', 'duplicate_column', 'duplicate_row', 'invalid_value', 'missing_column', 'no_rows', 'phi_column', 'row_count_mismatch', 'row_shape', 'too_few_claim_lines', 'too_many_rows', 'unknown_column'];
    expect(await codes(all)).toBe(true);
    expect(await codes(['band_outside_content'])).toBe(true);
    expect(await codes([...all, 'zip_unknown'].sort())).toBe(false);
    expect((await admin.query<{ v: string }>('SELECT screening_labels_version() AS v')).rows[0]?.v).toMatch(/^screening-labels\/20\d{2}-\d{2}-\d{2}$/);
    // The labels of the ZIP+4's engine details and of the rows left out for their quarter (migration 20261105090000).
    expect((await admin.query<{ v: string }>('SELECT screening_labels_version() AS v')).rows).toEqual([{ v: 'screening-labels/2026-11-05' }]);
  });

  it('refuses a prospect’s attribution that is not a code, a list answer or a firm’s name, and a consent or terms hash that is not one', async () => {
    const insert = (column: string, value: unknown) =>
      admin.query(`INSERT INTO screening_prospect (practice_name, state, zip, contact_email, ${column}) VALUES ('Synthetic Check', 'MN', '00011', 'check@synthetic.test', $1)`, [value]);
    for (const [column, value, constraint] of [
      ['source', 'friend', 'screening_prospect_source'],
      ['utm_source', 'Newsletter', 'screening_prospect_utm_source'],
      ['utm_medium', 'e mail', 'screening_prospect_utm_medium'],
      ['utm_campaign', 'jane.doe@synthetic.test', 'screening_prospect_utm_campaign'],
      ['utm_campaign', 'a'.repeat(65), 'screening_prospect_utm_campaign'],
      ['paid_click', 'gclid', 'screening_prospect_paid_click'],
      ['referring_firm', ' Synthetic Firm', 'screening_prospect_referring_firm'],
      ['referring_firm', '', 'screening_prospect_referring_firm'],
      ['referring_firm', 'x'.repeat(201), 'screening_prospect_referring_firm'],
      ['followup_consent_sha256', 'yes', 'screening_prospect_followup_consent'],
      ['screening_terms_sha256', hex('A'), 'screening_prospect_screening_terms'],
      ['zip_plus_four', '123', 'screening_prospect_zip_plus_four'],
      ['zip_plus_four', '12a4', 'screening_prospect_zip_plus_four'],
      ['zip_plus_four', '00012-5000', 'screening_prospect_zip_plus_four'],
    ] as const) {
      await expect(insert(column, value), `${column} ${String(value)}`).rejects.toMatchObject({ code: '23514', constraint });
    }
  });
});

describe('audit #57: the counts-only outcome (SCR-10)', () => {
  it('is written at submission: accepted, its bands, the channel and campaign computed here, the month and the release, and nothing that names anyone', async () => {
    await admin.query("INSERT INTO marketing_campaign (code, label, added_by) VALUES ('listed-launch', 'SYNTHETIC listed launch', $1)", [specialist]);
    const email = `outcome.${letters()}@synthetic.test`;
    const practice = `Synthetic Outcome ${letters()}`;
    const runId = await submit({
      practice,
      email,
      leftOut: [2, 15, 30_000n],
      attribution: { source: 'colleague', utmSource: 'newsletter', utmMedium: 'cpc', utmCampaign: 'listed-launch', paidClick: 'paid_social', firm: 'Synthetic Billing Partners' },
      termsSha256: hex('7'),
    });
    const { uploadId } = await idsOf(runId);
    const outcome = await outcomeOfUpload(uploadId);
    expect(outcome).toMatchObject({
      stage: 'accepted',
      source: 'colleague',
      channel: 'paid_search',
      campaign: 'listed-launch',
      consented: false,
      row_band: '1_100',
      left_out_band: '1_100',
      refusal_codes: [],
      after_refusal: false,
      release_no: 900001,
      engine_version: null,
      priced_share_pct: null,
      first_open_band: null,
      converted: false,
      superseded: false,
    });
    expect(outcome?.screened_month).toBe(new Date().toISOString().slice(0, 7));
    const { id: _id, upload_id: _upload, ...held } = outcome ?? {};
    const text = JSON.stringify(held);
    for (const value of [email, practice, '00011', 'Synthetic Billing Partners', 'newsletter', '20100', '15', '30000']) {
      expect(text, value).not.toContain(value);
    }
    // The prospect keeps its own attribution and the terms' hash.
    expect((await admin.query('SELECT source, utm_source, utm_medium, utm_campaign, paid_click, referring_firm, screening_terms_sha256 FROM screening_prospect WHERE contact_email = $1', [email])).rows).toEqual([
      { source: 'colleague', utm_source: 'newsletter', utm_medium: 'cpc', utm_campaign: 'listed-launch', paid_click: 'paid_social', referring_firm: 'Synthetic Billing Partners', screening_terms_sha256: hex('7') },
    ]);
    // An unlisted campaign code counts as other, and listing it later does not reclassify it; no code is null.
    const unlisted = await submit({ attribution: { utmCampaign: 'one-off-code', utmMedium: 'email' } });
    expect(await outcomeOfUpload((await idsOf(unlisted)).uploadId)).toMatchObject({ campaign: 'other', channel: 'email' });
    const prospectCampaign = async () => (await admin.query<{ utm_campaign: string | null }>('SELECT utm_campaign FROM screening_prospect WHERE id = $1', [(await idsOf(unlisted)).prospectId])).rows;
    // The prospect keeps other too, never the code (the founder's ruling of 2026-10-21).
    expect(await prospectCampaign()).toEqual([{ utm_campaign: 'other' }]);
    await admin.query("INSERT INTO marketing_campaign (code, label, added_by) VALUES ('one-off-code', 'SYNTHETIC listed later', $1)", [specialist]);
    expect(await outcomeOfUpload((await idsOf(unlisted)).uploadId)).toMatchObject({ campaign: 'other' });
    expect(await prospectCampaign()).toEqual([{ utm_campaign: 'other' }]);
    const none = await submit();
    expect(await outcomeOfUpload((await idsOf(none)).uploadId)).toMatchObject({ campaign: null, channel: 'none', source: null });
  });

  it('is written at refusal: refused, the band of the row count and the sorted, distinct codes of its reasons alone', async () => {
    const email = `refused.${letters()}@synthetic.test`;
    const uploadId = await reject({
      email,
      rowCount: 60_000,
      reasons: [
        { code: 'too_many_rows' },
        { code: 'phi_column', column: 4, phi: 'member_id' },
        { code: 'invalid_value', row: 12, field: 'units' },
        { code: 'phi_column', column: 5, phi: 'name' },
      ],
      source: 'event',
    });
    expect(await outcomeOfUpload(uploadId)).toMatchObject({
      stage: 'refused',
      row_band: 'over_50k',
      refusal_codes: ['invalid_value', 'phi_column', 'too_many_rows'],
      source: 'event',
      channel: 'none',
      release_no: null,
      left_out_band: 'none',
      after_refusal: false,
    });
    // An accepted screening that follows a refused upload of the practice (by address, or by ZIP and name) says so on
    // its own outcome; the refused outcome is never changed, so its reasons are not tied to a later converted outcome.
    const refused = await outcomeOfUpload(uploadId);
    const byZipAndName = await reject({ email: `zip.${letters()}@synthetic.test`, practice: 'Synthetic Retried Clinic' });
    const byAddress = await submit({ email });
    const byPractice = await submit({ practice: '  synthetic   RETRIED clinic ', email: `fresh.${letters()}@synthetic.test` });
    const unrelated = await submit({ email: `unrelated.${letters()}@synthetic.test` });
    expect(await outcomeOfUpload(uploadId)).toEqual(refused);
    expect(await outcomeOfUpload((await idsOf(byAddress)).uploadId)).toMatchObject({ stage: 'accepted', after_refusal: true });
    expect(await outcomeOfUpload((await idsOf(byPractice)).uploadId)).toMatchObject({ stage: 'accepted', after_refusal: true });
    expect(await outcomeOfUpload((await idsOf(unrelated)).uploadId)).toMatchObject({ after_refusal: false });
    expect(await outcomeOfUpload(byZipAndName)).toMatchObject({ stage: 'refused', after_refusal: false });
  });

  it('is priced at completion: whole-percent shares that floor to 97..100, the anomaly band from screening_standing() and the band of their gap', async () => {
    const runId = await submit();
    const { uploadId } = await idsOf(runId);
    await complete(runId, tokenHash());
    // Allowed 20,100 cents in all: priced 12,000 (59.7%), contract 7,000 (34.8%), not screened 1,100 (5.5%), none unpriced.
    // Both priced rows are more than $5 a claim line below their fully reduced figure (44,000 cents for 11 lines):
    // gaps of 34,000 and 42,000 cents, 76,000 in all, under $1,000.
    expect(await outcomeOfUpload(uploadId)).toMatchObject({
      stage: 'priced',
      engine_version: 'phase-two/1',
      priced_share_pct: 59,
      contract_share_pct: 34,
      could_not_price_share_pct: 0,
      not_screened_share_pct: 5,
      anomaly_band: '1_100',
      anomaly_difference_band: 'under_1k',
    });
    // A file with no allowed dollars has all-zero shares.
    const zero = await submit({ rows: [['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 0n, 11]] });
    await complete(zero, tokenHash());
    expect(await outcomeOfUpload((await idsOf(zero)).uploadId)).toMatchObject({ priced_share_pct: 0, contract_share_pct: 0, could_not_price_share_pct: 0, not_screened_share_pct: 0 });
    // No anomaly: both bands none.
    const fine = await submit({ rows: [['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 60_000n, 11]] });
    await complete(fine, tokenHash());
    expect(await outcomeOfUpload((await idsOf(fine)).uploadId)).toMatchObject({ anomaly_band: 'none', anomaly_difference_band: 'none', priced_share_pct: 100 });
  });

  it('fails with its run', async () => {
    const runId = await submit();
    await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_fail($1, $2, $3, NULL)', [runId, 'PRICING_FAILED', 'x']);
    expect(await outcomeOfUpload((await idsOf(runId)).uploadId)).toMatchObject({ stage: 'failed', engine_version: null, priced_share_pct: null });
  });

  it('keeps what it was written with, moves one way, sets its flags and first open once, and refuses each CHECK’s breach', async () => {
    const runId = await submit();
    const { uploadId } = await idsOf(runId);
    const id = String((await outcomeOfUpload(uploadId))?.id);
    for (const change of ["source = 'search'", "channel = 'email'", "campaign = 'other'", 'consented = true', "row_band = '101_1k'", "left_out_band = '1_100'", 'release_no = 900002', "screened_month = '2026-01'"]) {
      await expect(admin.query(`UPDATE screening_outcome SET ${change} WHERE id = $1`, [id]), change).rejects.toMatchObject({ code: '23514', constraint: 'screening_outcome_fixed' });
    }
    // Its link only goes: never to another upload.
    const other = (await idsOf(await submit())).uploadId;
    await expect(admin.query('UPDATE screening_outcome SET upload_id = $2 WHERE id = $1', [id, other])).rejects.toMatchObject({ constraint: 'screening_outcome_fixed' });
    // The figures are set only as it is priced, and the stage moves only from accepted.
    await expect(admin.query("UPDATE screening_outcome SET anomaly_band = 'none' WHERE id = $1", [id])).rejects.toMatchObject({ constraint: 'screening_outcome_fixed' });
    await expect(admin.query("UPDATE screening_outcome SET stage = 'refused' WHERE id = $1", [id])).rejects.toMatchObject({ constraint: 'screening_outcome_fixed' });
    const token = tokenHash();
    await complete(runId, token);
    await expect(admin.query("UPDATE screening_outcome SET stage = 'failed' WHERE id = $1", [id])).rejects.toMatchObject({ constraint: 'screening_outcome_fixed' });
    await expect(admin.query('UPDATE screening_outcome SET priced_share_pct = 58 WHERE id = $1', [id])).rejects.toMatchObject({ constraint: 'screening_outcome_fixed' });
    // The first open and the flags, once.
    await as(APP_ROLE, 'SELECT screening_result_opened($1)', [token]);
    expect(await outcomeById(id)).toMatchObject({ first_open_band: 'same_day' });
    await expect(admin.query("UPDATE screening_outcome SET first_open_band = '3_7_days' WHERE id = $1", [id])).rejects.toMatchObject({ constraint: 'screening_outcome_fixed' });
    await convert(token);
    expect(await outcomeById(id)).toMatchObject({ converted: true, first_open_band: 'same_day' });
    await expect(admin.query('UPDATE screening_outcome SET converted = false WHERE id = $1', [id])).rejects.toMatchObject({ constraint: 'screening_outcome_fixed' });
    // DELETE and TRUNCATE are refused, whoever asks.
    await expect(admin.query('DELETE FROM screening_outcome WHERE id = $1', [id])).rejects.toMatchObject({ code: 'P0001' });
    await expect(admin.query('TRUNCATE screening_outcome')).rejects.toMatchObject({ code: 'P0001' });
    // The CHECKs, as the owner writing a row directly.
    const row = (values: Record<string, unknown>) => {
      const base: Record<string, unknown> = { screened_month: '2026-10', stage: 'accepted', channel: 'none', row_band: '1_100', release_no: 900001, ...values };
      const columns = Object.keys(base);
      return admin.query(`INSERT INTO screening_outcome (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${String(index + 1)}`).join(', ')})`, Object.values(base));
    };
    const priced = { stage: 'priced', engine_version: 'phase-two/1', priced_share_pct: 50, contract_share_pct: 30, could_not_price_share_pct: 10, not_screened_share_pct: 9, anomaly_band: 'none', anomaly_difference_band: 'none' };
    await expect(row({})).resolves.toBeDefined();
    await expect(row(priced)).resolves.toBeDefined();
    for (const [values, constraint] of [
      [{ screened_month: '2026-13' }, 'screening_outcome_month'],
      [{ screened_month: '2026-10-01' }, 'screening_outcome_month'],
      [{ stage: 'refused', release_no: null }, 'screening_outcome_refused'],
      [{ stage: 'refused', release_no: null, refusal_codes: ['no_rows'], consented: true }, 'screening_outcome_refused'],
      [{ refusal_codes: ['no_rows'] }, 'screening_outcome_refused'],
      [{ stage: 'refused', release_no: null, refusal_codes: ['no_rows'], after_refusal: true }, 'screening_outcome_refused'],
      [{ release_no: null }, 'screening_outcome_pinned'],
      [{ row_band: 'none' }, 'screening_outcome_accepted_rows'],
      [{ row_band: 'over_50k' }, 'screening_outcome_accepted_rows'],
      [{ channel: 'billboard' }, 'screening_outcome_channel'],
      [{ campaign: 'Spring Launch' }, 'screening_outcome_campaign'],
      [{ left_out_band: 'over_50k' }, 'screening_outcome_left_out_band'],
      [{ ...priced, engine_version: null }, 'screening_outcome_priced'],
      [{ engine_version: 'phase-two/1' }, 'screening_outcome_priced'],
      [{ ...priced, priced_share_pct: 10 }, 'screening_outcome_shares'],
      [{ ...priced, anomaly_band: '1_100' }, 'screening_outcome_band'],
      [{ first_open_band: 'same_day' }, 'screening_outcome_opened'],
      [{ converted: true }, 'screening_outcome_converted'],
      [{ refusal_codes: ['row 12'], stage: 'refused', release_no: null }, 'screening_outcome_refusal_codes'],
    ] as const) {
      await expect(row(values), JSON.stringify(values)).rejects.toMatchObject({ code: '23514', constraint });
    }
  });

  it('outlives its screening: unlinked on replacement (superseded) and on expiry, then sealed, and no audit event names it', async () => {
    const email = `outlive.${letters()}@synthetic.test`;
    const first = await submit({ email });
    const firstUpload = (await idsOf(first)).uploadId;
    const firstOutcome = String((await outcomeOfUpload(firstUpload))?.id);
    await submit({ email });
    expect(await outcomeById(firstOutcome)).toMatchObject({ upload_id: null, superseded: true, stage: 'accepted' });
    await expect(admin.query('UPDATE screening_outcome SET converted = true WHERE id = $1', [firstOutcome])).rejects.toMatchObject({ constraint: 'screening_outcome_sealed' });
    const expiring = await submit();
    const expiringOutcome = String((await outcomeOfUpload((await idsOf(expiring)).uploadId))?.id);
    await age(expiring, 31);
    await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_expire(1000, $1)', ['x']);
    expect(await outcomeById(expiringOutcome)).toMatchObject({ upload_id: null, superseded: false });
    expect((await admin.query("SELECT count(*)::int AS n FROM audit_event WHERE object_type = 'screening_outcome' OR object_id IN (SELECT id FROM screening_outcome)")).rows).toEqual([{ n: 0 }]);
  });

  it('cannot be paired to reveal a small cell: two screenings whose one row differs by one claim line keep outcomes that differ in no count', async () => {
    const practice = `Synthetic Pair ${letters()}`;
    const twelve = await submit({ practice, rows: [['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 10_000n, 12]] });
    const twelveOutcome = String((await outcomeOfUpload((await idsOf(twelve)).uploadId))?.id);
    await complete(twelve, tokenHash());
    const eleven = await submit({ practice, rows: [['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 10_000n, 11]] });
    const elevenOutcome = String((await outcomeOfUpload((await idsOf(eleven)).uploadId))?.id);
    await complete(eleven, tokenHash());
    const strip = (outcome: Record<string, unknown> | undefined) => {
      const { id: _id, upload_id: _upload, superseded: _superseded, ...rest } = outcome ?? {};
      return rest;
    };
    // Both outcomes are kept for good, and subtracting one from the other gives nothing: every count is the same band.
    expect(strip(await outcomeById(twelveOutcome))).toEqual(strip(await outcomeById(elevenOutcome)));
    expect(await outcomeById(twelveOutcome)).toMatchObject({ superseded: true, upload_id: null });
  });
});

describe('audit #57: the kept summary of a converted or consenting practice (SCR-11, SCR-14)', () => {
  it('is frozen at conversion with the screening’s sums, its attribution, the labels’ version, its first open and 12 months to keep', async () => {
    const email = `lead.${letters()}@synthetic.test`;
    const runId = await submit({ email, leftOut: [2, 11, 4_000n], attribution: { source: 'search', utmSource: 'google', utmMedium: 'cpc', paidClick: 'paid_search', firm: 'Synthetic Firm' } });
    const token = tokenHash();
    await complete(runId, token);
    await as(APP_ROLE, 'SELECT screening_result_opened($1)', [token]);
    expect(await leadsOf(email)).toEqual([]);
    const requestId = await convert(token);
    const [lead] = await leadsOf(email);
    const [summary] = await as<Record<string, string | number>>(APP_ROLE, 'SELECT * FROM screening_result_summary($1)', [token]);
    const run = (await admin.query<{ first_opened_at: Date; created_at: Date }>('SELECT r.first_opened_at, u.created_at FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE r.id = $1', [runId])).rows[0];
    expect(lead).toMatchObject({
      prospect_request_id: requestId,
      practice_name: summary?.practice_name,
      zip: '00011',
      state: 'MN',
      source: 'search',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: null,
      paid_click: 'paid_search',
      referring_firm: 'Synthetic Firm',
      consent_sha256: null,
      withdrawal_token_sha256: null,
      release_no: 900001,
      release_manifest_sha256: hex('a'),
      engine_version: 'phase-two/1',
      labels_version: (await admin.query<{ v: string }>('SELECT screening_labels_version() AS v')).rows[0]?.v,
      row_count: summary?.rows,
      claim_lines: String(summary?.claim_lines),
      observed_cents: String(summary?.observed_cents),
      anomaly_rows: 2,
      left_out_rows: 2,
      left_out_claim_lines: 11,
      left_out_allowed_cents: '4000',
    });
    expect((lead?.result_first_opened_at as Date).toISOString()).toBe(run?.first_opened_at.toISOString());
    expect((lead?.screened_at as Date).toISOString()).toBe(run?.created_at.toISOString());
    const twelve = new Date(run?.created_at ?? 0);
    twelve.setUTCMonth(twelve.getUTCMonth() + 12);
    expect((lead?.expires_at as Date).toISOString()).toBe(twelve.toISOString());
    // The products' sums are the coverage's, row for row.
    const coverage = await as<{ payer_product: string; disposition: string; rows: number; claim_lines: string; observed_cents: string }>(APP_ROLE, 'SELECT * FROM screening_result_coverage($1)', [token]);
    const products = (await admin.query<Record<string, string | number>>('SELECT * FROM screening_lead_product WHERE lead_id = $1 ORDER BY payer_product', [lead?.id])).rows;
    expect(products.map((product) => product.payer_product).sort()).toEqual([...new Set(coverage.map((row) => row.payer_product))].sort());
    for (const product of products) {
      const rows = coverage.filter((row) => row.payer_product === product.payer_product);
      expect(product.row_count, String(product.payer_product)).toBe(rows.reduce((sum, row) => sum + row.rows, 0));
      expect(product.claim_lines).toBe(String(rows.reduce((sum, row) => sum + BigInt(row.claim_lines), 0n)));
      expect(product.observed_cents).toBe(String(rows.reduce((sum, row) => sum + BigInt(row.observed_cents), 0n)));
      expect(product.priced_observed_cents).toBe(String(rows.filter((row) => row.disposition === 'priced').reduce((sum, row) => sum + BigInt(row.observed_cents), 0n)));
    }
    expect(products.find((product) => product.payer_product === 'medicare_ffs')).toMatchObject({ priced_rows: 1, expected_cents: '55000', lowest_cents: '44000', pooled_rows: 1, anomaly_rows: 1 });
    expect((await admin.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'screening_lead_kept' AND object_type = 'screening_lead' AND object_id = $1", [lead?.id])).rows).toEqual([{ n: 1 }]);
  });

  it('keeps the left-out claim lines and dollars only at 11 or more', async () => {
    const email = `lead.small.${letters()}@synthetic.test`;
    const runId = await submit({ email, leftOut: [1, 10, 4_517n] });
    const token = tokenHash();
    await complete(runId, token);
    await convert(token);
    expect(await leadsOf(email)).toEqual([expect.objectContaining({ left_out_rows: 1, left_out_claim_lines: null, left_out_allowed_cents: null })]);
  });

  it('records a conversion as the first open when no signal came, and a signal after it sets nothing more', async () => {
    const email = `lead.open.${letters()}@synthetic.test`;
    const runId = await submit({ email });
    const token = tokenHash();
    await complete(runId, token);
    const { uploadId } = await idsOf(runId);
    await convert(token);
    const run = (await admin.query<{ first_opened_at: Date | null }>('SELECT first_opened_at FROM screening_run WHERE id = $1', [runId])).rows[0];
    expect(run?.first_opened_at).not.toBeNull();
    expect(await outcomeOfUpload(uploadId)).toMatchObject({ first_open_band: 'same_day', converted: true });
    expect((await leadsOf(email))[0]?.result_first_opened_at).not.toBeNull();
    await as(APP_ROLE, 'SELECT screening_result_opened($1)', [token]);
    expect((await admin.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'screening_result_opened' AND object_id = $1", [runId])).rows).toEqual([{ n: 0 }]);
    // The signal answers alike for an unknown, an incomplete or an expired link: nothing.
    await expect(as(APP_ROLE, 'SELECT screening_result_opened($1)', [tokenHash()])).resolves.toBeDefined();
    const queued = await submit();
    await as(APP_ROLE, 'SELECT screening_result_opened($1)', [hex('9')]);
    expect((await admin.query('SELECT first_opened_at FROM screening_run WHERE id = $1', [queued])).rows).toEqual([{ first_opened_at: null }]);
    const expired = await submit();
    const expiredToken = tokenHash();
    await complete(expired, expiredToken);
    await age(expired, 31);
    await as(APP_ROLE, 'SELECT screening_result_opened($1)', [expiredToken]);
    expect((await admin.query('SELECT first_opened_at FROM screening_run WHERE id = $1', [expired])).rows).toEqual([{ first_opened_at: null }]);
  });

  it('opens once: the run, the outcome’s band and the kept summary’s first open, one audit event, and a summary frozen after the open copies it', async () => {
    const email = `opened.${letters()}@synthetic.test`;
    const runId = await submit({ email });
    const token = tokenHash();
    await complete(runId, token);
    await as(APP_ROLE, 'SELECT screening_result_opened($1)', [token]);
    const first = (await admin.query<{ first_opened_at: Date }>('SELECT first_opened_at FROM screening_run WHERE id = $1', [runId])).rows[0]?.first_opened_at;
    expect(first).toBeInstanceOf(Date);
    await as(APP_ROLE, 'SELECT screening_result_opened($1)', [token]);
    expect((await admin.query<{ first_opened_at: Date }>('SELECT first_opened_at FROM screening_run WHERE id = $1', [runId])).rows[0]?.first_opened_at).toEqual(first);
    expect((await admin.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'screening_result_opened' AND object_type = 'screening_run' AND object_id = $1", [runId])).rows).toEqual([{ n: 1 }]);
    await expect(admin.query('UPDATE screening_run SET first_opened_at = now() WHERE id = $1', [runId])).rejects.toMatchObject({ code: '23514' });
    await convert(token);
    expect(((await leadsOf(email))[0]?.result_first_opened_at as Date).toISOString()).toBe(first?.toISOString());
  });

  it('is replaced at the completion of the practice’s next screening, which carries its request over and names it in the replacement’s event', async () => {
    const email = `replace.${letters()}@synthetic.test`;
    const practice = `Synthetic Replaced Practice ${letters()}`;
    const first = await submit({ email, practice });
    const firstToken = tokenHash();
    await complete(first, firstToken);
    const requestId = await convert(firstToken);
    const [kept] = await leadsOf(email);
    // A later screening of the practice deletes the earlier screening at once, but not its summary: that waits for the
    // later one's completion, so a failed or abandoned resend deletes nothing.
    const failed = await submit({ email, practice: `Synthetic Renamed ${letters()}` });
    expect(await leadsOf(email)).toEqual([expect.objectContaining({ id: kept?.id, upload_id: null, prospect_request_id: requestId })]);
    await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_fail($1, $2, $3, NULL)', [failed, 'PRICING_FAILED', 'x']);
    const abandoned = await submit({ email, practice });
    expect((await leadsOf(email)).map((lead) => lead.id)).toEqual([kept?.id]);
    // Nor may anyone delete it before it expires.
    await expect(admin.query('DELETE FROM screening_lead WHERE id = $1', [kept?.id])).rejects.toMatchObject({ code: '23514', constraint: 'screening_lead_kept' });
    // A refused upload replaces nothing.
    await reject({ email });
    expect((await leadsOf(email)).map((lead) => lead.id)).toEqual([kept?.id]);
    await complete(abandoned, tokenHash());
    const [replacement, ...more] = await leadsOf(email);
    expect(more).toEqual([]);
    expect(replacement?.id).not.toBe(kept?.id);
    expect(replacement).toMatchObject({ prospect_request_id: requestId, upload_id: (await idsOf(abandoned)).uploadId });
    expect((await admin.query("SELECT object_type FROM audit_event WHERE action = 'screening_lead_replaced' AND object_id = $1", [requestId])).rows).toEqual([{ object_type: 'prospect_request' }]);
    // The later screening's result says its summary is kept, with the earlier request it took over, before and after
    // it converts: converting it keeps the earlier request on the summary; the new request is still from the screening.
    const laterToken = (await admin.query<{ result_token_sha256: string }>('SELECT result_token_sha256 FROM screening_run WHERE id = $1', [abandoned])).rows[0]?.result_token_sha256 ?? '';
    expect(await as(APP_ROLE, 'SELECT converted, kept_with FROM screening_result_summary($1)', [laterToken])).toEqual([{ converted: false, kept_with: 'earlier_request' }]);
    const later = await convert(laterToken);
    expect(await leadsOf(email)).toEqual([expect.objectContaining({ prospect_request_id: requestId })]);
    expect((await admin.query('SELECT from_screening FROM prospect_request WHERE id = $1', [later])).rows).toEqual([{ from_screening: true }]);
    expect(await as(APP_ROLE, 'SELECT converted, kept_with FROM screening_result_summary($1)', [laterToken])).toEqual([{ converted: true, kept_with: 'earlier_request' }]);
  });

  it('says on the result what a screening’s summary is kept with: nothing, its own request, or an earlier one; and the completion says so too', async () => {
    const token = tokenHash();
    const runId = await submit();
    await complete(runId, token);
    expect(await as(APP_ROLE, 'SELECT converted, kept_with FROM screening_result_summary($1)', [token])).toEqual([{ converted: false, kept_with: 'none' }]);
    await convert(token);
    expect(await as(APP_ROLE, 'SELECT converted, kept_with FROM screening_result_summary($1)', [token])).toEqual([{ converted: true, kept_with: 'own_request' }]);
    // The completion's answer: 'none' for a screening that keeps nothing, 'earlier_request' for one that took a request over.
    const practice = `Synthetic Answered Practice ${letters()}`;
    const answered = await submit({ practice });
    await priceAll(answered);
    expect(await as(OPERATOR_ROLE, 'SELECT kept_with FROM operator_screening_complete($1, $2, NULL, $3, $4, 1)', [answered, tokenHash(), 'phase-two/1', 'x'])).toEqual([{ kept_with: 'none' }]);
    const answeredToken = (await admin.query<{ result_token_sha256: string }>('SELECT result_token_sha256 FROM screening_run WHERE id = $1', [answered])).rows[0]?.result_token_sha256 ?? '';
    await convert(answeredToken);
    const taking = await submit({ practice, email: `taking.${letters()}@synthetic.test` });
    await priceAll(taking);
    expect(await as(OPERATOR_ROLE, 'SELECT kept_with FROM operator_screening_complete($1, $2, NULL, $3, $4, 1)', [taking, tokenHash(), 'phase-two/1', 'x'])).toEqual([{ kept_with: 'earlier_request' }]);
  });

  it('leaves a request without a summary when a later screening from the same address names another practice, never carrying it onto that practice’s figures', async () => {
    // One billing firm's address screens two client practices: the first converts, then the second completes.
    const firm = `billing.${letters()}@firm.synthetic.test`;
    const alpha = `Synthetic Alpha Therapy ${letters()}`;
    const first = await submit({ practice: alpha, email: firm });
    const token = tokenHash();
    await complete(first, token);
    const alphaRequest = await convert(token);
    expect(await leadsOf(firm)).toEqual([expect.objectContaining({ practice_name: alpha, prospect_request_id: alphaRequest })]);
    const beta = await submit({ practice: `Synthetic Beta Rehab ${letters()}`, email: firm });
    const betaToken = tokenHash();
    await complete(beta, betaToken);
    // Alpha's summary went (the address is the practice's for the subtraction rule), and nothing carried its request.
    expect(await leadsOf(firm)).toEqual([]);
    expect((await admin.query('SELECT organization_name FROM prospect_request WHERE id = $1', [alphaRequest])).rows).toEqual([{ organization_name: alpha }]);
    expect((await admin.query('SELECT count(*)::int AS n FROM screening_lead WHERE prospect_request_id = $1', [alphaRequest])).rows).toEqual([{ n: 0 }]);
    expect((await admin.query("SELECT action, object_type FROM audit_event WHERE object_id = $1 AND action LIKE 'screening_lead_%'", [alphaRequest])).rows).toEqual([
      { action: 'screening_lead_left_request', object_type: 'prospect_request' },
    ]);
    expect(await as(APP_ROLE, 'SELECT kept_with FROM screening_result_summary($1)', [betaToken])).toEqual([{ kept_with: 'none' }]);
    // Beta's own request keeps Beta's figures.
    const betaRequest = await convert(betaToken);
    expect(await leadsOf(firm)).toEqual([expect.objectContaining({ prospect_request_id: betaRequest })]);
    expect(await as(APP_ROLE, 'SELECT kept_with FROM screening_result_summary($1)', [betaToken])).toEqual([{ kept_with: 'own_request' }]);
  });

  it('does not complete a run whose screening expired while it was priced', async () => {
    const runId = await submit();
    const attempt = await priceAll(runId);
    await age(runId, 31);
    await expect(as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, $5)', [runId, tokenHash(), 'phase-two/1', 'x', attempt])).rejects.toMatchObject({
      code: '23514',
      constraint: 'screening_run_expired',
    });
    expect((await admin.query('SELECT status FROM screening_run WHERE id = $1', [runId])).rows).toEqual([{ status: 'pricing' }]);
    // The job fails it instead, and its notice goes.
    expect(await as(OPERATOR_ROLE, 'SELECT contact_email FROM operator_screening_fail($1, $2, $3, $4)', [runId, 'EXPIRED', 'x', attempt])).toHaveLength(1);
  });

  it('is replaced the same way by a screening of the same ZIP and practice name from another address, and never by another practice’s', async () => {
    const practice = `Synthetic Same Practice ${letters()}`;
    const email = `first.${letters()}@synthetic.test`;
    const first = await submit({ practice, email });
    const token = tokenHash();
    await complete(first, token);
    const requestId = await convert(token);
    const neighbour = await submit({ practice: `Synthetic Neighbour ${letters()}`, email: `neighbour.${letters()}@synthetic.test` });
    await complete(neighbour, tokenHash());
    expect((await leadsOf(email)).map((lead) => lead.prospect_request_id)).toEqual([requestId]);
    const other = `second.${letters()}@synthetic.test`;
    const second = await submit({ practice: ` ${practice.toUpperCase()}  `, email: other });
    const secondToken = tokenHash();
    await complete(second, secondToken);
    expect(await leadsOf(email)).toEqual([]);
    // The later prospect's own details are what is kept now, with the earlier request, for 12 months from their
    // screening; their result says so (kept_with), though they converted nothing.
    const [taken] = await leadsOf(other);
    expect(taken).toMatchObject({ prospect_request_id: requestId, contact_email: other });
    expect((await admin.query("SELECT expires_at = screened_at + interval '12 months' AS twelve FROM screening_lead WHERE id = $1", [taken?.id])).rows).toEqual([{ twelve: true }]);
    expect(await as(APP_ROLE, 'SELECT converted, kept_with FROM screening_result_summary($1)', [secondToken])).toEqual([{ converted: false, kept_with: 'earlier_request' }]);
  });

  it('refuses a consent summary without a withdrawal link, keeps one with it, reminds once within the window, and withdraws it with its products', async () => {
    const email = `consent.${letters()}@synthetic.test`;
    const refused = await submit({ email: `consent.refused.${letters()}@synthetic.test`, consentSha256: hex('c') });
    await expect(completeWith(refused, tokenHash(), null)).rejects.toMatchObject({ code: '23514', constraint: 'screening_lead_withdrawal_token' });
    const runId = await submit({ email, consentSha256: hex('c') });
    const withdrawal = sha256(`withdraw-${randomUUID()}`);
    const consentToken = tokenHash();
    await completeWith(runId, consentToken, withdrawal);
    const [lead] = await leadsOf(email);
    expect(lead).toMatchObject({ consent_sha256: hex('c'), withdrawal_token_sha256: withdrawal, prospect_request_id: null, reminder_sent_at: null });
    expect(await outcomeOfUpload((await idsOf(runId)).uploadId)).toMatchObject({ consented: true });
    // Reminders: consent summaries only, within the window, once.
    const converted = `consent.converted.${letters()}@synthetic.test`;
    const plain = await submit({ email: converted });
    const plainToken = tokenHash();
    await complete(plain, plainToken);
    await convert(plainToken);
    const due = async (days: number) => (await as<{ lead_id: string; contact_email: string }>(OPERATOR_ROLE, 'SELECT * FROM operator_screening_reminders_due($1, 1000)', [days])).map((row) => row.lead_id);
    expect(await due(30)).not.toContain(lead?.id);
    expect(await due(400)).toContain(lead?.id);
    expect(await due(400)).not.toContain((await leadsOf(converted))[0]?.id);
    expect(await as(OPERATOR_ROLE, 'SELECT operator_screening_reminder_sent($1, $2) AS sent', [lead?.id, 'x'])).toEqual([{ sent: true }]);
    expect(await as(OPERATOR_ROLE, 'SELECT operator_screening_reminder_sent($1, $2) AS sent', [lead?.id, 'x'])).toEqual([{ sent: false }]);
    expect(await as(OPERATOR_ROLE, 'SELECT operator_screening_reminder_sent($1, $2) AS sent', [(await leadsOf(converted))[0]?.id, 'x'])).toEqual([{ sent: false }]);
    expect(await due(400)).not.toContain(lead?.id);
    // Withdrawal: an unknown token does nothing; the right one deletes the summary and its products, an audit event.
    await as(APP_ROLE, 'SELECT screening_lead_withdraw($1, $2)', [sha256('unknown'), 'x']);
    await as(APP_ROLE, 'SELECT screening_lead_withdraw($1, $2)', ['not-a-hash', 'x']);
    expect(await leadsOf(email)).toHaveLength(1);
    await as(APP_ROLE, 'SELECT screening_lead_withdraw($1, $2)', [withdrawal, 'x']);
    expect(await leadsOf(email)).toEqual([]);
    expect((await admin.query('SELECT count(*)::int AS n FROM screening_lead_product WHERE lead_id = $1', [lead?.id])).rows).toEqual([{ n: 0 }]);
    expect((await admin.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'screening_lead_withdrawn' AND object_id = $1", [lead?.id])).rows).toEqual([{ n: 1 }]);
    // A prospect who withdrew can still request an audit from the same link: the summary is kept on the request alone,
    // and the consent they withdrew is not kept again.
    const requestId = await convert(consentToken);
    expect(await leadsOf(email)).toEqual([expect.objectContaining({ prospect_request_id: requestId, consent_sha256: null, withdrawal_token_sha256: null, reminder_sent_at: null })]);
  });

  it('carries a request once when two completions at once each match the one summary that holds it, and the other completes without it', async () => {
    // Matching a practice is not transitive: the summary (Chain, y1) matches S2 by its address and S3 by its ZIP and
    // name, while S2 and S3 match each other by neither, so neither replaced the other at submission. S3, the same
    // practice, completes first and carries the request; S2, waiting on the summary S3 deleted, finds it gone.
    const chain = `Synthetic Chain ${letters()}`;
    const y1 = `chain.one.${letters()}@synthetic.test`;
    const y3 = `chain.three.${letters()}@synthetic.test`;
    const first = await submit({ practice: chain, email: y1 });
    const token = tokenHash();
    await complete(first, token);
    const requestId = await convert(token);
    const second = await submit({ practice: `Synthetic Other ${letters()}`, email: y1 });
    const third = await submit({ practice: chain, email: y3 });
    const attempts = [await priceAll(second), await priceAll(third)];
    const one = await admin.connect();
    const two = await admin.connect();
    try {
      for (const client of [one, two]) {
        await client.query('BEGIN');
        await client.query(`SET LOCAL ROLE ${OPERATOR_ROLE}`);
        await client.query("SELECT set_config('app.practice_ids', '{}', true)");
      }
      await one.query('SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, $5)', [third, tokenHash(), 'phase-two/1', 'x', attempts[1]]);
      // The second completion waits on the summary the first deleted, then finds it gone: it carries nothing.
      const waiting = two.query('SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, $5)', [second, tokenHash(), 'phase-two/1', 'x', attempts[0]]);
      await blockedOnLock(two);
      await one.query('COMMIT');
      expect((await waiting).rows).toHaveLength(1);
      await two.query('COMMIT');
    } finally {
      one.release();
      two.release();
    }
    expect(await leadsOf(y3)).toEqual([expect.objectContaining({ prospect_request_id: requestId, upload_id: (await idsOf(third)).uploadId })]);
    expect(await leadsOf(y1)).toEqual([]);
    expect((await admin.query<{ status: string }>('SELECT status FROM screening_run WHERE id = ANY($1) ORDER BY status', [[second, third]])).rows).toEqual([{ status: 'complete' }, { status: 'complete' }]);
  });

  it('never deadlocks a submission with the opened signal, a conversion, a completion or a failure of the screening it replaces, nor with the expiry job', async () => {
    // Each case: a third session holds the replaced screening's prospect (KEY SHARE), so the submission that replaces it
    // waits at its first lock; the other operation then runs on the replaced screening to its commit while the holder
    // still holds (it needs nothing the submission locks first); then the holder lets go and the submission replaces it.
    const cases: readonly { readonly name: string; readonly prepare: (runId: string, token: string) => Promise<unknown>; readonly run: (client: pg.PoolClient, runId: string, token: string, attempt: number) => Promise<unknown> }[] = [
      {
        name: 'opened',
        prepare: (runId, token) => complete(runId, token),
        run: (client, _runId, token) => asRole(client, APP_ROLE, 'SELECT screening_result_opened($1)', [token]),
      },
      {
        name: 'convert',
        prepare: (runId, token) => complete(runId, token),
        run: (client, _runId, token) => asRole(client, APP_ROLE, 'SELECT convert_screening($1, $2, $3, $4, $5, $6)', [token, 'SYNTHETIC CONTACT', 2, ['SYNTHETIC PAYER'], 'in_house', 'x']),
      },
      {
        name: 'complete',
        prepare: (runId) => priceAll(runId),
        run: (client, runId, token, attempt) => asRole(client, OPERATOR_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, $5)', [runId, token, 'phase-two/1', 'x', attempt]),
      },
      {
        name: 'fail',
        prepare: () => Promise.resolve(),
        run: (client, runId) => asRole(client, OPERATOR_ROLE, 'SELECT * FROM operator_screening_fail($1, $2, $3, NULL)', [runId, 'PRICING_FAILED', 'x']),
      },
    ];
    for (const item of cases) {
      const practice = `Synthetic Lock Order ${letters()}`;
      const replaced = await submit({ practice, email: `lock.${letters()}@synthetic.test` });
      const token = tokenHash();
      const prepared = await item.prepare(replaced, token);
      const attempt = typeof prepared === 'number' ? prepared : 0;
      const { prospectId } = await idsOf(replaced);
      const holder = await admin.connect();
      const submitter = await admin.connect();
      const other = await admin.connect();
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT 1 FROM screening_prospect WHERE id = $1 FOR KEY SHARE', [prospectId]);
        await submitter.query('BEGIN');
        await submitter.query(`SET LOCAL ROLE ${APP_ROLE}`);
        const submitted = submitter.query(SUBMIT, submitValues({ practice, email: `lock.other.${letters()}@synthetic.test` })).then(
          async () => {
            await submitter.query('COMMIT');
            return 'submitted';
          },
          async (error: { code?: string }) => {
            await submitter.query('ROLLBACK');
            return `submit failed ${String(error.code)}`;
          },
        );
        await blockedOnLock(submitter);
        await other.query('BEGIN');
        const done = await item.run(other, replaced, token, attempt).then(
          async () => {
            await other.query('COMMIT');
            return 'done';
          },
          async (error: { code?: string }) => {
            await other.query('ROLLBACK');
            return `failed ${String(error.code)}`;
          },
        );
        await holder.query('COMMIT');
        expect([item.name, done, await submitted]).toEqual([item.name, 'done', 'submitted']);
      } finally {
        holder.release();
        submitter.release();
        other.release();
      }
      expect((await admin.query('SELECT 1 FROM screening_run WHERE id = $1', [replaced])).rows, item.name).toEqual([]);
    }
    // The expiry job beside a submission that replaces an expired screening: it skips the prospect the submission holds
    // and returns at once; the submission then replaces it.
    const practice = `Synthetic Lock Expiry ${letters()}`;
    const expired = await submit({ practice, email: `lock.expired.${letters()}@synthetic.test` });
    await age(expired, 31);
    const submitter = await admin.connect();
    try {
      await submitter.query('BEGIN');
      await submitter.query(`SET LOCAL ROLE ${APP_ROLE}`);
      await submitter.query(SUBMIT, submitValues({ practice, email: `lock.expiry.${letters()}@synthetic.test` }));
      await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_expire(1000, $1)', ['x']);
      expect((await admin.query('SELECT 1 FROM screening_run WHERE id = $1', [expired])).rows).toHaveLength(1);
      await submitter.query('COMMIT');
    } finally {
      submitter.release();
    }
    expect((await admin.query('SELECT 1 FROM screening_run WHERE id = $1', [expired])).rows).toEqual([]);
  });

  it('keeps what it was frozen with, sets its request and other fields once, and its products never change and go only with it', async () => {
    const email = `fixed.${letters()}@synthetic.test`;
    const runId = await submit({ email });
    const token = tokenHash();
    await complete(runId, token);
    await convert(token);
    const [lead] = await leadsOf(email);
    for (const change of ["practice_name = 'Synthetic Other'", 'row_count = row_count + 1', 'observed_cents = 0', "labels_version = 'screening-labels/2027-01-01'", 'screened_at = now()']) {
      await expect(admin.query(`UPDATE screening_lead SET ${change} WHERE id = $1`, [lead?.id]), change).rejects.toMatchObject({ constraint: 'screening_lead_fixed' });
    }
    const otherRequest = (await admin.query<{ id: string }>("SELECT submit_prospect_request('SYNTHETIC', 'x@synthetic.test', 'SYNTHETIC ORG', 1, ARRAY['SYNTHETIC PAYER'], 'in_house') AS id")).rows[0]?.id;
    await expect(admin.query('UPDATE screening_lead SET prospect_request_id = $2 WHERE id = $1', [lead?.id, otherRequest])).rejects.toMatchObject({ constraint: 'screening_lead_fixed' });
    await expect(admin.query("UPDATE screening_lead SET expires_at = now() + interval '1 day' WHERE id = $1", [lead?.id])).rejects.toMatchObject({ constraint: 'screening_lead_fixed' });
    await expect(admin.query("UPDATE screening_lead_product SET row_count = row_count WHERE lead_id = $1 AND payer_product = 'medicaid'", [lead?.id])).rejects.toMatchObject({ code: 'P0001' });
    await expect(admin.query("DELETE FROM screening_lead_product WHERE lead_id = $1 AND payer_product = 'medicaid'", [lead?.id])).rejects.toMatchObject({ constraint: 'screening_lead_kept' });
    await expect(admin.query('TRUNCATE screening_lead_product')).rejects.toMatchObject({ code: 'P0001' });
    await expect(admin.query('TRUNCATE screening_lead CASCADE')).rejects.toMatchObject({ code: 'P0001' });
    // The CHECKs on a summary and its products: every claim-line sum 0 or at least 11 (10 refused, 11 taken).
    const fresh = (await admin.query<{ id: string }>(
      `INSERT INTO screening_lead (practice_name, state, zip, contact_email, consent_sha256, release_no, release_manifest_sha256, engine_version, labels_version, screened_at,
                                   row_count, claim_lines, observed_cents, anomaly_rows, left_out_rows, expires_at)
       VALUES ('Synthetic Check Lead', 'MN', '00011', 'check.lead@synthetic.test', $1, 900001, $2, 'phase-two/1', 'screening-labels/2026-10-18', now(), 2, 22, 100, 0, 0, now() + interval '1 month')
       RETURNING id`,
      [hex('d'), hex('a')],
    )).rows[0]?.id;
    const product = (claims: [number, number]) =>
      admin.query(
        `INSERT INTO screening_lead_product (lead_id, payer_product, row_count, claim_lines, observed_cents, priced_rows, priced_claim_lines, priced_observed_cents, could_not_price_rows, could_not_price_claim_lines, could_not_price_observed_cents)
         VALUES ($1, 'medicare_ffs', 2, $2, 100, 1, $3, 60, 1, $4, 40)`,
        [fresh, claims[0] + claims[1], claims[0], claims[1]],
      );
    await expect(product([10, 12])).rejects.toMatchObject({ constraint: 'screening_lead_product_cells' });
    await expect(product([11, 11])).resolves.toBeDefined();
    await expect(admin.query("INSERT INTO screening_lead_product (lead_id, payer_product, row_count, claim_lines, observed_cents) VALUES ($1, 'medicaid', 1, 10, 0)", [fresh])).rejects.toMatchObject({
      constraint: 'screening_lead_product_claim_lines',
    });
    await expect(admin.query("INSERT INTO screening_lead_product (lead_id, payer_product, row_count, claim_lines, observed_cents, priced_rows) VALUES ($1, 'commercial', 1, 11, 0, 1)", [fresh])).rejects.toMatchObject({
      constraint: 'screening_lead_product_medicare',
    });
    const lead_ = (values: string) =>
      admin.query(
        `INSERT INTO screening_lead (practice_name, state, zip, contact_email, release_no, release_manifest_sha256, engine_version, labels_version, screened_at, row_count, claim_lines, observed_cents, anomaly_rows, left_out_rows, expires_at ${values})`,
      );
    const base = `'Synthetic', 'MN', '00011', 'c@synthetic.test', 900001, '${hex('a')}', 'phase-two/1', 'screening-labels/2026-10-18', now(), 1, 11, 0, 0, 0, now() + interval '1 month'`;
    await expect(lead_(`) VALUES (${base}`)).rejects.toMatchObject({ constraint: 'screening_lead_basis' });
    await expect(lead_(`, consent_sha256, left_out_claim_lines, left_out_allowed_cents) VALUES (${base}, '${hex('d')}', 11, 5`)).rejects.toMatchObject({ constraint: 'screening_lead_left_out' });
    await expect(lead_(`, consent_sha256) VALUES (${base.replace("now() + interval '1 month'", "now() + interval '13 months'")}, '${hex('d')}'`)).rejects.toMatchObject({ constraint: 'screening_lead_expiry' });
    await expect(lead_(`, reminder_sent_at, prospect_request_id) VALUES (${base}, now(), '${String(otherRequest)}'`)).rejects.toMatchObject({ constraint: 'screening_lead_consent_only' });
  });

  it('goes after its 12 months with its products (the expiry job), or with its request (the cascade of audit #51)', async () => {
    const email = `expire.${letters()}@synthetic.test`;
    const runId = await submit({ email });
    const token = tokenHash();
    await complete(runId, token);
    await convert(token);
    const [lead] = await leadsOf(email);
    await ageLead(String(lead?.id), 13);
    const jobId = `test-${randomUUID()}`;
    const [expired] = await as<{ leads: number }>(OPERATOR_ROLE, 'SELECT * FROM operator_screening_expire(1000, $1)', [jobId]);
    expect(expired?.leads).toBeGreaterThanOrEqual(1);
    expect(await leadsOf(email)).toEqual([]);
    expect((await admin.query('SELECT count(*)::int AS n FROM screening_lead_product WHERE lead_id = $1', [lead?.id])).rows).toEqual([{ n: 0 }]);
    expect((await admin.query("SELECT request_id FROM audit_event WHERE action = 'screening_lead_expired' AND object_id = $1", [lead?.id])).rows).toEqual([{ request_id: jobId }]);
    // A request's deletion takes its summary with it, once its converted run has gone.
    const second = `cascade.${letters()}@synthetic.test`;
    const other = await submit({ email: second });
    const otherToken = tokenHash();
    await complete(other, otherToken);
    const requestId = await convert(otherToken);
    await age(other, 31);
    await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_expire(1000, $1)', ['x']);
    expect(await leadsOf(second)).toHaveLength(1);
    await admin.query('DELETE FROM prospect_request WHERE id = $1', [requestId]);
    expect(await leadsOf(second)).toEqual([]);
  });

  it('can be matched to its outcome only while it is kept, by month and release; once it and its request are gone, the outcome holds no count, sum or date any record holds', async () => {
    const email = `relink.${letters()}@synthetic.test`;
    const runId = await submit({ email, leftOut: [2, 12, 3_000n] });
    const { uploadId } = await idsOf(runId);
    const outcomeId = String((await outcomeOfUpload(uploadId))?.id);
    const token = tokenHash();
    await complete(runId, token);
    const requestId = await convert(token);
    const [lead] = await leadsOf(email);
    // The stated linkage while the summary is kept: the same month and release, and converted.
    const matched = await admin.query<{ id: string }>(
      "SELECT o.id FROM screening_outcome o JOIN screening_lead l ON o.screened_month = to_char(l.screened_at AT TIME ZONE 'UTC', 'YYYY-MM') AND o.release_no = l.release_no AND o.converted WHERE l.id = $1",
      [lead?.id],
    );
    expect(matched.rows.map((row) => row.id)).toContain(outcomeId);
    // Its exact counts, sums and dates, while kept.
    const exact = new Set<string>();
    for (const [key, value] of Object.entries(lead ?? {})) {
      if (/rows|count|claim_lines|cents|_at$/.test(key) && value !== null) {
        exact.add(asText(value));
      }
    }
    const events = await admin.query<{ at: Date }>('SELECT at FROM audit_event WHERE object_id IN ($1, $2, $3)', [runId, requestId, lead?.id]);
    for (const event of events.rows) {
      exact.add(event.at.toISOString());
    }
    // Then everything that held them goes: the screening at 30 days, the summary with its request.
    await age(runId, 31);
    await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_expire(1000, $1)', ['x']);
    await admin.query('DELETE FROM prospect_request WHERE id = $1', [requestId]);
    expect(await leadsOf(email)).toEqual([]);
    const outcome = await outcomeById(outcomeId);
    expect(outcome?.upload_id).toBeNull();
    const values = Object.entries(outcome ?? {})
      .filter(([key]) => key !== 'id')
      .flatMap(([, value]): unknown[] => (Array.isArray(value) ? (value as unknown[]) : [value]))
      .filter((value) => value !== null)
      .map(asText);
    const shared = values.filter((value) => exact.has(value) && !['0', 'true', 'false'].includes(value));
    expect(shared).toEqual([]);
    // The month and the release are all it keeps of when and under what; no date finer than the month.
    expect(outcome?.screened_month).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('audit #57: the campaign list and the request’s new columns', () => {
  it('lists a campaign by a platform administrator alone, an audit event, and keeps it listed for good', async () => {
    const owner = await admin.connect();
    let administrator: string;
    try {
      const internal = await createOrganization(owner, 'internal');
      administrator = await createUser(owner, { hardwareKeyRequired: true });
      await addMembership(owner, internal, administrator, 'platform_admin');
    } finally {
      owner.release();
    }
    await expect(as(APP_ROLE, 'SELECT console_register_marketing_campaign($1, $2)', ['spring-webinar', 'SYNTHETIC spring webinar'], specialist)).rejects.toMatchObject({ code: '42501' });
    await as(APP_ROLE, 'SELECT console_register_marketing_campaign($1, $2)', ['spring-webinar', ' SYNTHETIC spring webinar '], administrator);
    expect((await admin.query("SELECT label, added_by FROM marketing_campaign WHERE code = 'spring-webinar'")).rows).toEqual([{ label: 'SYNTHETIC spring webinar', added_by: administrator }]);
    // The listing's event names the campaign it listed, by its ID.
    const [listed] = (await admin.query<{ id: string }>("SELECT id FROM marketing_campaign WHERE code = 'spring-webinar'")).rows;
    expect((await admin.query("SELECT actor_id, object_type, object_id FROM audit_event WHERE action = 'marketing_campaign_registered' AND actor_id = $1", [administrator])).rows).toEqual([
      { actor_id: administrator, object_type: 'marketing_campaign', object_id: listed?.id },
    ]);
    await expect(as(APP_ROLE, 'SELECT console_register_marketing_campaign($1, $2)', ['spring-webinar', 'Again'], administrator)).rejects.toMatchObject({ code: '23505' });
    await expect(as(APP_ROLE, 'SELECT console_register_marketing_campaign($1, $2)', ['other', 'Other'], administrator)).rejects.toMatchObject({ constraint: 'marketing_campaign_code' });
    await expect(as(APP_ROLE, 'SELECT console_register_marketing_campaign($1, $2)', ['Spring Webinar', 'x'], administrator)).rejects.toMatchObject({ constraint: 'marketing_campaign_code' });
    await expect(admin.query("UPDATE marketing_campaign SET label = 'x' WHERE code = 'spring-webinar'")).rejects.toMatchObject({ code: 'P0001' });
    await expect(admin.query("DELETE FROM marketing_campaign WHERE code = 'spring-webinar'")).rejects.toMatchObject({ code: 'P0001' });
    await expect(admin.query('TRUNCATE marketing_campaign CASCADE')).rejects.toMatchObject({ code: 'P0001' });
  });

  it('grants the twelve-argument audit request to the application role alone, and keeps the six-argument one for the previous image', async () => {
    // The founder lists the campaign, so the request keeps its code (the founder's ruling of 2026-10-21).
    await listCampaign('fall-launch', await platformAdministrator());
    const { rows } = await admin.query<{ name: string; app: boolean; public: boolean; definer: boolean }>(
      `SELECT p.oid::regprocedure::text AS name, has_function_privilege($1, p.oid, 'EXECUTE') AS app, p.prosecdef AS definer,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') AS public
         FROM pg_proc p WHERE p.proname = 'submit_prospect_request' ORDER BY p.pronargs`,
      [APP_ROLE],
    );
    expect(rows.map((row) => ({ args: row.name.split(',').length, app: row.app, public: row.public, definer: row.definer }))).toEqual([
      { args: 6, app: true, public: false, definer: true },
      { args: 12, app: true, public: false, definer: true },
    ]);
    const [request] = await as<{ id: string }>(APP_ROLE, 'SELECT submit_prospect_request($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS id', [
      ' SYNTHETIC REQUESTER ',
      'Requester@Synthetic.Test',
      'SYNTHETIC ORGANIZATION',
      2,
      ['SYNTHETIC PAYER'],
      'mixed',
      'article',
      'blog',
      'content',
      'fall-launch',
      'paid_social',
      'SYNTHETIC FIRM',
    ]);
    expect((await admin.query('SELECT contact_name, contact_email, source, utm_source, utm_medium, utm_campaign, paid_click, referring_firm, from_screening, declined_reason FROM prospect_request WHERE id = $1', [request?.id])).rows).toEqual([
      {
        contact_name: 'SYNTHETIC REQUESTER',
        contact_email: 'requester@synthetic.test',
        source: 'article',
        utm_source: 'blog',
        utm_medium: 'content',
        utm_campaign: 'fall-launch',
        paid_click: 'paid_social',
        referring_firm: 'SYNTHETIC FIRM',
        from_screening: false,
        declined_reason: null,
      },
    ]);
    // Its attribution and from_screening never change once received.
    for (const change of ["source = 'search'", "utm_campaign = 'x'", 'from_screening = true', "referring_firm = 'Other'"]) {
      await expect(admin.query(`UPDATE prospect_request SET ${change} WHERE id = $1`, [request?.id]), change).rejects.toMatchObject({ code: '23514' });
    }
    await expect(as(APP_ROLE, 'SELECT submit_prospect_request($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', ['S', 's@synthetic.test', 'O', 1, ['P'], 'mixed', 'friend', null, null, null, null, null])).rejects.toMatchObject({
      constraint: 'prospect_request_source',
    });
  });
});

describe('the founder’s ruling of 2026-10-21: a row keeps a link’s campaign code only when the founder lists it', () => {
  /** A person's name typed inside a code: a code's shape, which no shape check catches, and on no list. */
  const NAMED = 'jane-doe-follow-up';
  const LISTED = 'ruling-listed';
  let administrator: string;

  beforeAll(async () => {
    administrator = await platformAdministrator();
    await listCampaign(LISTED, administrator);
  });

  /** Every stored campaign value of the four tables that keep one, by table. */
  async function campaignsHolding(code: string): Promise<{ table: string; n: number }[]> {
    const { rows } = await admin.query<{ table: string; n: number }>(
      `SELECT t.name AS table, count(*)::int AS n FROM (
         SELECT 'screening_prospect' AS name, utm_campaign AS code FROM screening_prospect
         UNION ALL SELECT 'screening_lead', utm_campaign FROM screening_lead
         UNION ALL SELECT 'prospect_request', utm_campaign FROM prospect_request
         UNION ALL SELECT 'screening_outcome', campaign FROM screening_outcome) t
        WHERE t.code = $1 GROUP BY t.name ORDER BY t.name`,
      [code],
    );
    return rows;
  }

  const REQUEST = 'SELECT submit_prospect_request($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS id';
  const requestValues = (campaign: string | null) => [
    'SYNTHETIC REQUESTER',
    `requester.${letters()}@synthetic.test`,
    `SYNTHETIC ORGANIZATION ${letters()}`,
    1,
    ['SYNTHETIC PAYER'],
    'mixed',
    null,
    'newsletter',
    'email',
    campaign,
    null,
    null,
  ];

  it('keeps a listed code, other for any other code and null for none, at submission, refusal and an audit request, the outcome as its prospect', async () => {
    for (const [given, kept] of [
      [LISTED, LISTED],
      [NAMED, 'other'],
      [null, null],
    ] as const) {
      const email = `ruling.${letters()}@synthetic.test`;
      const runId = await submit({ email, attribution: { utmCampaign: given, utmMedium: 'email' } });
      const { prospectId, uploadId } = await idsOf(runId);
      expect((await admin.query('SELECT utm_campaign FROM screening_prospect WHERE id = $1', [prospectId])).rows, `submitted ${String(given)}`).toEqual([{ utm_campaign: kept }]);
      expect((await outcomeOfUpload(uploadId))?.campaign, `submitted ${String(given)}`).toBe(kept);
      const refused = await reject({ email: `ruling.refused.${letters()}@synthetic.test`, campaign: given });
      expect(
        (await admin.query('SELECT p.utm_campaign, o.campaign FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id JOIN screening_outcome o ON o.upload_id = u.id WHERE u.id = $1', [refused])).rows,
        `refused ${String(given)}`,
      ).toEqual([{ utm_campaign: kept, campaign: kept }]);
      // The application role's one way to write a request, called directly, as the web layer would not.
      const [request] = await as<{ id: string }>(APP_ROLE, REQUEST, requestValues(given));
      expect((await admin.query('SELECT utm_campaign FROM prospect_request WHERE id = $1', [request?.id])).rows, `requested ${String(given)}`).toEqual([{ utm_campaign: kept }]);
    }
    expect(await campaignsHolding(NAMED)).toEqual([]);
  });

  it('carries the kept code, never the one given, into the summary and the request a conversion writes', async () => {
    for (const [given, kept] of [
      [LISTED, LISTED],
      [NAMED, 'other'],
    ] as const) {
      const email = `ruling.converted.${letters()}@synthetic.test`;
      const runId = await submit({ email, attribution: { utmCampaign: given, utmSource: 'newsletter', utmMedium: 'email' } });
      const token = tokenHash();
      await complete(runId, token);
      const requestId = await convert(token);
      expect((await admin.query('SELECT utm_campaign, from_screening FROM prospect_request WHERE id = $1', [requestId])).rows, String(given)).toEqual([{ utm_campaign: kept, from_screening: true }]);
      expect((await leadsOf(email)).map((lead) => lead.utm_campaign), String(given)).toEqual([kept]);
    }
    expect(await campaignsHolding(NAMED)).toEqual([]);
  });

  it('leaves a row that kept other as it is when its code is listed later, and keeps the code from then on', async () => {
    const later = 'ruling-listed-later';
    const runId = await submit({ attribution: { utmCampaign: later } });
    const { prospectId, uploadId } = await idsOf(runId);
    const [request] = await as<{ id: string }>(APP_ROLE, REQUEST, requestValues(later));
    const before = { prospect: [{ utm_campaign: 'other' }], outcome: 'other', request: [{ utm_campaign: 'other' }] };
    const now = async () => ({
      prospect: (await admin.query('SELECT utm_campaign FROM screening_prospect WHERE id = $1', [prospectId])).rows,
      outcome: (await outcomeOfUpload(uploadId))?.campaign,
      request: (await admin.query('SELECT utm_campaign FROM prospect_request WHERE id = $1', [request?.id])).rows,
    });
    expect(await now()).toEqual(before);
    await listCampaign(later, administrator);
    expect(await now()).toEqual(before);
    const listedNow = await submit({ attribution: { utmCampaign: later } });
    expect((await outcomeOfUpload((await idsOf(listedNow)).uploadId))?.campaign).toBe(later);
    expect(await campaignsHolding(later)).toEqual([
      { table: 'screening_outcome', n: 1 },
      { table: 'screening_prospect', n: 1 },
    ]);
  });

  it('holds every write path to the list: the owner’s own inserts and updates, and the application role’s direct writes, beside each table’s immutability guard', async () => {
    const release = (await admin.query<{ manifest_sha256: string }>('SELECT manifest_sha256 FROM rule_release WHERE release_no = 900001')).rows[0]?.manifest_sha256;
    const inserts: Record<string, (code: string | null) => Promise<pg.QueryResult<{ id: string; kept: string | null }>>> = {
      screening_prospect: (code) =>
        admin.query<{ id: string; kept: string | null }>("INSERT INTO screening_prospect (practice_name, state, zip, contact_email, utm_campaign) VALUES ('Synthetic Direct', 'MN', '00011', 'direct@synthetic.test', $1) RETURNING id, utm_campaign AS kept", [code]),
      screening_lead: (code) =>
        admin.query<{ id: string; kept: string | null }>(
          `INSERT INTO screening_lead (practice_name, state, zip, contact_email, utm_campaign, consent_sha256, release_no, release_manifest_sha256, engine_version, labels_version,
                                       screened_at, row_count, claim_lines, observed_cents, anomaly_rows, left_out_rows, expires_at)
           VALUES ('Synthetic Direct', 'MN', '00011', $2, $1, $3, 900001, $4, 'phase-two/1', screening_labels_version(), now(), 1, 11, 100, 0, 0, now() + interval '1 day')
           RETURNING id, utm_campaign AS kept`,
          [code, `direct.${letters()}@synthetic.test`, hex('1'), release],
        ),
      prospect_request: (code) =>
        admin.query<{ id: string; kept: string | null }>(
          `INSERT INTO prospect_request (contact_name, contact_email, organization_name, locations, payers, billing_arrangement, utm_campaign)
           VALUES ('SYNTHETIC DIRECT', 'direct@synthetic.test', $2, 1, ARRAY['SYNTHETIC PAYER'], 'mixed', $1) RETURNING id, utm_campaign AS kept`,
          [code, `SYNTHETIC DIRECT ${letters()}`],
        ),
      screening_outcome: (code) =>
        admin.query<{ id: string; kept: string | null }>(
          `INSERT INTO screening_outcome (screened_month, stage, channel, campaign, row_band, refusal_codes)
           VALUES (to_char(now(), 'YYYY-MM'), 'refused', 'none', $1, '1_100', '{no_rows}') RETURNING id, campaign AS kept`,
          [code],
        ),
    };
    const kept: Record<string, Record<string, string>> = {};
    for (const [table, insert] of Object.entries(inserts)) {
      const byGiven: Record<string, string> = {};
      kept[table] = byGiven;
      for (const [given, expected] of [
        [LISTED, LISTED],
        [NAMED, 'other'],
        ['other', 'other'],
        [null, null],
      ] as const) {
        const { rows } = await insert(given);
        expect(rows[0]?.kept, `${table} ${String(given)}`).toBe(expected);
        byGiven[String(given)] = rows[0]?.id ?? '';
      }
      // A code of the wrong shape is refused by the column's rule, and the error carries no value.
      for (const malformed of ['jane.doe@synthetic.test', 'Jane Doe', 'a'.repeat(65)]) {
        const refusal = await insert(malformed).then(
          () => undefined,
          (error: unknown) => error as pg.DatabaseError,
        );
        expect(refusal, `${table} ${malformed}`).toMatchObject({ code: '23514', constraint: table === 'screening_outcome' ? 'screening_outcome_campaign' : `${table}_utm_campaign` });
        expect(`${refusal?.message ?? ''} ${refusal?.detail ?? ''}`, `${table} ${malformed}`).not.toContain(malformed);
      }
    }
    expect(await campaignsHolding(NAMED)).toEqual([]);
    // An update that names the column meets the table's guard: a listed code never changes, and a kept summary that
    // kept other keeps other, the code given rewritten before its guard compares it.
    const ids = (table: string) => kept[table] ?? {};
    await expect(admin.query('UPDATE screening_prospect SET utm_campaign = $1 WHERE id = $2', [NAMED, ids('screening_prospect')[LISTED]])).rejects.toMatchObject({ code: 'P0001' });
    await expect(admin.query('UPDATE screening_lead SET utm_campaign = $1 WHERE id = $2', [NAMED, ids('screening_lead')[LISTED]])).rejects.toMatchObject({ code: '23514', constraint: 'screening_lead_fixed' });
    await expect(admin.query('UPDATE prospect_request SET utm_campaign = $1 WHERE id = $2', [NAMED, ids('prospect_request')[LISTED]])).rejects.toMatchObject({ code: '23514' });
    await expect(admin.query('UPDATE screening_outcome SET campaign = $1 WHERE id = $2', [NAMED, ids('screening_outcome')[LISTED]])).rejects.toMatchObject({ code: '23514', constraint: 'screening_outcome_sealed' });
    await admin.query('UPDATE screening_lead SET utm_campaign = $1 WHERE id = $2', [NAMED, ids('screening_lead')[NAMED]]);
    expect(await campaignsHolding(NAMED)).toEqual([]);
    // The application role writes none of the four directly: no insert, and no update of the column it is not granted.
    await expect(
      as(APP_ROLE, "INSERT INTO prospect_request (contact_name, contact_email, organization_name, locations, payers, billing_arrangement, utm_campaign) VALUES ('S', 's@synthetic.test', 'O', 1, ARRAY['P'], 'mixed', $1)", [NAMED], administrator),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(as(APP_ROLE, 'UPDATE prospect_request SET utm_campaign = $1 WHERE id = $2', [NAMED, ids('prospect_request')[LISTED]], administrator)).rejects.toMatchObject({ code: '42501' });
    await expect(as(APP_ROLE, "INSERT INTO marketing_campaign (code, label, added_by) VALUES ($1, 'x', $2)", [NAMED, administrator], administrator)).rejects.toMatchObject({ code: '42501' });
    // Its review, a direct update of the columns it is granted, still works with the trigger in place and needs no read of the list.
    for (const id of [ids('prospect_request')[LISTED], ids('prospect_request')[NAMED]]) {
      expect(await as(APP_ROLE, "UPDATE prospect_request SET status = 'contacted', reviewed_by = $1 WHERE id = $2 RETURNING utm_campaign", [administrator, id], administrator)).toHaveLength(1);
    }
    expect((await admin.query('SELECT utm_campaign, status FROM prospect_request WHERE id = ANY ($1) ORDER BY utm_campaign', [[ids('prospect_request')[LISTED], ids('prospect_request')[NAMED]]])).rows).toEqual([
      { utm_campaign: 'other', status: 'contacted' },
      { utm_campaign: LISTED, status: 'contacted' },
    ]);
  });

  // 23: a row trigger (1), before (2), on insert (4) and on update (16), here of the one column.
  it('puts the trigger on every column that keeps a campaign code, before each insert and each update naming it', async () => {
    const { rows } = await admin.query<{ table_name: string; column_name: string; trigger: string | null }>(
      `SELECT c.relname AS table_name, a.attname AS column_name,
              (SELECT string_agg(t.tgname || ' ' || p.proname, ', ') FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
                WHERE t.tgrelid = c.oid AND NOT t.tgisinternal AND t.tgenabled = 'O' AND (t.tgtype::integer & 23) = 23
                  AND (SELECT array_agg(k) FROM unnest(t.tgattr::int2[]) k) = ARRAY[a.attnum] AND p.proname IN ('marketing_campaign_listed_only', 'screening_outcome_campaign_listed')) AS trigger
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
          AND (a.attname = 'utm_campaign' OR (c.relname = 'screening_outcome' AND a.attname = 'campaign'))
        ORDER BY 1`,
    );
    expect(rows).toEqual([
      { table_name: 'prospect_request', column_name: 'utm_campaign', trigger: 'prospect_request_campaign_listed marketing_campaign_listed_only' },
      { table_name: 'screening_lead', column_name: 'utm_campaign', trigger: 'screening_lead_campaign_listed marketing_campaign_listed_only' },
      { table_name: 'screening_outcome', column_name: 'campaign', trigger: 'screening_outcome_campaign_listed screening_outcome_campaign_listed' },
      { table_name: 'screening_prospect', column_name: 'utm_campaign', trigger: 'screening_prospect_campaign_listed marketing_campaign_listed_only' },
    ]);
  });
});

describe('audit #53: the release’s keyed records are read by the run’s own keys, under the pinned release alone', () => {
  it('reads nothing for a run not being priced, or whose release’s manifest changed or was withdrawn, and takes no codes from a caller', async () => {
    const runId = await submit();
    // Queued, not pricing.
    for (const fn of ['operator_screening_release', 'operator_screening_run_keys', 'operator_screening_run_records']) {
      expect(await as(OPERATOR_ROLE, `SELECT * FROM ${fn}($1)`, [runId]), fn).toEqual([]);
    }
    await as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_claim($1)', [runId]);
    expect(await as(OPERATOR_ROLE, 'SELECT codes FROM operator_screening_run_keys($1)', [runId])).toEqual([{ codes: ['97110'] }]);
    // Each function takes the run alone: no signature takes codes.
    const signatures = await admin.query<{ name: string }>(
      "SELECT p.oid::regprocedure::text AS name FROM pg_proc p WHERE p.proname IN ('operator_screening_release', 'operator_screening_run_keys', 'operator_screening_run_records') ORDER BY 1",
    );
    expect(signatures.rows.map((row) => row.name)).toEqual(['operator_screening_release(uuid)', 'operator_screening_run_keys(uuid)', 'operator_screening_run_records(uuid)']);
    // A changed manifest, or a withdrawal, read in a transaction rolled back: nothing.
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      await client.query('UPDATE screening_run SET release_manifest_sha256 = $2 WHERE id = $1', [runId, hex('9')]);
      await client.query('SET LOCAL session_replication_role = origin');
      await client.query(`SET LOCAL ROLE ${OPERATOR_ROLE}`);
      for (const fn of ['operator_screening_release', 'operator_screening_run_keys', 'operator_screening_run_records']) {
        expect((await client.query(`SELECT * FROM ${fn}($1)`, [runId])).rows, `${fn}, re-manifested`).toEqual([]);
      }
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      await client.query('INSERT INTO rule_release (release_no, manifest_sha256) VALUES (899999, $1)', [hex('8')]);
      await client.query("INSERT INTO rule_release_withdrawal (release_no, reinstated_release_no, reason) VALUES (900001, 899999, 'SYNTHETIC withdrawal for a test')");
      await client.query('SET LOCAL session_replication_role = origin');
      await client.query(`SET LOCAL ROLE ${OPERATOR_ROLE}`);
      for (const fn of ['operator_screening_release', 'operator_screening_run_keys', 'operator_screening_run_records']) {
        expect((await client.query(`SELECT * FROM ${fn}($1)`, [runId])).rows, `${fn}, withdrawn`).toEqual([]);
      }
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('PR 6b: the ZIP+4 and the content a release has loaded (migration 20261105090000; SCR-15, SCR-16)', () => {
  // Each release published here is the release in force from then on, so these run last, in this order.
  it('asks for the ZIP+4 only where the ZIP needs it, keeps it only then, refuses one the ZIP+4 list does not hold, and hands it to the pricing', async () => {
    await publishSyntheticRelease(900011, { plusFour: true });
    expect((await as<{ release_no: number }>(APP_ROLE, 'SELECT release_no FROM screening_status()'))[0]?.release_no).toBe(900011);
    await expect(submit({ zip: '00012' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_zip_plus_four' });
    await expect(submit({ zip: '00012', plusFour: '9100' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_zip_plus_four_unknown' });
    await expect(submit({ zip: '00012', plusFour: '12a4' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_zip_plus_four_unknown' });
    const needed = await submit({ zip: '00012', plusFour: '5000' });
    const unneeded = await submit({ zip: '00011', plusFour: '5000' });
    const kept = await admin.query<{ id: string; zip: string; zip_plus_four: string | null }>(
      'SELECT r.id, p.zip, p.zip_plus_four FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE r.id = ANY ($1) ORDER BY p.zip',
      [[needed, unneeded]],
    );
    expect(kept.rows).toEqual([
      { id: unneeded, zip: '00011', zip_plus_four: null },
      { id: needed, zip: '00012', zip_plus_four: '5000' },
    ]);
    // The claim hands the ZIP+4 to the pricing context; the keyed read holds the ZIP's plus-four record, never the shared read.
    expect(await as(OPERATOR_ROLE, 'SELECT zip, zip_plus_four, release_no FROM operator_screening_claim($1)', [needed])).toEqual([{ zip: '00012', zip_plus_four: '5000', release_no: 900011 }]);
    const records = await as<{ record_type: string; key: object; sha256: string }>(OPERATOR_ROLE, 'SELECT record_type, key, sha256 FROM operator_screening_run_records($1)', [needed]);
    expect(records.filter((row) => row.record_type.startsWith('locality_map'))).toEqual([
      { record_type: 'locality_map', key: { zip: '00012' }, sha256: hex('c') },
      { record_type: 'locality_map_plus_four', key: { zip: '00012' }, sha256: hex('d') },
    ]);
    expect((await as<{ record_type: string }>(OPERATOR_ROLE, 'SELECT record_type FROM operator_screening_release($1)', [needed])).map((row) => row.record_type)).toEqual(['conversion_factor']);
    // A five-digit run's keyed read names its own ZIP alone: 00011 has no plus-four record, so none is read.
    expect(await as(OPERATOR_ROLE, 'SELECT zip, zip_plus_four FROM operator_screening_claim($1)', [unneeded])).toEqual([{ zip: '00011', zip_plus_four: null }]);
    const fiveDigit = await as<{ record_type: string }>(OPERATOR_ROLE, 'SELECT record_type FROM operator_screening_run_records($1)', [unneeded]);
    expect(fiveDigit.filter((row) => row.record_type.startsWith('locality_map'))).toEqual([{ record_type: 'locality_map' }]);
  });

  it('spans each silently read content by its records’ windows, and refuses a Medicare row outside them: no MUE at all, MUE that ends a quarter early, no per-code reduction', async () => {
    const spans = async (release: number) =>
      Object.fromEntries((await as<{ content: string; loaded: string }>(APP_ROLE, 'SELECT content, loaded::text FROM rule_release_content_span($1)', [release])).map((row) => [row.content, row.loaded]));
    const medicare = (band: string) => submit({ rows: [['97110', 'GP', 1, '11', 'medicare_ffs', band, 4_000n, 11]] });
    const accepted = /^[0-9a-f-]{36}$/;
    expect(await spans(900011)).toEqual({ mppr_code: '{[2026-01-01,2027-01-01)}', mppr_general: '{[2026-01-01,2027-01-01)}', ncci_mue: '{[2026-01-01,2027-01-01)}' });
    // No ncci_mue record at all: an empty span, never every date, so no quarter is inside it.
    await publishSyntheticRelease(900012, { mue: 'none' });
    expect(await spans(900012)).toEqual({ mppr_code: '{[2026-01-01,2027-01-01)}', mppr_general: '{[2026-01-01,2027-01-01)}', ncci_mue: '{}' });
    await expect(medicare('2026-Q2')).rejects.toMatchObject({ code: '23514', constraint: 'screening_band_outside_content' });
    expect(await submit({ rows: [['97110', 'GP', 1, '11', 'commercial', '2026-Q2', 4_000n, 11]] })).toMatch(accepted);
    // MUE that ends 2026-09-30: the fourth quarter is outside, the third inside.
    await publishSyntheticRelease(900013, { mue: { effectiveTo: '2026-09-30' } });
    expect((await spans(900013)).ncci_mue).toBe('{[2026-01-01,2026-10-01)}');
    await expect(medicare('2026-Q4')).rejects.toMatchObject({ constraint: 'screening_band_outside_content' });
    expect(await medicare('2026-Q3')).toMatch(accepted);
    // No per-code reduction record: every Medicare quarter is outside.
    await publishSyntheticRelease(900014, { perCodeMppr: false });
    expect((await spans(900014)).mppr_code).toBe('{}');
    for (const band of ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']) {
      await expect(medicare(band), band).rejects.toMatchObject({ constraint: 'screening_band_outside_content' });
    }
    await expect(submit({ rows: [['97110', 'GP', 1, '11', 'ma_noncontracted', '2026-Q1', 4_000n, 11]] })).rejects.toMatchObject({ constraint: 'screening_band_outside_content' });
    expect(await submit({ rows: [['97110', 'GP', 1, '11', 'ma_contracted', '2026-Q1', 4_000n, 11]] })).toMatch(accepted);
  });

  it('gives the quarter as its days, and nothing for what is not a quarter (no grant: only submit_screening reads it)', async () => {
    const days = async (band: string) => (await admin.query<{ days: string | null }>('SELECT screening_band_days($1)::text AS days', [band])).rows[0]?.days;
    expect(await days('2026-Q1')).toBe('[2026-01-01,2026-04-01)');
    expect(await days('2026-Q4')).toBe('[2026-10-01,2027-01-01)');
    expect(await days('2025-Q2')).toBe('[2025-04-01,2025-07-01)');
    for (const band of ['2026-Q5', '2026-01', '1999-Q1', '', '2026-Q1 ']) {
      expect(await days(band), band).toBeNull();
    }
    await expect(as(APP_ROLE, "SELECT screening_band_days('2026-Q1')")).rejects.toMatchObject({ code: '42501' });
    await expect(as(OPERATOR_ROLE, 'SELECT * FROM rule_release_content_span(900011)')).rejects.toMatchObject({ code: '42501' });
  });
});
