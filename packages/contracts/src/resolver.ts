import { type IsoDate, isIsoDate, windowCovers } from './dates';
import type { AgreementRecords, ContractVersionRecord, PlanMappingRecord, RateRecord } from './records';
import { type AgreementTerms, MA_NONCONTRACTED_TERMS, type RateRecordTerms, type RateWindows } from './terms';

/**
 * Agreement resolution for pricing (PRD 2, "Which agreement governs the line"; PRD 11, Algorithm
 * step 1; test matrix CON-06, CON-07, MAP-01 to MAP-05). Pure over loaded records, so the pricing
 * engine calls it without a database: given a line's plan (which names its payer), service date,
 * procedure code, modifiers and place of service, it returns the mapping in force and either the
 * single matching rate record of the contract's signed-off version in force on that date, the
 * Medicare Advantage non-contracted terms, or the reason the line cannot be priced from an agreement.
 *
 * - The mapping in force is the plan's mapping whose window covers the date and that no correction
 *   covering the date supersedes (MAP-02, MAP-03). None: NO_MAPPING.
 * - no_agreement, government and other: NO_AGREEMENT (anomaly screening only, MAP-04).
 * - ma_noncontracted: MA_NONCONTRACTED with Original Medicare's terms, every flag on (MAP-05).
 * - contract: the mapping names a version; the contract's signed-off version covering the date prices
 *   the line, whatever version the mapping names, and nothing else does (CON-07: a draft, proposed,
 *   approved or superseded version never prices). None: DATE_OUTSIDE_VERSIONS.
 * - Rate records of that version whose scope matches the code (a record without codes covers every
 *   code), the modifiers (as a set), the place of service, the provider type and the date: one is the
 *   rate; none is NO_RATE_FOR_CODE; more than one is AMBIGUOUS_RATE (CON-06), never a choice between
 *   them, a general term beside a code exhibit included.
 *
 * Records the database's invariants rule out (two mappings in force, two signed-off versions on one
 * date, an unverified record in a signed-off version, a mapping naming a version that was not loaded)
 * raise AgreementInvariantError: the engine records ENGINE_ERROR for the line, never a guess.
 */

/** What a line brings to resolution. Its plan identifies its payer (plan.payer_id). */
export interface AgreementLine {
  /** The line's plan (service_line.payer_plan_key); null when the remittance named none. */
  readonly planId: string | null;
  readonly serviceDate: IsoDate;
  readonly procedureCode: string;
  /** The line's modifiers in any order; empty positions ('') are ignored. */
  readonly modifiers: readonly string[];
  readonly placeOfService: string | null;
  /** The rendering provider's type, when known; a record limited to provider types needs it. */
  readonly providerType?: string | null;
}

/** A record that prices the line, with its version's windows. */
export interface ResolvedRate {
  readonly rateRecordId: string;
  readonly contractVersionId: string;
  readonly terms: RateRecordTerms;
  readonly windows: RateWindows;
}

/** The unpriced reasons resolution can give: members of the closed list in docs/product/unpriced-reasons.md. */
export const AGREEMENT_UNPRICED_REASONS = ['NO_MAPPING', 'NO_AGREEMENT', 'DATE_OUTSIDE_VERSIONS', 'NO_RATE_FOR_CODE', 'AMBIGUOUS_RATE'] as const;
export type AgreementUnpricedReason = (typeof AGREEMENT_UNPRICED_REASONS)[number];

export type AgreementResolution =
  | { readonly outcome: 'CONTRACT_RATE'; readonly mapping: PlanMappingRecord; readonly version: ContractVersionRecord; readonly rate: ResolvedRate }
  | { readonly outcome: 'MA_NONCONTRACTED'; readonly mapping: PlanMappingRecord; readonly terms: AgreementTerms }
  | { readonly outcome: 'NO_MAPPING' }
  | { readonly outcome: 'NO_AGREEMENT'; readonly mapping: PlanMappingRecord }
  | { readonly outcome: 'DATE_OUTSIDE_VERSIONS'; readonly mapping: PlanMappingRecord }
  | { readonly outcome: 'NO_RATE_FOR_CODE'; readonly mapping: PlanMappingRecord; readonly version: ContractVersionRecord }
  | { readonly outcome: 'AMBIGUOUS_RATE'; readonly mapping: PlanMappingRecord; readonly version: ContractVersionRecord; readonly rateRecordIds: readonly string[] };

/** Loaded records break an invariant the database holds; the line is an engine error, not a price. */
export class AgreementInvariantError extends Error {
  override readonly name = 'AgreementInvariantError';
}

/** A version that is not signed off was asked to price a line (CON-07). */
export class VersionNotSignedOffError extends Error {
  override readonly name = 'VersionNotSignedOffError';
}

/** Refuses any version but a signed-off one: what a pricing run pins must be signed off (CON-07). */
export function assertSignedOff(version: Pick<ContractVersionRecord, 'status'>): void {
  if (version.status !== 'signed_off') {
    throw new VersionNotSignedOffError(`only a signed-off contract version prices lines; this one is ${version.status.replace('_', ' ')}`);
  }
}

function group<T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const list = groups.get(key(value));
    if (list === undefined) {
      groups.set(key(value), [value]);
    } else {
      list.push(value);
    }
  }
  return groups;
}

/** The plan's mapping in force on the date: covering it, and superseded by no other mapping covering it. */
export function mappingInForce(mappings: readonly PlanMappingRecord[], planId: string, date: IsoDate): PlanMappingRecord | null {
  const ofPlan = mappings.filter((mapping) => mapping.planId === planId);
  const byId = new Map(ofPlan.map((mapping) => [mapping.id, mapping]));
  const covering = ofPlan.filter((mapping) => windowCovers(mapping.effectiveFrom, mapping.effectiveTo, date));
  const superseded = new Set<string>();
  for (const mapping of covering) {
    // Everything this correction descends from, on any date it covers, is superseded on this one.
    let ancestor = mapping.supersedesId;
    const seen = new Set<string>([mapping.id]);
    while (ancestor !== null && !seen.has(ancestor)) {
      seen.add(ancestor);
      superseded.add(ancestor);
      ancestor = byId.get(ancestor)?.supersedesId ?? null;
    }
  }
  const inForce = covering.filter((mapping) => !superseded.has(mapping.id));
  if (inForce.length > 1) {
    throw new AgreementInvariantError('more than one mapping of the plan is in force on the date; the database allows one');
  }
  return inForce[0] ?? null;
}

function normalized(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toUpperCase()).filter((value) => value !== ''))].sort();
}

/** Whether a rate record's scope covers the line on its date. */
export function scopeMatches(terms: RateRecordTerms, line: AgreementLine): boolean {
  const { scope } = terms;
  const code = line.procedureCode.trim().toUpperCase();
  if (scope.codes !== undefined && !scope.codes.includes(code)) {
    return false;
  }
  if (scope.modifier_sets !== undefined) {
    const modifiers = normalized(line.modifiers).join(' ');
    if (!scope.modifier_sets.some((set) => normalized(set).join(' ') === modifiers)) {
      return false;
    }
  }
  if (scope.places_of_service !== undefined && (line.placeOfService === null || !scope.places_of_service.includes(line.placeOfService.trim()))) {
    return false;
  }
  const providerType = line.providerType?.trim().toUpperCase() ?? null;
  if (scope.provider_types !== undefined && (providerType === null || !scope.provider_types.includes(providerType))) {
    return false;
  }
  return windowCovers(scope.effective_from ?? '0000-01-01', scope.effective_to ?? null, line.serviceDate);
}

/** Resolution over one practice's records, indexed once for many lines. */
export interface AgreementResolver {
  resolve(line: AgreementLine): AgreementResolution;
}

export function agreementResolver(records: AgreementRecords): AgreementResolver {
  const mappingsByPlan = group(records.mappings, (mapping) => mapping.planId);
  const versionsById = new Map(records.versions.map((version) => [version.id, version]));
  const signedOffByContract = group(
    records.versions.filter((version) => version.status === 'signed_off'),
    (version) => version.contractId,
  );
  const recordsByVersion = group(records.rateRecords, (record: RateRecord) => record.contractVersionId);

  return {
    resolve(line: AgreementLine): AgreementResolution {
      if (!isIsoDate(line.serviceDate)) {
        throw new AgreementInvariantError('a line resolves on a calendar service date (YYYY-MM-DD)');
      }
      const mapping = line.planId === null ? null : mappingInForce(mappingsByPlan.get(line.planId) ?? [], line.planId, line.serviceDate);
      if (mapping === null) {
        return { outcome: 'NO_MAPPING' };
      }
      if (mapping.kind === 'ma_noncontracted') {
        return { outcome: 'MA_NONCONTRACTED', mapping, terms: MA_NONCONTRACTED_TERMS };
      }
      if (mapping.kind !== 'contract') {
        return { outcome: 'NO_AGREEMENT', mapping };
      }
      const named = mapping.contractVersionId === null ? undefined : versionsById.get(mapping.contractVersionId);
      if (named === undefined) {
        throw new AgreementInvariantError('a contract mapping names a version that was not loaded');
      }
      const inForce = (signedOffByContract.get(named.contractId) ?? []).filter((version) => windowCovers(version.effectiveFrom, version.effectiveTo, line.serviceDate));
      if (inForce.length > 1) {
        throw new AgreementInvariantError('two signed-off versions of one contract cover the date; the database allows one');
      }
      const version = inForce[0];
      if (version === undefined) {
        return { outcome: 'DATE_OUTSIDE_VERSIONS', mapping };
      }
      assertSignedOff(version);
      const terms = recordsByVersion.get(version.id) ?? [];
      if (terms.some((record) => record.verifiedBy === null)) {
        throw new AgreementInvariantError('a signed-off version holds an unverified rate record; the database allows none');
      }
      const matches = terms.filter((record) => scopeMatches(record.terms, line));
      const [only, ...others] = matches;
      if (only === undefined) {
        return { outcome: 'NO_RATE_FOR_CODE', mapping, version };
      }
      if (others.length > 0) {
        return { outcome: 'AMBIGUOUS_RATE', mapping, version, rateRecordIds: matches.map((record) => record.id).sort() };
      }
      return {
        outcome: 'CONTRACT_RATE',
        mapping,
        version,
        rate: { rateRecordId: only.id, contractVersionId: version.id, terms: only.terms, windows: version.windows },
      };
    },
  };
}

/** Resolves one line against one practice's records. */
export function resolveAgreement(line: AgreementLine, records: AgreementRecords): AgreementResolution {
  return agreementResolver(records).resolve(line);
}
