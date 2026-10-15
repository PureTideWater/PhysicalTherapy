/**
 * Test support (`@tp/pricing/testing`): the SYNTHETIC rule releases the engine's tests price under,
 * and builders of line facts, claims, settings and agreement resolutions. Synthetic data only. Reads
 * release files from fixtures/, so it is not part of the package's pure entry point.
 */
import path from 'node:path';

import type { AgreementResolution, AgreementTerms, ContractVersionRecord, PlanMappingRecord, RateRecordTerms, RateWindows } from '@tp/contracts';
import { type Cents, decimal } from '@tp/money';
import type { RuleRecord } from '@tp/rules';
import { readRelease } from '@tp/rules/content';

import { type IndexedRelease, type RuleRelease, indexRelease } from './release';
import type { ClaimFacts, LineFacts, PracticeSettings, PricingInput } from './types';

const REPOSITORY = path.resolve(import.meta.dirname, '../../..');

/**
 * The SYNTHETIC releases: 900001 holds 2026; 900002 is 900001 plus a 2025 fee-schedule year; 900003 is
 * 900001 with sequestration suspended from 2026-07-01, a 45% general reduction that 97112 falls back
 * to, and a commercial default dispute window of 4 months from the date of service.
 */
export const SYNTHETIC_RELEASES = {
  900001: 'fixtures/synthetic/rules/release-synth-900001',
  900002: 'fixtures/synthetic/rules/release-synth-900002',
  900003: 'fixtures/synthetic/rules/release-synth-900003',
} as const;

/** Reads a release directory (relative to the repository) and refuses one whose manifest does not verify. */
export function readRuleRelease(dir: string): RuleRelease {
  const release = readRelease(path.resolve(REPOSITORY, dir));
  if (release.problems.length > 0) {
    throw new Error(`the release in ${dir} does not verify: ${release.problems.join('; ')}`);
  }
  return { releaseNo: release.manifest.release, manifestSha256: release.manifestSha256, records: release.records.map((located) => located.record) };
}

/** A SYNTHETIC release, indexed. */
export function syntheticRelease(number: keyof typeof SYNTHETIC_RELEASES = 900001): IndexedRelease {
  return indexRelease(readRuleRelease(SYNTHETIC_RELEASES[number]));
}

/**
 * A release with its records changed, for tests of missing, overlapping or unusual rule records. The
 * change receives copies; the release itself is untouched.
 */
export function releaseVariant(release: RuleRelease, change: (records: RuleRecord[]) => RuleRecord[]): IndexedRelease {
  return indexRelease({ ...release, records: change(release.records.map((record) => structuredClone(record))) });
}

/** A record's key as plain text fields, for tests that pick records by key. */
export function keyOf(record: RuleRecord): Readonly<Record<string, string | undefined>> {
  return record.key as Record<string, string>;
}

/** A copy of `like` with its key, value or window replaced (the source and verification stay). */
export function ruleRecordLike(like: RuleRecord, changes: { readonly key?: object; readonly value?: object; readonly effective_from?: string; readonly effective_to?: string | null }): RuleRecord {
  return { ...structuredClone(like), ...changes } as RuleRecord;
}

/** The SYNTHETIC place-of-service split the golden lines assume (fixtures/golden/QUESTIONS.md, Q08). */
export const SYNTHETIC_PLACES = { '11': 'non_facility', '22': 'facility' } as const;

export function practiceSettings(overrides: Partial<PracticeSettings> = {}): PracticeSettings {
  return { zip: '00011', defaultRounding: 'HALF_UP_CENT', placeOfServiceSettings: SYNTHETIC_PLACES, ...overrides };
}

const OPEN_WINDOWS: RateWindows = { timely_filing_days: null, dispute_window_days: null, appeal_levels: [] };

export function mappingRecord(overrides: Partial<PlanMappingRecord> = {}): PlanMappingRecord {
  return {
    id: 'map-synth-1',
    planId: 'SYNTH-PLAN-1',
    kind: 'ma_noncontracted',
    contractVersionId: null,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    supersedesId: null,
    ...overrides,
  };
}

export function versionRecord(overrides: Partial<ContractVersionRecord> = {}): ContractVersionRecord {
  return {
    id: 'cv-synth-1',
    contractId: 'contract-synth-1',
    versionNo: 1,
    status: 'signed_off',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    supersedesId: null,
    sourceDocumentIds: [],
    windows: OPEN_WINDOWS,
    noticeDays: null,
    ...overrides,
  };
}

/** Original Medicare's terms as @tp/contracts' MA_NONCONTRACTED_TERMS gives them (a test keeps the two equal). */
export const MA_TERMS: AgreementTerms = {
  method: 'PERCENT_OF_MEDICARE',
  parameters: { percentage: decimal(100n), year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' },
  flags: { apply_mppr: true, apply_assistant_reduction: true, apply_sequestration: true, apply_ncci: true, timed_units_rule: 'MEDICARE_POOLED' },
  rounding: null,
};

/** A Medicare Advantage non-contracted resolution. */
export function maAgreement(mapping: Partial<PlanMappingRecord> = {}): AgreementResolution {
  return { outcome: 'MA_NONCONTRACTED', mapping: mappingRecord(mapping), terms: MA_TERMS };
}

export interface PercentTermsOptions {
  readonly percentage?: string;
  readonly yearBasis?: 'CURRENT' | `LOCKED:${number}`;
  readonly conversionFactor?: 'non_qualifying_apm' | 'qualifying_apm';
  readonly flags?: Partial<RateRecordTerms['flags']>;
  readonly rounding?: RateRecordTerms['rounding'];
  readonly codes?: readonly string[];
}

/** Percent-of-Medicare rate-record terms; commercial flags off unless named. */
export function percentTerms(options: PercentTermsOptions = {}): RateRecordTerms {
  return {
    scope: { codes: [...(options.codes ?? ['97110'])] },
    method: 'PERCENT_OF_MEDICARE',
    parameters: {
      percentage: decimal(options.percentage ?? '100'),
      year_basis: options.yearBasis ?? 'CURRENT',
      locality_basis: { kind: 'PRACTICE' },
      conversion_factor: options.conversionFactor ?? 'non_qualifying_apm',
    },
    flags: { apply_mppr: false, apply_assistant_reduction: false, apply_sequestration: false, apply_ncci: false, timed_units_rule: 'PER_CODE', ...options.flags },
    rounding: options.rounding ?? null,
  };
}

export interface ContractAgreementOptions {
  readonly terms?: RateRecordTerms;
  readonly rateRecordId?: string;
  readonly version?: Partial<ContractVersionRecord>;
  readonly windows?: RateWindows;
  readonly mapping?: Partial<PlanMappingRecord>;
}

/** A contract resolution: the signed-off version's one matching rate record. */
export function contractAgreement(options: ContractAgreementOptions = {}): AgreementResolution {
  const version = versionRecord({ windows: options.windows ?? OPEN_WINDOWS, ...options.version });
  return {
    outcome: 'CONTRACT_RATE',
    mapping: mappingRecord({ kind: 'contract', contractVersionId: version.id, ...options.mapping }),
    version,
    rate: { rateRecordId: options.rateRecordId ?? 'rr-synth-1', contractVersionId: version.id, terms: options.terms ?? percentTerms(), windows: version.windows },
  };
}

export function lineFacts(overrides: Partial<LineFacts> = {}): LineFacts {
  return {
    lineNo: 1,
    serviceLineId: null,
    procedureCode: '97110',
    modifiers: ['GP'],
    units: '1',
    serviceDate: '2026-03-10',
    placeOfService: '11',
    chargeCents: 6000n as Cents,
    observedAllowedCents: 2000n as Cents,
    observedAllowedBasis: 'amt_b6',
    patientShareAdjustments: [],
    agreement: maAgreement(),
    ...overrides,
  };
}

export function claimFacts(lines: readonly LineFacts[], overrides: Partial<Omit<ClaimFacts, 'lines'>> = {}): ClaimFacts {
  return { claimStatusCode: '1', reversed: false, corrected: false, remittanceDate: '2026-04-01', payerPlanKey: 'SYNTH-PLAN-1', lines, ...overrides };
}

/** A pricing input for the lines under a SYNTHETIC release, judged on 2026-10-15 unless told otherwise. */
export function pricingInput(release: IndexedRelease, lines: readonly LineFacts[], overrides: Partial<Omit<PricingInput, 'release' | 'claim'>> & { readonly claim?: Partial<Omit<ClaimFacts, 'lines'>> } = {}): PricingInput {
  const { claim, ...rest } = overrides;
  return { release, settings: practiceSettings(), asOf: '2026-10-15', ...rest, claim: claimFacts(lines, claim) };
}
