import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { checkNarrative, checkReading } from './check';
import { draftNarrative } from './draft';
import { narrativeFacts } from './facts';
import { assemblyInput } from './test-support';
import { NO_CASE_IDENTIFIERS, checkedFigures, findMismatches, readsNoIdentifier, verifyNarrative } from './verifier';

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
        const stored = verifyNarrative(narrative, narrativeFacts(content), NO_CASE_IDENTIFIERS);
        const check = checkNarrative(narrative, content);
        expect(check).toEqual({ passed: stored.passed, sentences: stored.sentences, checked: stored.checked, mismatches: stored.mismatches });
      }),
    );
  });

  it('says what each figure was read as, whether it passed, and where the inputs hold a failing one (docs/adr/0086)', () => {
    // A hidden character before the second sentence moves its positions in the readable text, not in the narrative.
    const narrative = 'There were 3 claims [3].\u200b The shortfall was $210.00 and the payer allowed 3650 [3].';
    const { figures } = checkReading(narrative, narrativeFacts(content));
    expect(figures.map((figure) => [narrative.slice(figure.start, figure.end), figure.kind, figure.roles, figure.passed, figure.heldAs, figure.sentence])).toEqual([
      ['3', 'number', ['claims'], true, [], 0],
      ['$210.00', 'amount', ['variance'], false, ['allowed'], 1],
      ['3650', 'number', null, false, ['window_days'], 1],
    ]);
    expect(checkedFigures(narrative, narrativeFacts(content))).toEqual(figures);
    // A figure no input holds in any role is held in none.
    expect(checkReading('The payer kept $1.23 [3].', narrativeFacts(content)).figures.map((figure) => [figure.passed, figure.heldAs])).toEqual([[false, []]]);
  });

  it('gives the check and the figures from one reading, each as the separate calls give it, for any text (PE-9)', () => {
    const facts = narrativeFacts(content);
    const words = fc.constantFrom('The', 'payer', 'paid', 'allowed', '$56.00', '$100.00', '3650', 'days', '3', 'claims', '[1]', '[3]', '2026-03-09', '.', ',', 'and');
    fc.assert(
      fc.property(fc.array(words, { maxLength: 30 }), (parts) => {
        const narrative = parts.join(' ');
        const reading = checkReading(narrative, facts);
        expect(reading.check).toEqual(findMismatches(narrative, facts, readsNoIdentifier));
        expect(reading.check).toEqual(checkNarrative(narrative, content));
        expect(reading.figures).toEqual(checkedFigures(narrative, facts));
      }),
    );
  });
});
