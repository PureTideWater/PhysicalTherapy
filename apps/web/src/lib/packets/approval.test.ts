import { PACKET_EXPORT_FAILURES, PACKET_EXPORT_REFUSALS } from '@tp/worker/packets';
import { describe, expect, it } from 'vitest';

import { type ApprovalFacts, type ApprovalViewer, BLOCKED_REASONS, SINGLE_USER_DELAY_MS, approvalState, waitText } from './approval';
import { EXPORT_FAILURE_TEXT, EXPORT_REFUSAL_TEXT, type ExportAttempt, NOT_APPROVED_ALONE_TEXT, exportAttemptWords, exportRefusalText } from './export-attempts';
import { PRICING_BLOCKED_TEXT } from './pricing';
import { BLOCKED_TEXT, DEADLINE_NOT_EXPORTABLE, DRAFTER_APPROVAL_TEXT, DRAFTER_REQUESTED_TEXT } from './queries';

/**
 * The approval panel says ahead what the database will answer (PRD 12, Approval; test matrix CAS-08,
 * CAS-09, CAS-10): a failing verifier blocks approval, the drafter or last editor is refused while
 * someone else approves packets, and in a single-user practice the writer waits 24 hours. Since the
 * best-option audit's items #4, #26 and #61 (the founder's ruling of 2026-10-18; docs/adr/0061), a version whose
 * pricing is no longer current is blocked too, every blocked reason has its words, the drafter's disabled Approve
 * button says who approves, and every export refusal and failure the job can record has its words and its fix.
 */

const WRITTEN = '2026-10-16T08:00:00.000Z';
const facts: ApprovalFacts = {
  verifierPassed: true,
  verifierCurrent: true,
  current: true,
  matchesCase: true,
  pricingCurrent: true,
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

  it('blocks approval while the verifier fails, the version is not current, the case changed, its pricing is not current, or the regulation is unconfirmed (CAS-08; audit item #4)', () => {
    expect(approvalState({ ...facts, verifierPassed: false }, second, at(0))).toEqual({ status: 'blocked', reason: 'verifier' });
    expect(approvalState({ ...facts, verifierCurrent: false }, second, at(0))).toEqual({ status: 'blocked', reason: 'verifier_outdated' });
    expect(approvalState({ ...facts, current: false }, second, at(0))).toEqual({ status: 'blocked', reason: 'not_current' });
    expect(approvalState({ ...facts, matchesCase: false }, second, at(0))).toEqual({ status: 'blocked', reason: 'case_changed' });
    expect(approvalState({ ...facts, pricingCurrent: false }, second, at(0))).toEqual({ status: 'blocked', reason: 'pricing_not_current' });
    expect(approvalState({ ...facts, regulationCitation: true }, second, at(0))).toEqual({ status: 'blocked', reason: 'regulation' });
    expect(approvalState({ ...facts, regulationCitation: true, regulationConfirmed: true }, second, at(0))).toEqual({ status: 'ready', alone: false });
  });

  it('says the pricing after the case’s lines and before the regulation, for every viewer, the drafter included', () => {
    expect(approvalState({ ...facts, matchesCase: false, pricingCurrent: false }, second, at(0))).toEqual({ status: 'blocked', reason: 'case_changed' });
    expect(approvalState({ ...facts, pricingCurrent: false, regulationCitation: true }, second, at(0))).toEqual({ status: 'blocked', reason: 'pricing_not_current' });
    expect(approvalState({ ...facts, pricingCurrent: false }, { ...second, userId: 'writer' }, at(0))).toEqual({ status: 'blocked', reason: 'pricing_not_current' });
    expect(approvalState({ ...facts, pricingCurrent: false }, { ...second, approves: false }, at(0))).toEqual({ status: 'blocked', reason: 'pricing_not_current' });
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

describe('the approval panel’s words', () => {
  it('has a sentence for every blocked reason, the pricing’s being the pricing check’s own (audit item #4)', () => {
    expect(Object.keys(BLOCKED_TEXT)).toEqual([...BLOCKED_REASONS]);
    for (const text of Object.values(BLOCKED_TEXT)) {
      expect(text).toMatch(/^[A-Z].*[.)]$/);
    }
    expect(BLOCKED_TEXT.pricing_not_current).toBe(PRICING_BLOCKED_TEXT.approval);
  });

  it('tells the drafter who approves and how to ask, and once asked, that the request stands (CAS-09; audit item #61)', () => {
    expect(DRAFTER_APPROVAL_TEXT).toBe('A second person who approves packets approves it; ask with Request approval.');
    // The Request approval form is gone once asked: the words no longer point to it.
    expect(DRAFTER_REQUESTED_TEXT).toBe('Approval is requested; a second person who approves packets approves it here.');
    expect(DRAFTER_REQUESTED_TEXT).not.toMatch(/Request approval/);
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

describe('the export’s words (audit item #26)', () => {
  const time = (iso: string) => `[${iso}]`;
  const REQUESTED = '2026-10-18T09:00:00.000Z';
  const ANSWERED = '2026-10-18T09:00:05.000Z';

  it('has a sentence with its fix for every code the job refuses with, the pricing’s and the deadline’s being their own', () => {
    expect(Object.keys(EXPORT_REFUSAL_TEXT)).toEqual([...PACKET_EXPORT_REFUSALS]);
    for (const text of Object.values(EXPORT_REFUSAL_TEXT)) {
      expect(text).toMatch(/^[A-Z].*\.$/);
      expect(text).not.toMatch(/\{\{|SYN|\$\d/);
    }
    expect(EXPORT_REFUSAL_TEXT.pricing_not_current).toBe(PRICING_BLOCKED_TEXT.export);
    expect(EXPORT_REFUSAL_TEXT.deadline_unverified).toBe(DEADLINE_NOT_EXPORTABLE);
    // Above the first level, a passed window is the next level's: never a reason to write the case's lines off.
    expect(EXPORT_REFUSAL_TEXT.next_window_passed).toMatch(/^The next dispute level’s window/);
    expect(EXPORT_REFUSAL_TEXT.next_window_passed).toMatch(/Do not write the lines off/);
    // In a single-user practice the writer approves alone after the delay, so "a second person" is not the step.
    expect(exportRefusalText('not_approved', { singleUser: false })).toBe(EXPORT_REFUSAL_TEXT.not_approved);
    expect(exportRefusalText('not_approved', { singleUser: true })).toBe(NOT_APPROVED_ALONE_TEXT);
    expect(NOT_APPROVED_ALONE_TEXT).not.toMatch(/second person/);
    expect(exportRefusalText('case_changed', { singleUser: true })).toBe(EXPORT_REFUSAL_TEXT.case_changed);
  });

  it('has a sentence for every code a failed try names, and for a request with no result', () => {
    expect(Object.keys(EXPORT_FAILURE_TEXT)).toEqual([...PACKET_EXPORT_FAILURES, 'no_result']);
    for (const text of Object.values(EXPORT_FAILURE_TEXT)) {
      expect(text).toMatch(/^[A-Z].*\.$/);
    }
  });

  it('says nothing for no request and for an export made (the page shows the export itself)', () => {
    expect(exportAttemptWords({ state: 'none' }, time)).toBeNull();
    expect(exportAttemptWords({ state: 'exported', at: ANSWERED }, time)).toBeNull();
  });

  it('keeps an attempt in progress or trying again live, and says when it was asked for or failed', () => {
    expect(exportAttemptWords({ state: 'in_progress', requestedAt: REQUESTED }, time)).toEqual({
      state: 'in_progress',
      code: null,
      tone: 'info',
      title: 'Export in progress',
      text: `Asked at [${REQUESTED}]: the worker is checking the version again and printing its PDF and CSV. This updates by itself every few seconds.`,
      live: true,
    });
    expect(exportAttemptWords({ state: 'retrying', requestedAt: REQUESTED, at: ANSWERED, code: 'render_failed' }, time)).toMatchObject({
      state: 'retrying',
      code: 'render_failed',
      tone: 'warning',
      live: true,
      text: `The try at [${ANSWERED}] failed: The PDF could not be printed. Nothing was stored. The worker tries again by itself; this updates every few seconds.`,
    });
  });

  it('says a refusal with its reason and fix, and a failure with what to do; neither is live', () => {
    const refused: ExportAttempt = { state: 'refused', requestedAt: REQUESTED, at: ANSWERED, code: 'case_changed' };
    expect(exportAttemptWords(refused, time)).toMatchObject({ state: 'refused', code: 'case_changed', tone: 'danger', title: 'Export refused', live: false });
    expect(exportAttemptWords(refused, time)?.text).toBe(`The export job refused this version at [${ANSWERED}] and printed nothing. ${EXPORT_REFUSAL_TEXT.case_changed}`);
    // Once the version is ready to export again, the refusal is told as the earlier request's, without its fix.
    expect(exportAttemptWords(refused, time, { cleared: true })).toEqual({
      state: 'refused',
      code: 'case_changed',
      tone: 'info',
      title: 'An earlier request was refused',
      text: `The request at [${REQUESTED}] was refused: the case had changed. That no longer holds, so this version can be exported: export it again.`,
      live: false,
    });
    // A verifier failure keeps its fix: the version is written again whatever readiness says.
    expect(exportAttemptWords({ ...refused, code: 'verifier_failed' }, time, { cleared: true })).toMatchObject({ tone: 'danger', title: 'Export refused' });
    expect(exportAttemptWords({ state: 'failed', requestedAt: REQUESTED, at: ANSWERED, code: 'store_failed' }, time)).toMatchObject({
      title: 'Export failed',
      live: false,
      text: `The files could not be stored. Every try failed, the last at [${ANSWERED}], and nothing was stored. Ask for the export again; the operator was alerted.`,
    });
    expect(exportAttemptWords({ state: 'failed', requestedAt: REQUESTED, at: null, code: 'no_result' }, time)).toMatchObject({
      title: 'No result from the export',
      live: false,
      text: `No result came back within an hour of the request. It was asked for at [${REQUESTED}], and nothing was stored. Ask for the export again; if it does not finish, ask support.`,
    });
  });
});
