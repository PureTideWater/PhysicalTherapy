import { NO_CASE_IDENTIFIERS, assemblePacket, draftNarrative, narrativeFacts, narrativeSha256, verifyNarrative } from '@tp/packets';
import { assemblyInput } from '@tp/packets/testing';
import { describe, expect, it } from 'vitest';

import { verifierNow } from './verifier-now';

/**
 * The verifier over a stored version now (test matrix CAS-43; docs/adr/0086; the review of 2026-11-01, CORR-5): the one
 * rule the export job, a request for approval, an approval and the screens all ask. A version the verifier passed when it
 * was written passes now only if the verifier passes the same narrative now; a stored failure stands as stored.
 * SYNTHETIC content from @tp/packets/testing (per line: $100.00 expected, $70.00 allowed, $56.00 paid, $30.00 short).
 */

const content = assemblePacket(assemblyInput());

/** A report a reading that passed every figure would have stored for `narrative` (as a version written before ADR 0086 holds it). */
function passedThen(narrative: string) {
  return { ...verifyNarrative(narrative, narrativeFacts(content), NO_CASE_IDENTIFIERS), passed: true, mismatches: [] };
}

describe('verifierNow', () => {
  it('passes a version the verifier passes now, with its report now', () => {
    const narrative = draftNarrative(content);
    const stored = verifyNarrative(narrative, narrativeFacts(content), NO_CASE_IDENTIFIERS);
    expect(stored.passed).toBe(true);
    expect(verifierNow(narrative, content, stored, NO_CASE_IDENTIFIERS)).toEqual({ standing: 'passed', report: stored, figures: [] });
  });

  it('says "fails now" of the review’s reproduction: "The payer paid $100.00 for each line [1]." passed when written, and $100.00 is what the contract requires', () => {
    const narrative = 'The payer paid $100.00 for each line [1].';
    const now = verifierNow(narrative, content, passedThen(narrative), NO_CASE_IDENTIFIERS);
    expect(now.standing).toBe('fails_now');
    expect(now.report.passed).toBe(false);
    expect(now.report.mismatches.map((mismatch) => [mismatch.code, mismatch.kind, narrative.slice(mismatch.start, mismatch.end)])).toEqual([['figure_not_in_input', 'amount', '$100.00']]);
    // Its failing figure as read now, for a refusal in the role's words (UX-D3).
    expect(now.figures).toMatchObject([{ kind: 'amount', roles: ['paid'], heldAs: ['expected', 'calculation'], passed: false, start: 15, end: 22 }]);
  });

  it('leaves a stored failure as stored, without reading again', () => {
    const narrative = 'The payer withheld 1234.56 on these claims [3].';
    const stored = verifyNarrative(narrative, narrativeFacts(content), NO_CASE_IDENTIFIERS);
    expect(stored.passed).toBe(false);
    // Another narrative entirely: a failed report is not read again, so it is the one shown.
    expect(verifierNow(draftNarrative(content), content, stored, NO_CASE_IDENTIFIERS)).toEqual({ standing: 'failed', report: stored, figures: [] });
  });

  it('fails a report that is not of the narrative it is stored beside, as the export does', () => {
    const narrative = draftNarrative(content);
    const stored = { ...verifyNarrative(narrative, narrativeFacts(content), NO_CASE_IDENTIFIERS), narrative_sha256: narrativeSha256(`${narrative} `) };
    expect(verifierNow(narrative, content, stored, NO_CASE_IDENTIFIERS)).toMatchObject({ standing: 'fails_now', report: { passed: true } });
  });

  it('checks the identifiers it is given: a step’s and the export’s, never a screen’s (none)', () => {
    const narrative = `${draftNarrative(content)} Quillfeather is one of the patients [3].`;
    const stored = passedThen(narrative);
    expect(verifierNow(narrative, content, stored, NO_CASE_IDENTIFIERS).standing).toBe('passed');
    const now = verifierNow(narrative, content, stored, { names: ['QUILLFEATHER, SYNTHETIC'], numbers: [] });
    expect(now.standing).toBe('fails_now');
    expect(now.report.mismatches.map((mismatch) => mismatch.code)).toEqual(['identifier_in_narrative']);
  });
});
