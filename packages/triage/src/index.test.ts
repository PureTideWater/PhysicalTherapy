import type { IndexedRelease } from '@tp/pricing';
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

  it('computes one contract window rule, calendar days after the payment date, and no Medicare Advantage route until Q34 is answered (best-option audit #5)', () => {
    expect(triage.COMPUTED_CONTRACT_WINDOW).toEqual({ unit: 'calendar_days', measuredFrom: 'payment_date' });
    expect(triage.contractWindowRuleComputed({ unit: 'calendar_days', measuredFrom: 'date_of_service' })).toBe(false);
    expect(triage.contractWindowRuleComputed({ unit: 'calendar_days', measuredFrom: 'remittance_date' })).toBe(false);
    expect(triage.MA_DISPUTE_ROUTE_CONFIRMED).toBe(false);
    expect(triage.DEADLINE_UNVERIFIED_CAUSES).toContain('MA_ROUTE_UNCONFIRMED');
    expect(triage.DEADLINE_UNVERIFIED_CAUSES).toContain('CONTRACT_WINDOW_RULE_NOT_COMPUTED');
  });

  it('holds a line priced without the Medicare content it read, after RELEASE_WITHDRAWN, and reads only two record types of a release (audit #7 and #31)', () => {
    expect(triage.NOT_ACTIONABLE_REASONS.indexOf('CONTENT_NOT_LOADED')).toBe(triage.NOT_ACTIONABLE_REASONS.indexOf('RELEASE_WITHDRAWN') + 1);
    expect(triage.BEHAVIOR_RECORD_TYPES).toEqual(['mppr_rate', 'conversion_factor']);
    // releaseReferences() asks a release for those types and no other, so a release read for them alone serves it.
    const asked = new Set<string>();
    const release = {
      releaseNo: 900001,
      manifestSha256: '0'.repeat(64),
      inForce: (type: string) => (asked.add(type), null),
      latestInYear: (type: string) => (asked.add(type), null),
      ref: () => {
        throw new Error('no record is referenced');
      },
    } as unknown as IndexedRelease;
    const references = triage.releaseReferences(release);
    expect([references.mpprReductionPercent('97110', '2026-03-02'), references.conversionFactor('non_qualifying', 2026)]).toEqual([null, null]);
    expect([...asked].sort()).toEqual([...triage.BEHAVIOR_RECORD_TYPES].sort());
  });

  it('defaults the materiality to $5 a line and $250 a case and the anomaly cohort to 30 lines (PRD 20)', () => {
    expect(triage.DEFAULT_TRIAGE_SETTINGS).toMatchObject({ lineMaterialityCents: 500n, caseMaterialityCents: 25000n, anomalyMinimumCohort: 30 });
  });
});
