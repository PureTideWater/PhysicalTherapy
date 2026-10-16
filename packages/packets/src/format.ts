/**
 * What a packet version holds (PRD 12, The packet; Data dictionary, packet_version): the practice and
 * payer identification, the contract citation (version, document, page, quoted clause) and the rule
 * release, the pattern statement's facts (what the contract requires, what the remittances show, the
 * delta and the count), the line schedule (claim control numbers, service dates, codes, units,
 * expected, observed and variance, each with its trace reference), interest where a state prompt-pay
 * rule applies (its own line, never inside expected), the evidence list with its gaps, and the
 * requested action. Every amount is integer cents written as text; every date a calendar date.
 *
 * Identifiers are never in a version: the schedule's claim numbers, patient names and member IDs are
 * placeholders ({{claim_control_number:3}}) that code fills in from the canonical record only at export
 * (CAS-11), so no draft can carry the wrong patient's identifiers.
 */

export const PACKET_FORMAT = 'tp-packet/1';
export const VERIFIER_FORMAT = 'tp-packet-verifier/2';

/** Kinds of payer response a submission can receive (Data dictionary, `payer_response.kind`). */
export const PAYER_RESPONSE_KINDS = ['accepted', 'partial', 'denied', 'info_requested', 'reprocessed_no_change'] as const;
export type PayerResponseKind = (typeof PAYER_RESPONSE_KINDS)[number];

/** Channels the customer submits through (PRD 12: payer portal, fax, mail or provider-relations email). */
export const SUBMISSION_CHANNELS = ['payer_portal', 'fax', 'mail', 'provider_relations_email'] as const;
export type SubmissionChannel = (typeof SUBMISSION_CHANNELS)[number];

/** Days from a submission to its follow-up unless the person names another date (PRD 12; CAS-14). */
export const FOLLOW_UP_DAYS = 45;

/** The identifiers inserted at export, each a placeholder in every draft. */
export const IDENTIFIER_KINDS = ['claim_control_number', 'patient_control_number', 'patient_name', 'member_id'] as const;
export type IdentifierKind = (typeof IDENTIFIER_KINDS)[number];

/** The rate methods a packet can cite (a rate record's method), and Medicare Advantage non-contracted. */
export type CitedMethod = 'FIXED_SCHEDULE' | 'PERCENT_OF_MEDICARE' | 'LESSER_OF' | 'PER_VISIT' | 'MA_NONCONTRACTED';

export interface PracticeIdentification {
  readonly practice_id: string;
  readonly name: string;
  readonly npi: string | null;
  readonly tax_id_last4: string | null;
}

export interface PayerIdentification {
  readonly payer_id: string;
  readonly name: string;
  readonly payer_id_raw: string;
  readonly plan_id: string;
  readonly plan_key: string;
  readonly plan_name: string | null;
}

/** The contract clause the pattern rests on: version, document, page and quoted clause. */
export interface ContractCitation {
  readonly kind: 'contract';
  readonly contract_id: string;
  readonly contract_title: string;
  readonly contract_version_id: string;
  readonly version_no: number;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly rate_record_id: string;
  readonly method: Exclude<CitedMethod, 'MA_NONCONTRACTED'>;
  /** The rate record's parameters as stored (amounts in cents as text, percentages as text). */
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly document_id: string;
  readonly document_sha256: string | null;
  readonly page: number;
  readonly quote: string;
  /** The SHA-256 of the cited page's text, as the rate record's evidence holds it. */
  readonly page_sha256: string;
}

/**
 * A Medicare Advantage non-contracted pattern: no contract, the regulation the rules reference cites
 * (42 CFR 422.214) and the fee schedule of the rule release. A specialist confirms its application to
 * the case before the packet is approved (PRD 2, step 5).
 */
export interface RegulationCitation {
  readonly kind: 'regulation';
  readonly method: 'MA_NONCONTRACTED';
  readonly reference: string;
  readonly statement: string;
}

export type PacketCitation = ContractCitation | RegulationCitation;

export interface RuleReleaseReference {
  readonly release_no: number;
  readonly manifest_sha256: string;
}

/** One row of the line schedule. Identifiers are placeholders; the trace reference is the priced line. */
export interface ScheduleLine {
  readonly row: number;
  readonly service_line_id: string;
  readonly claim_id: string;
  readonly priced_line_id: string;
  readonly pricing_run_id: string;
  /** The trace of the line's expected amount: the priced line it was priced as. */
  readonly trace_ref: string;
  readonly claim_control_number: string;
  readonly patient_control_number: string;
  readonly patient_name: string;
  readonly member_id: string;
  readonly service_date: string;
  readonly procedure_code: string;
  readonly modifiers: readonly string[];
  /** Units as a canonical decimal ("2"). */
  readonly units: string;
  readonly expected_cents: string;
  readonly observed_cents: string;
  readonly variance_cents: string;
  /** What the payer paid on the line, and when (the remittance's payment date). */
  readonly paid_cents: string;
  readonly paid_on: string;
  /** When the payer received the claim (DTM 050), when the remittance says. */
  readonly received_on: string | null;
  readonly window_ends_on: string | null;
}

export interface CodeSummary {
  readonly procedure_code: string;
  readonly lines: number;
  readonly units: string;
  readonly expected_cents: string;
  readonly observed_cents: string;
  readonly variance_cents: string;
  /** The contract's amount for the code, per unit (fixed schedule) or per visit (per visit), when it states one. */
  readonly contract_amount_cents: string | null;
}

/** The pattern statement's facts: what the contract requires, what the remittances show, the delta and the count. */
export interface PatternFacts {
  readonly behavior: string;
  readonly method: CitedMethod;
  /** Percentages the contract states (a percent of Medicare, a contract adjustment), as text. */
  readonly contract_percentages: readonly string[];
  /** Years the contract states (a locked fee-schedule year). */
  readonly contract_years: readonly number[];
  readonly codes: readonly CodeSummary[];
  readonly lines: number;
  readonly claims: number;
  readonly patients: number;
  readonly units: string;
  readonly expected_cents: string;
  readonly observed_cents: string;
  readonly variance_cents: string;
  readonly first_service_date: string;
  readonly last_service_date: string;
}

export interface InterestLine {
  readonly row: number;
  readonly received_on: string | null;
  readonly due_on: string | null;
  readonly paid_on: string;
  /** Days the payment came after it was due (0 when on time); null when it cannot be computed. */
  readonly days_late: number | null;
  /** Days from the due date to the version's date, over which the unpaid variance accrues. */
  readonly days_unpaid: number | null;
  readonly interest_cents: string | null;
}

/** Interest under a state prompt-pay rule, its own line, never part of expected allowed (CAS-15). */
export interface InterestSection {
  readonly state: string;
  readonly release_no: number;
  readonly record_sha256: string | null;
  readonly statute: string | null;
  readonly days_to_pay: number | null;
  readonly day_basis: string | null;
  readonly annual_rate_percent: string | null;
  readonly exclusions: readonly string[];
  /** Whether every line's interest could be computed. */
  readonly computed: boolean;
  /** Why some or all of it could not be (also listed as evidence gaps). */
  readonly reasons: readonly EvidenceGapCode[];
  readonly lines: readonly InterestLine[];
  /** The sum of the lines that could be computed; null when none could. */
  readonly total_cents: string | null;
}

export const EVIDENCE_KINDS = ['contract_document', 'remittance', 'rule_release', 'attached_document'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface EvidenceItem {
  readonly kind: EvidenceKind;
  /** The source document (opaque ID), or null for the rule release. */
  readonly document_id: string | null;
  readonly sha256: string | null;
  /** A fixed description built by code (never a person's words). */
  readonly label: string;
}

export const EVIDENCE_GAP_CODES = [
  'interest_rate_unknown',
  'interest_business_days',
  'prompt_pay_rule_missing',
  'prompt_pay_rule_not_in_effect',
  'claim_received_date_unknown',
  'contract_document_hash_unknown',
] as const;
export type EvidenceGapCode = (typeof EVIDENCE_GAP_CODES)[number];

export interface EvidenceGap {
  readonly code: EvidenceGapCode;
  /** The schedule row it concerns, when one. */
  readonly row: number | null;
}

export const SOURCE_KINDS = ['citation', 'rule_release', 'line_schedule', 'interest', 'evidence'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** A numbered source a narrative sentence cites with its marker ([1], [3]). */
export interface Source {
  readonly marker: number;
  readonly kind: SourceKind;
  /** For an evidence source: its index in the evidence list, from 0. */
  readonly evidence_index: number | null;
}

export interface PacketContent {
  readonly format: typeof PACKET_FORMAT;
  /** The date (UTC) the version was assembled: interest accrues to it. */
  readonly as_of: string;
  /** 1 for the first dispute; one more after each denial that reopened the case for the next level. */
  readonly dispute_level: number;
  readonly practice: PracticeIdentification;
  readonly payer: PayerIdentification;
  readonly citation: PacketCitation;
  readonly rule_releases: readonly RuleReleaseReference[];
  readonly pattern: PatternFacts;
  readonly lines: readonly ScheduleLine[];
  readonly interest: InterestSection | null;
  readonly evidence: readonly EvidenceItem[];
  readonly evidence_gaps: readonly EvidenceGap[];
  readonly requested_action: string;
  readonly sources: readonly Source[];
}
