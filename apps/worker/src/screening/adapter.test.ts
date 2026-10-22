import { readFileSync } from 'node:fs';
import path from 'node:path';

import { MA_NONCONTRACTED_TERMS } from '@tp/contracts';
import { cents, decimal, roundOnce, unroundedCents } from '@tp/money';
import { type LinePricing, type PricedLine, UNPRICED_REASONS, indexRelease, price } from '@tp/pricing';
import { SYNTHETIC_PLACES, readRuleRelease, releaseVariant, ruleRecordLike, syntheticRelease } from '@tp/pricing/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { recordSha256 } from '@tp/rules';

import { ReleaseReadOutsideFetch, isKeyedRecordType, keyedRelease, screeningRequestedKeys } from '../price/keyed-release';
import { type StoredRecordRow, indexStoredRelease } from '../price/release';
import {
  LATER_PROCEDURE_LINE_NO,
  type PendingScreeningRow,
  ReleaseKeysMismatch,
  SCREENING_MAPPING,
  ScreeningPricer,
  type ScreeningPricingContext,
  beforeSequestration,
  changeDaysInBand,
  coversBand,
  inReductionPool,
  priceScreeningLaterProcedure,
  reducedAsLaterProcedure,
  releaseChangeDays,
  samePricing,
  screeningClaim,
  screeningOutcome,
  screeningVisitClaim,
  traceRecords,
  traceSha256,
} from './adapter';
import { quarterDays } from './format';
import { ScreeningPricer as LegacyScreeningPricer } from './test-support/legacy-adapter';

/**
 * The screening's pricing (test matrix SCR-02, in its pure part; D19 a, D20 a; the owner's rulings of 2026-10-18):
 * each priced row's figure is the unchanged engine's amount for one line before sequestration, read from its trace,
 * under the MA non-contracted terms at the prospect's locality, times the row's claim count in bigint; the difference
 * is that less the allowed total; a code in the reduction across a visit's codes is priced by the engine a second
 * time, as a later code of a visit, for its fully reduced figure, and a code outside it keeps one figure; the
 * engine's unpriced reasons pass through unchanged; a row whose rule records change inside its band shows no figure,
 * whether a record the trace names ends there or one it did not need on the band's first day starts there. The
 * pricer's memo keeps a compact record per distinct line, never a trace, and gives every row what the pricer gave at
 * commit 3c1b289 (test-support/legacy-adapter.ts; audit #53 part 2). SYNTHETIC release 900001 only, and variants of
 * it built here.
 */

const RELEASE_DIR = 'fixtures/synthetic/rules/release-synth-900001';
const RELEASE = syntheticRelease(900001);
const CHANGE_DAYS = releaseChangeDays(readRuleRelease(RELEASE_DIR).records);
const CONTEXT: ScreeningPricingContext = { release: RELEASE, changeDays: CHANGE_DAYS, zip: '00011', zipPlusFour: null, placeOfServiceSettings: SYNTHETIC_PLACES, asOf: '2026-10-18' };
const CODES = ['97110', '97112', '97116', '97140', '97530', '97161', '97162', '97163', '97164', '97026', '97035', 'G0283'] as const;

function row(overrides: Partial<PendingScreeningRow> = {}): PendingScreeningRow {
  return {
    rowNo: 1,
    procedureCode: '97110',
    modifiers: ['GP'],
    units: 2,
    placeOfService: '11',
    payerProduct: 'medicare_ffs',
    serviceBand: '2026-Q2',
    claimCount: 12,
    observedAllowedCents: cents(50_000n),
    ...overrides,
  };
}

/** The engine's own result for the row's one-line claim, called directly. */
function direct(context: ScreeningPricingContext, pending: PendingScreeningRow): LinePricing {
  const [line] = price({
    claim: {
      claimStatusCode: '1',
      reversed: false,
      corrected: false,
      remittanceDate: null,
      payerPlanKey: null,
      lines: [
        {
          lineNo: 1,
          serviceLineId: null,
          procedureCode: pending.procedureCode,
          modifiers: [...pending.modifiers],
          units: String(pending.units),
          serviceDate: quarterDays(pending.serviceBand).first,
          placeOfService: pending.placeOfService,
          chargeCents: cents(0n),
          observedAllowedCents: cents(0n),
          observedAllowedBasis: 'paid_plus_pr',
          patientShareAdjustments: [],
          agreement: { outcome: 'MA_NONCONTRACTED', mapping: SCREENING_MAPPING, terms: MA_NONCONTRACTED_TERMS },
        },
      ],
    },
    release: context.release,
    settings: { zip: context.zip, zipPlusFour: context.zipPlusFour, defaultRounding: null, placeOfServiceSettings: context.placeOfServiceSettings },
    asOf: context.asOf,
  });
  if (line === undefined) {
    throw new Error('no line');
  }
  return line;
}

/** The trace's own amount before sequestration, as decimal text: the sequestration step's before_cents. */
function traceBeforeSequestration(line: LinePricing): string {
  const step = line.trace.steps.adjustments.find((adjustment) => adjustment.name === 'sequestration');
  if (step === undefined) {
    throw new Error('no sequestration step');
  }
  return step.before_cents;
}

/** The engine's result for the row as a later code of a visit, when its code is in the reduction across codes. */
function later(context: ScreeningPricingContext, pending: PendingScreeningRow, line: LinePricing): LinePricing | null {
  return line.outcome === 'priced' && inReductionPool(line.trace) ? priceScreeningLaterProcedure(context, pending) : null;
}

describe('the screening pricing adapter', () => {
  it('prices a row as an MA non-contracted line with every Medicare adjustment on, and multiplies its figure before sequestration by the count in bigint', () => {
    expect(SCREENING_MAPPING).toMatchObject({ kind: 'ma_noncontracted', contractVersionId: null, effectiveFrom: '2000-01-01', effectiveTo: null });
    // The Medicare flag defaults are the engine's, unchanged: every adjustment on for an MA non-contracted line.
    expect(MA_NONCONTRACTED_TERMS.flags).toEqual({ apply_mppr: true, apply_assistant_reduction: true, apply_sequestration: true, apply_ncci: true, timed_units_rule: 'MEDICARE_POOLED' });
    const pending = row();
    const line = direct(CONTEXT, pending);
    expect(line.outcome).toBe('priced');
    if (line.outcome !== 'priced') {
      return;
    }
    const outcome = new ScreeningPricer(CONTEXT).outcome(pending);
    // The figure is the trace's amount before sequestration, rounded once under the trace's rule: 97110 GP x2 at
    // SYNTHETIC locality 00011 is 3,684.4 cents before sequestration, and 3,574 after it (the engine's final amount).
    expect(traceBeforeSequestration(line)).toBe('3684.4');
    expect(line.expectedAllowedCents).toBe(3_574n);
    const visit = priceScreeningLaterProcedure(CONTEXT, pending);
    expect(outcome).toEqual({
      disposition: 'priced',
      expectedLineCents: 3_684n,
      expectedLineUnrounded: '3684.4',
      expectedCents: 3_684n * 12n,
      differenceCents: 3_684n * 12n - 50_000n,
      inReductionPool: true,
      traceSha256: traceSha256(line.trace),
      reduced: { lineCents: 3_145n, lineUnrounded: '3144.8', cents: 3_145n * 12n, differenceCents: 3_145n * 12n - 50_000n, traceSha256: traceSha256(visit.trace) },
    });
    expect(roundOnce(unroundedCents(decimal(traceBeforeSequestration(line))), line.trace.steps.rounding?.rule).cents).toBe(3_684n);
    expect(line.trace.agreement?.outcome).toBe('MA_NONCONTRACTED');
    expect(line.trace.terms?.flags).toEqual(MA_NONCONTRACTED_TERMS.flags);
    expect(line.trace.line.service_date).toBe('2026-04-01');
    // A medicare_ffs row and an ma_noncontracted row of the same line price alike.
    expect(new ScreeningPricer(CONTEXT).outcome(row({ payerProduct: 'ma_noncontracted' }))).toEqual(outcome);
  });

  it('applies the assistant reduction for CQ and CO, and refuses units above the code’s MUE, as the engine does', () => {
    const pricer = new ScreeningPricer(CONTEXT);
    const therapist = pricer.outcome(row({ modifiers: ['GP'] }));
    const assistant = pricer.outcome(row({ modifiers: ['CQ', 'GP'] }));
    expect(therapist.disposition).toBe('priced');
    expect(assistant.disposition).toBe('priced');
    if (therapist.disposition === 'priced' && assistant.disposition === 'priced') {
      expect(assistant.expectedLineCents).toBeLessThan(therapist.expectedLineCents);
    }
    expect(pricer.outcome(row({ units: 8 }))).toMatchObject({ disposition: 'unpriced', reason: 'MUE_EXCEEDED', detail: null });
  });

  it('prices a ZIP split across localities at its ZIP+4’s locality, through the keyed read as through the whole release (SCR-15; docs/adr/0064)', () => {
    const plusFour = readRuleRelease('fixtures/synthetic/rules/release-synth-900006');
    const header = { releaseNo: plusFour.releaseNo, manifestSha256: plusFour.manifestSha256 };
    const rows: StoredRecordRow[] = plusFour.records.map((record) => ({
      record_type: record.record_type,
      key: record.key as Record<string, string>,
      value: record.value,
      effective_from: record.effective_from,
      effective_to: record.effective_to,
      sha256: recordSha256(record),
    }));
    const whole = indexRelease(plusFour);
    const codes = new Set<string>(CODES);
    const view = keyedRelease({
      shared: indexStoredRelease(header, rows.filter((stored) => !isKeyedRecordType(stored.record_type))),
      records: indexStoredRelease(header, rows.filter((stored) => isKeyedRecordType(stored.record_type))),
      requested: screeningRequestedKeys(codes, '00012'),
    });
    const base = { changeDays: releaseChangeDays(plusFour.records), zip: '00012', placeOfServiceSettings: SYNTHETIC_PLACES, asOf: '2026-10-18' };
    const viaRead = new ScreeningPricer({ ...base, zipPlusFour: '5000', release: view, read: { codes, view } });
    const viaWhole = new ScreeningPricer({ ...base, zipPlusFour: '5000', release: whole });
    for (const [index, code] of CODES.entries()) {
      const pending = row({ rowNo: index + 1, procedureCode: code, units: 1 });
      expect(viaRead.outcome(pending), code).toEqual(viaWhole.outcome(pending));
    }
    expect(view.violation).toBeNull();
    // 5000 is in locality 02's range, 0001 in locality 01's, which prices as the unsplit 00011 does.
    const at = (zip: string, zipPlusFour: string | null) => new ScreeningPricer({ ...base, zip, zipPlusFour, release: whole }).outcome(row());
    const locality02 = at('00012', '5000');
    const locality01 = at('00012', '0001');
    expect(locality02.disposition).toBe('priced');
    expect(locality01.disposition).toBe('priced');
    if (locality02.disposition === 'priced' && locality01.disposition === 'priced') {
      expect(locality02.expectedLineCents).not.toBe(locality01.expectedLineCents);
      expect(at('00011', null)).toMatchObject({ disposition: 'priced', expectedLineCents: locality01.expectedLineCents });
      // A ZIP+4 given for an unsplit ZIP changes nothing.
      expect(at('00011', '1234')).toMatchObject({ disposition: 'priced', expectedLineCents: locality01.expectedLineCents });
    }
    expect(at('00012', null)).toMatchObject({ disposition: 'unpriced', reason: 'ENGINE_ERROR', detail: 'locality_needs_zip_plus_four' });
    expect(at('00012', '9100')).toMatchObject({ disposition: 'unpriced', reason: 'ENGINE_ERROR', detail: 'zip_plus_four_not_in_locality_map' });
  });

  it('passes the engine’s unpriced reasons through: a ZIP that needs its ZIP+4, a place of service outside the split, a band outside the release', () => {
    expect(new ScreeningPricer({ ...CONTEXT, zip: '00012' }).outcome(row())).toMatchObject({ disposition: 'unpriced', reason: 'ENGINE_ERROR', detail: 'locality_needs_zip_plus_four' });
    expect(new ScreeningPricer(CONTEXT).outcome(row({ placeOfService: '12' }))).toMatchObject({ disposition: 'unpriced', reason: 'ENGINE_ERROR', detail: 'place_of_service_unmapped' });
    expect(new ScreeningPricer(CONTEXT).outcome(row({ serviceBand: '2025-Q4' })).disposition).toBe('unpriced');
    expect(new ScreeningPricer(CONTEXT).outcome(row({ procedureCode: '99999' })).disposition).toBe('unpriced');
    // The reasons the table admits are the engine's closed list.
    const migration = readFileSync(path.resolve(import.meta.dirname, '../../../../packages/db/migrations/20261104090000_free_screening.sql'), 'utf8');
    const start = migration.indexOf('CONSTRAINT screening_result_unpriced_reason');
    const list = migration.slice(migration.indexOf('IN (', start), migration.indexOf(')', migration.indexOf('IN (', start)));
    expect([...list.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1])).toEqual([...UNPRICED_REASONS]);
  });

  it('shows no figure for a row whose rule records change inside its band', () => {
    // 97110's relative values end on 2026-05-15 and a second record starts the next day: Q2 spans both.
    const base = readRuleRelease(RELEASE_DIR);
    const change = (records: typeof base.records) =>
      records.flatMap((record) => {
        const key = record.key as Record<string, string>;
        if (record.record_type !== 'pfs_rvu' || key.hcpcs !== '97110') {
          return [record];
        }
        return [
          { ...record, effective_to: '2026-05-15' },
          { ...record, effective_from: '2026-05-16' },
        ];
      });
    const split = releaseVariant(base, change);
    const context = { ...CONTEXT, release: split, changeDays: releaseChangeDays(change(base.records.map((record) => structuredClone(record)))) };
    const changed = new ScreeningPricer(context).outcome(row({ serviceBand: '2026-Q2' }));
    expect(changed).toEqual({ disposition: 'rates_change_in_band', traceSha256: expect.stringMatching(/^[0-9a-f]{64}$/) as string });
    // A quarter the first record covers whole prices.
    expect(new ScreeningPricer(context).outcome(row({ serviceBand: '2026-Q1' })).disposition).toBe('priced');
    const line = direct(CONTEXT, row());
    expect(traceRecords(line.trace).length).toBeGreaterThan(3);
    expect(coversBand(line.trace, '2026-Q4')).toBe(true);
  });

  it('shows no figure for a row when a record absent on its band’s first day takes effect inside the band (a medically unlikely edit from 2026-02-01)', () => {
    const base = readRuleRelease(RELEASE_DIR);
    const change = (records: typeof base.records) =>
      records.map((record) => {
        const key = record.key as Record<string, string>;
        return record.record_type === 'ncci_mue' && key.hcpcs === '97110' ? ruleRecordLike(record, { value: { ...(record.value as object), mue: 1 }, effective_from: '2026-02-01' }) : record;
      });
    const variant = releaseVariant(base, change);
    const context: ScreeningPricingContext = { ...CONTEXT, release: variant, changeDays: releaseChangeDays(change(base.records.map((record) => structuredClone(record)))) };
    const pending = row({ units: 4, serviceBand: '2026-Q1' });
    // The engine prices the line on the quarter's first day (no edit yet) and refuses it on 2026-02-15.
    expect(direct(context, pending).outcome).toBe('priced');
    const dated = screeningClaim(pending);
    const onFeb15 = price({ claim: { ...dated, lines: dated.lines.map((line) => ({ ...line, serviceDate: '2026-02-15' })) }, release: variant, settings: { zip: '00011', defaultRounding: null, placeOfServiceSettings: SYNTHETIC_PLACES }, asOf: '2026-10-18' });
    expect(onFeb15[0]).toMatchObject({ outcome: 'unpriced', reason: 'MUE_EXCEEDED' });
    expect(changeDaysInBand(context.changeDays, '2026-Q1')).toEqual(['2026-02-01']);
    expect(new ScreeningPricer(context).outcome(pending)).toEqual({ disposition: 'rates_change_in_band', traceSha256: expect.stringMatching(/^[0-9a-f]{64}$/) as string });
    // A quarter the edit is in force for from its first day is priced or refused as the engine says.
    expect(new ScreeningPricer(context).outcome(row({ units: 4, serviceBand: '2026-Q2' }))).toMatchObject({ disposition: 'unpriced', reason: 'MUE_EXCEEDED' });
    // Release 900001 itself changes only on quarters' first days: no band has a day inside it.
    expect(['2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'].flatMap((band) => changeDaysInBand(CHANGE_DAYS, band))).toEqual([]);
    expect(releaseChangeDays([{ effective_from: '2026-01-01', effective_to: '2026-03-31' }, { effective_from: '2026-04-01', effective_to: null }])).toEqual(['2026-01-01', '2026-04-01']);
  });

  it('records from the engine’s own trace whether the row’s code is in the reduction across a visit’s codes', () => {
    const pooled = new ScreeningPricer(CONTEXT).outcome(row({ procedureCode: '97140', units: 1 }));
    const evaluation = new ScreeningPricer(CONTEXT).outcome(row({ procedureCode: '97161', modifiers: ['GP'], units: 1 }));
    expect(pooled).toMatchObject({ disposition: 'priced', inReductionPool: true });
    expect(evaluation).toMatchObject({ disposition: 'priced', inReductionPool: false });
    const line = direct(CONTEXT, row());
    expect(inReductionPool(line.trace)).toBe(line.trace.steps.adjustments.some((adjustment) => adjustment.name === 'mppr' && adjustment.in_pool));
    expect(samePricing(line, line)).toBe(true);
    expect(samePricing(line, direct(CONTEXT, row({ units: 8 })))).toBe(false);
  });

  it('gives a code in the reduction across codes two figures, both the engine’s: alone, and as a later code of a visit (G01’s 97110 and 97140, SYNTHETIC)', () => {
    // G01's codes at POS 11, ZIP 00011, 2026-Q1: 97110 GP x2 and 97140 GP, each row a claim count of 3.
    const therapy = row({ procedureCode: '97110', units: 2, serviceBand: '2026-Q1', claimCount: 3, observedAllowedCents: cents(10_000n) });
    const manual = row({ procedureCode: '97140', units: 1, serviceBand: '2026-Q1', claimCount: 3, observedAllowedCents: cents(5_000n) });
    const pricer = new ScreeningPricer(CONTEXT);
    const figures = [therapy, manual].map((pending) => pricer.outcome(pending));
    expect(figures.map((outcome) => (outcome.disposition === 'priced' ? [outcome.expectedLineCents, outcome.reduced?.lineCents, outcome.expectedCents, outcome.reduced?.cents] : null))).toEqual([
      [3_684n, 3_145n, 11_052n, 9_435n],
      [2_458n, 1_820n, 7_374n, 5_460n],
    ]);
    for (const [index, pending] of [therapy, manual].entries()) {
      const outcome = figures[index];
      const visit = priceScreeningLaterProcedure(CONTEXT, pending);
      if (outcome?.disposition !== 'priced' || outcome.reduced === null || visit.outcome !== 'priced') {
        throw new Error('both price, both pooled');
      }
      // The second figure is the engine's own: the two-line claim's second line, ranked after the first line's unit,
      // every one of its units reduced, read before sequestration and multiplied by the count in bigint.
      expect(screeningVisitClaim(pending).lines.map((line) => [line.lineNo, line.procedureCode, line.units])).toEqual([
        [1, pending.procedureCode, '1'],
        [LATER_PROCEDURE_LINE_NO, pending.procedureCode, String(pending.units)],
      ]);
      expect(reducedAsLaterProcedure(visit.trace)).toBe(true);
      const mppr = visit.trace.steps.adjustments.find((adjustment) => adjustment.name === 'mppr');
      expect(mppr?.name === 'mppr' ? [mppr.ranking[0]?.line_no, mppr.reductions.length] : null).toEqual([1, pending.units]);
      expect(outcome.reduced.lineUnrounded).toBe(traceBeforeSequestration(visit));
      expect(outcome.reduced.traceSha256).toBe(traceSha256(visit.trace));
      expect(typeof outcome.reduced.cents).toBe('bigint');
      expect(outcome.reduced.cents).toBe(outcome.reduced.lineCents * 3n);
      expect(outcome.reduced.differenceCents).toBe(outcome.reduced.cents - pending.observedAllowedCents);
      expect(outcome.reduced.lineCents).toBeLessThan(outcome.expectedLineCents);
    }
    // A code outside the reduction across codes (an evaluation) keeps one figure.
    expect(pricer.outcome(row({ procedureCode: '97161', units: 1, serviceBand: '2026-Q1' }))).toMatchObject({ disposition: 'priced', inReductionPool: false, reduced: null, expectedLineCents: 5_917n });
  });

  it('prices PRD 11’s worked example (golden G01) between each pooled row’s two figures: the visit is within the range of the reduction across codes', () => {
    // G01: 97110 GP x2, 97140 GP, 97530 GP on one day at POS 11, ZIP 00011. As one visit, the reduction ranks the four
    // units and reduces three; priced alone, each row keeps its first unit whole; as a later code, none does.
    const rows = [row({ procedureCode: '97110', units: 2, claimCount: 1 }), row({ procedureCode: '97140', units: 1, claimCount: 1 }), row({ procedureCode: '97530', units: 1, claimCount: 1 })];
    const visit = price({
      claim: { ...screeningClaim(rows[0] as PendingScreeningRow), lines: rows.map((item, index) => ({ ...(screeningClaim(item).lines[0] as ReturnType<typeof screeningClaim>['lines'][number]), lineNo: index + 1 })) },
      release: RELEASE,
      settings: { zip: '00011', defaultRounding: null, placeOfServiceSettings: SYNTHETIC_PLACES },
      asOf: '2026-10-18',
    });
    const pricer = new ScreeningPricer(CONTEXT);
    const outcomes = rows.map((item) => pricer.outcome(item));
    // The visit's own figures before sequestration, from its traces, rounded once as the screening rounds its own.
    const visitCents = visit.map((line) => (line.outcome === 'priced' ? beforeSequestration(line).cents : -1n));
    expect(outcomes.every((outcome) => outcome.disposition === 'priced' && outcome.inReductionPool && outcome.reduced !== null)).toBe(true);
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.disposition !== 'priced' || outcome.reduced === null) {
        throw new Error('pooled');
      }
      const paid = visitCents[index] ?? -1n;
      expect(outcome.reduced.lineCents <= paid && paid <= outcome.expectedLineCents, `line ${String(index + 1)}`).toBe(true);
    }
    // 97110 and 97140 follow 97530 in the visit: the visit prices them at their fully reduced figures, more than $5 a
    // line below their figures priced alone; 97530, ranked first, at its figure alone.
    const [therapy, manual, activity] = outcomes;
    expect(therapy?.disposition === 'priced' ? [therapy.reduced?.lineCents, therapy.expectedLineCents - (visitCents[0] ?? 0n)] : null).toEqual([visitCents[0], 539n]);
    expect(manual?.disposition === 'priced' ? [manual.reduced?.lineCents, manual.expectedLineCents - (visitCents[1] ?? 0n)] : null).toEqual([visitCents[1], 638n]);
    expect(activity?.disposition === 'priced' ? activity.expectedLineCents : null).toBe(visitCents[2]);
  });

  it('reads the figure before sequestration from the engine’s trace and computes no sequestration: a row allowed in full at it shows no difference', () => {
    const pricer = new ScreeningPricer(CONTEXT);
    for (const pending of [row({ procedureCode: '97161', units: 1, claimCount: 4 }), row({ procedureCode: '97140', units: 1, claimCount: 4 }), row({ modifiers: ['CQ', 'GP'], units: 3, claimCount: 4 })]) {
      const line = direct(CONTEXT, pending);
      if (line.outcome !== 'priced') {
        throw new Error('prices');
      }
      const priced = pricer.outcome(pending);
      expect(priced.disposition).toBe('priced');
      if (priced.disposition !== 'priced') {
        return;
      }
      // The figure is the trace's amount before sequestration, which is above the engine's final amount (SYNTHETIC 3%).
      expect(priced.expectedLineUnrounded).toBe(traceBeforeSequestration(line));
      expect(priced.expectedLineCents).toBeGreaterThan(line.expectedAllowedCents);
      // A payer that allowed the figure in full, as payers normally report it, before sequestration: no difference.
      const paidInFull = pricer.outcome({ ...pending, observedAllowedCents: priced.expectedCents });
      expect(paidInFull).toMatchObject({ disposition: 'priced', differenceCents: 0n });
    }
  });

  it('stops rather than compute a figure when a priced trace has no amount before sequestration, or adjusts after it', () => {
    const line = direct(CONTEXT, row({ procedureCode: '97161', units: 1 })) as PricedLine;
    const steps = line.trace.steps;
    const without: PricedLine = { ...line, trace: { ...line.trace, steps: { ...steps, adjustments: steps.adjustments.filter((adjustment) => adjustment.name !== 'sequestration') } } };
    expect(() => beforeSequestration(without)).toThrow('the engine’s trace has no amount before sequestration');
    const after: PricedLine = {
      ...line,
      trace: { ...line.trace, steps: { ...steps, adjustments: [...steps.adjustments, { name: 'contract_adjustment', before_cents: '1', after_cents: '1', kind: 'CAP', percent: null, cap_cents: '1' }] } },
    };
    expect(() => beforeSequestration(after)).toThrow('the engine’s trace adjusts the amount after sequestration');
    // A pooled code whose second pricing is missing, or not the later line, gets no figure either.
    const pooled = direct(CONTEXT, row());
    expect(() => screeningOutcome(row(), pooled)).toThrow('the engine did not price the row as a later procedure of a visit');
    expect(() => screeningOutcome(row(), pooled, false, pooled)).toThrow('the engine did not price the row as a later procedure of a visit');
  });

  it('builds the row’s one-line claim with sorted modifiers, zero charge and observed, and the band’s first day', () => {
    expect(screeningClaim({ procedureCode: '97530', modifiers: ['GP', 'CQ'], units: 3, placeOfService: '22', serviceBand: '2026-Q4' })).toEqual({
      claimStatusCode: '1',
      reversed: false,
      corrected: false,
      remittanceDate: null,
      payerPlanKey: null,
      lines: [
        {
          lineNo: 1,
          serviceLineId: null,
          procedureCode: '97530',
          modifiers: ['CQ', 'GP'],
          units: '3',
          serviceDate: '2026-10-01',
          placeOfService: '22',
          chargeCents: 0n,
          observedAllowedCents: 0n,
          observedAllowedBasis: 'paid_plus_pr',
          patientShareAdjustments: [],
          agreement: { outcome: 'MA_NONCONTRACTED', mapping: SCREENING_MAPPING, terms: MA_NONCONTRACTED_TERMS },
        },
      ],
    });
    expect(() => new ScreeningPricer(CONTEXT).outcome(row({ payerProduct: 'commercial' }))).toThrow(RangeError);
    expect(() => new ScreeningPricer(CONTEXT).outcome(row({ payerProduct: 'ma_contracted' }))).toThrow(RangeError);
  });

  it('gives every row the engine’s one-line figure times its count, memoized or not (property)', () => {
    const pendingRow = fc.record({
      rowNo: fc.integer({ min: 1, max: 50_000 }),
      procedureCode: fc.constantFrom(...CODES),
      modifiers: fc.subarray(['59', 'CO', 'CQ', 'GO', 'GP', 'KX'], { maxLength: 4 }),
      units: fc.integer({ min: 1, max: 12 }),
      placeOfService: fc.constantFrom('11', '22', '12'),
      payerProduct: fc.constantFrom('medicare_ffs' as const, 'ma_noncontracted' as const),
      serviceBand: fc.constantFrom('2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'),
      claimCount: fc.integer({ min: 1, max: 1_000_000 }),
      observedAllowedCents: fc.bigInt({ min: 0n, max: 99_999_999_999n }).map(cents),
    });
    const pricer = new ScreeningPricer(CONTEXT);
    fc.assert(
      fc.property(pendingRow, (pending) => {
        const line = direct(CONTEXT, pending);
        const outcome = pricer.outcome(pending);
        expect(outcome).toEqual(screeningOutcome(pending, line, false, later(CONTEXT, pending, line)));
        expect(outcome).toEqual(new ScreeningPricer(CONTEXT).outcome(pending));
        if (line.outcome === 'unpriced') {
          expect(outcome).toEqual({ disposition: 'unpriced', reason: line.reason, detail: line.detail, traceSha256: traceSha256(line.trace) });
        } else if (outcome.disposition === 'priced') {
          const figure = roundOnce(unroundedCents(decimal(traceBeforeSequestration(line))), line.rounding);
          expect(typeof outcome.expectedCents).toBe('bigint');
          expect(outcome.expectedLineCents).toBe(figure.cents);
          expect(outcome.expectedCents).toBe(figure.cents * BigInt(pending.claimCount));
          expect(outcome.differenceCents).toBe(outcome.expectedCents - pending.observedAllowedCents);
          expect(outcome.expectedLineCents >= 0n).toBe(true);
          // A pooled code has its fully reduced figure, never above the one before the reduction; any other code has one figure.
          expect(outcome.reduced !== null).toBe(inReductionPool(line.trace));
          if (outcome.reduced !== null) {
            expect(outcome.reduced.lineCents <= outcome.expectedLineCents).toBe(true);
            expect(outcome.reduced.cents).toBe(outcome.reduced.lineCents * BigInt(pending.claimCount));
            expect(outcome.reduced.differenceCents).toBe(outcome.reduced.cents - pending.observedAllowedCents);
          }
        }
      }),
      { numRuns: 300 },
    );
    expect(pricer.priced).toBeLessThanOrEqual(300);
  });

  it('keeps a compact record per distinct line, never a trace, and gives every row the outcome the pricer gave at 3c1b289 (property)', () => {
    const pendingRow = fc.record({
      rowNo: fc.integer({ min: 1, max: 50_000 }),
      procedureCode: fc.constantFrom(...CODES),
      modifiers: fc.subarray(['59', 'CO', 'CQ', 'GO', 'GP', 'KX'], { maxLength: 4 }),
      units: fc.integer({ min: 1, max: 12 }),
      placeOfService: fc.constantFrom('11', '22', '12'),
      payerProduct: fc.constantFrom('medicare_ffs' as const, 'ma_noncontracted' as const),
      serviceBand: fc.constantFrom('2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'),
      claimCount: fc.integer({ min: 1, max: 1_000_000 }),
      observedAllowedCents: fc.bigInt({ min: 0n, max: 99_999_999_999n }).map(cents),
    });
    const pricer = new ScreeningPricer(CONTEXT);
    const legacy = new LegacyScreeningPricer(CONTEXT);
    fc.assert(
      fc.property(pendingRow, (pending) => {
        expect(pricer.outcome(pending)).toEqual(legacy.outcome(pending));
      }),
      { numRuns: 400 },
    );
    // SCR-02's rows (apps/worker/src/screening/screening.db.test.ts), each priced by both.
    for (const [procedureCode, modifiers, units, placeOfService, serviceBand, claimCount] of [
      ['97110', ['GP'], 2, '11', '2026-Q1', 11],
      ['97110', ['CQ', 'GP'], 1, '11', '2026-Q2', 11],
      ['97140', ['GP'], 1, '22', '2026-Q3', 300],
      ['97110', ['GP'], 8, '11', '2026-Q1', 11],
      ['97110', ['GP'], 1, '12', '2026-Q4', 11],
    ] as const) {
      const pending = row({ procedureCode, modifiers: [...modifiers], units, placeOfService, serviceBand, claimCount });
      expect(pricer.outcome(pending)).toEqual(legacy.outcome(pending));
    }
    // What the memo holds: figures, reasons and hashes, no engine trace.
    const memo = (pricer as unknown as { readonly lines: ReadonlyMap<string, unknown> }).lines;
    expect(memo.size).toBe(pricer.priced);
    const keys = new Set<string>();
    const visit = (value: unknown): void => {
      if (typeof value === 'object' && value !== null) {
        for (const [key, inner] of Object.entries(value)) {
          keys.add(key);
          visit(inner);
        }
      }
    };
    memo.forEach(visit);
    expect([...keys].filter((key) => !['disposition', 'expectedLineCents', 'expectedLineUnrounded', 'inReductionPool', 'traceSha256', 'reduced', 'lineCents', 'lineUnrounded', 'reason', 'detail'].includes(key))).toEqual([]);
  });

  it('checks the codes and the view a keyed read gives it: a row outside the codes, and a lookup outside the fetch, stop the run outside the engine', () => {
    const outside = { violation: null as { recordType: 'pfs_rvu'; keyFields: string[] } | null };
    const pricer = new ScreeningPricer({ ...CONTEXT, read: { codes: new Set(['97110']), view: outside } });
    expect(pricer.outcome(row()).disposition).toBe('priced');
    expect([...pricer.codes]).toEqual(['97110']);
    expect(() => pricer.outcome(row({ procedureCode: '97140' }))).toThrow(ReleaseKeysMismatch);
    outside.violation = { recordType: 'pfs_rvu', keyFields: ['hcpcs', 'modifier'] };
    expect(() => pricer.outcome(row({ units: 3 }))).toThrow(ReleaseReadOutsideFetch);
  });
});
