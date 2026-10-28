import { draftNarrative } from '@tp/packets';
import { describe, expect, it } from 'vitest';

import { syntheticNarrativeInput } from '../testing';
import { FIGURE_ROLES, roleMismatches } from './narrative-roles';
import { narrativeSpec } from './narrative';

/**
 * A model's narrative holds each figure to the role its own words give it (PRD 14, draftPacketNarrative: "Every
 * number ... must match the inputs exactly"; PRD 5, J9: "verified field by field by code"; docs/adr/0054,
 * docs/adr/0086). The SYNTHETIC packet: 3 lines on 3 claims for 3 patients, 6 units of 97110 at $50.00, expected
 * $300.00, allowed $210.00, a shortfall of $90.00. The packets verifier fails a figure in the wrong role; the notice
 * here names the role it was read in.
 */

const input = syntheticNarrativeInput();
const { content } = input;
const roles = (narrative: string) => roleMismatches(narrative, content).map((mismatch) => [mismatch.role, narrative.slice(mismatch.start, mismatch.end)]);
const verify = (narrative: string) => narrativeSpec.verify(input, { paragraphs: [narrative] }, undefined);

describe('the roles', () => {
  it('are the packets verifier’s own', () => {
    expect(FIGURE_ROLES).toContain('allowed');
    expect(FIGURE_ROLES).toContain('window_days');
  });
});

describe('a narrative whose figures fill their roles', () => {
  it('passes: the code-built draft, and the ways a person or a model states the same facts', () => {
    for (const narrative of [
      draftNarrative(content),
      'Across 3 lines for 3 patients, the payer allowed $210.00 [3]. The contract requires $300.00 for the same lines [3]. The difference owed is $90.00 [3].',
      'Expected payment for the 3 lines in the schedule is $300.00 and the remittances show $210.00 [3]. The payer underpaid 3 claims by $90.00 in all [3].',
      'The 6 units on 3 service lines fell short by $90.00 [3]. Original Medicare would have paid $300.00 [3].',
      // Words that name no role leave a figure to any role of its kind.
      'The schedule lists $300.00 against $210.00 over 3 visits [3].',
    ]) {
      expect(roles(narrative), narrative).toEqual([]);
      expect(verify(narrative).proposal.report.passed, narrative).toBe(true);
    }
    expect(verify(draftNarrative(content))).toMatchObject({ passed: true, proposal: { roles: [] } });
  });
});

describe('a narrative that swaps figures between roles (every figure an input, the dispute stated backwards)', () => {
  it('fails each amount in the wrong role', () => {
    expect(roles('The payer allowed $300.00 [3]. The contract requires $210.00 for the same lines [3].')).toEqual([
      ['allowed', '$300.00'],
      ['expected', '$210.00'],
    ]);
    expect(roles('At the contract rate those lines come to $210.00, a shortfall of $300.00 [3].')).toEqual([
      ['expected', '$210.00'],
      ['variance', '$300.00'],
    ]);
    expect(roles('The remittances show $90.00 and prompt-pay interest of $90.00 is its own line [3].')).toEqual([
      ['allowed', '$90.00'],
      ['interest', '$90.00'],
    ]);
  });

  it('fails each count in the wrong role, the count’s noun up to one word after it, or a partitive’s, or a page', () => {
    expect(roles('The payer underpaid 6 claims across 6 service lines and 3 units [3].')).toEqual([
      ['claims', '6'],
      ['lines', '6'],
      ['units', '3'],
    ]);
    expect(roles('Across six lines for six patients [3].')).toEqual([
      ['lines', 'six'],
      ['patients', 'six'],
    ]);
    // A count of something else is not the count ("6 more lines"); a partitive is ("6 of the lines"); so is a page.
    expect(roles('The schedule adds 6 more lines; 6 of the lines are listed on page 6 [3].')).toEqual([
      ['lines', '6'],
      ['citation_page', '6'],
    ]);
  });

  it('fails the packets verifier as well, and the gateway’s, with positions only', () => {
    const swapped = 'The payer allowed $300.00 for 3 lines [3]. The contract requires $210.00 [3].';
    const result = verify(swapped);
    expect(result.proposal.report.passed).toBe(false);
    expect(result.proposal.report.mismatches.map((mismatch) => [mismatch.code, swapped.slice(mismatch.start, mismatch.end)])).toEqual([
      ['figure_not_in_input', '$300.00'],
      ['figure_not_in_input', '$210.00'],
    ]);
    expect(result.passed).toBe(false);
    expect(result.proposal.roles).toEqual([
      { code: 'figure_in_wrong_role', role: 'allowed', kind: 'amount', sentence: 0, start: swapped.indexOf('$300.00'), end: swapped.indexOf('$300.00') + 7 },
      { code: 'figure_in_wrong_role', role: 'expected', kind: 'amount', sentence: 1, start: swapped.indexOf('$210.00'), end: swapped.indexOf('$210.00') + 7 },
    ]);
  });

  it('names no role for a figure no input holds at all, which is the verifier’s alone', () => {
    const invented = 'The payer allowed $123.45 [3].';
    expect(roles(invented)).toEqual([]);
    expect(verify(invented).proposal.report.passed).toBe(false);
  });
});
