import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { allocateProRata } from '@tp/edi835';
import { claimLinePayments, entriesById, recomputeStatement, roiStatementCsv } from '@tp/ledger';
import { cents } from '@tp/money';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import { type Scope, ledgerEntries } from './ledger';
import { matchClaimByHand } from './manual';
import { lineCorrections } from './patient-share';
import { storedStatement } from './print';
import { approvalShortfalls } from './shortfalls';
import { generateRoiStatement, practiceLedgerTotals } from './statements';
import { LedgerWorld, ledSettings } from './test-support/ledger-world';

/**
 * The recovery ledger's amounts in payment terms against PostgreSQL, through the reconcile step's own
 * code (PRD 13; docs/adr/0067; test matrix LED-14 to LED-18): the outcome is decided on the allowed
 * amount, and every amount the ledger writes is the payer's cash. Each case is a practice of its own, its
 * SYNTHETIC LED fixture's original payment (a line with a patient's share) loaded, priced and triaged into
 * a case as ledger.db.test.ts does, which this file leaves untouched; "billable to the patient" is read
 * beside the ledger (patient-share.ts) and counted in no figure.
 */

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

interface LedCase {
  readonly practice: Practice;
  readonly caseId: string;
  readonly serviceLineId: string;
}

/** A practice with its LED case open from `original` (the fixture's original.835 unless named). */
async function opened(id: string, original = 'original.835'): Promise<LedCase> {
  const practice = await w.practice(`${id} ${randomUUID().slice(0, 8)}`, ledSettings());
  return { practice, ...(await w.caseFor(practice, `${id}/${original}`)) };
}

/** The case, with the fixture's adjusted remittance (or the one named) loaded and reconciled. */
async function scenario(id: string, adjusted = 'adjusted.835', original = 'original.835'): Promise<LedCase> {
  const led = await opened(id, original);
  await w.load(led.practice, `${id}/${adjusted}`);
  await w.reconcile(led.practice);
  return led;
}

const loaded = async (practice: Practice, fixture: string) => {
  await w.load(practice, fixture);
  return w.reconcile(practice);
};

const exported = async (practice: Practice, fixture: string, as: 'posting_export' | 'eft_export') => w.reconcile(practice, { documentId: await w.stageExport(practice, fixture, as) });

const inJob = <T>(practice: Practice, run: (scope: Scope) => Promise<T>) => withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => run(scope as Scope));

const totals = (practice: Practice) => inJob(practice, (scope) => practiceLedgerTotals(scope, practice.practiceId));

const corrections = (practice: Practice, serviceLineIds: readonly string[]) => inJob(practice, (scope) => lineCorrections(scope, practice.practiceId, serviceLineIds));

const correctionOf = async (practice: Practice, serviceLineId: string) => (await corrections(practice, [serviceLineId])).get(serviceLineId);

const shortfalls = (practice: Practice, serviceLineId: string) => inJob(practice, (scope) => approvalShortfalls(scope, practice.practiceId, [serviceLineId]));

/** The claim matches' outcomes, sorted (one reconcile's matches share a time). */
const claimOutcomes = async (practice: Practice) => (await w.rows<{ outcome: string }>(practice, "SELECT outcome FROM ledger_match WHERE kind = 'claim'")).map((row) => row.outcome).sort();

const count = async (practice: Practice, sql: string) => ((await w.rows<{ n: number }>(practice, sql))[0] as { n: number }).n;

const recoupmentMatches = (practice: Practice) => count(practice, "SELECT count(*)::int AS n FROM ledger_match WHERE kind = 'recoupment'");

const responses = (practice: Practice) => count(practice, 'SELECT count(*)::int AS n FROM payer_response');

const sharesOf = (stages: readonly { readonly stage: string; readonly amountCents: string }[], stage: string) => stages.filter((entry) => entry.stage === stage).map((entry) => entry.amountCents);

/** A stage's amounts smallest first: the rows of one export are matched in one reconcile, whose matches share a time. */
const sortedSharesOf = (stages: readonly { readonly stage: string; readonly amountCents: string }[], stage: string) => sharesOf(stages, stage).sort((a, b) => Number(BigInt(a) - BigInt(b)));

describe('a line with coinsurance (LED-14)', () => {
  it('approves the payer’s payment increase, not the allowed increase', async () => {
    const led = await opened('LED-14');
    await w.load(led.practice, 'LED-14/adjusted.835');
    const summary = await w.reconcile(led.practice);
    expect(summary.remittances).toMatchObject({ approved: 1, confirmed: 0, noPaymentIncrease: 0, decreased: 0, decreasedNoEntry: 0, noChange: 0 });
    // 80.00 paid against the 56.00 before it: 24.00, never the 30.00 the allowed amount rose by.
    expect(await w.stages(led.practice)).toEqual([{ stage: 'approved', amountCents: '2400' }]);
    expect(await claimOutcomes(led.practice)).toEqual(['approved']);
    expect(await w.lineStage(led.practice, led.serviceLineId)).toBe('payer_approved');
  });

  it('posts the line-level row of 80.00 net of the 56.00 payment it replaced', async () => {
    const led = await scenario('LED-14');
    await exported(led.practice, 'LED-14/lines-posting-export.csv', 'posting_export');
    expect(await w.stages(led.practice)).toEqual([
      { stage: 'approved', amountCents: '2400' },
      { stage: 'posted', amountCents: '2400' },
    ]);
  });

  it('deposits the 24.00 check and recovers the line, with nothing approved left unproved', async () => {
    const led = await scenario('LED-14');
    await exported(led.practice, 'LED-14/posting-export.csv', 'posting_export');
    await exported(led.practice, 'LED-14/eft-export.csv', 'eft_export');
    expect(await totals(led.practice)).toMatchObject({ approvedCents: 2400n, postedCents: 2400n, depositedCents: 2400n, recoupedCents: 0n, recoveredCents: 2400n, payerApprovedCents: 2400n });
    expect(await w.lineStage(led.practice, led.serviceLineId)).toBe('recovered');
  });

  it('takes back what was paid when the correction is reversed alone, and reopens the line', async () => {
    const led = await scenario('LED-14');
    await exported(led.practice, 'LED-14/lines-posting-export.csv', 'posting_export');
    await exported(led.practice, 'LED-14/eft-export.csv', 'eft_export');
    const summary = await loaded(led.practice, 'LED-14/reversal.835');
    expect(summary.remittances.recoupments).toBe(1);
    expect(sharesOf(await w.stages(led.practice), 'recouped')).toEqual(['-2400']);
    expect(await totals(led.practice)).toMatchObject({ approvedCents: 2400n, recoupedCents: -2400n, recoveredCents: 0n });
    expect(await w.lineStage(led.practice, led.serviceLineId)).toBe('actionable');
    // Taken back once.
    await w.reconcile(led.practice);
    expect(sharesOf(await w.stages(led.practice), 'recouped')).toEqual(['-2400']);
  });

  it('shows the allowed increase and the patient’s coinsurance beside the ledger, in no total', async () => {
    const led = await scenario('LED-14');
    await exported(led.practice, 'LED-14/eft-export.csv', 'eft_export');
    const correction = await correctionOf(led.practice, led.serviceLineId);
    expect(correction).toMatchObject({
      caseId: led.caseId,
      correction: null,
      billable: { allowedIncreaseCents: 3000n, paymentIncreaseCents: 2400n, shareChange: { coinsuranceCents: 600n, deductibleCents: 0n, copayCents: 0n, otherCents: 0n }, otherReductionCents: 0n, billableCents: 600n, allocatedFromClaim: false },
    });
    expect(correction?.matches).toMatchObject([{ outcome: 'approved', allowed: 'higher', reading: 'approved', entryCents: 2400n, change: { paymentIncreaseCents: 2400n, billableCents: 600n } }]);
    expect(await totals(led.practice)).toMatchObject({ approvedCents: 2400n, depositedCents: 2400n, recoveredCents: 2400n, payerApprovedCents: 2400n, interestCents: 0n });
  });

  it('compares a claim matched by hand as the reconcile does', async () => {
    const led = await opened('LED-14');
    await w.load(led.practice, 'LED-14/adjusted.835');
    const [claim] = await w.rows<{ id: string }>(led.practice, "SELECT id FROM claim WHERE claim_status_code <> '22' AND paid_cents = 8000");
    const matched = await w.manual(led.practice, (context) => matchClaimByHand(context, { practiceId: led.practice.practiceId, claimId: claim?.id ?? '', serviceLineId: led.serviceLineId }));
    expect(matched.outcome).toBe('approved');
    expect(await w.entries(led.practice)).toMatchObject([{ stage: 'approved', amount_cents: '2400', created_by: led.practice.manager, match_id: matched.matchId }]);
  });

  it('approves a reissue after the reversal for its payment over the original, against an allowed baseline back at 70.00', async () => {
    const led = await scenario('LED-14');
    await loaded(led.practice, 'LED-14/reversal.835');
    const summary = await loaded(led.practice, 'LED-14/reissued.835');
    // Allowed 75.00 against 70.00 (never the 76.00 a cash take-back would leave it at, which reads no change): 60.00 paid against 56.00.
    expect(summary.remittances).toMatchObject({ approved: 1, noChange: 0 });
    expect(sharesOf(await w.stages(led.practice), 'approved')).toEqual(['2400', '400']);
    expect(await claimOutcomes(led.practice)).toEqual(['approved', 'approved']);
    expect(await responses(led.practice)).toBe(0);
    expect((await correctionOf(led.practice, led.serviceLineId))?.billable).toMatchObject({ allowedIncreaseCents: 500n, paymentIncreaseCents: 400n, shareChange: { coinsuranceCents: 100n } });
  });

  it('proves the line’s net share of a check it shares, posted in part', async () => {
    const led = await scenario('LED-14', 'shared-adjusted.835');
    await exported(led.practice, 'LED-14/shared-posting-export.csv', 'posting_export');
    // 87.00 of the 174.00 check posts half of the line's 24.00 net share; a gross 80.00 share would post 24.00 (40.00, capped).
    const posted = (await w.entries(led.practice)).filter((entry) => entry.stage === 'posted');
    expect(posted).toMatchObject([{ amount_cents: '1200', allocated: true }]);
  });

  it('compares two candidates of one reconcile with the pass’s own baselines', async () => {
    const led = await opened('LED-14');
    await w.load(led.practice, 'LED-14/adjusted.835');
    await w.load(led.practice, 'LED-14/lowered.835');
    const summary = await w.reconcile(led.practice);
    // The second (allowed 87.50, paid 70.00) is compared with the first's 100.00 and 80.00, never the stored 70.00 and 56.00.
    expect(summary.remittances).toMatchObject({ approved: 1, decreased: 1, recoupments: 0 });
    expect(await w.stages(led.practice)).toEqual([
      { stage: 'approved', amountCents: '2400' },
      { stage: 'recouped', amountCents: '-1000' },
    ]);
    expect(await claimOutcomes(led.practice)).toEqual(['approved', 'decreased']);
  });

  it('measures a line’s cash as its share of CLP04 when the coinsurance sits at the claim’s level (probe E8)', async () => {
    const led = await scenario('LED-14', 'claim-level-adjusted.835', 'claim-level-original.835');
    // SVC03 rose 70.00 to 100.00, but the claim's PR-2 rose 14.00 to 20.00: CLP04 56.00 to 80.00, so the payer paid 24.00 more, never 30.00.
    expect(await w.stages(led.practice)).toEqual([{ stage: 'approved', amountCents: '2400' }]);
    await exported(led.practice, 'LED-14/claim-level-eft-export.csv', 'eft_export');
    expect(await w.stages(led.practice)).toEqual([
      { stage: 'approved', amountCents: '2400' },
      { stage: 'deposited', amountCents: '2400' },
    ]);
    expect(await totals(led.practice)).toMatchObject({ approvedCents: 2400n, depositedCents: 2400n, recoveredCents: 2400n, payerApprovedCents: 2400n });
    expect(await w.lineStage(led.practice, led.serviceLineId)).toBe('recovered');
    // The claim's 6.00 more PR is the patient's, shown once as billable, never again as the payer's other reductions.
    const correction = await correctionOf(led.practice, led.serviceLineId);
    expect(correction?.billable).toMatchObject({
      allowedIncreaseCents: 3000n,
      paymentIncreaseCents: 2400n,
      shareChange: { coinsuranceCents: 600n, deductibleCents: 0n, copayCents: 0n, otherCents: 0n },
      otherReductionCents: 0n,
      billableCents: 600n,
      allocatedFromClaim: true,
    });
    expect(correction?.matches).toMatchObject([{ reading: 'approved', entryCents: 2400n, change: { paymentIncreaseCents: 2400n, otherReductionCents: 0n, billableCents: 600n } }]);
  });

  it('splits the claim-level CAS no SVC03 holds by the parser’s own rule, the one the patient’s share is allocated by (property)', () => {
    const amount = fc.bigInt({ min: -200_000n, max: 200_000n });
    fc.assert(
      fc.property(amount, fc.array(fc.tuple(amount, amount), { minLength: 1, maxLength: 6 }), (claimPaid, lines) => {
        const parts = claimLinePayments({ claimPaidCents: cents(claimPaid), lines: lines.map(([charge, paid]) => ({ chargeCents: cents(charge), servicePaidCents: cents(paid), carriesAdjustments: true })) }).map(
          (line, index) => (lines[index] as [bigint, bigint])[1] - line.paidCents,
        );
        const left = lines.reduce((sum, [, paid]) => sum + paid, 0n) - claimPaid;
        expect(parts).toEqual(allocateProRata(cents(left), lines.map(([charge]) => cents(charge))));
      }),
    );
  });
});

describe('a correction a deductible absorbed (LED-15)', () => {
  it('writes no entry and no payer response when the deductible took the whole increase, and shows the balance as the patient’s', async () => {
    const led = await opened('LED-15');
    // A submission the reprocessing could answer: no change would be recorded as its response.
    await w.submit(led.practice, led.caseId, '2026-05-04');
    await w.load(led.practice, 'LED-15/adjusted.835');
    const summary = await w.reconcile(led.practice);
    expect(summary.remittances).toMatchObject({ approved: 0, noPaymentIncrease: 1, noChange: 0, decreased: 0 });
    expect(await w.entries(led.practice)).toEqual([]);
    expect(await claimOutcomes(led.practice)).toEqual(['approved']);
    expect(await responses(led.practice)).toBe(0);
    expect(await w.lineStage(led.practice, led.serviceLineId)).toBe('actionable');
    const correction = await correctionOf(led.practice, led.serviceLineId);
    expect(correction).toMatchObject({
      correction: 'patient_balance',
      billable: { allowedIncreaseCents: 3000n, paymentIncreaseCents: 0n, shareChange: { deductibleCents: 3000n, coinsuranceCents: 0n }, billableCents: 3000n, otherReductionCents: 0n },
      matches: [{ outcome: 'approved', allowed: 'higher', reading: 'patient_balance', entryCents: 0n }],
    });
    // The stored case state is case_rules' as ever (Q1): the line is still actionable, so the case is not resolved.
    expect(await w.caseState(led.practice, led.caseId)).toBe('submitted');
    expect(await totals(led.practice)).toMatchObject({ approvedCents: 0n, recoveredCents: 0n, payerApprovedCents: 0n });
  });

  it('proves nothing from the correction’s 40.00 line row, and takes nothing back when it is reversed', async () => {
    const led = await scenario('LED-15');
    await exported(led.practice, 'LED-15/lines-posting-export.csv', 'posting_export');
    expect(await w.entries(led.practice)).toEqual([]);
    const summary = await loaded(led.practice, 'LED-15/reversal.835');
    expect(summary.remittances.recoupments).toBe(0);
    expect(await recoupmentMatches(led.practice)).toBe(0);
    expect(await w.entries(led.practice)).toEqual([]);
  });

  it('approves what the payer paid when the deductible absorbed part, deposits it, and takes the fall back on a later reprocessing (Q2)', async () => {
    const led = await scenario('LED-15', 'partial-adjusted.835', 'partial-original.835');
    expect(await w.stages(led.practice)).toEqual([{ stage: 'approved', amountCents: '1000' }]);
    await exported(led.practice, 'LED-15/partial-eft-export.csv', 'eft_export');
    expect(await w.lineStage(led.practice, led.serviceLineId)).toBe('recovered');
    expect((await correctionOf(led.practice, led.serviceLineId))?.billable).toMatchObject({ allowedIncreaseCents: 3000n, paymentIncreaseCents: 1000n, shareChange: { deductibleCents: 2000n }, billableCents: 2000n });
    // The same allowed amount paying 20.00 against 30.00: decreased, the 10.00 taken back.
    const summary = await loaded(led.practice, 'LED-15/partial-lowered.835');
    expect(summary.remittances).toMatchObject({ decreased: 1, noChange: 0 });
    expect(await w.stages(led.practice)).toEqual([
      { stage: 'approved', amountCents: '1000' },
      { stage: 'deposited', amountCents: '1000' },
      { stage: 'recouped', amountCents: '-1000' },
    ]);
    expect(await claimOutcomes(led.practice)).toEqual(['approved', 'decreased']);
    expect((await correctionOf(led.practice, led.serviceLineId))?.matches.at(-1)).toMatchObject({ outcome: 'decreased', allowed: 'same', reading: 'taken_back', entryCents: -1000n });
  });

  it('records a higher allowed amount paying less with nothing approved as decreased with no entry, then approves against the payment before it (B2)', async () => {
    const led = await opened('LED-15');
    await w.submit(led.practice, led.caseId, '2026-05-04');
    await w.load(led.practice, 'LED-15/raised-lower.835');
    const summary = await w.reconcile(led.practice);
    expect(summary.remittances).toMatchObject({ approved: 0, decreased: 0, decreasedNoEntry: 1, noChange: 0, recoupments: 0 });
    expect(await claimOutcomes(led.practice)).toEqual(['decreased']);
    expect(await w.entries(led.practice)).toEqual([]);
    expect(await responses(led.practice)).toBe(0);
    expect((await correctionOf(led.practice, led.serviceLineId))?.matches).toMatchObject([{ outcome: 'decreased', allowed: 'higher', reading: 'nothing_to_take_back', entryCents: 0n }]);
    // Neither baseline moved: 50.00 against the 40.00 before it, never 16.00 against 34.00.
    await loaded(led.practice, 'LED-15/raised-after.835');
    expect(await w.stages(led.practice)).toEqual([{ stage: 'approved', amountCents: '1000' }]);
  });

  it('shows a correction other reductions took whole as such, never billable to the patient', async () => {
    const led = await opened('LED-15');
    // SYNTHETIC: the correction's deductible unchanged at 30.00, and another reduction (OA-23) of 30.00 taking the increase.
    await w.triage.pricing.loadVariant(led.practice, 'LED-15/adjusted.835', [
      ['CLP*SYNPCNLED15001*1*150.00*40.00*60.00', 'CLP*SYNPCNLED15001*1*150.00*40.00*30.00'],
      ['CAS*PR*1*60.00', 'CAS*PR*1*30.00~CAS*OA*23*30.00'],
      ['SE*34*0001', 'SE*35*0001'],
    ]);
    const summary = await w.reconcile(led.practice);
    expect(summary.remittances).toMatchObject({ noPaymentIncrease: 1, noChange: 0 });
    expect(await w.entries(led.practice)).toEqual([]);
    expect(await correctionOf(led.practice, led.serviceLineId)).toMatchObject({
      correction: 'other_reductions',
      billable: { allowedIncreaseCents: 3000n, paymentIncreaseCents: 0n, otherReductionCents: 3000n, billableCents: 0n },
      matches: [{ reading: 'other_reductions' }],
    });
  });
});

describe('a line with a copay (LED-16)', () => {
  it('approves the allowed increase when the copay is unchanged, and posts and deposits it', async () => {
    const led = await scenario('LED-16');
    await exported(led.practice, 'LED-16/posting-export.csv', 'posting_export');
    await exported(led.practice, 'LED-16/eft-export.csv', 'eft_export');
    expect(await w.stages(led.practice)).toEqual([
      { stage: 'approved', amountCents: '3000' },
      { stage: 'posted', amountCents: '3000' },
      { stage: 'deposited', amountCents: '3000' },
    ]);
    expect((await correctionOf(led.practice, led.serviceLineId))?.billable).toMatchObject({ allowedIncreaseCents: 3000n, paymentIncreaseCents: 3000n, shareChange: { copayCents: 0n }, billableCents: 0n });
    expect(await w.lineStage(led.practice, led.serviceLineId)).toBe('recovered');
  });

  it('splits a claim’s interest and takes a withholding in order by what the payer pays on each of two lines', async () => {
    const led = await opened('LED-16', 'two-lines-original.835');
    const lines = await w.rows<{ service_line_id: string }>(led.practice, 'SELECT cl.service_line_id FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id ORDER BY l.line_no');
    expect(lines).toHaveLength(2);
    const [coinsurance, copay] = lines.map((line) => line.service_line_id) as [string, string];
    await loaded(led.practice, 'LED-16/two-lines-adjusted.835');
    const of = async (serviceLineId: string) => (await w.entries(led.practice)).filter((entry) => entry.service_line_id === serviceLineId).map((entry) => ({ stage: entry.stage, amountCents: entry.amount_cents, allocated: entry.allocated }));
    // 5.40 of interest by 24.00 and 30.00, never by the allowed 30.00 and 30.00 (2.70 each).
    expect(await of(coinsurance)).toEqual([
      { stage: 'approved', amountCents: '2400', allocated: false },
      { stage: 'interest', amountCents: '240', allocated: true },
    ]);
    expect(await of(copay)).toEqual([
      { stage: 'approved', amountCents: '3000', allocated: false },
      { stage: 'interest', amountCents: '300', allocated: true },
    ]);
    // 30.00 withheld in line order, each line at most what is approved for it: 24.00, then 6.00.
    await loaded(led.practice, 'LED-16/two-lines-wo.835');
    expect(sharesOf((await of(coinsurance)) as never, 'recouped')).toEqual(['-2400']);
    expect(sharesOf((await of(copay)) as never, 'recouped')).toEqual(['-600']);
  });
});

describe('a line holding two approvals, then a reversal (LED-17)', () => {
  it('(a) proves each line row net of the claim it replaced, and takes back every approval when the last is reversed and nothing stands', async () => {
    const led = await scenario('LED-17');
    await loaded(led.practice, 'LED-17/second.835');
    expect(sharesOf(await w.stages(led.practice), 'approved')).toEqual(['800', '1600']);
    // The line rows load before the deposits: 64.00 proves 8.00 and 80.00 proves 16.00 (a gross share would prove 24.00 from the first).
    await exported(led.practice, 'LED-17/lines-posting-export.csv', 'posting_export');
    expect(sortedSharesOf(await w.stages(led.practice), 'posted')).toEqual(['800', '1600']);
    await exported(led.practice, 'LED-17/eft-export.csv', 'eft_export');
    expect(sortedSharesOf(await w.stages(led.practice), 'deposited')).toEqual(['800', '1600']);
    expect(await w.lineStage(led.practice, led.serviceLineId)).toBe('recovered');
    await loaded(led.practice, 'LED-17/reversal.835');
    expect(sharesOf(await w.stages(led.practice), 'recouped')).toEqual(['-2400']);
    expect(await totals(led.practice)).toMatchObject({ approvedCents: 2400n, postedCents: 2400n, depositedCents: 2400n, recoupedCents: -2400n, recoveredCents: 0n });
    expect(await w.lineStage(led.practice, led.serviceLineId)).toBe('actionable');
  });

  it('(b) takes back only the reversed correction’s own approval while the earlier payment stands', async () => {
    const led = await scenario('LED-17');
    await loaded(led.practice, 'LED-17/second-alone.835');
    await exported(led.practice, 'LED-17/second-alone-eft-export.csv', 'eft_export');
    expect(sortedSharesOf(await w.stages(led.practice), 'deposited')).toEqual(['800', '1600']);
    await loaded(led.practice, 'LED-17/retracted.835');
    expect(sharesOf(await w.stages(led.practice), 'recouped')).toEqual(['-1600']);
    expect(await totals(led.practice)).toMatchObject({ recoupedCents: -1600n, recoveredCents: 800n });
  });

  it('(c) takes back nothing for a late reversal of a superseded claim while the later claim stands', async () => {
    const led = await scenario('LED-17');
    await loaded(led.practice, 'LED-17/second-alone.835');
    // The 80.00 check proves 16.00, net of the 64.00 it replaced.
    await exported(led.practice, 'LED-17/second-alone-eft-export.csv', 'eft_export');
    expect(await w.lineStage(led.practice, led.serviceLineId)).toBe('recovered');
    const summary = await loaded(led.practice, 'LED-17/late-reversal.835');
    expect(summary.remittances.recoupments).toBe(0);
    expect(summary.notified).toBe(0);
    expect(await recoupmentMatches(led.practice)).toBe(0);
    expect(await totals(led.practice)).toMatchObject({ approvedCents: 2400n, depositedCents: 2400n, recoupedCents: 0n, recoveredCents: 2400n });
    expect(await w.lineStage(led.practice, led.serviceLineId)).toBe('recovered');
  });

  it('compares the second correction of one reconcile with the first’s payment, never the stored original', async () => {
    const led = await opened('LED-17');
    await w.load(led.practice, 'LED-17/adjusted.835');
    await w.load(led.practice, 'LED-17/second.835');
    await w.reconcile(led.practice);
    expect(await w.stages(led.practice)).toEqual([
      { stage: 'approved', amountCents: '800' },
      { stage: 'approved', amountCents: '1600' },
    ]);
    // Walked again from the stored chain, the two matches of one reconcile keep the order they were made in.
    const correction = await correctionOf(led.practice, led.serviceLineId);
    expect(correction?.matches.map((match) => match.change.paymentIncreaseCents)).toEqual([800n, 1600n]);
    expect(correction?.billable).toMatchObject({ allowedIncreaseCents: 3000n, paymentIncreaseCents: 2400n, shareChange: { coinsuranceCents: 600n } });
  });
});

describe('a payer response accepted before the remittance pays it (LED-18)', () => {
  async function accepted(amountCents: bigint): Promise<LedCase> {
    const led = await opened('LED-18');
    const { submissionId } = await w.submit(led.practice, led.caseId, '2026-05-04');
    await w.respond(led.practice, submissionId, { kind: 'accepted', amountCents, receivedOn: '2026-05-20' });
    expect((await w.reconcile(led.practice)).approvedFromResponses).toBe(1);
    return led;
  }

  it('is confirmed by the remittance paying the acceptance, with no shortfall, and recovered by its deposit', async () => {
    const led = await accepted(2400n);
    expect(await w.entries(led.practice)).toMatchObject([{ stage: 'approved', amount_cents: '2400', evidence_kind: 'payer_response', match_id: null }]);
    const summary = await loaded(led.practice, 'LED-18/adjusted.835');
    expect(summary.remittances).toMatchObject({ approved: 0, confirmed: 1, noChange: 0 });
    expect(await claimOutcomes(led.practice)).toEqual(['approved']);
    expect(await shortfalls(led.practice, led.serviceLineId)).toEqual(new Map());
    expect((await correctionOf(led.practice, led.serviceLineId))?.matches).toMatchObject([{ reading: 'confirmed', change: { paymentIncreaseCents: 2400n, billableCents: 600n } }]);
    await exported(led.practice, 'LED-18/eft-export.csv', 'eft_export');
    expect(await w.stages(led.practice)).toEqual([
      { stage: 'approved', amountCents: '2400' },
      { stage: 'deposited', amountCents: '2400' },
    ]);
    expect(await totals(led.practice)).toMatchObject({ approvedCents: 2400n, depositedCents: 2400n, recoveredCents: 2400n, payerApprovedCents: 2400n });
    expect(await w.lineStage(led.practice, led.serviceLineId)).toBe('recovered');
  });

  it('leaves nothing approved and unposted on the ROI statement once proved, which holds no patient’s share', async () => {
    const led = await accepted(2400n);
    await loaded(led.practice, 'LED-18/adjusted.835');
    await exported(led.practice, 'LED-18/eft-export.csv', 'eft_export');
    const generated = await withPracticeScope(w.app, { actorId: led.practice.manager, practiceIds: [led.practice.practiceId] }, (scope) =>
      generateRoiStatement(scope as Scope, { practiceId: led.practice.practiceId, periodFrom: '2026-01-01', periodTo: '2026-12-31', requestId: `test-${randomUUID()}` }),
    );
    expect(generated?.statement).toMatchObject({ recoveredCents: 2400n, approvedUnpostedCents: 0n, interestCents: 0n });
    const [row] = await w.rows<Parameters<typeof storedStatement>[0]>(
      led.practice,
      'SELECT period_from::text, period_to::text, proof_level, fees_cents::text, recovered_cents::text, interest_cents::text, approved_unposted_cents::text, actionable_open_cents::text, pursuit_hours::text, links FROM roi_statement',
    );
    const statement = storedStatement(row as Parameters<typeof storedStatement>[0]);
    const ledger = entriesById(await inJob(led.practice, (scope) => ledgerEntries(scope, led.practice.practiceId)));
    expect(recomputeStatement(statement, ledger)).toMatchObject({ matches: true, recovered: { recomputedCents: 2400n }, approvedUnposted: { recomputedCents: 0n } });
    const csv = roiStatementCsv(statement, ledger);
    expect(csv).toContain('24.00');
    expect(csv).not.toMatch(/(^|[^0-9])6\.00/);
  });

  it('leaves the patient’s share as the shortfall of an acceptance typed as the allowed amount, and names it beside', async () => {
    const led = await accepted(3000n);
    const summary = await loaded(led.practice, 'LED-18/adjusted.835');
    expect(summary.remittances).toMatchObject({ approved: 0, confirmed: 1, decreased: 0, recoupments: 0 });
    expect(await shortfalls(led.practice, led.serviceLineId)).toEqual(new Map([[led.serviceLineId, 600n]]));
    expect((await correctionOf(led.practice, led.serviceLineId))?.billable).toMatchObject({ shareChange: { coinsuranceCents: 600n }, billableCents: 600n });
  });
});
