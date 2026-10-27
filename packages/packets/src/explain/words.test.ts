import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ENGINE_ERROR_DETAILS, NO_PFS_VALUE_DETAILS, type PricingTrace, UNPRICED_REASONS, parseTrace, price } from '@tp/pricing';
import { contractAgreement, lineFacts, percentTerms, pricingInput, syntheticRelease } from '@tp/pricing/testing';
import { describe, expect, it } from 'vitest';

import { CODE_SHAPES } from '../test-support';
import { textSegments } from './figures';
import { explainLine } from './line';
import {
  APPLICABILITY_TEXT,
  CODES,
  DETAIL_TEXT,
  ExplainWordsError,
  MEDICARE_TIMED_UNITS_TEXT,
  OBSERVED_BASIS_TEXT,
  PAYER_CODES,
  PAYER_OBSERVED_BASIS_TEXT,
  SECONDARY_STATUS_TEXT,
  TIMED_UNITS_TEXT,
  UNPRICED_MEANING,
  UNPRICED_REMEDY,
  WORD_TABLES,
  wordsOf,
} from './words';

/**
 * The one vocabulary (design 4.3, words.test.ts; CAS-30, CAS-34): every closed list's code has words, a code without
 * them is refused naming its list, the closed list of unpriced reasons is the document's word for word, and no entry
 * holds a digit but one of CODES, so no number can hide in the words.
 */

const REPOSITORY = path.resolve(import.meta.dirname, '../../../..');

/** The rows of the markdown table that starts with `| Reason |`, as cells (as packages/pricing's own test reads it). */
function reasonTable(text: string): string[][] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('| Reason |'));
  const rows: string[][] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) {
      break;
    }
    rows.push(line.slice(1, -1).split(' | ').map((cell) => cell.trim()));
  }
  return rows;
}

/** A closed list as @tp/contracts' source declares it (`export const NAME = [...] as const;`), which this package does not import. */
function contractsList(name: string): string[] {
  const source = readFileSync(path.join(REPOSITORY, 'packages/contracts/src/terms.ts'), 'utf8');
  const match = new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const;`).exec(source);
  expect(match, name).not.toBeNull();
  return [...(match?.[1] ?? '').matchAll(/'([^']*)'/g)].map((item) => item[1] as string);
}

/** Every string a table holds, by where it is. */
function entries(): { readonly where: string; readonly text: string }[] {
  return Object.entries(WORD_TABLES).flatMap(([table, value]) =>
    Array.isArray(value) ? value.map((text: string, index) => ({ where: `${table}[${String(index)}]`, text })) : Object.entries(value as Record<string, string>).map(([key, text]) => ({ where: `${table}.${key}`, text })),
  );
}

/** A real trace: a percent-of-Medicare contract line, priced. */
function pricedTrace(): PricingTrace {
  const [line] = price(pricingInput(syntheticRelease(), [lineFacts({ agreement: contractAgreement({ terms: percentTerms({ percentage: '110' }) }) })]));
  return parseTrace(structuredClone(line?.trace));
}

describe('the closed lists the trace writes as strings', () => {
  it('has words for every conversion factor applicability and timed-units rule @tp/contracts lists, and no others', () => {
    expect(Object.keys(APPLICABILITY_TEXT).sort()).toEqual(contractsList('CONVERSION_FACTORS').sort());
    expect(Object.keys(TIMED_UNITS_TEXT).sort()).toEqual(contractsList('TIMED_UNITS_RULES').sort());
    expect(Object.keys(MEDICARE_TIMED_UNITS_TEXT).sort()).toEqual(contractsList('TIMED_UNITS_RULES').sort());
  });

  it('has words for both observed bases the engine reads, each audience', () => {
    expect(Object.keys(OBSERVED_BASIS_TEXT).sort()).toEqual(['amt_b6', 'paid_plus_pr']);
    expect(Object.keys(PAYER_OBSERVED_BASIS_TEXT).sort()).toEqual(['amt_b6', 'paid_plus_pr']);
  });

  it('words every claim status the engine leaves to a later release (packages/pricing engine.ts, SECONDARY_STATUSES)', () => {
    const engine = readFileSync(path.join(REPOSITORY, 'packages/pricing/src/engine.ts'), 'utf8');
    const statuses = [...(/const SECONDARY_STATUSES = new Set\(\[([^\]]*)\]\)/.exec(engine)?.[1] ?? '').matchAll(/'([^']*)'/g)].map((item) => item[1]);
    expect(statuses).toEqual(['2', '3', '20', '21']);
    expect(Object.keys(SECONDARY_STATUS_TEXT).sort()).toEqual([...statuses].sort());
  });

  it('has words for every ENGINE_ERROR and NO_PFS_VALUE detail, and no others', () => {
    expect(Object.keys(DETAIL_TEXT).sort()).toEqual([...ENGINE_ERROR_DETAILS, ...NO_PFS_VALUE_DETAILS].sort());
    for (const words of Object.values(DETAIL_TEXT)) {
      expect(words, 'worded for a line, not a screening row').not.toMatch(/quarter/);
    }
  });

  it.each([
    ['timed-units rule', (trace: PricingTrace) => ({ ...trace, terms: { ...trace.terms!, flags: { ...trace.terms!.flags, timed_units_rule: 'SOMETIMES' } } })],
    ['conversion factor applicability', (trace: PricingTrace) => ({ ...trace, terms: { ...trace.terms!, percent_of_medicare: { ...trace.terms!.percent_of_medicare!, conversion_factor: 'partial_apm' } } })],
    ['observed allowed basis', (trace: PricingTrace) => ({ ...trace, line: { ...trace.line, observed_allowed_basis: 'remit_amount' } })],
    ['method', (trace: PricingTrace) => ({ ...trace, terms: { ...trace.terms!, method: 'CASE_RATE' } })],
  ] as const)('refuses a %s it has no words for, naming the list and never the code', (list, change) => {
    const trace = change(pricedTrace());
    for (const audience of ['internal', 'payer'] as const) {
      if (list === 'timed-units rule' && audience === 'payer') continue;
      let thrown: unknown;
      try {
        explainLine(trace, { kind: 'contract', page: 2 }, audience);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ExplainWordsError);
      expect((thrown as ExplainWordsError).list).toBe(list);
      expect((thrown as ExplainWordsError).name).toBe('ExplainWordsError');
      expect((thrown as ExplainWordsError).message).toBe(`the words have no entry for a ${list}`);
    }
  });

  it('refuses a code that is only a name on the object prototype', () => {
    expect(() => wordsOf(APPLICABILITY_TEXT, 'toString', 'conversion factor applicability')).toThrow(ExplainWordsError);
    expect(() => wordsOf(APPLICABILITY_TEXT, '__proto__', 'conversion factor applicability')).toThrow(ExplainWordsError);
    expect(wordsOf(APPLICABILITY_TEXT, 'qualifying_apm', 'conversion factor applicability')).toBe(APPLICABILITY_TEXT.qualifying_apm);
  });
});

describe('the closed list of unpriced reasons', () => {
  const rows = reasonTable(readFileSync(path.join(REPOSITORY, 'docs/product/unpriced-reasons.md'), 'utf8'));

  it('is docs/product/unpriced-reasons.md’s, meaning and remedy word for word, every reason and no other', () => {
    expect(rows.length).toBe(UNPRICED_REASONS.length);
    for (const [reason, meaning, remedy] of rows) {
      const code = (reason ?? '').replaceAll('`', '') as (typeof UNPRICED_REASONS)[number];
      expect(UNPRICED_MEANING[code], code).toBe(meaning);
      expect(UNPRICED_REMEDY[code], code).toBe(remedy);
    }
    expect(Object.keys(UNPRICED_MEANING).sort()).toEqual([...UNPRICED_REASONS].sort());
    expect(Object.keys(UNPRICED_REMEDY).sort()).toEqual([...UNPRICED_REASONS].sort());
  });
});

describe('the codes', () => {
  it('names the codes the words print beside their words, and the payer’s, each one of them', () => {
    expect(CODES).toEqual(['AMT B6', 'ZIP+4', 'CQ', 'CO', 'MPPR', 'NCCI', 'MUE', 'RVU', 'GPCI', 'APM', 'CMS']);
    expect(PAYER_CODES).toEqual(['ZIP+4', 'RVU', 'GPCI', 'CQ', 'CO', 'APM', 'CMS']);
    for (const code of PAYER_CODES) expect(CODES).toContain(code);
  });

  it('splits a code from text only where it stands as a word of its own', () => {
    expect(textSegments('the payer’s allowed amount (AMT B6)')).toEqual([{ text: 'the payer’s allowed amount (' }, { code: 'AMT B6' }, { text: ')' }]);
    expect(textSegments('needs its ZIP+4: ')).toEqual([{ text: 'needs its ' }, { code: 'ZIP+4' }, { text: ': ' }]);
    expect(textSegments('CQ and CO are both')).toEqual([{ code: 'CQ' }, { text: ' and ' }, { code: 'CO' }, { text: ' are both' }]);
    expect(textSegments('COST CMSX RVUs')).toEqual([{ text: 'COST CMSX RVUs' }]);
    expect(() => textSegments('page 2')).toThrow('a digit in the words outside a figure');
  });
});

describe('every entry', () => {
  it('holds no digit outside one of CODES, the quoted closed list aside (its meaning of SECONDARY_PAYER is never printed)', () => {
    const quoted = new Set(['UNPRICED_MEANING', 'UNPRICED_REMEDY', 'CODES', 'PAYER_CODES']);
    const problems = entries().filter(({ where, text }) => !quoted.has(where.split(/[.[]/)[0] ?? '') && hasDigit(text));
    expect(problems).toEqual([]);
    expect(hasDigit('the payer’s allowed amount (AMT B6)')).toBe(false);
    expect(hasDigit('the payer’s allowed amount (AMT 6)')).toBe(true);
  });

  it('is words, never shaped like a code (no words joined by underscores)', () => {
    for (const { where, text } of entries()) {
      for (const shape of CODE_SHAPES) expect(shape.test(text), `${where}: ${text}`).toBe(false);
    }
  });
});

/** Whether text holds a digit outside the codes it names (the segments say). */
function hasDigit(text: string): boolean {
  try {
    textSegments(text);
    return false;
  } catch {
    return true;
  }
}
