import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  type AgreementRecords,
  AgreementInvariantError,
  type ContractVersionRecord,
  type PlanMappingRecord,
  type RateRecord,
  type RateWindows,
  addDays,
  agreementResolver,
  parseRateTerms,
} from '@tp/contracts';
import { type RoundingRule, decimal, parseCents } from '@tp/money';
import { type AgreementInput, type IndexedRelease, type LineFacts, type LinePricing, type PlaceOfServiceSetting, type PricingInput, indexRelease, price } from '@tp/pricing';
import { readRelease } from '@tp/rules/content';

import { repositoryRoot } from '../content-files';

/**
 * Runs the engine on the golden claims (fixtures/golden/README.md, "Consuming the format in milestone
 * 5"). Each claim's inputs become the engine's inputs the way production builds them: the release is
 * read from its directory and its manifest hash checked; the mappings, contract versions and rate
 * records become the records @tp/contracts loads, and its pure resolver resolves each line; the line
 * facts, claim context (its remittance date), the version windows, the triage date and practice
 * settings are copied across. The golden format writes windows inclusively and a rate record's codes as
 * null for any code; the contract records are half-open and leave codes out for any code, so an
 * inclusive end becomes the next day's exclusive end and a null code list is left out (the general
 * term the product stores, ADR 0033). Nothing here computes an amount; the comparison is field by
 * field against the golden expected results, the variance and the dispute window included.
 */

export const GOLDEN_CLAIMS_DIR = 'fixtures/golden/claims';

interface GoldenRateRecord {
  readonly rate_record_id: string;
  readonly scope: {
    readonly codes: readonly string[] | null;
    readonly modifier_sets: readonly (readonly string[])[] | null;
    readonly places_of_service: readonly string[] | null;
    readonly effective_from: string;
    readonly effective_to: string | null;
  };
  readonly method: 'PERCENT_OF_MEDICARE' | 'UNSUPPORTED';
  readonly parameters: { readonly percentage?: string; readonly year_basis?: string; readonly locality_basis?: string; readonly conversion_factor?: string };
  readonly flags: {
    readonly apply_mppr: boolean;
    readonly apply_assistant_reduction: boolean;
    readonly apply_sequestration: boolean;
    readonly apply_ncci: boolean;
    readonly timed_units_rule: string;
    readonly rounding: RoundingRule | null;
  };
}

interface GoldenLineInput {
  readonly line_no: number;
  readonly procedure_code: string;
  readonly modifiers: readonly string[];
  readonly units: string;
  readonly service_date: string;
  readonly place_of_service: string;
  readonly charge_cents: string;
  readonly observed_allowed_cents: string;
  readonly observed_allowed_basis: 'amt_b6' | 'paid_plus_pr';
  readonly patient_share_adjustments: readonly { readonly group_code: 'PR'; readonly reason_code: string; readonly amount_cents: string }[];
}

export interface GoldenAdjustment {
  readonly name: string;
  readonly before_cents: string;
  readonly after_cents: string;
}

export interface GoldenExpectedLine {
  readonly line_no: number;
  readonly outcome: 'priced' | 'unpriced';
  readonly unpriced_reason?: string;
  readonly variance_cents?: string;
  readonly window?: { readonly ends_on: string | null; readonly status: string };
  readonly expected_allowed_cents?: string;
  readonly expected_unrounded_cents?: string;
  readonly rounding?: string;
  readonly patient_share_cents?: string;
  readonly method?: string;
  readonly terms?: { readonly mapping_id: string; readonly mapping_kind: string; readonly contract_version_id: string | null; readonly rate_record_id: string | null };
  readonly base_cents?: string;
  readonly adjustments?: readonly GoldenAdjustment[];
}

export interface GoldenClaim {
  readonly id: string;
  readonly inputs: {
    readonly release: { readonly number: number; readonly dir: string; readonly manifest_sha256: string };
    /** The triage date the dispute windows are judged on. */
    readonly as_of: string;
    readonly practice_settings: { readonly zip: string; readonly default_rounding: RoundingRule | null };
    readonly place_of_service_settings: Readonly<Record<string, PlaceOfServiceSetting>>;
    readonly claim: {
      readonly claim_status_code: string;
      readonly reversed: boolean;
      readonly corrected: boolean;
      readonly remittance_date: string | null;
      readonly payer_plan_key: string;
      readonly lines: readonly GoldenLineInput[];
    };
    readonly mappings: readonly {
      readonly mapping_id: string;
      readonly kind: PlanMappingRecord['kind'];
      readonly contract_version_id: string | null;
      readonly effective_from: string;
      readonly effective_to: string | null;
    }[];
    readonly contract_versions: readonly {
      readonly contract_version_id: string;
      readonly contract_id: string;
      readonly version_no: number;
      readonly status: ContractVersionRecord['status'];
      readonly effective_from: string;
      readonly effective_to: string | null;
      readonly windows: RateWindows;
      readonly rate_records: readonly GoldenRateRecord[];
    }[];
  };
  readonly expected: { readonly lines: readonly GoldenExpectedLine[] };
  readonly provenance: { readonly computed_by: string; readonly specialist_verified: boolean };
}

export interface GoldenFile {
  readonly file: string;
  readonly claim: GoldenClaim;
}

/** Every golden claim file, in name order. */
export function readGoldenClaims(root = repositoryRoot): GoldenFile[] {
  const dir = path.join(root, GOLDEN_CLAIMS_DIR);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ file: `${GOLDEN_CLAIMS_DIR}/${name}`, claim: JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as GoldenClaim }));
}

const releases = new Map<string, IndexedRelease>();

/** The release a golden claim names, after its manifest hash and number are checked. */
export function goldenRelease(reference: GoldenClaim['inputs']['release'], root = repositoryRoot): IndexedRelease {
  const cacheKey = `${reference.dir} ${reference.manifest_sha256} ${String(reference.number)}`;
  const cached = releases.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const release = readRelease(path.join(root, reference.dir));
  if (release.problems.length > 0) {
    throw new Error(`the release in ${reference.dir} does not verify: ${release.problems.join('; ')}`);
  }
  if (release.manifestSha256 !== reference.manifest_sha256 || release.manifest.release !== reference.number) {
    throw new Error(`the release in ${reference.dir} is not release ${String(reference.number)} with manifest ${reference.manifest_sha256}`);
  }
  const indexed = indexRelease({ releaseNo: release.manifest.release, manifestSha256: release.manifestSha256, records: release.records.map((located) => located.record) });
  releases.set(cacheKey, indexed);
  return indexed;
}

/** An inclusive end date as the half-open end the contract records use. */
function exclusiveEnd(inclusive: string | null): string | null {
  return inclusive === null ? null : addDays(inclusive, 1);
}

/** The golden mappings, versions and rate records as @tp/contracts' loader returns them. */
export function agreementRecords(claim: GoldenClaim): AgreementRecords {
  const { inputs } = claim;
  const mappings: PlanMappingRecord[] = inputs.mappings.map((mapping) => ({
    id: mapping.mapping_id,
    planId: inputs.claim.payer_plan_key,
    kind: mapping.kind,
    contractVersionId: mapping.contract_version_id,
    effectiveFrom: mapping.effective_from,
    effectiveTo: exclusiveEnd(mapping.effective_to),
    supersedesId: null,
  }));
  const versions: ContractVersionRecord[] = inputs.contract_versions.map((version) => ({
    id: version.contract_version_id,
    contractId: version.contract_id,
    versionNo: version.version_no,
    status: version.status,
    effectiveFrom: version.effective_from,
    effectiveTo: exclusiveEnd(version.effective_to),
    supersedesId: null,
    sourceDocumentIds: [],
    windows: { timely_filing_days: version.windows.timely_filing_days, dispute_window_days: version.windows.dispute_window_days, appeal_levels: version.windows.appeal_levels.map((level) => ({ ...level })) },
    noticeDays: null,
  }));
  // The loader returns the rate records of signed-off versions only.
  const rateRecords: RateRecord[] = inputs.contract_versions
    .filter((version) => version.status === 'signed_off')
    .flatMap((version) =>
      version.rate_records.map((record) => ({
        id: record.rate_record_id,
        contractVersionId: version.contract_version_id,
        terms: parseRateTerms({
          scope: {
            ...(record.scope.codes === null ? {} : { codes: [...record.scope.codes] }),
            ...(record.scope.modifier_sets === null ? {} : { modifier_sets: record.scope.modifier_sets.map((set) => [...set]) }),
            ...(record.scope.places_of_service === null ? {} : { places_of_service: [...record.scope.places_of_service] }),
            effective_from: record.scope.effective_from,
            ...(record.scope.effective_to === null ? {} : { effective_to: exclusiveEnd(record.scope.effective_to) }),
          },
          method: record.method,
          parameters: record.method === 'UNSUPPORTED' ? {} : { ...record.parameters, locality_basis: { kind: 'PRACTICE' } },
          flags: {
            apply_mppr: record.flags.apply_mppr,
            apply_assistant_reduction: record.flags.apply_assistant_reduction,
            apply_sequestration: record.flags.apply_sequestration,
            apply_ncci: record.flags.apply_ncci,
            timed_units_rule: record.flags.timed_units_rule,
          },
          rounding: record.flags.rounding,
        }),
        citation: null,
        approvals: {},
        proposedBy: 'specialist' as const,
        verifiedBy: 'golden-specialist',
        verifiedAt: '2026-10-15T00:00:00.000Z',
      })),
    );
  return { mappings, versions, rateRecords };
}

/** The engine's input for one golden claim: every line resolved by @tp/contracts' resolver. */
export function goldenPricingInput(claim: GoldenClaim, root = repositoryRoot): PricingInput {
  const { inputs } = claim;
  const resolver = agreementResolver(agreementRecords(claim));
  const lines: LineFacts[] = inputs.claim.lines.map((line) => {
    let agreement: AgreementInput;
    try {
      agreement = resolver.resolve({
        planId: inputs.claim.payer_plan_key,
        serviceDate: line.service_date,
        procedureCode: line.procedure_code,
        modifiers: line.modifiers,
        placeOfService: line.place_of_service,
      });
    } catch (error) {
      if (!(error instanceof AgreementInvariantError)) {
        throw error;
      }
      agreement = { outcome: 'RESOLUTION_FAILED' };
    }
    return {
      lineNo: line.line_no,
      serviceLineId: null,
      procedureCode: line.procedure_code,
      modifiers: line.modifiers,
      units: line.units,
      serviceDate: line.service_date,
      placeOfService: line.place_of_service,
      chargeCents: parseCents(line.charge_cents),
      observedAllowedCents: parseCents(line.observed_allowed_cents),
      observedAllowedBasis: line.observed_allowed_basis,
      patientShareAdjustments: line.patient_share_adjustments.map((item) => ({ groupCode: item.group_code, reasonCode: item.reason_code, amountCents: parseCents(item.amount_cents) })),
      agreement,
    };
  });
  return {
    claim: {
      claimStatusCode: inputs.claim.claim_status_code,
      reversed: inputs.claim.reversed,
      corrected: inputs.claim.corrected,
      remittanceDate: inputs.claim.remittance_date,
      payerPlanKey: inputs.claim.payer_plan_key,
      lines,
    },
    release: goldenRelease(inputs.release, root),
    settings: { zip: inputs.practice_settings.zip, defaultRounding: inputs.practice_settings.default_rounding, placeOfServiceSettings: inputs.place_of_service_settings },
    asOf: inputs.as_of,
  };
}

export interface EngineDifference {
  readonly file: string;
  readonly case: string;
  readonly line_no: number;
  readonly field: string;
  readonly golden: unknown;
  readonly engine: unknown;
}

function sameDecimal(a: string | undefined, b: string): boolean {
  return a !== undefined && decimal(a).equals(decimal(b));
}

/**
 * Field by field: the outcome and reason, expected allowed exactly, the unrounded amount as a number,
 * the rounding, the patient share, the method and terms, the base, each adjustment's before and after
 * against both the result and its trace, the variance and the dispute window.
 */
export function compareLine(file: string, claim: GoldenClaim, golden: GoldenExpectedLine, engine: LinePricing | undefined): EngineDifference[] {
  const found: EngineDifference[] = [];
  const differ = (field: string, goldenValue: unknown, engineValue: unknown) => {
    found.push({ file, case: claim.id, line_no: golden.line_no, field, golden: goldenValue, engine: engineValue });
  };
  if (engine === undefined) {
    differ('(line)', golden, null);
    return found;
  }
  if (engine.outcome !== golden.outcome) {
    differ('outcome', golden.outcome, engine.outcome === 'unpriced' ? `unpriced ${engine.reason} (${String(engine.detail)})` : 'priced');
    return found;
  }
  if (engine.outcome === 'unpriced') {
    if (engine.reason !== golden.unpriced_reason) {
      differ('unpriced_reason', golden.unpriced_reason, engine.reason);
    }
    return found;
  }
  if (engine.expectedAllowedCents.toString() !== golden.expected_allowed_cents) {
    differ('expected_allowed_cents', golden.expected_allowed_cents, engine.expectedAllowedCents.toString());
  }
  if (!sameDecimal(golden.expected_unrounded_cents, engine.expectedUnroundedCents.toString())) {
    differ('expected_unrounded_cents', golden.expected_unrounded_cents, engine.expectedUnroundedCents.toString());
  }
  if (engine.rounding !== golden.rounding) {
    differ('rounding', golden.rounding, engine.rounding);
  }
  if (engine.patientShareCents.toString() !== golden.patient_share_cents) {
    differ('patient_share_cents', golden.patient_share_cents, engine.patientShareCents.toString());
  }
  if (engine.method !== golden.method) {
    differ('method', golden.method, engine.method);
  }
  const terms = { mapping_id: engine.terms.mappingId, mapping_kind: engine.terms.mappingKind, contract_version_id: engine.terms.contractVersionId, rate_record_id: engine.terms.rateRecordId };
  if (JSON.stringify(terms) !== JSON.stringify(golden.terms)) {
    differ('terms', golden.terms, terms);
  }
  if (!sameDecimal(golden.base_cents, engine.baseCents.toString())) {
    differ('base_cents', golden.base_cents, engine.baseCents.toString());
  }
  if (engine.varianceCents.toString() !== golden.variance_cents) {
    differ('variance_cents', golden.variance_cents, engine.varianceCents.toString());
  }
  const window = { ends_on: engine.window.endsOn, status: engine.window.status };
  if (JSON.stringify(window) !== JSON.stringify(golden.window)) {
    differ('window', golden.window, window);
  }
  const expected = golden.adjustments ?? [];
  const results = engine.adjustments.map((item) => ({ name: item.name, before_cents: item.beforeCents.toString(), after_cents: item.afterCents.toString() }));
  const traced = engine.trace.steps.adjustments.map((item) => ({ name: item.name, before_cents: item.before_cents, after_cents: item.after_cents }));
  for (const [label, actual] of [
    ['adjustments', results],
    ['trace adjustments', traced],
  ] as const) {
    const same =
      actual.length === expected.length &&
      actual.every((item, index) => {
        const want = expected[index];
        return want !== undefined && item.name === want.name && sameDecimal(want.before_cents, item.before_cents) && sameDecimal(want.after_cents, item.after_cents);
      });
    if (!same) {
      differ(label, expected, actual);
    }
  }
  return found;
}

export interface EngineRun {
  readonly file: string;
  readonly claim: GoldenClaim;
  readonly results: readonly LinePricing[];
}

/** Prices every golden claim with the engine. */
export function runEngineOnGolden(root = repositoryRoot): EngineRun[] {
  return readGoldenClaims(root).map(({ file, claim }) => ({ file, claim, results: price(goldenPricingInput(claim, root)) }));
}

/** Every difference between the engine and the golden expected results. */
export function engineDifferences(runs: readonly EngineRun[]): EngineDifference[] {
  return runs.flatMap(({ file, claim, results }) => {
    const byLine = new Map(results.map((result) => [result.lineNo, result]));
    const differences = claim.expected.lines.flatMap((golden) => compareLine(file, claim, golden, byLine.get(golden.line_no)));
    const extra = results.filter((result) => !claim.expected.lines.some((golden) => golden.line_no === result.lineNo));
    return [...differences, ...extra.map((result) => ({ file, case: claim.id, line_no: result.lineNo, field: '(line)', golden: null, engine: result.outcome }))];
  });
}
