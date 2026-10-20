import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, addMembership, createMigratedDatabase, createOrganization, createUser, endPool } from '@tp/db/testing';
import { cents } from '@tp/money';
import { createLogger } from '@tp/observability';
import { price } from '@tp/pricing';
import { SYNTHETIC_PLACES, readRuleRelease, syntheticRelease } from '@tp/pricing/testing';
import { loadRelease, withdrawRelease } from '@tp/rules/loader';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type MailMessage, type MailSender, MemoryMailSender } from '../mail/mail';
import { ScreeningPricer, beforeSequestration, releaseChangeDays, screeningClaim } from './adapter';
import { expireScreenings } from './expiry';
import { type ScreeningJobDependencies, forgetScreeningReleases, priceScreeningRun, sweepScreeningRuns } from './job';
import { SCREENING_TOKEN, screeningTokenHash } from './token';

/**
 * The screening jobs against a scratch database (test matrix SCR-02, pricing, and SCR-03, expiry; docs/adr/0062),
 * with SYNTHETIC release 900001 loaded and a split a contract specialist approved:
 *
 * - each priced row's figure is the engine's one-line amount before sequestration (read from its trace) times its
 *   count, in bigint, and its difference the figure less the allowed total; MA contracted and commercial rows count
 *   toward the dollars that cannot be priced without a contract; a ZIP whose locality needs its ZIP+4, which the
 *   engine cannot take, is refused (the owner's ruling of 2026-10-18);
 * - a code in the reduction across a visit's codes has two figures, the engine's priced alone and priced as a later
 *   code of a visit (the owner's ruling of 2026-10-18): a row between them is within the range of the reduction
 *   across codes, never an anomaly; a row more than $5 a claim line below the fully reduced figure is one; a code
 *   outside the reduction keeps one figure; a row allowed in full at its figure shows no difference; PRD 11's worked
 *   example (golden G01) paid exactly as one visit shows no anomaly;
 * - the result's link goes by email alone; the token is never stored (its SHA-256 is), never logged, never in a job
 *   payload or an audit event;
 * - a run is priced once however often its job runs; a send that fails leaves the run to a later claim; one contact
 *   address the mail service refuses holds up no other run; a run out of attempts, or whose release is not there as
 *   pinned or has been withdrawn, fails and its contact is told; a result under a withdrawn release says so and can
 *   still be converted to an audit request (the owner's ruling of 2026-10-18);
 * - 30 days after its upload a screening is deleted with its rows, each an audit event, and its conversion stays.
 */

const RELEASE_DIR = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic/rules/release-synth-900001');
const WITHDRAWN_RELEASE_DIR = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic/rules/release-synth-900004');
const ORIGIN = 'https://app.synthetic.test';
const SPLIT = { '11': 'non_facility', '22': 'facility' } as const;

let database: MigratedDatabase;
let owner: DatabaseClient;
let admin: DatabasePool;
let specialist: string;
let lines: Record<string, unknown>[];

type Row = readonly [code: string, modifiers: string, units: number, place: string, product: string, band: string, allowedCents: bigint, claims: number];

/** Every row sums at least 11 claim lines (the CMS small-cell standard; a smaller row is never stored). */
const ROWS: readonly Row[] = [
  ['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 10_000n, 11],
  ['97110', 'CQ GP', 1, '11', 'ma_noncontracted', '2026-Q2', 2_000n, 11],
  ['97140', 'GP', 1, '22', 'medicare_ffs', '2026-Q3', 900_000n, 300],
  ['97530', '', 3, '11', 'ma_contracted', '2026-Q1', 3_000n, 12],
  ['97112', '', 1, '11', 'commercial', '2026-Q3', 4_000n, 13],
  ['97116', 'GP', 1, '11', 'medicaid', '2026-Q1', 500n, 11],
  ['97035', '', 1, '11', 'other', '2026-Q1', 600n, 11],
  ['97110', 'GP', 8, '11', 'medicare_ffs', '2026-Q1', 11n, 11],
  ['97110', 'GP', 1, '12', 'ma_noncontracted', '2026-Q4', 11n, 11],
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

/**
 * A screening's practice name of its own (letters only), so that no test's screening replaces another's: a practice
 * keeps one accepted screening at a time.
 */
function practiceName(): string {
  const letters = randomUUID()
    .replace(/-/g, '')
    .slice(0, 10)
    .replace(/[0-9]/g, (digit) => 'ghijklmnop'.charAt(Number(digit)));
  return `Synthetic Therapy Group ${letters}`;
}

async function submit(options: { readonly rows?: readonly Row[]; readonly zip?: string; readonly email?: string; readonly practice?: string } = {}): Promise<string> {
  const rows = options.rows ?? ROWS;
  const [created] = await asApp<{ id: string }>('SELECT submit_screening($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) AS id', [
    options.practice ?? practiceName(),
    'MN',
    options.zip ?? '00011',
    options.email ?? `prospect.${randomUUID().slice(0, 8)}@synthetic.test`,
    rows.map((row) => row[0]),
    rows.map((row) => row[1]),
    rows.map((row) => row[2]),
    rows.map((row) => row[3]),
    rows.map((row) => row[4]),
    rows.map((row) => row[5]),
    rows.map((row) => row[6].toString()),
    rows.map((row) => row[7]),
    0,
    0,
    '0',
    // No attribution, consent or terms.
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
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
  readonly in_reduction_pool: boolean | null;
  readonly reduced_line_cents: string | null;
  readonly reduced_line_unrounded: string | null;
  readonly reduced_cents: string | null;
  readonly reduced_difference_cents: string | null;
  readonly reduced_trace_sha256: string | null;
  readonly trace_sha256: string | null;
}

async function results(runId: string): Promise<ResultRow[]> {
  return (
    await owner.query<ResultRow>(
      `SELECT row_no, procedure_code, modifiers, units, place_of_service, payer_product, service_band, claim_count, observed_allowed_cents::text AS observed_allowed_cents, disposition,
              expected_line_cents::text AS expected_line_cents, expected_line_unrounded::text AS expected_line_unrounded, expected_cents::text AS expected_cents,
              difference_cents::text AS difference_cents, unpriced_reason, unpriced_detail, in_reduction_pool, reduced_line_cents::text AS reduced_line_cents,
              reduced_line_unrounded::text AS reduced_line_unrounded, reduced_cents::text AS reduced_cents, reduced_difference_cents::text AS reduced_difference_cents,
              reduced_trace_sha256, trace_sha256
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
    const pricer = new ScreeningPricer({
      release: syntheticRelease(900001),
      changeDays: releaseChangeDays(readRuleRelease(RELEASE_DIR).records),
      zip: '00011',
      placeOfServiceSettings: SPLIT,
      asOf: new Date().toISOString().slice(0, 10),
    });
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
        expect(row.in_reduction_pool).toBe(outcome.inReductionPool);
        expect([row.reduced_line_cents, row.reduced_line_unrounded, row.reduced_cents, row.reduced_difference_cents, row.reduced_trace_sha256]).toEqual(
          outcome.reduced === null
            ? [null, null, null, null, null]
            : [outcome.reduced.lineCents.toString(), outcome.reduced.lineUnrounded, outcome.reduced.cents.toString(), outcome.reduced.differenceCents.toString(), outcome.reduced.traceSha256],
        );
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
    // The lowest figures: the fully reduced one for a pooled row, the one figure for the others.
    expect(BigInt(summary?.reduced_cents as string)).toBe(sum(priced, (row) => row.reduced_cents ?? row.expected_cents));
    expect(BigInt(summary?.reduced_difference_cents as string)).toBe(sum(priced, (row) => row.reduced_difference_cents ?? row.difference_cents));
    expect(summary?.pooled_rows).toBe(priced.filter((row) => row.in_reduction_pool).length);
    // The dollars that cannot be priced without a contract: the MA contracted and commercial rows' allowed totals.
    expect(summary).toMatchObject({ contract_rows: 2, contract_observed_cents: '7000', not_screened_rows: 2, unpriced_rows: 2, priced_rows: 3, rows: 9 });
    const groups = await asApp<{
      payer_product: string;
      procedure_code: string;
      anomaly: boolean;
      anomaly_rows: number;
      in_reduction_pool: boolean;
      standing: string;
      expected_cents: string;
      reduced_cents: string | null;
      difference_cents: string;
      reduced_difference_cents: string | null;
    }>('SELECT * FROM screening_result_groups($1)', [screeningTokenHash(token)]);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      const rows = priced.filter((row) => row.payer_product === group.payer_product && row.procedure_code === group.procedure_code);
      expect(BigInt(group.expected_cents)).toBe(sum(rows, (row) => row.expected_cents));
      expect(group.reduced_cents === null ? null : BigInt(group.reduced_cents)).toBe(group.in_reduction_pool ? sum(rows, (row) => row.reduced_cents ?? row.expected_cents) : null);
      expect(group.anomaly).toBe(group.anomaly_rows > 0);
      expect(group.anomaly).toBe(group.standing === 'anomaly');
    }
  });

  it('refuses a ZIP whose locality needs its ZIP+4: the engine takes a five-digit ZIP alone, so nothing is asked for that it cannot use', async () => {
    await expect(submit({ zip: '00012', rows: [ROWS[0] as Row] })).rejects.toMatchObject({ code: '23514', constraint: 'screening_zip_plus_four' });
  });

  it('gives a pooled code two figures and calls a row an anomaly only more than $5 a claim line below the fully reduced one (G01’s 97110 and 97140, SYNTHETIC)', async () => {
    // G01's codes at POS 11, ZIP 00011, priced by the unchanged engine before sequestration (SYNTHETIC release
    // 900001): 97110 GP x2 is $36.84 a line before the reduction across codes and $31.45 fully reduced; 97140 GP is
    // $24.58 and $18.20; 97161 GP (an evaluation, outside the reduction) $59.17 alone.
    // Each row of 11 to 13 claim lines, the fewest a row may sum and a few more.
    const rows: readonly Row[] = [
      // Between its two figures, $34.00 a line: within the range of the reduction across codes.
      ['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 3_400n * 11n, 11],
      // $5.21 a line below its fully reduced figure: an anomaly.
      ['97140', 'GP', 1, '11', 'medicare_ffs', '2026-Q1', 1_299n * 12n, 12],
      // Allowed in full at its figure before the reduction, in Q2: no difference.
      ['97140', 'GP', 1, '11', 'medicare_ffs', '2026-Q2', 2_458n * 11n, 11],
      // Exactly $5.00 a line below its fully reduced figure: not more than the threshold, so no anomaly.
      ['97140', 'GP', 1, '11', 'ma_noncontracted', '2026-Q1', 1_320n * 13n, 13],
      // A code outside the reduction, allowed in full at its figure before sequestration: one figure, no difference.
      ['97161', 'GP', 1, '11', 'medicare_ffs', '2026-Q1', 5_917n * 11n, 11],
      // The same code $5.01 a line below its one figure: an anomaly.
      ['97161', 'GP', 1, '11', 'ma_noncontracted', '2026-Q1', 5_416n * 11n, 11],
    ];
    const runId = await submit({ rows });
    const mail = new MemoryMailSender();
    expect(await priceScreeningRun(dependencies(mail), runId)).toBe('complete');
    const stored = await results(runId);
    expect(stored.map((row) => [row.procedure_code, row.expected_line_cents, row.reduced_line_cents, row.expected_cents, row.reduced_cents, row.difference_cents, row.reduced_difference_cents])).toEqual([
      ['97110', '3684', '3145', '40524', '34595', '3124', '-2805'],
      ['97140', '2458', '1820', '29496', '21840', '13908', '6252'],
      ['97140', '2458', '1820', '27038', '20020', '0', '-7018'],
      ['97140', '2458', '1820', '31954', '23660', '14794', '6500'],
      ['97161', '5917', null, '65087', null, '0', null],
      ['97161', '5917', null, '65087', null, '5511', null],
    ]);
    const hash = screeningTokenHash(tokenOf(mail.sent[0]));
    const shown = await asApp<{ row_no: number; standing: string; in_reduction_pool: boolean; reduced_cents: string | null }>(
      'SELECT row_no, standing, in_reduction_pool, reduced_cents::text AS reduced_cents FROM screening_result_rows($1, 100) ORDER BY row_no',
      [hash],
    );
    expect(shown.map((row) => [row.row_no, row.standing])).toEqual([
      [1, 'within_reduction_range'],
      [2, 'anomaly'],
      [3, 'at_or_above'],
      [4, 'below_by_threshold_or_less'],
      [5, 'at_or_above'],
      [6, 'anomaly'],
    ]);
    // The rows come largest difference from the lowest figure first (row 4, exactly $5.00 a line below its fully reduced
    // figure over 13 lines, then the two anomalies).
    expect((await asApp<{ row_no: number }>('SELECT row_no FROM screening_result_rows($1, 100)', [hash])).map((row) => row.row_no)).toEqual([4, 2, 6, 5, 1, 3]);
    const groups = await asApp<{ payer_product: string; procedure_code: string; rows: number; anomaly_rows: number; anomaly: boolean; standing: string; reduced_cents: string | null; expected_cents: string }>(
      'SELECT payer_product, procedure_code, rows, anomaly_rows, anomaly, standing, reduced_cents::text AS reduced_cents, expected_cents::text AS expected_cents FROM screening_result_groups($1) ORDER BY payer_product, procedure_code',
      [hash],
    );
    expect(groups.map((group) => [group.payer_product, group.procedure_code, group.rows, group.anomaly_rows, group.anomaly, group.standing, group.reduced_cents])).toEqual([
      ['ma_noncontracted', '97140', 1, 0, false, 'below_by_threshold_or_less', '23660'],
      ['ma_noncontracted', '97161', 1, 1, true, 'anomaly', null],
      ['medicare_ffs', '97110', 1, 0, false, 'within_reduction_range', '34595'],
      // One row of two is an anomaly, though the group's totals are within $5 a claim line: the group is an anomaly.
      ['medicare_ffs', '97140', 2, 1, true, 'anomaly', '41860'],
      ['medicare_ffs', '97161', 1, 0, false, 'at_or_above', null],
    ]);
  });

  it('calls no code of the reduction across a visit’s codes an anomaly when paid as one visit: golden G01, allowed before sequestration, is within each row’s range', async () => {
    // PRD 11's worked example (golden G01): 97110 GP x2, 97140 GP and 97530 GP on one day at POS 11, ZIP 00011, priced
    // by the unchanged engine as one visit on the band's first day; a practice whose payer allowed that visit, before
    // sequestration as payers normally report it, sends these rows.
    // Eleven such visits a quarter: the fewest claim lines a row may sum.
    const g01: readonly Row[] = [
      ['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 0n, 11],
      ['97140', 'GP', 1, '11', 'medicare_ffs', '2026-Q1', 0n, 11],
      ['97530', 'GP', 1, '11', 'medicare_ffs', '2026-Q1', 0n, 11],
    ];
    const visitLines = g01.map((row, index) => ({
      ...(screeningClaim({ procedureCode: row[0], modifiers: row[1].split(' '), units: row[2], placeOfService: row[3], serviceBand: row[5] }).lines[0] as ReturnType<typeof screeningClaim>['lines'][number]),
      lineNo: index + 1,
    }));
    const visit = price({
      claim: { ...screeningClaim({ procedureCode: '97110', modifiers: ['GP'], units: 2, placeOfService: '11', serviceBand: '2026-Q1' }), lines: visitLines },
      release: syntheticRelease(900001),
      settings: { zip: '00011', defaultRounding: null, placeOfServiceSettings: SYNTHETIC_PLACES },
      asOf: new Date().toISOString().slice(0, 10),
    });
    const paid = g01.map((row, index): Row => {
      const line = visit[index];
      if (line?.outcome !== 'priced') {
        throw new Error('the worked example prices');
      }
      return [row[0], row[1], row[2], row[3], row[4], row[5], beforeSequestration(line).cents * 11n, 11];
    });
    const runId = await submit({ rows: paid });
    const mail = new MemoryMailSender();
    expect(await priceScreeningRun(dependencies(mail), runId)).toBe('complete');
    const stored = await results(runId);
    expect(stored.map((row) => row.in_reduction_pool)).toEqual([true, true, true]);
    const groups = await asApp<{ procedure_code: string; anomaly: boolean; standing: string; difference_cents: string; reduced_difference_cents: string }>(
      'SELECT procedure_code, anomaly, standing, difference_cents::text AS difference_cents, reduced_difference_cents::text AS reduced_difference_cents FROM screening_result_groups($1) ORDER BY procedure_code',
      [screeningTokenHash(tokenOf(mail.sent[0]))],
    );
    // 97110 and 97140 follow 97530 in the visit, at their fully reduced figures: more than $5 a line below the figures
    // priced alone, and within the range of the reduction across codes; 97530, ranked first, at its figure alone.
    expect(groups.map((group) => [group.procedure_code, group.anomaly, group.standing, group.difference_cents, group.reduced_difference_cents])).toEqual([
      ['97110', false, 'within_reduction_range', '5929', '0'],
      ['97140', false, 'within_reduction_range', '7018', '0'],
      ['97530', false, 'at_or_above', '0', '-7942'],
    ]);
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
    expect(lines.every((line) => Object.keys(line).every((key) => ['level', 'msg', 'time', 'job_id', 'screening_run_id', 'error_code', 'elapsed_ms', 'record_count'].includes(key)))).toBe(true);
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

  it('prices nothing and sends nothing for a run a later screening of the same practice replaced before it was priced', async () => {
    const practice = practiceName();
    const replaced = await submit({ practice });
    const kept = await submit({ practice });
    expect((await owner.query('SELECT count(*)::int AS n FROM screening_run WHERE id = $1', [replaced])).rows).toEqual([{ n: 0 }]);
    const mail = new MemoryMailSender();
    expect(await priceScreeningRun(dependencies(mail), replaced)).toBe('not_claimed');
    expect(mail.sent).toEqual([]);
    expect(await priceScreeningRun(dependencies(mail), kept)).toBe('complete');
    expect(mail.sent.map((message) => message.subject)).toEqual(['Your screening is ready']);
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

  it('lets no contact address the mail service refuses hold up the sweep, and still fails that run once it is out of attempts', async () => {
    const poison = 'refused.synthetic@clinic-refused.synthetic.test';
    const poisonRun = await submit({ email: poison });
    const laterRun = await submit({ email: 'later.synthetic@clinic-later.synthetic.test' });
    const memory = new MemoryMailSender();
    const refusing: MailSender = {
      send: (message) => (message.to.includes(poison) ? Promise.reject(new Error('SYNTHETIC BadRequestException: Illegal address')) : memory.send(message)),
    };
    // The sweep takes the older, refused run first, logs it by ID, and still prices and emails the later one.
    expect(await sweepScreeningRuns(dependencies(refusing), { minQueuedAgeSeconds: 0 })).toEqual({ complete: 1, failed: 0, skipped: 1 });
    expect(memory.sent.map((message) => message.to)).toEqual([['later.synthetic@clinic-later.synthetic.test']]);
    expect((await owner.query('SELECT status FROM screening_run WHERE id = $1', [laterRun])).rows).toEqual([{ status: 'complete' }]);
    expect(lines.filter((line) => line.error_code === 'SCREENING_RUN_FAILED').map((line) => line.screening_run_id)).toEqual([poisonRun]);
    expect(JSON.stringify(lines)).not.toContain(poison);
    // Claimed again on each stale sweep, it runs out of attempts and ends failed, its notice refused and logged.
    for (let attempt = 2; attempt <= 3; attempt += 1) {
      await rewind("UPDATE screening_run SET started_at = started_at - interval '11 minutes' WHERE id = $1", [poisonRun]);
      await sweepScreeningRuns(dependencies(refusing), { minQueuedAgeSeconds: 0 });
    }
    expect((await owner.query('SELECT status, attempts FROM screening_run WHERE id = $1', [poisonRun])).rows).toEqual([{ status: 'pricing', attempts: 3 }]);
    await rewind("UPDATE screening_run SET started_at = started_at - interval '11 minutes' WHERE id = $1", [poisonRun]);
    lines = [];
    expect(await sweepScreeningRuns(dependencies(refusing), { minQueuedAgeSeconds: 0 })).toEqual({ complete: 0, failed: 1, skipped: 0 });
    expect((await owner.query('SELECT status, failure_code FROM screening_run WHERE id = $1', [poisonRun])).rows).toEqual([{ status: 'failed', failure_code: 'PRICING_ATTEMPTS_EXHAUSTED' }]);
    expect(lines.map((line) => line.error_code)).toEqual(expect.arrayContaining(['SCREENING_NOTICE_UNDELIVERABLE', 'PRICING_ATTEMPTS_EXHAUSTED']));
    expect(JSON.stringify(lines)).not.toContain(poison);
    expect(await sweepScreeningRuns(dependencies(refusing), { minQueuedAgeSeconds: 0 })).toEqual({ complete: 0, failed: 0, skipped: 0 });
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
    // The converted screening's summary is kept with its request for 12 months, and every outcome outlives its
    // screening, unlinked (the founder's rulings of 2026-10-20).
    expect((await owner.query('SELECT upload_id FROM screening_lead WHERE prospect_request_id = $1', [request?.id])).rows).toEqual([{ upload_id: null }]);
    expect((await owner.query("SELECT count(*)::int AS n FROM screening_outcome WHERE upload_id IS NULL AND stage = 'priced' AND converted")).rows[0]?.n).toBeGreaterThanOrEqual(1);
    // Run again, it finds nothing more.
    expect(await expireScreenings({ operator: admin, jobId: randomUUID() })).toEqual({ prospects: 0, runs: 0, leads: 0 });
  });
});

describe('a release withdrawn after a screening was pinned to it', () => {
  it('prices nothing more under it, even from the cached release, says so on a result priced under it, and lets that result convert', async () => {
    // SYNTHETIC release 900004 (900001 with one value changed) is put in force, two screenings pin it, and one is priced.
    await loadRelease(owner, WITHDRAWN_RELEASE_DIR, { release: 900004, allowSyntheticFixtureForTests: true });
    const priced = await submit({ email: 'prospect.before.withdrawal@synthetic.test' });
    const waiting = await submit({ email: 'prospect.after.withdrawal@synthetic.test' });
    const pinned = await owner.query<{ release_no: number }>('SELECT release_no FROM screening_run WHERE id = ANY ($1)', [[priced, waiting]]);
    expect(pinned.rows.map((row) => row.release_no)).toEqual([900004, 900004]);
    const mail = new MemoryMailSender();
    expect(await priceScreeningRun(dependencies(mail), priced)).toBe('complete');
    const hash = screeningTokenHash(tokenOf(mail.sent[0]));
    expect(await asApp('SELECT release_no, release_withdrawn FROM screening_result_summary($1)', [hash])).toEqual([{ release_no: 900004, release_withdrawn: false }]);
    await withdrawRelease(owner, { release: 900004, reason: 'SYNTHETIC: withdrawn under a screening in a test' });
    // This process still holds the release it read; the claim says it is withdrawn, so the run fails and its contact is told.
    expect(await priceScreeningRun(dependencies(mail), waiting)).toBe('failed');
    expect((await owner.query('SELECT status, failure_code FROM screening_run WHERE id = $1', [waiting])).rows).toEqual([{ status: 'failed', failure_code: 'RELEASE_UNAVAILABLE' }]);
    expect(mail.sent.at(-1)).toMatchObject({ to: ['prospect.after.withdrawal@synthetic.test'], subject: 'Your screening could not be completed' });
    // The result already priced under it says so.
    expect(await asApp('SELECT release_no, release_withdrawn FROM screening_result_summary($1)', [hash])).toEqual([{ release_no: 900004, release_withdrawn: true }]);
    // It keeps its notice and may still be converted to an audit request, which prices nothing from the screening (the
    // owner's ruling of 2026-10-18): the request and its event are recorded, and the notice stays.
    const [request] = await asApp<{ id: string }>('SELECT convert_screening($1, $2, $3, $4, $5, $6) AS id', [hash, 'SYNTHETIC CONTACT', 1, ['SYNTHETIC PAYER'], 'in_house', `test-${randomUUID()}`]);
    expect((await owner.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'screening_converted' AND object_id = $1", [request?.id])).rows).toEqual([{ n: 1 }]);
    expect(await asApp('SELECT release_withdrawn, converted FROM screening_result_summary($1)', [hash])).toEqual([{ release_withdrawn: true, converted: true }]);
    // A new screening pins the reinstated release.
    const after = await submit();
    expect((await owner.query('SELECT release_no FROM screening_run WHERE id = $1', [after])).rows).toEqual([{ release_no: 900001 }]);
  });
});
