import { assemblePacket, draftNarrative } from '@tp/packets';
import { REGULATION, assemblyInput } from '@tp/packets/testing';
import { describe, expect, it } from 'vitest';

import { SYNTHETIC_CASE_IDENTIFIERS, syntheticNarrativeInput, syntheticNarrativeOutput } from '../testing';
import { mentionsIdentifier, narrativeInputs, narrativeSpec } from './narrative';

/**
 * draftPacketNarrative (PRD 14; PRD 16, Threats: "a narrative inventing a number"): drafted from
 * pattern-level facts with no identifiers at all, and checked by the packets verifier itself.
 * Synthetic packets only.
 */

const input = syntheticNarrativeInput();
const verify = (paragraphs: string[]) => narrativeSpec.verify(input, { paragraphs }, undefined);

describe('the inputs', () => {
  it('are the pattern statement’s facts: the clause, the releases, counts, totals, codes, dates, interest, the action and the sources', () => {
    const facts = narrativeInputs(input.content);
    expect(Object.keys(facts).sort()).toEqual(['citation', 'dispute_level', 'interest', 'pattern', 'requested_action', 'rule_releases', 'sources']);
    expect(facts.pattern).toMatchObject({ lines: 3, claims: 3, expected: '$300.00', observed: '$210.00', variance: '$90.00', first_service_date: '2026-03-05', last_service_date: '2026-03-07' });
    expect(facts.citation).toMatchObject({ kind: 'contract', page: 2, quote: '97110 is paid 50.00 per unit' });
    expect(facts.sources.map((source) => source.marker)).toEqual(input.content.sources.map((source) => source.marker));
  });

  it('hold no identifier at all: no schedule row, no placeholder, no practice or payer identification', () => {
    const user = narrativeSpec.prepare(input).user;
    expect(user).not.toMatch(/claim_control_number|patient_control_number|patient_name|member_id|\{\{/);
    for (const line of input.content.lines) {
      expect(user).not.toContain(line.service_line_id);
      expect(user).not.toContain(line.claim_id);
    }
    expect(user).not.toContain(input.content.practice.name);
    expect(user).not.toContain(input.content.payer.payer_id_raw);
    expect(mentionsIdentifier(user, SYNTHETIC_CASE_IDENTIFIERS)).toBe(false);
    expect(narrativeSpec.prepare(input).inputHashes).toHaveLength(1);
  });

  it('frame a regulation citation and interest as facts too', () => {
    const content = assemblePacket(assemblyInput({ citation: REGULATION }));
    expect(narrativeInputs(content).citation).toEqual({ kind: 'regulation', reference: REGULATION.reference, statement: REGULATION.statement });
    expect(narrativeInputs(content).interest).toBeNull();
    expect(narrativeInputs({ ...content, interest: { ...({} as NonNullable<typeof content.interest>), computed: false, total_cents: null } }).interest).toEqual({ computed: false, total: null });
  });

  it('refuse a call whose facts would carry one of the case’s identifiers', () => {
    const quoted = { ...input, content: { ...input.content, citation: { ...input.content.citation, quote: '97110 is paid 50.00 per unit for Jane Zephyra' } as typeof input.content.citation } };
    expect(() => narrativeSpec.prepare(quoted)).toThrow(expect.objectContaining({ code: 'identifier_in_input' }));
  });
});

describe('the verifier is the packets verifier', () => {
  it('passes a narrative of the facts with a marker on every sentence', () => {
    const { proposal, passed, citations } = narrativeSpec.verify(input, syntheticNarrativeOutput(input), undefined);
    expect(passed).toBe(true);
    expect(proposal.narrative).toBe(draftNarrative(input.content));
    expect(proposal.report).toMatchObject({ format: 'tp-packet-verifier/2', passed: true, mismatches: [] });
    expect(citations).toEqual([{ marker: 1 }, { marker: 3 }]);
  });

  it('fails a number, an amount, a date or a code that is not in the facts', () => {
    for (const sentence of ['The payer owes $95.00 [3].', 'Four lines were underpaid [3].', 'The visit on 2026-03-09 was underpaid [3].', 'Code 97530 was underpaid [3].']) {
      const result = verify([`${draftNarrative(input.content)} ${sentence}`]);
      expect(result.passed, sentence).toBe(false);
      expect(result.proposal.report.mismatches.map((mismatch) => mismatch.code)).toContain('figure_not_in_input');
    }
  });

  it('fails a sentence without a citation, and a marker naming no source', () => {
    expect(verify([`${draftNarrative(input.content)} The payer should reprocess the claims.`]).proposal.report.mismatches.map((mismatch) => mismatch.code)).toEqual(['sentence_without_citation']);
    expect(verify([`${draftNarrative(input.content)} The payer should reprocess the claims [9].`]).proposal.report.mismatches.map((mismatch) => mismatch.code)).toEqual(['unknown_citation']);
  });

  it('fails one of the case’s identifiers wherever it appears', () => {
    const result = verify([`${draftNarrative(input.content)} The patient Jane Zephyra was seen [3].`]);
    expect(result.passed).toBe(false);
    expect(result.proposal.report.mismatches.map((mismatch) => mismatch.code)).toContain('identifier_in_narrative');
  });

  it('joins paragraphs with blank lines', () => {
    const [first = '', ...rest] = draftNarrative(input.content).split(/(?<=\]\.) /);
    const result = verify([first, rest.join(' ')]);
    expect(result.proposal.narrative).toBe(`${first}\n\n${rest.join(' ')}`);
    expect(result.passed).toBe(true);
  });
});
