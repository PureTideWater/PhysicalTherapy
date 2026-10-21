import { type Cents, centsToString, decimal, formatCents, parseCents, sumCents } from '@tp/money';
import type { DeadlineStatus, DeadlineUnverifiedCause } from '@tp/triage';

import {
  type CodeSummary,
  type DeadlineSource,
  type EvidenceGap,
  type EvidenceItem,
  IDENTIFIER_KINDS,
  type InterestSection,
  type LineCalculation,
  type LineDeadline,
  PACKET_FORMAT,
  type PacketCitation,
  type PacketContentV2,
  type PacketDeadline,
  type PatternFacts,
  type PayerIdentification,
  type PracticeIdentification,
  type RuleReleaseReference,
  type ScheduleLineV2,
  type Source,
} from './format';
import { type PromptPayRecord, interestStated, promptPayInterest } from './interest';
import { placeholder } from './placeholders';
import { canonicalNumber } from './scan';

/**
 * Assembling a packet version's content from a case and approved records only (PRD 12, The packet):
 * the caller reads the case's lines that are not written off, each priced line in effect, the
 * signed-off contract version and its verified rate record (or the Medicare Advantage regulation), the
 * rule releases the lines were priced under and the state prompt-pay record; this function is pure and
 * computes every figure the version holds from them. The schedule's identifiers are placeholders.
 *
 * Each line's deadline and its status are what @tp/triage's deadlineVerification() derived from the
 * line's trace and the evidence behind its window (D17); each line's calculation is copied from its
 * stored trace (./calculation.ts). The version's deadline is the lines' (the earliest window, verified
 * only when every line's is) or, after a denial reopened the case, the next level's.
 */

export class PacketAssemblyError extends Error {
  override readonly name = 'PacketAssemblyError';
}

export interface AssemblyLine {
  readonly serviceLineId: string;
  readonly claimId: string;
  readonly pricedLineId: string;
  readonly pricingRunId: string;
  /** An opaque key of the patient (their reference's ID), used only to count patients. */
  readonly patientKey: string;
  readonly serviceDate: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: string;
  readonly expectedCents: Cents;
  readonly observedCents: Cents;
  readonly varianceCents: Cents;
  readonly paidCents: Cents;
  readonly paidOn: string;
  readonly receivedOn: string | null;
  readonly windowEndsOn: string | null;
  /** The line's deadline as @tp/triage's deadlineVerification() derived it (D17). */
  readonly deadline: DeadlineInput;
  /** The line's calculation summary, copied from its stored trace (lineCalculation). */
  readonly calculation: LineCalculation;
}

/** A deadline as @tp/triage derives it (DeadlineVerification): its status, source, last day and cause. */
export interface DeadlineInput {
  readonly status: DeadlineStatus;
  readonly source: 'contract' | 'release' | null;
  readonly endsOn: string | null;
  readonly cause: DeadlineUnverifiedCause | null;
}

export interface DocumentReference {
  readonly documentId: string;
  readonly sha256: string | null;
}

export interface AssemblyInput {
  /** The date (UTC) the version is assembled on. */
  readonly asOf: string;
  readonly disputeLevel: number;
  readonly practice: PracticeIdentification;
  readonly payer: PayerIdentification;
  readonly citation: PacketCitation;
  readonly releases: readonly RuleReleaseReference[];
  /** The adjustment behavior of the case's pattern (BELOW_CONTRACT_RATE, MPPR_NOT_IN_CONTRACT, ...). */
  readonly behavior: string;
  readonly lines: readonly AssemblyLine[];
  /** The state whose prompt-pay rule the person says applies to the payer, with its record in the release (null when the release has none). */
  readonly interest: { readonly state: string; readonly releaseNo: number; readonly record: PromptPayRecord | null } | null;
  readonly contractDocuments: readonly DocumentReference[];
  readonly remittances: readonly (DocumentReference & { readonly paidOn: string })[];
  readonly attachedDocuments: readonly DocumentReference[];
  /** At dispute level 2 and above, the next level's window and its verification (nextLevelDeadlineVerification); null at level 1. */
  readonly nextLevelDeadline: DeadlineInput | null;
  /** The evidence behind the lines' windows (or the next level's): the contract's cited window, the release records. */
  readonly deadlineSources: readonly DeadlineSource[];
}

/** The pattern's fixed amount per unit (or per visit) for a code, when the contract states one. */
function contractAmount(citation: PacketCitation): string | null {
  if (citation.kind !== 'contract') {
    return null;
  }
  const parameters = citation.parameters as { readonly amount_cents?: unknown; readonly schedule?: { readonly method?: unknown; readonly amount_cents?: unknown } };
  if ((citation.method === 'FIXED_SCHEDULE' || citation.method === 'PER_VISIT') && typeof parameters.amount_cents === 'string') {
    return parameters.amount_cents;
  }
  if (citation.method === 'LESSER_OF' && parameters.schedule?.method === 'FIXED_SCHEDULE' && typeof parameters.schedule.amount_cents === 'string') {
    return parameters.schedule.amount_cents;
  }
  return null;
}

function contractPercentages(citation: PacketCitation): { readonly percentages: string[]; readonly years: number[] } {
  const percentages: string[] = [];
  const years: number[] = [];
  const read = (value: unknown) => {
    if (typeof value !== 'object' || value === null) {
      return;
    }
    const record = value as Readonly<Record<string, unknown>>;
    for (const key of ['percentage', 'percent']) {
      const found = record[key];
      if (typeof found === 'string') {
        percentages.push(canonicalNumber(found));
      }
    }
    const basis = record.year_basis;
    if (typeof basis === 'string' && basis.startsWith('LOCKED:')) {
      years.push(Number.parseInt(basis.slice('LOCKED:'.length), 10));
    }
    for (const nested of [record.schedule, record.contract_adjustment]) {
      read(nested);
    }
  };
  if (citation.kind === 'contract') {
    read(citation.parameters);
  }
  return { percentages: [...new Set(percentages)].sort(), years: [...new Set(years)].sort((a, b) => a - b) };
}

const sumUnits = (units: readonly string[]) => units.reduce((total, item) => total.plus(decimal(item)), decimal(0n)).toString();
const text = (amounts: readonly Cents[]) => centsToString(sumCents(amounts));

function patternFacts(input: AssemblyInput, lines: readonly AssemblyLine[]): PatternFacts {
  const amount = contractAmount(input.citation);
  const codes = [...new Set(lines.map((line) => line.procedureCode))].sort().map((code): CodeSummary => {
    const of = lines.filter((line) => line.procedureCode === code);
    return {
      procedure_code: code,
      lines: of.length,
      units: sumUnits(of.map((line) => line.units)),
      expected_cents: text(of.map((line) => line.expectedCents)),
      observed_cents: text(of.map((line) => line.observedCents)),
      variance_cents: text(of.map((line) => line.varianceCents)),
      contract_amount_cents: amount,
    };
  });
  const dates = lines.map((line) => line.serviceDate).sort();
  const { percentages, years } = contractPercentages(input.citation);
  return {
    behavior: input.behavior,
    method: input.citation.method,
    contract_percentages: percentages,
    contract_years: years,
    codes,
    lines: lines.length,
    claims: new Set(lines.map((line) => line.claimId)).size,
    patients: new Set(lines.map((line) => line.patientKey)).size,
    units: sumUnits(lines.map((line) => line.units)),
    expected_cents: text(lines.map((line) => line.expectedCents)),
    observed_cents: text(lines.map((line) => line.observedCents)),
    variance_cents: text(lines.map((line) => line.varianceCents)),
    first_service_date: dates[0] ?? input.asOf,
    last_service_date: dates.at(-1) ?? input.asOf,
  };
}

/** The requested action (PRD 12: "reprocess the listed claims at the contract rate"), fixed text by code. */
export function requestedAction(citation: PacketCitation, disputeLevel: number, interestStated: boolean): string {
  const level = disputeLevel > 1 ? `Dispute level ${String(disputeLevel)}. ` : '';
  const reprocess =
    citation.kind === 'contract'
      ? 'Reprocess the listed claims at the contract rate cited above and pay the variance shown in the line schedule.'
      : 'Reprocess the listed claims at the amount Original Medicare would pay, as the regulation cited above requires, and pay the variance shown in the line schedule.';
  const interest = interestStated ? ' Pay the prompt-pay interest stated in the interest line, which is not part of the variance.' : '';
  return `${level}${reprocess}${interest}`;
}

/** A line's deadline as a tp-packet/2 version states it. */
export const lineDeadline = (deadline: DeadlineInput): LineDeadline => ({ ends_on: deadline.endsOn, status: deadline.status, source: deadline.source, cause: deadline.cause });

const sourceKey = (source: DeadlineSource) =>
  source.kind === 'contract_window' ? `contract_window:${source.contract_version_id}:${source.document_id}` : `release_record:${String(source.release_no)}:${source.sha256}`;

/**
 * The version's deadline: the lines' own windows at the first level (the earliest ends first; verified
 * only when every line's is), the next level's window after a denial reopened the case. The export job
 * states it again from the inputs as they stand (apps/worker/src/packets/records.ts) and compares.
 */
export function packetDeadline(
  input: Pick<AssemblyInput, 'disputeLevel' | 'nextLevelDeadline' | 'deadlineSources'>,
  lines: readonly { readonly deadline: LineDeadline }[],
): PacketDeadline {
  const sources = [...new Map(input.deadlineSources.map((source) => [sourceKey(source), source])).values()].sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)));
  const linesVerified = lines.filter((line) => line.deadline.status === 'verified').length;
  if (input.disputeLevel > 1) {
    const next = input.nextLevelDeadline;
    if (next === null) {
      throw new PacketAssemblyError('a dispute after the first level states its next window and whether it is verified');
    }
    return { basis: 'next_level_window', ends_on: next.endsOn, status: next.status, lines_verified: linesVerified, lines: lines.length, causes: next.cause === null ? [] : [next.cause], sources };
  }
  const ends = lines.map((line) => line.deadline.ends_on).filter((date): date is string => date !== null).sort();
  const causes = [...new Set(lines.map((line) => line.deadline.cause).filter((cause): cause is DeadlineUnverifiedCause => cause !== null))].sort();
  return {
    basis: 'line_windows',
    ends_on: ends[0] ?? null,
    status: linesVerified === lines.length ? 'verified' : 'unverified',
    lines_verified: linesVerified,
    lines: lines.length,
    causes,
    sources,
  };
}

const byLine = (a: AssemblyLine, b: AssemblyLine) =>
  a.serviceDate.localeCompare(b.serviceDate) || a.procedureCode.localeCompare(b.procedureCode) || a.claimId.localeCompare(b.claimId) || a.serviceLineId.localeCompare(b.serviceLineId);

export function assemblePacket(input: AssemblyInput): PacketContentV2 {
  if (input.lines.length === 0) {
    throw new PacketAssemblyError('a packet asks for at least one line of its case that is not written off');
  }
  if (input.lines.some((line) => line.varianceCents <= 0n)) {
    throw new PacketAssemblyError('every line a packet asks for is paid below its expected amount');
  }
  if (input.disputeLevel < 1 || !Number.isInteger(input.disputeLevel)) {
    throw new PacketAssemblyError('a dispute level is a whole number from 1');
  }
  const ordered = [...input.lines].sort(byLine);
  const lines = ordered.map((line, index): ScheduleLineV2 => {
    const row = index + 1;
    const identifiers = Object.fromEntries(IDENTIFIER_KINDS.map((kind) => [kind, placeholder(kind, row)])) as Record<(typeof IDENTIFIER_KINDS)[number], string>;
    return {
      row,
      service_line_id: line.serviceLineId,
      claim_id: line.claimId,
      priced_line_id: line.pricedLineId,
      pricing_run_id: line.pricingRunId,
      trace_ref: `priced_line:${line.pricedLineId}`,
      ...identifiers,
      service_date: line.serviceDate,
      procedure_code: line.procedureCode,
      modifiers: [...line.modifiers],
      units: canonicalNumber(line.units),
      expected_cents: centsToString(line.expectedCents),
      observed_cents: centsToString(line.observedCents),
      variance_cents: centsToString(line.varianceCents),
      paid_cents: centsToString(line.paidCents),
      paid_on: line.paidOn,
      received_on: line.receivedOn,
      window_ends_on: line.windowEndsOn,
      deadline: lineDeadline(line.deadline),
      calculation: line.calculation,
    };
  });

  const gaps: EvidenceGap[] = [];
  let interest: InterestSection | null = null;
  if (input.interest !== null) {
    const result = promptPayInterest(
      input.interest.state,
      input.interest.releaseNo,
      input.interest.record,
      lines.map((line) => ({ row: line.row, paid_cents: line.paid_cents, variance_cents: line.variance_cents, paid_on: line.paid_on, received_on: line.received_on })),
      input.asOf,
    );
    interest = result.section;
    gaps.push(...result.gaps);
  }

  const evidence: EvidenceItem[] = [];
  const seen = new Set<string>();
  const add = (item: EvidenceItem) => {
    const key = `${item.kind}:${item.document_id ?? item.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      evidence.push(item);
    }
  };
  if (input.citation.kind === 'contract') {
    const { citation } = input;
    if (citation.document_sha256 === null) {
      gaps.push({ code: 'contract_document_hash_unknown', row: null });
    }
    add({ kind: 'contract_document', document_id: citation.document_id, sha256: citation.document_sha256, label: `Contract document cited at page ${String(citation.page)} (contract version ${String(citation.version_no)})` });
    for (const document of input.contractDocuments) {
      add({ kind: 'contract_document', document_id: document.documentId, sha256: document.sha256, label: `Contract document of version ${String(citation.version_no)}` });
    }
  }
  for (const remittance of [...input.remittances].sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.documentId.localeCompare(b.documentId))) {
    add({ kind: 'remittance', document_id: remittance.documentId, sha256: remittance.sha256, label: `835 remittance paid ${remittance.paidOn}` });
  }
  for (const release of [...input.releases].sort((a, b) => a.release_no - b.release_no)) {
    add({ kind: 'rule_release', document_id: null, sha256: release.manifest_sha256, label: `Rule release ${String(release.release_no)}` });
  }
  for (const document of input.attachedDocuments) {
    add({ kind: 'attached_document', document_id: document.documentId, sha256: document.sha256, label: 'Document attached to the packet' });
  }

  const sources: Source[] = [
    { marker: 1, kind: 'citation', evidence_index: null },
    { marker: 2, kind: 'rule_release', evidence_index: null },
    { marker: 3, kind: 'line_schedule', evidence_index: null },
  ];
  if (interest !== null) {
    sources.push({ marker: 4, kind: 'interest', evidence_index: null });
  }
  evidence.forEach((_item, index) => {
    sources.push({ marker: sources.length + 1, kind: 'evidence', evidence_index: index });
  });

  return {
    format: PACKET_FORMAT,
    as_of: input.asOf,
    dispute_level: input.disputeLevel,
    practice: input.practice,
    payer: input.payer,
    citation: input.citation,
    rule_releases: [...input.releases].sort((a, b) => a.release_no - b.release_no),
    pattern: patternFacts(input, ordered),
    lines,
    interest,
    evidence,
    evidence_gaps: gaps,
    requested_action: requestedAction(input.citation, input.disputeLevel, interestStated(interest)),
    sources,
    deadline: packetDeadline(input, lines),
  };
}

/** Dollars as the narrative and the export write them: $1234.56. */
export function dollars(amount: string): string {
  return `$${formatCents(parseCents(amount))}`;
}
