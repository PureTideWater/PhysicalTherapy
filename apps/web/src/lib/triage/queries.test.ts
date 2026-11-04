import { describe, expect, it } from 'vitest';

import { type CaseState, netExpectedOf } from './queries';

/**
 * A case's Net expected value (docs/adr/0082 Decision 5; the fix review's E3 and UX-R1-01): the live figure less the
 * pursuit cost only on a case still being worked with a line in its figure and a pursuit estimate. A resolved or closed
 * case, whose pursuit cost was set when it opened, never reads as a loss of that cost.
 */
describe('a case’s net expected value', () => {
  const of = (state: CaseState, actionableNowCents: string, actionableNowLines: number, pursuitCostCents: string | null) => netExpectedOf({ state, actionableNowCents, actionableNowLines, pursuitCostCents });

  it('is not shown on a resolved or closed case, whatever its figure and estimate', () => {
    expect(of('resolved', '0', 0, '4500')).toEqual({ state: 'closed', cents: null });
    expect(of('closed_written_off', '0', 0, '4500')).toEqual({ state: 'closed', cents: null });
    expect(of('resolved', '3000', 1, null)).toEqual({ state: 'closed', cents: null });
  });

  it('is not estimated without a pursuit cost', () => {
    expect(of('open', '3000', 1, null)).toEqual({ state: 'unestimated', cents: null });
  });

  it('is not computed on a worked case with no line in its figure', () => {
    for (const state of ['open', 'submitted', 'awaiting_response', 'partially_resolved'] as const) {
      expect(of(state, '0', 0, '4500')).toEqual({ state: 'no_line', cents: null });
    }
  });

  it('is the live figure less the cost otherwise, in integer cents, negative when pursuit is not worth it', () => {
    expect(of('open', '6000', 2, '4500')).toEqual({ state: 'live', cents: '1500' });
    expect(of('open', '3000', 1, '4500')).toEqual({ state: 'live', cents: '-1500' });
    expect(of('partially_resolved', '900000000000001', 3, '4500')).toEqual({ state: 'live', cents: '899999999995501' });
  });
});
