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
  keyOf,
  lineFacts,
  maAgreement,
  mappingRecord,
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

  it('refuses the methods of milestone 7 and a contract-named locality with ENGINE_ERROR, never a guess', () => {
    const methods = [
      { method: 'FIXED_SCHEDULE', parameters: { amount_cents: '3200' } },
      { method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '3200' }, charge_basis: 'LINE_CHARGE' } },
      { method: 'PER_VISIT', parameters: { amount_cents: '9000' } },
    ];
    for (const entered of methods) {
      const terms = parseRateTerms({ scope: { codes: ['97110'] }, ...entered }, true);
      expect(reasonOf(priceOne({ agreement: contractAgreement({ terms }) }))).toBe('ENGINE_ERROR method_not_in_phase_one');
    }
    const named = parseRateTerms(
      { scope: { codes: ['97110'] }, method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '100', year_basis: 'CURRENT', locality_basis: { kind: 'NAMED', carrier: '99999', locality: '01' }, conversion_factor: 'non_qualifying_apm' } },
      true,
    );
    const result = unpricedLine(priceOne({ agreement: contractAgreement({ terms: named }) }));
    expect(reasonOf(result)).toBe('ENGINE_ERROR locality_basis_not_in_phase_one');
    expect(result.trace.outcome).toMatchObject({ step: 'method' });
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
    expect(line.trace.steps.units).toEqual({ units: '2', timed_units_rule: 'UNKNOWN', base_cents: '4224' });
    expect(line.trace.steps.adjustments).toEqual([]);
    // 97110's PE (1349) is below 97140's (1596) anyway; the 97140 unit is the day's only ranked unit.
    expect(pricedLine(second).trace.steps.adjustments[0]).toMatchObject({ name: 'mppr', ranking: [{ rank: 1, line_no: 2, unit: 1 }], reductions: [] });
    for (const rule of ['MEDICARE_POOLED', 'PER_CODE'] as const) {
      expect(reasonOf(priceOne({ agreement: contractAgreement({ terms: percentTerms({ flags: { timed_units_rule: rule } }) }) })), rule).toBe('priced');
    }
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
    expect(REVIEW_DETAILS).toEqual(['claim_status_not_priced']);
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
    const settings = [practiceSettings({ zip: '1234' }), practiceSettings({ defaultRounding: 'NEAREST' as never }), practiceSettings({ placeOfServiceSettings: { '1': 'facility' } }), practiceSettings({ placeOfServiceSettings: { '11': 'clinic' as never } })];
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
    expect(trace.outcome).toEqual({ result: 'priced', expected_allowed_cents: line.expectedAllowedCents.toString(), expected_unrounded_cents: line.expectedUnroundedCents.toString() });
  });

  it('is plain JSON for every outcome', () => {
    const lines = [lineFacts({ lineNo: 1 }), lineFacts({ lineNo: 2, agreement: { outcome: 'NO_MAPPING' } }), lineFacts({ lineNo: 3, units: 'x' }), lineFacts({ lineNo: 4, procedureCode: '97750' })];
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
