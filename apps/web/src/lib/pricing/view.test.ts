import { ExplainWordsError, STEP_KINDS, explainLine, plainText } from '@tp/packets/explain';
import { parseTrace, price } from '@tp/pricing';
import { lineFacts, pricingInput, syntheticRelease } from '@tp/pricing/testing';
import { describe, expect, it } from 'vitest';

import { firstDayOf, lastDayOf } from '../routes/pricing';
import { TRACE_REMITTANCE_DATE_NOTE, WORD_STEP_PART, lineStatusOf, lineTraceSteps, pricingWords, shareOf, traceOrder, traceSteps } from './view';

/** How pricing results read on screen: stages, shares, the trace's steps in order, and run periods by month. SYNTHETIC inputs only. */

describe('a line’s status chip', () => {
  it('is the stage triage gave it, else unpriced when its pricing in effect left it so, else none', () => {
    const priced = { expectedAllowedCents: '5000', varianceCents: '1200', unpricedReason: null };
    expect(lineStatusOf(null, null)).toBeNull();
    expect(lineStatusOf(null, { expectedAllowedCents: null, varianceCents: null, unpricedReason: 'NO_MAPPING' })).toBe('unpriced');
    // Triage, not the pricing alone, puts a line at a stage.
    expect(lineStatusOf(null, priced)).toBeNull();
    expect(lineStatusOf(null, { ...priced, varianceCents: '-300' })).toBeNull();
    for (const stage of ['flagged', 'validated', 'actionable', 'payer_approved', 'recovered'] as const) {
      expect(lineStatusOf(stage, priced)).toBe(stage);
    }
    // A line flagged by an anomaly while unpriced shows its stage; an unknown stage falls back to the pricing.
    expect(lineStatusOf('flagged', { expectedAllowedCents: null, varianceCents: null, unpricedReason: 'NO_AGREEMENT' })).toBe('flagged');
    expect(lineStatusOf('archived', null)).toBeNull();
  });
});

describe('shares', () => {
  it('are percentages to one place, rounded half up, in integers, and zero of nothing', () => {
    expect(shareOf(1, 3)).toBe('33.3%');
    expect(shareOf(2, 3)).toBe('66.7%');
    expect(shareOf('18400', '32800')).toBe('56.1%');
    expect(shareOf(4, 4)).toBe('100.0%');
    expect(shareOf(0, 0)).toBe('0%');
    expect(shareOf(123_456_789_012_345n, 987_654_321_098_765n)).toBe('12.5%');
  });
});

describe('the trace’s steps', () => {
  const [priced] = price(pricingInput(syntheticRelease(900001), [lineFacts({ units: '2' })]));
  const trace: unknown = JSON.parse(JSON.stringify(priced?.trace));

  it('come in the engine’s order: the release, the facts, the agreement, the terms, each step of PRD 11, the outcome', () => {
    const keys = traceSteps(trace).map((item) => item.key);
    const { steps } = traceOrder();
    expect(keys.slice(0, 7)).toEqual(['release', 'as_of', 'settings', 'claim', 'line', 'agreement', 'terms']);
    expect(keys.slice(7, 7 + steps.length)).toEqual([...steps]);
    expect(keys.at(-1)).toBe('outcome');
    expect(steps.indexOf('fee_schedule')).toBeLessThan(steps.indexOf('units'));
    expect(steps.indexOf('units')).toBeLessThan(steps.indexOf('adjustments'));
    expect(steps.indexOf('rounding')).toBeLessThan(steps.indexOf('window'));
  });

  it('name every rule record a step read, with its window and SHA-256, and the release with its manifest', () => {
    const views = traceSteps(trace);
    const fee = views.find((item) => item.key === 'fee_schedule');
    expect(fee?.title).toBe('Step 2: the fee schedule');
    expect(fee?.records.map((record) => record.recordType)).toEqual(expect.arrayContaining(['pfs_rvu', 'locality_map', 'pfs_gpci', 'conversion_factor']));
    expect(fee?.records.every((record) => /^[0-9a-f]{64}$/.test(record.sha256))).toBe(true);
    const release = views.find((item) => item.key === 'release');
    expect(release?.recorded).toContain('"number": 900001');
    expect(release?.recorded).toContain('manifest_sha256');
  });

  it('say beside the claim facts and the dispute window that the engine’s remittance_date is the payment date, not the remittance advice’s own date (the founder’s ruling of 2026-10-20)', () => {
    const views = traceSteps(trace);
    const noted = views.filter((item) => item.note !== null).map((item) => item.key);
    expect(noted).toEqual(expect.arrayContaining(['claim', 'window']));
    expect(views.find((item) => item.key === 'window')?.recorded).toContain('"measured_from": "remittance_date"');
    expect(views.find((item) => item.key === 'claim')?.note).toBe(TRACE_REMITTANCE_DATE_NOTE);
    expect(TRACE_REMITTANCE_DATE_NOTE).toContain('payment date (BPR16');
    expect(TRACE_REMITTANCE_DATE_NOTE).toContain('not the remittance advice’s own date');
    // A step that does not name it carries no note.
    expect(views.find((item) => item.key === 'fee_schedule')?.note).toBeNull();
  });

  it('mark a step the line never reached, and keep a part of a trace it does not know', () => {
    const [unpriced] = price(pricingInput(syntheticRelease(900001), [lineFacts({ agreement: { outcome: 'NO_MAPPING' } })]));
    const views = traceSteps({ ...(JSON.parse(JSON.stringify(unpriced?.trace)) as object), extra: { note: 'kept' } });
    expect(views.find((item) => item.key === 'rounding')?.recorded).toBeNull();
    expect(views.find((item) => item.key === 'adjustments')?.recorded).toBeNull();
    expect(views.find((item) => item.key === 'outcome')?.recorded).toContain('NO_MAPPING');
    expect(views.at(-1)).toMatchObject({ key: 'extra', title: 'Extra' });
    expect(traceSteps(null)).toEqual([]);
  });

  it('title a step they have no title for from its key, initialisms in capitals (the screen tour: "Ncci ptp" is NCCI PTP)', () => {
    const views = traceSteps({ ...(trace as object), mue_values: { note: 'kept' } });
    const titles = new Map(views.map((item) => [item.key, item.title]));
    expect(titles.get('ncci_ptp')).toBe('NCCI PTP');
    expect(titles.get('per_visit')).toBe('Per visit');
    expect(titles.get('mue_values')).toBe('MUE values');
    // No title spells one of the engine's initialisms in anything but capitals.
    expect(views.map((item) => item.title).filter((title) => /\b(?:[Nn]cci|[Pp]tp|[Mm]ue|[Mm]ppr|[Pp]fs|[Rr]vu|[Gg]pci)\b/.test(title))).toEqual([]);
  });
});

describe('the line trace page’s steps in words (design 3.9)', () => {
  const REGULATION = { kind: 'regulation', reference: '42 CFR 422.214' } as const;
  const [priced] = price(pricingInput(syntheticRelease(900001), [lineFacts({ units: '2' })]));
  const stored: unknown = JSON.parse(JSON.stringify(priced?.trace));
  const trace = parseTrace(stored);

  it('put each step’s words under the title of the part of the trace it is of, every step kind in a part the engine records', () => {
    const { parts, steps } = traceOrder();
    for (const kind of STEP_KINDS) {
      expect([...parts, ...steps], kind).toContain(WORD_STEP_PART[kind]);
    }
    const words = explainLine(trace, REGULATION, 'internal');
    const views = lineTraceSteps(words, traceSteps(stored));
    // Every part the engine recorded is a step, in its order, for the roles that read PHI; each word step sits in one.
    expect(views.map((view) => view.key)).toEqual(traceSteps(stored).map((view) => view.key));
    const sentences = views.flatMap((view) => view.sentences);
    expect(sentences).toHaveLength(words.steps.flatMap((step) => step.sentences).length);
    expect(sentences).toEqual(expect.arrayContaining(words.steps.flatMap((step) => step.sentences)));
    // The release's words come first, as the engine records the release first.
    expect(views[0]).toMatchObject({ key: 'release', sentences: words.steps.find((step) => step.step === 'release')?.sentences });
    const fee = views.find((view) => view.key === 'fee_schedule');
    expect(fee?.title).toBe('Step 2: the fee schedule');
    expect(fee?.sentences.map(plainText).join(' ')).toMatch(/^Fee schedule: the \d{4} records in force on \d{4}-\d{2}-\d{2}\./);
    expect(fee?.recorded?.records.map((record) => record.recordType)).toEqual(expect.arrayContaining(['pfs_rvu', 'pfs_gpci', 'conversion_factor']));
    // The claim facts have no words of their own; they keep their record.
    expect(views.find((view) => view.key === 'claim')).toMatchObject({ sentences: [], recorded: { key: 'claim' } });
  });

  it('give a role without the record only the steps the words speak to, and no record', () => {
    const words = explainLine(trace, REGULATION, 'viewer');
    const views = lineTraceSteps(words, []);
    expect(views.every((view) => view.recorded === null && view.sentences.length !== 0)).toBe(true);
    expect(views.map((view) => view.key)).toEqual(lineTraceSteps(words, traceSteps(stored)).filter((view) => view.sentences.length !== 0).map((view) => view.key));
    expect(views.map((view) => view.key)).not.toContain('claim');
    expect(views.flatMap((view) => view.sentences).map(plainText).join(' ')).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(lineTraceSteps(null, [])).toEqual([]);
  });

  it('word the Pricing card’s method and adjustments, and refuse a code they have no words for rather than show it', () => {
    const adjustment = { name: 'mppr', before_cents: '5000', after_cents: '4523.2' };
    expect(pricingWords({ method: 'PERCENT_OF_MEDICARE', adjustmentsApplied: [adjustment] })).toEqual({
      method: 'Percent of Medicare',
      adjustments: [{ name: 'mppr', words: 'The multiple procedure payment reduction', beforeCents: '5000', afterCents: '4523.2' }],
    });
    expect(pricingWords({ method: null, adjustmentsApplied: [] })).toEqual({ method: null, adjustments: [] });
    expect(() => pricingWords({ method: 'CAPITATION', adjustmentsApplied: [] })).toThrow(new ExplainWordsError('method'));
    expect(() => pricingWords({ method: 'FIXED_SCHEDULE', adjustmentsApplied: [{ ...adjustment, name: 'bonus' }] })).toThrow(new ExplainWordsError('adjustment'));
  });
});

describe('a run’s period by months', () => {
  it('runs from the first day of the first month to the last day of the last', () => {
    expect(firstDayOf('2026-03')).toBe('2026-03-01');
    expect(lastDayOf('2026-03')).toBe('2026-03-31');
    expect(lastDayOf('2026-02')).toBe('2026-02-28');
    expect(lastDayOf('2028-02')).toBe('2028-02-29');
    expect(lastDayOf('2026-12')).toBe('2026-12-31');
  });
});
