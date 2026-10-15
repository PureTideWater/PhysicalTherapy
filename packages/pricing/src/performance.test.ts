/**
 * Test matrix PRC-20 (PRD 11: "100,000 lines price in under two minutes on one worker vCPU"): 25,000
 * SYNTHETIC claims of four lines each, half Medicare Advantage non-contracted and half under a 110%
 * contract with the multiple procedure reduction on, every line with its full trace, priced on this
 * one thread.
 */
import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import { price } from './engine';
import { contractAgreement, lineFacts, percentTerms, pricingInput, syntheticRelease } from './testing';
import type { LineFacts } from './types';

const LINES = 100_000;
const PER_CLAIM = 4;
const CODES = ['97110', '97112', '97140', '97530', '97116', '97161'] as const;

describe('100,000 lines (PRC-20)', () => {
  it('price, every one with its trace, in under two minutes', () => {
    const release = syntheticRelease(900001);
    const contract = contractAgreement({ terms: percentTerms({ percentage: '110', codes: [...CODES], flags: { apply_mppr: true, apply_sequestration: true } }) });
    const ma = lineFacts().agreement;
    const started = performance.now();
    let lines = 0;
    let priced = 0;
    for (let claim = 0; claim < LINES / PER_CLAIM; claim += 1) {
      const agreement = claim % 2 === 0 ? ma : contract;
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
