import { describe, expect, it } from 'vitest';

import { CASE_STATES, LINE_STAGES } from './index';

describe('@tp/triage', () => {
  it('orders the five line stages from flagged to recovered', () => {
    expect(LINE_STAGES).toEqual(['flagged', 'validated', 'actionable', 'payer_approved', 'recovered']);
  });

  it('lists the case states of PRD section 8', () => {
    expect(CASE_STATES).toEqual([
      'open',
      'submitted',
      'awaiting_response',
      'partially_resolved',
      'resolved',
      'closed_written_off',
    ]);
  });
});
