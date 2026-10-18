import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { checkNarrative } from './check';
import { draftNarrative } from './draft';
import { narrativeFacts } from './facts';
import { assemblyInput } from './test-support';
import { verifyNarrative } from './verifier';

/**
 * The builder's check in the browser (@tp/packets/check) says what the stored verifier says: the same
 * mismatches, sentences and counts, for any text, against the version's own content.
 */

const content = assemblePacket(assemblyInput());

describe('checkNarrative', () => {
  it('passes the code-built draft and fails a figure that is not in the input, with its position', () => {
    expect(checkNarrative(draftNarrative(content), content)).toMatchObject({ passed: true, mismatches: [] });
    const narrative = 'The payer withheld 1234.56 on these claims [3].';
    const check = checkNarrative(narrative, content);
    expect(check.passed).toBe(false);
    expect(check.mismatches.map((mismatch) => [mismatch.code, mismatch.kind, narrative.slice(mismatch.start, mismatch.end)])).toEqual([['figure_not_in_input', 'amount', '1234.56']]);
  });

  it('agrees with verifyNarrative on any text', () => {
    const words = fc.constantFrom('The', 'payer', 'paid', '97110', '1234.56', '[1]', '[3]', '[9]', '{{claim_control_number:1}}', 'three', '2026-03-09', '.', '\n\n', 'units', '50.00');
    fc.assert(
      fc.property(fc.array(words, { maxLength: 40 }), (parts) => {
        const narrative = parts.join(' ');
        const stored = verifyNarrative(narrative, narrativeFacts(content), []);
        const check = checkNarrative(narrative, content);
        expect(check).toEqual({ passed: stored.passed, sentences: stored.sentences, checked: stored.checked, mismatches: stored.mismatches });
      }),
    );
  });
});
