import { MA_NONCONTRACTED_TERMS } from '@tp/contracts';
import { cents } from '@tp/money';
import { type LineFacts, type LinePricing, type PricingTrace, indexRelease, price } from '@tp/pricing';
import { SYNTHETIC_PLACES, readRuleRelease } from '@tp/pricing/testing';
import { describe, expect, it } from 'vitest';

import { SCREENING_MAPPING } from '../screening/adapter';
import {
  CONTENT_FAILURE_CODES,
  type ContentFamily,
  type ContentSpans,
  type ContentWindow,
  type ContentWindows,
  type HalfOpenRange,
  contentFailureCode,
  contentGapsOf,
  contentReads,
  contentsOf,
  coveredDays,
  familiesOf,
  familyOf,
  isLoudContentGap,
  rangesCover,
} from './release';

/**
 * What a line read of the Medicare content its release may not have loaded (audit #7; docs/adr/0071; test matrix
 * RCC-04 and RCC-05): the reads come from the trace's steps, never from the flags alone; a read outside the content's
 * span names its family; and a line stopped by other content not loaded for its date is a loud gap. Traces are the
 * engine's own, over SYNTHETIC release 900001, then changed by hand where a case needs a shape the release cannot give.
 */

const RELEASE = indexRelease(readRuleRelease('fixtures/synthetic/rules/release-synth-900001'));
const SETTINGS = { zip: '00011', defaultRounding: null, placeOfServiceSettings: SYNTHETIC_PLACES };

function line(lineNo: number, procedureCode: string, serviceDate: string, units = '1'): LineFacts {
  return {
    lineNo,
    serviceLineId: null,
    procedureCode,
    modifiers: ['GP'],
    units,
    serviceDate,
    placeOfService: '11',
    chargeCents: cents(20_000n),
    observedAllowedCents: cents(0n),
    observedAllowedBasis: 'paid_plus_pr',
    patientShareAdjustments: [],
    agreement: { outcome: 'MA_NONCONTRACTED', mapping: SCREENING_MAPPING, terms: MA_NONCONTRACTED_TERMS },
  };
}

/** A Medicare Advantage claim of one day under 900001, every flag on: 97110 twice (in the MPPR pool) and 97161 (not in it). */
function maTraces(date = '2026-10-14'): PricingTrace[] {
  const results = price({
    claim: { claimStatusCode: '1', reversed: false, corrected: false, remittanceDate: null, payerPlanKey: null, lines: [line(1, '97110', date, '2'), line(2, '97161', date)] },
    release: RELEASE,
    settings: SETTINGS,
    asOf: '2026-12-15',
  });
  expect(results.map((result) => result.outcome)).toEqual(['priced', 'priced']);
  return results.map((result) => result.trace);
}

const range = (from: string | null, until: string | null): HalfOpenRange => ({ from, until });
/** The spans of release 900007: the per-code list and the MUE through 2026-09-30, the general rate open. */
const GAP_SPANS: ContentSpans = { mppr_code: [range('2026-01-01', '2026-10-01')], mppr_general: [range('2026-01-01', null)], ncci_mue: [range('2026-01-01', '2026-10-01')] };

function unpriced(trace: PricingTrace, reason: 'ENGINE_ERROR' | 'NO_PFS_VALUE', detail: string, step: 'fee_schedule' | 'mppr' | 'method' = 'fee_schedule'): LinePricing {
  const changed = { ...trace, outcome: { result: 'unpriced', reason, detail, step } } as PricingTrace;
  return { outcome: 'unpriced', lineNo: trace.line.line_no, reason, detail: detail as never, method: null, terms: null, trace: changed };
}

function windowsOf(entries: readonly (readonly [ContentWindow['content'], readonly HalfOpenRange[]])[]): ContentWindows {
  return new Map(entries.map(([content, loaded]) => [content, { content, records: 1, loaded, newestFrom: '2026-01-01', newestRetrieved: null }]));
}

describe('contentReads', () => {
  it('reads the MUE when the units step checked it, and the per-code MPPR list on the day of each MPPR entry, in the pool or not', () => {
    const [pooled, outside] = maTraces();
    expect(pooled?.steps.adjustments.find((adjustment) => adjustment.name === 'mppr')).toMatchObject({ in_pool: true, general_record: null });
    expect(outside?.steps.adjustments.find((adjustment) => adjustment.name === 'mppr')).toMatchObject({ in_pool: false });
    for (const trace of [pooled, outside]) {
      expect(contentReads(trace as PricingTrace)).toEqual([
        { content: 'ncci_mue', date: '2026-10-14' },
        { content: 'mppr_code', date: '2026-10-14' },
      ]);
    }
  });

  it('reads the general rate when an MPPR entry used it', () => {
    const [trace] = maTraces() as [PricingTrace];
    const general = { record_type: 'mppr_rate' as const, key: { component: 'practice_expense' }, effective_from: '2026-01-01', effective_to: null, sha256: 'a'.repeat(64) };
    const changed: PricingTrace = {
      ...trace,
      steps: { ...trace.steps, adjustments: trace.steps.adjustments.map((adjustment) => (adjustment.name === 'mppr' ? { ...adjustment, general_record: general } : adjustment)) },
    };
    expect(contentReads(changed)).toEqual([
      { content: 'ncci_mue', date: '2026-10-14' },
      { content: 'mppr_code', date: '2026-10-14' },
      { content: 'mppr_general', date: '2026-10-14' },
    ]);
  });

  it('reads both MPPR contents on a no_mppr_rate stop, which writes no entry', () => {
    const [trace] = maTraces() as [PricingTrace];
    const stopped = unpriced({ ...trace, steps: { ...trace.steps, adjustments: [] } }, 'ENGINE_ERROR', 'no_mppr_rate', 'mppr').trace;
    expect(contentReads(stopped)).toEqual([
      { content: 'ncci_mue', date: '2026-10-14' },
      { content: 'mppr_code', date: '2026-10-14' },
      { content: 'mppr_general', date: '2026-10-14' },
    ]);
  });

  it('reads nothing for a fixed fee with apply_mppr on (stopped at mppr_needs_fee_schedule, before the reduction) or a day whose reduction threw (its entries cleared)', () => {
    const [trace] = maTraces() as [PricingTrace];
    const fixed = unpriced({ ...trace, steps: { ...trace.steps, fee_schedule: null, units: null, adjustments: [] } }, 'ENGINE_ERROR', 'mppr_needs_fee_schedule', 'method').trace;
    expect(fixed.terms?.flags.apply_mppr).toBe(true);
    expect(contentReads(fixed)).toEqual([]);
    // A day whose reduction threw: the units step ran (the MUE is still read), the MPPR entries are gone.
    const cleared = unpriced({ ...trace, steps: { ...trace.steps, adjustments: [] } }, 'ENGINE_ERROR', 'unexpected', 'mppr').trace;
    expect(contentReads(cleared)).toEqual([{ content: 'ncci_mue', date: '2026-10-14' }]);
  });

  it('reads nothing for a line whose flags are off', () => {
    const [trace] = maTraces() as [PricingTrace];
    const off: PricingTrace = { ...trace, steps: { ...trace.steps, units: trace.steps.units === null ? null : { ...trace.steps.units, mue: { checked: false, record: null, value: null } }, adjustments: [] } };
    expect(contentReads(off)).toEqual([]);
  });
});

describe('contentGapsOf and rangesCover', () => {
  it('finds the reads outside the spans, at the edges: the last day in, the first day out, and open spans', () => {
    expect(contentGapsOf(maTraces('2026-09-30')[0] as PricingTrace, GAP_SPANS)).toEqual([]);
    expect(contentGapsOf(maTraces('2026-10-01')[0] as PricingTrace, GAP_SPANS)).toEqual([
      { content: 'ncci_mue', date: '2026-10-01' },
      { content: 'mppr_code', date: '2026-10-01' },
    ]);
    const open: ContentSpans = { mppr_code: [range('2026-01-01', null)], mppr_general: [range(null, null)], ncci_mue: [range(null, '2027-01-01')] };
    expect(contentGapsOf(maTraces('2026-12-31')[0] as PricingTrace, open)).toEqual([]);
    expect(contentGapsOf(maTraces('2026-12-31')[0] as PricingTrace, { ...open, mppr_code: [] })).toEqual([{ content: 'mppr_code', date: '2026-12-31' }]);
    expect(rangesCover([range('2026-01-01', '2026-04-01'), range('2026-07-01', null)], '2026-05-01')).toBe(false);
    expect(rangesCover([range('2026-01-01', '2026-04-01'), range('2026-07-01', null)], '2027-05-01')).toBe(true);
    expect(rangesCover([], '2026-05-01')).toBe(false);
  });
});

describe('the content failure codes', () => {
  it('name exactly the families read, and refuse an empty set', () => {
    const cases: [ContentFamily[], string][] = [
      [['mppr'], 'waiting_on_content_mppr'],
      [['mue'], 'waiting_on_content_mue'],
      [['mppr', 'mue'], 'waiting_on_content_mppr_mue'],
      [['mue', 'mppr'], 'waiting_on_content_mppr_mue'],
    ];
    for (const [families, code] of cases) {
      expect(contentFailureCode(new Set(families))).toBe(code);
    }
    expect(() => contentFailureCode(new Set())).toThrow(RangeError);
    for (const code of CONTENT_FAILURE_CODES) {
      expect(contentFailureCode(new Set(familiesOf(code)))).toBe(code);
    }
    expect([familyOf('mppr_code'), familyOf('mppr_general'), familyOf('ncci_mue')]).toEqual(['mppr', 'mppr', 'mue']);
    expect([contentsOf('mppr'), contentsOf('mue')]).toEqual([['mppr_code', 'mppr_general'], ['ncci_mue']]);
  });
});

describe('coveredDays', () => {
  it('gives the days of a period a content is loaded for, as inclusive ranges', () => {
    expect(coveredDays(GAP_SPANS, 'ncci_mue', '2026-09-01', '2026-10-31')).toEqual([{ from: '2026-09-01', to: '2026-09-30' }]);
    expect(coveredDays(GAP_SPANS, 'ncci_mue', '2026-10-01', '2026-10-31')).toEqual([]);
    expect(coveredDays(GAP_SPANS, 'mppr_general', '2026-10-01', '2026-10-31')).toEqual([{ from: '2026-10-01', to: '2026-10-31' }]);
    const split: ContentSpans = { ...GAP_SPANS, mppr_code: [range('2026-01-01', '2026-10-06'), range('2026-10-06', '2026-10-11'), range('2026-10-20', null)] };
    expect(coveredDays(split, 'mppr_code', '2026-10-01', '2026-10-31')).toEqual([
      { from: '2026-10-01', to: '2026-10-10' },
      { from: '2026-10-20', to: '2026-10-31' },
    ]);
    expect(coveredDays({ ...GAP_SPANS, ncci_mue: [range(null, null)] }, 'ncci_mue', '2026-10-01', '2026-10-31')).toEqual([{ from: '2026-10-01', to: '2026-10-31' }]);
  });
});

describe('isLoudContentGap', () => {
  const [trace] = maTraces() as [PricingTrace];
  const feeSchedule = trace.steps.fee_schedule;
  if (feeSchedule === null) {
    throw new Error('the trace has its fee schedule step');
  }
  const at = (date: string, schedule = feeSchedule): PricingTrace => ({ ...trace, line: { ...trace.line, service_date: date }, steps: { ...trace.steps, fee_schedule: schedule } });
  /** 2026-Q1 to Q3 loaded, Q4 not. */
  const PARTLY = windowsOf([['pfs_rvu', [range('2026-01-01', '2026-10-01')]]]);

  it('is never true of a priced line', () => {
    const [priced] = price({
      claim: { claimStatusCode: '1', reversed: false, corrected: false, remittanceDate: null, payerPlanKey: null, lines: [line(1, '97110', '2026-10-14')] },
      release: RELEASE,
      settings: SETTINGS,
      asOf: '2026-12-15',
    });
    expect(isLoudContentGap(priced as LinePricing, windowsOf([]))).toBe(false);
  });

  it('for terms priced on the date of service, is a date in a quarter of the year not loaded, never a loaded date whose code has no relative value', () => {
    expect(isLoudContentGap(unpriced(at('2026-10-14'), 'NO_PFS_VALUE', 'no_rvu_in_basis_year'), PARTLY)).toBe(true);
    expect(isLoudContentGap(unpriced(at('2026-08-03'), 'NO_PFS_VALUE', 'no_rvu_in_basis_year'), PARTLY)).toBe(false);
    expect(isLoudContentGap(unpriced(at('2026-09-30'), 'NO_PFS_VALUE', 'no_rvu_in_basis_year'), PARTLY)).toBe(false);
    // A fee schedule not loaded at all, and the other NO_PFS_VALUE detail, which is the setting's.
    expect(isLoudContentGap(unpriced(at('2026-08-03'), 'NO_PFS_VALUE', 'no_rvu_in_basis_year'), windowsOf([]))).toBe(true);
    expect(isLoudContentGap(unpriced(at('2026-10-14'), 'NO_PFS_VALUE', 'practice_expense_not_available'), PARTLY)).toBe(false);
  });

  it('for terms locked to a year, is a basis year with no fee-schedule window, whatever the date', () => {
    const locked = (year: number) => ({ ...feeSchedule, year_basis: `LOCKED:${String(year)}`, basis_year: year, lookup: 'latest_in_basis_year' as const });
    expect(isLoudContentGap(unpriced(at('2026-10-14', locked(2025)), 'NO_PFS_VALUE', 'no_rvu_in_basis_year'), PARTLY)).toBe(true);
    expect(isLoudContentGap(unpriced(at('2026-10-14', locked(2026)), 'NO_PFS_VALUE', 'no_rvu_in_basis_year'), PARTLY)).toBe(false);
    // Loaded through 2026-12-31 meets no day of 2027; through 2027-01-01, one.
    expect(isLoudContentGap(unpriced(at('2026-10-14', locked(2027)), 'NO_PFS_VALUE', 'no_rvu_in_basis_year'), windowsOf([['pfs_rvu', [range('2026-01-01', '2027-01-01')]]]))).toBe(true);
    expect(isLoudContentGap(unpriced(at('2026-10-14', locked(2027)), 'NO_PFS_VALUE', 'no_rvu_in_basis_year'), windowsOf([['pfs_rvu', [range('2026-01-01', '2027-01-02')]]]))).toBe(false);
  });

  it.each([
    ['no_gpci', 'pfs_gpci'],
    ['no_conversion_factor', 'conversion_factor'],
    ['no_sequestration_record', 'sequestration'],
    ['no_assistant_record', 'assistant_modifier'],
    ['no_locality', 'locality_map'],
    ['no_locality_plus_four', 'locality_map_plus_four'],
  ] as const)('is an ENGINE_ERROR %s on a date its content (%s) is not loaded for, and never inside its windows', (detail, content) => {
    const windows = windowsOf([[content, [range('2026-01-01', '2026-10-01')]]]);
    expect(isLoudContentGap(unpriced(at('2026-10-14'), 'ENGINE_ERROR', detail), windows)).toBe(true);
    expect(isLoudContentGap(unpriced(at('2026-09-30'), 'ENGINE_ERROR', detail), windows)).toBe(false);
    expect(isLoudContentGap(unpriced(at('2026-09-30'), 'ENGINE_ERROR', detail), windowsOf([]))).toBe(true);
  });

  it('is never another ENGINE_ERROR, nor the span contents’ own stops', () => {
    for (const detail of ['no_mppr_rate', 'unexpected', 'locality_needs_zip_plus_four', 'zip_plus_four_not_in_locality_map', 'mppr_needs_fee_schedule']) {
      expect(isLoudContentGap(unpriced(at('2026-10-14'), 'ENGINE_ERROR', detail), windowsOf([])), detail).toBe(false);
    }
  });
});
