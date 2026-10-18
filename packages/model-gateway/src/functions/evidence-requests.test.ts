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

describe('the customer-facing text states only its gap’s own figures and payer (CLAUDE.md rule 1)', () => {
  const gaps = { gaps: [{ reason: 'NO_RATE_FOR_CODE', count: 3, payer: 'SYNTHETIC PAYER Q', codes: ['97110'] }, { reason: 'contract_missing_pages', count: 1, payer: 'SYNTHETIC PAYER R', codes: [] }] };
  const check = (document: string, why: string, reason = 'NO_RATE_FOR_CODE') => verifyEvidenceRequests(gaps, { items: [{ reason, document, why }] }).proposal;

  it('keeps an item naming its gap’s codes, count and payer', () => {
    expect(check('The fee schedule page that lists 97110 for SYNTHETIC PAYER Q', 'It lets the practice check the 3 lines billed with 97110.').items).toHaveLength(1);
    expect(check('The fee schedule page that lists 97110', 'It covers the three lines billed with it.').items).toHaveLength(1);
    expect(check('Every page of the signed agreement', 'Pages are missing from the copy on file.', 'contract_missing_pages').items).toHaveLength(1);
  });

  it.each([
    ['another gap’s code', 'The fee schedule page for 97530 and 97140', 'So the lines can be priced.'],
    ['an amount', 'The fee schedule page for 97110', 'It will recover the $4,812.00 the payer owes.'],
    ['another count', 'The fee schedule page for 97110', 'It covers 40 lines.'],
    ['a percentage', 'The fee schedule page for 97110', 'The contract pays 110% of Medicare.'],
    ['a date', 'The fee schedule effective January 1, 2026', 'So the 3 lines can be priced.'],
    ['a modifier', 'The fee schedule page for 97110 with modifier GP', 'So the 3 lines can be priced.'],
    ['an identifier', 'The fee schedule for plan SYN-4471', 'So the 3 lines can be priced.'],
  ])('rejects an item whose text holds %s', (_what, document, why) => {
    expect(check(document, why)).toEqual({ items: [], rejected: [{ index: 0, problems: ['figure_not_in_gap'] }] });
  });

  it('rejects an item naming a payer of the input its gap is not about', () => {
    expect(check('The fee schedule page for 97110 from SYNTHETIC PAYER R', 'So the 3 lines can be priced.')).toEqual({ items: [], rejected: [{ index: 0, problems: ['payer_not_in_gap'] }] });
    expect(check('The schedule for 97110 from SYNTHETIC PAYER R, at $40.00', 'So the 3 lines can be priced.').rejected).toEqual([{ index: 0, problems: ['figure_not_in_gap', 'payer_not_in_gap'] }]);
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
      { reason: 'NO_MAPPING', count: 3 / 2, payer: null, codes: [] },
      { reason: 'NO_MAPPING', count: -1, payer: null, codes: [] },
      { reason: 'NO_MAPPING', count: 1, payer: null, codes: ['JANE DOE'] },
    ]) {
      expect(() => evidenceRequestsSpec.prepare({ gaps: [gap] })).toThrow(expect.objectContaining({ code: 'input_invalid' }));
    }
  });
});
