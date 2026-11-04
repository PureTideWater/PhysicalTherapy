import { type PacketContent, draftNarrative } from '@tp/packets';
import { REVIEWED, roleContents } from '@tp/packets/testing';
import { describe, expect, it } from 'vitest';

import { SYNTHETIC_CASE_IDENTIFIERS, syntheticNarrativeInput } from '../testing';
import { roleMismatches as baseRoleMismatches } from './narrative-roles.base.fixture';
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
      // Each amount with what it is stated per, where per line and in total differ (docs/adr/0086, rule 2).
      'Across the 3 lines, the payer allowed $210.00 [3]. The contract requires $300.00 for these lines [3]. The difference owed is $90.00 in total [3].',
      'Expected payment for the 3 lines in the schedule is $300.00 and the remittances show $210.00 in all [3]. The payer underpaid 3 claims by $90.00 in all [3].',
      'The 6 units in all on 3 service lines fell short by $90.00 [3]. Original Medicare would have paid $300.00 in total [3].',
      'For each line, the contract expected and the payer allowed $100.00 and $70.00, respectively [3].',
      // Words that name no role leave a figure to any role of its kind.
      'The schedule lists $300.00 in total against $210.00 over 3 visits [3].',
    ]) {
      expect(roles(narrative), narrative).toEqual([]);
      expect(verify(narrative).proposal.report.passed, narrative).toBe(true);
    }
    expect(verify(draftNarrative(content))).toMatchObject({ passed: true, proposal: { roles: [] } });
  });
});

describe('a narrative that swaps figures between roles (every figure an input, the dispute stated backwards)', () => {
  it('fails each amount in the wrong role', () => {
    expect(roles('The payer allowed $300.00 [3]. The contract requires $210.00 for these lines [3].')).toEqual([
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
      { code: 'figure_in_wrong_role', role: 'allowed', roles: ['allowed'], every: false, kind: 'amount', sentence: 0, start: swapped.indexOf('$300.00'), end: swapped.indexOf('$300.00') + 7 },
      { code: 'figure_in_wrong_role', role: 'expected', roles: ['expected'], every: false, kind: 'amount', sentence: 1, start: swapped.indexOf('$210.00'), end: swapped.indexOf('$210.00') + 7 },
    ]);
  });

  it('names no role for a figure no input holds at all, which is the verifier’s alone', () => {
    const invented = 'The payer allowed $123.45 [3].';
    expect(roles(invented)).toEqual([]);
    expect(verify(invented).proposal.report.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------
// The review of 2026-11-01 (PE-2, CORR-21): the gateway's check before a model's draft is written is at least as strict
// as the gateway's own reading was at the base (83d71fd6), on every swap that reading caught. The base's reading runs
// here unchanged (./narrative-roles.base.fixture.ts) over the review's probes: the 246 generated swaps of PE-1 and
// PE-2, and every misstated example of CAS-43's review (@tp/packets/testing REVIEWED).
// ---------------------------------------------------------------------------------------------------

const contents = roleContents();
const gate = (narrative: string, content: PacketContent) => narrativeSpec.verify({ content, identifiers: SYNTHETIC_CASE_IDENTIFIERS }, { paragraphs: [narrative] }, undefined).passed;
const baseCaught = (narrative: string, content: PacketContent) => baseRoleMismatches(narrative, content).length > 0;

/** PE-1's and PE-2's generated swaps: a value held only in one role, stated after a cue of another, past a cue of its own. */
function generatedSwaps(): { readonly narrative: string; readonly content: PacketContent }[] {
  const phrases: Readonly<Record<string, readonly string[]>> = {
    expected: ['the contract requires', 'the contract expected'],
    allowed: ['the payer allowed'],
    paid: ['the payer paid', 'the remittance paid'],
    variance: ['the shortfall is', 'the payer underpaid'],
    interest: ['interest is'],
  };
  const values: Readonly<Record<string, readonly string[]>> = { expected: ['$100.00', '$300.00'], allowed: ['$70.00', '$210.00'], paid: ['$56.00'], variance: ['$30.00', '$90.00'], interest: ['$1.92', '$5.76'] };
  // The base read allowed and paid as one role (observed): a swap between them was none to it.
  const baseRole = (role: string) => (role === 'allowed' || role === 'paid' ? 'observed' : role);
  const swaps: { narrative: string; content: PacketContent }[] = [];
  for (const [held, heldPhrases] of Object.entries(phrases)) {
    for (const [stated, statedPhrases] of Object.entries(phrases)) {
      if (baseRole(held) === baseRole(stated)) {
        continue;
      }
      for (const value of values[held] ?? []) {
        for (const a of heldPhrases) {
          for (const b of statedPhrases) {
            for (const template of ['Although {A}, {B} {v} [3].', '{Acap} less, so {B} {v} [3].', 'Since {A}: {B} {v} [3].']) {
              const narrative = template.replace('{Acap}', `${a.charAt(0).toUpperCase()}${a.slice(1)}`).replace('{A}', a).replace('{B}', b).replace('{v}', value);
              swaps.push({ narrative, content: held === 'interest' || stated === 'interest' ? contents.interest : contents.base });
            }
          }
        }
      }
    }
  }
  return swaps;
}

describe('the gateway’s check against the base’s (PE-2)', () => {
  it('fails every one of the 246 generated swaps, each of which the base’s reading caught', () => {
    const swaps = generatedSwaps();
    expect(swaps).toHaveLength(246);
    for (const { narrative, content } of swaps) {
      expect(baseCaught(narrative, content), `base: ${narrative}`).toBe(true);
      expect(gate(narrative, content), narrative).toBe(false);
    }
  });

  it('fails every misstated example of the review the base’s reading caught, and more besides', () => {
    const misstated = REVIEWED.filter((example) => example.fails.length > 0);
    const caught = misstated.filter(({ narrative, content }) => baseCaught(narrative, contents[content]));
    for (const { id, narrative, content } of caught) {
      expect(gate(narrative, contents[content]), id).toBe(false);
    }
    // The base caught the amount and count swaps of PE-2's table; the gateway fails every misstated example.
    expect(caught.map((example) => example.id)).toEqual(expect.arrayContaining(['PE-2 the allowed amount as expected', 'PE-2 the shortfall as interest owed', 'PE-2, PE-8 a service year as claims after "these"', 'PE-2, PE-3 the window clause’s section as units']));
    for (const { id, narrative, content } of misstated) {
      expect(gate(narrative, contents[content]), id).toBe(false);
    }
  });
});

describe('a figure in its role whose words must say more (docs/adr/0086, rules 2 and 3; CAS-43)', () => {
  it('fails the draft and names no wrong role: a scope stated nowhere, or a "respectively" list in neither plain form', () => {
    for (const [narrative, needs] of [
      ['The payer allowed $210.00 [3].', ['scope']],
      ['$300.00 and $210.00 were expected and allowed, respectively, and for each line, the payer owes $30.00 [3].', ['scope', 'scope', 'scope']],
      ['$70.00 and $100.00 on each of the 3 lines were expected and allowed, respectively [3].', ['own_words', 'own_words']],
      ['$70.00 and $100.00 for 97110 were the expected and allowed amounts, respectively [3].', ['own_words', 'own_words']],
    ] as const) {
      const result = verify(narrative);
      expect(result.passed, narrative).toBe(false);
      expect(result.proposal.roles, narrative).toEqual([]);
      expect(result.proposal.report.mismatches.filter((mismatch) => mismatch.code === 'figure_not_in_input'), narrative).toHaveLength(needs.length);
    }
  });

  it('passes each in a plain form with its scope stated (CAS-44)', () => {
    for (const narrative of [
      '$100.00 and $70.00, respectively, were the expected and allowed amounts per line, so the payer paid less [3].',
      '$300.00 and $70.00 were expected in total and allowed per line, respectively [3].',
      'For each line, the payer allowed $70.00, and it allowed $210.00 for the claim [3].',
    ]) {
      expect(verify(narrative).passed, narrative).toBe(true);
    }
  });
});

describe('a model’s draft held to the review’s verdicts (CAS-43, CAS-44)', () => {
  it.each(REVIEWED)('$id', ({ narrative, content, fails }) => {
    expect(gate(narrative, contents[content])).toBe(fails.length === 0);
  });

  it('names the role the nearest cue gives a figure, not the first of every cue’s (CORR-21)', () => {
    const narrative = 'Under the contract, the payer allowed $56.00 per line [3].';
    expect(roleMismatches(narrative, contents.base)).toEqual([
      { code: 'figure_in_wrong_role', role: 'allowed', roles: ['allowed'], every: false, kind: 'amount', sentence: 0, start: narrative.indexOf('$56.00'), end: narrative.indexOf('$56.00') + 6 },
    ]);
    // Words that name several roles, none the figure's own: every one, each to hold it.
    const both = 'The contract requires more than the payer paid: $100.00 [1].';
    expect(roleMismatches(both, contents.base)).toMatchObject([{ role: 'expected', roles: ['expected', 'paid'], every: true }]);
  });
});
