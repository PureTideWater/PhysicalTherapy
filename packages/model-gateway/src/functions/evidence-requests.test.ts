import { QUESTION_TOPICS } from '@tp/db';
import { EVIDENCE_GAP_CODES } from '@tp/packets';
import { UNPRICED_REASONS } from '@tp/pricing';
import { describe, expect, it } from 'vitest';

import { syntheticEvidenceInput, syntheticEvidenceOutput } from '../testing';
import { KNOWN_REASON_CODES, evidenceRequestsSpec, verifyEvidenceRequests } from './evidence-requests';

/** suggestEvidenceRequests (PRD 14): every item maps to a known reason code the input gave. */

const input = syntheticEvidenceInput();

describe('the reason codes', () => {
  it('are the unpriced reasons, the contract question topics and the packet evidence gaps, a closed list', () => {
    expect(KNOWN_REASON_CODES).toEqual([...UNPRICED_REASONS, ...QUESTION_TOPICS.map((topic) => `contract_${topic}`), ...EVIDENCE_GAP_CODES]);
    expect(new Set(KNOWN_REASON_CODES).size).toBe(KNOWN_REASON_CODES.length);
  });
});

describe('the verifier', () => {
  it('keeps every item that maps to one of the input’s reasons', () => {
    const { proposal, passed, citations } = verifyEvidenceRequests(input, syntheticEvidenceOutput());
    expect(passed).toBe(true);
    expect(proposal.items.map((item) => item.reason)).toEqual(['NO_RATE_FOR_CODE', 'contract_missing_pages']);
    expect(proposal.rejected).toEqual([]);
    expect(citations).toEqual([]);
  });

  it('rejects an item with an unknown code, and one whose code the input did not give', () => {
    const output = {
      items: [
        ...syntheticEvidenceOutput().items,
        { reason: 'MISSING_EVERYTHING', document: 'Everything', why: 'Because.' },
        { reason: 'NO_MAPPING', document: 'A plan mapping', why: 'It maps the plan.' },
      ],
    };
    const { proposal, passed } = verifyEvidenceRequests(input, output);
    expect(passed).toBe(false);
    expect(proposal.items).toHaveLength(2);
    expect(proposal.rejected).toEqual([
      { index: 2, problems: ['unknown_reason'] },
      { index: 3, problems: ['reason_not_in_input'] },
    ]);
  });
});

describe('preparing the call', () => {
  it('sends counts, codes and payer names as facts', () => {
    const prepared = evidenceRequestsSpec.prepare(input);
    expect(prepared.user).toContain('<facts kind="coverage_gaps">');
    expect(prepared.user).toContain('"reason": "NO_RATE_FOR_CODE"');
    expect(prepared.inputHashes).toHaveLength(1);
  });

  it('refuses no gaps, an unknown reason, a count that is not a whole number and a code that is not a procedure code', () => {
    expect(() => evidenceRequestsSpec.prepare({ gaps: [] })).toThrow(expect.objectContaining({ code: 'no_gaps' }));
    for (const gap of [
      { reason: 'SOMETHING', count: 1, payer: null, codes: [] },
      { reason: 'NO_MAPPING', count: 1.5, payer: null, codes: [] },
      { reason: 'NO_MAPPING', count: -1, payer: null, codes: [] },
      { reason: 'NO_MAPPING', count: 1, payer: null, codes: ['JANE DOE'] },
    ]) {
      expect(() => evidenceRequestsSpec.prepare({ gaps: [gap] })).toThrow(expect.objectContaining({ code: 'input_invalid' }));
    }
  });
});
