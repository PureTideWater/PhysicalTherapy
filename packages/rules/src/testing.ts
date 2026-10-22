import type { RuleRecord, RuleRecordType, RuleSource } from './schema';

/**
 * Test helpers: one valid record of every type, with SYNTHETIC invented values. Never content.
 */

export const EXAMPLE_SOURCE: RuleSource = {
  title: 'SYNTHETIC example source for tests',
  url: null,
  path: 'fixtures/synthetic/cms/synthetic-rules.md',
  retrieved: '2026-10-15',
  sha256: '0'.repeat(64),
  method: 'hand_typed',
  transcribed_by: 'test author',
  transcribed_on: '2026-10-15',
  locator: 'line 1',
  synthetic: true,
};

const BODIES: { [T in RuleRecordType]: Pick<Extract<RuleRecord, { record_type: T }>, 'key' | 'value'> } = {
  pfs_rvu: {
    key: { hcpcs: '97110', modifier: '' },
    value: {
      status: 'A',
      work_rvu: '0.31',
      pe_rvu_non_facility: '0.71',
      pe_rvu_facility: '0.21',
      mp_rvu: '0.11',
      non_facility_pe_na: false,
      facility_pe_na: false,
      pctc_indicator: '0',
      global_days: 'XXX',
      multiple_procedure_indicator: '5',
      year: 2026,
      quarter: 'A',
    },
  },
  pfs_gpci: {
    key: { carrier: '99999', locality: '01' },
    value: { state: 'ZZ', locality_name: 'SYNTHETIC LOCALITY ONE', work_gpci: '1.000', pe_gpci: '0.950', mp_gpci: '0.650' },
  },
  conversion_factor: { key: { applicability: 'non_qualifying_apm' }, value: { conversion_factor: '20.0000', citation: 'SYNTHETIC page 1' } },
  mppr_rate: { key: { component: 'practice_expense' }, value: { reduction_percent: '40', applies_to: 'SYNTHETIC second and later units' } },
  therapy_threshold: { key: { discipline: 'PT_SLP' }, value: { kx_threshold_cents: '111100', medical_review_threshold_cents: '133300' } },
  assistant_modifier: { key: { modifier: 'CQ' }, value: { payment_percent: '77' } },
  sequestration: { key: { program: 'medicare' }, value: { reduction_percent: '3', applies_to: 'SYNTHETIC payment after the beneficiary share', suspended: false } },
  ncci_ptp: {
    key: { column1: '97140', column2: '97530' },
    value: { modifier_indicator: '1', rationale: 'SYNTHETIC rationale', in_existence_prior_to_1996: false },
  },
  ncci_mue: { key: { hcpcs: '97110' }, value: { mue: 7, adjudication_indicator: '3', rationale: 'SYNTHETIC rationale' } },
  carc: { key: { code: '45' }, value: { description: 'SYNTHETIC reason 45', start_date: '2001-01-01', last_modified: null, stop_date: null, notes: '' } },
  rarc: { key: { code: 'N901' }, value: { description: 'SYNTHETIC remark N901', start_date: null, last_modified: null, stop_date: null, notes: '' } },
  claim_status_code: {
    key: { code: '901' },
    value: { description: 'SYNTHETIC status 901', start_date: null, last_modified: null, stop_date: null, notes: '' },
  },
  state_prompt_pay: {
    key: { state: 'ZZ' },
    value: {
      days_to_pay: 33,
      day_basis: 'calendar',
      days_after_requested_information: null,
      interest: { automatic: true, accrues_from: 'SYNTHETIC day 34', annual_rate_percent: '9' },
      applies_to: 'SYNTHETIC insurers',
      exclusions: ['self_funded_plans'],
      statute: 'SYNTHETIC statute ZZ 1-2-3',
    },
  },
  dispute_window: {
    key: { program: 'medicare', window: 'redetermination' },
    value: { length: 111, unit: 'days', measured_from: null },
  },
  locality_map: {
    key: { zip: '00011' },
    value: { state: 'ZZ', carrier: '99999', locality: '01', rural_indicator: '', plus_four_required: false },
  },
  locality_map_plus_four: {
    key: { zip: '00012' },
    value: {
      state: 'ZZ',
      ranges: [
        { from: '0000', to: '4999', carrier: '99999', locality: '01', rural_indicator: 'R' },
        { from: '5000', to: '8999', carrier: '99999', locality: '02', rural_indicator: 'R' },
      ],
    },
  },
  denial_category: { key: { group_code: 'CO', carc: '9001', rarc: null }, value: { category: 'timely_filing' } },
};

/** A valid record of `type` (SYNTHETIC values), with any fields replaced by `overrides`. */
export function exampleRecord<T extends RuleRecordType>(type: T, overrides: Partial<RuleRecord> = {}): RuleRecord {
  const body = BODIES[type];
  return {
    record_type: type,
    key: body.key,
    value: body.value,
    effective_from: '2026-01-01',
    effective_to: '2026-12-31',
    source: EXAMPLE_SOURCE,
    verification: { level: 'L1', by: 'pnpm verify-content', on: '2026-10-15', questions: ['SYNTHETIC: is this an example?'] },
    quotes: ['SYNTHETIC'],
    notes: '',
    ...overrides,
  } as RuleRecord;
}

/** One valid record of every type. */
export function exampleRecords(): RuleRecord[] {
  return (Object.keys(BODIES) as RuleRecordType[]).map((type) => exampleRecord(type));
}
