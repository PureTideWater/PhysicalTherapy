import { type Audience, type ExplainCitation, type Segment, explainLine, feeScheduleWorksheets, plainText } from '@tp/packets/explain';
import { lineSentences, pricedLine, worksheetSentences } from '@tp/packets/testing';
import { type PricingTrace, parseTrace, price } from '@tp/pricing';
import { lineFacts, pricingInput, syntheticRelease } from '@tp/pricing/testing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { lineTraceSteps, pricingWords, traceSteps } from '../../lib/pricing/view';
import { AdjustmentWords, LineSummary, LineTrace, UnpricedWords, VIEWER_DATES_NOTE, wordsRefusalText } from './line-words';

/**
 * A line's calculation in words on the line trace page (combined audit #38; design 4.4; CAS-30, CAS-31, CAS-34),
 * rendered as the page renders it from traces the engine priced from SYNTHETIC releases: the summary on the Pricing
 * card, each step's sentences under its title, the fee-schedule worksheet under its step, every figure and code in
 * the mono face with tabular numerals, no code shape and no template brace in the visible text; what the engine
 * recorded only in a closed disclosure and only for the roles that read PHI; the viewer's words with no date; and a
 * calculation the words cannot put shown as its refusal, never as a code.
 */

/** The markup's text, as a reader meets it: a block's edge is a space, an inline span's is not. */
const text = (markup: string) =>
  markup
    .replace(/<\/?(?:section|div|p|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|details|summary|pre)\b[^>]*>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', '’')
    .replace(/\s+/g, ' ')
    .trim();

/** The text of every span set in the mono face with tabular numerals, in document order. */
const monoSpans = (markup: string) => [...markup.matchAll(/<span class="font-mono tabular-nums"(?: data-figure="[^"]*")?>([^<]*)<\/span>/g)].map((match) => (match[1] as string).replaceAll('&amp;', '&'));

const monoOf = (sentences: readonly { readonly segments: readonly Segment[] }[]) =>
  sentences.flatMap((sentence) => sentence.segments.flatMap((segment) => ('figure' in segment ? [segment.figure] : 'code' in segment ? [segment.code] : [])));

const REGULATION: ExplainCitation = { kind: 'regulation', reference: '42 CFR 422.214' };

/** A Medicare Advantage non-contracted line priced at 2 units, as stored (JSON) and as read back. */
const [ma] = price(pricingInput(syntheticRelease(900001), [lineFacts({ units: '2' })]));
const stored: unknown = JSON.parse(JSON.stringify(ma?.trace));
const trace = parseTrace(stored);

function page(line: PricingTrace, citation: ExplainCitation, audience: Exclude<Audience, 'payer'>, record: unknown = stored) {
  const words = explainLine(line, citation, audience);
  const worksheets = feeScheduleWorksheets([{ row: line.line.line_no, trace: line, citation }], audience, { of: 'line' });
  const steps = lineTraceSteps(words, audience === 'internal' ? traceSteps(record) : []);
  const markup = renderToStaticMarkup(<LineTrace steps={steps} worksheets={worksheets} canReadPhi={audience === 'internal'} notApplied={line.outcome.result === 'priced'} />);
  return { words, worksheets, steps, markup };
}

describe('the Pricing card’s words', () => {
  it('lead with the line’s summary sentence, its figures in mono with tabular numerals (the audit’s form)', () => {
    const fixed = pricedLine(1).trace;
    const words = explainLine(fixed, { kind: 'contract', page: 2 }, 'internal');
    const markup = renderToStaticMarkup(<LineSummary words={words} refusal={null} />);
    expect(text(markup)).toBe('2 units × $50.00 = $100.00 under the contract’s clause on page 2; rounded once to $100.00; observed allowed $70.00; short $30.00.');
    expect(monoSpans(markup)).toEqual(monoOf([words.summary]));
    expect(renderToStaticMarkup(<LineSummary words={null} refusal={null} />)).toBe('');
  });

  it('show only the refusal, with the list that has no words and the next step, when the words cannot be put (CAS-34)', () => {
    const markup = renderToStaticMarkup(<LineSummary words={explainLine(trace, REGULATION, 'internal')} refusal="timed-units rule has no words" />);
    expect(markup).toContain('data-line-words="refused"');
    expect(text(markup)).toBe('The calculation is not in words This line’s calculation cannot be put in words yet: timed-units rule has no words. Ask PaidWhole support.');
    expect(wordsRefusalText('the year basis disagrees with the fee schedule’s lookup')).toBe('This line’s calculation cannot be put in words yet: the year basis disagrees with the fee schedule’s lookup.');
  });

  it('name the adjustments by their words with exact dollars, never the code or raw cents', () => {
    const { adjustments } = pricingWords({ method: 'PERCENT_OF_MEDICARE', adjustmentsApplied: [{ name: 'sequestration', before_cents: '10000', after_cents: '9800.5' }] });
    const markup = renderToStaticMarkup(<AdjustmentWords adjustments={adjustments} />);
    expect(text(markup)).toBe('Sequestration: $100.00 becomes $98.005');
    expect(monoSpans(markup)).toEqual(['$100.00', '$98.005']);
    expect(markup).toContain('data-adjustment="sequestration"');
    expect(renderToStaticMarkup(<AdjustmentWords adjustments={[]} />)).toBe('None');
  });

  it('state an unpriced line’s reason as its meaning, detail, stop and remedy, the code kept only as data', () => {
    const [unpriced] = price(pricingInput(syntheticRelease(900001), [lineFacts({ agreement: { outcome: 'NO_MAPPING' } })]));
    const line = parseTrace(JSON.parse(JSON.stringify(unpriced?.trace)));
    const markup = renderToStaticMarkup(<UnpricedWords reason="NO_MAPPING" words={explainLine(line, null, 'viewer')} />);
    expect(markup).toMatch(/^<span data-reason="NO_MAPPING">/);
    expect(text(markup)).toBe('Not priced: The payer and plan have no mapping on the service date. The line stopped at the agreement. Remedy: Map the plan.');
    // Without words, the closed list's meaning and remedy; SECONDARY_PAYER's meaning, narrower than the engine, is left out (m3).
    expect(text(renderToStaticMarkup(<UnpricedWords reason="NO_MAPPING" words={null} />))).toBe('The payer and plan have no mapping on the service date. Remedy: Map the plan.');
    expect(text(renderToStaticMarkup(<UnpricedWords reason="SECONDARY_PAYER" words={null} />))).toBe('Remedy: Deferred release.');
  });
});

describe('the trace section in words', () => {
  it('puts each step’s sentences under its title, the worksheet under the fee schedule, and what PaidWhole recorded in a closed disclosure (PHI roles)', () => {
    const { words, worksheets, steps, markup } = page(trace, REGULATION, 'internal');
    expect(worksheets).toHaveLength(1);
    expect([...markup.matchAll(/<li class="[^"]*" data-step="([a-z_]+)">/g)].map((match) => match[1])).toEqual(steps.map((step) => step.key));
    for (const step of words.steps) {
      for (const sentence of step.sentences) {
        expect(text(markup)).toContain(plainText(sentence));
      }
    }
    const fee = /<li class="[^"]*" data-step="fee_schedule">([\s\S]*?)<\/li><li class="[^"]*" data-step="units">/.exec(markup)?.[1] ?? '';
    // Each step's title is a heading under the page's Trace heading (h2), the worksheet's title one below it (UX review).
    expect(fee).toContain('<h3 class="text-sm font-semibold">Step 2, continued: the fee schedule</h3>');
    expect(fee).toMatch(/<div class="flex min-w-0 flex-col gap-2" data-worksheet="1"><h4 class="text-sm font-semibold">Fee schedule worksheet 1: /);
    expect([...markup.matchAll(/<h3 class="text-sm font-semibold">/g)]).toHaveLength(steps.length);
    expect(fee).toContain('aria-label="Fee schedule worksheet 1"');
    expect(text(fee)).toContain(plainText((worksheets[0] as { check: Parameters<typeof plainText>[0] }).check));
    // The record sits under the words, closed, its JSON in a named box a keyboard reaches and scrolls, wrapped so it never
    // scrolls sideways (m7; docs/adr/0078, DR-10).
    // Its summary names the step for a screen reader and is at least 24 px tall (UX review: fourteen identical summaries).
    expect(fee).toMatch(
      /<details class="pt-1" data-recorded="fee_schedule"><summary class="min-h-6 cursor-pointer py-1 text-sm text-muted-foreground">As PaidWhole recorded it<span class="sr-only">: Step 2, continued: the fee schedule<\/span><\/summary><ul class="pt-1 text-xs" aria-label="Rule records of Step 2, continued: the fee schedule">/,
    );
    expect(fee).toContain('pfs_rvu');
    expect(fee).toMatch(/<div data-slot="scroll-box" data-axis="block" data-scroll="unmeasured"[^>]*><div class="pw-scroll-frame [^"]*"><pre role="region" aria-label="Step 2, continued: the fee schedule, as PaidWhole recorded it, scrolls" tabindex="0" data-scroller="" class="[^"]*\bwhitespace-pre-wrap wrap-anywhere\b[^"]*">/);
    expect(fee).not.toContain('recorded it, scrolls sideways');
    expect(markup).not.toMatch(/<details[^>]* open/);
    // The claim facts have no words; their record stays, so the step shows its record only.
    expect(markup).toMatch(/data-step="claim"><h3 class="text-sm font-semibold">Claim facts<\/h3><details/);
    // A step the priced line never used reads so, not as "not reached".
    expect(text(/data-step="per_visit">([\s\S]*?)<\/li>/.exec(markup)?.[1] ?? '')).toBe('Step 3, continued: the per-visit amount Does not apply to this line.');
  });

  it('gives a role that does not read PHI the sentences and the worksheet with no date, no record and no code (CAS-31)', () => {
    const { words, worksheets, markup } = page(trace, REGULATION, 'viewer');
    // The note says what it covers: the steps' dates (the page's other cards show the viewer a payment date; UX review).
    expect(VIEWER_DATES_NOTE).toBe('These steps leave out the line’s dates for your role.');
    expect(markup).toMatch(/^<p class="text-sm text-muted-foreground">These steps leave out the line’s dates for your role\.<\/p>/);
    // The viewer's steps are titled and numbered as the practice's: a step that does not apply says so (UX review).
    expect(text(/data-step="adjustments">([\s\S]*?)<\/li>/.exec(markup)?.[1] ?? '')).not.toBe('');
    expect(text(/data-step="per_visit">([\s\S]*?)<\/li>/.exec(markup)?.[1] ?? '')).toBe('Step 3, continued: the per-visit amount Does not apply to this line.');
    expect(markup).not.toContain('<details');
    expect(markup).not.toContain('<pre');
    expect(markup).not.toContain('sha256');
    expect(markup).not.toContain('data-step="claim"');
    const visible = text(markup);
    expect(visible).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(visible).not.toMatch(/[A-Z]+_[A-Z_]+/);
    expect(visible).not.toMatch(/[a-z0-9]+_[a-z0-9_]+/);
    expect(visible).not.toContain('{');
    expect(visible).toMatch(/rounded once|Rounded once/);
    // Every figure and code is a mono, tabular span holding exactly its segment, in order, and no other text is.
    const sentences = [...lineTraceSteps(words, []).flatMap((step) => [...step.sentences, ...(step.key === 'fee_schedule' ? worksheets.flatMap(worksheetSentences) : [])])];
    expect(monoSpans(markup)).toEqual(monoOf(sentences));
    expect(lineSentences(words).length).toBeGreaterThan(5);
  });

  it('reads "Not reached." for a step an unpriced line stopped before', () => {
    const [unpriced] = price(pricingInput(syntheticRelease(900001), [lineFacts({ agreement: { outcome: 'NO_MAPPING' } })]));
    const record: unknown = JSON.parse(JSON.stringify(unpriced?.trace));
    const { markup } = page(parseTrace(record), null, 'internal', record);
    expect(text(/data-step="rounding">([\s\S]*?)<\/li>/.exec(markup)?.[1] ?? '')).toBe('Step 6: rounding Not reached.');
    expect(text(/data-step="outcome">([\s\S]*?)<details/.exec(markup)?.[1] ?? '')).toContain('Remedy: Map the plan.');
  });
});
