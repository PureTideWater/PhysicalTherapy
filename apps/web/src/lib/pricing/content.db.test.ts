import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { CONTENT_GAP_RELEASE, type Practice, PricingWorld, RELEASE, termsAt } from '@tp/worker/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { feeSchedulePeriodsNotLoaded } from '../coverage/in-effect';
import { contentWindowsOf, forgetContentThrough, multirangeLiteral, releaseManifest } from '../releases/content-through';
import { contentHeadline, monthsWaitingOnContent, waitingOnText } from './content';

/**
 * What Coverage says of Medicare content PaidWhole has not loaded (audit #7 and #59; docs/adr/0071; test matrix RCC-05),
 * against a scratch database: the fee-schedule periods the release in force does not load, with the lines in effect
 * unpriced for want of them (feeSchedulePeriodsNotLoaded, design 5.6.6's cases), under SYNTHETIC release 900001; then,
 * under 900007 (900001 with its per-code MPPR list and its MUE ending 2026-09-30), the months waiting on that content
 * (monthsWaitingOnContent): their totals, quarter and families, and why each is listed (waiting, being priced again
 * under a release in force that loads more of it, or under the practice's changed terms). Each case is a practice of
 * its own, its SYNTHETIC 835 a variant of MAP-05's (97110 twice, 97140 and 97530 on one day, 326.00 billed) moved to
 * the month the case needs.
 */

let w: PricingWorld;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
  forgetContentThrough();
}, 60_000);

afterAll(async () => {
  await w.close();
});

/**
 * MAP-05's remittance with its lines on `serviceDate`, its payment the month after, and 97530 billed as `lastCode`;
 * `other` makes it another payment of other claims, on plan SYNPLAN-MA-95.
 */
async function loadMonth(target: Practice, serviceDate: string, options: { lastCode?: string; other?: boolean } = {}): Promise<void> {
  const [year, month] = [serviceDate.slice(2, 4), Number(serviceDate.slice(5, 7))];
  const paid = String(month + 1).padStart(2, '0');
  const other: (readonly [string, string])[] =
    options.other === true
      ? [
          ['020050001', '020059001'],
          ['SYNEFTMAP05001', 'SYNEFTMAP95001'],
          ['SYNPCNMAP05', 'SYNPCNMAP95'],
          ['SYNCCNMAP05', 'SYNCCNMAP95'],
          ['SYNPLAN-MA-05', 'SYNPLAN-MA-95'],
        ]
      : [];
  await w.loadVariant(target, 'MAP-05/remit.835', [
    ...other,
    ['HC:97530', `HC:${options.lastCode ?? '97530'}`],
    ['20260216', serviceDate.replaceAll('-', '')],
    ['20260310', `20${year}${paid}10`],
    ['260311', `${year}${paid}11`],
  ]);
}

/** Creates (the billing manager) and executes a run of the month. */
async function priceMonth(target: Practice, from: string, to: string, releaseNo: number): Promise<string> {
  const runId = await w.createRun(target, from, to, releaseNo);
  await w.execute(target, runId);
  return runId;
}

/** A practice whose MA plan is priced at 110% of Medicare under terms of the given year basis. */
async function percentMonth(label: string, serviceDate: string, options: { lastCode?: string; yearBasis?: string } = {}): Promise<Practice> {
  const target = await w.practice(label);
  await loadMonth(target, serviceDate, options.lastCode === undefined ? {} : { lastCode: options.lastCode });
  const base = termsAt('110');
  const terms = { ...base, parameters: { ...base.parameters, year_basis: options.yearBasis ?? 'CURRENT' } };
  const signed = await w.signedContract(target, '2025-01-01', { terms });
  await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'contract', '2025-01-01', signed.versionId);
  return target;
}

const inScope = <T>(target: Practice, read: (scope: PracticeScope<ScopeClient>) => Promise<T>) => withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, read);

/** Release 900001's pfs_rvu windows as the Coverage route passes them. */
async function rvuLoaded(target: Practice): Promise<string> {
  return inScope(target, async (scope) => {
    const manifest = (await releaseManifest(scope.client, RELEASE)) ?? '';
    return multirangeLiteral((await contentWindowsOf(scope.client, RELEASE, manifest)).get('pfs_rvu')?.loaded ?? []);
  });
}

/** 2026-Q1 to Q3 loaded, Q4 not. */
const THROUGH_SEPTEMBER = '{[2026-01-01,2026-10-01)}';

describe('the fee-schedule periods not loaded (design 5.6.6)', () => {
  it('names 2026-Q4 for a CURRENT line of 2026-10-14 with no relative value when Q4 is not loaded, with its line and billed cents', async () => {
    const target = await percentMonth('fee-schedule-q4', '2026-10-14', { lastCode: '97750' });
    await priceMonth(target, '2026-10-01', '2026-10-31', RELEASE);
    expect(await inScope(target, async (scope) => feeSchedulePeriodsNotLoaded(scope, target.practiceId, THROUGH_SEPTEMBER))).toEqual([
      { period: { kind: 'quarter', label: '2026-Q4' }, lines: 1, chargeCents: '7600' },
    ]);
    // Under the release's own windows (all of 2026), the date is loaded: the code simply has no relative value.
    const loaded = await rvuLoaded(target);
    expect(await inScope(target, async (scope) => feeSchedulePeriodsNotLoaded(scope, target.practiceId, loaded))).toEqual([]);
  });

  it('names nothing for a CURRENT line of 2026-08-03 whose code has no relative value: its date is loaded', async () => {
    const target = await percentMonth('fee-schedule-august', '2026-08-03', { lastCode: '97750' });
    await priceMonth(target, '2026-08-01', '2026-08-31', RELEASE);
    const unpriced = await w.one<{ n: number }>("SELECT count(*)::int AS n FROM priced_line WHERE practice_id = $1 AND unpriced_reason = 'NO_PFS_VALUE'", [target.practiceId]);
    expect(unpriced.n).toBe(1);
    expect(await inScope(target, async (scope) => feeSchedulePeriodsNotLoaded(scope, target.practiceId, THROUGH_SEPTEMBER))).toEqual([]);
  });

  it('names the year 2025 for terms locked to 2025 under a release with no 2025 window, every line of the month in it', async () => {
    const target = await percentMonth('fee-schedule-locked', '2026-05-12', { yearBasis: 'LOCKED:2025' });
    await priceMonth(target, '2026-05-01', '2026-05-31', RELEASE);
    const loaded = await rvuLoaded(target);
    expect(loaded).toBe('{[2026-01-01,2027-01-01)}');
    expect(await inScope(target, async (scope) => feeSchedulePeriodsNotLoaded(scope, target.practiceId, loaded))).toEqual([
      { period: { kind: 'year', label: '2025' }, lines: 3, chargeCents: '32600' },
    ]);
    // Another practice's scope reads none of these lines.
    const other = await w.practice('fee-schedule-other');
    expect(await inScope(other, async (scope) => feeSchedulePeriodsNotLoaded(scope, target.practiceId, loaded))).toEqual([]);
  });

  it('lists the periods in date order: a locked year before a later quarter', async () => {
    const target = await percentMonth('fee-schedule-order', '2026-10-14', { lastCode: '97750' });
    await priceMonth(target, '2026-10-01', '2026-10-31', RELEASE);
    const locked = await w.signedContract(target, '2025-01-01', {
      terms: {
        ...termsAt('110'),
        parameters: { ...termsAt('110').parameters, year_basis: 'LOCKED:2025' },
      },
    });
    await loadMonth(target, '2026-11-09', { other: true });
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-95'), 'contract', '2025-01-01', locked.versionId);
    await priceMonth(target, '2026-11-01', '2026-11-30', RELEASE);
    expect((await inScope(target, async (scope) => feeSchedulePeriodsNotLoaded(scope, target.practiceId, THROUGH_SEPTEMBER))).map((row) => row.period.label)).toEqual(['2025', '2026-Q4']);
  });
});

describe('the months waiting on Medicare content (RCC-05)', () => {
  beforeAll(async () => {
    // From here on 900007 is the release in force; the last test withdraws it.
    await w.loadContentGapRelease();
  });

  /** An October 2026 practice whose MA plan is mapped Medicare Advantage non-contracted (every flag on), its run failed under 900007. */
  async function waitingMa(label: string): Promise<Practice> {
    const target = await w.practice(label);
    await loadMonth(target, '2026-10-14');
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    const runId = await priceMonth(target, '2026-10-01', '2026-10-31', CONTENT_GAP_RELEASE);
    expect(await w.one('SELECT status, failure_code FROM pricing_run WHERE id = $1', [runId])).toEqual({
      status: 'failed',
      failure_code: 'waiting_on_content_mppr_mue',
    });
    return target;
  }

  it('lists a month whose run failed waiting_on_content_mppr_mue: its totals, its quarter and both families', async () => {
    const target = await waitingMa('waiting-ma');
    const months = await inScope(target, async (scope) => monthsWaitingOnContent(scope, target.practiceId));
    expect(months).toEqual([
      {
        periodFrom: '2026-10-01',
        periodTo: '2026-10-31',
        kind: 'waiting',
        failureCode: 'waiting_on_content_mppr_mue',
        failedReleaseNo: CONTENT_GAP_RELEASE,
        families: ['mppr', 'mue'],
        quarters: ['2026-Q4'],
        releaseInForce: CONTENT_GAP_RELEASE,
        totals: {
          lines: 3,
          claims: 1,
          chargeCents: '32600',
          paidCents: '17641',
        },
      },
    ]);
    expect(contentHeadline(months)).toEqual({
      lines: 3,
      claims: 1,
      chargeCents: '32600',
      paidCents: '17641',
    });
    expect(months.map(waitingOnText)).toEqual(['the 2026-Q4 Medicare content (MPPR, MUE)']);
    // Another practice's scope lists nothing of it.
    const other = await w.practice('waiting-other');
    expect(await inScope(other, async (scope) => monthsWaitingOnContent(scope, target.practiceId))).toEqual([]);
  });

  it('names the MUE alone for terms that apply only the coding edits', async () => {
    const target = await w.practice('waiting-mue');
    await loadMonth(target, '2026-10-14');
    const signed = await w.signedContract(target, '2026-01-01', {
      terms: {
        ...termsAt('110'),
        flags: { timed_units_rule: 'PER_CODE', apply_ncci: true },
      },
    });
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'contract', '2026-01-01', signed.versionId);
    await priceMonth(target, '2026-10-01', '2026-10-31', CONTENT_GAP_RELEASE);
    const months = await inScope(target, async (scope) => monthsWaitingOnContent(scope, target.practiceId));
    expect(months).toMatchObject([
      {
        kind: 'waiting',
        failureCode: 'waiting_on_content_mue',
        families: ['mue'],
        quarters: ['2026-Q4'],
      },
    ]);
    expect(months.map(waitingOnText)).toEqual(['the 2026-Q4 Medicare content (MUE)']);
  });

  it('lists nothing for a month with a newer line its failed run has not seen', async () => {
    const target = await waitingMa('waiting-newer-line');
    // A newer line of the month: the monitor plans it again, so it is no longer waiting on that run.
    await loadMonth(target, '2026-10-20', { other: true });
    expect(await inScope(target, async (scope) => monthsWaitingOnContent(scope, target.practiceId))).toEqual([]);
  });

  it('reads terms_changed once a contract version of the practice is created after the run', async () => {
    const target = await waitingMa('waiting-terms');
    await w.signedContract(target, '2026-01-01');
    const months = await inScope(target, async (scope) => monthsWaitingOnContent(scope, target.practiceId));
    expect(months).toMatchObject([{ kind: 'terms_changed', failureCode: 'waiting_on_content_mppr_mue' }]);
    expect(months.map(waitingOnText)).toEqual(['being priced again under the practice’s changed terms']);
  });

  it('reads repricing once the release in force loads more of the month (last in this block: it withdraws 900007)', async () => {
    const target = await waitingMa('waiting-repricing');
    await w.withdraw(CONTENT_GAP_RELEASE);
    const months = await inScope(target, async (scope) => monthsWaitingOnContent(scope, target.practiceId));
    // 900001, in force again, loads the MPPR and the MUE for all of 2026; the quarter is still the failed release's gap.
    expect(months).toMatchObject([
      {
        kind: 'repricing',
        failedReleaseNo: CONTENT_GAP_RELEASE,
        releaseInForce: RELEASE,
        quarters: ['2026-Q4'],
      },
    ]);
    expect(months.map(waitingOnText)).toEqual([`being priced again under release ${String(RELEASE)}`]);
  });
});
