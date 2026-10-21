import { describe, expect, it } from 'vitest';

import { price } from './engine';
import { recompute } from './recompute';
import { indexRelease } from './release';
import { contractAgreement, lineFacts, percentTerms, practiceSettings, pricingInput, readRuleRelease, syntheticRelease } from './testing';
import { ENGINE_VERSION, type PricingTrace, parseTrace } from './trace';

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

  it('refuses a key neither version writes, and a ZIP+4 that is not text', () => {
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
  });
});
