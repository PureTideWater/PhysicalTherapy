import { describe, expect, it } from 'vitest';

import { LEDGER_STAGES, PROOF_LEVELS } from './index';

describe('@tp/ledger', () => {
  it('lists the ledger entry stages of the data dictionary', () => {
    expect(LEDGER_STAGES).toEqual(['approved', 'posted', 'deposited', 'recouped', 'reversed', 'adjusted', 'interest']);
  });

  it('proves recovery at posted or deposited only', () => {
    expect(PROOF_LEVELS).toEqual(['posted', 'deposited']);
  });
});
