import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { AgreementRecords } from './records';
import {
  AGREEMENT_UNPRICED_REASONS,
  AgreementInvariantError,
  type AgreementLine,
  VersionNotSignedOffError,
  agreementResolver,
  assertSignedOff,
  mappingInForce,
  resolveAgreement,
  scopeMatches,
} from './resolver';
import { MA_NONCONTRACTED_TERMS } from './terms';
import { fixedTerms, mapping, rate, version } from './testing/records';

const PLAN = randomUUID();

function line(overrides: Partial<AgreementLine> = {}): AgreementLine {
  return { planId: PLAN, serviceDate: '2026-03-02', procedureCode: '97110', modifiers: ['GP'], placeOfService: '11', ...overrides };
}

/** A signed-off version with one fixed-schedule record for 97110, and the plan mapped to it from 2026. */
function contracted(): AgreementRecords & { versionId: string; recordId: string } {
  const signed = version({ windows: { timely_filing_days: 180, dispute_window_days: 90, appeal_levels: [{ level: 1, days: 60 }] } });
  const record = rate(signed.id, fixedTerms(['97110'], '3200'));
  return { mappings: [mapping({ planId: PLAN, contractVersionId: signed.id })], versions: [signed], rateRecords: [record], versionId: signed.id, recordId: record.id };
}

describe('agreement resolution', () => {
  it('returns the mapping in force, the signed-off version and its one matching rate record, with the version’s windows', () => {
    const records = contracted();
    const resolved = resolveAgreement(line(), records);
    expect(resolved.outcome).toBe('CONTRACT_RATE');
    if (resolved.outcome === 'CONTRACT_RATE') {
      expect(resolved.rate.rateRecordId).toBe(records.recordId);
      expect(resolved.version.id).toBe(records.versionId);
      expect(resolved.rate.windows).toEqual({ timely_filing_days: 180, dispute_window_days: 90, appeal_levels: [{ level: 1, days: 60 }] });
      expect(resolved.rate.terms.method === 'FIXED_SCHEDULE' && resolved.rate.terms.parameters.amount_cents).toBe(3200n);
    }
  });

  it('MAP-01: gives NO_MAPPING for every line of an unmapped plan, and for a line with no plan', () => {
    const records = contracted();
    for (const serviceDate of ['2025-01-01', '2026-03-02', '2030-12-31']) {
      expect(resolveAgreement(line({ planId: randomUUID(), serviceDate }), records)).toEqual({ outcome: 'NO_MAPPING' });
    }
    expect(resolveAgreement(line({ planId: null }), records)).toEqual({ outcome: 'NO_MAPPING' });
  });

  it('MAP-02: gives NO_MAPPING before a mapping’s effective date and prices from it on', () => {
    const records = contracted();
    const later = { ...records, mappings: [mapping({ planId: PLAN, contractVersionId: records.versionId, effectiveFrom: '2026-03-01' })] };
    expect(resolveAgreement(line({ serviceDate: '2026-02-28' }), later).outcome).toBe('NO_MAPPING');
    expect(resolveAgreement(line({ serviceDate: '2026-03-01' }), later).outcome).toBe('CONTRACT_RATE');
  });

  it('MAP-03: a correction supersedes the mapping on the dates it covers, and the corrected mapping stays as it was elsewhere', () => {
    const records = contracted();
    const original = mapping({ planId: PLAN, kind: 'no_agreement', effectiveFrom: '2026-01-01' });
    const correction = mapping({ planId: PLAN, contractVersionId: records.versionId, effectiveFrom: '2026-03-01', supersedesId: original.id });
    const corrected = { ...records, mappings: [original, correction] };
    expect(resolveAgreement(line({ serviceDate: '2026-02-01' }), corrected)).toEqual({ outcome: 'NO_AGREEMENT', mapping: original });
    expect(resolveAgreement(line({ serviceDate: '2026-03-02' }), corrected).outcome).toBe('CONTRACT_RATE');
    // A correction of the correction, from the start, wins over both.
    const again = mapping({ planId: PLAN, kind: 'government', effectiveFrom: '2026-01-01', supersedesId: correction.id });
    for (const serviceDate of ['2026-02-01', '2026-03-02']) {
      expect(resolveAgreement(line({ serviceDate }), { ...records, mappings: [original, correction, again] })).toEqual({ outcome: 'NO_AGREEMENT', mapping: again });
    }
  });

  it.each(['no_agreement', 'government', 'other'] as const)('MAP-04: a plan mapped as %s goes to anomaly screening only (NO_AGREEMENT)', (kind) => {
    const records = { ...contracted(), mappings: [mapping({ planId: PLAN, kind })] };
    expect(resolveAgreement(line(), records).outcome).toBe('NO_AGREEMENT');
  });

  it('MAP-05: a plan mapped as Medicare Advantage non-contracted prices from the fee schedule with every flag on', () => {
    const records = { ...contracted(), mappings: [mapping({ planId: PLAN, kind: 'ma_noncontracted' })] };
    const resolved = resolveAgreement(line({ procedureCode: '97530', modifiers: ['GP', 'CQ'] }), records);
    expect(resolved).toEqual({ outcome: 'MA_NONCONTRACTED', mapping: records.mappings[0], terms: MA_NONCONTRACTED_TERMS });
    if (resolved.outcome === 'MA_NONCONTRACTED') {
      expect(Object.values(resolved.terms.flags).filter((flag) => flag === true)).toHaveLength(4);
    }
  });

  it('CON-06: two records matching one code are AMBIGUOUS_RATE, never a choice between them', () => {
    const records = contracted();
    const conflicting = rate(records.versionId, fixedTerms(['97110', '97112'], '2900'));
    const resolved = resolveAgreement(line(), { ...records, rateRecords: [...records.rateRecords, conflicting] });
    expect(resolved.outcome).toBe('AMBIGUOUS_RATE');
    if (resolved.outcome === 'AMBIGUOUS_RATE') {
      expect(resolved.rateRecordIds).toEqual([records.recordId, conflicting.id].sort());
    }
    // A code only one of them names is priced.
    expect(resolveAgreement(line({ procedureCode: '97112' }), { ...records, rateRecords: [...records.rateRecords, conflicting] }).outcome).toBe('CONTRACT_RATE');
  });

  it('CON-07: only a signed-off version prices; a draft, proposed, approved or superseded one never does', () => {
    for (const status of ['draft', 'proposed', 'approved', 'superseded'] as const) {
      const unsigned = version({ status });
      const records: AgreementRecords = {
        mappings: [mapping({ planId: PLAN, contractVersionId: unsigned.id })],
        versions: [unsigned],
        rateRecords: [rate(unsigned.id, fixedTerms(['97110'], '3200'), { verifiedBy: null, verifiedAt: null })],
      };
      expect(resolveAgreement(line(), records).outcome, status).toBe('DATE_OUTSIDE_VERSIONS');
      expect(() => {
        assertSignedOff(unsigned);
      }).toThrow(VersionNotSignedOffError);
    }
    expect(() => {
      assertSignedOff(version());
    }).not.toThrow();
  });

  it('prices under the contract’s signed-off version covering the date, whichever version the mapping names', () => {
    const first = version({ effectiveFrom: '2025-01-01', effectiveTo: '2026-01-01' });
    const second = version({ contractId: first.contractId, versionNo: 2, effectiveFrom: '2026-01-01', supersedesId: first.id });
    const records: AgreementRecords = {
      mappings: [mapping({ planId: PLAN, contractVersionId: first.id, effectiveFrom: '2025-01-01' })],
      versions: [first, second],
      rateRecords: [rate(first.id, fixedTerms(['97110'], '3000')), rate(second.id, fixedTerms(['97110'], '3300'))],
    };
    const before = resolveAgreement(line({ serviceDate: '2025-12-31' }), records);
    const after = resolveAgreement(line({ serviceDate: '2026-01-01' }), records);
    expect(before.outcome === 'CONTRACT_RATE' && before.version.id).toBe(first.id);
    expect(after.outcome === 'CONTRACT_RATE' && after.version.id).toBe(second.id);
    expect(resolveAgreement(line({ serviceDate: '2024-12-31' }), { ...records, mappings: [mapping({ planId: PLAN, contractVersionId: first.id, effectiveFrom: '2024-01-01' })] }).outcome).toBe('DATE_OUTSIDE_VERSIONS');
  });

  it('gives NO_RATE_FOR_CODE when no record’s scope covers the line', () => {
    const records = contracted();
    expect(resolveAgreement(line({ procedureCode: '97530' }), records).outcome).toBe('NO_RATE_FOR_CODE');
  });

  it('refuses records the database rules out, as engine errors', () => {
    const records = contracted();
    expect(() => resolveAgreement(line(), { ...records, rateRecords: [{ ...records.rateRecords[0], verifiedBy: null } as never] })).toThrow(AgreementInvariantError);
    expect(() => resolveAgreement(line(), { ...records, mappings: [mapping({ planId: PLAN, contractVersionId: randomUUID() })] })).toThrow(AgreementInvariantError);
    const twin = version({ contractId: records.versions[0]?.contractId ?? '', versionNo: 2 });
    expect(() => resolveAgreement(line(), { ...records, versions: [...records.versions, twin] })).toThrow(AgreementInvariantError);
    const unrelated = [mapping({ planId: PLAN, kind: 'other' }), mapping({ planId: PLAN, kind: 'government' })];
    expect(() => resolveAgreement(line(), { ...records, mappings: unrelated })).toThrow(AgreementInvariantError);
    expect(() => resolveAgreement(line({ serviceDate: '2026-02-30' }), records)).toThrow(AgreementInvariantError);
  });

  it('resolves only to reasons on the closed list of docs/product/unpriced-reasons.md', () => {
    const table = readFileSync(new URL('../../../docs/product/unpriced-reasons.md', import.meta.url), 'utf8');
    const listed = [...table.matchAll(/^\| `([A-Z_]+)` \|/gm)].map((match) => match[1]);
    expect(listed).toHaveLength(12);
    expect(AGREEMENT_UNPRICED_REASONS.filter((reason) => !listed.includes(reason))).toEqual([]);
  });
});

describe('scope matching', () => {
  const terms = (scope: Record<string, unknown>) => fixedTerms(['97110'], '100', scope);

  it('matches modifier sets exactly, in any order, ignoring empty positions and case', () => {
    const exact = terms({ modifier_sets: [['GP', 'KX'], ['GP']] });
    expect(scopeMatches(exact, line({ modifiers: ['KX', 'GP'] }))).toBe(true);
    expect(scopeMatches(exact, line({ modifiers: ['gp', '', ''] }))).toBe(true);
    expect(scopeMatches(exact, line({ modifiers: ['GP', 'CQ'] }))).toBe(false);
    expect(scopeMatches(terms({}), line({ modifiers: ['GP', 'CQ', '59'] }))).toBe(true);
  });

  it('matches places of service, provider types and the record’s own window', () => {
    expect(scopeMatches(terms({ places_of_service: ['11', '22'] }), line({ placeOfService: '22' }))).toBe(true);
    expect(scopeMatches(terms({ places_of_service: ['11'] }), line({ placeOfService: '22' }))).toBe(false);
    expect(scopeMatches(terms({ places_of_service: ['11'] }), line({ placeOfService: null }))).toBe(false);
    expect(scopeMatches(terms({ provider_types: ['PTA'] }), line({ providerType: 'pta' }))).toBe(true);
    expect(scopeMatches(terms({ provider_types: ['PTA'] }), line())).toBe(false);
    expect(scopeMatches(terms({ effective_from: '2026-03-01' }), line({ serviceDate: '2026-02-28' }))).toBe(false);
    expect(scopeMatches(terms({ effective_to: '2026-03-01' }), line({ serviceDate: '2026-03-01' }))).toBe(false);
    expect(scopeMatches(terms({ effective_from: '2026-03-01', effective_to: '2026-04-01' }), line({ serviceDate: '2026-03-31' }))).toBe(true);
    expect(scopeMatches(terms({}), line({ procedureCode: ' 97110 ' }))).toBe(true);
  });
});

describe('agreement resolution (properties)', () => {
  const date = fc.integer({ min: 0, max: 365 * 3 }).map((offset) => new Date(Date.UTC(2025, 0, 1 + offset)).toISOString().slice(0, 10));

  it('is deterministic and gives NO_MAPPING exactly when no mapping of the plan covers the date', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(date, fc.option(date, { nil: null })), { maxLength: 4 }), date, (windows, serviceDate) => {
        const records = contracted();
        // Non-overlapping windows, as the database keeps them: each starts where the previous ends.
        const sorted = [...new Set(windows.map(([from]) => from))].sort();
        const mappings = sorted.map((from, index) => mapping({ planId: PLAN, kind: 'no_agreement', effectiveFrom: from, effectiveTo: sorted[index + 1] ?? null }));
        const resolver = agreementResolver({ ...records, mappings });
        const first = resolver.resolve(line({ serviceDate }));
        expect(resolver.resolve(line({ serviceDate }))).toEqual(first);
        const covered = mappings.some((candidate) => candidate.effectiveFrom <= serviceDate && (candidate.effectiveTo === null || serviceDate < candidate.effectiveTo));
        expect(first.outcome === 'NO_MAPPING').toBe(!covered);
      }),
    );
  });

  it('finds the last correction covering the date in force, whatever order the corrections are loaded in', () => {
    fc.assert(
      fc.property(fc.array(date, { minLength: 1, maxLength: 5 }), date, fc.integer({ min: 0, max: 1000 }), (starts, serviceDate, seed) => {
        // A chain of corrections, each superseding the one before from its own start.
        const chain = starts.reduce<ReturnType<typeof mapping>[]>(
          (built, from) => [...built, mapping({ planId: PLAN, kind: 'other', effectiveFrom: from, supersedesId: built.at(-1)?.id ?? null })],
          [],
        );
        const shuffled = [...chain].sort((a, b) => ((a.id.charCodeAt(seed % 36) + seed) % 7) - ((b.id.charCodeAt(seed % 36) + seed) % 7));
        const expected = [...chain].reverse().find((candidate) => candidate.effectiveFrom <= serviceDate) ?? null;
        expect(mappingInForce(shuffled, PLAN, serviceDate)).toEqual(expected);
      }),
    );
  });

  it('never prices from more than one record and names every match when ambiguous', () => {
    fc.assert(
      fc.property(fc.array(fc.subarray(['97110', '97112', '97140'], { minLength: 1 }), { minLength: 1, maxLength: 4 }), fc.constantFrom('97110', '97112', '97140', '97530'), (scopes, code) => {
        const signed = version();
        const rateRecords = scopes.map((codes) => rate(signed.id, fixedTerms(codes, '100')));
        const resolved = resolveAgreement(line({ procedureCode: code }), { mappings: [mapping({ planId: PLAN, contractVersionId: signed.id })], versions: [signed], rateRecords });
        const matching = rateRecords.filter((record) => record.terms.scope.codes.includes(code));
        expect(resolved.outcome).toBe(matching.length === 0 ? 'NO_RATE_FOR_CODE' : matching.length === 1 ? 'CONTRACT_RATE' : 'AMBIGUOUS_RATE');
        if (resolved.outcome === 'AMBIGUOUS_RATE') {
          expect(resolved.rateRecordIds).toEqual(matching.map((record) => record.id).sort());
        }
      }),
    );
  });
});
