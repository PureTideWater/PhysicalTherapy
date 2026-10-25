import type { Cents } from '@tp/money';
import type { RuleRecord } from '@tp/rules';
import { describe, expect, it } from 'vitest';

import { price } from './engine';
import type { UnpricedReason } from './reasons';
import { TraceRecomputeError, recompute } from './recompute';
import { indexRelease } from './release';
import {
  SYNTHETIC_RELEASES,
  contractAgreement,
  fixedTerms,
  keyOf,
  lesserOfTerms,
  lineFacts,
  mappingRecord,
  perVisitTerms,
  percentTerms,
  pricingInput,
  readRuleRelease,
  releaseVariant,
  ruleRecordLike,
  syntheticRelease,
  versionRecord,
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

  it('reproduces a ZIP+4 line from its trace, and finds the ZIP+4 step changed after the fact (PRC-21; docs/adr/0064)', () => {
    const plusFour = indexRelease(readRuleRelease('fixtures/synthetic/rules/release-synth-900006'));
    const settings = (zip: string, zipPlusFour?: string) => ({ settings: { zip, ...(zipPlusFour === undefined ? {} : { zipPlusFour }), defaultRounding: null, placeOfServiceSettings: { '11': 'non_facility' as const } } });
    // (a) locality 02, (b) locality 01, (f) a ZIP+4 the ZIP does not need, the stops of (c) and (d), each under every method's lines.
    for (const [zip, zipPlusFour] of [['00012', '5000'], ['00012', '0001'], ['00012', '8999'], ['00011', '1234'], ['00012', undefined], ['00012', '9100']] as const) {
      expectReproduced(priceLines(day(), settings(zip, zipPlusFour), plusFour));
      expectReproduced(priceLines([lineFacts()], settings(zip, zipPlusFour), plusFour));
    }
    // The stop of (e): no ZIP+4 record in force (release 900001).
    expectReproduced(priceLines(day(), settings('00012', '0001')));
    const [first] = priceLines(day(), settings('00012', '5000'), plusFour);
    expect(first?.outcome).toBe('priced');
    const tampered = (change: (trace: PricingTrace) => void): string[] => {
      const trace = stored(first);
      change(trace);
      return recompute(trace).differences.map((item) => item.slice(0, item.indexOf(':')));
    };
    const locality = (trace: PricingTrace) => trace.steps.fee_schedule?.locality as NonNullable<NonNullable<PricingTrace['steps']['fee_schedule']>['locality']>;
    const split = (trace: PricingTrace) => locality(trace).plus_four as NonNullable<ReturnType<typeof locality>['plus_four']>;
    expect(tampered(() => undefined)).toEqual([]);
    expect(tampered((trace) => (trace.settings.zip_plus_four = '5001'))).toEqual(['ZIP+4 against the settings']);
    expect(tampered((trace) => delete trace.settings.zip_plus_four)).toEqual(['ZIP+4 against the settings']);
    expect(tampered((trace) => (split(trace).from = '5001'))).toEqual(['ZIP+4 in its range']);
    expect(tampered((trace) => (split(trace).to = '4999'))).toEqual(['ZIP+4 in its range']);
    expect(tampered((trace) => (split(trace).record.key = { zip: '00011' }))).toEqual(['ZIP+4 record key']);
    expect(tampered((trace) => (split(trace).locality = '01'))).toEqual(['GPCI record key']);
    expect(tampered((trace) => (split(trace).record.effective_to = '2026-01-31'))).toEqual(['ZIP+4 record window']);
    expect(tampered((trace) => (split(trace).record.effective_from = '2026-03-11'))).toEqual(['ZIP+4 record window']);
    // Without the ZIP+4 step a flagged ZIP's line has no locality, and the GPCI no longer follows from the ZIP5 record.
    expect(tampered((trace) => delete locality(trace).plus_four)).toEqual(['locality ZIP+4', 'GPCI record key']);
    expect(tampered((trace) => (locality(trace).plus_four_required = false))).toEqual(['locality ZIP+4']);
    // What each check says, in full.
    const said = (change: (trace: PricingTrace) => void): string[] => {
      const trace = stored(first);
      change(trace);
      return [...recompute(trace).differences];
    };
    expect(said((trace) => delete locality(trace).plus_four)).toContain('locality ZIP+4: the trace records decided by the ZIP+4, the recomputation gives required');
    expect(said((trace) => delete trace.settings.zip_plus_four)).toEqual(['ZIP+4 against the settings: the trace records (none), the recomputation gives 5000']);
    expect(said((trace) => (split(trace).to = '4999'))).toEqual(['ZIP+4 in its range: the trace records inside, the recomputation gives outside']);
    expect(said((trace) => (split(trace).record.effective_to = '2026-01-31'))).toEqual(['ZIP+4 record window: the trace records covers the service date, the recomputation gives does not']);
    expect(said((trace) => (locality(trace).plus_four_unlisted = split(trace).record))).toEqual(['ZIP+4 range not listed: the trace records none recorded, the recomputation gives recorded on a priced line']);
    expect(said((trace) => (locality(trace).record.effective_to = '2026-01-31'))).toEqual(['locality record window: the trace records covers the service date, the recomputation gives does not']);
    // Only the plus-four record decides, and a priced line never records a ZIP+4 file without its range.
    expect(tampered((trace) => (split(trace).record.record_type = 'locality_map'))).toEqual(['ZIP+4 record type']);
    expect(tampered((trace) => (locality(trace).plus_four_unlisted = split(trace).record))).toEqual(['ZIP+4 range not listed']);
    expect(tampered((trace) => (trace.settings.zip_plus_four = '50000'))).toEqual(['ZIP+4 against the settings']);
    // A ZIP+4 step the engine never writes is not a trace at all: text that is not four digits, whatever sorts inside
    // the range ('undefined' and '50000' both fall between '5000' and '8999' as text).
    const malformed = (change: (trace: PricingTrace) => void) => () => {
      const trace = stored(first);
      change(trace);
      return recompute(trace);
    };
    expect(
      malformed((trace) => {
        delete trace.settings.zip_plus_four;
        split(trace).zip_plus_four = 'undefined';
        split(trace).to = 'zzzz';
      }),
    ).toThrow(new TraceRecomputeError('the value is not a pricing trace'));
    expect(
      malformed((trace) => {
        trace.settings.zip_plus_four = '50000';
        split(trace).zip_plus_four = '50000';
      }),
    ).toThrow(TraceRecomputeError);
    for (const field of ['from', 'to'] as const) {
      expect(malformed((trace) => (split(trace)[field] = `${split(trace)[field]}0`))).toThrow(TraceRecomputeError);
    }
    // A ZIP+4 step on a ZIP that does not need one.
    const [unflagged] = priceLines(day(), settings('00011', '1234'), plusFour);
    const added = stored(unflagged);
    locality(added).plus_four = split(stored(first));
    expect(recompute(added).differences.map((item) => item.slice(0, item.indexOf(':')))).toEqual(['locality ZIP+4', 'ZIP+4 record key', 'ZIP+4 against the settings', 'GPCI record key']);
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

describe('recompute(trace): the stops it derives, the checks it names, and the ranking it sorts again', () => {
  const fixed = (options: Parameters<typeof fixedTerms>[1] = {}) => contractAgreement({ terms: fixedTerms(3250n, { codes: ['97110', '97140', '97530'], ...options }) });
  const visit = contractAgreement({ terms: perVisitTerms(8800n, { codes: ['97110', '97140', '97530'] }) });
  /** Every difference a changed trace gives, in full. */
  const said = (result: LinePricing | undefined, change: (trace: PricingTrace) => void): string[] => {
    const trace = stored(result);
    change(trace);
    return [...recompute(trace).differences];
  };
  /** The labels of the differences a changed trace gives. */
  const labels = (result: LinePricing | undefined, change: (trace: PricingTrace) => void): string[] => said(result, change).map((item) => item.slice(0, item.indexOf(':')));
  const schedule = (trace: PricingTrace) => trace.steps.fee_schedule as NonNullable<PricingTrace['steps']['fee_schedule']>;
  const units = (trace: PricingTrace) => trace.steps.units as NonNullable<PricingTrace['steps']['units']>;
  const priced = (): PricingTrace['outcome'] => ({ result: 'priced', expected_allowed_cents: '1', expected_unrounded_cents: '1', review_flags: [] });

  it('names its own error', () => {
    expect(new TraceRecomputeError('a message').name).toBe('TraceRecomputeError');
    let caught: unknown;
    try {
      recompute({ format: 'something else' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TraceRecomputeError);
    expect(caught).toMatchObject({ name: 'TraceRecomputeError', message: 'the value is not a pricing trace' });
    expect(String(caught)).toBe('TraceRecomputeError: the value is not a pricing trace');
  });

  it('derives each stop from the facts the trace records, whatever outcome it says', () => {
    const version = versionRecord();
    const mapping = mappingRecord({ kind: 'contract', contractVersionId: version.id });
    const unsupported = contractAgreement({ terms: { ...percentTerms(), method: 'UNSUPPORTED', parameters: {} } });
    const stops: readonly [Partial<LineFacts>, UnpricedReason][] = [
      [{ agreement: { outcome: 'NO_MAPPING' } }, 'NO_MAPPING'],
      [{ agreement: { outcome: 'NO_AGREEMENT', mapping: mappingRecord({ kind: 'no_agreement' }) } }, 'NO_AGREEMENT'],
      [{ agreement: { outcome: 'DATE_OUTSIDE_VERSIONS', mapping } }, 'DATE_OUTSIDE_VERSIONS'],
      [{ agreement: { outcome: 'NO_RATE_FOR_CODE', mapping, version } }, 'NO_RATE_FOR_CODE'],
      [{ agreement: { outcome: 'AMBIGUOUS_RATE', mapping, version, rateRecordIds: ['rr-a', 'rr-b'] } }, 'AMBIGUOUS_RATE'],
      [{ agreement: { outcome: 'RESOLUTION_FAILED' } }, 'ENGINE_ERROR'],
      [{ agreement: unsupported }, 'UNSUPPORTED_METHOD'],
      // No relative value for the code, and none for a facility setting.
      [{ procedureCode: '97750' }, 'NO_PFS_VALUE'],
      [{ procedureCode: 'G0283', placeOfService: '22' }, 'NO_PFS_VALUE'],
    ];
    for (const [facts, reason] of stops) {
      const [line] = priceLines([lineFacts(facts)]);
      expect(line?.outcome === 'unpriced' && line.reason, reason).toBe(reason);
      const claimed = stored(line);
      claimed.outcome = priced();
      expect(recompute(claimed), reason).toEqual({ outcome: 'unpriced', reason, differences: [`outcome: the trace records priced, the recomputation gives ${reason}`] });
      const other = stored(line);
      other.outcome = { result: 'unpriced', reason: 'SECONDARY_PAYER', detail: null, step: 'claim' };
      expect(recompute(other), reason).toEqual({ outcome: 'unpriced', reason, differences: [`outcome: the trace records SECONDARY_PAYER, the recomputation gives ${reason}`] });
    }
  });

  it('reads a practice-expense value as missing only for the setting the trace records', () => {
    // A place of service with no setting stops the line once its relative value is recorded: which value would be
    // missing is unknown, so the recorded ENGINE_ERROR stands whatever the two flags say.
    const [unmapped] = priceLines([lineFacts({ placeOfService: '02' })]);
    expect(unmapped?.outcome === 'unpriced' && unmapped.detail).toBe('place_of_service_unmapped');
    for (const [facility, nonFacility] of [[true, true], [false, true], [true, false]] as const) {
      const trace = stored(unmapped);
      const rvu = schedule(trace).rvu as NonNullable<ReturnType<typeof schedule>['rvu']>;
      rvu.facility_pe_na = facility;
      rvu.non_facility_pe_na = nonFacility;
      expect(recompute(trace), `${String(facility)} ${String(nonFacility)}`).toEqual({ outcome: 'unpriced', reason: 'ENGINE_ERROR', differences: [] });
    }
    // At a non-facility place of service, only the non-facility value.
    const [office] = priceLines([lineFacts({ procedureCode: 'G0283', placeOfService: '11' })]);
    expect(office?.outcome).toBe('priced');
    const notAvailable = stored(office);
    (schedule(notAvailable).rvu as NonNullable<ReturnType<typeof schedule>['rvu']>).non_facility_pe_na = true;
    expect(recompute(notAvailable)).toEqual({ outcome: 'unpriced', reason: 'NO_PFS_VALUE', differences: ['outcome: the trace records priced, the recomputation gives NO_PFS_VALUE'] });
    expect(said(office, (trace) => ((schedule(trace).rvu as NonNullable<ReturnType<typeof schedule>['rvu']>).facility_pe_na = true))).toEqual([]);
  });

  it('has nothing to recompute in a trace with no terms, whatever steps it carries', () => {
    const [approved] = priceLines([lineFacts({ agreement: contractAgreement({ version: { status: 'approved' } }) })]);
    const trace = stored(approved);
    expect(trace.terms).toBeNull();
    trace.steps.units = stored(priceLines([lineFacts()])[0]).steps.units;
    expect(recompute(trace)).toEqual({ outcome: 'unpriced', reason: 'ENGINE_ERROR', differences: [] });
  });

  it('takes the medically unlikely edit only with apply_ncci on', () => {
    const [line] = priceLines([lineFacts({ agreement: fixed() })]);
    const trace = stored(line);
    units(trace).mue.value = 0;
    expect(recompute(trace)).toMatchObject({ outcome: 'priced', expectedAllowedCents: 3250n, differences: [] });
  });

  it('names each adjustment’s amount before and after it', () => {
    const [first] = priceLines(day());
    const adjustment = (trace: PricingTrace, name: string) => trace.steps.adjustments.find((item) => item.name === name) as NonNullable<PricingTrace['steps']['adjustments'][number]>;
    for (const name of ['mppr', 'assistant_reduction', 'sequestration']) {
      expect(labels(first, (trace) => (adjustment(trace, name).before_cents = '1'))).toEqual([`${name} before`]);
      expect(labels(first, (trace) => (adjustment(trace, name).after_cents = '1'))).toEqual([`${name} after`]);
    }
    const [capped] = priceLines([lineFacts({ units: '2', agreement: fixed({ adjustment: { kind: 'CAP', capCents: 6000n } }) })]);
    expect(said(capped, (trace) => (adjustment(trace, 'contract_adjustment').before_cents = '1'))).toEqual(['contract_adjustment before: the trace records 1, the recomputation gives 6500']);
    expect(said(capped, (trace) => (adjustment(trace, 'contract_adjustment').after_cents = '1'))).toEqual(['contract_adjustment after: the trace records 1, the recomputation gives 6000']);
  });

  it('compares nothing priced on a trace that records a stop after its amount, and refuses a priced one without its variance', () => {
    const [line] = priceLines(day());
    const stopped = stored(line);
    stopped.outcome = { result: 'unpriced', reason: 'ENGINE_ERROR', detail: 'unexpected', step: 'window' };
    expect(recompute(stopped)).toEqual({ outcome: 'unpriced', reason: 'ENGINE_ERROR', differences: [] });
    const noVariance = stored(line);
    noVariance.steps.variance_cents = null;
    expect(() => recompute(noVariance)).toThrow(new TraceRecomputeError('a priced trace is missing the rounding and the variance'));
    expect(() => recompute(noVariance)).toThrow(/^a priced trace is missing the rounding and the variance$/);
  });

  it('reproduces two review flags on one line, in their order', () => {
    const edited = fixed({ flags: { apply_ncci: true } });
    const results = priceLines([
      lineFacts({ lineNo: 1, procedureCode: '97530', agreement: edited }),
      lineFacts({ lineNo: 2, procedureCode: '97140', agreement: edited }),
      lineFacts({ lineNo: 3, procedureCode: '97140', agreement: edited }),
    ]);
    expectReproduced(results);
    const again = recompute(stored(results[0]));
    expect(again.outcome === 'priced' && again.reviewFlags).toEqual([
      { flag: 'NCCI_PTP', column1LineNo: 2 },
      { flag: 'NCCI_PTP', column1LineNo: 3 },
    ]);
    expect(said(results[0], (trace) => trace.outcome.result === 'priced' && (trace.outcome.review_flags = trace.outcome.review_flags.slice(1)))).toEqual([
      'review flags: the trace records NCCI_PTP 3, the recomputation gives NCCI_PTP 2, NCCI_PTP 3',
    ]);
  });

  it('refuses a fee-schedule trace missing any one value its amount needs', () => {
    const [line] = priceLines([lineFacts({ agreement: contractAgreement() })]);
    for (const value of ['gpci', 'conversion_factor', 'unit_cents'] as const) {
      const trace = stored(line);
      schedule(trace)[value] = null;
      expect(() => recompute(trace), value).toThrow(new TraceRecomputeError('a fee-schedule trace with units is missing a fee-schedule value'));
      expect(() => recompute(trace), value).toThrow(/^a fee-schedule trace with units is missing a fee-schedule value$/);
    }
  });

  it('names each part of the unit amount it finds changed', () => {
    const [line] = priceLines([lineFacts({ agreement: contractAgreement() })]);
    const unitCents = (trace: PricingTrace) => schedule(trace).unit_cents as NonNullable<ReturnType<typeof schedule>['unit_cents']>;
    expect(said(line, (trace) => (unitCents(trace).work = '621'))).toEqual(['unit work cents: the trace records 621, the recomputation gives 620']);
    expect(said(line, (trace) => (unitCents(trace).pe = '1350'))).toEqual(['unit practice-expense cents: the trace records 1350, the recomputation gives 1349']);
    expect(said(line, (trace) => (unitCents(trace).mp = '144'))).toEqual(['unit malpractice cents: the trace records 144, the recomputation gives 143']);
    expect(said(line, (trace) => (unitCents(trace).total = '2113'))).toEqual(['unit total cents: the trace records 2113, the recomputation gives 2112']);
  });

  it('says what it found in every check of the steps', () => {
    const [fixedLine] = priceLines([lineFacts({ units: '2', agreement: fixed() })]);
    const [percentLine] = priceLines([lineFacts({ agreement: contractAgreement() })]);
    const visitLines = priceLines([lineFacts({ procedureCode: '97530', agreement: visit }), lineFacts({ lineNo: 2, procedureCode: '97140', agreement: visit })]);
    const perVisit = (trace: PricingTrace) => trace.steps.per_visit as NonNullable<PricingTrace['steps']['per_visit']>;
    expect(said(fixedLine, (trace) => (trace.steps.fee_schedule = stored(percentLine).steps.fee_schedule))).toEqual(['fee schedule for a fixed amount: the trace records none, the recomputation gives recorded']);
    expect(said(fixedLine, (trace) => (trace.steps.per_visit = { service_date: '2026-03-10', amount_cents: '3250', visit_line_nos: [1], carrier_line_no: 1, base_cents: '6500' }))).toEqual([
      'per-visit step: the trace records none, the recomputation gives recorded',
    ]);
    expect(said(fixedLine, (trace) => (units(trace).charge_cents = '6000'))).toEqual(['charge of a term that does not compare it: the trace records none, the recomputation gives recorded']);
    expect(said(fixedLine, (trace) => (trace.steps.ncci_ptp = { edits: [] }))).toEqual(['procedure-to-procedure edits: the trace records not checked, the recomputation gives checked']);
    expect(said(visitLines[1], (trace) => (perVisit(trace).visit_line_nos = [1]))).toEqual(['the line in its visit: the trace records included, the recomputation gives missing']);
    expect(said(visitLines[0], (trace) => (units(trace).base_cents = '8800'))).toEqual(['units step amounts of a visit: the trace records none, the recomputation gives recorded']);
    expect(said(visitLines[0], (trace) => (perVisit(trace).base_cents = '8801'))).toEqual(['base cents: the trace records 8801, the recomputation gives 8800']);
    expect(said(visitLines[1], (trace) => (perVisit(trace).base_cents = '1'))).toEqual(['base cents: the trace records 1, the recomputation gives 0']);
    expect(said(percentLine, (trace) => ((trace.terms as NonNullable<PricingTrace['terms']>).percent_of_medicare = null))).toEqual([
      'percent-of-Medicare terms: the trace records missing, the recomputation gives present',
    ]);
    expect(said(percentLine, (trace) => (schedule(trace).locality = null))).toEqual(['fee schedule records: the trace records missing, the recomputation gives present']);
    expect(said(percentLine, (trace) => ((schedule(trace).rvu as NonNullable<ReturnType<typeof schedule>['rvu']>).record.effective_to = '2026-01-31'))).toEqual([
      'relative value record window: the trace records covers the basis, the recomputation gives does not',
    ]);
    const edits = priceLines([
      lineFacts({ lineNo: 1, procedureCode: '97530', agreement: fixed({ flags: { apply_ncci: true } }) }),
      lineFacts({ lineNo: 2, procedureCode: '97140', agreement: fixed({ flags: { apply_ncci: true } }) }),
    ]);
    const edit = (trace: PricingTrace) => (trace.steps.ncci_ptp as NonNullable<PricingTrace['steps']['ncci_ptp']>).edits[0] as Edit;
    expect(said(edits[0], (trace) => (edit(trace).record.effective_to = '2026-03-09'))).toEqual(['edit record window: the trace records covers the service date, the recomputation gives does not']);
  });

  it('refuses a trace whose base the units step does not record', () => {
    const [line] = priceLines([lineFacts({ agreement: fixed() })]);
    const trace = stored(line);
    units(trace).base_cents = null;
    expect(() => recompute(trace)).toThrow(new TraceRecomputeError('the trace records no base'));
    expect(() => recompute(trace)).toThrow(/^the trace records no base$/);
  });

  it('holds each rule record to the service date from its first day, and to the date itself, not its year, when the basis is current', () => {
    // Every SYNTHETIC record of 2026 starts on 2026-01-01.
    expectReproduced(priceLines(day().map((line) => ({ ...line, serviceDate: '2026-01-01' }))));
    expectReproduced(priceLines([lineFacts({ serviceDate: '2026-01-01', agreement: contractAgreement() })]));
    expectReproduced(priceLines([lineFacts({ serviceDate: '2026-12-31', agreement: contractAgreement() })]));
    const [line] = priceLines([lineFacts({ agreement: contractAgreement() })]);
    expect(labels(line, (trace) => ((schedule(trace).rvu as NonNullable<ReturnType<typeof schedule>['rvu']>).record.effective_to = '2026-03-09'))).toEqual(['relative value record window']);
    expect(labels(line, (trace) => ((schedule(trace).gpci as NonNullable<ReturnType<typeof schedule>['gpci']>).record.effective_from = '2026-03-11'))).toEqual(['GPCI record window']);
  });

  it('reads the setting of a line with no place of service as none, whatever key the settings hold', () => {
    const [line] = priceLines([lineFacts({ agreement: contractAgreement() })]);
    expect(
      said(line, (trace) => {
        trace.line.place_of_service = null;
        trace.settings.place_of_service_settings.null = 'non_facility';
      }),
    ).toEqual(['setting against the place of service: the trace records undefined, the recomputation gives non_facility']);
  });

  it('locks the basis year only for LOCKED and four digits, the whole text, as the engine does', () => {
    for (const yearBasis of ['LOCKED:2025X', 'XLOCKED:2025', 'LOCKED:202', 'LOCKED:20250']) {
      const agreement = contractAgreement({ terms: percentTerms({ yearBasis: yearBasis as never, codes: ['97110'] }) });
      const results = priceLines([lineFacts({ agreement })], {}, syntheticRelease(900002));
      expect(results[0]?.trace.steps.fee_schedule, yearBasis).toMatchObject({ year_basis: yearBasis, basis_year: 2026, lookup: 'in_force_on_service_date' });
      expectReproduced(results);
    }
  });

  it('sorts the recorded ranking again itself, highest practice-expense part first, then the lower line, then the earlier unit', () => {
    // Line 1's trace records the day's first unit (97530, line 3) and its own two; recorded in any order, it reproduces.
    const [first] = priceLines(day());
    const mppr = (trace: PricingTrace) => trace.steps.adjustments.find((item) => item.name === 'mppr') as Extract<PricingTrace['steps']['adjustments'][number], { name: 'mppr' }>;
    expect(mppr(stored(first)).ranking.map((item) => [item.line_no, item.unit])).toEqual([
      [3, 1],
      [1, 1],
      [1, 2],
    ]);
    for (const order of [
      [2, 1, 0],
      [1, 0, 2],
      [1, 2, 0],
      [0, 2, 1],
    ]) {
      expect(
        said(first, (trace) => {
          const ranking = mppr(trace).ranking;
          mppr(trace).ranking = order.map((index) => ranking[index] as (typeof ranking)[number]);
        }),
        order.join(' '),
      ).toEqual([]);
    }
    // Two lines of one code tie on the practice-expense part: the lower line is the day's first.
    const tied = contractAgreement({ terms: percentTerms({ codes: ['97110'], flags: { apply_mppr: true } }) });
    const pair = priceLines([lineFacts({ lineNo: 1, agreement: tied }), lineFacts({ lineNo: 2, agreement: tied })]);
    expectReproduced(pair);
    expect(mppr(stored(pair[1])).ranking.map((item) => [item.line_no, item.unit])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(said(pair[1], (trace) => mppr(trace).ranking.reverse())).toEqual([]);
    expect(said(pair[0], (trace) => mppr(trace).ranking.reverse())).toEqual([]);
    // One line's own units are reported in unit order, whatever order the trace lists them in.
    const [two] = priceLines([lineFacts({ units: '2', agreement: tied })]);
    expect(
      said(two, (trace) => {
        mppr(trace).ranking = mppr(trace)
          .ranking.map((item) => ({ ...item, pe_cents: '9999' }))
          .reverse();
      }),
    ).toEqual([
      'ranked unit 1 practice-expense cents: the trace records 9999, the recomputation gives 1349',
      'ranked unit 2 practice-expense cents: the trace records 9999, the recomputation gives 1349',
    ]);
    expect(said(two, (trace) => (mppr(trace).ranking = mppr(trace).ranking.slice(1)))[0]).toBe('ranked units of the line: the trace records 2, the recomputation gives 1');
  });

  it('reproduces a line with both assistant modifiers, in either order on the line', () => {
    const assisted = contractAgreement({ terms: percentTerms({ flags: { apply_assistant_reduction: true } }) });
    for (const modifiers of [
      ['GP', 'CO', 'CQ'],
      ['CQ', 'GP', 'CO'],
    ]) {
      const results = priceLines([lineFacts({ modifiers, agreement: assisted })]);
      expect(results[0]?.trace.steps.adjustments[0], modifiers.join(' ')).toMatchObject({ name: 'assistant_reduction', modifiers_present: ['CQ', 'CO'] });
      expectReproduced(results);
    }
    const [line] = priceLines([lineFacts({ modifiers: ['GP', 'CO', 'CQ'], agreement: assisted })]);
    expect(said(line, (trace) => (trace.line.modifiers = ['GP', 'CO']))).toEqual(['assistant modifiers: the trace records CO CQ, the recomputation gives CO']);
  });

  it('takes nothing while sequestration is suspended, whatever percentage the record keeps', () => {
    const suspended = releaseVariant(base, (records) =>
      records.map((record) => (record.record_type === 'sequestration' ? ruleRecordLike(record, { value: { reduction_percent: '2', applies_to: 'SYNTHETIC suspension at 2%', suspended: true } }) : record)),
    );
    const results = priceLines(day(), {}, suspended);
    expectReproduced(results);
    const sequestration = results[0]?.trace.steps.adjustments.find((item) => item.name === 'sequestration');
    expect(sequestration).toMatchObject({ suspended: true, reduction_percent: '2', cut_cents: '0' });
  });
});
