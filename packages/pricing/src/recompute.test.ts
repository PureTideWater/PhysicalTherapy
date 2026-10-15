import type { Cents } from '@tp/money';
import type { RuleRecord } from '@tp/rules';
import { describe, expect, it } from 'vitest';

import { price } from './engine';
import { TraceRecomputeError, recompute } from './recompute';
import {
  SYNTHETIC_RELEASES,
  contractAgreement,
  fixedTerms,
  keyOf,
  lesserOfTerms,
  lineFacts,
  perVisitTerms,
  percentTerms,
  pricingInput,
  readRuleRelease,
  releaseVariant,
  ruleRecordLike,
  syntheticRelease,
} from './testing';
import type { PricingTrace, TraceRecordRef } from './trace';
import type { LineFacts, LinePricing, PricingInput } from './types';

/**
 * Test matrix PRC-16 on hand-built lines (the golden test runs it over every golden line): the trace
 * alone recomputes the stored amount, and a trace changed after the fact no longer does.
 */
const release = syntheticRelease(900001);
const base = readRuleRelease(SYNTHETIC_RELEASES[900001]);
const cents = (value: bigint) => value as Cents;
const all = contractAgreement({ terms: percentTerms({ percentage: '110', codes: ['97110', '97140', '97530'], flags: { apply_mppr: true, apply_assistant_reduction: true, apply_sequestration: true } }) });

/** The trace as stored and read back: plain JSON. */
function stored(result: LinePricing | undefined): PricingTrace {
  expect(result).toBeDefined();
  return JSON.parse(JSON.stringify(result?.trace)) as PricingTrace;
}

function priceLines(lines: LineFacts[], overrides: Parameters<typeof pricingInput>[2] = {}, using = release): LinePricing[] {
  return price(pricingInput(using, lines, overrides));
}

function expectReproduced(results: readonly LinePricing[]): void {
  for (const result of results) {
    const again = recompute(stored(result));
    expect(again.differences, `line ${String(result.lineNo)}`).toEqual([]);
    if (result.outcome === 'priced') {
      expect(again).toMatchObject({
        outcome: 'priced',
        expectedAllowedCents: result.expectedAllowedCents,
        rounding: result.rounding,
        patientShareCents: result.patientShareCents,
        varianceCents: result.varianceCents,
      });
      if (again.outcome === 'priced') {
        expect(again.expectedUnroundedCents.equals(result.expectedUnroundedCents)).toBe(true);
        expect(again.baseCents.equals(result.baseCents)).toBe(true);
        expect(again.adjustments.map((item) => [item.name, item.beforeCents.toString(), item.afterCents.toString()])).toEqual(
          result.adjustments.map((item) => [item.name, item.beforeCents.toString(), item.afterCents.toString()]),
        );
      }
    } else {
      expect(again).toEqual({ outcome: 'unpriced', reason: result.reason, differences: [] });
    }
  }
}

const day = (agreement = all) => [
  lineFacts({ lineNo: 1, procedureCode: '97110', units: '2', modifiers: ['GP', 'CQ'], agreement, patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '2', amountCents: cents(840n) }] }),
  lineFacts({ lineNo: 2, procedureCode: '97140', agreement }),
  lineFacts({ lineNo: 3, procedureCode: '97530', agreement, patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '1', amountCents: cents(9000n) }] }),
];

describe('recompute(trace)', () => {
  it('reproduces every priced amount, base and adjustment from the trace alone', () => {
    expectReproduced(priceLines(day()));
    expectReproduced(priceLines(day(undefined).map((line) => ({ ...line, agreement: lineFacts().agreement }))));
    expectReproduced(priceLines([lineFacts({ placeOfService: '22', procedureCode: '97530', units: '3' })], { settings: { zip: '00011', defaultRounding: null, placeOfServiceSettings: { '22': 'facility' } } }));
    expectReproduced(priceLines([lineFacts({ procedureCode: '97161' })]));
    expectReproduced(priceLines([lineFacts({ procedureCode: '97112', serviceDate: '2026-04-14', agreement: contractAgreement({ terms: percentTerms({ percentage: '105', yearBasis: 'LOCKED:2025', codes: ['97112'], rounding: 'TRUNCATE' }) }) })], {}, syntheticRelease(900002)));
  });

  it('derives every stop again from the facts the trace recorded', () => {
    const suspended = releaseVariant(base, (records) =>
      records.map((record) => (record.record_type === 'sequestration' ? ruleRecordLike(record, { value: { reduction_percent: '0', applies_to: 'SYNTHETIC suspension', suspended: true } }) : record)),
    );
    expectReproduced(priceLines([lineFacts()], {}, suspended));
    expectReproduced(priceLines([lineFacts({ agreement: { outcome: 'NO_MAPPING' } })]));
    expectReproduced(priceLines([lineFacts({ agreement: { outcome: 'RESOLUTION_FAILED' } })]));
    expectReproduced(priceLines([lineFacts({ agreement: contractAgreement({ version: { status: 'approved' } }) })]));
    expectReproduced(priceLines([lineFacts({ procedureCode: '97750' }), lineFacts({ lineNo: 2, procedureCode: 'G0283', placeOfService: '22' }), lineFacts({ lineNo: 3, placeOfService: '99' })]));
    expectReproduced(priceLines([lineFacts({ units: '0' }), lineFacts({ lineNo: 2, procedureCode: 'X' })]));
    for (const claim of [{ claimStatusCode: '2' }, { claimStatusCode: '22' }, { claimStatusCode: '19' }, { reversed: true }, { reversed: true, corrected: true }]) {
      expectReproduced(priceLines(day(), { claim }));
    }
    const unsupported = contractAgreement({ terms: { ...percentTerms(), method: 'UNSUPPORTED', parameters: {} } });
    expectReproduced(priceLines([lineFacts({ agreement: unsupported })]));
    // A line refused for its settings still has a trace that reads back.
    expectReproduced(priceLines([lineFacts()], { settings: { zip: '00011', defaultRounding: 'NEAREST' as never, placeOfServiceSettings: { '11': 'clinic' as never } } }));
  });

  it('keeps the recorded reason of a line that stopped with ENGINE_ERROR part way', () => {
    const noAssistant = releaseVariant(base, (records) => records.filter((record) => record.record_type !== 'assistant_modifier'));
    expectReproduced(priceLines(day(), {}, noAssistant));
    const noRate = releaseVariant(base, (records) =>
      records
        .filter((record) => !(record.record_type === 'mppr_rate' && keyOf(record).component === 'practice_expense'))
        .map((record) => (record.record_type === 'mppr_rate' && keyOf(record).hcpcs === '97530' ? ruleRecordLike(record, { value: { pe_reduction_percent: null } }) : record)),
    );
    expectReproduced(priceLines(day(), {}, noRate));
    const window = base.records.find((record) => record.record_type === 'dispute_window' && keyOf(record).window === 'redetermination') as RuleRecord;
    const twice = releaseVariant(base, (records) => [...records, ruleRecordLike(window, { effective_from: '2026-02-01' })]);
    expectReproduced(priceLines([lineFacts()], {}, twice));
  });

  it('finds a trace changed after the fact', () => {
    const [first] = priceLines(day());
    const trace = stored(first);
    const rvu = trace.steps.fee_schedule?.rvu;
    if (rvu) {
      rvu.work_rvu = '0.41';
    }
    const changed = recompute(trace);
    expect(changed.differences.some((item) => item.startsWith('unit work cents'))).toBe(true);
    expect(changed.differences.some((item) => item.startsWith('expected allowed cents'))).toBe(true);

    const ranked = stored(priceLines(day())[1]);
    const mppr = ranked.steps.adjustments[0];
    if (mppr?.name === 'mppr') {
      mppr.ranking = mppr.ranking.map((item) => (item.line_no === 2 ? { ...item, pe_cents: '9999' } : item));
    }
    expect(recompute(ranked).differences.some((item) => item.startsWith('ranked unit 1'))).toBe(true);

    const modifiers = stored(first);
    modifiers.line.modifiers = ['GP'];
    expect(recompute(modifiers).differences.some((item) => item.startsWith('assistant modifiers'))).toBe(true);

    const share = stored(first);
    share.line.patient_share_adjustments = [];
    expect(recompute(share).differences.some((item) => item.startsWith('sequestration patient share'))).toBe(true);

    const status = stored(first);
    status.claim.claim_status_code = '2';
    expect(recompute(status)).toMatchObject({ outcome: 'unpriced', reason: 'SECONDARY_PAYER', differences: ['outcome: the trace records priced, the recomputation gives SECONDARY_PAYER'] });

    const flags = stored(first);
    if (flags.terms) {
      flags.terms.flags.apply_mppr = false;
    }
    expect(recompute(flags).differences).toContain('adjustments recorded: the trace records 3, the recomputation gives 2');

    const rule = stored(first);
    if (rule.steps.rounding) {
      rule.steps.rounding.rule = 'TRUNCATE';
    }
    expect(recompute(rule).differences).toContain('rounding rule: the trace records TRUNCATE, the recomputation gives HALF_UP_CENT');

    const refused = stored(priceLines([lineFacts({ units: '0' })])[0]);
    refused.outcome = { result: 'priced', expected_allowed_cents: '1', expected_unrounded_cents: '1', review_flags: [] };
    expect(() => recompute(refused)).toThrow('a priced trace is missing the units');
    const input = stored(priceLines([lineFacts({ procedureCode: 'X' })])[0]);
    input.outcome = { result: 'priced', expected_allowed_cents: '1', expected_unrounded_cents: '1', review_flags: [] };
    expect(recompute(input)).toEqual({ outcome: 'unpriced', reason: 'ENGINE_ERROR', differences: ['outcome: the trace records priced, the recomputation gives ENGINE_ERROR'] });
  });

  it('holds the fee-schedule step to the terms, the settings and the rule records it was computed for', () => {
    const [first] = priceLines(day());
    const tampered = (change: (trace: PricingTrace) => void): string[] => {
      const trace = stored(first);
      change(trace);
      return recompute(trace).differences.map((item) => item.slice(0, item.indexOf(':')));
    };
    const schedule = (trace: PricingTrace) => trace.steps.fee_schedule as NonNullable<PricingTrace['steps']['fee_schedule']>;
    const terms = (trace: PricingTrace) => trace.terms?.percent_of_medicare as NonNullable<NonNullable<PricingTrace['terms']>['percent_of_medicare']>;
    expect(tampered(() => undefined)).toEqual([]);
    expect(tampered((trace) => (terms(trace).percentage = '100'))).toEqual(['fee schedule percentage against the terms']);
    expect(tampered((trace) => (terms(trace).conversion_factor = 'qualifying_apm'))).toEqual(['conversion factor against the terms', 'conversion factor record key']);
    expect(tampered((trace) => (terms(trace).year_basis = 'LOCKED:2025'))).toEqual([
      'fee schedule year basis against the terms',
      'basis year',
      'fee schedule lookup',
      'relative value record window',
      'GPCI record window',
      'conversion factor record window',
    ]);
    expect(tampered((trace) => (schedule(trace).basis_year = 2025))).toEqual(['basis year']);
    expect(tampered((trace) => (trace.settings.place_of_service_settings['11'] = 'facility'))).toEqual(['setting against the place of service']);
    expect(tampered((trace) => (trace.line.place_of_service = null))).toEqual(['setting against the place of service']);
    expect(tampered((trace) => (schedule(trace).rvu = { ...(schedule(trace).rvu as NonNullable<ReturnType<typeof schedule>['rvu']>), record: { ...(schedule(trace).rvu?.record as TraceRecordRef), key: { hcpcs: '97140', modifier: '' } } }))).toEqual([
      'relative value record key',
    ]);
    const locality = (trace: PricingTrace) => schedule(trace).locality as NonNullable<ReturnType<typeof schedule>['locality']>;
    expect(tampered((trace) => (locality(trace).record.key = { zip: '00012' }))).toEqual(['locality record key']);
    expect(tampered((trace) => (locality(trace).plus_four_required = true))).toEqual(['locality ZIP+4']);
    expect(tampered((trace) => (locality(trace).record.effective_to = '2026-01-31'))).toEqual(['locality record window']);
    expect(tampered((trace) => (schedule(trace).gpci = { ...(schedule(trace).gpci as NonNullable<ReturnType<typeof schedule>['gpci']>), record: { ...(schedule(trace).gpci?.record as TraceRecordRef), key: { carrier: '99999', locality: '02' } } }))).toEqual([
      'GPCI record key',
    ]);
    expect(tampered((trace) => ((schedule(trace).conversion_factor as NonNullable<ReturnType<typeof schedule>['conversion_factor']>).record.effective_from = '2027-01-01'))).toEqual(['conversion factor record window']);
    expect(tampered((trace) => (schedule(trace).locality = null))).toEqual(['fee schedule records']);
    expect(tampered((trace) => ((trace.terms as NonNullable<PricingTrace['terms']>).percent_of_medicare = null))).toEqual(['percent-of-Medicare terms']);
  });

  it('derives UNITS_RULE_UNKNOWN only once the units are recorded, and the new claim statuses', () => {
    const unknown = contractAgreement({ terms: percentTerms({ flags: { timed_units_rule: 'UNKNOWN' } }) });
    expectReproduced(priceLines([lineFacts({ agreement: unknown })]));
    // Refused for its units first: the trace has no units step, so its ENGINE_ERROR stands.
    expectReproduced(priceLines([lineFacts({ agreement: unknown, units: '1000' })]));
    const noLocality = releaseVariant(base, (records) => records.filter((record) => record.record_type !== 'locality_map'));
    expectReproduced(priceLines([lineFacts({ agreement: unknown })], {}, noLocality));
    for (const claimStatusCode of ['20', '21', '23', '25', '24']) {
      expectReproduced(priceLines(day(), { claim: { claimStatusCode } }));
    }
  });

  it('refuses a value that is not a trace, or a priced trace without the steps its amount needs', () => {
    expect(() => recompute({ format: 'something else' })).toThrow(TraceRecomputeError);
    const priced = () => stored(priceLines(day())[0]);

    const noSchedule = priced();
    noSchedule.steps.fee_schedule = null;
    expect(() => recompute(noSchedule)).toThrow('a fee-schedule trace with units is missing a fee-schedule value');

    const noStep = priced();
    noStep.steps.adjustments = noStep.steps.adjustments.filter((item) => item.name !== 'sequestration');
    expect(() => recompute(noStep)).toThrow('a priced trace is missing the sequestration step');

    const noRounding = priced();
    noRounding.steps.rounding = null;
    expect(() => recompute(noRounding)).toThrow('a priced trace is missing the rounding and the variance');

    const units = priced();
    units.line.units = '1.5';
    expect(() => recompute(units)).toThrow('the trace records units the engine does not price');

    const rounding = priced();
    rounding.settings.default_rounding = 'NEAREST';
    expect(() => recompute(rounding)).toThrow('the trace records a default rounding the engine does not know');

    const percent = priced();
    const mppr = percent.steps.adjustments[0];
    if (mppr?.name === 'mppr') {
      mppr.reduction_percent = null;
    }
    expect(() => recompute(percent)).toThrow('an always-therapy line records no reduction percent');
  });
});

type Edit = NonNullable<PricingTrace['steps']['ncci_ptp']>['edits'][number];

describe('recompute(trace) for the methods, edits and adjustments of phase two', () => {
  const fixed = (options: Parameters<typeof fixedTerms>[1] = {}) => contractAgreement({ terms: fixedTerms(3250n, { codes: ['97110', '97140', '97530'], ...options }) });
  const visit = contractAgreement({ terms: perVisitTerms(8800n, { codes: ['97110', '97112', '97140', '97530'], flags: { apply_sequestration: true, apply_ncci: true }, adjustment: { kind: 'CAP', capCents: 8000n } }) });
  const lesserFixed = contractAgreement({ terms: lesserOfTerms({ fixedCents: 3400n }, { codes: ['97110', '97112'], adjustment: { kind: 'PERCENT', percent: '98' } }) });
  const lesserPercent = contractAgreement({ terms: lesserOfTerms({ percentage: '125' }, { codes: ['97530'], flags: { apply_assistant_reduction: true } }) });

  it('reproduces fixed, lesser-of and per-visit amounts, the contract adjustments and the review flags', () => {
    expectReproduced(priceLines([lineFacts({ units: '2', agreement: fixed({ adjustment: { kind: 'PERCENT', percent: '92.5' } }) })]));
    expectReproduced(priceLines([lineFacts({ units: '3', agreement: fixed({ adjustment: { kind: 'CAP', capCents: 9000n } }) })]));
    expectReproduced(priceLines([lineFacts({ chargeCents: cents(3000n), agreement: lesserFixed }), lineFacts({ lineNo: 2, procedureCode: '97112', chargeCents: cents(9000n), agreement: lesserFixed })]));
    expectReproduced(priceLines([lineFacts({ procedureCode: '97530', modifiers: ['GP', 'CQ'], chargeCents: cents(2000n), agreement: lesserPercent })]));
    const visitLines = [
      lineFacts({ lineNo: 3, procedureCode: '97140', agreement: visit }),
      lineFacts({ lineNo: 1, procedureCode: '97530', agreement: visit, patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '2', amountCents: cents(500n) }] }),
      lineFacts({ lineNo: 2, procedureCode: '97110', units: '2', agreement: visit }),
    ];
    const results = priceLines(visitLines);
    expectReproduced(results);
    const again = results.map((result) => recompute(stored(result)));
    expect(again.map((item) => item.outcome === 'priced' && item.baseCents.toString())).toEqual(['8800', '0', '0']);
    expect(again.map((item) => item.outcome === 'priced' && item.reviewFlags)).toEqual([[{ flag: 'NCCI_PTP', column1LineNo: 3 }], [], []]);
    // The MUE and an edit that does not apply.
    expectReproduced(priceLines([lineFacts({ units: '8', agreement: fixed({ flags: { apply_ncci: true } }) })]));
    expectReproduced(priceLines([lineFacts({ procedureCode: '97750', agreement: contractAgreement({ terms: fixedTerms(4100n, { codes: ['97750'], flags: { apply_ncci: true } }) }) })]));
    expectReproduced(
      priceLines([
        lineFacts({ procedureCode: '97140', modifiers: ['GP', '59'], agreement: fixed({ flags: { apply_ncci: true } }) }),
        lineFacts({ lineNo: 2, procedureCode: '97530', agreement: fixed({ flags: { apply_ncci: true } }) }),
      ]),
    );
  });

  it('derives MUE_EXCEEDED from the recorded edit, before an unknown timed-units rule', () => {
    const results = priceLines([lineFacts({ units: '8', agreement: fixed({ flags: { apply_ncci: true, timed_units_rule: 'UNKNOWN' } }) })]);
    expect(recompute(stored(results[0]))).toEqual({ outcome: 'unpriced', reason: 'MUE_EXCEEDED', differences: [] });
    const lifted = stored(results[0]);
    if (lifted.steps.units !== null) {
      lifted.steps.units.mue.value = 9;
    }
    expect(recompute(lifted)).toMatchObject({ outcome: 'unpriced', reason: 'UNITS_RULE_UNKNOWN' });
  });

  it('finds a phase-two trace changed after the fact', () => {
    const tampered = (results: readonly LinePricing[], index: number, change: (trace: PricingTrace) => void): string[] => {
      const trace = stored(results[index]);
      change(trace);
      return recompute(trace).differences.map((item) => item.slice(0, item.indexOf(':')));
    };
    const units = (trace: PricingTrace) => trace.steps.units as NonNullable<PricingTrace['steps']['units']>;
    const fixedLine = priceLines([lineFacts({ units: '2', agreement: fixed({ adjustment: { kind: 'CAP', capCents: 6000n } }) })]);
    expect(tampered(fixedLine, 0, () => undefined)).toEqual([]);
    expect(tampered(fixedLine, 0, (trace) => (units(trace).unit_cents = '3251'))).toEqual(['unit cents']);
    expect(tampered(fixedLine, 0, (trace) => (units(trace).base_cents = '6501'))).toEqual(['base cents']);
    expect(tampered(fixedLine, 0, (trace) => (units(trace).units = '3'))).toEqual(['units']);
    expect(tampered(fixedLine, 0, (trace) => (units(trace).charge_cents = '1'))).toEqual(['charge of a term that does not compare it']);
    expect(tampered(fixedLine, 0, (trace) => (units(trace).mue.checked = true))).toEqual(['medically unlikely edit checked']);
    expect(tampered(fixedLine, 0, (trace) => ((trace.terms as NonNullable<PricingTrace['terms']>).contract_adjustment = { kind: 'CAP', cap_cents: '6100' }))).toEqual([
      'contract adjustment against the terms',
      'contract_adjustment after',
      'unrounded cents',
      'variance cents',
      'expected allowed cents',
      'expected unrounded cents',
    ]);
    expect(tampered(fixedLine, 0, (trace) => (trace.steps.fee_schedule = stored(priceLines([lineFacts()])[0]).steps.fee_schedule))).toEqual(['fee schedule for a fixed amount']);
    expect(tampered(fixedLine, 0, (trace) => (trace.steps.per_visit = { service_date: '2026-03-10', amount_cents: '3250', visit_line_nos: [1], carrier_line_no: 1, base_cents: '3250' }))).toEqual(['per-visit step']);
    expect(tampered(fixedLine, 0, (trace) => (trace.steps.ncci_ptp = { edits: [] }))).toEqual(['procedure-to-procedure edits']);

    const lesserLine = priceLines([lineFacts({ chargeCents: cents(3000n), agreement: lesserFixed })]);
    expect(tampered(lesserLine, 0, (trace) => (trace.line.charge_cents = '2999'))).toEqual(['charge against the line']);
    expect(tampered(lesserLine, 0, (trace) => (units(trace).schedule_cents = '1'))).toEqual(['schedule cents']);

    const visitLines = priceLines([lineFacts({ procedureCode: '97530', agreement: visit }), lineFacts({ lineNo: 2, procedureCode: '97140', agreement: visit })]);
    const perVisit = (trace: PricingTrace) => trace.steps.per_visit as NonNullable<PricingTrace['steps']['per_visit']>;
    expect(tampered(visitLines, 1, (trace) => (perVisit(trace).carrier_line_no = 2))).toEqual(['the line carrying the visit']);
    expect(tampered(visitLines, 1, (trace) => (perVisit(trace).visit_line_nos = [1]))).toEqual(['the line in its visit']);
    expect(tampered(visitLines, 0, (trace) => (perVisit(trace).service_date = '2026-03-11'))).toEqual(['the visit date']);
    expect(tampered(visitLines, 0, (trace) => (perVisit(trace).amount_cents = '8801'))).toEqual(['visit amount']);
    expect(tampered(visitLines, 0, (trace) => (units(trace).schedule_cents = '8800'))).toEqual(['units step amounts of a visit']);
    const edits = (trace: PricingTrace) => (trace.steps.ncci_ptp as NonNullable<PricingTrace['steps']['ncci_ptp']>).edits;
    expect(tampered(visitLines, 0, (trace) => ((edits(trace)[0] as Edit).bypassed = true))).toEqual(['edit with line 2 bypassed']);
    expect(tampered(visitLines, 0, (trace) => ((edits(trace)[0] as Edit).record.key = { column1: '97161', column2: '97530' }))).toEqual(['edit record key']);
    expect(tampered(visitLines, 0, (trace) => ((edits(trace)[0] as Edit).record.effective_from = '2026-04-01'))).toEqual(['edit record window']);
    expect(tampered(visitLines, 0, (trace) => trace.outcome.result === 'priced' && (trace.outcome.review_flags = []))).toEqual(['review flags']);
  });

  it('refuses a phase-two trace without the values its amount needs', () => {
    const fixedTrace = () => stored(priceLines([lineFacts({ agreement: fixed({ flags: { apply_ncci: true }, adjustment: { kind: 'PERCENT', percent: '90' } }) })])[0]);
    const noAmount = fixedTrace();
    (noAmount.terms as NonNullable<PricingTrace['terms']>).fixed_amount_cents = null;
    expect(() => recompute(noAmount)).toThrow('a FIXED_SCHEDULE trace records no amount');
    const noEdits = fixedTrace();
    noEdits.steps.ncci_ptp = null;
    expect(() => recompute(noEdits)).toThrow('a trace with apply_ncci on records no procedure-to-procedure edits');
    const noOwn = fixedTrace();
    noOwn.steps.adjustments = [];
    expect(() => recompute(noOwn)).toThrow('the trace records no contract adjustment for terms that define one');
    const noSchedule = fixedTrace();
    (noSchedule.steps.units as NonNullable<PricingTrace['steps']['units']>).schedule_cents = null;
    expect(() => recompute(noSchedule)).toThrow('the trace records no schedule amount');
    const noCharge = stored(priceLines([lineFacts({ agreement: lesserFixed })])[0]);
    (noCharge.steps.units as NonNullable<PricingTrace['steps']['units']>).charge_cents = null;
    expect(() => recompute(noCharge)).toThrow('the trace records no line charge');
    const noVisit = stored(priceLines([lineFacts({ agreement: visit })])[0]);
    noVisit.steps.per_visit = null;
    expect(() => recompute(noVisit)).toThrow('a per-visit trace records no visit');
  });

  it('keeps the recorded ENGINE_ERROR of a reduction asked of a term without a fee schedule', () => {
    expectReproduced(priceLines([lineFacts({ agreement: fixed({ flags: { apply_mppr: true } }) })]));
  });
});

describe('the inputs recompute is given', () => {
  it('are only the trace: a recomputation needs neither the release nor the agreement', () => {
    const input: PricingInput = pricingInput(release, day());
    const traces = price(input).map(stored);
    const recomputed = traces.map((trace) => recompute(trace));
    expect(recomputed.map((item) => item.outcome === 'priced' && item.expectedAllowedCents)).toEqual(price(input).map((item) => item.outcome === 'priced' && item.expectedAllowedCents));
  });
});
