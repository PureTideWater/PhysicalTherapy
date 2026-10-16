/**
 * The model gateway's synthetic evaluation sets as files (PRD 14, Logging and evaluation; test matrix
 * MOD-01 and MOD-03; docs/adr/0051). packages/synth writes them under fixtures/synthetic; the
 * evaluation harness (packages/model-gateway/eval) reads them. Every value is invented and every file
 * says SYNTHETIC.
 *
 * The contract set (MOD-01): 40 contracts and exhibits in three layouts. Each case is a directory with
 * the document as intake receives it (a text PDF, a CSV, or a scanned PDF with no text layer and the
 * scan reader's recorded answer beside it) and truth.json: the rate records the document states, every
 * field with its value as code reads it, the text it is written as, the page and the quote.
 *
 * The narrative set (MOD-03): 300 pattern statements' inputs, each the approved records a packet is
 * assembled from (no identifier at all: the schedule's identifiers are placeholders), the case's
 * invented identifiers the verifier checks a narrative against, the facts any narrative of it must
 * state, and a reference narrative written by this package from its own arithmetic.
 */

export const CONTRACT_SET_FORMAT = 'tp-eval-contract-set/1';
export const CONTRACT_TRUTH_FORMAT = 'tp-eval-contract/1';
export const NARRATIVE_SET_FORMAT = 'tp-eval-narratives/1';

export const CONTRACT_LAYOUTS = ['table', 'prose', 'scanned'] as const;
export type ContractLayout = (typeof CONTRACT_LAYOUTS)[number];

/** A rate record's fields as the gateway's proposals name them (packages/model-gateway CITED_FIELDS, and the uncited schedule of a lesser-of rate). */
export const TRUTH_FIELDS = [
  'method',
  'codes',
  'modifiers',
  'places_of_service',
  'amount',
  'percentage',
  'fee_schedule_year',
  'lesser_of_schedule',
  'flags',
  'rounding',
  'effective_from',
  'effective_to',
] as const;
export type TruthField = (typeof TRUTH_FIELDS)[number];

export interface TruthFlags {
  readonly apply_mppr: boolean;
  readonly apply_assistant_reduction: boolean;
  readonly apply_sequestration: boolean;
  readonly apply_ncci: boolean;
  readonly timed_units_rule: 'MEDICARE_POOLED' | 'PER_CODE' | 'UNKNOWN';
}

/**
 * One field of a true rate record. `value` is what code reads the field as: cents as integer text
 * (amount), a plain decimal (percentage), the year as text, an ISO date (the last day covered for
 * effective_to), the codes, modifiers or places in order, an enum, or the flags. `written` is the
 * text the document writes it as (null for method, lesser_of_schedule, flags and rounding, which a
 * proposal states as a value). `page` (from 1) and `quote` (a substring of the page's text as evidence
 * compares it) say where it is written; the lesser-of schedule is stated by the method's clause and
 * carries that clause's page and quote.
 */
export interface TruthFieldValue {
  readonly value: string | readonly string[] | TruthFlags;
  readonly written: string | readonly string[] | null;
  readonly page: number;
  readonly quote: string;
}

export interface TruthRecord {
  readonly label: string;
  readonly fields: Readonly<Partial<Record<TruthField, TruthFieldValue>>>;
}

export interface ContractTruth {
  readonly format: typeof CONTRACT_TRUTH_FORMAT;
  readonly synthetic: true;
  readonly id: string;
  readonly layout: ContractLayout;
  /** How the scanned case was laid out before it was scanned. */
  readonly drawnAs: 'table' | 'prose' | 'csv' | null;
  readonly kind: 'contract' | 'exhibit';
  readonly document: string;
  readonly contentType: 'application/pdf' | 'text/csv';
  /** The scan reader's recorded answer for a scanned document (tp-textract-recording/1), or null. */
  readonly scan: string | null;
  readonly pages: number;
  readonly records: readonly TruthRecord[];
}

export interface ContractSetCase {
  readonly id: string;
  readonly dir: string;
  readonly layout: ContractLayout;
  readonly kind: 'contract' | 'exhibit';
  readonly records: number;
  readonly fields: number;
}

export interface ContractSetManifest {
  readonly format: typeof CONTRACT_SET_FORMAT;
  readonly synthetic: true;
  readonly note: string;
  readonly cases: readonly ContractSetCase[];
}

// ---------------------------------------------------------------------------------------------------
// The narrative set

/** A figure a narrative of the case must state, as the packets verifier's scanner reads one. */
export interface RequiredFact {
  readonly kind: 'amount' | 'percent' | 'number' | 'marker';
  /** Cents as integer text, a plain decimal, or the marker's number. */
  readonly value: string;
  /** What the figure is, in the pattern statement's terms (PRD 12, The packet). */
  readonly what: 'shortfall' | 'expected' | 'observed' | 'lines' | 'contract_rate' | 'contract_percentage' | 'citation' | 'line_schedule';
}

/** A schedule line as the assembly reads it (AssemblyLine in @tp/packets, cents as text). */
export interface NarrativeLine {
  readonly serviceLineId: string;
  readonly claimId: string;
  readonly pricedLineId: string;
  readonly pricingRunId: string;
  readonly patientKey: string;
  readonly serviceDate: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: string;
  readonly expectedCents: string;
  readonly observedCents: string;
  readonly varianceCents: string;
  readonly paidCents: string;
  readonly paidOn: string;
  readonly receivedOn: string | null;
  readonly windowEndsOn: string | null;
}

export interface NarrativePromptPay {
  readonly state: string;
  readonly release_no: number;
  readonly sha256: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly days_to_pay: number;
  readonly day_basis: string;
  readonly annual_rate_percent: string | null;
  readonly exclusions: readonly string[];
  readonly statute: string;
}

/** The approved records a packet version is assembled from (AssemblyInput in @tp/packets), as JSON. */
export interface NarrativeAssembly {
  readonly asOf: string;
  readonly disputeLevel: number;
  readonly practice: { readonly practice_id: string; readonly name: string; readonly npi: null; readonly tax_id_last4: null };
  readonly payer: { readonly payer_id: string; readonly name: string; readonly payer_id_raw: string; readonly plan_id: string; readonly plan_key: string; readonly plan_name: string | null };
  readonly citation: Readonly<Record<string, unknown>>;
  readonly releases: readonly { readonly release_no: number; readonly manifest_sha256: string }[];
  readonly behavior: string;
  readonly lines: readonly NarrativeLine[];
  readonly interest: { readonly state: string; readonly releaseNo: number; readonly record: NarrativePromptPay | null } | null;
  readonly contractDocuments: readonly { readonly documentId: string; readonly sha256: string | null }[];
  readonly remittances: readonly { readonly documentId: string; readonly sha256: string | null; readonly paidOn: string }[];
  readonly attachedDocuments: readonly { readonly documentId: string; readonly sha256: string | null }[];
}

export interface NarrativeCase {
  readonly id: string;
  readonly method: 'FIXED_SCHEDULE' | 'PERCENT_OF_MEDICARE' | 'LESSER_OF' | 'PER_VISIT' | 'MA_NONCONTRACTED';
  readonly assembly: NarrativeAssembly;
  /** The case's invented identifiers (patient names, member IDs, claim numbers): never in the inputs; a narrative holding one fails. */
  readonly identifiers: readonly string[];
  readonly required: readonly RequiredFact[];
  /** A narrative this package wrote from its own sums: what the local deterministic provider answers for the case. */
  readonly reference: { readonly paragraphs: readonly string[] };
}

export interface NarrativeSetPart {
  readonly format: typeof NARRATIVE_SET_FORMAT;
  readonly synthetic: true;
  readonly note: string;
  readonly part: number;
  readonly cases: readonly NarrativeCase[];
}
