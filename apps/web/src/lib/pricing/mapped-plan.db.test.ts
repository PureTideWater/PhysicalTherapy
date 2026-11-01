import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { parseTrace, recompute } from '@tp/pricing';
import { acceptRun, compareAcceptance, createRerun } from '@tp/worker/pricing';
import { triageHandler } from '@tp/worker/runtime';
import { CONTENT_GAP_RELEASE, type Practice, PricingWorld, RELEASE, RERUN_RELEASE } from '@tp/worker/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { unmappedPlanTotals } from '../contracts/mapping-queries';
import { forgetContentThrough } from '../releases/content-through';
import {
  PRICE_AGAIN_LIMIT,
  mappedNotPricedTotals,
  monthsAwaitingMappings,
  monthsToPriceAgain,
  monthsToQueue,
  monthsToTriage,
  monthsWaitingForMappings,
  priceAgainSets,
} from './mapped-plan';

/**
 * What a plan's mapping leaves to price (combined audit #32; docs/adr/0075; test matrix MAP-07, MAP-08, PRC-29, PRC-31),
 * against a scratch database under SYNTHETIC release 900001: the months no run covers with their plans mapped and
 * unmapped and what holds them (monthsAwaitingMappings, the months a mapping's monitoring names), the runs in effect
 * holding lines of mapped plans still NO_MAPPING with each one's state under #50's rule (monthsToPriceAgain), the
 * accepted re-runs whose newly priced short lines wait for triage (monthsToTriage), and the practice-wide figure
 * (mappedNotPricedTotals). Each case is a practice of its own, loaded from MAP-06's SYNTHETIC 835 (February 2026: plan A,
 * SYNPLAN-COMM-06, two claims; plan B, SYNPLAN-UNMAPPED-06, one claim of three lines, two of them paid short of the
 * fixed schedule) or a variant of it moved to another month or other plans. Synthetic data only.
 */

let w: PricingWorld;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
  forgetContentThrough();
}, 60_000);

afterAll(async () => {
  await w.close();
});

const FEBRUARY = { periodFrom: '2026-02-01', periodTo: '2026-02-28' };
/** SYNPLAN-COMM-06's schedule (MAP-06's scenario): $50.00 a unit, every code, every Medicare flag off. */
const FIXED_FEE = { scope: {}, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '5000' }, flags: { timed_units_rule: 'PER_CODE' } };

const inScope = <T>(target: Practice, read: (scope: PracticeScope<ScopeClient>) => Promise<T>) => withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, read);
const requestId = () => `test-${randomUUID()}`;

interface Plans {
  readonly practice: Practice;
  readonly a: string;
  readonly b: string;
}

/**
 * MAP-06's February (plan A and plan B), moved to `month` (YYYY-MM, its payment the month after) when given; `other`
 * loads a second payment of other claims of that month whose plan B is `other` instead (so the month holds A, B and it).
 */
async function loadMonth(practice: Practice, month = '2026-02', other?: string): Promise<void> {
  const [year, number] = [month.slice(0, 4), Number(month.slice(5, 7))];
  const paid = `${year}${String(number + 1).padStart(2, '0')}`;
  const dates: (readonly [string, string])[] =
    month === '2026-02'
      ? []
      : [
          ['20260221', `${year}${month.slice(5, 7)}21`],
          ['20260329', `${paid}29`],
          ['20260328', `${paid}28`],
          ['260329', `${paid.slice(2)}29`],
        ];
  await w.loadVariant(practice, 'MAP-06/remit.835', dates);
  if (other !== undefined) {
    await w.loadVariant(practice, 'MAP-06/remit.835', [
      ['020060001', '020069001'],
      ['MAP06', 'MAQ06'],
      ['SYNPLAN-UNMAPPED-06', other],
      ['SYNPLAN-COMM-06', 'SYNPLAN-COMM-06'],
      ...dates,
    ]);
  }
}

async function february(label: string, other?: string): Promise<Plans> {
  const practice = await w.practice(label);
  await loadMonth(practice, '2026-02', other);
  return { practice, a: await w.planOf(practice, 'CE:SYNPLAN-COMM-06'), b: await w.planOf(practice, 'CE:SYNPLAN-UNMAPPED-06') };
}

/** Maps the plan to a new signed-off version under the fixed schedule, from 2026-01-01. */
async function mapFixed(practice: Practice, planId: string): Promise<string> {
  const fixed = await w.signedContract(practice, '2026-01-01', { terms: FIXED_FEE });
  return w.mapped(practice, planId, 'contract', '2026-01-01', fixed.versionId);
}

async function priced(practice: Practice, from: string, to: string, releaseNo = RELEASE): Promise<string> {
  const runId = await w.createRun(practice, from, to, releaseNo);
  await w.execute(practice, runId);
  return runId;
}

/** A re-run of the run, in the billing manager's name, as "Price these months again" creates it. */
async function rerunOf(practice: Practice, runId: string, releaseNo = RELEASE): Promise<string> {
  return (await inScope(practice, (scope) => createRerun(scope, { practiceId: practice.practiceId, pricingRunId: runId, releaseNo, requestId: requestId() }))).pricingRunId;
}

async function accept(practice: Practice, rerunId: string, replacesId: string): Promise<void> {
  await inScope(practice, async (scope) => {
    const diff = await compareAcceptance(scope, { practiceId: practice.practiceId, rerunId, replacesId, requestId: requestId(), perPage: 500 });
    await acceptRun(scope, { practiceId: practice.practiceId, pricingRunId: rerunId, replacesId, heldByIds: diff.heldBy.map((run) => run.id) });
  });
}

const awaiting = (practice: Practice) => inScope(practice, (scope) => monthsAwaitingMappings(scope, practice.practiceId));
const toPriceAgain = (practice: Practice, planId: string | null = null) => inScope(practice, (scope) => monthsToPriceAgain(scope, practice.practiceId, planId, requestId()));
const states = async (practice: Practice, planId: string | null = null) => (await toPriceAgain(practice, planId)).map((month) => [month.pricingRunId, month.state.kind]);
const figure = (practice: Practice) => inScope(practice, (scope) => mappedNotPricedTotals(scope.client, practice.practiceId));

/** Sets a re-run failed with a code, as its price job leaves it, for the codes no SYNTHETIC case reaches (the test's superuser, triggers off). */
async function failedAs(runId: string, failureCode: string): Promise<void> {
  await w.owner.query('BEGIN');
  try {
    await w.owner.query("SET LOCAL session_replication_role = 'replica'");
    await w.owner.query("UPDATE pricing_run SET status = 'failed', failure_code = $2 WHERE id = $1", [runId, failureCode]);
    await w.owner.query('COMMIT');
  } catch (error) {
    await w.owner.query('ROLLBACK');
    throw error;
  }
}

describe('the months no run covers, and what a mapping queues (MAP-07)', () => {
  it('counts each month’s plans mapped and unmapped, and names every complete month only once a mapping completes one, never a mixed month', async () => {
    const practice = await w.practice('awaiting-ab-ac');
    await loadMonth(practice, '2026-02');
    // March holds plan A and plan C (the monitor's own layout: month 1 {A, B}, month 2 {A, C}).
    await w.loadVariant(practice, 'MAP-06/remit.835', [
      ['020060001', '020069001'],
      ['MAP06', 'MAQ06'],
      ['20260221', '20260321'],
      ['SYNPLAN-UNMAPPED-06', 'SYNPLAN-OTHER-06'],
    ]);
    const [a, b, c] = [await w.planOf(practice, 'CE:SYNPLAN-COMM-06'), await w.planOf(practice, 'CE:SYNPLAN-UNMAPPED-06'), await w.planOf(practice, 'CE:SYNPLAN-OTHER-06')];
    const before = await awaiting(practice);
    expect(before.map((month) => [month.periodFrom, month.periodTo, month.mappedPlans, month.unmappedPlans, month.held])).toEqual([
      ['2026-02-01', '2026-02-28', 0, 2, null],
      ['2026-03-01', '2026-03-31', 0, 2, null],
    ]);
    expect(before[0]?.planIds).toEqual([a, b].sort());
    expect(monthsToQueue(before, a)).toEqual([]);
    // A mapped: both months are mixed; nothing to queue, both wait for B and C.
    await mapFixed(practice, a);
    const afterA = await awaiting(practice);
    expect(monthsToQueue(afterA, a)).toEqual([]);
    expect(monthsWaitingForMappings(afterA, null)).toMatchObject({ plans: 2 });
    expect(monthsWaitingForMappings(afterA, null).months.map((month) => month.periodFrom)).toEqual(['2026-02-01', '2026-03-01']);
    expect(monthsWaitingForMappings(afterA, a)).toMatchObject({ plans: 2 });
    expect(monthsWaitingForMappings(afterA, b).months.map((month) => month.periodFrom)).toEqual(['2026-02-01']);
    // B mapped: February is complete, March still waits for C: only February is named.
    await mapFixed(practice, b);
    const afterB = await awaiting(practice);
    expect(monthsToQueue(afterB, b)).toEqual(['2026-02-01']);
    expect(monthsWaitingForMappings(afterB, null)).toMatchObject({ plans: 1 });
    // C mapped with February still uncovered: every complete month, whichever plans it holds (D20).
    await mapFixed(practice, c);
    expect(monthsToQueue(await awaiting(practice), c)).toEqual(['2026-02-01', '2026-03-01']);
    // A month a run covers is no longer listed.
    await w.createRun(practice, '2026-02-01', '2026-02-28');
    expect((await awaiting(practice)).map((month) => month.periodFrom)).toEqual(['2026-03-01']);
  });

  it('holds a month on the location while the practice has none, and while its last run failed location_not_ready until the location is saved ready', async () => {
    const none = await w.practice('awaiting-no-location');
    await loadMonth(none);
    await w.withoutLocation(none);
    const plan = await w.planOf(none, 'CE:SYNPLAN-COMM-06');
    await mapFixed(none, plan);
    await mapFixed(none, await w.planOf(none, 'CE:SYNPLAN-UNMAPPED-06'));
    expect((await awaiting(none)).map((month) => month.held)).toEqual(['location']);
    expect(monthsToQueue(await awaiting(none), plan)).toEqual([]);

    // A ZIP Medicare splits between localities, no ZIP+4: the MA plan's lines read the locality, so the run stops.
    const split = await w.practice('awaiting-split-zip');
    await loadMonth(split);
    const ma = await w.planOf(split, 'CE:SYNPLAN-UNMAPPED-06');
    await mapFixed(split, await w.planOf(split, 'CE:SYNPLAN-COMM-06'));
    await w.mapped(split, ma, 'ma_noncontracted', '2026-01-01');
    expect(await w.setLocation(split, '00012')).toBe('zip_plus_four_needed');
    const failed = await priced(split, FEBRUARY.periodFrom, FEBRUARY.periodTo);
    expect(await w.one('SELECT status, failure_code FROM pricing_run WHERE id = $1', [failed])).toEqual({ status: 'failed', failure_code: 'location_not_ready' });
    expect((await awaiting(split)).map((month) => month.held)).toEqual(['location']);
    expect(await w.setLocation(split, '00011')).toBe('ready');
    expect((await awaiting(split)).map((month) => [month.held, month.unmappedPlans])).toEqual([[null, 0]]);
  });

  it('lists the unmapped plans’ totals over a month as a run’s own line set (PRICEABLE_LINE), in plans, lines and signed cents', async () => {
    const { practice } = await february('awaiting-totals');
    expect(await inScope(practice, (scope) => unmappedPlanTotals(scope, practice.practiceId))).toEqual({ plans: 2, lines: 7, chargeCents: '75000' });
    expect(await inScope(practice, (scope) => unmappedPlanTotals(scope, practice.practiceId, FEBRUARY))).toEqual({ plans: 2, lines: 7, chargeCents: '75000' });
    expect(await inScope(practice, (scope) => unmappedPlanTotals(scope, practice.practiceId, { periodFrom: '2026-03-01', periodTo: '2026-03-31' }))).toEqual({ plans: 0, lines: 0, chargeCents: '0' });
    // Another practice's scope reads none of it.
    const other = await w.practice('awaiting-totals-other');
    expect(await inScope(other, (scope) => unmappedPlanTotals(scope, practice.practiceId))).toEqual({ plans: 0, lines: 0, chargeCents: '0' });
    expect(await inScope(other, (scope) => monthsAwaitingMappings(scope, practice.practiceId))).toEqual([]);
  });
});

describe('the months to price again, and their states (MAP-08, PRC-29, PRC-31)', () => {
  it('lists a run priced around plan B once B is mapped, and carries it from ready through being priced, to accept, to triage, and off the list', async () => {
    const { practice, a, b } = await february('again-whole');
    await mapFixed(practice, a);
    const first = await priced(practice, FEBRUARY.periodFrom, FEBRUARY.periodTo);
    // PRC-31: before B's mapping its lines are plans with no mapping, not mapped lines still unpriced.
    expect(await figure(practice)).toEqual({ lines: 0, chargeCents: '0', runs: 0 });
    expect(await toPriceAgain(practice)).toEqual([]);
    await mapFixed(practice, b);
    expect(await figure(practice)).toEqual({ lines: 3, chargeCents: '30000', runs: 1 });
    const listed = await toPriceAgain(practice);
    expect(listed).toEqual([
      expect.objectContaining({ pricingRunId: first, ...FEBRUARY, releaseNo: RELEASE, lines: 3, chargeCents: '30000', state: { kind: 'ready', lastFailure: null } }),
    ]);
    expect(await toPriceAgain(practice, b)).toEqual(listed);
    expect(await toPriceAgain(practice, a)).toEqual([]);
    expect(priceAgainSets(listed).ready.map((month) => month.pricingRunId)).toEqual([first]);

    const rerun = await rerunOf(practice, first);
    expect(await states(practice)).toEqual([[first, 'being_priced']]);
    expect(priceAgainSets(await toPriceAgain(practice)).already).toEqual(new Set([first]));
    await w.execute(practice, rerun);
    expect((await toPriceAgain(practice, b))[0]?.state).toEqual({ kind: 'to_accept', rerunId: rerun });

    // PRC-29: the re-run's diff lists exactly plan B's lines, and every priced line of it gives back its stored cents.
    const bLines = (await w.owner.query<{ id: string }>('SELECT id FROM service_line WHERE payer_plan_key = $1 ORDER BY id', [b])).rows.map((row) => row.id);
    const diff = await inScope(practice, (scope) => compareAcceptance(scope, { practiceId: practice.practiceId, rerunId: rerun, replacesId: first, requestId: requestId(), perPage: 500 }));
    expect(diff.lines.map((line) => line.serviceLineId).sort()).toEqual(bLines);
    await accept(practice, rerun, first);
    const traces = (await w.owner.query<{ trace: unknown; expected_allowed_cents: string }>('SELECT trace, expected_allowed_cents::text FROM priced_line WHERE pricing_run_id = $1 AND unpriced_reason IS NULL', [rerun])).rows;
    expect(traces).toHaveLength(7);
    for (const line of traces) {
      const again = recompute(parseTrace(line.trace));
      expect(again.differences).toEqual([]);
      expect(again.outcome === 'priced' ? again.expectedAllowedCents.toString() : null).toBe(line.expected_allowed_cents);
    }
    expect(await toPriceAgain(practice)).toEqual([]);
    expect(await figure(practice)).toEqual({ lines: 0, chargeCents: '0', runs: 0 });

    // Accepted: B's two short lines (paid 90.00 and 46.00 of 100.00 and 50.00) wait for a person to triage them on Cases.
    const toTriage = await inScope(practice, (scope) => monthsToTriage(scope, practice.practiceId, null, requestId()));
    expect(toTriage).toEqual([{ pricingRunId: rerun, ...FEBRUARY, lines: 2, chargeCents: '22500' }]);
    expect(await inScope(practice, (scope) => monthsToTriage(scope, practice.practiceId, b, requestId()))).toEqual(toTriage);
    expect(await inScope(practice, (scope) => monthsToTriage(scope, practice.practiceId, a, requestId()))).toEqual([]);
    await triageHandler()({ practice_id: practice.practiceId, pricing_run_id: rerun }, w.jobContext(practice.practiceId));
    const stages = await w.owner.query<{ stage: string }>(
      `SELECT DISTINCT ON (s.service_line_id) s.stage FROM line_status s JOIN service_line l ON l.id = s.service_line_id
        WHERE l.payer_plan_key = $1 ORDER BY s.service_line_id, s.seq DESC`,
      [b],
    );
    expect(stages.rows.map((row) => row.stage).every((stage) => stage !== 'flagged')).toBe(true);
    expect(stages.rows.length).toBeGreaterThanOrEqual(2);
    expect(await inScope(practice, (scope) => monthsToTriage(scope, practice.practiceId, null, requestId()))).toEqual([]);
  });

  it('writes one read event per listed run, typed pricing_run with its ID and purpose payer_plan_mapping; the totals write none', async () => {
    const { practice, a, b } = await february('again-audit');
    await mapFixed(practice, a);
    const first = await priced(practice, FEBRUARY.periodFrom, FEBRUARY.periodTo);
    await mapFixed(practice, b);
    const id = requestId();
    await inScope(practice, async (scope) => {
      await mappedNotPricedTotals(scope.client, practice.practiceId);
      await monthsAwaitingMappings(scope, practice.practiceId);
      await unmappedPlanTotals(scope, practice.practiceId);
      await monthsToPriceAgain(scope, practice.practiceId, null, id);
      await monthsToTriage(scope, practice.practiceId, null, id);
    });
    const events = await w.owner.query<{ action: string; object_type: string; object_id: string; purpose: string }>(
      'SELECT action, object_type, object_id, purpose FROM audit_event WHERE request_id = $1',
      [id],
    );
    expect(events.rows).toEqual([{ action: 'read', object_type: 'pricing_run', object_id: first, purpose: 'payer_plan_mapping' }]);
  });

  it('lists a run again once a later plan is mapped after its re-run, and never twice on two plans’ pages', async () => {
    // February holds A, B and C (SYNPLAN-LATE-06, a second payment's claim).
    const { practice, a, b } = await february('again-two-plans', 'SYNPLAN-LATE-06');
    const c = await w.planOf(practice, 'CE:SYNPLAN-LATE-06');
    await mapFixed(practice, a);
    const first = await priced(practice, FEBRUARY.periodFrom, FEBRUARY.periodTo);
    await mapFixed(practice, b);
    const afterB = await rerunOf(practice, first);
    expect(await states(practice)).toEqual([[first, 'being_priced']]);
    // C mapped after that re-run was created: it would leave C's lines NO_MAPPING, so it no longer counts.
    await mapFixed(practice, c);
    expect(await states(practice)).toEqual([[first, 'ready']]);
    expect(await states(practice, b)).toEqual([[first, 'ready']]);
    expect(await states(practice, c)).toEqual([[first, 'ready']]);
    const afterC = await rerunOf(practice, first);
    expect(afterC).not.toBe(afterB);
    // Both plans' pages now read the one counting re-run: neither offers a second.
    for (const plan of [b, c]) {
      const listed = await toPriceAgain(practice, plan);
      expect(listed.map((month) => month.state)).toEqual([{ kind: 'being_priced', rerunId: afterC }]);
      expect(priceAgainSets(listed).ready).toEqual([]);
    }
    expect((await toPriceAgain(practice))[0]?.lines).toBe(6);
  });

  it('reads waiting while a newer first run of overlapping dates is queued, and leaves the list once that run prices the lines', async () => {
    const { practice, a, b } = await february('again-newer-run');
    await mapFixed(practice, a);
    const first = await priced(practice, FEBRUARY.periodFrom, FEBRUARY.periodTo);
    await mapFixed(practice, b);
    const newer = await w.createRun(practice, FEBRUARY.periodFrom, FEBRUARY.periodTo);
    expect((await toPriceAgain(practice))[0]?.state).toEqual({ kind: 'waiting', rerunId: null });
    expect(priceAgainSets(await toPriceAgain(practice))).toEqual({ ready: [], already: new Set() });
    await w.execute(practice, newer);
    expect(await toPriceAgain(practice)).toEqual([]);
    expect(first).not.toBe(newer);
  });

  it('is ready again when its re-run is superseded by an overlapping run completed after it, and when its re-run is pinned to a withdrawn release', async () => {
    // February 5 holds three more claims of plan A, so a run of February 1 to 10 overlaps the month and not B's lines.
    const practice = await w.practice('again-superseded');
    await loadMonth(practice);
    await w.loadVariant(practice, 'MAP-06/remit.835', [
      ['020060001', '020069201'],
      ['MAP06', 'MAR06'],
      ['20260221', '20260205'],
      ['SYNPLAN-UNMAPPED-06', 'SYNPLAN-COMM-06'],
    ]);
    const [a, b] = [await w.planOf(practice, 'CE:SYNPLAN-COMM-06'), await w.planOf(practice, 'CE:SYNPLAN-UNMAPPED-06')];
    await mapFixed(practice, a);
    const first = await priced(practice, FEBRUARY.periodFrom, FEBRUARY.periodTo);
    await mapFixed(practice, b);
    const rerun = await rerunOf(practice, first);
    await w.execute(practice, rerun);
    expect((await toPriceAgain(practice))[0]?.state).toEqual({ kind: 'to_accept', rerunId: rerun });
    await priced(practice, '2026-02-01', '2026-02-10');
    expect((await toPriceAgain(practice)).map((month) => [month.pricingRunId, month.state])).toEqual([[first, { kind: 'ready', lastFailure: null }]]);

    // A re-run pinned to a release since withdrawn can never be accepted either (900004 in force, then rolled back).
    const pinned = await february('again-withdrawn');
    await mapFixed(pinned.practice, pinned.a);
    const run = await priced(pinned.practice, FEBRUARY.periodFrom, FEBRUARY.periodTo);
    await mapFixed(pinned.practice, pinned.b);
    await w.loadRerunRelease();
    const again = await rerunOf(pinned.practice, run, RERUN_RELEASE);
    await w.execute(pinned.practice, again);
    expect((await toPriceAgain(pinned.practice))[0]?.state).toEqual({ kind: 'to_accept', rerunId: again });
    await w.withdraw(RERUN_RELEASE);
    expect((await toPriceAgain(pinned.practice))[0]?.state).toEqual({ kind: 'ready', lastFailure: null });
  });

  it('reads rerun_failed for a re-run that stopped on the billing ZIP, until the location is saved; and ready at once after a job failure, with its line', async () => {
    const { practice, a, b } = await february('again-location');
    await mapFixed(practice, a);
    const first = await priced(practice, FEBRUARY.periodFrom, FEBRUARY.periodTo);
    // B mapped Medicare Advantage non-contracted: its lines read the locality the commercial lines never read.
    await w.mapped(practice, b, 'ma_noncontracted', '2026-01-01');
    const rerun = await rerunOf(practice, first);
    // The ZIP changed after the re-run was created, as no save does (the test's superuser, triggers off, so its saved time stays).
    await w.owner.query('BEGIN');
    await w.owner.query("SET LOCAL session_replication_role = 'replica'");
    await w.owner.query("UPDATE practice_site SET zip = '00012', zip_plus_four = NULL WHERE practice_id = $1", [practice.practiceId]);
    await w.owner.query('COMMIT');
    await w.execute(practice, rerun);
    expect(await w.one('SELECT status, failure_code FROM pricing_run WHERE id = $1', [rerun])).toEqual({ status: 'failed', failure_code: 'location_not_ready' });
    expect((await toPriceAgain(practice))[0]?.state).toEqual({ kind: 'rerun_failed', rerunId: rerun, failureCode: 'location_not_ready', wait: 'location' });
    expect(priceAgainSets(await toPriceAgain(practice))).toEqual({ ready: [], already: new Set() });
    expect(await w.setLocation(practice, '00011')).toBe('ready');
    expect((await toPriceAgain(practice))[0]?.state).toEqual({ kind: 'ready', lastFailure: { rerunId: rerun, failureCode: 'location_not_ready', reason: 'location' } });

    const job = await february('again-job-failed');
    await mapFixed(job.practice, job.a);
    const run = await priced(job.practice, FEBRUARY.periodFrom, FEBRUARY.periodTo);
    await mapFixed(job.practice, job.b);
    const failed = await rerunOf(job.practice, run);
    await failedAs(failed, 'job_failed');
    expect((await toPriceAgain(job.practice))[0]?.state).toEqual({ kind: 'ready', lastFailure: { rerunId: failed, failureCode: 'job_failed', reason: 'job_failed' } });
  });

  it('lists accepted re-runs for triage only for lines a mapping brought to pricing: a re-run after a sign-off alone is not listed, the chain case stays', async () => {
    // A sign-off alone: every line was priced before, none NO_MAPPING.
    const plain = await february('triage-sign-off');
    await mapFixed(plain.practice, plain.a);
    await mapFixed(plain.practice, plain.b);
    const run = await priced(plain.practice, FEBRUARY.periodFrom, FEBRUARY.periodTo);
    await w.signedContract(plain.practice, '2026-01-01', { terms: FIXED_FEE });
    const again = await rerunOf(plain.practice, run);
    await w.execute(plain.practice, again);
    await accept(plain.practice, again, run);
    expect(await inScope(plain.practice, (scope) => monthsToTriage(scope, plain.practice.practiceId, null, requestId()))).toEqual([]);

    // The chain: re-run B after B's mapping, accepted and not triaged; then re-run B2 of B after a sign-off, accepted.
    const chain = await february('triage-chain');
    await mapFixed(chain.practice, chain.a);
    const first = await priced(chain.practice, FEBRUARY.periodFrom, FEBRUARY.periodTo);
    await mapFixed(chain.practice, chain.b);
    const rerunB = await rerunOf(chain.practice, first);
    await w.execute(chain.practice, rerunB);
    await accept(chain.practice, rerunB, first);
    await w.signedContract(chain.practice, '2026-01-01', { terms: FIXED_FEE });
    const rerunB2 = await rerunOf(chain.practice, rerunB);
    await w.execute(chain.practice, rerunB2);
    await accept(chain.practice, rerunB2, rerunB);
    expect(await inScope(chain.practice, (scope) => monthsToTriage(scope, chain.practice.practiceId, null, requestId()))).toEqual([{ pricingRunId: rerunB2, ...FEBRUARY, lines: 2, chargeCents: '22500' }]);
    await triageHandler()({ practice_id: chain.practice.practiceId, pricing_run_id: rerunB2 }, w.jobContext(chain.practice.practiceId));
    expect(await inScope(chain.practice, (scope) => monthsToTriage(scope, chain.practice.practiceId, null, requestId()))).toEqual([]);
  });

  it('offers at most PRICE_AGAIN_LIMIT ready runs per press, oldest first', () => {
    const month = (index: number) => ({
      pricingRunId: randomUUID(),
      periodFrom: `${String(2000 + Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, '0')}-01`,
      periodTo: '',
      releaseNo: RELEASE,
      lines: 1,
      chargeCents: '100',
      newestMappingAt: '',
      state: { kind: 'ready', lastFailure: null } as const,
    });
    const months = Array.from({ length: PRICE_AGAIN_LIMIT + 5 }, (_, index) => month(index));
    const { ready } = priceAgainSets(months);
    expect(ready).toHaveLength(PRICE_AGAIN_LIMIT);
    expect(ready[0]).toBe(months[0]);
  });
});

describe('Medicare content waits (MAP-07, MAP-08; under 900007, which loads MPPR and MUE through 2026-09-30)', () => {
  beforeAll(async () => {
    // From here on 900007 is the release in force (the scratch database is this file's own).
    await w.loadContentGapRelease();
  });

  it('holds an October month whose last run waited on content until a mapping of the practice changes, and then names it to queue', async () => {
    const practice = await w.practice('content-held');
    await loadMonth(practice, '2026-10');
    const [a, b] = [await w.planOf(practice, 'CE:SYNPLAN-COMM-06'), await w.planOf(practice, 'CE:SYNPLAN-UNMAPPED-06')];
    await w.mapped(practice, a, 'ma_noncontracted', '2026-01-01');
    const failed = await priced(practice, '2026-10-01', '2026-10-31', CONTENT_GAP_RELEASE);
    expect(await w.one<{ failure_code: string }>('SELECT failure_code FROM pricing_run WHERE id = $1', [failed])).toMatchObject({ failure_code: expect.stringMatching(/^waiting_on_content_/) as unknown });
    expect((await awaiting(practice)).map((month) => [month.periodFrom, month.held])).toEqual([['2026-10-01', 'content']]);
    // B's mapping is a change of the practice's terms: the wait is released, and the month, now complete, is named.
    await mapFixed(practice, b);
    const after = await awaiting(practice);
    expect(after.map((month) => [month.held, month.unmappedPlans])).toEqual([[null, 0]]);
    expect(monthsToQueue(after, b)).toEqual(['2026-10-01']);
  });

  it('reads rerun_failed for a re-run that waited on content, until a contract version is signed off', async () => {
    const { practice, a, b } = await (async () => {
      const target = await w.practice('content-rerun');
      await loadMonth(target, '2026-10');
      return { practice: target, a: await w.planOf(target, 'CE:SYNPLAN-COMM-06'), b: await w.planOf(target, 'CE:SYNPLAN-UNMAPPED-06') };
    })();
    await mapFixed(practice, a);
    const first = await priced(practice, '2026-10-01', '2026-10-31', CONTENT_GAP_RELEASE);
    expect(await w.one('SELECT status FROM pricing_run WHERE id = $1', [first])).toEqual({ status: 'complete' });
    // B mapped MA non-contracted: its lines read MPPR and MUE for October, which 900007 does not load.
    await w.mapped(practice, b, 'ma_noncontracted', '2026-01-01');
    const rerun = await rerunOf(practice, first, CONTENT_GAP_RELEASE);
    await w.execute(practice, rerun);
    const failure = await w.one<{ status: string; failure_code: string }>('SELECT status, failure_code FROM pricing_run WHERE id = $1', [rerun]);
    expect(failure.failure_code).toMatch(/^waiting_on_content_/);
    expect((await toPriceAgain(practice))[0]?.state).toEqual({ kind: 'rerun_failed', rerunId: rerun, failureCode: failure.failure_code, wait: 'content' });
    await w.signedContract(practice, '2026-01-01', { terms: FIXED_FEE });
    expect((await toPriceAgain(practice))[0]?.state).toEqual({ kind: 'ready', lastFailure: { rerunId: rerun, failureCode: failure.failure_code, reason: 'content' } });
  });
});
