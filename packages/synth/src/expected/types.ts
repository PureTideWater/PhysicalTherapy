/**
 * The shape of fixtures/synthetic/<case>/expected.json: what the parser, the loader and the later
 * milestones must produce for a case's files. Amounts are integer cents as strings ("12345"), dates
 * ISO ("2026-03-05"), segment indexes count every segment of the file from 1 (ISA is 1), element
 * positions count from 1.
 */
import { type OracleSummary } from '../x12/summary';

export const CASE_MODULES = ['PAR', 'MAP', 'CON', 'PRC', 'CAS', 'LED', 'SEC', 'SCR', 'JOB', 'MOD', 'CI', 'DBF'] as const;
export type CaseModule = (typeof CASE_MODULES)[number];

/** The typed parser errors of PRD section 10 (packages/edi835 EDI_ERROR_CODES). */
export type EdiErrorCode = 'EDI_SYNTAX' | 'EDI_CONTROL_MISMATCH' | 'EDI_UNBALANCED' | 'EDI_UNKNOWN_CODE' | 'EDI_DUPLICATE' | 'EDI_NOT_835';

/** An error or hold reason with its position. Never a patient field. */
export interface EdiErrorExpectation {
  readonly code: EdiErrorCode;
  readonly segmentIndex: number;
  readonly segmentId: string;
  readonly elementPosition: number;
  /** The component of a composite element, from 1, when the error is about one component. */
  readonly componentPosition?: number;
  /** For EDI_SYNTAX: what was wrong (packages/edi835 SYNTAX_REASONS: truncated, invalid_code, ...). */
  readonly reason?: string;
  /** For EDI_UNBALANCED: what failed to balance. */
  readonly scope?: 'transaction' | 'claim' | 'claim_lines' | 'line';
  /** For EDI_UNBALANCED: the exact difference (see the balance rules in docs/adr/0021). */
  readonly differenceCents?: string;
  /** For EDI_CONTROL_MISMATCH: the value the count or control number should have, and the value found. */
  readonly expected?: string;
  readonly found?: string;
}

export type CodeList = 'carc' | 'rarc';

/** A code not in the release's code list: loaded with a flag, never dropped (PRD section 10). */
export interface UnknownCodeExpectation {
  readonly list: CodeList;
  readonly code: string;
  readonly segmentIndex: number;
  readonly segmentId: string;
  readonly elementPosition: number;
}

export interface AdjustmentExpectation {
  readonly group: string;
  readonly reason: string;
  readonly amountCents: string;
  readonly quantity: string | null;
  /** 1-based order of the adjustment within its claim (claim level) or its line. */
  readonly position: number;
  readonly segmentIndex: number;
}

export type ObservedAllowedBasis = 'amt_b6' | 'paid_plus_pr';

export interface ObservedAllowedExpectation {
  readonly cents: string;
  /** amt_b6: AMT B6; paid_plus_pr: SVC03 plus the line's PR adjustments (or the claim's, allocated). */
  readonly basis: ObservedAllowedBasis;
  /** The claim's PR adjustments were allocated to the line because no line carried any (test matrix PAR-10). */
  readonly allocatedFromClaim: boolean;
}

export interface LineExpectation {
  readonly lineNo: number;
  readonly segmentIndex: number;
  readonly procedureQualifier: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly revenueCode: string | null;
  readonly chargeCents: string;
  readonly paidCents: string;
  /** SVC05 exactly as sent (decimal text), or null. */
  readonly units: string | null;
  readonly originalUnits: string | null;
  readonly serviceFrom: string | null;
  readonly serviceTo: string | null;
  /** AMT B6, when sent. */
  readonly lineAllowedCents: string | null;
  readonly observedAllowed: ObservedAllowedExpectation;
  readonly patientShareCents: string;
  readonly adjustments: readonly AdjustmentExpectation[];
}

/** Points at a claim: the file (relative to the case directory), transaction and claim, each from 0. */
export interface ClaimRef {
  readonly file: string;
  readonly transaction: number;
  readonly claim: number;
}

export interface ClaimExpectation {
  readonly index: number;
  readonly segmentIndex: number;
  readonly patientControlNumber: string;
  readonly payerClaimControlNumber: string;
  readonly status: string;
  readonly chargeCents: string;
  readonly paidCents: string;
  readonly patientResponsibilityCents: string | null;
  readonly filingIndicator: string;
  readonly facilityCode: string | null;
  readonly frequencyCode: string | null;
  /** The plan the synthetic fixtures name in REF CE (class of contract), when sent. */
  readonly planRef: string | null;
  readonly serviceFrom: string | null;
  readonly serviceTo: string | null;
  /** AMT AU. */
  readonly allowedCents: string | null;
  readonly adjustments: readonly AdjustmentExpectation[];
  readonly lines: readonly LineExpectation[];
  /** Set by cases with reversals: the claim this one reverses, and the claim a correction supersedes. */
  readonly reversalOf?: ClaimRef;
  readonly supersedes?: ClaimRef;
}

export type PlbCategory = 'recoupment' | 'forward_balance' | 'interest' | 'authorized_return' | 'other';

export interface PlbExpectation {
  readonly segmentIndex: number;
  readonly providerId: string;
  readonly fiscalPeriodDate: string;
  readonly code: string;
  readonly reference: string | null;
  /** As the segment carries it: positive reduces the payment, negative increases it (docs/adr/0021). */
  readonly amountCents: string;
  readonly category: PlbCategory;
  /** False for a forward balance: recorded but not counted until it resolves (PRD section 13). */
  readonly counted: boolean;
}

export interface TransactionExpectation {
  readonly interchange: number;
  readonly group: number;
  readonly transaction: number;
  readonly isa13: string;
  readonly gs06: string;
  readonly st02: string;
  readonly status: 'loaded' | 'held';
  readonly heldReasons: readonly EdiErrorExpectation[];
  /** The remittance key (PRD section 10, step 8) with the sender. */
  readonly dedupKey: { readonly senderId: string; readonly payeeId: string; readonly isa13: string; readonly trn02: string; readonly bpr02Cents: string };
  readonly bprMethod: string;
  readonly bprHandling: string;
  readonly bpr16Date: string;
  readonly payerName: string;
  readonly payerIds: readonly (readonly [string, string])[];
  readonly balance: {
    readonly claimsPaidCents: string;
    readonly plbTotalCents: string;
    readonly paymentCents: string;
    readonly differenceCents: string;
    readonly balanced: boolean;
  };
  readonly counts: { readonly claims: number; readonly lines: number; readonly reversals: number; readonly plbItems: number };
  readonly claims: readonly ClaimExpectation[];
  readonly plb: readonly PlbExpectation[];
  readonly unknownCodes: readonly UnknownCodeExpectation[];
}

export interface ReceiptExpectation {
  readonly transactions: number;
  readonly claims: number;
  readonly lines: number;
  readonly reversals: number;
  readonly plbTotalCents: string;
  readonly held: readonly { readonly st02: string; readonly reasons: readonly EdiErrorCode[] }[];
  /** Unknown codes as "carc:Z999", sorted and unique. */
  readonly unknownCodes: readonly string[];
  /** What would load: transactions, claims and lines outside held transactions. */
  readonly loaded: { readonly transactions: number; readonly claims: number; readonly lines: number };
}

export interface ParseExpectation {
  /** loaded: every transaction loads; held: none does; partially_held: some do. */
  readonly outcome: 'loaded' | 'held' | 'partially_held';
  /** Errors that stop the whole document (EDI_NOT_835, EDI_SYNTAX). */
  readonly documentErrors: readonly EdiErrorExpectation[];
  readonly transactions: readonly TransactionExpectation[];
  readonly receipt: ReceiptExpectation;
  /** The pricing outcome a later milestone asserts, where the case names one. */
  readonly pricing?: readonly { readonly transaction: number; readonly claim: number; readonly line: number; readonly unpricedReason: string; readonly milestone: number }[];
  /** The parser reads this file although pyx12 rejects it (test matrix PAR-23's DTM 472 range). */
  readonly toleratedByParser?: string;
}

/** What tools/test-oracle expects pyx12 to report. */
export type OracleRejection = 'not_835' | 'map_not_found' | 'control_count' | 'missing_segment' | 'segment' | 'element' | 'decode' | 'other';

export interface OracleExpectation {
  /** pyx12 validates the file against the 835 5010 map with no error (external remark codes excluded; docs/adr/0022). */
  readonly valid: boolean;
  /** Categories pyx12's errors must include when the file is invalid. */
  readonly rejections: readonly OracleRejection[];
  /** The normalized summary pyx12's reading must equal, when the file can be read as an 835. */
  readonly summary: OracleSummary | null;
  /** The SHA-256 of the canonical JSON of the summary, used instead of `summary` for zip entries. */
  readonly summarySha256?: string;
}

export interface X12FileExpectation {
  readonly oracle: OracleExpectation;
  readonly parse: ParseExpectation;
}

export interface ZipEntryExpectation {
  readonly name: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly kind: 'x12' | 'executable';
  /** parsed: the entry loads; held: it is parsed and held; quarantined: never parsed. */
  readonly outcome: 'parsed' | 'held' | 'quarantined';
  /** What pyx12 must report for an X12 entry (its summary as `summarySha256` when `x12` is absent). */
  readonly oracle?: OracleExpectation;
  /** The full expectation, for the first entry and the bad one. */
  readonly x12?: X12FileExpectation;
}

export type FileKind = 'x12' | 'zip' | 'csv' | 'text' | 'pdf' | 'json';

export interface FileExpectation {
  /** Relative to the case directory. */
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly kind: FileKind;
  readonly description: string;
  readonly x12?: X12FileExpectation;
  readonly zip?: {
    readonly entries: readonly ZipEntryExpectation[];
    /** The batch receipt (test matrix PAR-27, PAR-28). */
    readonly batch: { readonly entries: number; readonly parsed: number; readonly held: number; readonly quarantined: number; readonly zipQuarantined: boolean };
  };
}

export interface UploadExpectation {
  readonly step: number;
  /** The fixture file uploaded (relative to the case directory). */
  readonly file: string;
  /** The filename the upload carries. */
  readonly filename: string;
  /** Uploaded at the same time as another step (test matrix PAR-30). */
  readonly concurrentWith?: number;
  readonly outcome: 'loaded' | 'duplicate_document' | 'duplicate_remittance' | 'loaded_for_review' | 'held';
  readonly remittancesLoaded: number;
  readonly claimsLoaded: number;
  /** The earlier step this upload is linked to (a duplicate document or remittance, a reused trace). */
  readonly linkedTo?: number;
  readonly receipt: { readonly duplicate: boolean; readonly review?: string };
}

/** A file generated at test time into an ignored path, never committed (test matrix PAR-29). */
export interface GeneratedFileExpectation {
  /** Relative to fixtures/synthetic. */
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly description: string;
  readonly oracle: OracleExpectation;
}

export interface CaseExpectation {
  readonly case: string;
  readonly module: CaseModule;
  /** The test-matrix row, word for word. */
  readonly title: string;
  readonly assertion: string;
  readonly synthetic: true;
  /** The milestone whose tests assert the whole expected outcome. */
  readonly completesIn: number;
  /** Existing tests that already assert the case (paths from the repository root). */
  readonly assertedBy: readonly string[];
  /** Code checks are relative to this SYNTHETIC release's code lists. */
  readonly codeListRelease: number | null;
  /** Why the case has no file of its own, when it has none. */
  readonly noFileReason: string | null;
  readonly files: readonly FileExpectation[];
  /** Files generated at test time rather than committed. */
  readonly generated: readonly GeneratedFileExpectation[];
  readonly uploads: readonly UploadExpectation[];
  /** Scenario inputs that are not files (a mapping's effective date, a contract's terms, a triage date). */
  readonly scenario: Readonly<Record<string, unknown>> | null;
  /** Outcomes a later milestone asserts that can already be stated (ledger amounts, unpriced reasons). */
  readonly outcome: Readonly<Record<string, unknown>> | null;
  readonly notes: readonly string[];
}
