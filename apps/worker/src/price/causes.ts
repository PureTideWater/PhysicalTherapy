import { canonicalJson } from '@tp/rules';

/**
 * Why a line priced differently in two runs, read from the two traces alone (PRD 9, step 4: "a re-run
 * ... produces a diff of changed lines"; J17; test matrix PRC-19, MAP-03; docs/adr/0037). Pure: the
 * caller says whether two stored records of a rule hold the same values (a record re-sourced in a new
 * release has a new SHA-256 and the same value, which changes nothing).
 *
 * - mapping: the line resolved under another mapping (a correction, MAP-03).
 * - contract_version: another contract version or rate record priced it (a sign-off, an amendment).
 * - release_record: a rule record the line read holds another value or window in the second run's
 *   release, or (with the same agreement) the line read a record in one release that the other lacks.
 * - claim: the claim's facts changed between the runs (a reversal or correction loaded since).
 * - settings: the practice's settings changed (its ZIP, rounding or place-of-service split).
 * - engine: another engine version priced it.
 * - claim_lines: none of the line's own inputs changed, so another line of its claim changed how it
 *   prices (the multiple procedure ranking, or the per-visit carrier).
 */

export const CAUSE_KINDS = ['mapping', 'contract_version', 'release_record', 'claim', 'settings', 'engine', 'claim_lines'] as const;
export type CauseKind = (typeof CAUSE_KINDS)[number];

/** How a trace names a rule record. */
export interface TraceRecordRef {
  readonly record_type: string;
  readonly key: Readonly<Record<string, string>>;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly sha256: string;
}

/** One stored version of a rule: its record's hash and window. */
export interface RecordVersion {
  readonly sha256: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

export interface MappingPin {
  readonly mappingId: string | null;
  readonly mappingKind: string | null;
}

export interface ContractPin {
  readonly contractVersionId: string | null;
  readonly rateRecordId: string | null;
}

export type LineCause =
  | { readonly kind: 'mapping'; readonly before: MappingPin; readonly after: MappingPin }
  | { readonly kind: 'contract_version'; readonly before: ContractPin; readonly after: ContractPin }
  | {
      readonly kind: 'release_record';
      readonly recordType: string;
      readonly key: Readonly<Record<string, string>>;
      /** Null: the line read no record of this rule in that run's release. */
      readonly before: RecordVersion | null;
      readonly after: RecordVersion | null;
    }
  | { readonly kind: 'claim' }
  | { readonly kind: 'settings' }
  | { readonly kind: 'engine'; readonly before: string; readonly after: string }
  | { readonly kind: 'claim_lines' };

/** The parts of a stored trace (tp-pricing-trace/2) the causes read. */
export interface CauseTrace {
  readonly engine: string;
  readonly settings: unknown;
  readonly claim: unknown;
  readonly agreement: {
    readonly mapping_id: string | null;
    readonly mapping_kind: string | null;
    readonly contract_version_id: string | null;
    readonly rate_record_id: string | null;
  } | null;
}

function isRecordRef(value: Readonly<Record<string, unknown>>): boolean {
  return typeof value.record_type === 'string' && typeof value.sha256 === 'string' && typeof value.effective_from === 'string' && typeof value.key === 'object' && value.key !== null;
}

/** A rule's identity in a release: its type and key. */
export function ruleLabel(ref: Pick<TraceRecordRef, 'record_type' | 'key'>): string {
  return `${ref.record_type} ${canonicalJson(ref.key)}`;
}

/** Every rule record a trace names, by rule (the first one named where a rule appears twice). */
export function recordsRead(trace: unknown): Map<string, TraceRecordRef> {
  const found = new Map<string, TraceRecordRef>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    const object = value as Readonly<Record<string, unknown>>;
    if (isRecordRef(object)) {
      const ref = object as unknown as TraceRecordRef;
      if (!found.has(ruleLabel(ref))) {
        found.set(ruleLabel(ref), ref);
      }
      return;
    }
    Object.values(object).forEach(visit);
  };
  visit(trace);
  return found;
}

function version(ref: TraceRecordRef | undefined): RecordVersion | null {
  return ref === undefined ? null : { sha256: ref.sha256, effectiveFrom: ref.effective_from, effectiveTo: ref.effective_to };
}

/**
 * The record pairs of two traces whose hashes differ, for the caller to look up (same rule, a record
 * in each trace): only these can hold the same value under another hash.
 */
export function differingRecords(before: unknown, after: unknown): { readonly before: TraceRecordRef; readonly after: TraceRecordRef }[] {
  const first = recordsRead(before);
  const second = recordsRead(after);
  const pairs: { before: TraceRecordRef; after: TraceRecordRef }[] = [];
  for (const [label, ref] of first) {
    const other = second.get(label);
    if (other !== undefined && other.sha256 !== ref.sha256) {
      pairs.push({ before: ref, after: other });
    }
  }
  return pairs;
}

/**
 * The causes of a line's difference, in CAUSE_KINDS order. `sameRule` says whether two records of one
 * rule with different hashes hold the same value and window. Records a line read in one run only are
 * a cause only when the line kept its mapping and contract terms; otherwise they follow from the new
 * terms, which are the cause.
 */
export function lineCauses(before: CauseTrace, after: CauseTrace, sameRule: (before: TraceRecordRef, after: TraceRecordRef) => boolean): LineCause[] {
  const causes: LineCause[] = [];
  const mapping = (trace: CauseTrace): MappingPin => ({ mappingId: trace.agreement?.mapping_id ?? null, mappingKind: trace.agreement?.mapping_kind ?? null });
  const contract = (trace: CauseTrace): ContractPin => ({ contractVersionId: trace.agreement?.contract_version_id ?? null, rateRecordId: trace.agreement?.rate_record_id ?? null });
  if (canonicalJson(mapping(before)) !== canonicalJson(mapping(after))) {
    causes.push({ kind: 'mapping', before: mapping(before), after: mapping(after) });
  }
  if (canonicalJson(contract(before)) !== canonicalJson(contract(after))) {
    causes.push({ kind: 'contract_version', before: contract(before), after: contract(after) });
  }
  const sameTerms = causes.length === 0;
  const first = recordsRead(before);
  const second = recordsRead(after);
  const labels = [...new Set([...first.keys(), ...second.keys()])].sort();
  for (const label of labels) {
    const earlier = first.get(label);
    const later = second.get(label);
    if (earlier !== undefined && later !== undefined) {
      if (earlier.sha256 === later.sha256 || sameRule(earlier, later)) {
        continue;
      }
    } else if (!sameTerms) {
      continue;
    }
    const ref = (earlier ?? later) as TraceRecordRef;
    causes.push({ kind: 'release_record', recordType: ref.record_type, key: ref.key, before: version(earlier), after: version(later) });
  }
  if (canonicalJson(before.claim) !== canonicalJson(after.claim)) {
    causes.push({ kind: 'claim' });
  }
  if (canonicalJson(before.settings) !== canonicalJson(after.settings)) {
    causes.push({ kind: 'settings' });
  }
  if (before.engine !== after.engine) {
    causes.push({ kind: 'engine', before: before.engine, after: after.engine });
  }
  return causes.length === 0 ? [{ kind: 'claim_lines' }] : causes;
}
