import { X12_835_CODE_SETS } from '@tp/edi835';
import { ROUNDING_RULES } from '@tp/money';
import { CLAIM_FILING_INDICATOR_TEXT, type CitedMethod, type PayerIdentification, QUALIFIED_IDENTIFIER } from '@tp/packets';
import { METHOD_TEXT as VOCABULARY_METHODS, ROUNDING_TEXT as VOCABULARY_ROUNDING, STEP_TEXT as VOCABULARY_STEPS } from '@tp/packets/explain';
import { IDS } from '@tp/packets/testing';
import { pricingTraceSchema } from '@tp/pricing';
import { describe, expect, it } from 'vitest';

import { METHOD_TEXT, PROGRAM_TEXT, PayerCopyWordsError, ROUNDING_TEXT, STEP_TEXT, exclusionWords, payerAndPlanWords, wordsOf } from './words';

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

  it('says a method, step and rounding rule in @tp/packets’ one vocabulary, which words each line’s calculation (combined audit #38)', () => {
    expect(METHOD_TEXT).toBe(VOCABULARY_METHODS);
    expect(STEP_TEXT).toBe(VOCABULARY_STEPS);
    expect(ROUNDING_TEXT).toBe(VOCABULARY_ROUNDING);
  });

  it('refuses a code it has no words for, rather than print it or lower-case it into words no scan can tell from prose', () => {
    expect(() => wordsOf(STEP_TEXT, 'ncci_bundle', 'calculation step')).toThrow(PayerCopyWordsError);
    expect(() => wordsOf(ROUNDING_TEXT, 'HALF_DOWN_CENT', 'rounding rule')).toThrow(PayerCopyWordsError);
    expect(() => wordsOf(METHOD_TEXT, 'toString', 'calculation method')).toThrow(PayerCopyWordsError);
    expect(() => wordsOf(PROGRAM_TEXT, 'medicaid', 'dispute window program')).toThrow(/no words for a dispute window program/);
  });

  it('has words for every claim filing indicator the 835 may send in CLP06, and for no other code (the founder’s ruling of 2026-10-21)', () => {
    const codes: readonly string[] = X12_835_CODE_SETS.claim_filing_indicator;
    expect(codes.length).toBeGreaterThan(0);
    // Both ways, so the parser's list and the copy's words cannot drift: a code the parser accepts has its words, and
    // the table holds no code the parser would refuse.
    for (const code of codes) {
      expect(Object.hasOwn(CLAIM_FILING_INDICATOR_TEXT, code), code).toBe(true);
      // Words, never a code's shape.
      expect(CLAIM_FILING_INDICATOR_TEXT[code], code).not.toMatch(/_|^[A-Z0-9]{2}$/);
    }
    expect(Object.keys(CLAIM_FILING_INDICATOR_TEXT).sort()).toEqual([...codes].sort());
  });

  it('prints a plan known only by its claim filing indicator by its type in words, none for ZZ, and refuses an indicator with no words', () => {
    const payer = (plan_key: string): PayerIdentification => ({ payer_id: IDS.payer, name: 'SYNTHETIC PAYER Q', payer_id_raw: '2U:SYNPAYERQ', plan_id: IDS.plan, plan_key, plan_name: null });
    for (const code of X12_835_CODE_SETS.claim_filing_indicator) {
      const printed = payerAndPlanWords(payer(`CLP06:${code}`));
      expect(printed, code).toBe(code === 'ZZ' ? 'SYNTHETIC PAYER Q (payer ID SYNPAYERQ)' : `SYNTHETIC PAYER Q (payer ID SYNPAYERQ), plan type ${CLAIM_FILING_INDICATOR_TEXT[code] ?? ''}`);
      expect(printed.match(QUALIFIED_IDENTIFIER), code).toBeNull();
    }
    expect(payerAndPlanWords(payer('CLP06:12'))).toBe('SYNTHETIC PAYER Q (payer ID SYNPAYERQ), plan type Preferred Provider Organization (PPO)');
    expect(payerAndPlanWords(payer('CE:SYNPLAN-FIX-ONE'))).toBe('SYNTHETIC PAYER Q (payer ID SYNPAYERQ), plan identifier SYNPLAN-FIX-ONE');
    for (const code of ['Q9', 'C1', 'zz', '', 'toString']) {
      expect(() => payerAndPlanWords(payer(`CLP06:${code}`)), code).toThrow(PayerCopyWordsError);
    }
    expect(() => payerAndPlanWords(payer('CLP06:Q9'))).toThrow(/no words for a claim filing indicator/);
  });

  it('says a prompt-pay exclusion, free text in the rules schema, in words even when it is not listed', () => {
    expect(exclusionWords('self_funded_erisa_plans')).toBe('self-funded ERISA plans');
    expect(exclusionWords('GOVERNMENT_PLANS')).toBe('government plans');
  });
});
