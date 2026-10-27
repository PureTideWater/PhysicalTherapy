import { cents } from '@tp/money';
import { ExplainBindingError, ExplainShapeError, ExplainWordsError, type PacketContent, type Segment, type Sentence, assemblePacket, explainPacket, plainText } from '@tp/packets';
import { IDS, assemblyInput, contractCitation, lineSentences, pricedLine, worksheetSentences } from '@tp/packets/testing';
import type { PricingTrace } from '@tp/pricing';
import { contractAgreement, percentTerms } from '@tp/pricing/testing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type CalculationWords as Words, calculationWordsOf, wordsRefusalOf, wordsRefusalText } from '../../lib/packets/calculation-words';
import { CalculationWords } from './calculation-words';

/**
 * Each line's calculation in words on the packet builder and the review (combined audit #38; design 4.4; CAS-34),
 * rendered as the pages render it, from real engine traces (@tp/packets/testing pricedLine()) worded by
 * explainPacket() with the payer audience: one block per row with its summary, the worksheets as tables, every figure
 * and code in the mono face with tabular numerals, no code shape and no template brace in the visible text; and a
 * calculation the renderer cannot word shows only the refusal, with its next step. SYNTHETIC traces only.
 */

/** The markup's text, as a reader meets it: a block's edge is a space, an inline span's is not. */
const text = (markup: string) =>
  markup
    .replace(/<\/?(?:section|div|p|h[1-6]|ul|li|table|thead|tbody|tr|th|td)\b[^>]*>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&#x27;', '’')
    .replace(/\s+/g, ' ')
    .trim();

/** A version of the given priced rows and the stored traces its calculations name, as the loaders read them. */
function version(lines: readonly ReturnType<typeof pricedLine>[], citation = contractCitation()): { readonly content: PacketContent; readonly traces: Map<string, unknown> } {
  const content = assemblePacket(assemblyInput({ lines: lines.map((item) => item.line), citation }));
  const traces = new Map<string, unknown>(content.lines.map((line, index) => [line.priced_line_id, JSON.parse(JSON.stringify((lines[index] as { trace: PricingTrace }).trace))]));
  return { content, traces };
}

const percent = contractAgreement({ terms: percentTerms({ percentage: '110', codes: ['97110', '97140'] }), rateRecordId: IDS.rateRecord });
const PERCENT_CITATION = contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '110' } });

/** Every figure and code segment of the words, in the order the component renders them. */
function monoSegments(words: Extract<Words, { state: 'worded' }>['words']): string[] {
  const sentences: Sentence[] = [...words.rows.flatMap((row) => lineSentences(row.words)), ...words.worksheets.flatMap((sheet) => worksheetSentences(sheet))];
  return sentences.flatMap((sentence) => sentence.segments.flatMap((segment: Segment) => ('figure' in segment ? [segment.figure] : 'code' in segment ? [segment.code] : [])));
}

/** The text of every span set in the mono face with tabular numerals, in document order. */
const monoSpans = (markup: string) => [...markup.matchAll(/<span class="font-mono tabular-nums"(?: data-figure="[^"]*")?>([^<]*)<\/span>/g)].map((match) => (match[1] as string).replaceAll('&amp;', '&'));

describe('CalculationWords', () => {
  it('words each row as the payer’s copy does, one block per row with its summary and steps', () => {
    const { content, traces } = version([pricedLine(1), pricedLine(2), pricedLine(3)]);
    const calculation = calculationWordsOf(content, traces);
    expect(calculation).toEqual({ state: 'worded', words: explainPacket(content, traces, 'payer') });
    if (calculation.state !== 'worded') throw new Error('worded');
    const markup = renderToStaticMarkup(<CalculationWords calculation={calculation} level={3} />);
    expect(markup).toMatch(/^<section role="region" aria-label="Calculations"/);
    expect([...markup.matchAll(/data-calculation-row="(\d+)"/g)].map((match) => match[1])).toEqual(['1', '2', '3']);
    for (const row of calculation.words.rows) {
      expect(text(markup)).toContain(`Row ${String(row.row)} ${plainText(row.words.summary)}`);
      for (const step of row.words.steps) {
        expect(text(markup)).toContain(step.sentences.map(plainText).join(' '));
      }
    }
    expect(text(markup)).toContain('2 units × $50.00 = $100.00 under the contract’s clause on page 2; rounded once to $100.00; observed allowed $70.00; short $30.00.');
    expect(markup).not.toContain('data-worksheets');
    // Each row is a heading at the level the page gives: h3 under the builder's card (h2), h4 under the review's own h3 (UX review).
    expect([...markup.matchAll(/<h3 class="text-sm font-semibold">Row (\d+)<\/h3>/g)].map((match) => match[1])).toEqual(['1', '2', '3']);
    const review = renderToStaticMarkup(<CalculationWords calculation={calculation} level={4} />);
    expect([...review.matchAll(/<h4 class="text-sm font-semibold">Row (\d+)<\/h4>/g)].map((match) => match[1])).toEqual(['1', '2', '3']);
    expect(review).not.toContain('<h3');
  });

  it('renders the fee-schedule worksheets as tables, every figure and code in mono with tabular numerals, and no code or brace in the text', () => {
    const low = cents(2000n);
    const { content, traces } = version(
      [pricedLine(1, { facts: { agreement: percent, observedAllowedCents: low } }), pricedLine(2, { facts: { agreement: percent, procedureCode: '97140', observedAllowedCents: low } }), pricedLine(3, { facts: { agreement: percent, observedAllowedCents: low } })],
      PERCENT_CITATION,
    );
    const calculation = calculationWordsOf(content, traces);
    if (calculation.state !== 'worded') throw new Error('worded');
    expect(calculation.words.worksheets).toHaveLength(2);
    const markup = renderToStaticMarkup(<CalculationWords calculation={calculation} level={3} />);
    expect(markup).toContain('data-worksheets="2"');
    // The worksheets' heading at the rows' level, each worksheet's title one below it.
    expect(markup).toContain('<h3 class="text-sm font-semibold">Fee schedule worksheets</h3>');
    expect([...markup.matchAll(/<h4 class="text-sm font-semibold">Fee schedule worksheet (\d+): /g)].map((match) => match[1])).toEqual(['1', '2']);
    const review = renderToStaticMarkup(<CalculationWords calculation={calculation} level={4} />);
    expect(review).toContain('<h4 class="text-sm font-semibold">Fee schedule worksheets</h4>');
    expect([...review.matchAll(/<h5 class="text-sm font-semibold">Fee schedule worksheet (\d+): /g)].map((match) => match[1])).toEqual(['1', '2']);
    for (const sheet of calculation.words.worksheets) {
      expect(markup).toContain(`<table class="w-full min-w-[32rem] text-sm" aria-label="Fee schedule worksheet ${String(sheet.number)}">`);
      expect(text(markup)).toContain(plainText(sheet.title));
      expect(text(markup)).toContain(plainText(sheet.check));
    }
    // Each row's fee-schedule step points to its worksheet by number.
    expect(text(markup)).toMatch(/See fee schedule worksheet 1\./);
    expect(text(markup)).toMatch(/See fee schedule worksheet 2\./);
    // Every figure and code is a mono, tabular span holding exactly the segment, and no other text is.
    expect(monoSpans(markup)).toEqual(monoSegments(calculation.words));
    expect(monoSpans(markup).length).toBeGreaterThan(20);
    const visible = text(markup);
    expect(visible).not.toMatch(/[A-Z]+_[A-Z_]+/);
    expect(visible).not.toMatch(/[a-z0-9]+_[a-z0-9_]+/);
    expect(visible).not.toContain('{');
    expect(visible).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('shows only the refusal, with the list that has no words and the next step, when the renderer cannot word the calculation (CAS-34)', () => {
    const refusal = wordsRefusalOf(new ExplainWordsError('timed-units rule'));
    if (refusal === undefined) throw new Error('a refusal');
    const markup = renderToStaticMarkup(<CalculationWords calculation={{ state: 'refused', refusal }} level={3} />);
    expect(markup).toContain('data-calculation-words="refused"');
    expect(text(markup)).toBe('The calculation is not worded The payer’s copy cannot be printed: timed-units rule has no words. Ask PaidWhole support.');
    expect(markup).not.toContain('data-calculation-row');
    expect(markup).not.toContain('aria-label="Calculations"');
  });

  it('words every refusal the renderer makes by its reason, never a value, and none for a tp-packet/1 version', () => {
    expect(wordsRefusalText(wordsRefusalOf(new ExplainShapeError('the year basis disagrees with the fee schedule’s lookup')) as never)).toBe(
      'The payer’s copy cannot be printed: the calculation cannot be put in words (the year basis disagrees with the fee schedule’s lookup). Ask PaidWhole support.',
    );
    expect(wordsRefusalText(wordsRefusalOf(new ExplainBindingError('trace_differs', 2)) as never)).toBe(
      'The payer’s copy cannot be printed: row 2’s calculation cannot be worded: its stored trace does not hash to the SHA-256 the version states. Ask PaidWhole support.',
    );
    for (const reason of ['trace_missing', 'not_priced', 'rate_record_differs', 'not_medicare_advantage'] as const) {
      const words = wordsRefusalText(wordsRefusalOf(new ExplainBindingError(reason, 1)) as never);
      expect(words).not.toMatch(/_/);
      expect(words).toMatch(/^The payer’s copy cannot be printed: row 1’s calculation cannot be worded: [a-z]/);
    }
    expect(wordsRefusalOf(new ExplainBindingError('format', null))).toBeUndefined();
    expect(wordsRefusalOf(new Error('SYNTHETIC'))).toBeUndefined();
    // A trace that is not the one the version states is refused, not worded.
    const { content, traces } = version([pricedLine(1)]);
    const [first] = content.lines;
    traces.set(first?.priced_line_id as string, { ...(traces.get(first?.priced_line_id as string) as object), engine_version: 'SYNTHETIC' });
    expect(calculationWordsOf(content, traces)).toEqual({ state: 'refused', refusal: wordsRefusalOf(new ExplainBindingError('trace_differs', 1)) });
    expect(renderToStaticMarkup(<CalculationWords calculation={{ state: 'none' }} level={3} />)).toBe('');
  });
});
