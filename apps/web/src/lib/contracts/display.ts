import { type EvidenceProblem, type RateMethod, type RateRecordField, type RateRecordTerms, addDays } from '@tp/contracts';
import type { MappingKind, QuestionTopic, VersionStatus } from '@tp/db/runtime';
import { formatUsd } from '@tp/money';

/**
 * Words for the contract screens (PRD 7, Contracts, Rate record review, Payer and plan mapping and
 * Coverage): states, kinds, methods and each field of a rate record as the review screen shows it, from
 * the typed terms (amounts from cents without a float, percentages from their decimal text). Windows
 * are stored half-open [from, to) and shown with their last day, as contracts write them.
 */

/** PRD 7, Contracts: "status (draft, under review, approved, signed off, superseded)". */
export const VERSION_STATUS_NAMES: Readonly<Record<VersionStatus, string>> = {
  draft: 'Draft',
  proposed: 'Under review',
  approved: 'Approved',
  signed_off: 'Signed off',
  superseded: 'Superseded',
};

export const MAPPING_KIND_NAMES: Readonly<Record<MappingKind, string>> = {
  contract: 'Contract version',
  no_agreement: 'No agreement (out of network)',
  ma_noncontracted: 'Medicare Advantage, non-contracted',
  government: 'Government',
  other: 'Other',
};

export const METHOD_NAMES: Readonly<Record<RateMethod, string>> = {
  FIXED_SCHEDULE: 'Fixed schedule',
  PERCENT_OF_MEDICARE: 'Percent of Medicare',
  LESSER_OF: 'Lesser of',
  PER_VISIT: 'Per visit',
  UNSUPPORTED: 'Unsupported (capitation or undefined case rate)',
};

export const FIELD_NAMES: Readonly<Record<RateRecordField, string>> = {
  scope: 'Scope',
  method: 'Method',
  parameters: 'Parameters',
  flags: 'Flags',
  rounding: 'Rounding',
};

export const TOPIC_NAMES: Readonly<Record<QuestionTopic, string>> = {
  missing_pages: 'Missing pages',
  missing_schedule: 'Missing fee schedule',
  undefined_method: 'Undefined payment method',
  scope: 'Which codes or places a term covers',
  timed_units: 'How timed units are counted',
  windows: 'Filing, dispute or appeal windows',
  other: 'Other',
};

/** Topics whose answer is a document to obtain: the Coverage screen lists them under what to obtain (J5). */
export const OBTAIN_TOPICS: readonly QuestionTopic[] = ['missing_pages', 'missing_schedule', 'undefined_method'];

export const EVIDENCE_PROBLEM_TEXT: Readonly<Record<EvidenceProblem, string>> = {
  not_cited: 'No page is cited yet',
  document_not_in_version: 'The cited document is not one of this version’s documents',
  document_unreadable: 'The cited document cannot be read',
  unsupported_document: 'The cited document is not a PDF with text (a scan or a spreadsheet cannot be cited yet)',
  no_text: 'The cited page has no text to compare',
  page_missing: 'The document has no such page',
  quote_not_on_page: 'The quote is not on the cited page',
  hash_mismatch: 'The page has changed since it was cited',
};

/** A window [from, to) with its last day: "2026-01-01 through 2026-12-31", or open-ended. */
export function windowText(from: string, to: string | null): string {
  return to === null ? `from ${from}, open-ended` : `${from} through ${addDays(to, -1)}`;
}

/** The first day after a last day the form gave (the stored, exclusive end), or null. */
export function exclusiveEnd(lastDay: string | undefined): string | null {
  return lastDay === undefined ? null : addDays(lastDay, 1);
}

function list(values: readonly string[]): string {
  return values.join(', ');
}

function percentText(parameters: Extract<RateRecordTerms, { method: 'PERCENT_OF_MEDICARE' }>['parameters']): string {
  const year = parameters.year_basis === 'CURRENT' ? 'the fee schedule in effect on the date of service' : `the ${parameters.year_basis.slice('LOCKED:'.length)} fee schedule`;
  const locality = parameters.locality_basis.kind === 'PRACTICE' ? 'the practice’s locality' : `carrier ${parameters.locality_basis.carrier}, locality ${parameters.locality_basis.locality}`;
  const factor = parameters.conversion_factor === 'qualifying_apm' ? 'the qualifying APM conversion factor' : 'the non-qualifying conversion factor';
  return `${parameters.percentage.toString()}% of Medicare: ${year}, ${locality}, ${factor}`;
}

function parametersText(terms: RateRecordTerms): string {
  switch (terms.method) {
    case 'FIXED_SCHEDULE':
      return `${formatUsd(terms.parameters.amount_cents)} per unit`;
    case 'PER_VISIT':
      return `${formatUsd(terms.parameters.amount_cents)} once per claim and date`;
    case 'PERCENT_OF_MEDICARE':
      return percentText(terms.parameters);
    case 'LESSER_OF': {
      const { schedule } = terms.parameters;
      const scheduled = schedule.method === 'FIXED_SCHEDULE' ? `${formatUsd(schedule.amount_cents)} per unit` : percentText(schedule);
      return `The lesser of the line’s billed charge and ${scheduled}`;
    }
    case 'UNSUPPORTED':
      return 'None';
  }
}

const TIMED_UNITS: Readonly<Record<RateRecordTerms['flags']['timed_units_rule'], string>> = {
  MEDICARE_POOLED: 'pooled as Medicare counts them',
  PER_CODE: 'counted per code',
  UNKNOWN: 'unknown until the contract says or minutes are imported',
};

const ROUNDING: Readonly<Record<NonNullable<RateRecordTerms['rounding']>, string>> = {
  HALF_UP_CENT: 'Half up to the cent',
  HALF_EVEN_CENT: 'Half even to the cent',
  TRUNCATE: 'Truncated to the cent',
};

/** Each field of a rate record in words, as the review screen shows it beside its approval. */
export function describeTerms(terms: RateRecordTerms): Readonly<Record<RateRecordField, string>> {
  const { scope, flags } = terms;
  const parts = [`Codes ${list(scope.codes)}`];
  parts.push(scope.modifier_sets === undefined ? 'any modifiers' : `modifiers ${scope.modifier_sets.map((set) => (set.length === 0 ? 'none' : set.join(' '))).join(' or ')}`);
  parts.push(scope.places_of_service === undefined ? 'any place of service' : `places of service ${list(scope.places_of_service)}`);
  if (scope.provider_types !== undefined) {
    parts.push(`provider types ${list(scope.provider_types)}`);
  }
  if (scope.effective_from !== undefined || scope.effective_to !== undefined) {
    parts.push(`service dates ${windowText(scope.effective_from ?? 'the version’s start', scope.effective_to ?? null)}`);
  }
  const onOff = (value: boolean) => (value ? 'on' : 'off');
  return {
    scope: parts.join('; '),
    method: METHOD_NAMES[terms.method],
    parameters: parametersText(terms),
    flags: `MPPR ${onOff(flags.apply_mppr)}, assistant reduction ${onOff(flags.apply_assistant_reduction)}, sequestration ${onOff(flags.apply_sequestration)}, NCCI ${onOff(flags.apply_ncci)}; timed units ${TIMED_UNITS[flags.timed_units_rule]}`,
    rounding: terms.rounding === null ? 'The contract is silent: the practice’s default rounding applies' : ROUNDING[terms.rounding],
  };
}
