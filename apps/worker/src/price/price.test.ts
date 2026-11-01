import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type AgreementRecords, LOCATION_STATUSES, unmappedPlanIds } from '@tp/contracts';
import type { Cents } from '@tp/money';
import { ENGINE_ERROR_DETAILS, UNPRICED_REASONS, price, recompute } from '@tp/pricing';
import { practiceSettings, syntheticRelease } from '@tp/pricing/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { COVERAGE_FORMAT, COVERAGE_FORMAT_1, type CoverageParts, coverageOf, operatorAlerts, parseCoverage } from './coverage';
import { ENGINE_ERRORS_MESSAGE, READ_OUTSIDE_FETCH_MESSAGE, claimInput, lineResolver, locationStops, priceClaims, runAsOf } from './execute';
import type { StoredClaim, StoredLine } from './lines';
import { RuleReleaseMismatchError } from './release';
import { settingsOf } from './settings';

/**
 * The run's pure parts: how stored lines become the engine's facts and its results become priced_line
 * rows, how coverage is shaped, how practice settings reach the engine, and the operator's alert line.
 * SYNTHETIC release 900001 and invented IDs only.
 */

const PLAN = '11111111-1111-4111-8111-111111111111';
const MAPPING = '22222222-2222-4222-8222-222222222222';

function storedLine(overrides: Partial<StoredLine> = {}): StoredLine {
  return {
    serviceLineId: '33333333-3333-4333-8333-333333333333',
    lineNo: 1,
    procedureCode: '97110',
    modifiers: ['GP'],
    units: '2',
    serviceDate: '2026-03-10',
    placeOfService: '11',
    chargeCents: 16_000n as Cents,
    observedAllowedCents: 11_000n as Cents,
    observedAllowedBasis: 'paid_plus_pr',
    planId: PLAN,
    patientShare: [{ reasonCode: '2', amountCents: 2200n as Cents }],
    ...overrides,
  };
}

function storedClaim(lines: readonly StoredLine[], overrides: Partial<StoredClaim> = {}): StoredClaim {
  return { claimId: '44444444-4444-4444-8444-444444444444', claimStatusCode: '1', reversed: false, corrected: false, remittanceDate: '2026-04-06', lines, ...overrides };
}

const MA: AgreementRecords = {
  mappings: [{ id: MAPPING, planId: PLAN, kind: 'ma_noncontracted', contractVersionId: null, effectiveFrom: '2026-01-01', effectiveTo: null, supersedesId: null }],
  versions: [],
  rateRecords: [],
};

describe('the engine’s input from stored lines', () => {
  it('carries each line’s facts, its PR adjustments and its resolved agreement, with the claim’s status and remittance date', () => {
    const release = syntheticRelease(900001);
    const input = claimInput(storedClaim([storedLine(), storedLine({ lineNo: 2, serviceLineId: '55555555-5555-4555-8555-555555555555', procedureCode: '97140', units: '1', patientShare: [] })]), lineResolver(MA), release, practiceSettings(), '2026-10-15');
    expect(input.claim).toMatchObject({ claimStatusCode: '1', reversed: false, corrected: false, remittanceDate: '2026-04-06', payerPlanKey: PLAN });
    expect(input.claim.lines[0]).toMatchObject({ lineNo: 1, serviceLineId: '33333333-3333-4333-8333-333333333333', units: '2', patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '2', amountCents: 2200n }] });
    expect(input.claim.lines.map((line) => line.agreement.outcome)).toEqual(['MA_NONCONTRACTED', 'MA_NONCONTRACTED']);
    expect(input.asOf).toBe('2026-10-15');
  });

  it('resolves a line no mapping covers to NO_MAPPING, and a resolver failure to RESOLUTION_FAILED, never a guess', () => {
    const resolve = lineResolver(MA);
    expect(resolve(storedLine({ planId: '66666666-6666-4666-8666-666666666666' }))).toEqual({ outcome: 'NO_MAPPING' });
    // Two mappings of one plan in force on one date break an invariant the database holds.
    const broken = lineResolver({ ...MA, mappings: [...MA.mappings, { ...MA.mappings[0], id: '77777777-7777-4777-8777-777777777777' } as AgreementRecords['mappings'][number]] });
    expect(broken(storedLine())).toEqual({ outcome: 'RESOLUTION_FAILED' });
  });

  it('prices a batch into one row per line, priced with its amounts or unpriced with its reason, and every priced trace recomputes', () => {
    const release = syntheticRelease(900001);
    const claims = [
      storedClaim([storedLine(), storedLine({ lineNo: 2, serviceLineId: '55555555-5555-4555-8555-555555555555', procedureCode: '97140', units: '1' })]),
      storedClaim([storedLine({ serviceLineId: '88888888-8888-4888-8888-888888888888', planId: '66666666-6666-4666-8666-666666666666' })], { claimId: '99999999-9999-4999-8999-999999999999' }),
    ];
    const rows = priceClaims(claims, lineResolver(MA), release, practiceSettings(), '2026-10-15');
    expect(rows.map((row) => [row.serviceLineId, row.unpricedReason])).toEqual([
      ['33333333-3333-4333-8333-333333333333', null],
      ['55555555-5555-4555-8555-555555555555', null],
      ['88888888-8888-4888-8888-888888888888', 'NO_MAPPING'],
    ]);
    const [priced, , unpriced] = rows;
    expect(priced).toMatchObject({ mappingId: MAPPING, contractVersionId: null, rateRecordId: null, method: 'PERCENT_OF_MEDICARE', observedAllowedCents: '11000' });
    expect(BigInt(priced?.varianceCents ?? '0')).toBe(BigInt(priced?.expectedAllowedCents ?? '0') - 11_000n);
    const trace: unknown = JSON.parse(priced?.trace ?? '{}');
    const again = recompute(trace);
    expect(again.differences).toEqual([]);
    expect(again.outcome === 'priced' && again.expectedAllowedCents.toString()).toBe(priced?.expectedAllowedCents);
    expect(again.outcome === 'priced' && again.expectedUnroundedCents.toString()).toBe(priced?.expectedUnrounded);
    expect((JSON.parse(priced?.adjustmentsApplied ?? '[]') as { name: string }[]).map((item) => item.name)).toEqual(['mppr', 'assistant_reduction', 'sequestration']);
    expect(unpriced).toMatchObject({ mappingId: null, method: null, expectedAllowedCents: null, expectedUnrounded: null, varianceCents: null, windowEndsOn: null, adjustmentsApplied: '[]', observedAllowedCents: '11000' });
  });

  it('judges windows on the run’s creation day in UTC', () => {
    expect(runAsOf(new Date('2026-10-15T23:59:59.999Z'))).toBe('2026-10-15');
    expect(runAsOf(new Date('2026-10-16T00:00:00.000Z'))).toBe('2026-10-16');
  });

  it('fails a run on a line stopped by the location only at a status the customer can fix, by the details that status explains (audit #33)', () => {
    const plusFour = ['locality_needs_zip_plus_four', 'zip_plus_four_not_in_locality_map'];
    expect([...(locationStops('zip_plus_four_needed') ?? [])].sort()).toEqual(plusFour);
    expect([...(locationStops('zip_plus_four_unknown') ?? [])].sort()).toEqual(plusFour);
    // A ZIP on no Medicare list explains no_locality; a missing location explains the empty ZIP's invalid_settings.
    expect([...(locationStops('zip_unknown') ?? [])].sort()).toEqual(['locality_needs_zip_plus_four', 'no_locality', 'zip_plus_four_not_in_locality_map']);
    expect([...(locationStops('zip_missing') ?? [])].sort()).toEqual(['invalid_settings', ...plusFour]);
    // A ready location, or content PaidWhole has not loaded, leaves a stopped line ENGINE_ERROR for the operator.
    expect(locationStops('ready')).toBeNull();
    expect(locationStops('locality_not_loaded')).toBeNull();
    expect(locationStops('no_release')).toBeNull();
    // No ZIP+4 file of the ZIP in force is a gap in the content, never the customer's step, at any status (PR 6b-1's
    // review): its line stays ENGINE_ERROR for the operator. Every detail a status names is one the engine gives.
    for (const status of LOCATION_STATUSES) {
      const stops = [...(locationStops(status) ?? [])];
      expect(stops, status).not.toContain('no_locality_plus_four');
      expect(stops.filter((detail) => !(ENGINE_ERROR_DETAILS as readonly string[]).includes(detail)), status).toEqual([]);
    }
  });
});

describe('practice settings for the engine', () => {
  it('passes the ZIP, the default rounding and the place-of-service split as stored', () => {
    expect(settingsOf('00011', { default_rounding: 'HALF_EVEN_CENT', place_of_service_settings: { '11': 'non_facility' }, materiality: 500 })).toEqual({
      zip: '00011',
      defaultRounding: 'HALF_EVEN_CENT',
      placeOfServiceSettings: { '11': 'non_facility' },
    });
    expect(settingsOf(null, {})).toEqual({ zip: '', defaultRounding: null, placeOfServiceSettings: {} });
  });

  it('keeps a malformed setting as text the engine refuses, never dropping it', () => {
    expect(settingsOf('00011', { default_rounding: 5, place_of_service_settings: { '11': true } })).toEqual({ zip: '00011', defaultRounding: '5', placeOfServiceSettings: { '11': 'true' } });
    expect(settingsOf('00011', { place_of_service_settings: ['11'] }).placeOfServiceSettings).toEqual({ invalid: '["11"]' });
    expect(settingsOf('00011', 'settings').placeOfServiceSettings).toEqual({ invalid: 'settings' });
    const [line] = price({
      claim: { claimStatusCode: '1', reversed: false, corrected: false, remittanceDate: null, payerPlanKey: PLAN, lines: claimInput(storedClaim([storedLine()]), lineResolver(MA), syntheticRelease(900001), practiceSettings(), '2026-10-15').claim.lines },
      release: syntheticRelease(900001),
      settings: settingsOf('00011', { place_of_service_settings: ['11'] }),
      asOf: '2026-10-15',
    });
    expect(line?.outcome === 'unpriced' && [line.reason, line.detail]).toEqual(['ENGINE_ERROR', 'invalid_settings']);
  });
});

describe('the coverage summary', () => {
  const parts = {
    totals: { lines: 5, charge_cents: '50000', priced_lines: 2, priced_charge_cents: '20000' },
    reasons: [
      { reason: 'NO_MAPPING' as const, lines: 2, charge_cents: '20000' },
      { reason: 'ENGINE_ERROR' as const, lines: 1, charge_cents: '10000' },
    ],
    details: [
      { detail: 'claim_status_not_priced', lines: 1 },
      { detail: null, lines: 1 },
      { detail: 'no_locality', lines: 2 },
    ],
    versions: [{ contract_version_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contract_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', version_no: 2, lines: 2 }],
    patterns: [
      {
        payer_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        plan_id: PLAN,
        mapping_kind: 'contract',
        contract_version_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        rate_record_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        lines: 2,
        underpaid_lines: 1,
        underpaid_cents: '1250',
        overpaid_lines: 1,
        overpaid_cents: '-300',
      },
    ],
    unmappedPlans: [],
  };

  it('lists every reason of the closed list in its order, the engine errors by detail, and parses back', () => {
    const coverage = coverageOf(parts);
    expect(coverage.format).toBe(COVERAGE_FORMAT);
    expect(coverage.reasons.map((entry) => entry.reason)).toEqual([...UNPRICED_REASONS]);
    expect(coverage.reasons.find((entry) => entry.reason === 'NO_MAPPING')).toEqual({ reason: 'NO_MAPPING', lines: 2, charge_cents: '20000' });
    expect(coverage.reasons.find((entry) => entry.reason === 'AMBIGUOUS_RATE')).toEqual({ reason: 'AMBIGUOUS_RATE', lines: 0, charge_cents: '0' });
    expect(coverage.engine_errors).toEqual([
      { detail: 'claim_status_not_priced', lines: 1, pages_operator: false },
      { detail: 'no_locality', lines: 2, pages_operator: true },
      { detail: 'unexpected', lines: 1, pages_operator: true },
    ]);
    expect(operatorAlerts(coverage)).toBe(3);
    expect(parseCoverage(JSON.parse(JSON.stringify(coverage)))).toEqual(coverage);
    expect(() => parseCoverage({ ...coverage, lines: -1 })).toThrow();
  });

  it('counts no alert when no engine error pages the operator', () => {
    expect(operatorAlerts(coverageOf({ ...parts, details: [{ detail: 'claim_status_not_priced', lines: 4 }] }))).toBe(0);
  });
});

describe('PRC-30: the coverage a run records of plans with no mapping (tp-pricing-coverage/2)', () => {
  const UNMAPPED = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const parts: CoverageParts = {
    totals: { lines: 3, charge_cents: '30000', priced_lines: 1, priced_charge_cents: '10000' },
    reasons: [
      { reason: 'NO_MAPPING', lines: 1, charge_cents: '10000' },
      { reason: 'ENGINE_ERROR', lines: 1, charge_cents: '10000' },
    ],
    details: [{ detail: 'invalid_line_facts', lines: 1 }],
    versions: [],
    patterns: [],
    unmappedPlans: [{ plan_id: UNMAPPED, lines: 2, charge_cents: '-250' }],
  };

  it('stores format 2 with the unmapped plans, which round-trips, with strict keys and signed cents', () => {
    const coverage = coverageOf(parts);
    expect(COVERAGE_FORMAT).toBe('tp-pricing-coverage/2');
    expect(coverage.format).toBe(COVERAGE_FORMAT);
    // coverageOf carries the plans as given: the query orders them by plan.
    expect(coverage.unmapped_plans).toEqual([{ plan_id: UNMAPPED, lines: 2, charge_cents: '-250' }]);
    expect(parseCoverage(JSON.parse(JSON.stringify(coverage)))).toEqual(coverage);
    const stored = JSON.parse(JSON.stringify(coverage)) as Record<string, unknown>;
    expect(() => parseCoverage({ ...stored, unmapped_plans: [{ plan_id: UNMAPPED, lines: 2, charge_cents: '-250', payer: 'SYNTHETIC PAYER' }] })).toThrow();
    expect(() => parseCoverage({ ...stored, unmapped_plans: [{ plan_id: 'SYNPLAN-UNMAPPED-06', lines: 2, charge_cents: '0' }] })).toThrow();
    expect(() => parseCoverage({ ...stored, unmapped_plans: [{ plan_id: UNMAPPED, lines: -1, charge_cents: '0' }] })).toThrow();
    expect(() => parseCoverage({ ...stored, unmapped_plans: [{ plan_id: UNMAPPED, lines: 1, charge_cents: '1.50' }] })).toThrow();
    // Format 2 requires the list; a format 2 summary without it is not one.
    const { unmapped_plans: _omitted, ...withoutPlans } = stored;
    expect(() => parseCoverage(withoutPlans)).toThrow();
    expect(() => parseCoverage({ ...stored, format: 'tp-pricing-coverage/3' })).toThrow();
  });

  it('reads a format 1 summary as having no unmapped plan (no complete format 1 run had one), keeping its format', () => {
    const { unmapped_plans: _omitted, ...rest } = JSON.parse(JSON.stringify(coverageOf(parts))) as Record<string, unknown>;
    const first = { ...rest, format: COVERAGE_FORMAT_1 };
    expect(parseCoverage(first)).toEqual({ ...first, unmapped_plans: [] });
    // A format 1 summary never held the list, so one that does is not format 1.
    expect(() => parseCoverage({ ...first, unmapped_plans: [] })).toThrow();
    expect(() => parseCoverage({ ...first, lines: -1 })).toThrow();
  });

  it('never prices a line of an unmapped plan, and counts all of its lines, ENGINE_ERROR included, within the run’s unpriced lines (property)', () => {
    const plans = [PLAN, UNMAPPED, 'ffffffff-ffff-4fff-8fff-ffffffffffff'];
    const release = syntheticRelease(900001);
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            plan: fc.constantFrom(...plans),
            // '9711' fails the engine's fact checks before the resolver (invalid_line_facts: ENGINE_ERROR).
            code: fc.constantFrom('97110', '97140', '9711'),
            charge: fc.bigInt({ min: -5000n, max: 50_000n }),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        (facts) => {
          const lines = facts.map((fact, index) =>
            storedLine({
              serviceLineId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
              lineNo: 1,
              planId: fact.plan,
              procedureCode: fact.code,
              chargeCents: fact.charge as Cents,
            }),
          );
          // One claim per line, so the engine prices each on its own facts.
          const claims = lines.map((line, index) => storedClaim([line], { claimId: `11111111-0000-4000-8000-${String(index).padStart(12, '0')}` }));
          const rows = priceClaims(claims, lineResolver(MA), release, practiceSettings(), '2026-10-15');
          const unmapped = unmappedPlanIds(lines, MA.mappings);
          const planOf = new Map(lines.map((line) => [line.serviceLineId, line]));
          // The parts as computeCoverage's queries total them: every line of an unmapped plan, whatever its reason.
          const byPlan = new Map<string, { lines: number; cents: bigint }>();
          for (const row of rows) {
            const line = planOf.get(row.serviceLineId);
            if (line !== undefined && unmapped.includes(line.planId)) {
              expect(row.unpricedReason === 'NO_MAPPING' || row.unpricedReason === 'ENGINE_ERROR').toBe(true);
              expect(row.mappingId).toBeNull();
              const total = byPlan.get(line.planId) ?? { lines: 0, cents: 0n };
              byPlan.set(line.planId, { lines: total.lines + 1, cents: total.cents + line.chargeCents });
            }
          }
          const unpriced = rows.filter((row) => row.unpricedReason !== null);
          const reasons = [...new Set(unpriced.map((row) => row.unpricedReason as (typeof UNPRICED_REASONS)[number]))].map((reason) => ({
            reason,
            lines: unpriced.filter((row) => row.unpricedReason === reason).length,
            charge_cents: unpriced
              .filter((row) => row.unpricedReason === reason)
              .reduce((sum, row) => sum + (planOf.get(row.serviceLineId)?.chargeCents ?? 0n), 0n)
              .toString(),
          }));
          const coverage = coverageOf({
            totals: { lines: rows.length, charge_cents: '0', priced_lines: rows.length - unpriced.length, priced_charge_cents: '0' },
            reasons,
            details: [],
            versions: [],
            patterns: [],
            unmappedPlans: [...byPlan]
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([plan_id, total]) => ({ plan_id, lines: total.lines, charge_cents: total.cents.toString() })),
          });
          const unmappedLines = coverage.unmapped_plans.reduce((sum, plan) => sum + plan.lines, 0);
          const unpricedLines = coverage.reasons.reduce((sum, entry) => sum + entry.lines, 0);
          expect(unmappedLines).toBe(lines.filter((line) => unmapped.includes(line.planId)).length);
          expect(unmappedLines).toBeLessThanOrEqual(unpricedLines);
          expect(unpricedLines).toBe(coverage.lines - coverage.priced.lines);
          expect(coverage.unmapped_plans.map((plan) => plan.plan_id)).toEqual(unmapped.filter((plan) => byPlan.has(plan)));
          expect(parseCoverage(JSON.parse(JSON.stringify(coverage)))).toEqual(coverage);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('messages', () => {
  it('names the refused and the loaded release', () => {
    expect(new RuleReleaseMismatchError(2, 3).message).toBe('rule-release mismatch: release 2 was asked for and release 3 is the one loaded');
    expect(new RuleReleaseMismatchError(2, null).message).toBe('rule-release mismatch: release 2 was asked for and no rule release is published');
  });

  it('logs the operator’s alert line as fixed text equal to ENGINE_ERRORS_MESSAGE (the log lint reads literals)', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'execute.ts'), 'utf8');
    expect(source).toContain(`context.logger.error('${ENGINE_ERRORS_MESSAGE}'`);
  });

  it('logs a read outside the fetch as fixed text equal to READ_OUTSIDE_FETCH_MESSAGE, with the error code the later alarm reads', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'execute.ts'), 'utf8');
    const calls = source.split(`context.logger.error('${READ_OUTSIDE_FETCH_MESSAGE}'`).slice(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.slice(0, calls[0].indexOf('\n'))).toContain("error_code: 'RELEASE_READ_OUTSIDE_FETCH'");
  });
});
