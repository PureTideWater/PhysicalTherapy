import { FIGURE_ROLES, MISMATCH_CODES, assemblePacket, narrativeFacts, verifyNarrative } from '@tp/packets';
import { checkReading } from '@tp/packets/check';
import { assemblyInput } from '@tp/packets/testing';
import { VERIFIER_STANDINGS } from '@tp/worker/packets';
import { describe, expect, it } from 'vitest';

import {
  CASE_VERIFIER_TEXT,
  FAILS_NOW_TEXT,
  FIGURE_KIND_TEXT,
  HISTORY_VERIFIER_TEXT,
  MISMATCH_TEXT,
  ROLE_TEXT,
  SAY_WHAT_IT_COUNTS,
  VERIFIER_STANDING_TEXT,
  failsNowRefusal,
  heldAsText,
  liveCheckSummary,
  mismatchShown,
  mismatchText,
  readAsText,
} from './view';

/**
 * The packet screens' words for the verifier's results (PRD 7, Packet builder: "narrative editor with verifier
 * results"; test matrix CAS-43; docs/adr/0086): a figure that does not match the records, said with what it was read as
 * and what the records hold it as, from the reader's own list of roles, so every role the reader has is worded; and what
 * the verifier says of a stored version now (the review of 2026-11-01, CORR-5).
 */

describe('the words for a figure in the wrong role', () => {
  it('word every role the reader has, each once, and nothing else', () => {
    expect(Object.keys(ROLE_TEXT).sort()).toEqual([...FIGURE_ROLES].sort());
    expect(new Set(Object.values(ROLE_TEXT)).size).toBe(FIGURE_ROLES.length);
  });

  it('pin each role’s words', () => {
    expect(ROLE_TEXT).toEqual({
      window_days: 'the dispute window’s days',
      days_to_pay: 'the days the payer has to pay',
      days_late: 'the days a payment was late',
      citation_page: 'the cited clause’s page',
      window_page: 'the dispute window’s page',
      version: 'the contract’s version',
      release: 'a rule release',
      level: 'the dispute level',
      lines: 'a count of lines',
      claims: 'a count of claims',
      patients: 'a count of patients',
      units: 'a count of units',
      line_units: 'each line’s units',
      row: 'a row of the schedule',
      claim_row: 'one of the claims',
      patient_row: 'one of the patients',
      expected: 'what the contract requires',
      allowed: 'what the payer allowed',
      paid: 'what the payer paid',
      variance: 'the shortfall',
      interest: 'interest',
      patient_share: 'the patient’s share',
      calculation: 'a step of a line’s calculation',
      contract_percent: 'the contract’s percentage',
      interest_rate: 'the interest rate',
      service_date: 'a date of service',
      paid_date: 'a payment date',
      received_date: 'the date the payer received a claim',
      due_date: 'the date payment was due',
      deadline: 'the dispute deadline',
      effective_date: 'the contract’s effective date',
      as_of_date: 'the packet’s date',
      schedule_year: 'the fee schedule’s year',
    });
  });

  it('say a failing figure in plain words: what it was read as and what the records hold it as (the UX review of 2026-10-28)', () => {
    expect(MISMATCH_TEXT.figure_not_in_input).toBe('a figure that does not match this version’s records');
    // No "role its words give it", and no rule release among the examples a person is asked to write.
    for (const text of [...Object.values(MISMATCH_TEXT), ...Object.values(FIGURE_KIND_TEXT), SAY_WHAT_IT_COUNTS]) {
      expect(text).not.toMatch(/role its words|release|input records/);
    }
    expect(SAY_WHAT_IT_COUNTS).toBe('say what it counts or names: 3 claims, 6 units, page 2, 3650 days');
    expect(readAsText(['claims'])).toBe('read as a count of claims');
    expect(readAsText(['lines', 'claims'])).toBe('read as a count of lines or a count of claims');
    expect(readAsText(['lines', 'claims', 'patients'])).toBe('read as a count of lines, a count of claims or a count of patients');
    expect(readAsText(['paid', 'variance'], true)).toBe('read as what the payer paid and the shortfall');
    expect(heldAsText(['expected'])).toBe('the records hold it as what the contract requires');
    expect(heldAsText(['lines', 'claims', 'patients'])).toBe('the records hold it as a count of lines, a count of claims and a count of patients');
    // A figure read in a role: what it was read as, and what the records hold it as, or that no record holds it so.
    expect(mismatchText('figure_not_in_input', 'amount', { roles: ['paid'], every: false, heldAs: ['expected'] })).toBe('read as what the payer paid; the records hold it as what the contract requires');
    expect(mismatchText('figure_not_in_input', 'number', { roles: ['claims'], every: false, heldAs: [] })).toBe('read as a count of claims; no record holds it as that');
    expect(mismatchText('figure_not_in_input', 'amount', { roles: ['paid', 'variance'], every: true, heldAs: ['paid'] })).toBe(
      'read as what the payer paid and the shortfall; the records hold it as what the payer paid',
    );
    // A number with no word for what it counts: asked to say it, and told what the records hold it as when they do.
    expect(mismatchText('figure_not_in_input', 'number', { roles: null, every: false, heldAs: [] })).toBe(SAY_WHAT_IT_COUNTS);
    expect(mismatchText('figure_not_in_input', 'number', { roles: null, every: false, heldAs: ['window_days'] })).toBe('say what it counts or names; the records hold it as the dispute window’s days');
    expect(mismatchText('figure_not_in_input', 'amount', { roles: null, every: false, heldAs: [] })).toBe('an amount no record holds');
    // Without its reading (a stored report, a refusal): said by its kind.
    expect(mismatchText('figure_not_in_input', 'amount')).toBe('an amount that does not match this version’s records');
    expect(mismatchText('figure_not_in_input', 'number', null)).toBe('a number that does not match this version’s records');
    expect(mismatchText('figure_not_in_input', null)).toBe(MISMATCH_TEXT.figure_not_in_input);
    expect(mismatchText('sentence_without_citation', null, { roles: ['claims'], every: false, heldAs: [] })).toBe(MISMATCH_TEXT.sentence_without_citation);
    for (const code of MISMATCH_CODES) {
      expect(MISMATCH_TEXT[code].length, code).toBeGreaterThan(10);
    }
  });

  it('word the editor’s own reading of a SYNTHETIC narrative that states the window’s days as visits (the reported defect)', () => {
    const content = assemblePacket(assemblyInput());
    const narrative = 'There were 3650 claims [3].';
    const { check, figures } = checkReading(narrative, narrativeFacts(content));
    const [mismatch] = check.mismatches;
    const figure = figures.find((item) => item.start === mismatch?.start && item.end === mismatch.end);
    expect(mismatch?.code).toBe('figure_not_in_input');
    expect(figure).toMatchObject({ roles: ['claims'], heldAs: ['window_days'], passed: false });
    expect(mismatchText('figure_not_in_input', mismatch?.kind ?? null, figure ?? null)).toBe('read as a count of claims; the records hold it as the dispute window’s days');
    expect(mismatchShown('figure_not_in_input', narrative.slice(mismatch?.start, mismatch?.end))).toBe('3650');
  });
});

describe('the words for what the verifier says of a stored version now (docs/adr/0086; the review of 2026-11-01, CORR-5)', () => {
  it('say each standing, never "passed" for a version the verifier fails now', () => {
    expect(VERIFIER_STANDING_TEXT).toEqual({ passed: 'Verifier passed', failed: 'Verifier failed', fails_now: 'Verifier fails it now' });
    expect(HISTORY_VERIFIER_TEXT).toEqual({ passed: 'Passed', failed: 'Failed', fails_now: 'Fails now (passed when written)' });
    expect(CASE_VERIFIER_TEXT.fails_now).toBe('the verifier passed it when it was written and fails it now');
    expect(FAILS_NOW_TEXT).toContain('cannot be approved');
    for (const standing of VERIFIER_STANDINGS) {
      expect(VERIFIER_STANDING_TEXT[standing].length, standing).toBeGreaterThan(5);
    }
  });

  it('refuse a step on such a version with each mismatch by its sentence and kind, never the narrative’s words', () => {
    const content = assemblePacket(assemblyInput());
    const narrative = 'The payer paid $100.00 for each line [1]. There were 3650 claims [3].';
    const report = verifyNarrative(narrative, narrativeFacts(content), []);
    expect(report.passed).toBe(false);
    const refusal = failsNowRefusal(report);
    expect(refusal).toBe(
      'the verifier passed this version when it was written and fails it now (2 mismatches: sentence 1: an amount that does not match this version’s records; sentence 2: a number that does not match this version’s records). Correct the narrative and save a new version; only a version the verifier passes now can be approved',
    );
    expect(refusal).not.toContain('100.00');
    expect(refusal).not.toContain('3650');
    expect(failsNowRefusal({ mismatches: [] })).toContain('its report is not of this narrative');
    expect(liveCheckSummary(true, 0)).toBe('Live check passes');
    expect(liveCheckSummary(false, 1)).toBe('Live check: 1 mismatch');
    expect(liveCheckSummary(false, 2)).toBe('Live check: 2 mismatches');
  });
});
