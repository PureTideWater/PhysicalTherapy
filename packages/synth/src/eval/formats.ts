/**
 * The model gateway's synthetic evaluation sets as files (PRD 14, Logging and evaluation; test matrix
 * MOD-01, MOD-03 and MOD-09; docs/adr/0051 and 0070). packages/synth writes them under
 * fixtures/synthetic; the evaluation harness (packages/model-gateway/eval) reads them. Every value is
 * invented and every file says SYNTHETIC.
 *
 * The contract set v1 (MOD-01): 40 contracts and exhibits in three layouts. Each case is a directory with
 * the document as intake receives it (a text PDF, a CSV, or a scanned PDF with no text layer and the
 * scan reader's recorded answer beside it) and truth.json: the rate records the document states, every
 * field with its value as code reads it, the text it is written as, the page and the quote. MOD-01's
 * own manifest stays tp-eval-contract-set/1 and lists those 40; their truths are written in format /2.
 *
 * The contract set v2 (MOD-09; docs/adr/0070 Part 1): v1's 40 cases with their bytes unchanged, 18
 * committed cases (V01-V18: medium documents, contract-plus-exhibit pairs, scans with seeded reading
 * errors or their own text layer, struck-through rates, injected-instruction twins, decoy amended
 * rates) and 5 large ones (L01-L05, to 60 codes and 80 pages) generated when a test needs them into an
 * ignored directory and held to the hashes MOD-09's expected.json records. Its manifest
 * (tp-eval-contract-set/2) names every case's directory relative to fixtures/synthetic, its tier, and
 * whether its page text as read is faithful to the document as a person sees it.
 *
 * The narrative set (MOD-03): 300 pattern statements' inputs, each the approved records a packet is
 * assembled from (no identifier at all: the schedule's identifiers are placeholders), the case's
 * invented identifiers the verifier checks a narrative against, the facts any narrative of it must
 * state, and a reference narrative written by this package from its own arithmetic.
 */

/** The set v2 manifest (MOD-09). */
export const CONTRACT_SET_FORMAT = 'tp-eval-contract-set/2';
/** MOD-01's own manifest, which keeps listing v1's 40 cases. */
export const CONTRACT_SET_V1_FORMAT = 'tp-eval-contract-set/1';
export const CONTRACT_TRUTH_FORMAT = 'tp-eval-contract/2';
export const NARRATIVE_SET_FORMAT = 'tp-eval-narratives/1';

export const CONTRACT_LAYOUTS = ['table', 'prose', 'scanned'] as const;
export type ContractLayout = (typeof CONTRACT_LAYOUTS)[number];

/** A case's size: v1's 1-4 page documents and the small new cases; 3-12 pages and 20-40 codes; 40-80 pages and 60 codes. */
export const CONTRACT_TIERS = ['small', 'medium', 'large'] as const;
export type ContractTier = (typeof CONTRACT_TIERS)[number];

/**
 * Whether the page text as read (pdf.js's text layer, or the scan reader's answer where a page has
 * none) says what a person sees on the page. Unfaithful text is the reader's or the document's doing,
 * never the model's: the gate holds a model to zero wrong-but-verified fields on faithful cases and, on
 * the others, to no more than a faithful copier of the text as read (docs/adr/0070).
 */
export const PAGE_TEXT_FIDELITIES = ['faithful', 'unfaithful'] as const;
export type PageTextFidelity = (typeof PAGE_TEXT_FIDELITIES)[number];

/**
 * Why a case's page text is unfaithful: the scan reader misread characters (ocr_errors); the PDF's own
 * text layer over its page images was misread when it was made (ocr_layer_errors); a struck-through
 * rate is read as ordinary text (struck_text); invisible or white text is read as ordinary text
 * (hidden_text).
 */
export const UNFAITHFUL_BECAUSE = ['ocr_errors', 'ocr_layer_errors', 'struck_text', 'hidden_text'] as const;
export type UnfaithfulBecause = (typeof UNFAITHFUL_BECAUSE)[number];

/**
 * What a true record is: a rate the document states (term), a rate an amendment states for a later
 * window over the same scope (amendment), or a rate a decoy paragraph states over a row's scope without
 * saying which governs (decoy). Amendments and decoys are records the document states, so the reference
 * proposes them; each is paired with the record it overlaps in the case's `conflicts`.
 */
export const TRUTH_ROLES = ['term', 'amendment', 'decoy'] as const;
export type TruthRole = (typeof TRUTH_ROLES)[number];

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
 * A field as a faithful copier of the page text as read would write it, on an unfaithful case where
 * that text differs inside the field's quote: `quote` is the same passage as read (on the page as
 * read), and `written` the same field copied from it (the misread figure, say "$4310" for "$43.10").
 */
export interface TruthFieldAsRead {
  readonly written: string | readonly string[] | null;
  readonly quote: string;
}

/**
 * One field of a true rate record. `value` is what code reads the field as: cents as integer text
 * (amount), a plain decimal (percentage), the year as text, an ISO date (the last day covered for
 * effective_to), the codes, modifiers or places in order, an enum, or the flags. `written` is the
 * text the document writes it as (null for method, lesser_of_schedule, flags and rounding, which a
 * proposal states as a value). `page` (from 1) and `quote` (a substring of the page's text as a person
 * sees it, which is the text as evidence compares it on a faithful case) say where it is written; the
 * lesser-of schedule is stated by the method's clause and carries that clause's page and quote.
 * `asRead` is present only on an unfaithful case, and only where the text as read differs inside the
 * quote.
 */
export interface TruthFieldValue {
  readonly value: string | readonly string[] | TruthFlags;
  readonly written: string | readonly string[] | null;
  readonly page: number;
  readonly quote: string;
  readonly asRead?: TruthFieldAsRead;
}

export interface TruthRecord {
  readonly label: string;
  readonly fields: Readonly<Partial<Record<TruthField, TruthFieldValue>>>;
}

/** A true record of a /2 truth: the record and what it is. */
export interface ContractTruthRecord extends TruthRecord {
  readonly role: TruthRole;
}

export interface ContractTruth {
  readonly format: typeof CONTRACT_TRUTH_FORMAT;
  readonly synthetic: true;
  /** C01-C40 (v1), V01-V18 (committed), L01-L05 (generated). */
  readonly id: string;
  readonly layout: ContractLayout;
  /** How the scanned case was laid out before it was scanned. */
  readonly drawnAs: 'table' | 'prose' | 'csv' | null;
  readonly kind: 'contract' | 'exhibit';
  readonly document: string;
  readonly contentType: 'application/pdf' | 'text/csv';
  /** The scan reader's recorded answer for a scanned document whose pages carry no text (tp-textract-recording/1), or null. */
  readonly scan: string | null;
  readonly pages: number;
  readonly tier: ContractTier;
  readonly pageText: PageTextFidelity;
  /** Null exactly when the page text is faithful. */
  readonly unfaithfulBecause: UnfaithfulBecause | null;
  /** The other document of a contract-plus-exhibit pair (each is scored against its own truth only), or null. */
  readonly pairOf: string | null;
  /** On an injected twin, its clean twin's ID; null otherwise. */
  readonly twinOf: string | null;
  /** Pairs of record indices that overlap in scope: both must be proposed and each flagged against the other. */
  readonly conflicts: readonly (readonly [number, number])[];
  readonly records: readonly ContractTruthRecord[];
}

/** A case of the v1 manifest (MOD-01's set.json): its directory relative to that file. */
export interface ContractSetV1Case {
  readonly id: string;
  readonly dir: string;
  readonly layout: ContractLayout;
  readonly kind: 'contract' | 'exhibit';
  readonly records: number;
  readonly fields: number;
}

export interface ContractSetV1Manifest {
  readonly format: typeof CONTRACT_SET_V1_FORMAT;
  readonly synthetic: true;
  readonly note: string;
  readonly cases: readonly ContractSetV1Case[];
}

/** A case of the v2 manifest: its directory relative to fixtures/synthetic, and whether it is generated (and ignored by git) rather than committed. */
export interface ContractSetCase {
  readonly id: string;
  readonly path: string;
  readonly tier: ContractTier;
  readonly layout: ContractLayout;
  readonly kind: 'contract' | 'exhibit';
  readonly pageText: PageTextFidelity;
  readonly records: number;
  readonly fields: number;
  readonly generated: boolean;
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
