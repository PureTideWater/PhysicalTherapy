import { describe, expect, it } from 'vitest';

import { type ApprovalFacts, type ApprovalViewer, SINGLE_USER_DELAY_MS, approvalState, waitText } from './approval';

/**
 * The approval panel says ahead what the database will answer (PRD 12, Approval; test matrix CAS-08,
 * CAS-09, CAS-10): a failing verifier blocks approval, the drafter or last editor is refused while
 * someone else approves packets, and in a single-user practice the writer waits 24 hours.
 */

const WRITTEN = '2026-10-16T08:00:00.000Z';
const facts: ApprovalFacts = {
  verifierPassed: true,
  current: true,
  matchesCase: true,
  regulationCitation: false,
  regulationConfirmed: false,
  approvedAt: null,
  approvedBy: null,
  approvedAlone: false,
  writtenAt: WRITTEN,
  writerId: 'writer',
  drafterId: 'drafter',
};
const second: ApprovalViewer = { userId: 'second', approves: true, othersApprove: true };
const at = (ms: number) => new Date(Date.parse(WRITTEN) + ms);

describe('approvalState', () => {
  it('shows an approval as it was recorded, with its audit flag', () => {
    expect(approvalState({ ...facts, approvedAt: '2026-10-17T09:00:00.000Z', approvedBy: 'b@synthetic.test', approvedAlone: true }, second, at(0))).toEqual({
      status: 'approved',
      by: 'b@synthetic.test',
      at: '2026-10-17T09:00:00.000Z',
      alone: true,
    });
  });

  it('blocks approval while the verifier fails, the version is not current, the case changed, or the regulation is unconfirmed (CAS-08)', () => {
    expect(approvalState({ ...facts, verifierPassed: false }, second, at(0))).toEqual({ status: 'blocked', reason: 'verifier' });
    expect(approvalState({ ...facts, current: false }, second, at(0))).toEqual({ status: 'blocked', reason: 'not_current' });
    expect(approvalState({ ...facts, matchesCase: false }, second, at(0))).toEqual({ status: 'blocked', reason: 'case_changed' });
    expect(approvalState({ ...facts, regulationCitation: true }, second, at(0))).toEqual({ status: 'blocked', reason: 'regulation' });
    expect(approvalState({ ...facts, regulationCitation: true, regulationConfirmed: true }, second, at(0))).toEqual({ status: 'ready', alone: false });
  });

  it('lets a second person approve, and refuses the drafter or the last editor while someone else approves (CAS-09)', () => {
    expect(approvalState(facts, second, at(0))).toEqual({ status: 'ready', alone: false });
    expect(approvalState(facts, { ...second, approves: false }, at(0))).toEqual({ status: 'not_approver' });
    expect(approvalState(facts, { ...second, userId: 'writer' }, at(0))).toEqual({ status: 'drafter' });
    expect(approvalState(facts, { ...second, userId: 'drafter' }, at(SINGLE_USER_DELAY_MS * 2))).toEqual({ status: 'drafter' });
  });

  it('makes the writer of a single-user practice wait 24 hours, then approve alone (CAS-10)', () => {
    const alone: ApprovalViewer = { userId: 'writer', approves: true, othersApprove: false };
    expect(approvalState(facts, alone, at(60_000))).toEqual({ status: 'waiting', until: '2026-10-17T08:00:00.000Z', remainingMs: SINGLE_USER_DELAY_MS - 60_000 });
    expect(approvalState(facts, alone, at(SINGLE_USER_DELAY_MS))).toEqual({ status: 'ready', alone: true });
  });
});

describe('waitText', () => {
  it('rounds up to the minute', () => {
    expect(waitText(SINGLE_USER_DELAY_MS - 60_000)).toBe('23 h 59 min');
    expect(waitText(61_000)).toBe('2 min');
    expect(waitText(0)).toBe('0 min');
    expect(waitText(-5)).toBe('0 min');
  });
});
