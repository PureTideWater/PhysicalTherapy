import { type Cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { INVESTIGATORY, SCREENED_REASONS, type ScreenedLine, cohortId, quarterOf, screenAnomalies } from './anomaly';

const SETTINGS = { anomalyMinimumCohort: 30, anomalyThresholdCents: 1000n as Cents };

let sequence = 0;
function line(observed: bigint, overrides: Partial<ScreenedLine> = {}): ScreenedLine {
  sequence += 1;
  return {
    serviceLineId: `line-${String(sequence).padStart(4, '0')}`,
    payerId: 'payer-1',
    planId: 'plan-oon',
    procedureCode: '97110',
    modifiers: [],
    placeOfService: '11',
    serviceDate: '2026-04-10',
    units: '1',
    observedAllowedCents: observed as Cents,
    unpricedReason: 'NO_AGREEMENT',
    ...overrides,
  };
}

describe('anomaly screening (PRD 12; CAS-01, CAS-02)', () => {
  it('produces no anomaly for a cohort one line short of the minimum (CAS-01)', () => {
    const cohort = Array.from({ length: 29 }, (_, index) => line(index < 25 ? 9000n : 7000n));
    expect(screenAnomalies(cohort, SETTINGS)).toEqual([]);
  });

  it('reports the mode, the distribution and the lines short of the mode by more than the threshold, labelled investigatory (CAS-02)', () => {
    const cohort = Array.from({ length: 32 }, (_, index) => line(index % 8 === 7 ? 7000n : 9000n));
    const [anomaly, ...rest] = screenAnomalies(cohort, SETTINGS);
    expect(rest).toEqual([]);
    expect(anomaly).toMatchObject({ cohortSize: 32, modalAllowedCents: 9000n, rangeLowCents: 4000n, rangeHighCents: 8000n });
    expect(anomaly?.lineIds).toHaveLength(4);
    expect(anomaly?.cohortKey).toEqual({ payer_id: 'payer-1', plan_id: 'plan-oon', procedure_code: '97110', modifiers: [], place_of_service: '11', quarter: '2026-Q2' });
    expect(anomaly?.stats).toEqual({
      format: 'tp-anomaly-stats/1',
      label: INVESTIGATORY,
      basis: 'observed_allowed_per_unit',
      lines: 32,
      min_cents: '7000',
      p25_cents: '9000',
      median_cents: '9000',
      p75_cents: '9000',
      max_cents: '9000',
      modal_cents: '9000',
      modal_lines: 28,
      threshold_cents: '1000',
      below_mode_lines: 4,
      flagged_lines: 4,
      flagged_observed_cents: '28000',
      range_low_cents: '4000',
      range_high_cents: '8000',
    });
  });

  it('separates cohorts by payer, plan, code, modifier set, place of service and quarter', () => {
    const base = Array.from({ length: 30 }, () => line(9000n));
    const variants: Partial<ScreenedLine>[] = [{ payerId: 'payer-2' }, { planId: 'plan-2' }, { procedureCode: '97140' }, { modifiers: ['GP'] }, { placeOfService: '22' }, { serviceDate: '2026-07-01' }];
    for (const variant of variants) {
      const mixed = [...base.slice(0, 29), line(5000n, variant)];
      expect(screenAnomalies(mixed, SETTINGS), JSON.stringify(variant)).toEqual([]);
    }
    // The modifier set is a set: order and repeats do not split a cohort.
    const sets = [...Array.from({ length: 29 }, () => line(9000n, { modifiers: ['GP', 'KX'] })), line(5000n, { modifiers: ['KX', 'GP', 'KX'] })];
    expect(screenAnomalies(sets, SETTINGS)).toHaveLength(1);
  });

  it('compares per unit, and measures a line’s shortfall as the mode times its units', () => {
    const cohort = [...Array.from({ length: 29 }, () => line(4500n)), line(18000n, { units: '4' }), line(6500n, { units: '2' })];
    const [anomaly] = screenAnomalies(cohort, SETTINGS);
    expect(anomaly?.modalAllowedCents).toBe(4500n);
    // 2 x 45.00 = 90.00 against 65.00: 25.00 short, more than 10.00.
    expect(anomaly?.stats.flagged_lines).toBe(1);
    expect(anomaly?.rangeHighCents).toBe(2500n);
    expect(anomaly?.rangeLowCents).toBe(1500n);
  });

  it('screens only lines with no agreement or no schedule, with a positive unit count', () => {
    const others = ['SECONDARY_PAYER', 'REVERSED_CLAIM', 'MUE_EXCEEDED', 'ENGINE_ERROR', null];
    const cohort = [...Array.from({ length: 29 }, () => line(9000n)), ...others.map((reason) => line(1000n, { unpricedReason: reason })), line(1000n, { units: '0' }), line(1000n, { units: '-1' })];
    expect(screenAnomalies(cohort, SETTINGS)).toEqual([]);
    expect(SCREENED_REASONS).toContain('NO_AGREEMENT');
    expect(SCREENED_REASONS).toContain('NO_MAPPING');
  });

  it('takes the lowest of equally frequent amounts as the mode, and needs a line past the threshold', () => {
    const tied = [...Array.from({ length: 15 }, () => line(9000n)), ...Array.from({ length: 15 }, () => line(8500n))];
    expect(screenAnomalies(tied, SETTINGS)).toEqual([]);
    const near = [...Array.from({ length: 29 }, () => line(9000n)), line(8000n)];
    expect(screenAnomalies(near, SETTINGS)).toEqual([]);
  });

  it('names quarters and cohorts stably', () => {
    expect(['2026-01-01', '2026-03-31', '2026-04-01', '2026-12-31'].map(quarterOf)).toEqual(['2026-Q1', '2026-Q1', '2026-Q2', '2026-Q4']);
    expect(() => quarterOf('2026-4-1')).toThrow(RangeError);
    const key = { payer_id: 'p', plan_id: 'q', procedure_code: '97110', modifiers: ['GP'], place_of_service: null, quarter: '2026-Q1' };
    expect(cohortId(key)).toBe(cohortId({ ...key }));
  });

  it('never flags a line at or above the mode, and its range is within what the flagged lines were paid short (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.bigInt({ min: 1000n, max: 12_000n }), { minLength: 30, maxLength: 80 }), fc.bigInt({ min: 0n, max: 3000n }), (amounts, threshold) => {
        const lines = amounts.map((amount) => line(amount));
        const found = screenAnomalies(lines, { anomalyMinimumCohort: 30, anomalyThresholdCents: threshold as Cents });
        for (const anomaly of found) {
          const flagged = lines.filter((item) => anomaly.lineIds.includes(item.serviceLineId));
          expect(flagged.every((item) => item.observedAllowedCents + threshold < anomaly.modalAllowedCents)).toBe(true);
          expect(anomaly.rangeLowCents).toBeLessThanOrEqual(anomaly.rangeHighCents);
          expect(anomaly.rangeHighCents).toBe(flagged.reduce((sum, item) => sum + (anomaly.modalAllowedCents - item.observedAllowedCents), 0n));
          expect(anomaly.stats.label).toBe('investigatory');
        }
        expect(found.length).toBeLessThanOrEqual(1);
      }),
    );
  });
});
