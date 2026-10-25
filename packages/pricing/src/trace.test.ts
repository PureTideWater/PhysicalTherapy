import { parseRateTerms } from '@tp/contracts';
import { describe, expect, it } from 'vitest';

import { price } from './engine';
import { recompute } from './recompute';
import { indexRelease } from './release';
import { contractAgreement, lineFacts, percentTerms, practiceSettings, pricingInput, readRuleRelease, syntheticRelease } from './testing';
import { ENGINE_VERSION, type PricingTrace, parseTrace, pricingTraceSchema } from './trace';

/**
 * The trace schema across the engine versions (docs/adr/0064): a trace stored by phase-two/1 still parses, and so does
 * one of phase-two/2 carrying the two optional ZIP+4 keys; a key neither version writes is refused, as the schema is
 * strict.
 */

/**
 * A trace as phase-two/1 (the engine at 8e33cb3) stored it: 97110 at 100% of a commercial term for the ZIP 00011
 * under release 900001, written by that engine and copied here verbatim.
 */
const STORED_PHASE_TWO_1 = {
  format: 'tp-pricing-trace/2',
  engine: 'phase-two/1',
  release: { number: 900001, manifest_sha256: '6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a' },
  as_of: '2026-10-15',
  settings: { zip: '00011', default_rounding: 'HALF_UP_CENT', place_of_service_settings: { '11': 'non_facility', '22': 'facility' } },
  claim: { claim_status_code: '1', reversed: false, corrected: false, remittance_date: '2026-04-01', payer_plan_key: 'SYNTH-PLAN-1' },
  line: {
    line_no: 1,
    service_line_id: 'sl-synth-1',
    procedure_code: '97110',
    modifiers: ['GP'],
    units: '1',
    service_date: '2026-03-10',
    place_of_service: '11',
    charge_cents: '6000',
    observed_allowed_cents: '2000',
    observed_allowed_basis: 'amt_b6',
    patient_share_adjustments: [],
  },
  agreement: {
    outcome: 'CONTRACT_RATE',
    mapping_id: 'map-synth-1',
    mapping_kind: 'contract',
    contract_version_id: 'cv-synth-1',
    contract_version_status: 'signed_off',
    rate_record_id: 'rr-synth-1',
    matching_rate_record_ids: [],
    windows: { timely_filing_days: null, dispute_window_days: null, appeal_levels: [] },
  },
  terms: {
    method: 'PERCENT_OF_MEDICARE',
    percent_of_medicare: { percentage: '100', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' },
    fixed_amount_cents: null,
    lesser_of: null,
    contract_adjustment: null,
    flags: { apply_mppr: false, apply_assistant_reduction: false, apply_sequestration: false, apply_ncci: false, timed_units_rule: 'PER_CODE' },
    rounding: null,
  },
  steps: {
    fee_schedule: {
      year_basis: 'CURRENT',
      basis_year: 2026,
      lookup: 'in_force_on_service_date',
      rvu: {
        record: {
          record_type: 'pfs_rvu',
          key: { hcpcs: '97110', modifier: '' },
          effective_from: '2026-01-01',
          effective_to: '2026-12-31',
          sha256: '7cb409e0c31c832b5558f2407c62f4a09182a622a23018bb000bbe3f62795cae',
        },
        work_rvu: '0.31',
        pe_rvu_facility: '0.21',
        pe_rvu_non_facility: '0.71',
        mp_rvu: '0.11',
        facility_pe_na: false,
        non_facility_pe_na: false,
      },
      setting: 'non_facility',
      locality: {
        record: {
          record_type: 'locality_map',
          key: { zip: '00011' },
          effective_from: '2026-01-01',
          effective_to: '2026-12-31',
          sha256: '6417a160e9108266dcfcb6a83046c32df81e3c5a80c77bf2b1ffa1cc869d99f3',
        },
        carrier: '99999',
        locality: '01',
        plus_four_required: false,
      },
      gpci: {
        record: {
          record_type: 'pfs_gpci',
          key: { carrier: '99999', locality: '01' },
          effective_from: '2026-01-01',
          effective_to: '2026-12-31',
          sha256: 'bff9f3d3e27b180dd52a0ef78001ef280f6673f63d7f93a69307bf066cba13bb',
        },
        work_gpci: '1.000',
        pe_gpci: '0.950',
        mp_gpci: '0.650',
      },
      conversion_factor: {
        record: {
          record_type: 'conversion_factor',
          key: { applicability: 'non_qualifying_apm' },
          effective_from: '2026-01-01',
          effective_to: '2026-12-31',
          sha256: '1be8461edee48f78238044c2b263440fd28153a02f3f9f6f446b1fb5e694ad17',
        },
        applicability: 'non_qualifying_apm',
        value: '20.0000',
      },
      percentage: '100',
      unit_cents: { work: '620', pe: '1349', mp: '143', total: '2112' },
    },
    units: {
      units: '1',
      timed_units_rule: 'PER_CODE',
      mue: { checked: false, record: null, value: null },
      unit_cents: '2112',
      schedule_cents: '2112',
      charge_cents: null,
      base_cents: '2112',
    },
    per_visit: null,
    ncci_ptp: null,
    adjustments: [],
    patient_share_cents: '0',
    rounding: { rule: 'HALF_UP_CENT', origin: 'practice_default', unrounded_cents: '2112', rounded_cents: '2112' },
    variance_cents: '112',
    window: { source: null, record: null, length: null, unit: null, measured_from: null, from_date: null, ends_on: null, as_of: '2026-10-15', status: 'NO_WINDOW' },
  },
  outcome: { result: 'priced', expected_allowed_cents: '2112', expected_unrounded_cents: '2112', review_flags: [] },
} as const;

const plusFour = indexRelease(readRuleRelease('fixtures/synthetic/rules/release-synth-900006'));
const commercial = contractAgreement({ terms: percentTerms() });

function traceOf(release: Parameters<typeof pricingInput>[0], settings: Parameters<typeof practiceSettings>[0]): PricingTrace {
  const [line] = price(pricingInput(release, [lineFacts({ serviceLineId: 'sl-synth-1', agreement: commercial })], { settings: practiceSettings(settings) }));
  return JSON.parse(JSON.stringify(line?.trace)) as PricingTrace;
}

/** A deep copy of a stored trace as plain JSON, to change. */
const copy = (value: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

describe('the trace across engine versions', () => {
  it('is written by phase-two/2', () => {
    expect(ENGINE_VERSION).toBe('phase-two/2');
  });

  it('still parses a trace phase-two/1 stored, which recomputes, and the five-digit trace phase-two/2 writes is the same but for the engine', () => {
    expect(parseTrace(STORED_PHASE_TWO_1)).toEqual(STORED_PHASE_TWO_1);
    expect(recompute(STORED_PHASE_TWO_1)).toMatchObject({ outcome: 'priced', expectedAllowedCents: 2112n, differences: [] });
    expect(traceOf(syntheticRelease(900001), { zip: '00011' })).toEqual({ ...STORED_PHASE_TWO_1, engine: 'phase-two/2' });
  });

  it('parses a phase-two/2 trace carrying the settings’ ZIP+4 and the ZIP+4 step', () => {
    const trace = traceOf(plusFour, { zip: '00012', zipPlusFour: '5000' });
    expect(parseTrace(trace)).toEqual(trace);
    expect(trace.settings.zip_plus_four).toBe('5000');
    expect(trace.steps.fee_schedule?.locality?.plus_four).toMatchObject({ zip_plus_four: '5000', from: '5000', to: '8999', carrier: '99999', locality: '02' });
  });

  it('parses the stop of a ZIP+4 no range holds, which names the plus-four record read, and of a ZIP with no plus-four record, which names none', () => {
    const unlisted = traceOf(plusFour, { zip: '00012', zipPlusFour: '9100' });
    expect(parseTrace(unlisted)).toEqual(unlisted);
    expect(unlisted.outcome).toMatchObject({ detail: 'zip_plus_four_not_in_locality_map' });
    expect(unlisted.steps.fee_schedule?.locality?.plus_four_unlisted).toMatchObject({ record_type: 'locality_map_plus_four', key: { zip: '00012' } });
    const missing = traceOf(syntheticRelease(900001), { zip: '00012', zipPlusFour: '9100' });
    expect(parseTrace(missing)).toEqual(missing);
    expect(missing.outcome).toMatchObject({ detail: 'no_locality_plus_four' });
    expect(Object.keys(missing.steps.fee_schedule?.locality ?? {})).toEqual(['record', 'carrier', 'locality', 'plus_four_required']);
  });

  it('refuses a key neither version writes, a ZIP+4 that is not text, and a ZIP+4 step whose codes are not four digits', () => {
    const stored = copy(STORED_PHASE_TWO_1);
    (stored.settings as Record<string, unknown>).zip_plus_five = '1234';
    expect(() => parseTrace(stored)).toThrow(/zip_plus_five/);

    const numeric = copy(STORED_PHASE_TWO_1);
    (numeric.settings as Record<string, unknown>).zip_plus_four = 1234;
    expect(() => parseTrace(numeric)).toThrow(/zip_plus_four/);

    const split = copy(traceOf(plusFour, { zip: '00012', zipPlusFour: '5000' }));
    const locality = ((split.steps as Record<string, Record<string, unknown>>).fee_schedule as Record<string, Record<string, unknown>>).locality as Record<string, Record<string, unknown>>;
    (locality.plus_four as Record<string, unknown>).rural_indicator = 'R';
    expect(() => parseTrace(split)).toThrow(/rural_indicator/);

    const missing = copy(traceOf(plusFour, { zip: '00012', zipPlusFour: '5000' }));
    const missingLocality = ((missing.steps as Record<string, Record<string, unknown>>).fee_schedule as Record<string, Record<string, unknown>>).locality as Record<string, Record<string, unknown>>;
    delete (missingLocality.plus_four as Record<string, unknown>).to;
    expect(() => parseTrace(missing)).toThrow(/to/);

    for (const [field, value] of [['zip_plus_four', '50000'], ['zip_plus_four', 'undefined'], ['from', '500'], ['to', 'zzzz']] as const) {
      const codes = copy(traceOf(plusFour, { zip: '00012', zipPlusFour: '5000' }));
      const codesLocality = ((codes.steps as Record<string, Record<string, unknown>>).fee_schedule as Record<string, Record<string, unknown>>).locality as Record<string, Record<string, unknown>>;
      (codesLocality.plus_four as Record<string, unknown>)[field] = value;
      expect(() => parseTrace(codes), `${field} ${value}`).toThrow(/must be four digits/);
    }
    // The settings keep what was given, verbatim, so an invalid_settings stop's trace still parses.
    const given = copy(STORED_PHASE_TWO_1);
    (given.settings as Record<string, unknown>).zip_plus_four = '50000';
    expect(parseTrace(given).settings.zip_plus_four).toBe('50000');
  });
});

/** A stored trace with one value replaced, at a path of keys. */
function withValue(path: readonly string[], value: unknown): Record<string, unknown> {
  const changed = copy(STORED_PHASE_TWO_1);
  let at: Record<string, unknown> = changed;
  for (const key of path.slice(0, -1)) {
    at = at[key] as Record<string, unknown>;
  }
  at[path.at(-1) as string] = value;
  return changed;
}

describe('the trace schema’s text forms', () => {
  it.each<[string, readonly string[], readonly string[], readonly string[], RegExp]>([
    ['decimal text', ['steps', 'units', 'unit_cents'], ['2112', '0', '-1.5', '0.25', '1234567.890123'], ['x2112', '2112x', '-x1', '1.', '.5', '1.5.5', '+1', ''], /must be decimal text/],
    ['whole cents', ['outcome', 'expected_allowed_cents'], ['2112', '0', '-5', '10'], ['x2112', '2112x', '02112', '-0', '00', '1.0', '-x1', ''], /must be whole cents as integer text/],
    ['a date', ['steps', 'window', 'as_of'], ['2026-10-15', '0099-01-01'], ['x2026-10-15', '2026-10-15x', '12026-10-15', '2026-10-150', '2026-1-15', ''], /must be a date written YYYY-MM-DD/],
    ['a SHA-256', ['steps', 'fee_schedule', 'rvu', 'record', 'sha256'], ['7cb409e0c31c832b5558f2407c62f4a09182a622a23018bb000bbe3f62795cae', '0'.repeat(64)], [`x${'0'.repeat(64)}`, `${'0'.repeat(64)}x`, `${'0'.repeat(64)}0`, 'A'.repeat(64), '0'.repeat(63)], /must be a SHA-256 in hex/],
  ])('holds %s to its whole form, and names the form it refuses', (_label, path, accepted, refused, message) => {
    for (const value of accepted) {
      expect(parseTrace(withValue(path, value)), value).toMatchObject({});
    }
    for (const value of refused) {
      expect(() => parseTrace(withValue(path, value)), value).toThrow(message);
    }
  });

  it('accepts every step a stop can name, and no other', () => {
    const steps = ['input', 'agreement', 'method', 'fee_schedule', 'units', 'mppr', 'assistant_reduction', 'sequestration', 'claim', 'rounding', 'window'];
    for (const step of steps) {
      const stopped = withValue(['outcome'], { result: 'unpriced', reason: 'ENGINE_ERROR', detail: 'unexpected', step });
      expect(pricingTraceSchema.safeParse(stopped).success, step).toBe(true);
    }
    for (const step of ['', 'variance', 'Rounding']) {
      expect(pricingTraceSchema.safeParse(withValue(['outcome'], { result: 'unpriced', reason: 'ENGINE_ERROR', detail: 'unexpected', step })).success, step).toBe(false);
    }
  });

  it('parses the terms of a contract-named locality, which the engine refuses to price but records', () => {
    const locality = { kind: 'NAMED', carrier: '99999', locality: '01' };
    const named = parseRateTerms({ scope: { codes: ['97110'] }, method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '100', year_basis: 'CURRENT', locality_basis: locality, conversion_factor: 'non_qualifying_apm' } }, true);
    const [line] = price(pricingInput(syntheticRelease(900001), [lineFacts({ agreement: contractAgreement({ terms: named }) })]));
    const trace = JSON.parse(JSON.stringify(line?.trace)) as PricingTrace;
    expect(trace.outcome).toEqual({ result: 'unpriced', reason: 'ENGINE_ERROR', detail: 'locality_basis_not_in_phase_one', step: 'method' });
    expect(parseTrace(trace).terms?.percent_of_medicare?.locality_basis).toEqual(locality);
    expect(recompute(trace)).toEqual({ outcome: 'unpriced', reason: 'ENGINE_ERROR', differences: [] });
    // A named locality says which: without its carrier or locality, or with a kind of neither form, it is not a trace.
    for (const basis of [{ kind: 'NAMED', carrier: '99999' }, { kind: 'NAMED', locality: '01' }, { kind: '', carrier: '99999', locality: '01' }, { kind: 'PRACTICE', carrier: '99999', locality: '01' }]) {
      const changed = copy(trace);
      ((changed.terms as Record<string, unknown>).percent_of_medicare as Record<string, unknown>).locality_basis = basis;
      expect(pricingTraceSchema.safeParse(changed).success, JSON.stringify(basis)).toBe(false);
    }
  });
});
