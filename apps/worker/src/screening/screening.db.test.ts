import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, addMembership, createMigratedDatabase, createOrganization, createUser, endPool } from '@tp/db/testing';
import { cents } from '@tp/money';
import { createLogger } from '@tp/observability';
import { syntheticRelease } from '@tp/pricing/testing';
import { loadRelease } from '@tp/rules/loader';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type MailMessage, type MailSender, MemoryMailSender } from '../mail/mail';
import { ScreeningPricer } from './adapter';
import { expireScreenings } from './expiry';
import { type ScreeningJobDependencies, forgetScreeningReleases, priceScreeningRun, sweepScreeningRuns } from './job';
import { SCREENING_TOKEN, screeningTokenHash } from './token';

/**
 * The screening jobs against a scratch database (test matrix SCR-02, pricing, and SCR-03, expiry; docs/adr/0062),
 * with SYNTHETIC release 900001 loaded and a split a contract specialist approved:
 *
 * - each priced row's figure is the engine's one-line amount times its count, in bigint, and its difference the
 *   figure less the allowed total; MA contracted and commercial rows count toward the dollars that cannot be priced
 *   without a contract; a ZIP whose locality needs its ZIP+4 leaves its rows unpriced as the engine says;
 * - the result's link goes by email alone; the token is never stored (its SHA-256 is), never logged, never in a job
 *   payload or an audit event;
 * - a run is priced once however often its job runs; a send that fails leaves the run to a later claim; a run out of
 *   attempts, or whose release is not there as pinned, fails and its contact is told;
 * - 30 days after its upload a screening is deleted with its rows, each an audit event, and its conversion stays.
 */

const RELEASE_DIR = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic/rules/release-synth-900001');
const ORIGIN = 'https://app.synthetic.test';
const SPLIT = { '11': 'non_facility', '22': 'facility' } as const;

let database: MigratedDatabase;
let owner: DatabaseClient;
let admin: DatabasePool;
let specialist: string;
let lines: Record<string, unknown>[];

type Row = readonly [code: string, modifiers: string, units: number, place: string, product: string, band: string, allowedCents: bigint, claims: number];

const ROWS: readonly Row[] = [
  ['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 10_000n, 5],
  ['97110', 'CQ GP', 1, '11', 'ma_noncontracted', '2026-Q2', 2_000n, 1],
  ['97140', 'GP', 1, '22', 'medicare_ffs', '2026-Q3', 900_000n, 300],
  ['97530', '', 3, '11', 'ma_contracted', '2026-Q1', 3_000n, 2],
  ['97112', '', 1, '11', 'commercial', '2026-Q3', 4_000n, 3],
  ['97116', 'GP', 1, '11', 'medicaid', '2026-Q1', 500n, 1],
  ['97035', '', 1, '11', 'other', '2026-Q1', 600n, 1],
  ['97110', 'GP', 8, '11', 'medicare_ffs', '2026-Q1', 1n, 1],
  ['97110', 'GP', 1, '12', 'ma_noncontracted', '2026-Q4', 1n, 1],
];

/** As the application role in a transaction (with an actor when named), as the screening routes run. */
async function asApp<T extends Record<string, unknown>>(sql: string, values: unknown[] = [], actorId: string | null = null): Promise<T[]> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE tp_app');
    await client.query("SELECT set_config('app.actor_id', $1, true)", [actorId ?? '']);
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

async function submit(options: { readonly rows?: readonly Row[]; readonly zip?: string; readonly zipPlusFour?: string | null; readonly email?: string } = {}): Promise<string> {
  const rows = options.rows ?? ROWS;
  const [created] = await asApp<{ id: string }>('SELECT submit_screening($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) AS id', [
    'Synthetic Therapy Group',
    'MN',
    options.zip ?? '00011',
    options.zipPlusFour ?? null,
    options.email ?? `prospect.${randomUUID().slice(0, 8)}@synthetic.test`,
    createHash('sha256').update(randomUUID()).digest('hex'),
    rows.map((row) => row[0]),
    rows.map((row) => row[1]),
    rows.map((row) => row[2]),
    rows.map((row) => row[3]),
    rows.map((row) => row[4]),
    rows.map((row) => row[5]),
    rows.map((row) => row[6].toString()),
    rows.map((row) => row[7]),
    `test-${randomUUID()}`,
  ]);
  return created?.id ?? '';
}

function dependencies(mail: MailSender, overrides: Partial<ScreeningJobDependencies> = {}): ScreeningJobDependencies {
  return {
    operator: admin,
    mail,
    appOrigin: ORIGIN,
    logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }),
    jobId: randomUUID(),
    ...overrides,
  };
}

/** As the superuser with triggers off for the transaction: moves times a test cannot wait for. */
async function rewind(sql: string, values: unknown[]): Promise<void> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    await client.query(sql, values);
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}

/** Moves a screening's dates back by `days`, prospect, upload and run together. */
async function age(runId: string, days: number): Promise<void> {
  await rewind(
    `WITH target AS (SELECT r.id AS run_id, u.id AS upload_id, u.prospect_id FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE r.id = $1),
          a AS (UPDATE screening_prospect p SET created_at = p.created_at - $2::interval, expires_at = p.expires_at - $2::interval FROM target WHERE p.id = target.prospect_id),
          b AS (UPDATE screening_upload u SET created_at = u.created_at - $2::interval, expires_at = u.expires_at - $2::interval FROM target WHERE u.id = target.upload_id)
     UPDATE screening_run r SET created_at = r.created_at - $2::interval, expires_at = r.expires_at - $2::interval FROM target WHERE r.id = target.run_id`,
    [runId, `${String(days)} days`],
  );
}

function tokenOf(message: MailMessage | undefined): string {
  const link = message?.links[0] ?? '';
  return new URL(link).pathname.split('/').at(-1) ?? '';
}

interface ResultRow {
  readonly row_no: number;
  readonly procedure_code: string;
  readonly modifiers: string[];
  readonly units: number;
  readonly place_of_service: string;
  readonly payer_product: string;
  readonly service_band: string;
  readonly claim_count: number;
  readonly observed_allowed_cents: string;
  readonly disposition: string;
  readonly expected_line_cents: string | null;
  readonly expected_line_unrounded: string | null;
  readonly expected_cents: string | null;
  readonly difference_cents: string | null;
  readonly unpriced_reason: string | null;
  readonly unpriced_detail: string | null;
  readonly trace_sha256: string | null;
}

async function results(runId: string): Promise<ResultRow[]> {
  return (
    await owner.query<ResultRow>(
      `SELECT row_no, procedure_code, modifiers, units, place_of_service, payer_product, service_band, claim_count, observed_allowed_cents::text AS observed_allowed_cents, disposition,
              expected_line_cents::text AS expected_line_cents, expected_line_unrounded::text AS expected_line_unrounded, expected_cents::text AS expected_cents,
              difference_cents::text AS difference_cents, unpriced_reason, unpriced_detail, trace_sha256
         FROM screening_result WHERE run_id = $1 ORDER BY row_no`,
      [runId],
    )
  ).rows;
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  await loadRelease(owner, RELEASE_DIR, { release: 900001, allowSyntheticFixtureForTests: true });
  admin = openPool(database.url, 4);
  const internal = await createOrganization(owner, 'internal');
  specialist = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, specialist, 'contract_specialist');
  await asApp('SELECT console_approve_screening_split($1)', [JSON.stringify(SPLIT)], specialist);
}, 60_000);

afterAll(async () => {
  await endPool(admin);
  await owner.end();
  await database.drop();
});

beforeEach(() => {
  lines = [];
  forgetScreeningReleases();
});

describe('SCR-02: the screening prices each row with the unchanged engine and multiplies by the count outside it', () => {
  it('gives each priced row the engine’s one-line amount times its claim count in bigint, and keeps the other products out', async () => {
    const runId = await submit();
    const mail = new MemoryMailSender();
    expect(await priceScreeningRun(dependencies(mail), runId)).toBe('complete');
    const stored = await results(runId);
    // The engine's own figures, from the release files, for the same one-line claims.
    const pricer = new ScreeningPricer({ release: syntheticRelease(900001), zip: '00011', placeOfServiceSettings: SPLIT, asOf: new Date().toISOString().slice(0, 10) });
    for (const row of stored) {
      if (row.payer_product === 'ma_contracted' || row.payer_product === 'commercial') {
        expect(row, `row ${String(row.row_no)}`).toMatchObject({ disposition: 'contract_required', expected_cents: null, trace_sha256: null });
        continue;
      }
      if (row.payer_product === 'medicaid' || row.payer_product === 'other') {
        expect(row, `row ${String(row.row_no)}`).toMatchObject({ disposition: 'not_screened', expected_cents: null, trace_sha256: null });
        continue;
      }
      const outcome = pricer.outcome({
        rowNo: row.row_no,
        procedureCode: row.procedure_code,
        modifiers: row.modifiers,
        units: row.units,
        placeOfService: row.place_of_service,
        payerProduct: row.payer_product as 'medicare_ffs' | 'ma_noncontracted',
        serviceBand: row.service_band,
        claimCount: row.claim_count,
        observedAllowedCents: cents(BigInt(row.observed_allowed_cents)),
      });
      expect(row.disposition, `row ${String(row.row_no)}`).toBe(outcome.disposition);
      expect(row.trace_sha256, `row ${String(row.row_no)}`).toMatch(/^[0-9a-f]{64}$/);
      if (outcome.disposition === 'priced') {
        expect(row.expected_line_cents).toBe(outcome.expectedLineCents.toString());
        expect(row.expected_line_unrounded).toBe(outcome.expectedLineUnrounded);
        expect(BigInt(row.expected_cents ?? '')).toBe(outcome.expectedLineCents * BigInt(row.claim_count));
        expect(BigInt(row.difference_cents ?? '')).toBe(BigInt(row.expected_cents ?? '') - BigInt(row.observed_allowed_cents));
      } else if (outcome.disposition === 'unpriced') {
        expect(row).toMatchObject({ unpriced_reason: outcome.reason, unpriced_detail: outcome.detail, expected_cents: null });
      }
    }
    expect(stored.map((row) => row.disposition)).toEqual(['priced', 'priced', 'priced', 'contract_required', 'contract_required', 'not_screened', 'not_screened', 'unpriced', 'unpriced']);
    expect(stored[7]).toMatchObject({ unpriced_reason: 'MUE_EXCEEDED' });
    expect(stored[8]).toMatchObject({ unpriced_reason: 'ENGINE_ERROR', unpriced_detail: 'place_of_service_unmapped' });
    // The sums the result shows are the stored rows' bigint sums.
    const token = tokenOf(mail.sent[0]);
    const [summary] = await asApp<Record<string, string | number | boolean>>('SELECT * FROM screening_result_summary($1)', [screeningTokenHash(token)]);
    const priced = stored.filter((row) => row.disposition === 'priced');
    const sum = (list: readonly ResultRow[], pick: (row: ResultRow) => string | null) => list.reduce((total, row) => total + BigInt(pick(row) ?? '0'), 0n);
    expect(BigInt(summary?.expected_cents as string)).toBe(sum(priced, (row) => row.expected_cents));
    expect(BigInt(summary?.difference_cents as string)).toBe(sum(priced, (row) => row.difference_cents));
    // The dollars that cannot be priced without a contract: the MA contracted and commercial rows' allowed totals.
    expect(summary).toMatchObject({ contract_rows: 2, contract_observed_cents: '7000', not_screened_rows: 2, unpriced_rows: 2, priced_rows: 3, rows: 9 });
    const groups = await asApp<{ payer_product: string; procedure_code: string; anomaly: boolean; difference_cents: string; claim_lines: string }>('SELECT * FROM screening_result_groups($1)', [
      screeningTokenHash(token),
    ]);
    for (const group of groups) {
      const difference = BigInt(group.difference_cents);
      expect(group.anomaly).toBe(difference > 0n && difference >= 500n * BigInt(group.claim_lines));
    }
  });

  it('asks for nothing it cannot use: a ZIP whose locality needs its ZIP+4 leaves its rows unpriced as the engine says', async () => {
    const runId = await submit({ zip: '00012', zipPlusFour: '0001', rows: [ROWS[0] as Row] });
    expect(await priceScreeningRun(dependencies(new MemoryMailSender()), runId)).toBe('complete');
    expect(await results(runId)).toMatchObject([{ disposition: 'unpriced', unpriced_reason: 'ENGINE_ERROR', unpriced_detail: 'locality_needs_zip_plus_four' }]);
  });
});

describe('the result link', () => {
  it('goes by email alone: the token is stored only as its hash, and is in no log, payload or audit event', async () => {
    const runId = await submit({ email: 'prospect.link@synthetic.test' });
    const mail = new MemoryMailSender();
    const deps = dependencies(mail);
    expect(await priceScreeningRun(deps, runId)).toBe('complete');
    expect(mail.sent).toHaveLength(1);
    const message = mail.sent[0];
    expect(message).toMatchObject({ to: ['prospect.link@synthetic.test'], variant: 'prospect' });
    const token = tokenOf(message);
    expect(token).toMatch(SCREENING_TOKEN);
    expect(message?.links).toEqual([`${ORIGIN}/screening/results/${token}`]);
    // No figure, date or code in the email.
    expect(message?.body).not.toMatch(/\$|\d{4}-\d{2}-\d{2}|97110/);
    const stored = await owner.query<{ hash: string }>('SELECT result_token_sha256 AS hash FROM screening_run WHERE id = $1', [runId]);
    expect(stored.rows).toEqual([{ hash: screeningTokenHash(token) }]);
    // Nowhere in the database: every text-like column of every table in public, and the job queue's schema.
    const columns = await owner.query<{ table_schema: string; table_name: string; column_name: string }>(
      `SELECT table_schema, table_name, column_name FROM information_schema.columns
        WHERE table_schema IN ('public', 'pgboss') AND data_type IN ('text', 'jsonb', 'json', 'ARRAY', 'character varying')`,
    );
    for (const column of columns.rows) {
      const found = await owner.query(`SELECT 1 FROM "${column.table_schema}"."${column.table_name}" WHERE "${column.column_name}"::text LIKE $1 LIMIT 1`, [`%${token}%`]);
      expect(found.rows, `${column.table_schema}.${column.table_name}.${column.column_name}`).toEqual([]);
    }
    expect(JSON.stringify(lines)).not.toContain(token);
    expect(JSON.stringify(lines)).not.toContain('prospect.link@synthetic.test');
    expect(lines.every((line) => Object.keys(line).every((key) => ['level', 'msg', 'time', 'job_id', 'screening_run_id', 'error_code'].includes(key)))).toBe(true);
    const audit = await owner.query<{ action: string; request_id: string }>('SELECT action, request_id FROM audit_event WHERE object_id = $1 ORDER BY at', [runId]);
    expect(audit.rows.map((row) => row.action)).toEqual(['screening_submitted', 'screening_completed']);
    expect(audit.rows[1]?.request_id).toBe(deps.jobId);
  });
});

describe('a run is priced once, retried after a failed send, and failed when it cannot be priced', () => {
  it('prices a run once however often its job runs, at once or one after another', async () => {
    const runId = await submit();
    const mail = new MemoryMailSender();
    const outcomes = await Promise.all([priceScreeningRun(dependencies(mail), runId), priceScreeningRun(dependencies(mail), runId)]);
    expect(outcomes.sort()).toEqual(['complete', 'not_claimed']);
    expect(await priceScreeningRun(dependencies(mail), runId)).toBe('not_claimed');
    expect(await sweepScreeningRuns(dependencies(mail), { minQueuedAgeSeconds: 0 })).toEqual({ complete: 0, failed: 0, skipped: 0 });
    expect(mail.sent.filter((message) => message.subject === 'Your screening is ready')).toHaveLength(1);
  });

  it('leaves a run whose email failed to a later claim, which sends it once the pricing is stale', async () => {
    const runId = await submit();
    const refusing: MailSender = { send: () => Promise.reject(new Error('SYNTHETIC mail outage')) };
    await expect(priceScreeningRun(dependencies(refusing), runId)).rejects.toThrow('SYNTHETIC mail outage');
    const after = await owner.query<{ status: string; attempts: number; token: string | null }>('SELECT status, attempts, result_token_sha256 AS token FROM screening_run WHERE id = $1', [runId]);
    expect(after.rows).toEqual([{ status: 'pricing', attempts: 1, token: null }]);
    expect((await results(runId)).filter((row) => row.disposition === 'pending')).toEqual([]);
    // A retry while the pricing is fresh claims nothing; once it is stale the sweep claims it again and sends.
    const mail = new MemoryMailSender();
    expect(await priceScreeningRun(dependencies(mail), runId)).toBe('not_claimed');
    await rewind("UPDATE screening_run SET started_at = started_at - interval '11 minutes' WHERE id = $1", [runId]);
    expect(await sweepScreeningRuns(dependencies(mail), { minQueuedAgeSeconds: 0 })).toEqual({ complete: 1, failed: 0, skipped: 0 });
    expect(mail.sent).toHaveLength(1);
    expect((await owner.query('SELECT status, attempts FROM screening_run WHERE id = $1', [runId])).rows).toEqual([{ status: 'complete', attempts: 2 }]);
  });

  it('fails a run out of attempts, and one whose release is not there as pinned, and tells the contact with a link to start again', async () => {
    const exhausted = await submit({ email: 'prospect.exhausted@synthetic.test' });
    const unavailable = await submit({ email: 'prospect.unavailable@synthetic.test' });
    await rewind("UPDATE screening_run SET status = 'pricing', attempts = 3, started_at = now() - interval '11 minutes' WHERE id = $1", [exhausted]);
    await rewind('UPDATE screening_run SET release_manifest_sha256 = $2 WHERE id = $1', [unavailable, '0'.repeat(64)]);
    const mail = new MemoryMailSender();
    const swept = await sweepScreeningRuns(dependencies(mail), { minQueuedAgeSeconds: 0 });
    expect(swept.failed).toBe(2);
    const runs = await owner.query<{ id: string; status: string; failure_code: string }>('SELECT id, status, failure_code FROM screening_run WHERE id = ANY ($1) ORDER BY failure_code', [[exhausted, unavailable]]);
    expect(runs.rows).toEqual([
      { id: exhausted, status: 'failed', failure_code: 'PRICING_ATTEMPTS_EXHAUSTED' },
      { id: unavailable, status: 'failed', failure_code: 'RELEASE_UNAVAILABLE' },
    ]);
    expect(mail.sent.map((message) => [message.to[0], message.subject, message.links])).toEqual(
      expect.arrayContaining([
        ['prospect.exhausted@synthetic.test', 'Your screening could not be completed', [`${ORIGIN}/screening`]],
        ['prospect.unavailable@synthetic.test', 'Your screening could not be completed', [`${ORIGIN}/screening`]],
      ]),
    );
    const audit = await owner.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'screening_failed' AND object_id = ANY ($1)", [[exhausted, unavailable]]);
    expect(audit.rows).toEqual([{ n: 2 }]);
    expect(lines.filter((line) => line.error_code !== undefined).map((line) => line.error_code).sort()).toEqual(['PRICING_ATTEMPTS_EXHAUSTED', 'RELEASE_UNAVAILABLE']);
  });
});

describe('SCR-03: a screening expires 30 days after its upload', () => {
  it('deletes the prospect, upload, run and rows together, each an audit event, and keeps a conversion’s request and event', async () => {
    const runId = await submit();
    const mail = new MemoryMailSender();
    await priceScreeningRun(dependencies(mail), runId);
    const hash = screeningTokenHash(tokenOf(mail.sent[0]));
    const [request] = await asApp<{ id: string }>('SELECT convert_screening($1, $2, $3, $4, $5, $6) AS id', [hash, 'SYNTHETIC CONTACT', 2, ['SYNTHETIC PAYER'], 'in_house', `test-${randomUUID()}`]);
    const { prospect_id: prospectId } = (await owner.query<{ prospect_id: string }>('SELECT u.prospect_id FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE r.id = $1', [runId])).rows[0] ?? {
      prospect_id: '',
    };
    // A day short: kept, and readable.
    await age(runId, 29);
    expect(await expireScreenings({ operator: admin, jobId: randomUUID() })).toMatchObject({ prospects: 0 });
    expect(await asApp('SELECT * FROM screening_result_summary($1)', [hash])).toHaveLength(1);
    // At 30 days the reads refuse it before the job has run, and the job deletes it.
    await age(runId, 1);
    expect(await asApp('SELECT * FROM screening_result_summary($1)', [hash])).toEqual([]);
    const jobId = randomUUID();
    const expired = await expireScreenings({ operator: admin, jobId });
    expect(expired.prospects).toBeGreaterThanOrEqual(1);
    expect(expired.runs).toBeGreaterThanOrEqual(1);
    expect((await owner.query('SELECT count(*)::int AS n FROM screening_prospect WHERE id = $1', [prospectId])).rows).toEqual([{ n: 0 }]);
    expect((await owner.query('SELECT count(*)::int AS n FROM screening_run WHERE id = $1', [runId])).rows).toEqual([{ n: 0 }]);
    expect((await owner.query('SELECT count(*)::int AS n FROM screening_result WHERE run_id = $1', [runId])).rows).toEqual([{ n: 0 }]);
    expect((await owner.query("SELECT request_id FROM audit_event WHERE action = 'screening_expired' AND object_id = $1", [prospectId])).rows).toEqual([{ request_id: jobId }]);
    expect((await owner.query("SELECT action FROM audit_event WHERE action = 'screening_converted' AND object_id = $1", [request?.id])).rows).toHaveLength(1);
    expect((await owner.query('SELECT count(*)::int AS n FROM prospect_request WHERE id = $1', [request?.id])).rows).toEqual([{ n: 1 }]);
    // Run again, it finds nothing more.
    expect(await expireScreenings({ operator: admin, jobId: randomUUID() })).toEqual({ prospects: 0, runs: 0 });
  });
});
