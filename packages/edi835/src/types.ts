/**
 * The typed loops of a parsed 835 (005010X221A1) and the events and report the parser produces.
 * Amounts are integer cents (`Cents`, as the segment carries them: a reversal's are negative, a
 * PLB amount is positive when it reduces the payment; docs/adr/0021); dates are ISO; quantities and
 * units are decimal text exactly as written. Segment indexes count every segment of the file from 1.
 */
import { type Cents } from '@tp/money';

import { type EdiError, type EdiErrorCode } from './errors';
import { type Delimiters } from './tokenizer';
import { type UnknownCode } from './values';

/** Where a transaction set sits in the document, each from 0. */
export interface TransactionPosition {
  readonly interchange: number;
  readonly group: number;
  readonly transaction: number;
}

/** A claim inside the document: its transaction's position and its index in the transaction. */
export interface ClaimPosition extends TransactionPosition {
  readonly claim: number;
}

export interface Reference {
  readonly segmentIndex: number;
  readonly qualifier: string;
  readonly value: string;
}

export interface DateValue {
  readonly segmentIndex: number;
  readonly qualifier: string;
  /** DTM02 as an ISO date, or null when DTM05 and DTM06 carry the date instead. */
  readonly date: string | null;
  /** DTM05 (D8 or RD8) and DTM06 as written, when sent. */
  readonly periodFormat: string | null;
  readonly period: string | null;
  /** The dates the element means: DTM02, or the D8 date, or the RD8 range. */
  readonly from: string;
  readonly to: string;
}

export interface AmountValue {
  readonly segmentIndex: number;
  readonly qualifier: string;
  readonly cents: Cents;
}

export interface QuantityValue {
  readonly segmentIndex: number;
  readonly qualifier: string;
  /** Exactly as written. */
  readonly quantity: string;
}

/** One CAS adjustment (a group with one reason, amount and quantity). */
export interface Adjustment {
  readonly segmentIndex: number;
  /** The element of the reason code (2, 5, 8, 11, 14 or 17). */
  readonly elementPosition: number;
  /** 1-based order within its claim (claim level) or line. */
  readonly position: number;
  readonly group: string;
  readonly reason: string;
  readonly cents: Cents;
  readonly quantity: string | null;
}

export interface Remark {
  readonly segmentIndex: number;
  readonly elementPosition: number;
  /** HE (RARC) or RX for LQ; RARC for MIA and MOA. */
  readonly qualifier: string;
  readonly code: string;
}

export interface Contact {
  readonly segmentIndex: number;
  /** PER01: BL, CX or IC. */
  readonly function: string;
  readonly name: string | null;
  readonly communications: readonly { readonly qualifier: string; readonly number: string }[];
}

export interface Address {
  readonly lines: readonly string[];
  readonly city: string | null;
  readonly state: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly countrySubdivision: string | null;
}

/** The payer (1000A, N1 PR) or the payee (1000B, N1 PE). */
export interface Party {
  readonly segmentIndex: number;
  readonly entity: 'PR' | 'PE';
  readonly name: string;
  readonly idQualifier: string | null;
  readonly id: string | null;
  readonly address: Address | null;
  readonly references: readonly Reference[];
  /** PER (payer only). */
  readonly contacts: readonly Contact[];
  /** RDM (payee only). */
  readonly deliveryMethod: { readonly code: string; readonly name: string | null; readonly communication: string | null } | null;
}

/** BPR. */
export interface Payment {
  readonly segmentIndex: number;
  readonly handling: string;
  /** BPR02 as written (never negative). */
  readonly amountCents: Cents;
  /** C credit, D debit. */
  readonly creditDebit: string;
  readonly method: string;
  readonly format: string | null;
  readonly senderDfi: { readonly qualifier: string | null; readonly id: string | null; readonly accountQualifier: string | null; readonly account: string | null };
  readonly originatingCompanyId: string | null;
  readonly originatingCompanySupplementalCode: string | null;
  readonly receiverDfi: { readonly qualifier: string | null; readonly id: string | null; readonly accountQualifier: string | null; readonly account: string | null };
  /** BPR16. */
  readonly date: string;
  /** The payment the transaction balances against: BPR02, negative when BPR03 is D. */
  readonly paymentCents: Cents;
}

/** TRN. */
export interface Trace {
  readonly segmentIndex: number;
  readonly type: string;
  /** TRN02: the check or EFT trace number. */
  readonly number: string;
  /** TRN03: the payer's originating company identifier. */
  readonly originatorId: string;
  readonly supplemental: string | null;
}

/** NM1 in a claim. */
export interface Name {
  readonly segmentIndex: number;
  /** NM101: QC patient, IL insured, 74 corrected, 82 rendering provider, TT crossover carrier, PR corrected priority payer, GB other subscriber. */
  readonly entity: string;
  readonly entityType: string;
  readonly lastOrOrganization: string | null;
  readonly first: string | null;
  readonly middle: string | null;
  readonly suffix: string | null;
  readonly idQualifier: string | null;
  readonly id: string | null;
}

/** An element of a segment kept by position (MIA, TS3, TS2). */
export interface PositionedAmount {
  readonly elementPosition: number;
  readonly cents: Cents;
}
export interface PositionedQuantity {
  readonly elementPosition: number;
  readonly quantity: string;
}

/** MIA (inpatient adjudication). */
export interface InpatientAdjudication {
  readonly segmentIndex: number;
  readonly amounts: readonly PositionedAmount[];
  readonly quantities: readonly PositionedQuantity[];
  readonly remarks: readonly Remark[];
}

/** MOA (outpatient adjudication). */
export interface OutpatientAdjudication {
  readonly segmentIndex: number;
  readonly reimbursementRate: string | null;
  readonly hcpcsPayableCents: Cents | null;
  readonly remarks: readonly Remark[];
  readonly esrdPaymentCents: Cents | null;
  readonly nonpayableProfessionalComponentCents: Cents | null;
}

/** TS3 and TS2 of a 2000 loop. */
export interface ProviderSummary {
  readonly segmentIndex: number;
  readonly segmentId: 'TS3' | 'TS2';
  readonly providerId: string | null;
  readonly facilityCode: string | null;
  readonly fiscalPeriodDate: string | null;
  readonly amounts: readonly PositionedAmount[];
  readonly quantities: readonly PositionedQuantity[];
}

/** The 2000 loop: LX and its provider summaries. Its claims carry `headerNumber`. */
export interface HeaderNumber {
  readonly segmentIndex: number;
  readonly number: string;
  readonly summaries: readonly ProviderSummary[];
}

export interface Procedure {
  readonly qualifier: string;
  readonly code: string;
  /** Modifiers in their four positions; an empty position is ''. Trailing empty positions are dropped. */
  readonly modifiers: readonly string[];
  readonly description: string | null;
}

export type ObservedAllowedBasis = 'amt_b6' | 'paid_plus_pr';

/**
 * Observed allowed (PRD sections 2 and 10): AMT B6 when sent; otherwise SVC03 plus the line's PR
 * adjustments, or plus the claim's PR adjustments allocated to the line when no line carries PR
 * (docs/adr/0021), with `allocatedFromClaim` set and the allocated share beside it.
 */
export interface ObservedAllowed {
  readonly cents: Cents;
  readonly basis: ObservedAllowedBasis;
  readonly allocatedFromClaim: boolean;
  readonly allocatedPatientShareCents: Cents | null;
}

/** The 2110 loop. */
export interface ServiceLine {
  /** From 1 within the claim. */
  readonly lineNo: number;
  readonly segmentIndex: number;
  readonly procedure: Procedure;
  readonly chargeCents: Cents;
  readonly paidCents: Cents;
  readonly revenueCode: string | null;
  readonly units: string | null;
  readonly originalProcedure: Procedure | null;
  readonly originalUnits: string | null;
  readonly dates: readonly DateValue[];
  readonly adjustments: readonly Adjustment[];
  readonly references: readonly Reference[];
  readonly amounts: readonly AmountValue[];
  readonly quantities: readonly QuantityValue[];
  readonly remarks: readonly Remark[];
  /** From the line's dates, else the claim's statement dates. */
  readonly serviceFrom: string | null;
  readonly serviceTo: string | null;
  /** AMT B6. */
  readonly lineAllowedCents: Cents | null;
  /** The line's PR adjustments. */
  readonly patientShareCents: Cents;
  readonly observedAllowed: ObservedAllowed;
  /** SVC02 - the line's CAS - SVC03, or null when the balance rules do not check the line. */
  readonly differenceCents: Cents | null;
}

export interface ReversalLink {
  /** The payer claim control number of the claim reversed (CLP07 of the reversal). */
  readonly payerClaimControlNumber: string;
  /** The reversed claim, when it is earlier in the same document; otherwise the loader finds it. */
  readonly reversed: ClaimPosition | null;
}

export interface CorrectionLink {
  /** The payer claim control number of the claim the correction replaces (REF F8, or the reversal's CLP07). */
  readonly payerClaimControlNumber: string;
  /** The reversal it follows, when it is in the same document. */
  readonly reversal: ClaimPosition | null;
}

/** The 2100 loop. */
export interface Claim {
  /** From 0 within the transaction. */
  readonly index: number;
  readonly segmentIndex: number;
  /** LX01 of the 2000 loop holding the claim. */
  readonly headerNumber: string;
  readonly patientControlNumber: string;
  /** CLP02: 1 primary, 2 secondary, 3 tertiary, 4 denied, 22 reversal, and others. */
  readonly status: string;
  readonly chargeCents: Cents;
  readonly paidCents: Cents;
  readonly patientResponsibilityCents: Cents | null;
  readonly filingIndicator: string;
  readonly payerClaimControlNumber: string;
  readonly facilityCode: string | null;
  readonly frequencyCode: string | null;
  readonly drgCode: string | null;
  readonly drgWeight: string | null;
  readonly dischargeFraction: string | null;
  readonly adjustments: readonly Adjustment[];
  readonly names: readonly Name[];
  readonly inpatient: InpatientAdjudication | null;
  readonly outpatient: OutpatientAdjudication | null;
  readonly references: readonly Reference[];
  readonly dates: readonly DateValue[];
  readonly contacts: readonly Contact[];
  readonly amounts: readonly AmountValue[];
  readonly quantities: readonly QuantityValue[];
  readonly lines: readonly ServiceLine[];
  /** DTM 232 and 233. */
  readonly statementFrom: string | null;
  readonly statementTo: string | null;
  /** The statement dates, else the earliest and latest line dates. */
  readonly serviceFrom: string | null;
  readonly serviceTo: string | null;
  /** REF CE: the plan the synthetic fixtures name (class of contract code). */
  readonly planRef: string | null;
  /** AMT AU. */
  readonly allowedCents: Cents | null;
  /** Claim-level and line-level PR adjustments. */
  readonly patientShareCents: Cents;
  readonly balance: {
    /** CLP03 - every CAS in the claim - CLP04. */
    readonly claimDifferenceCents: Cents;
    /** The SVC02 charges - CLP03, or null without lines. */
    readonly lineChargeDifferenceCents: Cents | null;
    readonly balanced: boolean;
  };
  /** Set on a reversal (CLP02 22). */
  readonly reversal: ReversalLink | null;
  /** Set on a corrected claim that follows a reversal or names the original in REF F8. */
  readonly correction: CorrectionLink | null;
}

export type PlbCategory = 'recoupment' | 'forward_balance' | 'interest' | 'authorized_return' | 'other';

/** One provider adjustment of a PLB segment (each PLB carries up to six). */
export interface ProviderAdjustment {
  readonly segmentIndex: number;
  /** The element of the adjustment reason (3, 5, 7, 9, 11 or 13). */
  readonly elementPosition: number;
  readonly providerId: string;
  readonly fiscalPeriodDate: string;
  readonly code: string;
  readonly reference: string | null;
  /** As the segment carries it: positive reduces the payment, negative increases it. */
  readonly cents: Cents;
  readonly category: PlbCategory;
  /** False for a forward balance: recorded, not counted until it resolves (PRD section 13). */
  readonly counted: boolean;
}

/** The unit of idempotency with the file hash (PRD section 10, step 8); the loader adds the practice. */
export interface RemittanceKey {
  /** ISA06, without its padding. */
  readonly senderId: string;
  /** N104 of the payee. */
  readonly payeeId: string;
  readonly isa13: string;
  readonly trn02: string;
  /** BPR02 as written. */
  readonly bpr02Cents: Cents;
}

export interface TransactionBalance {
  readonly claimsPaidCents: Cents;
  readonly plbTotalCents: Cents;
  readonly paymentCents: Cents;
  /** Claims paid - PLB amounts - payment (docs/adr/0021). */
  readonly differenceCents: Cents;
  readonly balanced: boolean;
  readonly claimsBalanced: boolean;
}

export interface TransactionCounts {
  readonly claims: number;
  readonly lines: number;
  /** Claims with CLP02 22. */
  readonly reversals: number;
  readonly plbItems: number;
}

/** One transaction set (ST..SE): one payment. */
export interface Remittance {
  readonly position: TransactionPosition;
  /** The ST segment. */
  readonly segmentIndex: number;
  readonly controlNumber: string;
  readonly interchangeControlNumber: string;
  readonly groupControlNumber: string;
  readonly senderId: string;
  readonly receiverId: string;
  /** Null only in a held transaction missing the segment. */
  readonly payment: Payment | null;
  readonly trace: Trace | null;
  readonly currency: string | null;
  readonly references: readonly Reference[];
  /** DTM 405. */
  readonly productionDate: string | null;
  readonly dates: readonly DateValue[];
  readonly payer: Party | null;
  readonly payee: Party | null;
  readonly headerNumbers: readonly HeaderNumber[];
  readonly claims: readonly Claim[];
  readonly providerAdjustments: readonly ProviderAdjustment[];
  /** SE01 and SE02 as written, and the SE segment. */
  readonly trailer: { readonly segmentIndex: number; readonly segmentCount: string; readonly controlNumber: string };
  /** Segments from ST to SE, both included, as counted. */
  readonly segmentCount: number;
  readonly counts: TransactionCounts;
  readonly balance: TransactionBalance;
  /** Payer identifiers for the mapping queue: N103/N104, payer REFs, and ['TRN03', originator]. */
  readonly payerIdentifiers: readonly (readonly [string, string])[];
  /** Null only in a held transaction missing what the key is made of. */
  readonly dedupKey: RemittanceKey | null;
  /** True when nothing in the transaction set holds it. The report has the final word (envelope errors). */
  readonly loadable: boolean;
  readonly heldReasons: readonly EdiError[];
  readonly unknownCodes: readonly UnknownCode[];
}

/** A loadable transaction: every part the loader reads is present. */
export type LoadableRemittance = Remittance & {
  readonly loadable: true;
  readonly payment: Payment;
  readonly trace: Trace;
  readonly payer: Party;
  readonly payee: Party;
  readonly dedupKey: RemittanceKey;
};

export function isLoadable(remittance: Remittance): remittance is LoadableRemittance {
  return remittance.loadable;
}

export interface InterchangeHeader {
  /** From 0. */
  readonly interchange: number;
  readonly segmentIndex: number;
  readonly delimiters: Delimiters;
  readonly senderQualifier: string;
  /** ISA06 and ISA08 without their padding. */
  readonly senderId: string;
  readonly receiverQualifier: string;
  readonly receiverId: string;
  /** ISA09 as an ISO date, and ISA10. */
  readonly date: string | null;
  readonly time: string;
  readonly version: string;
  readonly controlNumber: string;
  readonly acknowledgmentRequested: string;
  /** ISA15: P production, T test. */
  readonly usage: string;
  /** The raw ISA09 (YYMMDD). */
  readonly isa09: string;
}

export interface GroupHeader {
  readonly interchange: number;
  /** From 0 within the interchange. */
  readonly group: number;
  readonly segmentIndex: number;
  readonly functionalId: string;
  readonly senderCode: string;
  readonly receiverCode: string;
  readonly date: string | null;
  readonly time: string;
  readonly controlNumber: string;
  readonly agency: string;
  readonly version: string;
}

export interface GroupTrailer {
  readonly interchange: number;
  readonly group: number;
  readonly segmentIndex: number;
  readonly transactionCount: string;
  readonly controlNumber: string;
  /** EDI_CONTROL_MISMATCH errors; each holds every transaction of the group. */
  readonly errors: readonly EdiError[];
}

export interface InterchangeTrailer {
  readonly interchange: number;
  readonly segmentIndex: number;
  readonly groupCount: string;
  readonly controlNumber: string;
  /** EDI_CONTROL_MISMATCH errors; each holds every transaction of the interchange. */
  readonly errors: readonly EdiError[];
}

/**
 * What the parser emits, in document order. A transaction event comes when its SE is read, so memory
 * is bounded by one transaction set; an error at GE, IEA or later can still hold it, so the loader
 * commits only after the report.
 */
export type Edi835Event =
  | { readonly type: 'interchange'; readonly interchange: InterchangeHeader }
  | { readonly type: 'group'; readonly group: GroupHeader }
  | { readonly type: 'transaction'; readonly transaction: Remittance }
  | { readonly type: 'group_end'; readonly group: GroupTrailer }
  | { readonly type: 'interchange_end'; readonly interchange: InterchangeTrailer }
  | { readonly type: 'document_error'; readonly error: EdiError };

/** The final status of one transaction set. */
export interface TransactionOutcome {
  readonly position: TransactionPosition;
  readonly segmentIndex: number;
  readonly st02: string;
  readonly isa13: string;
  readonly gs06: string;
  readonly loadable: boolean;
  /** Its own hold reasons, then those of its group, interchange and document. */
  readonly heldReasons: readonly EdiError[];
  readonly dedupKey: RemittanceKey | null;
  readonly bpr16Date: string | null;
  readonly counts: TransactionCounts;
  readonly plbTotalCents: Cents;
  readonly unknownCodes: readonly UnknownCode[];
}

/** The receipt per document (PRD section 10, step 10). */
export interface Receipt {
  readonly transactions: number;
  readonly claims: number;
  readonly lines: number;
  readonly reversals: number;
  readonly plbTotalCents: Cents;
  readonly held: readonly { readonly st02: string; readonly reasons: readonly EdiErrorCode[] }[];
  /** "carc:Z999", sorted and unique. */
  readonly unknownCodes: readonly string[];
  /** What loads: transactions, claims and lines outside held transactions. */
  readonly loaded: { readonly transactions: number; readonly claims: number; readonly lines: number };
}

export interface ParseReport {
  /** SHA-256 of every byte of the document: the first deduplication key. */
  readonly documentSha256: string;
  readonly bytes: number;
  /** The document began with a UTF-8 byte-order mark. */
  readonly bom: boolean;
  readonly segments: number;
  /** loaded: every transaction loads; held: none does (or the document failed); partially_held: some do. */
  readonly outcome: 'loaded' | 'held' | 'partially_held';
  /** Errors that stop the whole document: EDI_NOT_835, EDI_SYNTAX in an envelope or a truncation. */
  readonly documentErrors: readonly EdiError[];
  /** EDI_CONTROL_MISMATCH at GE or IEA. */
  readonly envelopeErrors: readonly EdiError[];
  readonly transactions: readonly TransactionOutcome[];
  readonly receipt: Receipt;
  /** The rule release whose code lists checked the codes. */
  readonly codeListRelease: number | null;
  /** The most segments held in memory at once (one transaction set) and the most characters buffered. */
  readonly memory: { readonly peakTransactionSegments: number; readonly peakBufferedCharacters: number };
}
