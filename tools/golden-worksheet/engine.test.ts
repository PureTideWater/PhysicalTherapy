import { describe, expect, it } from 'vitest';

import { type GoldenExpectedLine, agreementRecords, compareLine, engineDifferences, goldenPricingInput, goldenRelease, readGoldenClaims, runEngineOnGolden } from './engine';

/**
 * The golden comparison itself must catch a changed cent: these tests change golden expected results
 * in memory (never on disk) and check that each change is reported, field by field.
 */
const runs = runEngineOnGolden();
const run = (id: string) => {
  const found = runs.find((item) => item.claim.id === id);
  expect(found, id).toBeDefined();
  return found as (typeof runs)[number];
};

function differencesFor(id: string, lineNo: number, change: (line: GoldenExpectedLine) => GoldenExpectedLine): string[] {
  const { file, claim, results } = run(id);
  const golden = claim.expected.lines.find((line) => line.line_no === lineNo) as GoldenExpectedLine;
  return compareLine(file, claim, change(golden), results.find((result) => result.lineNo === lineNo)).map((item) => item.field);
}

describe('the engine’s golden comparison', () => {
  it('finds no difference on the committed lines', () => {
    expect(engineDifferences(runs)).toEqual([]);
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

  it('refuses a release whose manifest is not the one the claim names', () => {
    const { claim } = run('G01');
    expect(() => goldenRelease({ ...claim.inputs.release, manifest_sha256: '0'.repeat(64) })).toThrow(/is not release/);
    expect(() => goldenRelease({ ...claim.inputs.release, dir: 'fixtures/golden/claims' })).toThrow(/does not verify/);
    expect(goldenPricingInput(claim).release.releaseNo).toBe(900001);
  });
});
