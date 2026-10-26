import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { type PricingTrace, parseTrace } from '@tp/pricing';
import { describe, expect, it } from 'vitest';

import {
  CODE_SHAPES,
  PAYER_COPY_INTERNAL_TERMS,
  derivedFeeScheduleValues,
  figureSourceProblems,
  figureTokenProblems,
  lineSentences,
  numberTokens,
  worksheetSentences,
} from '../test-support';
import { type Sentence, plainText } from './figures';
import { AUDIENCES, type Audience, type ExplainCitation, explainLine } from './line';
import { PAYER_CODES } from './words';
import { type Worksheet, feeScheduleWorksheets } from './worksheet';

/**
 * Every golden claim's words, pinned (design 4.2; CAS-30, CAS-33): the engine's traces of each golden claim
 * (__golden__/<claim>.traces.json, written by tools/golden-worksheet/write-explain-traces.ts and held to a fresh
 * pricing by tools/golden-worksheet/explain-traces.golden.test.ts) worded for each audience, with the worksheets, and
 * compared with __golden__/<claim>.txt. A pin changes only in the change that changes the words, where its reviewer
 * reads it; CI runs without -u. Each claim is its own test (docs/adr/0066, Part 4: a mutant reruns the tests that
 * reached it), and each claim's words pass the figure checks of design 4.1 and the payer copy's scan.
 *
 * The golden claims name no contract page: a contract line cites page 1 here, a SYNTHETIC page, and a Medicare
 * Advantage non-contracted line the regulation. A line the words refuse is pinned as refused, with the list or rule.
 */

const DIRECTORY = path.join(import.meta.dirname, '__golden__');
const files = readdirSync(DIRECTORY)
  .filter((name) => name.endsWith('.traces.json'))
  .sort();
const REGULATION: ExplainCitation = { kind: 'regulation', reference: '42 CFR 422.214' };
const PAGE: ExplainCitation = { kind: 'contract', page: 1 };

const citationOf = (trace: PricingTrace): ExplainCitation => (trace.agreement?.outcome === 'MA_NONCONTRACTED' ? REGULATION : trace.agreement?.outcome === 'CONTRACT_RATE' ? PAGE : null);

function checked(sentences: readonly Sentence[], sources: Parameters<typeof figureSourceProblems>[1], roots: readonly unknown[], audience: Audience): string[] {
  expect(figureSourceProblems(sentences, sources, audience === 'payer')).toEqual([]);
  expect(figureTokenProblems(sentences, roots)).toEqual([]);
  const texts = sentences.map(plainText);
  for (const text of texts) {
    if (audience !== 'internal') expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    if (audience === 'payer') {
      for (const term of [...PAYER_COPY_INTERNAL_TERMS, ...CODE_SHAPES]) expect(term.test(text), `${term.source} in ${text}`).toBe(false);
      expect(text, 'no payer pin names a release (finding m10)').not.toMatch(/release/i);
    }
  }
  if (audience === 'payer') for (const sentence of sentences) for (const segment of sentence.segments) if ('code' in segment) expect(PAYER_CODES as readonly string[]).toContain(segment.code);
  return texts;
}

function refused(error: unknown): string {
  if (error instanceof Error && (error.name === 'ExplainWordsError' || error.name === 'ExplainShapeError')) {
    return `Refused (${error.name}): ${error.message}`;
  }
  throw error;
}

function worksheetText(sheet: Worksheet): string[] {
  const cell = (segment: Sentence['segments'][number]) => plainText({ segments: [segment] });
  return [
    plainText(sheet.title),
    ...sheet.rows.map((row) => `  ${plainText(row)}`),
    `  | ${[sheet.headings.part, sheet.headings.rvu, sheet.headings.gpci, sheet.headings.unit].map(plainText).join(' | ')} |`,
    ...sheet.parts.map((part) => `  | ${plainText(part.name)} | ${cell(part.rvu)} | ${cell(part.gpci)} | ${cell(part.unit)} |`),
    `  | ${plainText(sheet.total.name)} | | | ${cell(sheet.total.unit)} |`,
    ...sheet.formula.map((sentence) => `  ${plainText(sentence)}`),
    `  ${plainText(sheet.reductions)}`,
    `  ${plainText(sheet.check)}`,
  ];
}

/** A claim's words, every line in every audience it is worded for, then the worksheets, as the pin holds them. */
function claimWords(name: string): string {
  const stored = JSON.parse(readFileSync(path.join(DIRECTORY, name), 'utf8')) as { readonly claim: string; readonly traces: readonly unknown[] };
  const traces = stored.traces.map((trace) => parseTrace(trace));
  const rows = traces.map((trace) => ({ row: trace.line.line_no, trace, citation: citationOf(trace) }));
  const out = [`# ${stored.claim}`, ''];
  for (const { trace, citation } of rows) {
    for (const audience of AUDIENCES) {
      if (audience === 'payer' && trace.outcome.result !== 'priced') continue;
      out.push(`## Line ${String(trace.line.line_no)}, ${audience}`);
      try {
        const words = explainLine(trace, citation, audience);
        const texts = checked(lineSentences(words), () => ({ trace, citation }), [trace, citation], audience);
        out.push(texts[0] as string, ...words.steps.map((step) => `  [${step.step}] ${step.sentences.map(plainText).join(' ')}`));
      } catch (error) {
        out.push(refused(error));
      }
      out.push('');
    }
  }
  const byRow = new Map(rows.map((row) => [row.row, row]));
  for (const audience of ['internal', 'payer'] as const) {
    const lines = audience === 'payer' ? rows.filter((row) => row.trace.outcome.result === 'priced') : rows;
    let sheets: Worksheet[];
    try {
      sheets = feeScheduleWorksheets(lines, audience, { of: 'rows' });
    } catch (error) {
      out.push(`## Worksheets, ${audience}`, refused(error), '');
      continue;
    }
    if (sheets.length === 0) continue;
    out.push(`## Worksheets, ${audience}`);
    for (const sheet of sheets) {
      const sentences = worksheetSentences(sheet);
      checked(sentences, (n) => ({ trace: byRow.get(n as number)?.trace, citation: byRow.get(n as number)?.citation }), rows.flatMap((row) => [row.trace, row.citation]), audience);
      const stated = new Set(sentences.flatMap((sentence) => numberTokens(plainText(sentence))));
      for (const line of sheet.lines) for (const value of derivedFeeScheduleValues(byRow.get(line)?.trace as PricingTrace)) expect(stated.has(value), `${value}: a figure the trace does not hold`).toBe(false);
      out.push(...worksheetText(sheet));
    }
    out.push('');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

describe('the golden claims’ words', () => {
  it('reads every golden claim’s traces', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(files)('%s', async (name) => {
    await expect(claimWords(name)).toMatchFileSnapshot(path.join('__golden__', name.replace(/\.traces\.json$/, '.txt')));
  });
});
