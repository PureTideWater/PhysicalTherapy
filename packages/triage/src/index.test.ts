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

  it('judges a deadline verified, unverified or not applicable, and DEADLINE_UNVERIFIED is a reason to wait, after NO_WINDOW (D17 a)', () => {
    expect(triage.DEADLINE_STATUSES).toEqual(['verified', 'unverified', 'not_applicable']);
    expect(triage.NOT_ACTIONABLE_REASONS.indexOf('DEADLINE_UNVERIFIED')).toBe(triage.NOT_ACTIONABLE_REASONS.indexOf('NO_WINDOW') + 1);
    expect(triage.DEFAULT_DEADLINE_LEVEL).toBe('L2');
  });

  it('defaults the materiality to $5 a line and $250 a case and the anomaly cohort to 30 lines (PRD 20)', () => {
    expect(triage.DEFAULT_TRIAGE_SETTINGS).toMatchObject({ lineMaterialityCents: 500n, caseMaterialityCents: 25000n, anomalyMinimumCohort: 30 });
  });
});
