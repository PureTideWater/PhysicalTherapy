import { FIGURE_ROLES, MISMATCH_CODES, assemblePacket, checkedFigures, narrativeFacts, verifyNarrative, verifyTemplate } from '@tp/packets';
import { checkReading } from '@tp/packets/check';
import { assemblyInput } from '@tp/packets/testing';
import { VERIFIER_STANDINGS } from '@tp/worker/packets';
import { describe, expect, it } from 'vitest';

import {
  CASE_VERIFIER_TEXT,
  FAILS_NOW_STATES,
  FIGURE_KIND_TEXT,
  HISTORY_VERIFIER_TEXT,
  MISMATCH_TEXT,
  NEEDS_TEXT,
  ROLE_TEXT,
  SAY_WHAT_IT_COUNTS,
  VERIFIER_STANDING_TEXT,
  exportFailsNowText,
  failsNowCause,
  failsNowRefusal,
  failsNowState,
  failsNowText,
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

  it('ask a figure whose words must say more for it, plainly, beside the figure marked (docs/adr/0086, rules 2 and 3; CAS-43)', () => {
    expect(NEEDS_TEXT).toEqual({
      scope: 'state whether this figure is per line or in total right after it (“per line”, “in total”, “across all the lines”), and keep any one line, group of lines, code, date of service, claim or patient in a sentence of its own',
      own_words: 'give each figure its own words instead of “respectively”',
    });
    const content = assemblePacket(assemblyInput());
    for (const [narrative, needs, figure] of [
      ['The payer allowed $210.00 [3].', 'scope', '$210.00'],
      ['$70.00 and $100.00 on each of the 3 lines were expected and allowed, respectively [3].', 'own_words', '$70.00'],
    ] as const) {
      const { check, figures } = checkReading(narrative, narrativeFacts(content));
      const [mismatch] = check.mismatches;
      const read = figures.find((item) => item.start === mismatch?.start && item.end === mismatch.end);
      expect(mismatch?.code, narrative).toBe('figure_not_in_input');
      expect(read?.needs, narrative).toBe(needs);
      // The editor marks the figure as written and says, beside it, what to state.
      expect(mismatchShown('figure_not_in_input', narrative.slice(mismatch?.start, mismatch?.end))).toBe(figure);
      expect(mismatchText('figure_not_in_input', mismatch?.kind ?? null, read ?? null)).toBe(NEEDS_TEXT[needs]);
    }
    // A figure read with no need says what it was read as, as before; a stored report's figure, by its kind.
    expect(mismatchText('figure_not_in_input', 'amount', { roles: ['paid'], every: false, heldAs: ['expected'], needs: null })).toBe('read as what the payer paid; the records hold it as what the contract requires');
    expect(mismatchText('figure_not_in_input', 'amount', null)).toBe('an amount that does not match this version’s records');
  });
});

describe('the words for a template’s mismatches (tp-packet-verifier/3; docs/adr/0089; CAS-52, CAS-53)', () => {
  it('say each new code plainly, show a typed figure as typed, and never echo a figure placeholder', () => {
    const content = assemblePacket(assemblyInput());
    const template = 'The payer paid 3 [1]. On one line, {{fact:line.9.paid}} and {{fact:code.97110.variance}} [1].';
    const report = verifyTemplate(template, content, []);
    expect(report.mismatches.map((mismatch) => [mismatch.code, mismatchShown(mismatch.code, template.slice(mismatch.start, mismatch.end))])).toEqual([
      ['free_figure', '3'],
      ['number_word', 'one'],
      ['unknown_fact', null],
      ['fact_not_canonical', null],
    ]);
    expect(mismatchShown('fact_contradicted', '{{fact:pattern.paid}}')).toBeNull();
    for (const code of ['free_figure', 'number_word', 'unknown_fact', 'fact_not_canonical', 'fact_contradicted'] as const) {
      expect(MISMATCH_TEXT[code], code).not.toMatch(/\{\{|fact_|canonical/);
    }
    expect(FIGURE_KIND_TEXT.fact).toBe('a figure placeholder');
  });
});

describe('the words for what the verifier says of a stored version now (docs/adr/0086; the review of 2026-11-01, CORR-5)', () => {
  it('say each standing, never "passed" for a version the verifier fails now', () => {
    expect(VERIFIER_STANDING_TEXT).toEqual({ passed: 'Verifier passed', failed: 'Verifier failed', fails_now: 'Verifier fails it now' });
    expect(HISTORY_VERIFIER_TEXT).toEqual({ passed: 'Passed', failed: 'Failed', fails_now: 'Fails now (passed when written)' });
    expect(CASE_VERIFIER_TEXT.fails_now).toBe('the verifier passed it when it was written and fails it now');
    expect(failsNowText('unapproved', 'marked')).toContain('cannot be approved');
    // By where the version stands (UX-D1): never "cannot be approved" for an approved or exported version.
    expect(failsNowText('approved', 'marked')).toBe('This version was approved when the verifier passed it; the verifier fails it now, so it cannot be exported: correct the marked figures and save a new version, which needs approval again.');
    expect(failsNowText('exported', 'marked')).toContain('The exported files stand');
    for (const state of FAILS_NOW_STATES) {
      if (state !== 'unapproved') {
        expect(failsNowText(state, 'marked'), state).not.toContain('cannot be approved');
      }
      // Nothing marked: never "marked", and the figure check only when it fails a figure (NEW-N3).
      for (const cause of ['unmarked', 'stale'] as const) {
        expect(failsNowText(state, cause), `${state} ${cause}`).not.toContain('marked');
        expect(failsNowText(state, cause), `${state} ${cause}`).not.toContain('checks each figure');
      }
      expect(failsNowText(state, 'stale'), state).toContain('the stored narrative no longer matches its verifier report');
      expect(failsNowText(state, 'unmarked'), state).not.toContain('no longer matches');
      // Never as if the verifier were approved.
      expect(failsNowText(state, 'marked'), state).not.toContain('written and was approved');
    }
    expect(failsNowText('unapproved', 'stale')).toBe('The verifier passed this version when it was written. Now the stored narrative no longer matches its verifier report, so this version cannot be approved: save it again as a new version.');
    expect(failsNowText('approved', 'stale')).toBe('This version was approved when the verifier passed it, but the stored narrative no longer matches its verifier report now, so it cannot be exported: save it again as a new version, which needs approval again.');
    expect(failsNowText('unapproved', 'unmarked')).toBe('The verifier passed this version when it was written. It fails it now, so this version cannot be approved: correct the narrative and save a new version.');
    expect(failsNowState({ current: true, approved: false, exported: false })).toBe('unapproved');
    expect(failsNowState({ current: true, approved: true, exported: false })).toBe('approved');
    expect(failsNowState({ current: true, approved: true, exported: true })).toBe('exported');
    expect(failsNowState({ current: false, approved: true, exported: true })).toBe('exported');
    expect(failsNowState({ current: false, approved: true, exported: false })).toBe('earlier');
    // The export held back by its cause (NEW-N3): the marked figures only when one is marked.
    expect(exportFailsNowText('marked')).toBe('The verifier fails this version’s narrative now, so it cannot be exported: correct the figures marked under Narrative above and save a new version, which needs approval again.');
    expect(exportFailsNowText('unmarked')).toBe('The verifier fails this version’s narrative now, so it cannot be exported: correct the narrative and save a new version, which needs approval again.');
    expect(exportFailsNowText('stale')).toBe('This version cannot be exported: the stored narrative no longer matches its verifier report, so save it again as a new version, which needs approval again.');
    const facts = narrativeFacts(assemblePacket(assemblyInput()));
    expect(failsNowCause({ mismatches: [] })).toBe('stale');
    expect(failsNowCause(verifyNarrative('The payer paid $100.00 for each line [1].', facts, []))).toBe('marked');
    expect(failsNowCause(verifyNarrative('The payer paid less than the contract requires.', facts, []))).toBe('unmarked');
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
      'the verifier passed this version when it was written and fails it now (2 mismatches: in sentence 1, an amount that does not match this version’s records; in sentence 2, a number that does not match this version’s records). Its figures are marked under Narrative above. Correct the narrative and save a new version; only a version the verifier passes now can be approved',
    );
    expect(refusal).not.toContain('100.00');
    expect(refusal).not.toContain('3650');
    // With the figures as read: each in the role's words, never the narrative's (UX-D3).
    const figures = checkedFigures(narrative, narrativeFacts(content)).filter((figure) => !figure.passed);
    const worded = failsNowRefusal(report, figures);
    expect(worded).toBe(
      'the verifier passed this version when it was written and fails it now (2 mismatches: in sentence 1, an amount read as what the payer paid that the records hold as what the contract requires and a step of a line’s calculation; in sentence 2, a number read as a count of claims that the records hold as the dispute window’s days). Its figures are marked under Narrative above. Correct the narrative and save a new version; only a version the verifier passes now can be approved',
    );
    expect(worded).not.toContain('100.00');
    expect(worded).not.toContain('3650');
    expect(worded.split(':').length).toBe(2);
    // A figure whose words must say more is refused with what to say, never the narrative's words (rules 2 and 3).
    const unscoped = 'The payer allowed $210.00 [3]. These were $300.00 and $210.00, respectively [3].';
    const unscopedReport = verifyNarrative(unscoped, narrativeFacts(content), []);
    expect(failsNowRefusal(unscopedReport, checkedFigures(unscoped, narrativeFacts(content)).filter((figure) => !figure.passed))).toBe(
      'the verifier passed this version when it was written and fails it now (3 mismatches: in sentence 1, an amount whose words must say whether it is per line or in total; in sentence 2, an amount that needs its own words instead of “respectively” (twice)). Its figures are marked under Narrative above. Correct the narrative and save a new version; only a version the verifier passes now can be approved',
    );
    // A mismatch the builder marks nothing for: never "Its figures are marked" (NEW-N3).
    const unmarked = verifyNarrative('The payer paid less than the contract requires.', narrativeFacts(content), []);
    expect(unmarked.mismatches.map((mismatch) => mismatch.code)).toEqual(['sentence_without_citation']);
    expect(failsNowRefusal(unmarked)).not.toContain('marked');
    expect(failsNowRefusal({ mismatches: [] })).toBe('the stored narrative no longer matches its verifier report. Save it again as a new version; only a version the verifier passes now can be approved');
  });

  it('say the same mismatch once, with how many times (UX-D3)', () => {
    const content = assemblePacket(assemblyInput());
    const narrative = 'The payer paid $100.00 and allowed $56.00 for each line [1]. These 4 claims were short [2].';
    const report = verifyNarrative(narrative, narrativeFacts(content), []);
    const refusal = failsNowRefusal(report);
    expect(refusal).toContain('(3 mismatches: in sentence 1, an amount that does not match this version’s records (twice); in sentence 2, a number that does not match this version’s records)');
    expect(liveCheckSummary(true, 0)).toBe('Live check passes');
    expect(liveCheckSummary(false, 1)).toBe('Live check: 1 mismatch');
    expect(liveCheckSummary(false, 2)).toBe('Live check: 2 mismatches');
  });
});
