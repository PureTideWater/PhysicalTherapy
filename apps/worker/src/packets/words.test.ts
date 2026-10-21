import { ROUNDING_RULES } from '@tp/money';
import type { CitedMethod } from '@tp/packets';
import { pricingTraceSchema } from '@tp/pricing';
import { describe, expect, it } from 'vitest';

import { METHOD_TEXT, PROGRAM_TEXT, PayerCopyWordsError, ROUNDING_TEXT, STEP_TEXT, exclusionWords, wordsOf } from './words';

/**
 * The payer's copy says every code of a closed list in words, and refuses one it has none for (audit item #37 part 1;
 * docs/adr/0061): the lists here are the engine's, the packet format's and the rules schema's own, so a code added
 * there without its words fails this test before it can reach a payer.
 */

/** Every method a packet version cites (packages/packets/src/format.ts CitedMethod). */
const CITED_METHODS = ['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT', 'MA_NONCONTRACTED'] as const satisfies readonly CitedMethod[];
/** The steps lineCalculation() writes before the adjustments (packages/packets/src/calculation.ts). */
const AMOUNT_STEPS = ['unit', 'visit', 'schedule', 'charge', 'base'] as const;
/** The engine's adjustment names, read from its trace schema (packages/pricing/src/trace.ts). */
const ADJUSTMENT_NAMES: readonly string[] = pricingTraceSchema.shape.steps.shape.adjustments.element.options.map((option) => option.shape.name.value);
/** A release dispute-window record's programs (packages/rules/src/schema.ts, dispute_window's key). */
const PROGRAMS = ['medicare', 'commercial_default'] as const;

describe('the payer copy’s words', () => {
  it('has words for every code of every closed list', () => {
    expect(ADJUSTMENT_NAMES.length).toBeGreaterThan(0);
    for (const [list, codes, table] of [
      ['calculation method', CITED_METHODS, METHOD_TEXT],
      ['rounding rule', ROUNDING_RULES, ROUNDING_TEXT],
      ['calculation step', [...AMOUNT_STEPS, ...ADJUSTMENT_NAMES], STEP_TEXT],
      ['dispute window program', PROGRAMS, PROGRAM_TEXT],
    ] as const) {
      for (const code of codes) {
        const words = wordsOf(table, code, list);
        // Words, never a code's shape (an initialism such as MPPR is words).
        expect(words, `${list} ${code}`).not.toMatch(/_/);
      }
      // No words for a code the list does not hold.
      expect(Object.keys(table).sort(), list).toEqual([...new Set(codes)].sort());
    }
  });

  it('refuses a code it has no words for, rather than print it or lower-case it into words no scan can tell from prose', () => {
    expect(() => wordsOf(STEP_TEXT, 'ncci_bundle', 'calculation step')).toThrow(PayerCopyWordsError);
    expect(() => wordsOf(ROUNDING_TEXT, 'HALF_DOWN_CENT', 'rounding rule')).toThrow(PayerCopyWordsError);
    expect(() => wordsOf(METHOD_TEXT, 'toString', 'calculation method')).toThrow(PayerCopyWordsError);
    expect(() => wordsOf(PROGRAM_TEXT, 'medicaid', 'dispute window program')).toThrow(/no words for a dispute window program/);
  });

  it('says a prompt-pay exclusion, free text in the rules schema, in words even when it is not listed', () => {
    expect(exclusionWords('self_funded_erisa_plans')).toBe('self-funded ERISA plans');
    expect(exclusionWords('GOVERNMENT_PLANS')).toBe('government plans');
  });
});
