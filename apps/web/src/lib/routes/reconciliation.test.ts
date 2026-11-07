import { describe, expect, it } from 'vitest';

import { REFUSALS } from './reconciliation';

/**
 * A reconciliation refusal names what is wrong, then the step, joined by a semicolon (test matrix FRM-04; docs/adr/0077,
 * amended by co-001/ux-forms-after-42): the form prints "{Field}: {message}", so a message never carries a colon of its own.
 */
describe('reconciliation refusals', () => {
  it('say why a case line takes no match, and where to look', () => {
    expect(REFUSALS.not_open).toEqual({
      field: 'serviceLineId',
      message: 'the case line is not open, because it was written off or its case is closed; open the case to see where it stands',
    });
  });

  it('ask for a different amount when an adjustment would not change it', () => {
    expect(REFUSALS.no_change_in_amount).toEqual({ field: 'amount', message: 'an adjustment changes the amount; enter a different amount' });
  });

  it('keep every message free of a colon of its own', () => {
    for (const refusal of Object.values(REFUSALS)) {
      expect(refusal.message).not.toContain(': ');
    }
  });
});
