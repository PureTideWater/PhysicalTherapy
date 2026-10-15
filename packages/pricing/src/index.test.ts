import { describe, expect, it } from 'vitest';

import { UNPRICED_REASONS } from './index';

describe('@tp/pricing', () => {
  it('has the closed list of twelve unpriced reasons from PRD section 11', () => {
    expect(UNPRICED_REASONS).toEqual([
      'NO_AGREEMENT',
      'NO_MAPPING',
      'AMBIGUOUS_RATE',
      'NO_RATE_FOR_CODE',
      'NO_PFS_VALUE',
      'UNSUPPORTED_METHOD',
      'SECONDARY_PAYER',
      'MUE_EXCEEDED',
      'UNITS_RULE_UNKNOWN',
      'DATE_OUTSIDE_VERSIONS',
      'REVERSED_CLAIM',
      'ENGINE_ERROR',
    ]);
  });
});
