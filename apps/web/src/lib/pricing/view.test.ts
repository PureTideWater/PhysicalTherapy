import { price } from '@tp/pricing';
import { lineFacts, pricingInput, syntheticRelease } from '@tp/pricing/testing';
import { describe, expect, it } from 'vitest';

import { firstDayOf, lastDayOf } from '../routes/pricing';
import { shareOf, stageOf, traceOrder, traceSteps } from './view';

/** How pricing results read on screen: stages, shares, the trace's steps in order, and run periods by month. SYNTHETIC inputs only. */

describe('a line’s stage from its run', () => {
  it('is unpriced with a reason, validated when short of its expected amount, and none when paid at or above it', () => {
    expect(stageOf(null)).toBeNull();
    expect(stageOf({ expectedAllowedCents: null, varianceCents: null, unpricedReason: 'NO_MAPPING' })).toBe('unpriced');
    expect(stageOf({ expectedAllowedCents: '5000', varianceCents: '1200', unpricedReason: null })).toBe('validated');
    expect(stageOf({ expectedAllowedCents: '5000', varianceCents: '0', unpricedReason: null })).toBeNull();
    expect(stageOf({ expectedAllowedCents: '5000', varianceCents: '-300', unpricedReason: null })).toBeNull();
  });
});

describe('shares', () => {
  it('are percentages to one place, rounded half up, in integers, and zero of nothing', () => {
    expect(shareOf(1, 3)).toBe('33.3%');
    expect(shareOf(2, 3)).toBe('66.7%');
    expect(shareOf('18400', '32800')).toBe('56.1%');
    expect(shareOf(4, 4)).toBe('100.0%');
    expect(shareOf(0, 0)).toBe('0%');
    expect(shareOf(123_456_789_012_345n, 987_654_321_098_765n)).toBe('12.5%');
  });
});

describe('the trace’s steps', () => {
  const [priced] = price(pricingInput(syntheticRelease(900001), [lineFacts({ units: '2' })]));
  const trace: unknown = JSON.parse(JSON.stringify(priced?.trace));

  it('come in the engine’s order: the release, the facts, the agreement, the terms, each step of PRD 11, the outcome', () => {
    const keys = traceSteps(trace).map((item) => item.key);
    const { steps } = traceOrder();
    expect(keys.slice(0, 7)).toEqual(['release', 'as_of', 'settings', 'claim', 'line', 'agreement', 'terms']);
    expect(keys.slice(7, 7 + steps.length)).toEqual([...steps]);
    expect(keys.at(-1)).toBe('outcome');
    expect(steps.indexOf('fee_schedule')).toBeLessThan(steps.indexOf('units'));
    expect(steps.indexOf('units')).toBeLessThan(steps.indexOf('adjustments'));
    expect(steps.indexOf('rounding')).toBeLessThan(steps.indexOf('window'));
  });

  it('name every rule record a step read, with its window and SHA-256, and the release with its manifest', () => {
    const views = traceSteps(trace);
    const fee = views.find((item) => item.key === 'fee_schedule');
    expect(fee?.title).toBe('Step 2: the fee schedule');
    expect(fee?.records.map((record) => record.recordType)).toEqual(expect.arrayContaining(['pfs_rvu', 'locality_map', 'pfs_gpci', 'conversion_factor']));
    expect(fee?.records.every((record) => /^[0-9a-f]{64}$/.test(record.sha256))).toBe(true);
    const release = views.find((item) => item.key === 'release');
    expect(release?.recorded).toContain('"number": 900001');
    expect(release?.recorded).toContain('manifest_sha256');
  });

  it('mark a step the line never reached, and keep a part of a trace it does not know', () => {
    const [unpriced] = price(pricingInput(syntheticRelease(900001), [lineFacts({ agreement: { outcome: 'NO_MAPPING' } })]));
    const views = traceSteps({ ...(JSON.parse(JSON.stringify(unpriced?.trace)) as object), extra: { note: 'kept' } });
    expect(views.find((item) => item.key === 'rounding')?.recorded).toBeNull();
    expect(views.find((item) => item.key === 'adjustments')?.recorded).toBeNull();
    expect(views.find((item) => item.key === 'outcome')?.recorded).toContain('NO_MAPPING');
    expect(views.at(-1)).toMatchObject({ key: 'extra', title: 'Extra' });
    expect(traceSteps(null)).toEqual([]);
  });
});

describe('a run’s period by months', () => {
  it('runs from the first day of the first month to the last day of the last', () => {
    expect(firstDayOf('2026-03')).toBe('2026-03-01');
    expect(lastDayOf('2026-03')).toBe('2026-03-31');
    expect(lastDayOf('2026-02')).toBe('2026-02-28');
    expect(lastDayOf('2028-02')).toBe('2028-02-29');
    expect(lastDayOf('2026-12')).toBe('2026-12-31');
  });
});
