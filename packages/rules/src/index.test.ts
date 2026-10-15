import { describe, expect, it } from 'vitest';

import { RULE_RECORD_TYPES, VERIFICATION_LEVELS } from './index';

describe('@tp/rules', () => {
  it('lists every global rule record type of the data dictionary', () => {
    expect(RULE_RECORD_TYPES).toEqual([
      'pfs_rvu',
      'pfs_gpci',
      'conversion_factor',
      'mppr_rate',
      'therapy_threshold',
      'assistant_modifier',
      'sequestration',
      'ncci_ptp',
      'ncci_mue',
      'carc',
      'rarc',
      'claim_status_code',
      'state_prompt_pay',
      'dispute_window',
      'locality_map',
    ]);
  });

  it('has three verification levels', () => {
    expect(VERIFICATION_LEVELS).toEqual(['L1', 'L2', 'L3']);
  });
});
