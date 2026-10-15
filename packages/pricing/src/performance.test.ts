/**
 * Test matrix PRC-20 (PRD 11: "100,000 lines price in under two minutes on one worker vCPU"): 25,000
 * SYNTHETIC claims of four lines each, in turn Medicare Advantage non-contracted (every adjustment and
 * the NCCI edits on), a 110% contract with the multiple procedure reduction, a fixed schedule with the
 * NCCI edits and a cap, and a per-visit contract, every line with its full trace, priced on this one
 * thread. The units stay within the SYNTHETIC MUEs, so every line prices.
 */
import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import { price } from './engine';
import { contractAgreement, fixedTerms, lineFacts, perVisitTerms, percentTerms, pricingInput, syntheticRelease } from './testing';
import type { LineFacts } from './types';

const LINES = 100_000;
const PER_CLAIM = 4;
const CODES = ['97110', '97112', '97140', '97530', '97116', '97035'] as const;

describe('100,000 lines (PRC-20)', () => {
  it('price, every one with its trace, in under two minutes', () => {
    const release = syntheticRelease(900001);
    const contract = contractAgreement({ terms: percentTerms({ percentage: '110', codes: [...CODES], flags: { apply_mppr: true, apply_sequestration: true } }) });
    const fixed = contractAgreement({ terms: fixedTerms(3250n, { codes: [...CODES], flags: { apply_ncci: true, apply_assistant_reduction: true }, adjustment: { kind: 'CAP', capCents: 6000n } }) });
    const visit = contractAgreement({ terms: perVisitTerms(8800n, { codes: [...CODES], flags: { apply_ncci: true, apply_sequestration: true } }) });
    const ma = lineFacts().agreement;
    const agreements = [ma, contract, fixed, visit] as const;
    const started = performance.now();
    let lines = 0;
    let priced = 0;
    for (let claim = 0; claim < LINES / PER_CLAIM; claim += 1) {
      const agreement = agreements[claim % agreements.length] ?? ma;
      const facts: LineFacts[] = Array.from({ length: PER_CLAIM }, (_, index) =>
        lineFacts({
          lineNo: index + 1,
          procedureCode: CODES[(claim + index) % CODES.length] ?? '97110',
          units: String(1 + ((claim + index) % 3)),
          modifiers: index === 2 ? ['GP', 'CQ'] : ['GP'],
          agreement,
        }),
      );
      for (const result of price(pricingInput(release, facts))) {
        lines += 1;
        priced += result.outcome === 'priced' ? 1 : 0;
      }
    }
    const seconds = (performance.now() - started) / 1000;
    expect(lines).toBe(LINES);
    expect(priced).toBe(LINES);
    expect(seconds, `priced ${String(LINES)} lines in ${seconds.toFixed(1)} s`).toBeLessThan(120);
  }, 180_000);
});
