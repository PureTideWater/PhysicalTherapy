import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PricingRefusedError, correctMapping, dollarsWaitingOnMapping } from '@tp/contracts';
import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createUser } from '@tp/db/testing';
import { ENGINE_VERSION, parseTrace, recompute } from '@tp/pricing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JobContext } from '../jobs/handlers';
import { parseCoverage } from './coverage';
import { PricingLocationWaiting, PricingRunInputError } from './create';
import { ENGINE_ERRORS_MESSAGE } from './execute';
import { priceHandler } from './job';
import { RuleReleaseMismatchError } from './release';
import { createRerun, rerunReasons } from './rerun';
import { FIXTURES, type Practice, PricingWorld, RELEASE, errorOf } from './test-support/pricing-world';

/**
 * Pricing runs against PostgreSQL, through the run's own code as it runs in production (PRD 5, J6 and
 * J7; PRD 8, pricing_run and priced_line and Invariants; PRD 11, Inputs and step 9; test matrix MAP-01
 * to MAP-05, PRC-12, PRC-14, PRC-15, JOB-01). Each case is a practice of its own: its SYNTHETIC 835s
 * are parsed and loaded by the parse_835 job, its plans mapped and its contracts signed off through
 * @tp/contracts' services by the people the plan names, a run created in the billing manager's scope
 * and executed by the price job in the practice's job scope, under SYNTHETIC release 900001. The
 * practice's pricing location and the place-of-service split (PRC-23, PRC-24; docs/adr/0064) are read
 * by the job as the worker's own login, a member of the application role, as in production.
 */

let w: PricingWorld;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

const practice = (label: string, settings?: object) => w.practice(label, settings);
const load = (target: Practice, fixture: string) => w.load(target, fixture);
const one = <T>(sql: string, values: unknown[]) => w.one<T>(sql, values);
const payerOf = (target: Practice) => w.payerOf(target);
const planOf = (target: Practice, key: string) => w.planOf(target, key);
const signedContract = (target: Practice, effectiveFrom: string, options?: { effectiveTo?: string; disputeWindowDays?: number; percentage?: string; terms?: object }) =>
  w.signedContract(target, effectiveFrom, options);
const mapped = (target: Practice, planId: string, kind: 'contract' | 'no_agreement' | 'ma_noncontracted', effectiveFrom: string, contractVersionId: string | null = null) =>
  w.mapped(target, planId, kind, effectiveFrom, contractVersionId);
const createRun = (target: Practice, periodFrom: string, periodTo: string, releaseNo = RELEASE) => w.createRun(target, periodFrom, periodTo, releaseNo);
const execute = (target: Practice, pricingRunId: string, logs: Record<string, unknown>[] = []) => w.execute(target, pricingRunId, logs);
const jobContext = (practiceId: string, logs: Record<string, unknown>[] = [], lastAttempt = false): JobContext => w.jobContext(practiceId, logs, lastAttempt);

interface RunRow {
  readonly status: string;
  readonly release_no: number;
  readonly engine_version: string;
  readonly created_by: string;
  readonly period_from: string;
  readonly period_to: string;
  readonly coverage: unknown;
  readonly failure_code: string | null;
  readonly completed_at: Date | null;
  readonly updated_at: Date;
}

const runRow = (id: string) =>
  one<RunRow>('SELECT status, release_no, engine_version, created_by, period_from::text, period_to::text, coverage, failure_code, completed_at, updated_at FROM pricing_run WHERE id = $1', [id]);

interface LineRow {
  readonly id: string;
  readonly service_line_id: string;
  readonly procedure_code: string;
  readonly service_date: string;
  readonly mapping_id: string | null;
  readonly contract_version_id: string | null;
  readonly rate_record_id: string | null;
  readonly method: string | null;
  readonly expected_allowed_cents: string | null;
  readonly expected_unrounded: string | null;
  readonly observed_allowed_cents: string;
  readonly variance_cents: string | null;
  readonly unpriced_reason: string | null;
  readonly adjustments_applied: { name: string; before_cents: string; after_cents: string }[];
  readonly window_ends_on: string | null;
  readonly trace: unknown;
}

async function pricedLines(pricingRunId: string): Promise<LineRow[]> {
  const { rows } = await w.owner.query<LineRow>(
    `SELECT p.id, p.service_line_id, l.procedure_code, l.service_date::text AS service_date, p.mapping_id, p.contract_version_id, p.rate_record_id, p.method,
            p.expected_allowed_cents::text AS expected_allowed_cents, p.expected_unrounded::text AS expected_unrounded, p.observed_allowed_cents::text AS observed_allowed_cents,
            p.variance_cents::text AS variance_cents, p.unpriced_reason, p.adjustments_applied, p.window_ends_on::text AS window_ends_on, p.trace
       FROM priced_line p JOIN service_line l ON l.id = p.service_line_id JOIN claim c ON c.id = l.claim_id
      WHERE p.pricing_run_id = $1 ORDER BY l.service_date, c.claim_no, l.line_no`,
    [pricingRunId],
  );
  return rows;
}

/** Every priced line's trace recomputes, without the engine or the database, to the stored amount (PRD 8, Invariants). */
function expectTracesRecompute(lines: readonly LineRow[]): void {
  for (const line of lines) {
    const trace = parseTrace(line.trace);
    expect(trace.release.number).toBe(RELEASE);
    expect(trace.line.service_line_id).toBe(line.service_line_id);
    if (line.unpriced_reason !== null) {
      expect(trace.outcome).toMatchObject({ result: 'unpriced', reason: line.unpriced_reason });
      continue;
    }
    const again = recompute(line.trace);
    expect(again.differences).toEqual([]);
    expect(again.outcome).toBe('priced');
    if (again.outcome === 'priced') {
      expect(again.expectedAllowedCents.toString()).toBe(line.expected_allowed_cents);
      expect(again.expectedUnroundedCents.toString()).toBe(line.expected_unrounded);
      expect(again.varianceCents.toString()).toBe(line.variance_cents);
    }
  }
}

describe('MAP-01: an unmapped payer and plan', () => {
  it('refuses the run through the guard, and coverage shows the dollars waiting', async () => {
    const target = await practice('map-01');
    await load(target, 'MAP-01/remit.835');
    const refused = await errorOf(createRun(target, '2026-03-01', '2026-03-31'));
    expect(refused).toBeInstanceOf(PricingRefusedError);
    expect(refused).toMatchObject({ unmappedPlanIds: [await planOf(target, 'CE:SYNPLAN-UNMAPPED-01')] });
    expect(await one<{ n: number }>('SELECT count(*)::int AS n FROM pricing_run WHERE practice_id = $1', [target.practiceId])).toEqual({ n: 0 });
    const expected = (JSON.parse(readFileSync(path.join(FIXTURES, 'MAP-01/expected.json'), 'utf8')) as { outcome: { coverageWaiting: { lines: number; chargeCents: string; paidCents: string } } }).outcome.coverageWaiting;
    const waiting = await withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, (scope) => dollarsWaitingOnMapping(scope, target.practiceId));
    expect(waiting.map((plan) => ({ lines: plan.lines, chargeCents: plan.chargeCents.toString(), paidCents: plan.paidCents.toString() }))).toEqual([expected]);
  });
});

describe('MAP-02: a mapping that takes effect after some lines', () => {
  it('leaves the earlier line NO_MAPPING, never priced from a guess, and prices the later one', async () => {
    const target = await practice('map-02');
    await load(target, 'MAP-02/remit.835');
    const signed = await signedContract(target, '2026-01-01');
    const mappingId = await mapped(target, await planOf(target, 'CE:SYNPLAN-COMM-02'), 'contract', '2026-04-01', signed.versionId);
    const runId = await createRun(target, '2026-03-01', '2026-04-30');
    await execute(target, runId);
    const lines = await pricedLines(runId);
    expect(lines.map((line) => [line.service_date, line.unpriced_reason, line.mapping_id])).toEqual([
      ['2026-03-16', 'NO_MAPPING', null],
      ['2026-04-13', null, mappingId],
    ]);
    const [early, late] = lines;
    expect(early).toMatchObject({ expected_allowed_cents: null, expected_unrounded: null, variance_cents: null, contract_version_id: null, rate_record_id: null });
    expect(late).toMatchObject({ contract_version_id: signed.versionId, rate_record_id: signed.rateRecordId, method: 'PERCENT_OF_MEDICARE' });
    expectTracesRecompute(lines);
    const run = await runRow(runId);
    expect(run).toMatchObject({ status: 'complete', release_no: RELEASE, engine_version: ENGINE_VERSION, created_by: target.manager, failure_code: null });
    const coverage = parseCoverage(run.coverage);
    expect(coverage.lines).toBe(2);
    expect(coverage.priced.lines).toBe(1);
    expect(coverage.reasons.find((entry) => entry.reason === 'NO_MAPPING')).toEqual({ reason: 'NO_MAPPING', lines: 1, charge_cents: '14400' });
    expect(coverage.charge_cents).toBe('32800');
    expect(coverage.priced.charge_cents).toBe('18400');
    expect(coverage.versions).toEqual([{ contract_version_id: signed.versionId, contract_id: signed.contractId, version_no: 1, lines: 1 }]);
    expect(coverage.patterns).toEqual([
      expect.objectContaining({ payer_id: await payerOf(target), mapping_kind: 'contract', contract_version_id: signed.versionId, rate_record_id: signed.rateRecordId, lines: 1 }),
    ]);
  });
});

describe('MAP-03: a mapping corrected', () => {
  it('is a new mapping; the earlier run stays exactly as it was, and a re-run is offered and prices under the correction', async () => {
    const target = await practice('map-03');
    await load(target, 'MAP-03/remit.835');
    const planId = await planOf(target, 'CE:SYNPLAN-COMM-03');
    const wrong = await mapped(target, planId, 'no_agreement', '2026-01-01');
    const first = await createRun(target, '2026-05-01', '2026-05-31');
    await execute(target, first);
    const before = { run: await runRow(first), lines: await pricedLines(first) };
    expect(before.lines.map((line) => line.unpriced_reason)).toEqual(['NO_AGREEMENT', 'NO_AGREEMENT', 'NO_AGREEMENT']);
    const since = { practiceId: target.practiceId, createdAt: await one<{ created_at: Date }>('SELECT created_at FROM pricing_run WHERE id = $1', [first]).then((row) => row.created_at), releaseNo: RELEASE };
    const offered = () => withJobScope(w.app, { jobId: randomUUID(), practiceId: target.practiceId }, (scope) => rerunReasons(scope.client, since));
    expect(await offered()).toEqual([]);

    const signed = await signedContract(target, '2026-01-01');
    const right = (await w.as(target, target.manager, (context) => correctMapping(context, { practiceId: target.practiceId, planId, kind: 'contract', contractVersionId: signed.versionId, effectiveFrom: '2026-01-01', supersedesId: wrong }))).mappingId;
    expect(await offered()).toEqual(['mapping_changed', 'version_signed_off']);
    // The earlier run, and every line of it, exactly as it was.
    expect(await runRow(first)).toEqual(before.run);
    expect(await pricedLines(first)).toEqual(before.lines);

    const second = await createRun(target, '2026-05-01', '2026-05-31');
    await execute(target, second);
    const lines = await pricedLines(second);
    expect(lines.map((line) => [line.unpriced_reason, line.mapping_id, line.contract_version_id])).toEqual([
      [null, right, signed.versionId],
      [null, right, signed.versionId],
      [null, right, signed.versionId],
    ]);
    expectTracesRecompute(lines);
  });
});

describe('MAP-04: a plan mapped as no agreement', () => {
  it('leaves every line NO_AGREEMENT, for anomaly screening only', async () => {
    const target = await practice('map-04');
    await load(target, 'MAP-04/remit.835');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-OON-04'), 'no_agreement', '2026-01-01');
    const runId = await createRun(target, '2026-04-01', '2026-04-30');
    await execute(target, runId);
    const lines = await pricedLines(runId);
    expect(lines).toHaveLength(4);
    expect(new Set(lines.map((line) => line.unpriced_reason))).toEqual(new Set(['NO_AGREEMENT']));
    expect(lines.every((line) => line.expected_allowed_cents === null && line.mapping_id !== null && line.contract_version_id === null)).toBe(true);
    const coverage = parseCoverage((await runRow(runId)).coverage);
    expect(coverage.priced).toEqual({ lines: 0, charge_cents: '0' });
    expect(coverage.reasons.filter((entry) => entry.lines > 0)).toEqual([{ reason: 'NO_AGREEMENT', lines: 4, charge_cents: '40100' }]);
    expect(coverage.patterns).toEqual([]);
    expectTracesRecompute(lines);
  });
});

describe('MAP-05: a plan mapped as Medicare Advantage non-contracted', () => {
  it('prices every line from the fee schedule with every Medicare flag on', async () => {
    const target = await practice('map-05');
    await load(target, 'MAP-05/remit.835');
    const mappingId = await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    const runId = await createRun(target, '2026-02-01', '2026-02-28');
    await execute(target, runId);
    const lines = await pricedLines(runId);
    expect(lines.map((line) => line.procedure_code)).toEqual(['97110', '97140', '97530']);
    for (const line of lines) {
      expect(line).toMatchObject({ unpriced_reason: null, method: 'PERCENT_OF_MEDICARE', mapping_id: mappingId, contract_version_id: null, rate_record_id: null });
      const trace = parseTrace(line.trace);
      expect(trace.terms?.flags).toEqual({ apply_mppr: true, apply_assistant_reduction: true, apply_sequestration: true, apply_ncci: true, timed_units_rule: 'MEDICARE_POOLED' });
      expect(trace.terms?.percent_of_medicare).toMatchObject({ percentage: '100', year_basis: 'CURRENT' });
      expect(line.adjustments_applied.map((item) => item.name)).toEqual(['mppr', 'assistant_reduction', 'sequestration']);
    }
    expectTracesRecompute(lines);
  });
});

describe('PRC-12, PRC-14 and PRC-15 through a run', () => {
  it('PRC-12: a service date outside every signed-off version is DATE_OUTSIDE_VERSIONS', async () => {
    const target = await practice('prc-12');
    await load(target, 'PRC-12/remit.835');
    const signed = await signedContract(target, '2026-05-01');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-COMM-GAP'), 'contract', '2026-01-01', signed.versionId);
    const runId = await createRun(target, '2026-04-01', '2026-04-30');
    await execute(target, runId);
    const lines = await pricedLines(runId);
    expect(lines.map((line) => [line.unpriced_reason, line.contract_version_id])).toEqual([['DATE_OUTSIDE_VERSIONS', null]]);
    expectTracesRecompute(lines);
  });

  it('PRC-14: an underpaid line whose window passed by the run’s triage date is stored with its window and priced as before', async () => {
    const target = await practice('prc-14');
    await load(target, 'PRC-14/remit.835');
    // A SYNTHETIC contract generous enough that the fixture's payment is short of it, with a 90-day
    // dispute window from the remittance date (2026-03-02): closed long before the run's triage date.
    const signed = await signedContract(target, '2026-01-01', { percentage: '400', disputeWindowDays: 90 });
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-NC'), 'contract', '2026-01-01', signed.versionId);
    const runId = await createRun(target, '2026-02-01', '2026-02-28');
    await execute(target, runId);
    const [line] = await pricedLines(runId);
    const createdOn = (await one<{ day: string }>("SELECT (created_at AT TIME ZONE 'UTC')::date::text AS day FROM pricing_run WHERE id = $1", [runId])).day;
    expect(line?.unpriced_reason).toBeNull();
    expect(BigInt(line?.variance_cents ?? '0')).toBeGreaterThan(0n);
    expect(line?.window_ends_on).toBe('2026-05-31');
    expect((line?.window_ends_on ?? '') < createdOn).toBe(true);
    const trace = parseTrace(line?.trace);
    expect(trace.as_of).toBe(createdOn);
    expect(trace.steps.window).toMatchObject({ ends_on: line?.window_ends_on, status: 'WINDOW_PASSED' });
    expectTracesRecompute(line === undefined ? [] : [line]);
  });

  it('PRC-15: a line paid above its expected amount records the negative variance as overpaid, never underpaid', async () => {
    const target = await practice('prc-15');
    await load(target, 'PRC-15/remit.835');
    const signed = await signedContract(target, '2026-01-01');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-COMM-FIX'), 'contract', '2026-01-01', signed.versionId);
    const runId = await createRun(target, '2026-02-01', '2026-02-28');
    await execute(target, runId);
    const [line] = await pricedLines(runId);
    expect(line?.observed_allowed_cents).toBe('6000');
    const variance = BigInt(line?.variance_cents ?? '0');
    expect(variance).toBeLessThan(0n);
    expect(variance).toBe(BigInt(line?.expected_allowed_cents ?? '0') - 6000n);
    const [pattern] = parseCoverage((await runRow(runId)).coverage).patterns;
    expect(pattern).toMatchObject({ lines: 1, underpaid_lines: 0, underpaid_cents: '0', overpaid_lines: 1, overpaid_cents: variance.toString() });
    expectTracesRecompute(line === undefined ? [] : [line]);
  });
});

describe('a run that errors on a line', () => {
  it('records that line’s ENGINE_ERROR with its detail, prices the rest, and logs the operator’s alert line once', async () => {
    // The practice bills place of service 11 but its settings give only 22: no percent-of-Medicare
    // line can choose its practice-expense value.
    const target = await practice('engine-error', { place_of_service_settings: { '22': 'facility' } });
    await load(target, 'MAP-04/remit.835');
    const planId = await planOf(target, 'CE:SYNPLAN-OON-04');
    const signed = await signedContract(target, '2026-01-01');
    await mapped(target, planId, 'contract', '2026-01-01', signed.versionId);
    const runId = await createRun(target, '2026-04-01', '2026-04-30');
    const logs: Record<string, unknown>[] = [];
    await execute(target, runId, logs);
    const lines = await pricedLines(runId);
    expect(lines.map((line) => line.unpriced_reason)).toEqual(['ENGINE_ERROR', 'ENGINE_ERROR', 'ENGINE_ERROR', 'ENGINE_ERROR']);
    for (const line of lines) {
      expect(parseTrace(line.trace).outcome).toMatchObject({ reason: 'ENGINE_ERROR', detail: 'place_of_service_unmapped' });
    }
    const run = await runRow(runId);
    expect(run.status).toBe('complete');
    expect(parseCoverage(run.coverage).engine_errors).toEqual([{ detail: 'place_of_service_unmapped', lines: 4, pages_operator: true }]);
    expect(logs.filter((line) => line.msg === ENGINE_ERRORS_MESSAGE)).toEqual([expect.objectContaining({ pricing_run_id: runId, error_code: 'PRICING_ENGINE_ERROR' })]);
  });
});

describe('a complete run never changes (PRD 8, Invariants)', () => {
  let target: Practice;
  let runId: string;
  let lineId: string;

  let outside: string;

  beforeAll(async () => {
    target = await practice('immutable');
    await load(target, 'MAP-05/remit.835');
    // April lines of another plan: outside the run's period, so no line of the run.
    await load(target, 'MAP-04/remit.835');
    outside = (await one<{ id: string }>("SELECT id FROM service_line WHERE practice_id = $1 AND service_date = '2026-04-21' LIMIT 1", [target.practiceId])).id;
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    runId = await createRun(target, '2026-02-01', '2026-02-28');
    await execute(target, runId);
    lineId = (await pricedLines(runId))[0]?.id ?? '';
  });

  async function asApp(sql: string, values: unknown[]): Promise<unknown> {
    return errorOf(withJobScope(w.app, { jobId: randomUUID(), practiceId: target.practiceId }, (scope) => scope.client.query(sql, values)));
  }
  async function asTheOwner(sql: string, values: unknown[]): Promise<unknown> {
    return errorOf(asOwner(w.owner, [target.practiceId], () => w.owner.query(sql, values)));
  }

  it('refuses every change to the run, for the application and the owner alike', async () => {
    const before = await runRow(runId);
    for (const sql of [
      "UPDATE pricing_run SET status = 'failed', failure_code = 'job_failed', coverage = NULL, completed_at = NULL WHERE id = $1",
      "UPDATE pricing_run SET coverage = coverage || '{\"lines\": 0}' WHERE id = $1",
      'UPDATE pricing_run SET completed_at = now() WHERE id = $1',
    ]) {
      expect(await asApp(sql, [runId])).toMatchObject({ code: '23514', message: expect.stringMatching(/never changes once it is complete/) as string });
      expect(await asTheOwner(sql, [runId])).toMatchObject({ code: '23514' });
    }
    expect(await asApp("UPDATE pricing_run SET period_to = '2026-03-31' WHERE id = $1", [runId])).toMatchObject({ code: '42501' });
    expect(await asTheOwner("UPDATE pricing_run SET period_to = '2026-03-31' WHERE id = $1", [runId])).toMatchObject({ code: '23514' });
    expect(await asApp('DELETE FROM pricing_run WHERE id = $1', [runId])).toMatchObject({ code: '42501' });
    expect(await asTheOwner('DELETE FROM pricing_run WHERE id = $1', [runId])).toMatchObject({ code: '23514' });
    expect(await errorOf(w.owner.query('TRUNCATE pricing_run CASCADE'))).toMatchObject({ code: '23514' });
    expect(await runRow(runId)).toEqual(before);
  });

  it('refuses every change to its lines, and any new line', async () => {
    const before = await pricedLines(runId);
    expect(await asApp("UPDATE priced_line SET unpriced_reason = 'ENGINE_ERROR' WHERE id = $1", [lineId])).toMatchObject({ code: '42501' });
    expect(await asApp('DELETE FROM priced_line WHERE id = $1', [lineId])).toMatchObject({ code: '42501' });
    expect(await asTheOwner('UPDATE priced_line SET expected_allowed_cents = expected_allowed_cents + 1, variance_cents = variance_cents + 1 WHERE id = $1', [lineId])).toMatchObject({
      code: '23514',
      message: expect.stringMatching(/never changes/) as string,
    });
    expect(await asTheOwner('DELETE FROM priced_line WHERE id = $1', [lineId])).toMatchObject({ code: '23514' });
    // CASCADE: the triage tables reference priced lines (docs/adr/0038), and their own triggers refuse it too.
    expect(await errorOf(w.owner.query('TRUNCATE priced_line CASCADE'))).toMatchObject({ code: '23514' });
    // A line added to the complete run, of a service line it does not hold, is refused.
    expect(
      await asApp("INSERT INTO priced_line (practice_id, pricing_run_id, service_line_id, observed_allowed_cents, unpriced_reason, trace) VALUES ($1, $2, $3, 0, 'ENGINE_ERROR', '{}')", [
        target.practiceId,
        runId,
        outside,
      ]),
    ).toMatchObject({ code: '23514', message: expect.stringMatching(/a complete run never changes/) as string });
    expect(await pricedLines(runId)).toEqual(before);
  });

  it('holds a line priced or unpriced, never both, with its variance exactly expected less observed', async () => {
    const runOpen = await createRun(target, '2026-02-01', '2026-02-28');
    const serviceLine = (await pricedLines(runId))[0]?.service_line_id ?? '';
    const insert = (columns: string, values: string) =>
      asApp(`INSERT INTO priced_line (practice_id, pricing_run_id, service_line_id, observed_allowed_cents, trace, ${columns}) VALUES ($1, $2, $3, 1000, '{}', ${values})`, [target.practiceId, runOpen, serviceLine]);
    expect(await insert('unpriced_reason, expected_allowed_cents', "'NO_MAPPING', 100")).toMatchObject({ code: '23514' });
    expect(await insert('method', "'PERCENT_OF_MEDICARE'")).toMatchObject({ code: '23514' });
    expect(await insert('method, expected_allowed_cents, expected_unrounded, variance_cents', "'PERCENT_OF_MEDICARE', 1200, 1200.4, 199")).toMatchObject({ code: '23514' });
    expect(await insert('method, expected_allowed_cents, expected_unrounded, variance_cents', "'PERCENT_OF_MEDICARE', 1200, 1201.5, 200")).toMatchObject({ code: '23514' });
    expect(await insert('unpriced_reason', "'GUESSED'")).toMatchObject({ code: '23514' });
    expect(await errorOf(withJobScope(w.app, { jobId: randomUUID(), practiceId: target.practiceId }, (scope) => scope.client.query("UPDATE pricing_run SET status = 'queued' WHERE id = $1", [runOpen])))).toBeUndefined();
  });
});

describe('creating a run', () => {
  it('pins the release asked for only when it is the newest published one (J7), and refuses a period without lines or backwards', async () => {
    const target = await practice('create');
    await load(target, 'MAP-05/remit.835');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    expect(await errorOf(createRun(target, '2026-02-01', '2026-02-28', 900002))).toEqual(new RuleReleaseMismatchError(900002, RELEASE));
    expect(await errorOf(createRun(target, '2026-03-01', '2026-03-31'))).toMatchObject({ name: 'PricingRunInputError', field: 'period' });
    expect(await errorOf(createRun(target, '2026-02-28', '2026-02-01'))).toBeInstanceOf(PricingRunInputError);
    expect(await errorOf(createRun(target, '2026-02-30', '2026-03-01'))).toMatchObject({ field: 'periodFrom' });
    // Only the person creating it is its creator, and only queued.
    const viewer = await createUser(w.owner);
    await addMembership(w.owner, target.world.organizationId, viewer, 'viewer');
    expect(
      await errorOf(
        withPracticeScope(w.app, { actorId: viewer, practiceIds: [target.practiceId] }, (scope) =>
          scope.client.query("INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by) VALUES ($1, '2026-02-01', '2026-02-28', $2, $3, $4)", [
            target.practiceId,
            RELEASE,
            ENGINE_VERSION,
            target.manager,
          ]),
        ),
      ),
    ).toMatchObject({ code: '42501' });
    const runId = await createRun(target, '2026-02-01', '2026-02-28');
    expect(await runRow(runId)).toMatchObject({ status: 'queued', coverage: null, completed_at: null, release_no: RELEASE, period_from: '2026-02-01', period_to: '2026-02-28' });
  });

  it('fails a run whose engine version is not this engine’s, without retrying and without lines', async () => {
    const target = await practice('engine-version');
    await load(target, 'MAP-05/remit.835');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    const { id } = await asOwner(w.owner, [target.practiceId], async () =>
      one<{ id: string }>("INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by) VALUES ($1, '2026-02-01', '2026-02-28', $2, 'phase-zero/1', $3) RETURNING id", [
        target.practiceId,
        RELEASE,
        target.manager,
      ]),
    );
    await execute(target, id);
    expect(await runRow(id)).toMatchObject({ status: 'failed', failure_code: 'engine_version_mismatch' });
    expect(await pricedLines(id)).toEqual([]);
  });

  it('fails the run on the job’s third and last failed attempt, and leaves no line of it', async () => {
    const target = await practice('last-attempt');
    await load(target, 'MAP-05/remit.835');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    const runId = await createRun(target, '2026-02-01', '2026-02-28');
    let transactions = 0;
    const failing = (last: boolean): JobContext => {
      const context = jobContext(target.practiceId, [], last);
      return {
        ...context,
        transaction: (work) => {
          transactions += 1;
          // The second transaction of each attempt (the one that prices) fails.
          return transactions % 2 === 0 ? Promise.reject(new Error('SYNTHETIC failure')) : context.transaction(work);
        },
      };
    };
    const handler = priceHandler();
    await expect(handler({ practice_id: target.practiceId, pricing_run_id: runId }, failing(false))).rejects.toThrow('SYNTHETIC failure');
    expect(await runRow(runId)).toMatchObject({ status: 'running' });
    await expect(handler({ practice_id: target.practiceId, pricing_run_id: runId }, failing(true))).rejects.toThrow('SYNTHETIC failure');
    expect(await runRow(runId)).toMatchObject({ status: 'failed', failure_code: 'job_failed' });
    expect(await pricedLines(runId)).toEqual([]);
  });
});

describe('JOB-01: a replayed price job', () => {
  it('has no duplicate effects: the run, its lines and its audit trail stay as the first job left them', async () => {
    const target = await practice('job-01');
    await load(target, 'MAP-05/remit.835');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    const runId = await createRun(target, '2026-02-01', '2026-02-28');
    await execute(target, runId);
    const before = { run: await runRow(runId), lines: await pricedLines(runId) };
    const events = () => one<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE practice_id = $1 AND purpose = 'pricing'", [target.practiceId]);
    const audited = await events();
    expect(audited.n).toBeGreaterThan(0);
    await execute(target, runId);
    await Promise.all([execute(target, runId), execute(target, runId)]);
    expect(await runRow(runId)).toEqual(before.run);
    expect(await pricedLines(runId)).toEqual(before.lines);
    expect(await events()).toEqual(audited);
  });

  it('runs two runs of one practice one after the other, each complete with its own lines', async () => {
    const target = await practice('serial');
    await load(target, 'MAP-05/remit.835');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    const [a, b] = [await createRun(target, '2026-02-01', '2026-02-28'), await createRun(target, '2026-02-01', '2026-02-28')];
    await Promise.all([execute(target, a), execute(target, b)]);
    const [linesA, linesB] = [await pricedLines(a), await pricedLines(b)];
    expect(linesA).toHaveLength(3);
    expect(linesB.map((line) => [line.service_line_id, line.expected_allowed_cents])).toEqual(linesA.map((line) => [line.service_line_id, line.expected_allowed_cents]));
  });
});

describe('PRC-23: a month whose pricing location is not ready (audit #33; docs/adr/0064)', () => {
  /** A fixed schedule of $50.00 a line for every code: no line of it reads the locality. */
  const FIXED = { scope: {}, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '5000' }, flags: { timed_units_rule: 'PER_CODE' } };

  it('creates no run while the practice has no location: refused by the creator and by Postgres, re-runs included', async () => {
    const target = await practice('no-location');
    await load(target, 'MAP-05/remit.835');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    const complete = await createRun(target, '2026-02-01', '2026-02-28');
    await execute(target, complete);
    expect(await runRow(complete)).toMatchObject({ status: 'complete' });
    // A practice from before locations existed, with no ZIP (dev and staging only).
    await w.withoutLocation(target);
    const refused = await errorOf(createRun(target, '2026-02-01', '2026-02-28'));
    expect(refused).toBeInstanceOf(PricingLocationWaiting);
    expect(refused).toMatchObject({ status: 'zip_missing' });
    expect(
      await errorOf(
        withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, (scope) =>
          createRerun(scope, { practiceId: target.practiceId, pricingRunId: complete, releaseNo: RELEASE, requestId: `test-${randomUUID()}` }),
        ),
      ),
    ).toBeInstanceOf(PricingLocationWaiting);
    expect(
      await errorOf(
        withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, (scope) =>
          scope.client.query("INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by) VALUES ($1, '2026-02-01', '2026-02-28', $2, $3, $4)", [
            target.practiceId,
            RELEASE,
            ENGINE_VERSION,
            target.manager,
          ]),
        ),
      ),
    ).toMatchObject({ code: '23514', constraint: 'pricing_run_location_missing' });
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM pricing_run WHERE practice_id = $1', [target.practiceId])).n).toBe(1);
  });

  it('fails a percent-of-Medicare month whose lines need the ZIP+4 as location_not_ready, keeping no line and paging no one', async () => {
    const target = await practice('plus-four-needed');
    await load(target, 'MAP-05/remit.835');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    // 00012 is split between two localities in release 900001's ZIP file: it needs its ZIP+4.
    expect(await w.setLocation(target, '00012')).toBe('zip_plus_four_needed');
    const runId = await createRun(target, '2026-02-01', '2026-02-28');
    const logs: Record<string, unknown>[] = [];
    await execute(target, runId, logs);
    expect(await runRow(runId)).toMatchObject({ status: 'failed', failure_code: 'location_not_ready', coverage: null, completed_at: null });
    expect(await pricedLines(runId)).toEqual([]);
    expect(logs.filter((line) => line.msg === ENGINE_ERRORS_MESSAGE || line.level === 'error')).toEqual([]);
    // A replay leaves the failed run as it is.
    await execute(target, runId);
    expect(await runRow(runId)).toMatchObject({ status: 'failed', failure_code: 'location_not_ready' });
  });

  it('prices a fixed-schedule month at that location as before: its lines never read the locality', async () => {
    const target = await practice('plus-four-fixed');
    await load(target, 'MAP-05/remit.835');
    const signed = await signedContract(target, '2026-01-01', { terms: FIXED });
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'contract', '2026-01-01', signed.versionId);
    expect(await w.setLocation(target, '00012')).toBe('zip_plus_four_needed');
    const runId = await createRun(target, '2026-02-01', '2026-02-28');
    await execute(target, runId);
    expect(await runRow(runId)).toMatchObject({ status: 'complete', failure_code: null });
    const lines = await pricedLines(runId);
    expect(lines.map((line) => [line.method, line.unpriced_reason])).toEqual([
      ['FIXED_SCHEDULE', null],
      ['FIXED_SCHEDULE', null],
      ['FIXED_SCHEDULE', null],
    ]);
    expect(parseTrace(lines[0]?.trace).settings).toMatchObject({ zip: '00012' });
    expectTracesRecompute(lines);
  });

  it('keeps a line ENGINE_ERROR for the operator when the location waits on content PaidWhole has not loaded (locality_not_loaded)', async () => {
    const target = await practice('plus-four-not-loaded');
    await load(target, 'MAP-05/remit.835');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    // Release 900001 has no ZIP+4 file: nothing the customer can change, so the run completes and pages the operator.
    expect(await w.setLocation(target, '00012', '0001')).toBe('locality_not_loaded');
    const runId = await createRun(target, '2026-02-01', '2026-02-28');
    const logs: Record<string, unknown>[] = [];
    await execute(target, runId, logs);
    expect(await runRow(runId)).toMatchObject({ status: 'complete' });
    const lines = await pricedLines(runId);
    expect(lines.map((line) => line.unpriced_reason)).toEqual(['ENGINE_ERROR', 'ENGINE_ERROR', 'ENGINE_ERROR']);
    expect(parseTrace(lines[0]?.trace)).toMatchObject({ settings: { zip: '00012', zip_plus_four: '0001' }, outcome: { reason: 'ENGINE_ERROR', detail: 'zip_plus_four_not_in_locality_map' } });
    expect(parseCoverage((await runRow(runId)).coverage).engine_errors).toEqual([{ detail: 'zip_plus_four_not_in_locality_map', lines: 3, pages_operator: true }]);
    expect(logs.filter((line) => line.msg === ENGINE_ERRORS_MESSAGE)).toHaveLength(1);
  });
});

describe('PRC-24: a place of service the practice has not set (docs/adr/0064)', () => {
  // The split in force is pinned on every run created after it, so these tests run late in the file (before the
  // mismatch, which publishes a release).
  const SPLIT = { '11': 'non_facility', '12': 'non_facility', '21': 'facility', '22': 'facility', '23': 'facility' };

  it('prices with the approved split’s setting read by the job as the application role, and records the split on the run', async () => {
    const splitId = await w.approveSplit(SPLIT);
    const target = await practice('prc-24', { default_rounding: 'HALF_UP_CENT' });
    await load(target, 'MAP-05/remit.835');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    const runId = await createRun(target, '2026-02-01', '2026-02-28');
    expect(await one('SELECT place_of_service_split_id FROM pricing_run WHERE id = $1', [runId])).toEqual({ place_of_service_split_id: splitId });
    await execute(target, runId);
    const lines = await pricedLines(runId);
    expect(lines.map((line) => line.unpriced_reason)).toEqual([null, null, null]);
    for (const line of lines) {
      const trace = parseTrace(line.trace);
      expect(trace.settings.place_of_service_settings).toEqual(SPLIT);
      expect(trace.steps.fee_schedule?.setting).toBe('non_facility');
    }
    expectTracesRecompute(lines);
    // The split's settings reach only the run's own practice's scope.
    const other = await practice('prc-24-other');
    const read = (scopePractice: Practice) =>
      withPracticeScope(w.app, { actorId: scopePractice.manager, practiceIds: [scopePractice.practiceId] }, async (scope) => {
        const { rows } = await scope.client.query<{ place_of_service_split_id: string; settings: unknown }>('SELECT place_of_service_split_id, settings FROM pricing_run_split($1)', [runId]);
        return rows;
      });
    expect(await read(target)).toEqual([{ place_of_service_split_id: splitId, settings: SPLIT }]);
    expect(await read(other)).toEqual([]);
  });

  it('lets the practice’s own setting win over the split', async () => {
    const target = await practice('prc-24-own', { place_of_service_settings: { '11': 'facility' } });
    await load(target, 'MAP-05/remit.835');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    const runId = await createRun(target, '2026-02-01', '2026-02-28');
    await execute(target, runId);
    const lines = await pricedLines(runId);
    expect(lines.map((line) => line.unpriced_reason)).toEqual([null, null, null]);
    for (const line of lines) {
      const trace = parseTrace(line.trace);
      expect(trace.settings.place_of_service_settings).toEqual({ ...SPLIT, '11': 'facility' });
      expect(trace.steps.fee_schedule?.setting).toBe('facility');
    }
    expectTracesRecompute(lines);
  });
});

describe('a rule-release mismatch', () => {
  it('is refused by the creator and by the database once a newer release is published', async () => {
    const target = await practice('mismatch');
    await load(target, 'MAP-05/remit.835');
    await mapped(target, await planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    // A newer SYNTHETIC release number, published with no records (this test runs last in the file).
    await w.owner.query("INSERT INTO rule_release (release_no, published_at, manifest_sha256, notes) VALUES (900099, now(), $1, 'SYNTHETIC')", ['0'.repeat(64)]);
    expect(await errorOf(createRun(target, '2026-02-01', '2026-02-28'))).toEqual(new RuleReleaseMismatchError(RELEASE, 900099));
    expect(
      await errorOf(
        withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, (scope) =>
          scope.client.query("INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by) VALUES ($1, '2026-02-01', '2026-02-28', $2, $3, $4)", [
            target.practiceId,
            RELEASE,
            ENGINE_VERSION,
            target.manager,
          ]),
        ),
      ),
    ).toMatchObject({ code: '23514', message: expect.stringMatching(/rule-release mismatch/) as string });
  });
});
