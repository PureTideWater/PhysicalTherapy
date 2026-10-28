import { FIGURE_ROLES, MISMATCH_CODES, assemblePacket } from '@tp/packets';
import { checkFigures, checkNarrative } from '@tp/packets/check';
import { assemblyInput } from '@tp/packets/testing';
import { describe, expect, it } from 'vitest';

import { FIGURE_KIND_TEXT, MISMATCH_TEXT, ROLE_TEXT, mismatchShown, mismatchText, readAsText } from './view';

/**
 * The packet screens' words for the verifier's results (PRD 7, Packet builder: "narrative editor with verifier
 * results"; test matrix CAS-43; docs/adr/0086): a figure not in the inputs in the role its words give it, said with the
 * role it was read in, from the reader's own list of roles, so every role the reader has is worded.
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

  it('say what a failing figure is, of what kind, and what it was read as', () => {
    expect(MISMATCH_TEXT.figure_not_in_input).toBe('a figure that is not in the packet’s input records in the role its words give it');
    expect(FIGURE_KIND_TEXT.number).toBe('number or count; say what it counts or names: 3 claims, 6 units, page 2, 3650 days, release 900001');
    expect(readAsText(['claims'])).toBe('read as a count of claims');
    expect(readAsText(['lines', 'claims'])).toBe('read as a count of lines or a count of claims');
    expect(mismatchText('figure_not_in_input', 'number', ['claims'])).toBe(
      'a figure that is not in the packet’s input records in the role its words give it (number or count; say what it counts or names: 3 claims, 6 units, page 2, 3650 days, release 900001, read as a count of claims)',
    );
    expect(mismatchText('figure_not_in_input', 'amount', ['allowed'])).toBe('a figure that is not in the packet’s input records in the role its words give it (amount, read as what the payer allowed)');
    // No role read, or another code: the words without it.
    expect(mismatchText('figure_not_in_input', 'amount', null)).toBe('a figure that is not in the packet’s input records in the role its words give it (amount)');
    expect(mismatchText('figure_not_in_input', 'amount', [])).toBe('a figure that is not in the packet’s input records in the role its words give it (amount)');
    expect(mismatchText('figure_not_in_input', 'amount')).toBe('a figure that is not in the packet’s input records in the role its words give it (amount)');
    expect(mismatchText('sentence_without_citation', null, ['claims'])).toBe(MISMATCH_TEXT.sentence_without_citation);
    for (const code of MISMATCH_CODES) {
      expect(MISMATCH_TEXT[code].length, code).toBeGreaterThan(10);
    }
  });

  it('word the editor’s own reading of a SYNTHETIC narrative that states the window’s days as visits (the reported defect)', () => {
    const content = assemblePacket(assemblyInput());
    const narrative = 'There were 3650 claims [3].';
    const [mismatch] = checkNarrative(narrative, content).mismatches;
    const figure = checkFigures(narrative, content).find((item) => item.start === mismatch?.start && item.end === mismatch.end);
    expect(mismatch?.code).toBe('figure_not_in_input');
    expect(figure).toMatchObject({ roles: ['claims'], heldAs: ['window_days'], passed: false });
    expect(mismatchText('figure_not_in_input', mismatch?.kind ?? null, figure?.roles ?? null)).toContain('read as a count of claims');
    expect(mismatchShown('figure_not_in_input', narrative.slice(mismatch?.start, mismatch?.end))).toBe('3650');
  });
});
