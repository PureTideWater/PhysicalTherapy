import { describe, expect, it } from 'vitest';

import * as triage from './index';

describe('@tp/triage', () => {
  it('orders the five line stages from flagged to recovered (PRD 8)', () => {
    expect(triage.LINE_STAGES).toEqual(['flagged', 'validated', 'actionable', 'payer_approved', 'recovered']);
  });

  it('lists the case states of PRD section 8', () => {
    expect(triage.CASE_STATES).toEqual(['open', 'submitted', 'awaiting_response', 'partially_resolved', 'resolved', 'closed_written_off']);
  });

  it('lists the closed write-off reasons of PRD 12', () => {
    expect(triage.WRITE_OFF_REASONS).toEqual(['window_passed', 'payer_correct_on_review', 'not_worth_pursuit', 'duplicate', 'other']);
  });

  it('defaults the materiality to $5 a line and $250 a case and the anomaly cohort to 30 lines (PRD 20)', () => {
    expect(triage.DEFAULT_TRIAGE_SETTINGS).toMatchObject({ lineMaterialityCents: 500n, caseMaterialityCents: 25000n, anomalyMinimumCohort: 30 });
  });
});
