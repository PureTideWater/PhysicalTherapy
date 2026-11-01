import { assemblePacket, checkedFigures, draftNarrative, narrativeFacts, verifyNarrative } from '@tp/packets';
import { assemblyInput } from '@tp/packets/testing';
import { verifierNow } from '@tp/worker/packets';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FAILS_NOW_TEXT } from '../../lib/packets/view';
import { StoredNarrative } from './display';

/**
 * The builder's stored narrative says what the verifier says of it now (test matrix CAS-43; docs/adr/0086; the review of
 * 2026-11-01, CORR-5): a version the verifier passed when it was written and fails now never shows "Verifier passed"; it
 * shows "Verifier fails it now", why and what to do, its figures marked and listed with what each was read as and what
 * the records hold it as. Counts in the mono font (brand.md). SYNTHETIC content from @tp/packets/testing.
 */

const content = assemblePacket(assemblyInput());
const facts = narrativeFacts(content);

function rendered(narrative: string, stored: ReturnType<typeof verifyNarrative>): string {
  return renderToStaticMarkup(<StoredNarrative narrative={narrative} verifier={verifierNow(narrative, content, stored, [])} figures={checkedFigures(narrative, facts).filter((figure) => !figure.passed)} />);
}

/** The text of the markup, its tags dropped. */
const text = (markup: string) => markup.replace(/<[^>]+>/g, '');

describe('the stored narrative', () => {
  it('shows "Verifier passed" for a version the verifier passes now, its counts in mono', () => {
    const narrative = draftNarrative(content);
    const markup = rendered(narrative, verifyNarrative(narrative, facts, []));
    expect(markup).toContain('data-verifier="passed"');
    expect(text(markup)).toContain('Verifier passed');
    expect(markup).toMatch(/<span class="font-mono tabular-nums">\d+<\/span> sentences/);
    expect(markup).not.toContain('Verifier mismatches');
  });

  it('never shows "Verifier passed" for a version it passed when written and fails now, and says why, what to do and each figure (CORR-5)', () => {
    const narrative = 'The payer paid $100.00 for each line [1].';
    // The report a reading that held figures to no role stored.
    const stored = { ...verifyNarrative(narrative, facts, []), passed: true, mismatches: [] };
    const markup = rendered(narrative, stored);
    expect(markup).toContain('data-verifier="fails_now"');
    expect(text(markup)).not.toContain('Verifier passed');
    expect(text(markup)).toContain('Verifier fails it now');
    expect(text(markup)).toContain(FAILS_NOW_TEXT);
    // The figure marked in the narrative, and listed with its sentence, what it was read as and what the records hold it as.
    expect(markup).toContain('<mark class="rounded bg-destructive/20 px-0.5">$100.00</mark>');
    expect(text(markup)).toContain('Sentence 1, $100.00: read as what the payer paid; the records hold it as what the contract requires');
  });

  it('shows a stored failure as stored', () => {
    const narrative = 'The payer withheld 1234.56 on these claims [3].';
    const markup = rendered(narrative, verifyNarrative(narrative, facts, []));
    expect(markup).toContain('data-verifier="failed"');
    expect(text(markup)).toContain('Verifier failed');
    expect(text(markup)).not.toContain(FAILS_NOW_TEXT);
    expect(text(markup)).toContain('Sentence 1, 1234.56: an amount no record holds');
  });
});
