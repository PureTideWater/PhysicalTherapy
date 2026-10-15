import { describe, expect, it } from 'vitest';

import { ADJUSTMENT_FLAGS, CONTRACT_VERSION_STATES, RATE_METHODS, TIMED_UNITS_RULES } from './index';

describe('@tp/contracts', () => {
  it('lists the rate methods of PRD section 9', () => {
    expect(RATE_METHODS).toEqual(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT', 'UNSUPPORTED']);
  });

  it('lists the contract version states in lifecycle order', () => {
    expect(CONTRACT_VERSION_STATES).toEqual(['draft', 'proposed', 'approved', 'signed_off', 'superseded']);
  });

  it('lists the four Medicare adjustment flags', () => {
    expect(ADJUSTMENT_FLAGS).toEqual(['apply_mppr', 'apply_assistant_reduction', 'apply_sequestration', 'apply_ncci']);
  });

  it('lists the timed-units rules', () => {
    expect(TIMED_UNITS_RULES).toEqual(['MEDICARE_POOLED', 'PER_CODE', 'UNKNOWN']);
  });
});
