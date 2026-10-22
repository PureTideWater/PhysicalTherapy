import { MA_NONCONTRACTED_TERMS, parseRateTerms } from '@tp/contracts';
import type { Cents } from '@tp/money';
import type { RuleRecord } from '@tp/rules';
import { describe, expect, it } from 'vitest';

import { MAX_UNITS, price } from './engine';
import { REVIEW_DETAILS, pagesOperator } from './reasons';
import { indexRelease } from './release';
import {
  MA_TERMS,
  SYNTHETIC_RELEASES,
  contractAgreement,
  fixedTerms,
  keyOf,
  lesserOfTerms,
  lineFacts,
  maAgreement,
  mappingRecord,
  perVisitTerms,
  percentTerms,
  practiceSettings,
  pricingInput,
  readRuleRelease,
  releaseVariant,
  ruleRecordLike,
  syntheticRelease,
  versionRecord,
} from './testing';
import { parseTrace } from './trace';
import type { LineFacts, LinePricing, PricedLine, PricingInput, UnpricedLine } from './types';

/**
 * The engine's steps, one behaviour at a time, against the SYNTHETIC releases (assistant 77%,
 * sequestration 3%, MPPR 40%; fixtures/synthetic/cms/synthetic-rules.md). Expected cents are worked
 * by hand from the SYNTHETIC values: GPCI work 1.000, PE 0.950, MP 0.650; conversion factors $20.0000
 * (non-qualifying) and $20.1000 (qualifying). Per unit at 100%, non-facility: 97110 is 620 + 1349 +
 * 143 = 2112 cents; 97140 680 + 1596 + 182 = 2458; 97530 700 + 1805 + 195 = 2700; 97112 640 + 1178 +
 * 156 = 1974; 97161 3220 + 2489 + 208 = 5917.
 */

const release = syntheticRelease(900001);
const base = readRuleRelease(SYNTHETIC_RELEASES[900001]);

function only(results: LinePricing[]): LinePricing {
  expect(results).toHaveLength(1);
  return results[0] as LinePricing;
}

function pricedLine(result: LinePricing | undefined): PricedLine {
  expect(result?.outcome, result?.outcome === 'unpriced' ? `${result.reason} ${String(result.detail)}` : '').toBe('priced');
  return result as PricedLine;
}

function unpricedLine(result: LinePricing | undefined): UnpricedLine {
  expect(result?.outcome).toBe('unpriced');
  return result as UnpricedLine;
}

function priceOne(facts: Partial<LineFacts>, overrides: Parameters<typeof pricingInput>[2] = {}, using = release): LinePricing {
  return only(price(pricingInput(using, [lineFacts(facts)], overrides)));
}

function reasonOf(result: LinePricing): string {
  return result.outcome === 'priced' ? 'priced' : `${result.reason}${result.detail === null ? '' : ` ${result.detail}`}`;
}

const cents = (value: bigint) => value as Cents;
const amounts = (line: PricedLine) => line.adjustments.map((item) => [item.name, item.beforeCents.toString(), item.afterCents.toString()]);

describe('the PRD 11 worked example (SYNTHETIC, 2026 non-facility, one locality)', () => {
  const lines = [
    lineFacts({ lineNo: 1, procedureCode: '97110', units: '2', patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '2', amountCents: cents(840n) }] }),
    lineFacts({ lineNo: 2, procedureCode: '97140', patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '2', amountCents: cents(480n) }] }),
    lineFacts({ lineNo: 3, procedureCode: '97530' }),
  ];

  it('MA non-contracted: fee schedule, MPPR on the three lower units, 3% sequestration of the payer share, one rounding', () => {
    const [first, second, third] = price(pricingInput(release, lines)).map(pricedLine);
    // 97530 (PE 1805) keeps its unit whole; 97140 loses 40% of 1596 = 638.4; each 97110 unit 40% of 1349 = 539.6.
    expect(amounts(first as PricedLine)).toEqual([
      ['mppr', '4224', '3144.8'],
      ['assistant_reduction', '3144.8', '3144.8'],
      ['sequestration', '3144.8', '3075.656'],
    ]);
    expect([first, second, third].map((line) => [line?.baseCents.toString(), line?.expectedUnroundedCents.toString(), line?.expectedAllowedCents])).toEqual([
      ['4224', '3075.656', 3076n],
      ['2458', '1779.412', 1779n],
      ['2700', '2619', 2619n],
    ]);
    expect(first?.patientShareCents).toBe(840n);
    expect(first?.terms).toEqual({ mappingId: 'map-synth-1', mappingKind: 'ma_noncontracted', contractVersionId: null, rateRecordId: null });
    expect(first?.rounding).toBe('HALF_UP_CENT');
    // The patient share is reported, never subtracted from the expected amount.
    expect(first?.varianceCents).toBe(3076n - 2000n);
  });

  it('a commercial 110% contract with every flag off prices at the unreduced sum times 1.10', () => {
    const agreement = contractAgreement({ terms: percentTerms({ percentage: '110', codes: ['97110', '97140', '97530'] }) });
    const results = price(pricingInput(release, lines.map((line) => ({ ...line, agreement })))).map(pricedLine);
    expect(results.map((line) => [line.baseCents.toString(), line.expectedAllowedCents, line.adjustments.length])).toEqual([
      ['4646.4', 4646n, 0],
      ['2703.8', 2704n, 0],
      ['2970', 2970n, 0],
    ]);
    expect(results[0]?.terms).toEqual({ mappingId: 'map-synth-1', mappingKind: 'contract', contractVersionId: 'cv-synth-1', rateRecordId: 'rr-synth-1' });
  });

  it('prices the lines in line-number order, whatever order they arrive in', () => {
    const results = price(pricingInput(release, [...lines].reverse()));
    expect(results.map((line) => line.lineNo)).toEqual([1, 2, 3]);
    expect(results.map((line) => line.outcome === 'priced' && line.expectedAllowedCents)).toEqual([3076n, 1779n, 2619n]);
  });

  it('uses the Medicare Advantage terms the contracts package defines', () => {
    expect(MA_TERMS).toEqual(MA_NONCONTRACTED_TERMS);
  });
});

describe('step 1, the agreement', () => {
  const version = versionRecord();
  const mapping = mappingRecord({ kind: 'contract', contractVersionId: version.id });

  it.each([
    [{ outcome: 'NO_MAPPING' } as const, 'NO_MAPPING', null],
    [{ outcome: 'NO_AGREEMENT', mapping: mappingRecord({ kind: 'no_agreement' }) } as const, 'NO_AGREEMENT', null],
    [{ outcome: 'DATE_OUTSIDE_VERSIONS', mapping } as const, 'DATE_OUTSIDE_VERSIONS', null],
    [{ outcome: 'NO_RATE_FOR_CODE', mapping, version } as const, 'NO_RATE_FOR_CODE', 'cv-synth-1'],
    [{ outcome: 'AMBIGUOUS_RATE', mapping, version, rateRecordIds: ['rr-a', 'rr-b'] } as const, 'AMBIGUOUS_RATE', 'cv-synth-1'],
  ])('stops with the resolver’s reason (%#)', (agreement, reason, versionId) => {
    const result = unpricedLine(priceOne({ agreement }));
    expect(result.reason).toBe(reason);
    expect(result.detail).toBeNull();
    expect(result.method).toBeNull();
    expect(result.terms?.contractVersionId ?? null).toBe(versionId);
    expect(result.trace.outcome).toEqual({ result: 'unpriced', reason, detail: null, step: 'agreement' });
  });

  it('records every matching rate record of an ambiguous rate', () => {
    const result = priceOne({ agreement: { outcome: 'AMBIGUOUS_RATE', mapping, version, rateRecordIds: ['rr-a', 'rr-b'] } });
    expect(result.trace.agreement?.matching_rate_record_ids).toEqual(['rr-a', 'rr-b']);
  });

  it('is ENGINE_ERROR when the resolver failed, or when a version that is not signed off reaches it (CON-07)', () => {
    expect(reasonOf(priceOne({ agreement: { outcome: 'RESOLUTION_FAILED' } }))).toBe('ENGINE_ERROR agreement_unresolved');
    for (const status of ['draft', 'proposed', 'approved', 'superseded'] as const) {
      const result = unpricedLine(priceOne({ agreement: contractAgreement({ version: { status } }) }));
      expect(reasonOf(result)).toBe('ENGINE_ERROR version_not_signed_off');
      expect(result.terms?.rateRecordId).toBe('rr-synth-1');
    }
  });
});

describe('step 2, the base amount by method', () => {
  it('stops an UNSUPPORTED method with UNSUPPORTED_METHOD', () => {
    const terms = parseRateTerms({ scope: { codes: ['97110'] }, method: 'UNSUPPORTED', parameters: {} }, true);
    const result = unpricedLine(priceOne({ agreement: contractAgreement({ terms }) }));
    expect(result.reason).toBe('UNSUPPORTED_METHOD');
    expect(result.method).toBe('UNSUPPORTED');
    expect(result.trace.terms?.percent_of_medicare).toBeNull();
  });

  it('stops the reduction asked of a term without a fee schedule for review, and refuses a contract-named locality, never a guess', () => {
    const methods = [
      { method: 'FIXED_SCHEDULE', parameters: { amount_cents: '3200' } },
      { method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '3200' }, charge_basis: 'LINE_CHARGE' } },
      { method: 'LESSER_OF', parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '100', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' }, charge_basis: 'LINE_CHARGE' } },
      { method: 'PER_VISIT', parameters: { amount_cents: '9000' } },
    ];
    for (const entered of methods) {
      const terms = parseRateTerms({ scope: { codes: ['97110'] }, ...entered, flags: { apply_mppr: true, timed_units_rule: 'PER_CODE' } }, true);
      const result = unpricedLine(priceOne({ agreement: contractAgreement({ terms }) }));
      expect(reasonOf(result), entered.method).toBe('ENGINE_ERROR mppr_needs_fee_schedule');
      expect(result.trace.outcome).toMatchObject({ step: 'method' });
      expect(pagesOperator('mppr_needs_fee_schedule')).toBe(false);
    }
    const locality = { kind: 'NAMED', carrier: '99999', locality: '01' };
    const named = parseRateTerms({ scope: { codes: ['97110'] }, method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '100', year_basis: 'CURRENT', locality_basis: locality, conversion_factor: 'non_qualifying_apm' } }, true);
    const result = unpricedLine(priceOne({ agreement: contractAgreement({ terms: named }) }));
    expect(reasonOf(result)).toBe('ENGINE_ERROR locality_basis_not_in_phase_one');
    expect(result.trace.outcome).toMatchObject({ step: 'method' });
    const lesserNamed = parseRateTerms(
      { scope: { codes: ['97110'] }, method: 'LESSER_OF', parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '100', year_basis: 'CURRENT', locality_basis: locality, conversion_factor: 'non_qualifying_apm' }, charge_basis: 'LINE_CHARGE' } },
      true,
    );
    expect(reasonOf(priceOne({ agreement: contractAgreement({ terms: lesserNamed }) }))).toBe('ENGINE_ERROR locality_basis_not_in_phase_one');
  });

  it('prices a fixed schedule at its amount per unit times the units (PRC-05)', () => {
    const line = pricedLine(priceOne({ units: '2', agreement: contractAgreement({ terms: fixedTerms(3250n) }) }));
    expect([line.method, line.baseCents.toString(), line.expectedAllowedCents]).toEqual(['FIXED_SCHEDULE', '6500', 6500n]);
    expect(line.trace.steps.fee_schedule).toBeNull();
    expect(line.trace.steps.units).toMatchObject({ unit_cents: '3250', schedule_cents: '6500', charge_cents: null, base_cents: '6500' });
    expect(line.trace.terms).toMatchObject({ method: 'FIXED_SCHEDULE', fixed_amount_cents: '3250', percent_of_medicare: null, lesser_of: null, contract_adjustment: null });
  });

  it('prices the lesser of the schedule for the units billed and the line charge (PRC-06)', () => {
    const fixed = contractAgreement({ terms: lesserOfTerms({ fixedCents: 3400n }) });
    const cases: readonly [bigint, string, string][] = [
      [6000n, '6000', 'the charge is lower'],
      [7000n, '6800', 'the schedule is lower'],
      [6800n, '6800', 'they are equal'],
    ];
    for (const [charge, base, label] of cases) {
      const line = pricedLine(priceOne({ units: '2', chargeCents: cents(charge), agreement: fixed }));
      expect(line.baseCents.toString(), label).toBe(base);
      expect(line.trace.steps.units).toMatchObject({ schedule_cents: '6800', charge_cents: charge.toString(), base_cents: base });
    }
    const percent = contractAgreement({ terms: lesserOfTerms({ percentage: '125' }, { codes: ['97530', '97750'] }) });
    // 125% of 97530's 2700 is 3375, above a 3000 charge.
    const line = pricedLine(priceOne({ procedureCode: '97530', chargeCents: cents(3000n), agreement: percent }));
    expect([line.method, line.baseCents.toString()]).toEqual(['LESSER_OF', '3000']);
    expect(line.trace.steps.fee_schedule?.unit_cents?.total).toBe('3375');
    expect(line.trace.terms).toMatchObject({ lesser_of: { schedule_method: 'PERCENT_OF_MEDICARE', charge_basis: 'LINE_CHARGE' }, fixed_amount_cents: null });
    expect(reasonOf(priceOne({ procedureCode: '97750', agreement: percent }))).toBe('NO_PFS_VALUE no_rvu_in_basis_year');
  });

  it('uses the conversion factor the record names (PRC-08)', () => {
    const line = pricedLine(priceOne({ agreement: contractAgreement({ terms: percentTerms({ conversionFactor: 'qualifying_apm' }) }) }));
    // 1.056 RVUs x $20.1000 = 2122.56 cents.
    expect(line.expectedUnroundedCents.toString()).toBe('2122.56');
    expect(line.trace.steps.fee_schedule?.conversion_factor?.value).toBe('20.1000');
  });

  it('takes the facility practice-expense value at a facility place of service', () => {
    const line = pricedLine(priceOne({ placeOfService: '22', agreement: contractAgreement() }));
    // 620 + 0.21 x 0.950 x 2000 (399) + 143.
    expect(line.baseCents.toString()).toBe('1162');
    expect(line.trace.steps.fee_schedule?.setting).toBe('facility');
  });

  it('is NO_PFS_VALUE for a code with no relative value, or none for the setting (PRC-09)', () => {
    expect(reasonOf(priceOne({ procedureCode: '97750' }))).toBe('NO_PFS_VALUE no_rvu_in_basis_year');
    expect(reasonOf(priceOne({ procedureCode: 'G0283', placeOfService: '22' }))).toBe('NO_PFS_VALUE practice_expense_not_available');
    expect(reasonOf(priceOne({ procedureCode: 'G0283', placeOfService: '11' }))).toBe('priced');
  });

  it('prices LOCKED:<year> from the latest records in force during that year, and the locality on the service date (PRC-04)', () => {
    const locked = contractAgreement({ terms: percentTerms({ percentage: '105', yearBasis: 'LOCKED:2025', codes: ['97112'] }) });
    const line = pricedLine(priceOne({ procedureCode: '97112', serviceDate: '2026-04-14', agreement: locked }, {}, syntheticRelease(900002)));
    expect(line.expectedUnroundedCents.toString()).toBe('2054.14327125');
    expect(line.trace.steps.fee_schedule).toMatchObject({ basis_year: 2025, lookup: 'latest_in_basis_year' });
    expect(line.trace.steps.fee_schedule?.locality?.record.effective_from).toBe('2026-01-01');
    const none = contractAgreement({ terms: percentTerms({ yearBasis: 'LOCKED:2024' }) });
    expect(reasonOf(priceOne({ agreement: none }, {}, syntheticRelease(900002)))).toBe('NO_PFS_VALUE no_rvu_in_basis_year');
  });

  it('is ENGINE_ERROR when the place of service has no setting, or the release lacks the locality, GPCI or factor', () => {
    expect(reasonOf(priceOne({ placeOfService: null }))).toBe('ENGINE_ERROR place_of_service_unmapped');
    expect(reasonOf(priceOne({ placeOfService: '02' }))).toBe('ENGINE_ERROR place_of_service_unmapped');
    expect(reasonOf(priceOne({}, { settings: practiceSettings({ zip: '00099' }) }))).toBe('ENGINE_ERROR no_locality');
    const gpci = base.records.find((record) => record.record_type === 'pfs_gpci') as RuleRecord;
    const noGpci = releaseVariant(base, (records) => records.filter((record) => record.record_type !== 'pfs_gpci'));
    expect(reasonOf(priceOne({}, {}, noGpci))).toBe('ENGINE_ERROR no_gpci');
    const noFactor = releaseVariant(base, (records) => records.filter((record) => record.record_type !== 'conversion_factor'));
    expect(reasonOf(priceOne({}, {}, noFactor))).toBe('ENGINE_ERROR no_conversion_factor');
    expect(gpci.record_type).toBe('pfs_gpci');
  });

  it('is ENGINE_ERROR when the practice ZIP needs its ZIP+4 to name a locality, and records the flag either way', () => {
    const line = unpricedLine(priceOne({}, { settings: practiceSettings({ zip: '00012' }) }));
    expect(reasonOf(line)).toBe('ENGINE_ERROR locality_needs_zip_plus_four');
    expect(line.trace.steps.fee_schedule?.locality).toMatchObject({ carrier: '99999', locality: '01', plus_four_required: true });
    expect(pricedLine(priceOne({})).trace.steps.fee_schedule?.locality?.plus_four_required).toBe(false);
  });

  it('is ENGINE_ERROR when two records of one rule are in force on the date', () => {
    const rvu = base.records.find((record) => record.record_type === 'pfs_rvu' && keyOf(record).hcpcs === '97110') as RuleRecord;
    const twice = releaseVariant(base, (records) => [...records, ruleRecordLike(rvu, { effective_from: '2026-03-01' })]);
    expect(reasonOf(priceOne({}, {}, twice))).toBe('ENGINE_ERROR release_records_overlap');
  });

  it('is ENGINE_ERROR unexpected when a record cannot be read as the schema says', () => {
    const rvu = base.records.find((record) => record.record_type === 'pfs_rvu' && keyOf(record).hcpcs === '97110') as RuleRecord;
    const at = base.records.indexOf(rvu);
    const broken = releaseVariant(base, (records) => records.map((record, index) => (index === at ? ruleRecordLike(rvu, { value: { ...rvu.value, work_rvu: 'not a number' } }) : record)));
    const result = unpricedLine(priceOne({}, {}, broken));
    expect(reasonOf(result)).toBe('ENGINE_ERROR unexpected');
    expect(result.trace.outcome).toMatchObject({ step: 'fee_schedule' });
  });
});

describe('step 2, the locality of a ZIP that needs its ZIP+4 (PRC-21; docs/adr/0064)', () => {
  /**
   * Release 900006: 900001 with a second locality, 99999-02 (GPCI work 1.000, PE 1.050, MP 0.700), and the ZIP+4 ranges
   * of 00012, the ZIP the ZIP5 file flags: 0000-4999 in locality 01, 5000-8999 in locality 02, 9000-9999 not listed.
   * At 100% of a commercial term with every flag off, 97110 non-facility is 620 + 1349 + 143 = 2112 cents in locality
   * 01 and 0.31 x 1.000 x 2000 + 0.71 x 1.050 x 2000 + 0.11 x 0.700 x 2000 = 620 + 1491 + 154 = 2265 cents in 02.
   */
  const plusFourBase = readRuleRelease('fixtures/synthetic/rules/release-synth-900006');
  const plusFourRelease = indexRelease(plusFourBase);
  const commercial = contractAgreement({ terms: percentTerms() });
  const at = (zip: string, zipPlusFour?: string | null) => ({ settings: practiceSettings(zipPlusFour === undefined ? { zip } : { zip, zipPlusFour }) });
  const split = plusFourBase.records.find((record) => record.record_type === 'locality_map_plus_four') as RuleRecord;

  it('(a) prices 00012-5000 at locality 02, naming the plus-four record and its range, with the ZIP5 record’s own carrier and locality kept', () => {
    const line = pricedLine(priceOne({ agreement: commercial }, at('00012', '5000'), plusFourRelease));
    expect(line.expectedAllowedCents).toBe(2265n);
    expect(line.trace.steps.fee_schedule?.unit_cents).toEqual({ work: '620', pe: '1491', mp: '154', total: '2265' });
    expect(line.trace.settings).toEqual({ zip: '00012', zip_plus_four: '5000', default_rounding: 'HALF_UP_CENT', place_of_service_settings: { '11': 'non_facility', '22': 'facility' } });
    const locality = line.trace.steps.fee_schedule?.locality;
    expect(locality).toEqual({
      record: plusFourRelease.ref(plusFourBase.records.find((record) => record.record_type === 'locality_map' && keyOf(record).zip === '00012') as RuleRecord),
      carrier: '99999',
      locality: '01',
      plus_four_required: true,
      plus_four: { record: plusFourRelease.ref(split), zip_plus_four: '5000', from: '5000', to: '8999', carrier: '99999', locality: '02' },
    });
    expect(locality?.plus_four?.record).toMatchObject({ record_type: 'locality_map_plus_four', key: { zip: '00012' }, effective_from: '2026-01-01', effective_to: '2026-12-31' });
    expect(line.trace.steps.fee_schedule?.gpci).toMatchObject({ record: { record_type: 'pfs_gpci', key: { carrier: '99999', locality: '02' } }, work_gpci: '1.000', pe_gpci: '1.050', mp_gpci: '0.700' });
    expect(parseTrace(JSON.parse(JSON.stringify(line.trace)))).toEqual(line.trace);
    // The range's last code, as golden G199 takes it.
    expect(pricedLine(priceOne({ agreement: commercial }, at('00012', '8999'), plusFourRelease)).expectedAllowedCents).toBe(2265n);
  });

  it('(b) prices 00012-0001 at locality 01, the amount of 00011', () => {
    const split01 = pricedLine(priceOne({ agreement: commercial }, at('00012', '0001'), plusFourRelease));
    const whole = pricedLine(priceOne({ agreement: commercial }, at('00011'), plusFourRelease));
    expect([split01.expectedAllowedCents, whole.expectedAllowedCents]).toEqual([2112n, 2112n]);
    expect(split01.trace.steps.fee_schedule?.locality?.plus_four).toMatchObject({ zip_plus_four: '0001', from: '0000', to: '4999', locality: '01' });
    expect(split01.trace.steps.fee_schedule?.gpci).toEqual(whole.trace.steps.fee_schedule?.gpci);
    // Medicare Advantage terms apply their adjustments to the ZIP+4's locality too: 2265 less 3% sequestration is 2197.05.
    expect(pricedLine(priceOne({}, at('00012', '5000'), plusFourRelease)).expectedUnroundedCents.toString()).toBe('2197.05');
  });

  it('(c) stops 00012 without a ZIP+4 with ENGINE_ERROR locality_needs_zip_plus_four, null or absent, and records the flag', () => {
    for (const zipPlusFour of [undefined, null]) {
      const line = unpricedLine(priceOne({ agreement: commercial }, at('00012', zipPlusFour), plusFourRelease));
      expect(reasonOf(line)).toBe('ENGINE_ERROR locality_needs_zip_plus_four');
      expect(line.trace.settings).toEqual({ zip: '00012', default_rounding: 'HALF_UP_CENT', place_of_service_settings: { '11': 'non_facility', '22': 'facility' } });
      expect(line.trace.steps.fee_schedule?.locality).toEqual({ record: expect.objectContaining({ record_type: 'locality_map' }) as unknown, carrier: '99999', locality: '01', plus_four_required: true });
      expect(line.trace.steps.fee_schedule?.gpci).toBeNull();
      expect(pagesOperator('locality_needs_zip_plus_four')).toBe(true);
    }
  });

  it('(d) stops a ZIP+4 no range holds with ENGINE_ERROR zip_plus_four_not_in_locality_map, never a neighbour’s locality, naming the plus-four record it read', () => {
    for (const zipPlusFour of ['9100', '9000', '9999']) {
      const line = unpricedLine(priceOne({ agreement: commercial }, at('00012', zipPlusFour), plusFourRelease));
      expect(reasonOf(line)).toBe('ENGINE_ERROR zip_plus_four_not_in_locality_map');
      expect(line.trace.steps.fee_schedule?.locality).toEqual({
        record: plusFourRelease.ref(plusFourBase.records.find((record) => record.record_type === 'locality_map' && keyOf(record).zip === '00012') as RuleRecord),
        carrier: '99999',
        locality: '01',
        plus_four_required: true,
        plus_four_unlisted: plusFourRelease.ref(split),
      });
      expect(parseTrace(JSON.parse(JSON.stringify(line.trace)))).toEqual(line.trace);
      expect(line.trace.steps.fee_schedule?.gpci).toBeNull();
      expect(line.trace.outcome).toEqual({ result: 'unpriced', reason: 'ENGINE_ERROR', detail: 'zip_plus_four_not_in_locality_map', step: 'fee_schedule' });
    }
    // A code below the first range's start is in no range either.
    const fromOne = releaseVariant(plusFourBase, (records) =>
      records.map((record) =>
        record.record_type === 'locality_map_plus_four'
          ? ruleRecordLike(record, { value: { ...(record.value as object), ranges: (record.value as { ranges: { from: string }[] }).ranges.map((range, index) => (index === 0 ? { ...range, from: '1000' } : range)) } })
          : record,
      ),
    );
    expect(reasonOf(priceOne({ agreement: commercial }, at('00012', '0999'), fromOne))).toBe('ENGINE_ERROR zip_plus_four_not_in_locality_map');
    expect(reasonOf(priceOne({ agreement: commercial }, at('00012', '1000'), fromOne))).toBe('priced');
    // An operator looks at it: the detail is not one of the review details.
    expect(pagesOperator('zip_plus_four_not_in_locality_map')).toBe(true);
    expect(REVIEW_DETAILS).toEqual(['claim_status_not_priced', 'mppr_needs_fee_schedule']);
  });

  it('(e) stops 00012-0001 with ENGINE_ERROR no_locality_plus_four under a release with no ZIP+4 record (900001), or one whose ZIP+4 record is not in force on the date: a content gap, told apart from a ZIP+4 no range holds', () => {
    const missing = unpricedLine(priceOne({ agreement: commercial }, at('00012', '0001')));
    expect(reasonOf(missing)).toBe('ENGINE_ERROR no_locality_plus_four');
    expect(missing.trace.outcome).toEqual({ result: 'unpriced', reason: 'ENGINE_ERROR', detail: 'no_locality_plus_four', step: 'fee_schedule' });
    expect(missing.trace.steps.fee_schedule?.locality).toEqual({ record: expect.objectContaining({ record_type: 'locality_map' }) as unknown, carrier: '99999', locality: '01', plus_four_required: true });
    expect(missing.trace.steps.fee_schedule?.gpci).toBeNull();
    expect(pagesOperator('no_locality_plus_four')).toBe(true);
    const ended = releaseVariant(plusFourBase, (records) => records.map((record) => (record.record_type === 'locality_map_plus_four' ? ruleRecordLike(record, { effective_to: '2026-03-09' }) : record)));
    expect(reasonOf(priceOne({ agreement: commercial }, at('00012', '0001'), ended))).toBe('ENGINE_ERROR no_locality_plus_four');
    // A record that lists only 0000-4999 and no record at all stop 9100 apart, and their traces differ by the record read.
    const firstRangeOnly = releaseVariant(plusFourBase, (records) =>
      records.map((record) => (record.record_type === 'locality_map_plus_four' ? ruleRecordLike(record, { value: { ...(record.value as object), ranges: (record.value as { ranges: unknown[] }).ranges.slice(0, 1) } }) : record)),
    );
    const unlisted = unpricedLine(priceOne({ agreement: commercial }, at('00012', '9100'), firstRangeOnly));
    const noRecord = unpricedLine(priceOne({ agreement: commercial }, at('00012', '9100')));
    expect([reasonOf(unlisted), reasonOf(noRecord)]).toEqual(['ENGINE_ERROR zip_plus_four_not_in_locality_map', 'ENGINE_ERROR no_locality_plus_four']);
    expect(unlisted.trace.steps.fee_schedule?.locality?.plus_four_unlisted).toMatchObject({ record_type: 'locality_map_plus_four', key: { zip: '00012' } });
    expect(noRecord.trace.steps.fee_schedule?.locality).not.toHaveProperty('plus_four_unlisted');
    expect(reasonOf(priceOne({ agreement: commercial, serviceDate: '2026-03-09' }, at('00012', '0001'), ended))).toBe('priced');
    const twice = releaseVariant(plusFourBase, (records) => [...records, ruleRecordLike(split, { effective_from: '2026-03-01' })]);
    expect(reasonOf(priceOne({ agreement: commercial }, at('00012', '0001'), twice))).toBe('ENGINE_ERROR release_records_overlap');
  });

  it('(f) ignores a ZIP+4 given for a ZIP that does not need it: the amount of the five-digit ZIP, and only the settings differ in the trace', () => {
    const given = pricedLine(priceOne({ agreement: commercial }, at('00011', '1234'), plusFourRelease));
    const without = pricedLine(priceOne({ agreement: commercial }, at('00011'), plusFourRelease));
    expect(given.expectedAllowedCents).toBe(without.expectedAllowedCents);
    expect(given.trace.settings.zip_plus_four).toBe('1234');
    expect(given.trace.steps.fee_schedule?.locality).not.toHaveProperty('plus_four');
    expect({ ...given.trace, settings: without.trace.settings }).toEqual(without.trace);
  });

  it('(g) refuses a ZIP+4 that is not four digits as invalid settings, and records it as given', () => {
    for (const zipPlusFour of ['12a4', '123', '', '12345', ' 123']) {
      const line = unpricedLine(priceOne({ agreement: commercial }, at('00012', zipPlusFour), plusFourRelease));
      expect(reasonOf(line)).toBe('ENGINE_ERROR invalid_settings');
      expect(line.trace.settings.zip_plus_four).toBe(zipPlusFour);
    }
  });

  it('(h) reads the plus-four record in force on the service date under a LOCKED basis, never by the basis year (Q07)', () => {
    // 900002's 2025 fee schedule with 900006's ZIP+4 record, and a 2025 GPCI for locality 02 equal to 2025's locality 01: so
    // 00012-5000 prices as the PRC-04 line does (97112 at 105% of 2025, 2054.14327125 cents), through locality 02.
    const lockedBase = readRuleRelease(SYNTHETIC_RELEASES[900002]);
    const gpci2025 = lockedBase.records.find((record) => record.record_type === 'pfs_gpci' && record.effective_from === '2025-01-01') as RuleRecord;
    const withSplit = (window: { readonly effective_from: string; readonly effective_to: string | null }) =>
      releaseVariant(lockedBase, (records) => [...records, ruleRecordLike(split, window), ruleRecordLike(gpci2025, { key: { carrier: '99999', locality: '02' } })]);
    const locked = contractAgreement({ terms: percentTerms({ percentage: '105', yearBasis: 'LOCKED:2025', codes: ['97112'] }) });
    const facts = { procedureCode: '97112', serviceDate: '2026-04-14', agreement: locked };
    const line = pricedLine(priceOne(facts, at('00012', '5000'), withSplit({ effective_from: '2026-01-01', effective_to: '2026-12-31' })));
    expect(line.expectedUnroundedCents.toString()).toBe('2054.14327125');
    expect(line.trace.steps.fee_schedule).toMatchObject({ basis_year: 2025, lookup: 'latest_in_basis_year' });
    expect(line.trace.steps.fee_schedule?.locality?.plus_four?.record).toMatchObject({ effective_from: '2026-01-01' });
    expect(line.trace.steps.fee_schedule?.gpci?.record).toMatchObject({ key: { carrier: '99999', locality: '02' }, effective_from: '2025-01-01' });
    // A ZIP+4 record of 2025 alone is the latest of the basis year, and is not read: it is not in force on the service date.
    expect(reasonOf(priceOne(facts, at('00012', '5000'), withSplit({ effective_from: '2025-01-01', effective_to: '2025-12-31' })))).toBe('ENGINE_ERROR no_locality_plus_four');
  });

  it('(i) prices a fixed-schedule line for 00012 without a ZIP+4: the locality is never read', () => {
    const line = pricedLine(priceOne({ agreement: contractAgreement({ terms: fixedTerms(3250n) }) }, at('00012'), plusFourRelease));
    expect(line.expectedAllowedCents).toBe(3250n);
    expect(line.trace.steps.fee_schedule).toBeNull();
    expect(reasonOf(priceOne({ agreement: contractAgreement({ terms: perVisitTerms(8800n) }) }, at('00012', '9100'), plusFourRelease))).toBe('priced');
  });
});

describe('step 3, units', () => {
  it('multiplies by the units as billed, whole units of at least one', () => {
    expect(pricedLine(priceOne({ units: '3', agreement: contractAgreement() })).baseCents.toString()).toBe('6336');
    expect(pricedLine(priceOne({ units: '2.000', agreement: contractAgreement() })).baseCents.toString()).toBe('4224');
    for (const units of ['0', '1.5', '-1', 'two', '']) {
      expect(reasonOf(priceOne({ units })), units).toBe('ENGINE_ERROR units_not_whole');
    }
    expect(pricedLine(priceOne({ units: String(MAX_UNITS), agreement: contractAgreement() })).baseCents.toString()).toBe(String(2112 * MAX_UNITS));
  });

  it('refuses more than MAX_UNITS on a line before anything is ranked, so a claim stays bounded (PRC-20)', () => {
    const mppr = contractAgreement({ terms: percentTerms({ codes: ['97110', '97140'], flags: { apply_mppr: true } }) });
    for (const units of [String(MAX_UNITS + 1), '5000000000', '999999.000']) {
      const [huge, other] = price(pricingInput(release, [lineFacts({ units, agreement: mppr }), lineFacts({ lineNo: 2, procedureCode: '97140', agreement: mppr })]));
      expect(reasonOf(huge as LinePricing), units).toBe('ENGINE_ERROR units_above_limit');
      expect(unpricedLine(huge).trace.outcome).toMatchObject({ step: 'units' });
      // The other line of the day is the pool's only unit, kept whole.
      expect(pricedLine(other).expectedUnroundedCents.toString()).toBe('2458');
    }
  });

  it('stops a line whose terms do not say how timed units are counted with UNITS_RULE_UNKNOWN, before the reduction ranks it (PRD 20)', () => {
    const unknown = contractAgreement({ terms: percentTerms({ codes: ['97110'], flags: { timed_units_rule: 'UNKNOWN', apply_mppr: true } }) });
    const known = contractAgreement({ terms: percentTerms({ codes: ['97140'], flags: { apply_mppr: true } }), rateRecordId: 'rr-synth-2' });
    const [first, second] = price(pricingInput(release, [lineFacts({ units: '2', agreement: unknown }), lineFacts({ lineNo: 2, procedureCode: '97140', agreement: known })]));
    const line = unpricedLine(first);
    expect(reasonOf(line)).toBe('UNITS_RULE_UNKNOWN');
    expect(line.trace.outcome).toMatchObject({ step: 'units' });
    expect(line.trace.steps.units).toEqual({
      units: '2',
      timed_units_rule: 'UNKNOWN',
      mue: { checked: false, record: null, value: null },
      unit_cents: '2112',
      schedule_cents: '4224',
      charge_cents: null,
      base_cents: '4224',
    });
    expect(line.trace.steps.adjustments).toEqual([]);
    // 97110's PE (1349) is below 97140's (1596) anyway; the 97140 unit is the day's only ranked unit.
    expect(pricedLine(second).trace.steps.adjustments[0]).toMatchObject({ name: 'mppr', ranking: [{ rank: 1, line_no: 2, unit: 1 }], reductions: [] });
    for (const rule of ['MEDICARE_POOLED', 'PER_CODE'] as const) {
      expect(reasonOf(priceOne({ agreement: contractAgreement({ terms: percentTerms({ flags: { timed_units_rule: rule } }) }) })), rule).toBe('priced');
    }
  });
});

describe('step 3, the per-visit amount', () => {
  const visit = contractAgreement({ terms: perVisitTerms(8800n, { codes: ['97110', '97112', '97116', '97140', '97530'], flags: { apply_ncci: true } }) });
  const group = contractAgreement({ terms: perVisitTerms(3000n, { codes: ['97150'] }), rateRecordId: 'rr-synth-group' });

  it('places it once per claim and date on the first included line; the others expect zero, whatever their units (PRC-07)', () => {
    const results = price(
      pricingInput(release, [
        lineFacts({ lineNo: 1, units: '2', agreement: visit }),
        lineFacts({ lineNo: 2, procedureCode: '97112', agreement: visit }),
        lineFacts({ lineNo: 3, procedureCode: '97116', agreement: visit }),
        lineFacts({ lineNo: 4, serviceDate: '2026-03-12', agreement: visit }),
        lineFacts({ lineNo: 5, procedureCode: '97150', agreement: group }),
      ]),
    );
    expect(results.map((result) => pricedLine(result).baseCents.toString())).toEqual(['8800', '0', '0', '8800', '3000']);
    expect(results.map((result) => pricedLine(result).method)).toEqual(['PER_VISIT', 'PER_VISIT', 'PER_VISIT', 'PER_VISIT', 'PER_VISIT']);
    expect(pricedLine(results[1]).trace.steps.per_visit).toEqual({ service_date: '2026-03-10', amount_cents: '8800', visit_line_nos: [1, 2, 3], carrier_line_no: 1, base_cents: '0' });
    expect(pricedLine(results[0]).trace.steps.units).toMatchObject({ unit_cents: '8800', schedule_cents: null, charge_cents: null, base_cents: null });
  });

  it('follows line numbers, not the order the lines arrive in, and passes the visit on when the first line stops', () => {
    const arrived = price(pricingInput(release, [lineFacts({ lineNo: 3, procedureCode: '97140', agreement: visit }), lineFacts({ lineNo: 1, procedureCode: '97530', agreement: visit }), lineFacts({ lineNo: 2, agreement: visit })]));
    expect(arrived.map((result) => [result.lineNo, pricedLine(result).baseCents.toString()])).toEqual([
      [1, '8800'],
      [2, '0'],
      [3, '0'],
    ]);
    // Six units of 97530 exceed its SYNTHETIC MUE of 5: the visit falls to line 2.
    const stopped = price(pricingInput(release, [lineFacts({ lineNo: 1, procedureCode: '97530', units: '6', agreement: visit }), lineFacts({ lineNo: 2, agreement: visit }), lineFacts({ lineNo: 3, procedureCode: '97112', agreement: visit })]));
    expect(stopped.map(reasonOf)).toEqual(['MUE_EXCEEDED', 'priced', 'priced']);
    expect([pricedLine(stopped[1]).baseCents.toString(), pricedLine(stopped[2]).baseCents.toString()]).toEqual(['8800', '0']);
  });

  it('is stopped like any line by an unknown timed-units rule (QUESTIONS Q40)', () => {
    const unknown = contractAgreement({ terms: perVisitTerms(5150n, { codes: ['97164'], flags: { timed_units_rule: 'UNKNOWN' } }) });
    expect(reasonOf(priceOne({ procedureCode: '97164', agreement: unknown }))).toBe('UNITS_RULE_UNKNOWN');
  });
});

describe('step 3, the NCCI edits', () => {
  const ncci = (codes: readonly string[]) => contractAgreement({ terms: fixedTerms(3000n, { codes, flags: { apply_ncci: true } }) });
  const plain = (codes: readonly string[]) => contractAgreement({ terms: fixedTerms(3000n, { codes }) });

  it('stops units above the MUE with NCCI on for review, not priced down; at the MUE, without a record or with NCCI off they price (PRC-10)', () => {
    const over = unpricedLine(priceOne({ units: '8', agreement: ncci(['97110']) }));
    expect(reasonOf(over)).toBe('MUE_EXCEEDED');
    expect(over.trace.outcome).toMatchObject({ step: 'units' });
    expect(over.trace.steps.units?.mue).toMatchObject({ checked: true, value: 7 });
    expect(reasonOf(priceOne({ units: '7', agreement: ncci(['97110']) }))).toBe('priced');
    expect(reasonOf(priceOne({ units: '8', agreement: plain(['97110']) }))).toBe('priced');
    const none = pricedLine(priceOne({ procedureCode: '97750', units: '9', agreement: ncci(['97750']) }));
    expect(none.trace.steps.units?.mue).toEqual({ checked: true, record: null, value: null });
    // Before the timed-units rule.
    const unknown = contractAgreement({ terms: fixedTerms(3000n, { flags: { apply_ncci: true, timed_units_rule: 'UNKNOWN' } }) });
    expect(reasonOf(priceOne({ units: '8', agreement: unknown }))).toBe('MUE_EXCEEDED');
    // Medicare Advantage non-contracted lines have NCCI on.
    expect(reasonOf(priceOne({ units: '8' }))).toBe('MUE_EXCEEDED');
  });

  it('flags 97530 billed with 97140 on the day without a 59 or X modifier, and never changes the price (PRC-11)', () => {
    const agreement = ncci(['97140', '97530']);
    const [first, second] = price(pricingInput(release, [lineFacts({ procedureCode: '97140', agreement }), lineFacts({ lineNo: 2, procedureCode: '97530', agreement })]));
    expect(pricedLine(first).reviewFlags).toEqual([]);
    const flagged = pricedLine(second);
    expect(flagged.reviewFlags).toEqual([{ flag: 'NCCI_PTP', column1LineNo: 1, column1Code: '97140', column2Code: '97530' }]);
    expect(flagged.expectedAllowedCents).toBe(3000n);
    expect(flagged.trace.steps.ncci_ptp?.edits).toEqual([expect.objectContaining({ column1_line_no: 1, column1_code: '97140', column1_modifiers: ['GP'], modifier_indicator: '1', bypassed: false })]);
    expect(flagged.trace.outcome).toMatchObject({ review_flags: [{ flag: 'NCCI_PTP', column1_line_no: 1 }] });
  });

  it('lets 59 or an X modifier on either line bypass an indicator-1 edit, and no modifier bypass indicators 0 and 9', () => {
    const flags = (lines: readonly Partial<LineFacts>[], agreement: ReturnType<typeof ncci>) =>
      price(pricingInput(release, lines.map((line, index) => lineFacts({ lineNo: index + 1, agreement, ...line })))).map((result) => pricedLine(result).reviewFlags.map((flag) => flag.column1LineNo));
    const pair = ncci(['97140', '97530']);
    expect(flags([{ procedureCode: '97140', modifiers: ['GP', '59'] }, { procedureCode: '97530' }], pair)).toEqual([[], []]);
    expect(flags([{ procedureCode: '97140' }, { procedureCode: '97530', modifiers: ['GP', 'XS'] }], pair)).toEqual([[], []]);
    expect(flags([{ procedureCode: '97140' }, { procedureCode: '97530', modifiers: ['GP', 'KX'] }], pair)).toEqual([[], [1]]);
    // 97164/97110, indicator 0, ends 2026-06-30; 97035/97026, indicator 9.
    const zero = ncci(['97164', '97110']);
    expect(flags([{ procedureCode: '97164' }, { procedureCode: '97110', modifiers: ['GP', '59'], serviceDate: '2026-06-30' }].map((line) => ({ serviceDate: '2026-06-30', ...line })), zero)).toEqual([[], [1]]);
    expect(flags([{ procedureCode: '97164' }, { procedureCode: '97110', modifiers: ['GP', '59'] }].map((line) => ({ serviceDate: '2026-07-01', ...line })), zero)).toEqual([[], []]);
    expect(flags([{ procedureCode: '97035' }, { procedureCode: '97026', modifiers: ['GP', 'XU'] }], ncci(['97035', '97026']))).toEqual([[], [1]]);
  });

  it('counts a billed column-1 line whatever its outcome, checks only lines whose own terms have NCCI on, and lists the edits in line order', () => {
    const stopped = price(
      pricingInput(release, [
        lineFacts({ lineNo: 1, procedureCode: '97140', units: '7', agreement: ncci(['97140', '97530', '97116']) }),
        lineFacts({ lineNo: 2, procedureCode: '97116', agreement: ncci(['97140', '97530', '97116']) }),
        lineFacts({ lineNo: 3, procedureCode: '97530', agreement: ncci(['97140', '97530', '97116']) }),
        lineFacts({ lineNo: 4, procedureCode: '97116', agreement: plain(['97116']) }),
        lineFacts({ lineNo: 5, procedureCode: '97116', serviceDate: '2026-03-11', agreement: ncci(['97116']) }),
      ]),
    );
    expect(reasonOf(stopped[0] as LinePricing)).toBe('MUE_EXCEEDED');
    expect(pricedLine(stopped[1]).reviewFlags.map((flag) => flag.column1LineNo)).toEqual([3]);
    expect(pricedLine(stopped[2]).reviewFlags.map((flag) => flag.column1LineNo)).toEqual([1]);
    expect(pricedLine(stopped[3]).reviewFlags).toEqual([]);
    expect(pricedLine(stopped[3]).trace.steps.ncci_ptp).toBeNull();
    expect(pricedLine(stopped[4]).reviewFlags).toEqual([]);
    // Medicare Advantage non-contracted lines too (G01's pair).
    const ma = price(pricingInput(release, [lineFacts({ lineNo: 2, procedureCode: '97530' }), lineFacts({ lineNo: 1, procedureCode: '97140' })]));
    expect(ma.map((result) => pricedLine(result).reviewFlags.length)).toEqual([0, 1]);
  });
});

describe('step 4a, the multiple procedure reduction', () => {
  const mppr = contractAgreement({ terms: percentTerms({ codes: ['97110', '97140', '97161', '97530'], flags: { apply_mppr: true } }) });

  it('keeps the day’s highest practice-expense unit whole and reduces the rest, ties to the lower line then the earlier unit', () => {
    const results = price(
      pricingInput(release, [
        lineFacts({ lineNo: 1, procedureCode: '97110', agreement: mppr }),
        lineFacts({ lineNo: 2, procedureCode: '97110', units: '2', agreement: mppr }),
      ]),
    ).map(pricedLine);
    // Three units of PE 1349 each: line 1 keeps its unit; line 2's two units lose 539.6 each.
    expect(results.map((line) => line.expectedUnroundedCents.toString())).toEqual(['2112', '3144.8']);
    const step = results[1]?.trace.steps.adjustments[0];
    expect(step?.name === 'mppr' && step.reductions.map((item) => [item.unit, item.rank, item.cut_cents])).toEqual([
      [1, 2, '539.6'],
      [2, 3, '539.6'],
    ]);
  });

  it('neither ranks nor reduces a code with no mppr_rate record, nor a line with the flag off', () => {
    const flagOff = contractAgreement({ terms: percentTerms({ codes: ['97140'] }), rateRecordId: 'rr-off' });
    const results = price(
      pricingInput(release, [
        lineFacts({ lineNo: 1, procedureCode: '97161', agreement: mppr }),
        lineFacts({ lineNo: 2, procedureCode: '97140', agreement: flagOff }),
        lineFacts({ lineNo: 3, procedureCode: '97110', agreement: mppr }),
      ]),
    ).map(pricedLine);
    expect(results.map((line) => line.expectedUnroundedCents.toString())).toEqual(['5917', '2458', '2112']);
    expect(results[0]?.trace.steps.adjustments[0]).toMatchObject({ name: 'mppr', in_pool: false, ranking: [], reductions: [] });
    expect(results[1]?.adjustments).toEqual([]);
  });

  it('reduces per service date', () => {
    const results = price(
      pricingInput(release, [
        lineFacts({ lineNo: 1, procedureCode: '97110', serviceDate: '2026-05-04', agreement: mppr }),
        lineFacts({ lineNo: 2, procedureCode: '97110', serviceDate: '2026-05-06', agreement: mppr }),
      ]),
    ).map(pricedLine);
    expect(results.map((line) => line.expectedUnroundedCents.toString())).toEqual(['2112', '2112']);
  });

  it('falls back to the general practice-expense reduction when the code’s share is null', () => {
    const noShare = releaseVariant(base, (records) =>
      records.map((record) => (record.record_type === 'mppr_rate' && keyOf(record).hcpcs === '97140' ? ruleRecordLike(record, { value: { pe_reduction_percent: null } }) : record)),
    );
    const results = price(pricingInput(noShare, [lineFacts({ lineNo: 1, procedureCode: '97530', agreement: mppr }), lineFacts({ lineNo: 2, procedureCode: '97140', agreement: mppr })])).map(pricedLine);
    expect(results[1]?.expectedUnroundedCents.toString()).toBe('1819.6');
    expect(results[1]?.trace.steps.adjustments[0]).toMatchObject({ general_record: { key: { component: 'practice_expense' } }, reduction_percent: '40' });
  });

  it('is ENGINE_ERROR for a line whose code has no share and no general reduction, while the day’s other lines are still reduced', () => {
    const noRate = releaseVariant(base, (records) =>
      records
        .filter((record) => !(record.record_type === 'mppr_rate' && keyOf(record).component === 'practice_expense'))
        .map((record) => (record.record_type === 'mppr_rate' && keyOf(record).hcpcs === '97530' ? ruleRecordLike(record, { value: { pe_reduction_percent: null } }) : record)),
    );
    const [first, second] = price(pricingInput(noRate, [lineFacts({ lineNo: 1, procedureCode: '97530', agreement: mppr }), lineFacts({ lineNo: 2, procedureCode: '97140', agreement: mppr })]));
    expect(reasonOf(first as LinePricing)).toBe('ENGINE_ERROR no_mppr_rate');
    expect(unpricedLine(first).trace.outcome).toMatchObject({ step: 'mppr' });
    expect(pricedLine(second).expectedUnroundedCents.toString()).toBe('1819.6');
  });

  it('records in each line’s trace the day’s first unit and the line’s own units only', () => {
    const results = price(
      pricingInput(release, [
        lineFacts({ lineNo: 1, procedureCode: '97530', agreement: mppr }),
        lineFacts({ lineNo: 2, procedureCode: '97110', units: '3', agreement: mppr }),
        lineFacts({ lineNo: 3, procedureCode: '97140', units: '2', agreement: mppr }),
      ]),
    ).map(pricedLine);
    const ranking = (line: PricedLine | undefined) => {
      const step = line?.trace.steps.adjustments[0];
      return step?.name === 'mppr' ? step.ranking.map((item) => [item.rank, item.line_no, item.unit]) : null;
    };
    expect(ranking(results[0])).toEqual([[1, 1, 1]]);
    expect(ranking(results[1])).toEqual([
      [1, 1, 1],
      [4, 2, 1],
      [5, 2, 2],
      [6, 2, 3],
    ]);
    expect(ranking(results[2])).toEqual([
      [1, 1, 1],
      [2, 3, 1],
      [3, 3, 2],
    ]);
  });

  it('stops every line of the day with ENGINE_ERROR when the pool cannot be known', () => {
    const rate = base.records.find((record) => record.record_type === 'mppr_rate' && keyOf(record).hcpcs === '97140') as RuleRecord;
    const twice = releaseVariant(base, (records) => [...records, ruleRecordLike(rate, { effective_from: '2026-02-01' })]);
    const results = price(pricingInput(twice, [lineFacts({ lineNo: 1, procedureCode: '97110', agreement: mppr }), lineFacts({ lineNo: 2, procedureCode: '97140', agreement: mppr })]));
    expect(results.map(reasonOf)).toEqual(['ENGINE_ERROR release_records_overlap', 'ENGINE_ERROR release_records_overlap']);
  });
});

describe('step 4b, the assistant reduction', () => {
  const assistant = contractAgreement({ terms: percentTerms({ flags: { apply_assistant_reduction: true } }) });

  it('pays the release’s percentage with CQ or CO, once with both, and leaves other lines unchanged', () => {
    for (const modifiers of [['GP', 'CQ'], ['GO', 'CO'], ['CO', 'CQ']]) {
      expect(pricedLine(priceOne({ modifiers, agreement: assistant })).expectedUnroundedCents.toString(), modifiers.join(' ')).toBe('1626.24');
    }
    const plain = pricedLine(priceOne({ agreement: assistant }));
    expect(amounts(plain)).toEqual([['assistant_reduction', '2112', '2112']]);
  });

  it('is not applied with the flag off', () => {
    expect(pricedLine(priceOne({ modifiers: ['GP', 'CQ'], agreement: contractAgreement() })).expectedUnroundedCents.toString()).toBe('2112');
  });

  it('is ENGINE_ERROR without an assistant record, or when CQ and CO carry different percentages', () => {
    const none = releaseVariant(base, (records) => records.filter((record) => record.record_type !== 'assistant_modifier'));
    expect(reasonOf(priceOne({ modifiers: ['CQ'], agreement: assistant }, {}, none))).toBe('ENGINE_ERROR no_assistant_record');
    const differ = releaseVariant(base, (records) =>
      records.map((record) => (record.record_type === 'assistant_modifier' && keyOf(record).modifier === 'CO' ? ruleRecordLike(record, { value: { payment_percent: '80' } }) : record)),
    );
    expect(reasonOf(priceOne({ modifiers: ['CQ', 'CO'], agreement: assistant }, {}, differ))).toBe('ENGINE_ERROR assistant_percentages_differ');
  });
});

describe('step 4c, sequestration', () => {
  const sequestered = contractAgreement({ terms: percentTerms({ flags: { apply_sequestration: true } }) });
  const share = (amount: bigint) => [{ groupCode: 'PR' as const, reasonCode: '2', amountCents: cents(amount) }];

  it('takes the release’s percentage of the payer’s share, after the patient share', () => {
    // (2112 - 422) x 3% = 50.7.
    expect(pricedLine(priceOne({ patientShareAdjustments: share(422n), agreement: sequestered })).expectedUnroundedCents.toString()).toBe('2061.3');
  });

  it('takes nothing when the patient share exceeds the amount', () => {
    const line = pricedLine(priceOne({ patientShareAdjustments: share(2500n), agreement: sequestered }));
    expect(line.expectedUnroundedCents.toString()).toBe('2112');
    expect(line.trace.steps.adjustments[0]).toMatchObject({ payer_share_cents: '0', cut_cents: '0' });
  });

  it('takes nothing while sequestration is suspended, and is ENGINE_ERROR with no record on the date', () => {
    const suspended = releaseVariant(base, (records) =>
      records.map((record) => (record.record_type === 'sequestration' ? ruleRecordLike(record, { value: { reduction_percent: '0', applies_to: 'SYNTHETIC suspension', suspended: true } }) : record)),
    );
    expect(pricedLine(priceOne({ agreement: sequestered }, {}, suspended)).expectedUnroundedCents.toString()).toBe('2112');
    const none = releaseVariant(base, (records) => records.filter((record) => record.record_type !== 'sequestration'));
    expect(reasonOf(priceOne({ agreement: sequestered }, {}, none))).toBe('ENGINE_ERROR no_sequestration_record');
  });
});

describe('step 4d, the contract-specific adjustment', () => {
  it('pays the record’s percentage of the amount after the Medicare adjustments', () => {
    const terms = fixedTerms(3250n, { flags: { apply_assistant_reduction: true, apply_sequestration: true }, adjustment: { kind: 'PERCENT', percent: '92.5' } });
    const line = pricedLine(priceOne({ modifiers: ['GP', 'CQ'], agreement: contractAgreement({ terms }) }));
    // 3250 x 77% = 2502.5; less 3% = 2427.425; x 92.5% = 2245.368125.
    expect(line.adjustments.map((item) => [item.name, item.afterCents.toString()])).toEqual([
      ['assistant_reduction', '2502.5'],
      ['sequestration', '2427.425'],
      ['contract_adjustment', '2245.368125'],
    ]);
    expect(line.expectedAllowedCents).toBe(2245n);
    expect(line.trace.steps.adjustments[2]).toEqual({ name: 'contract_adjustment', before_cents: '2427.425', after_cents: '2245.368125', kind: 'PERCENT', percent: '92.5', cap_cents: null });
    expect(line.trace.terms?.contract_adjustment).toEqual({ kind: 'PERCENT', percent: '92.5' });
  });

  it('holds the line to the record’s cap, and leaves an amount under it alone', () => {
    const capped = contractAgreement({ terms: fixedTerms(3433n, { adjustment: { kind: 'CAP', capCents: 6000n } }) });
    const over = pricedLine(priceOne({ units: '2', agreement: capped }));
    expect([over.baseCents.toString(), over.expectedAllowedCents]).toEqual(['6866', 6000n]);
    expect(over.trace.steps.adjustments[0]).toEqual({ name: 'contract_adjustment', before_cents: '6866', after_cents: '6000', kind: 'CAP', percent: null, cap_cents: '6000' });
    expect(pricedLine(priceOne({ agreement: capped })).expectedAllowedCents).toBe(3433n);
    const percent = pricedLine(priceOne({ agreement: contractAgreement({ terms: percentTerms({ adjustment: { kind: 'CAP', capCents: 2000n } }) }) }));
    expect(percent.expectedAllowedCents).toBe(2000n);
    const visit = pricedLine(priceOne({ agreement: contractAgreement({ terms: perVisitTerms(3000n, { adjustment: { kind: 'CAP', capCents: 2500n } }) }) }));
    expect(visit.expectedAllowedCents).toBe(2500n);
    const lesser = pricedLine(priceOne({ chargeCents: cents(5000n), agreement: contractAgreement({ terms: lesserOfTerms({ fixedCents: 3400n }, { adjustment: { kind: 'PERCENT', percent: '98' } }) }) }));
    expect(lesser.expectedUnroundedCents.toString()).toBe('3332');
  });

  it('leaves no entry when the record defines none', () => {
    expect(pricedLine(priceOne({ agreement: contractAgreement({ terms: fixedTerms(3250n) }) })).adjustments).toEqual([]);
    expect(pricedLine(priceOne({})).adjustments.map((item) => item.name)).toEqual(['mppr', 'assistant_reduction', 'sequestration']);
  });
});

describe('step 5, the claim', () => {
  it('works a secondary or tertiary claim through, forwarded or not, then stops it with SECONDARY_PAYER', () => {
    for (const status of ['2', '3', '20', '21']) {
      const result = unpricedLine(priceOne({}, { claim: { claimStatusCode: status } }));
      expect(result.reason).toBe('SECONDARY_PAYER');
      expect(result.trace.steps.adjustments).toHaveLength(3);
      expect(result.trace.steps.patient_share_cents).toBe('0');
    }
  });

  it('stops a reversal, and a claim reversed and not corrected, with REVERSED_CLAIM; prices a denied claim', () => {
    expect(reasonOf(priceOne({ chargeCents: cents(-6000n) }, { claim: { claimStatusCode: '22' } }))).toBe('REVERSED_CLAIM');
    expect(reasonOf(priceOne({}, { claim: { reversed: true } }))).toBe('REVERSED_CLAIM');
    expect(reasonOf(priceOne({ observedAllowedCents: cents(0n) }, { claim: { claimStatusCode: '4' } }))).toBe('priced');
  });

  it('prices a claim processed as primary and forwarded (19) as a primary claim', () => {
    const forwarded = pricedLine(priceOne({}, { claim: { claimStatusCode: '19' } }));
    expect(forwarded.expectedAllowedCents).toBe(pricedLine(priceOne({})).expectedAllowedCents);
  });

  it('stops 23 and 25 for review without paging the operator, and is an operator alert for a status outside the 835’s list or a reversed claim a correction supersedes', () => {
    for (const status of ['23', '25']) {
      const line = unpricedLine(priceOne({}, { claim: { claimStatusCode: status } }));
      expect(reasonOf(line), status).toBe('ENGINE_ERROR claim_status_not_priced');
      expect(line.detail !== null && line.reason === 'ENGINE_ERROR' && pagesOperator(line.detail as never)).toBe(false);
    }
    expect(REVIEW_DETAILS).toEqual(['claim_status_not_priced', 'mppr_needs_fee_schedule']);
    expect(reasonOf(priceOne({}, { claim: { claimStatusCode: '24' } }))).toBe('ENGINE_ERROR claim_status_unknown');
    expect(pagesOperator('claim_status_unknown')).toBe(true);
    expect(reasonOf(priceOne({}, { claim: { reversed: true, corrected: true } }))).toBe('ENGINE_ERROR reversed_and_corrected');
  });

  it('records a negative variance and keeps the line priced (PRC-15)', () => {
    const line = pricedLine(priceOne({ observedAllowedCents: cents(2500n) }));
    expect(line.varianceCents).toBe(cents(2049n - 2500n));
    expect(line.trace.steps.variance_cents).toBe('-451');
  });
});

describe('step 6, one rounding', () => {
  // 97140 at 125%: 3072.5 cents exactly, a half cent.
  const half = (rounding: 'HALF_UP_CENT' | 'HALF_EVEN_CENT' | 'TRUNCATE' | null) => contractAgreement({ terms: percentTerms({ percentage: '125', codes: ['97140'], rounding }) });

  it('rounds a half cent under each rule and keeps the unrounded value (PRC-13)', () => {
    const results = (['HALF_UP_CENT', 'HALF_EVEN_CENT', 'TRUNCATE'] as const).map((rule) => pricedLine(priceOne({ procedureCode: '97140', agreement: half(rule) })));
    expect(results.map((line) => [line.rounding, line.expectedUnroundedCents.toString(), line.expectedAllowedCents])).toEqual([
      ['HALF_UP_CENT', '3072.5', 3073n],
      ['HALF_EVEN_CENT', '3072.5', 3072n],
      ['TRUNCATE', '3072.5', 3072n],
    ]);
    expect(results[0]?.trace.steps.rounding?.origin).toBe('rate_record');
  });

  it('takes the practice default when the record is silent, and HALF_UP_CENT when that is unset', () => {
    const practice = pricedLine(priceOne({ procedureCode: '97140', agreement: half(null) }, { settings: practiceSettings({ defaultRounding: 'HALF_EVEN_CENT' }) }));
    expect([practice.rounding, practice.expectedAllowedCents, practice.trace.steps.rounding?.origin]).toEqual(['HALF_EVEN_CENT', 3072n, 'practice_default']);
    const unset = pricedLine(priceOne({ procedureCode: '97140', agreement: half(null) }, { settings: practiceSettings({ defaultRounding: null }) }));
    expect([unset.rounding, unset.expectedAllowedCents, unset.trace.steps.rounding?.origin]).toEqual(['HALF_UP_CENT', 3073n, 'engine_default']);
  });
});

describe('step 8, the dispute window', () => {
  it('takes the contract’s dispute window from the remittance date; a passed deadline is WINDOW_PASSED, not a price change (PRC-14)', () => {
    const windows = { timely_filing_days: 180, dispute_window_days: 90, appeal_levels: [{ level: 1, days: 60 }] };
    const agreement = contractAgreement({ windows });
    const open = pricedLine(priceOne({ agreement }, { asOf: '2026-06-30' }));
    expect(open.window).toEqual({ endsOn: '2026-06-30', status: 'OPEN' });
    const passed = pricedLine(priceOne({ agreement }, { asOf: '2026-07-01' }));
    expect(passed.window).toEqual({ endsOn: '2026-06-30', status: 'WINDOW_PASSED' });
    expect(passed.expectedAllowedCents).toBe(open.expectedAllowedCents);
    expect(passed.trace.agreement?.windows).toEqual(windows);
  });

  it('takes Original Medicare’s first-level window for a Medicare Advantage non-contracted line', () => {
    const line = pricedLine(priceOne({}));
    // SYNTHETIC redetermination: 111 days from the remittance date, 2026-04-01.
    expect(line.window).toEqual({ endsOn: '2026-07-21', status: 'WINDOW_PASSED' });
    expect(line.trace.steps.window).toMatchObject({ source: 'release', length: 111, unit: 'days', measured_from: 'remittance_date', from_date: '2026-04-01' });
  });

  it('has no window without a remittance date, or for a silent contract with no commercial default in the release', () => {
    expect(pricedLine(priceOne({}, { claim: { remittanceDate: null } })).window).toEqual({ endsOn: null, status: 'NO_WINDOW' });
    expect(pricedLine(priceOne({ agreement: contractAgreement() })).window).toEqual({ endsOn: null, status: 'NO_WINDOW' });
  });

  it('takes the release’s commercial default for a silent contract, measured as the record says', () => {
    const medicare = base.records.find((record) => record.record_type === 'dispute_window' && keyOf(record).window === 'redetermination') as RuleRecord;
    const withDefault = releaseVariant(base, (records) => [
      ...records,
      ruleRecordLike(medicare, { key: { program: 'commercial_default', window: 'redetermination' }, value: { length: 6, unit: 'months', measured_from: 'date_of_service' } }),
    ]);
    const line = pricedLine(priceOne({ agreement: contractAgreement() }, { asOf: '2026-09-10' }, withDefault));
    expect(line.window).toEqual({ endsOn: '2026-09-10', status: 'OPEN' });
    expect(line.trace.steps.window).toMatchObject({ source: 'release', measured_from: 'date_of_service', from_date: '2026-03-10' });
  });

  it('is ENGINE_ERROR when the window’s rule cannot be read', () => {
    const medicare = base.records.find((record) => record.record_type === 'dispute_window' && keyOf(record).window === 'redetermination') as RuleRecord;
    const twice = releaseVariant(base, (records) => [...records, ruleRecordLike(medicare, { effective_from: '2026-02-01' })]);
    const result = unpricedLine(priceOne({}, {}, twice));
    expect(reasonOf(result)).toBe('ENGINE_ERROR release_records_overlap');
    expect(result.trace.outcome).toMatchObject({ step: 'window' });
  });
});

describe('inputs the engine refuses', () => {
  it('is ENGINE_ERROR for settings it cannot read', () => {
    const settings = [
      practiceSettings({ zip: '1234' }),
      practiceSettings({ defaultRounding: 'NEAREST' as never }),
      practiceSettings({ placeOfServiceSettings: { '1': 'facility' } }),
      practiceSettings({ placeOfServiceSettings: { '11': 'clinic' as never } }),
      // One bad place among good ones.
      practiceSettings({ placeOfServiceSettings: { '11': 'non_facility', '22': 'clinic' as never } }),
    ];
    for (const setting of settings) {
      expect(reasonOf(priceOne({}, { settings: setting }))).toBe('ENGINE_ERROR invalid_settings');
    }
    expect(reasonOf(priceOne({}, { asOf: '2026-02-30' }))).toBe('ENGINE_ERROR invalid_settings');
  });

  it('is ENGINE_ERROR for two lines with one number', () => {
    const results = price(pricingInput(release, [lineFacts({ lineNo: 1 }), lineFacts({ lineNo: 1 }), lineFacts({ lineNo: 2 })]));
    expect(results.map(reasonOf)).toEqual(['ENGINE_ERROR duplicate_line_no', 'ENGINE_ERROR duplicate_line_no', 'priced']);
  });

  it.each<[string, Partial<LineFacts>]>([
    ['line number', { lineNo: 0 }],
    ['fractional line number', { lineNo: 3 / 2 }],
    ['procedure code', { procedureCode: '9711' }],
    ['five modifiers', { modifiers: ['GP', '59', 'KX', 'CQ', 'XU'] }],
    ['a repeated modifier', { modifiers: ['GP', 'GP'] }],
    ['a modifier', { modifiers: ['G'] }],
    ['service date', { serviceDate: '2026-13-01' }],
    ['place of service', { placeOfService: '1' }],
    ['observed basis', { observedAllowedBasis: 'paid' as never }],
    ['patient share group', { patientShareAdjustments: [{ groupCode: 'CO' as never, reasonCode: '45', amountCents: cents(10n) }] }],
  ])('is ENGINE_ERROR for a malformed %s', (_label, facts) => {
    const result = unpricedLine(priceOne(facts));
    expect(reasonOf(result)).toBe('ENGINE_ERROR invalid_line_facts');
    expect(result.trace.agreement).toBeNull();
  });
});

describe('the trace', () => {
  it('records every input value, record and release, step by step, and passes its schema', () => {
    const input: PricingInput = pricingInput(release, [lineFacts({ serviceLineId: 'sl-synth-1', units: '2', modifiers: ['GP', 'CQ'] })]);
    const line = pricedLine(only(price(input)));
    const trace = parseTrace(JSON.parse(JSON.stringify(line.trace)));
    expect(trace.release).toEqual({ number: 900001, manifest_sha256: release.manifestSha256 });
    expect(trace.line).toMatchObject({ line_no: 1, service_line_id: 'sl-synth-1', procedure_code: '97110', units: '2', charge_cents: '6000' });
    expect(trace.terms?.flags).toEqual(MA_TERMS.flags);
    expect(trace.steps.fee_schedule?.rvu?.record).toMatchObject({ record_type: 'pfs_rvu', key: { hcpcs: '97110', modifier: '' } });
    expect(trace.steps.fee_schedule?.rvu?.record.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(trace.steps.adjustments.map((item) => item.name)).toEqual(['mppr', 'assistant_reduction', 'sequestration']);
    expect(trace.outcome).toEqual({ result: 'priced', expected_allowed_cents: line.expectedAllowedCents.toString(), expected_unrounded_cents: line.expectedUnroundedCents.toString(), review_flags: [] });
    expect(trace.steps.units?.mue).toMatchObject({ checked: true, value: 7, record: { record_type: 'ncci_mue', key: { hcpcs: '97110' } } });
    expect(trace.steps.ncci_ptp).toEqual({ edits: [] });
    expect(trace.steps.per_visit).toBeNull();
  });

  it('is plain JSON for every outcome and method', () => {
    const lines = [
      lineFacts({ lineNo: 1 }),
      lineFacts({ lineNo: 2, agreement: { outcome: 'NO_MAPPING' } }),
      lineFacts({ lineNo: 3, units: 'x' }),
      lineFacts({ lineNo: 4, procedureCode: '97750' }),
      lineFacts({ lineNo: 5, agreement: contractAgreement({ terms: fixedTerms(100n, { adjustment: { kind: 'CAP', capCents: 50n } }) }) }),
      lineFacts({ lineNo: 6, agreement: contractAgreement({ terms: perVisitTerms(100n) }) }),
      lineFacts({ lineNo: 7, agreement: contractAgreement({ terms: lesserOfTerms({ percentage: '110' }) }) }),
      lineFacts({ lineNo: 8, agreement: contractAgreement({ terms: { ...percentTerms(), method: 'UNSUPPORTED', parameters: {} } }) }),
    ];
    for (const result of price(pricingInput(release, lines))) {
      expect(parseTrace(JSON.parse(JSON.stringify(result.trace)))).toEqual(result.trace);
    }
  });

  it('names the release it priced under', () => {
    const other = indexRelease({ ...base, releaseNo: 900009, manifestSha256: 'f'.repeat(64) });
    expect(priceOne({}, {}, other).trace.release).toEqual({ number: 900009, manifest_sha256: 'f'.repeat(64) });
  });
});

describe('MA non-contracted lines', () => {
  it('apply every Medicare adjustment and the practice rounding', () => {
    const line = pricedLine(priceOne({ agreement: maAgreement(), modifiers: ['GP', 'CQ'] }, { settings: practiceSettings({ defaultRounding: 'TRUNCATE' }) }));
    // 2112 x 77% = 1626.24; less 3% of 1626.24 = 48.7872: 1577.4528, truncated to 1577.
    expect(line.expectedUnroundedCents.toString()).toBe('1577.4528');
    expect([line.expectedAllowedCents, line.rounding]).toEqual([1577n, 'TRUNCATE']);
  });
});
