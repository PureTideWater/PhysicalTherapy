import { readFileSync } from 'node:fs';
import path from 'node:path';

import { MA_NONCONTRACTED_TERMS } from '@tp/contracts';
import { cents } from '@tp/money';
import { type LinePricing, UNPRICED_REASONS, price } from '@tp/pricing';
import { SYNTHETIC_PLACES, readRuleRelease, releaseVariant, syntheticRelease } from '@tp/pricing/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type PendingScreeningRow, SCREENING_MAPPING, ScreeningPricer, type ScreeningPricingContext, coversBand, screeningClaim, screeningOutcome, traceRecords, traceSha256 } from './adapter';
import { quarterDays } from './format';

/**
 * The screening's pricing (test matrix SCR-02, in its pure part; D19 a, D20 a): each priced row's figure is the
 * unchanged engine's amount for one line, under the MA non-contracted terms at the prospect's locality, times the
 * row's claim count in bigint; the difference is that less the allowed total; the engine's unpriced reasons pass
 * through unchanged; a row whose rule records change inside its band shows no figure. SYNTHETIC release 900001 only.
 */

const RELEASE = syntheticRelease(900001);
const CONTEXT: ScreeningPricingContext = { release: RELEASE, zip: '00011', placeOfServiceSettings: SYNTHETIC_PLACES, asOf: '2026-10-18' };
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
    settings: { zip: context.zip, defaultRounding: null, placeOfServiceSettings: context.placeOfServiceSettings },
    asOf: context.asOf,
  });
  if (line === undefined) {
    throw new Error('no line');
  }
  return line;
}

describe('the screening pricing adapter', () => {
  it('prices a row as an MA non-contracted line with every Medicare adjustment on, and multiplies the rounded line by the count in bigint', () => {
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
    expect(outcome).toEqual({
      disposition: 'priced',
      expectedLineCents: line.expectedAllowedCents,
      expectedLineUnrounded: line.expectedUnroundedCents.toString(),
      expectedCents: line.expectedAllowedCents * 12n,
      differenceCents: line.expectedAllowedCents * 12n - 50_000n,
      traceSha256: traceSha256(line.trace),
    });
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
    const base = readRuleRelease('fixtures/synthetic/rules/release-synth-900001');
    const split = releaseVariant(base, (records) =>
      records.flatMap((record) => {
        const key = record.key as Record<string, string>;
        if (record.record_type !== 'pfs_rvu' || key.hcpcs !== '97110') {
          return [record];
        }
        return [
          { ...record, effective_to: '2026-05-15' },
          { ...record, effective_from: '2026-05-16' },
        ];
      }),
    );
    const context = { ...CONTEXT, release: split };
    const changed = new ScreeningPricer(context).outcome(row({ serviceBand: '2026-Q2' }));
    expect(changed).toEqual({ disposition: 'rates_change_in_band', traceSha256: expect.stringMatching(/^[0-9a-f]{64}$/) as string });
    // A quarter the first record covers whole prices.
    expect(new ScreeningPricer(context).outcome(row({ serviceBand: '2026-Q1' })).disposition).toBe('priced');
    const line = direct(CONTEXT, row());
    expect(traceRecords(line.trace).length).toBeGreaterThan(3);
    expect(coversBand(line.trace, '2026-Q4')).toBe(true);
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
        expect(outcome).toEqual(screeningOutcome(pending, line));
        expect(outcome).toEqual(new ScreeningPricer(CONTEXT).outcome(pending));
        if (line.outcome === 'unpriced') {
          expect(outcome).toEqual({ disposition: 'unpriced', reason: line.reason, detail: line.detail, traceSha256: traceSha256(line.trace) });
        } else if (outcome.disposition === 'priced') {
          expect(typeof outcome.expectedCents).toBe('bigint');
          expect(outcome.expectedCents).toBe(line.expectedAllowedCents * BigInt(pending.claimCount));
          expect(outcome.differenceCents).toBe(outcome.expectedCents - pending.observedAllowedCents);
          expect(outcome.expectedLineCents >= 0n).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
    expect(pricer.priced).toBeLessThanOrEqual(300);
  });
});
