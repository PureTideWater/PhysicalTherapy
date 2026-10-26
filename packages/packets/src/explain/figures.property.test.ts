import fc from 'fast-check';
import { type Cents, cents } from '@tp/money';
import { type IndexedRelease, type LineFacts, type PricingTrace, indexRelease, parseTrace, price } from '@tp/pricing';
import {
  contractAgreement,
  fixedTerms,
  lesserOfTerms,
  lineFacts,
  maAgreement,
  perVisitTerms,
  percentTerms,
  practiceSettings,
  pricingInput,
  readRuleRelease,
  syntheticRelease,
} from '@tp/pricing/testing';
import { describe, expect, it } from 'vitest';

import { CODE_SHAPES, PAYER_COPY_INTERNAL_TERMS, figureSourceProblems, figureTokenProblems, lineSentences, worksheetSentences } from '../test-support';
import { plainText } from './figures';
import { type Audience, type ExplainCitation, explainLine } from './line';
import { feeScheduleWorksheets } from './worksheet';

/**
 * The audit's test (design 4.1; CAS-30, CAS-33): "a test fails if any figure is not in the trace or the rate record",
 * over claims the engine prices from generated inputs: every method, every flag combination, CQ and CO, a suspended
 * sequestration, a payer's share floored at zero, a cap, a ZIP+4, facility and non-facility, LOCKED and CURRENT, and
 * the unpriced stops. For every line, in every audience it is worded for, and every worksheet: each figure is its
 * slot's value in its form (by source, and by slot), every number the words state is in the trace or the citation (by
 * parsing the words, reading no segment's source), no text holds a digit, no date reaches the viewer or the payer, and
 * the payer's words pass the payer copy's own scan. A fixed number of runs, as the repository's property tests use.
 */

const RELEASES: readonly { readonly release: IndexedRelease; readonly locked: boolean; readonly zip: string; readonly zipPlusFour?: string }[] = [
  { release: syntheticRelease(900001), locked: false, zip: '00011' },
  { release: syntheticRelease(900002), locked: true, zip: '00011' },
  { release: syntheticRelease(900003), locked: false, zip: '00011' },
  { release: indexRelease(readRuleRelease('fixtures/synthetic/rules/release-synth-900006')), locked: false, zip: '00012', zipPlusFour: '5001' },
];
const CODES = ['97110', '97112', '97140', '97530', '97161', '97026', '97750'] as const;
const CONTRACT: ExplainCitation = { kind: 'contract', page: 3 };
const REGULATION: ExplainCitation = { kind: 'regulation', reference: '42 CFR 422.214' };

const amount = (max: number) => fc.integer({ min: 0, max }).map((value): Cents => cents(BigInt(value)));

const flags = fc.record({ apply_mppr: fc.boolean(), apply_assistant_reduction: fc.boolean(), apply_sequestration: fc.boolean(), apply_ncci: fc.boolean(), timed_units_rule: fc.constantFrom('PER_CODE', 'MEDICARE_POOLED', 'PER_CODE', 'UNKNOWN') });
const adjustment = fc.option(fc.oneof(fc.record({ kind: fc.constant('PERCENT' as const), percent: fc.constantFrom('95', '87.5', '100') }), fc.record({ kind: fc.constant('CAP' as const), capCents: fc.constantFrom(1500n, 4000n, 20000n) })), { nil: undefined });
const rounding = fc.constantFrom(null, 'HALF_UP_CENT' as const, 'HALF_EVEN_CENT' as const, 'TRUNCATE' as const);

const agreement = (locked: boolean) =>
  fc.record({ method: fc.constantFrom('MA', 'FIXED', 'PERCENT', 'LESSER_FIXED', 'LESSER_PERCENT', 'PER_VISIT'), flags, adjustment, rounding, percentage: fc.constantFrom('100', '110', '85.25'), lockedYear: fc.boolean(), qualifying: fc.boolean() }).map((choice): LineFacts['agreement'] => {
    if (choice.method === 'MA') {
      return maAgreement();
    }
    const common = { flags: choice.flags, rounding: choice.rounding, codes: [...CODES], ...(choice.adjustment === undefined ? {} : { adjustment: choice.adjustment }) };
    const schedule = { percentage: choice.percentage, yearBasis: locked && choice.lockedYear ? ('LOCKED:2025' as const) : ('CURRENT' as const), conversionFactor: choice.qualifying ? ('qualifying_apm' as const) : ('non_qualifying_apm' as const) };
    switch (choice.method) {
      case 'FIXED':
        return contractAgreement({ terms: fixedTerms(5000n, common) });
      case 'PERCENT':
        return contractAgreement({ terms: percentTerms({ ...common, ...schedule }) });
      case 'LESSER_FIXED':
        return contractAgreement({ terms: lesserOfTerms({ fixedCents: 3000n }, common) });
      case 'LESSER_PERCENT':
        return contractAgreement({ terms: lesserOfTerms(schedule, common) });
      case 'PER_VISIT':
        return contractAgreement({ terms: perVisitTerms(8000n, common), windows: { timely_filing_days: null, dispute_window_days: 120, appeal_levels: [] } });
    }
  });

const line = (locked: boolean) =>
  fc.record({
    procedureCode: fc.constantFrom(...CODES),
    modifiers: fc.subarray(['CQ', 'CO', '59', 'XS'], { maxLength: 2 }).map((more) => ['GP', ...more]),
    units: fc.constantFrom('1', '2', '3', '8'),
    serviceDate: fc.constantFrom('2026-03-10', '2026-03-10', '2026-08-10'),
    placeOfService: fc.constantFrom('11', '11', '22'),
    chargeCents: amount(15000),
    observedAllowedCents: amount(12000),
    observedAllowedBasis: fc.constantFrom('amt_b6', 'paid_plus_pr'),
    patientShare: fc.option(amount(9000), { nil: undefined }),
    agreement: agreement(locked),
  });

const claim = fc.integer({ min: 0, max: RELEASES.length - 1 }).chain((index) =>
  fc.record({
    index: fc.constant(index),
    lines: fc.array(line((RELEASES[index] as (typeof RELEASES)[number]).locked), { minLength: 1, maxLength: 3 }),
    status: fc.constantFrom('1', '1', '1', '19', '2', '21', '22'),
    remittanceDate: fc.constantFrom('2026-04-01', null),
    defaultRounding: fc.constantFrom('HALF_UP_CENT' as const, null),
  }),
);

function check(trace: PricingTrace, citation: ExplainCitation, audience: Audience): void {
  const sentences = lineSentences(explainLine(trace, citation, audience));
  expect(figureSourceProblems(sentences, () => ({ trace, citation }), audience === 'payer')).toEqual([]);
  expect(figureTokenProblems(sentences, [trace, citation])).toEqual([]);
  scanAudience(sentences.map(plainText), audience);
}

function scanAudience(texts: readonly string[], audience: Audience): void {
  for (const text of texts) {
    if (audience !== 'internal') expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    if (audience === 'payer') for (const term of [...PAYER_COPY_INTERNAL_TERMS, ...CODE_SHAPES]) expect(term.test(text), `${term.source} in ${text}`).toBe(false);
  }
}

describe('every figure of the words is in the trace or the rate record', () => {
  it('holds for every line the engine prices or stops, in every audience, and for every worksheet', () => {
    fc.assert(
      fc.property(claim, (generated) => {
        const { release, zip, zipPlusFour } = RELEASES[generated.index] as (typeof RELEASES)[number];
        const facts = generated.lines.map(({ patientShare, ...rest }, index) =>
          lineFacts({ ...rest, lineNo: index + 1, patientShareAdjustments: patientShare === undefined ? [] : [{ groupCode: 'PR', reasonCode: '2', amountCents: patientShare }] }),
        );
        const settings = practiceSettings({ zip, defaultRounding: generated.defaultRounding, ...(zipPlusFour === undefined ? {} : { zipPlusFour }) });
        const priced = price(pricingInput(release, facts, { settings, claim: { claimStatusCode: generated.status, remittanceDate: generated.remittanceDate } }));
        const traces = priced.map((item) => parseTrace(JSON.parse(JSON.stringify(item.trace))));
        const rows = traces.map((trace, index) => ({ row: index + 1, trace, citation: trace.agreement?.outcome === 'MA_NONCONTRACTED' ? REGULATION : trace.agreement?.outcome === 'CONTRACT_RATE' ? CONTRACT : null }));
        for (const { trace, citation } of rows) {
          check(trace, citation, 'internal');
          check(trace, citation, 'viewer');
          if (trace.outcome.result === 'priced') check(trace, citation, 'payer');
        }
        const byRow = new Map(rows.map((row) => [row.row, row]));
        for (const audience of ['internal', 'payer'] as const) {
          const lines = audience === 'payer' ? rows.filter((row) => row.trace.outcome.result === 'priced') : rows;
          for (const sheet of feeScheduleWorksheets(lines, audience)) {
            const sentences = worksheetSentences(sheet);
            expect(figureSourceProblems(sentences, (n) => ({ trace: byRow.get(n as number)?.trace, citation: byRow.get(n as number)?.citation }), audience === 'payer')).toEqual([]);
            expect(figureTokenProblems(sentences, rows.flatMap((row) => [row.trace, row.citation]))).toEqual([]);
            scanAudience(sentences.map(plainText), audience);
          }
        }
      }),
      { numRuns: 100 },
    );
    // A hundred claims price and word in about a second on an idle machine; a loaded runner is given more.
  }, 30_000);
});
