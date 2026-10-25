import { price } from '@tp/pricing';
import { describe, expect, it } from 'vitest';

import { type EngineRun, type GoldenExpectedLine, agreementRecords, claimRelease, claimReleaseFiles, compareLine, engineDifferences, goldenPricingInput, goldenRelease, readGoldenClaims } from './engine';

/**
 * The golden comparison itself must catch a changed cent: these tests change golden expected results
 * in memory (never on disk) and check that each change is reported, field by field.
 *
 * Each test prices the claims it reads, under a release index of its own, and nothing the engine computes is shared
 * between tests (docs/adr/0066, Part 4): priced once when the file loads, every engine mutant would be static to
 * Stryker, which then runs the whole of pricing's tests for it instead of the tests that reach it.
 */
const claims = readGoldenClaims();
// Read once, while the tests are collected: each release the claims name, as files. Indexing it is the engine's code.
const releaseFiles = claimReleaseFiles(claims);

/** A golden claim priced by the test that asks, under its release as that test indexes it. */
function priced({ file, claim }: (typeof claims)[number]): EngineRun {
  return { file, claim, results: price({ ...goldenPricingInput(claim), release: claimRelease(claim, releaseFiles) }) };
}

const run = (id: string) => {
  const found = claims.find((item) => item.claim.id === id);
  expect(found, id).toBeDefined();
  return priced(found as (typeof claims)[number]);
};

function differencesFor(id: string, lineNo: number, change: (line: GoldenExpectedLine) => GoldenExpectedLine): string[] {
  const { file, claim, results } = run(id);
  const golden = claim.expected.lines.find((line) => line.line_no === lineNo) as GoldenExpectedLine;
  return compareLine(file, claim, change(golden), results.find((result) => result.lineNo === lineNo)).map((item) => item.field);
}

describe('the engine’s golden comparison', () => {
  it('finds no difference on the committed lines', () => {
    expect(engineDifferences(claims.map(priced))).toEqual([]);
  });

  it('reports a changed cent, unrounded value, rounding, patient share, method, terms, base, adjustment, variance or window', () => {
    expect(differencesFor('G01', 1, (line) => ({ ...line, expected_allowed_cents: '3077' }))).toEqual(['expected_allowed_cents']);
    expect(differencesFor('G01', 1, (line) => ({ ...line, expected_unrounded_cents: '3075.657' }))).toEqual(['expected_unrounded_cents']);
    expect(differencesFor('G01', 1, (line) => ({ ...line, rounding: 'TRUNCATE' }))).toEqual(['rounding']);
    expect(differencesFor('G01', 1, (line) => ({ ...line, patient_share_cents: '841' }))).toEqual(['patient_share_cents']);
    expect(differencesFor('G01', 1, (line) => ({ ...line, method: 'FIXED_SCHEDULE' }))).toEqual(['method']);
    expect(differencesFor('G02', 1, (line) => ({ ...line, terms: { mapping_id: 'map-g02', mapping_kind: 'contract', contract_version_id: 'cv-g02-1', rate_record_id: 'rr-other' } }))).toEqual(['terms']);
    expect(differencesFor('G01', 1, (line) => ({ ...line, base_cents: '4225' }))).toEqual(['base_cents']);
    expect(differencesFor('G01', 1, (line) => ({ ...line, adjustments: (line.adjustments ?? []).map((item) => (item.name === 'mppr' ? { ...item, after_cents: '3144.9' } : item)) }))).toEqual([
      'adjustments',
      'trace adjustments',
    ]);
    expect(differencesFor('G01', 1, (line) => ({ ...line, adjustments: (line.adjustments ?? []).slice(1) }))).toEqual(['adjustments', 'trace adjustments']);
    expect(differencesFor('G58', 2, (line) => ({ ...line, variance_cents: '196' }))).toEqual(['variance_cents']);
    expect(differencesFor('G59', 1, (line) => ({ ...line, window: { ends_on: '2026-09-19', status: 'OPEN' } }))).toEqual(['window']);
    expect(differencesFor('G102', 2, (line) => ({ ...line, review_flags: [] }))).toEqual(['review_flags']);
    expect(differencesFor('G102', 1, (line) => ({ ...line, review_flags: [{ flag: 'NCCI_PTP', column1_line_no: 2 }] }))).toEqual(['review_flags']);
    expect(differencesFor('G111', 1, (line) => ({ ...line, adjustments: (line.adjustments ?? []).filter((item) => item.name !== 'contract_adjustment') }))).toEqual(['adjustments', 'trace adjustments']);
  });

  it('reports a changed outcome or reason, and a line missing on either side', () => {
    expect(differencesFor('G36', 1, (line) => ({ ...line, unpriced_reason: 'NO_AGREEMENT' }))).toEqual(['unpriced_reason']);
    expect(differencesFor('G36', 1, () => ({ line_no: 1, outcome: 'priced', expected_allowed_cents: '1' }))).toEqual(['outcome']);
    expect(differencesFor('G01', 1, () => ({ line_no: 1, outcome: 'unpriced', unpriced_reason: 'NO_MAPPING' }))).toEqual(['outcome']);
    const { file, claim } = run('G01');
    expect(compareLine(file, claim, claim.expected.lines[0] as GoldenExpectedLine, undefined).map((item) => item.field)).toEqual(['(line)']);
    const fewer = { ...run('G01'), claim: { ...claim, expected: { lines: claim.expected.lines.slice(1) } } };
    expect(engineDifferences([fewer]).map((item) => [item.line_no, item.field])).toEqual([[1, '(line)']]);
  });

  it('builds the records @tp/contracts loads: half-open windows, general terms without codes, the version windows, signed-off records only', () => {
    const g42 = readGoldenClaims().find((item) => item.claim.id === 'G42');
    const records = agreementRecords(g42?.claim as NonNullable<typeof g42>['claim']);
    const scope = records.rateRecords[0]?.terms.scope;
    expect(scope).toEqual({ effective_from: '2026-01-01', effective_to: '2026-04-01' });
    const g40 = readGoldenClaims().find((item) => item.claim.id === 'G40');
    expect(agreementRecords(g40?.claim as NonNullable<typeof g40>['claim']).rateRecords.map((record) => record.terms.scope.codes ?? 'every code')).toEqual(['every code', ['97110']]);
    const g58 = readGoldenClaims().find((item) => item.claim.id === 'G58');
    expect(agreementRecords(g58?.claim as NonNullable<typeof g58>['claim']).versions[0]?.windows).toEqual({ timely_filing_days: 180, dispute_window_days: 90, appeal_levels: [{ level: 1, days: 90 }, { level: 2, days: 60 }] });
    expect(goldenPricingInput(g58?.claim as NonNullable<typeof g58>['claim'])).toMatchObject({ asOf: '2026-10-15', claim: { remittanceDate: '2026-07-17' } });
    const g49 = readGoldenClaims().find((item) => item.claim.id === 'G49');
    expect(agreementRecords(g49?.claim as NonNullable<typeof g49>['claim']).rateRecords).toEqual([]);
    const g41 = readGoldenClaims().find((item) => item.claim.id === 'G41');
    expect(agreementRecords(g41?.claim as NonNullable<typeof g41>['claim']).rateRecords[0]?.terms.scope).toMatchObject({ modifier_sets: [['GP']], places_of_service: ['11'] });
  });

  it('builds every method’s parameters as the product stores them, a null contract adjustment left out', () => {
    const terms = (id: string, recordId: string) => {
      const found = readGoldenClaims().find((item) => item.claim.id === id);
      return agreementRecords(found?.claim as NonNullable<typeof found>['claim']).rateRecords.find((record) => record.id === recordId)?.terms;
    };
    expect(terms('G101', 'rr-a1-97110')).toMatchObject({ method: 'FIXED_SCHEDULE', parameters: { amount_cents: 3250n } });
    expect(terms('G101', 'rr-a1-97110')?.parameters).not.toHaveProperty('contract_adjustment');
    expect(terms('G111', 'rr-a2-97530')).toMatchObject({ method: 'FIXED_SCHEDULE', parameters: { amount_cents: 3433n, contract_adjustment: { kind: 'CAP', cap_cents: 6000n } } });
    expect(terms('G121', 'rr-b-fixed')).toMatchObject({ method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: 3400n }, charge_basis: 'LINE_CHARGE' } });
    expect(terms('G123', 'rr-b-medicare')).toMatchObject({ method: 'LESSER_OF', parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', locality_basis: { kind: 'PRACTICE' } } } });
    expect(terms('G141', 'rr-c-visit')).toMatchObject({ method: 'PER_VISIT', parameters: { amount_cents: 8800n } });
    expect(terms('G181', 'rr-e1-therapy')).toMatchObject({ method: 'PERCENT_OF_MEDICARE', parameters: { year_basis: 'LOCKED:2025', contract_adjustment: { kind: 'PERCENT' } } });
    expect(terms('G109', 'rr-a1-g0283')).toMatchObject({ method: 'UNSUPPORTED', parameters: {} });
  });

  it('refuses a release whose manifest is not the one the claim names', () => {
    const { claim } = run('G01');
    expect(() => goldenRelease({ ...claim.inputs.release, manifest_sha256: '0'.repeat(64) })).toThrow(/is not release/);
    expect(() => goldenRelease({ ...claim.inputs.release, dir: 'fixtures/golden/claims' })).toThrow(/does not verify/);
    expect(goldenPricingInput(claim).release.releaseNo).toBe(900001);
  });
});
