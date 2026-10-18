/**
 * The typed 835 (005010X221A1) model the writer serializes: one `Remittance835` per transaction set
 * (ST..SE), wrapped by `Interchange835` and `FunctionalGroup835` envelopes. Segment order, qualifiers
 * and element shapes follow the transaction's published structure as pyx12's open-source map reads it;
 * no implementation-guide text is copied here. Every value is invented (PRD section 16).
 */
import { type Cents } from '@tp/money';

import { type CalendarDate } from '../core/dates';
import { type Delimiters } from './segments';

export const TRANSACTION_VERSION = '005010X221A1';

/** CLP02 values. 22 reverses a prior payment. */
export type ClaimStatusCode = '1' | '2' | '3' | '4' | '19' | '20' | '21' | '22' | '23' | '25';

/** CAS01: contractual, other, payer-initiated, patient responsibility. */
export type AdjustmentGroup = 'CO' | 'OA' | 'PI' | 'PR';

export interface AdjustmentItem {
  /** A claim adjustment reason code (CARC); unknown codes are written as given. */
  readonly reason: string;
  readonly amount: Cents;
  /** Decimal text, when the adjustment carries a quantity. */
  readonly quantity?: string;
}

/** One CAS segment: a group and one to six reason, amount and quantity triplets. */
export interface CasSegment {
  readonly group: AdjustmentGroup;
  readonly items: readonly AdjustmentItem[];
}

export interface Ref {
  readonly qualifier: string;
  readonly value: string;
}

export interface Amount {
  readonly qualifier: string;
  readonly amount: Cents;
}

export interface Quantity {
  readonly qualifier: string;
  /** Decimal text. */
  readonly value: string;
}

export interface CommunicationNumber {
  readonly qualifier: 'TE' | 'EM' | 'FX' | 'UR' | 'EX';
  readonly value: string;
}

export interface Contact {
  readonly name?: string;
  /** Up to three. */
  readonly numbers: readonly CommunicationNumber[];
}

export interface Address {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state?: string;
  readonly postalCode?: string;
}

export interface BankAccount {
  /** BPR06 / BPR12: 01 (ABA routing) or 04 (Canadian). */
  readonly dfiQualifier: '01' | '04';
  readonly dfiNumber: string;
  /** BPR08 'DA'; BPR14 'DA' or 'SG'. */
  readonly accountQualifier: 'DA' | 'SG';
  readonly accountNumber: string;
}

export interface Payment {
  /** BPR01: C payment with remittance, D payment only, H notification only, I remittance only, P prenotification, U split, X handling party's option. */
  readonly handling: 'C' | 'D' | 'H' | 'I' | 'P' | 'U' | 'X';
  /** BPR02. Omitted: derived so the transaction balances (claims paid minus provider adjustments). */
  readonly amount?: Cents;
  /** BPR03: C credit, D debit. */
  readonly creditDebit: 'C' | 'D';
  /** BPR04: ACH, BOP (financial institution option), CHK, FWT (wire), NON (non-payment). */
  readonly method: 'ACH' | 'BOP' | 'CHK' | 'FWT' | 'NON';
  /** BPR05 for electronic payments: CCP or CTX. */
  readonly format?: 'CCP' | 'CTX';
  readonly payerAccount?: BankAccount;
  /** BPR10: the originating company identifier, ten characters. */
  readonly originatingCompanyId?: string;
  /** BPR11: nine characters. */
  readonly originatingCompanySupplemental?: string;
  readonly payeeAccount?: BankAccount;
  /** BPR16: the check issue or EFT effective date. */
  readonly date: CalendarDate;
}

export interface Trace {
  /** TRN02: the check or EFT trace number that reassociates payment and remittance. */
  readonly number: string;
  /** TRN03: the payer's originating company identifier, ten characters. */
  readonly originatorId: string;
  readonly supplemental?: string;
}

export interface Payer {
  readonly name: string;
  /** N103/N104: XV with a plan identifier, when sent. */
  readonly id?: { readonly qualifier: 'XV'; readonly value: string };
  readonly address: Address;
  /** Additional payer identification: 2U, EO, HI, NF (up to four). */
  readonly refs?: readonly Ref[];
  readonly businessContact?: Contact;
  /** At least one technical contact (PER BL). */
  readonly technicalContacts: readonly Contact[];
  readonly website?: string;
}

export interface Payee {
  readonly name: string;
  readonly id: { readonly qualifier: 'FI' | 'XV' | 'XX'; readonly value: string };
  readonly address?: Address;
  /** Additional payee identification: 0B, D3, PQ, TJ. */
  readonly refs?: readonly Ref[];
}

/** An NM1 party in the claim loop. */
export interface Party {
  /** NM102: 1 person, 2 non-person entity. */
  readonly entity: '1' | '2';
  readonly last: string;
  readonly first?: string;
  readonly middle?: string;
  readonly suffix?: string;
  readonly id?: { readonly qualifier: string; readonly value: string };
}

export interface Procedure {
  /** SVC01-1 / SVC06-1: HC for HCPCS and CPT, NU for revenue codes, and others. */
  readonly qualifier: 'AD' | 'ER' | 'HC' | 'HP' | 'IV' | 'N4' | 'N6' | 'NU' | 'UI' | 'WK';
  readonly code: string;
  /** Zero to four modifiers, in order. */
  readonly modifiers?: readonly string[];
  readonly description?: string;
}

export type LineDates =
  | { readonly kind: 'none' }
  /** DTM 472, one date of service. */
  | { readonly kind: 'single'; readonly date: CalendarDate }
  /** DTM 150 and 151: the service period as the 5010 transaction expresses a range. */
  | { readonly kind: 'period'; readonly from: CalendarDate; readonly to: CalendarDate }
  /**
   * DTM 472 with the RD8 range qualifier in DTM05/DTM06, as test matrix PAR-23 names it. The 5010
   * structure does not use those elements, so pyx12 rejects such a file; the parser reads the range.
   */
  | { readonly kind: 'rd8'; readonly from: CalendarDate; readonly to: CalendarDate };

export interface Remark {
  /** LQ01: HE remark code, RX pharmacy. */
  readonly qualifier: 'HE' | 'RX';
  readonly code: string;
}

export interface ServiceLine {
  readonly procedure: Procedure;
  /** SVC02. */
  readonly charge: Cents;
  /** SVC03. */
  readonly paid: Cents;
  /** SVC04: a revenue code (institutional). */
  readonly revenueCode?: string;
  /** SVC05: units of service paid, decimal text. */
  readonly units?: string;
  /** SVC06: the procedure as submitted, when the payer changed it. */
  readonly originalProcedure?: Procedure;
  /** SVC07: units as submitted. */
  readonly originalUnits?: string;
  readonly dates: LineDates;
  readonly adjustments: readonly CasSegment[];
  /** Line references (1S, APC, BB, E9, G1, G3, LU, RB, 6R, 0B..TJ, HPI, SY, 0K). */
  readonly refs?: readonly Ref[];
  /** AMT: B6 allowed, KH late filing reduction, T, T2, ZK..ZO. */
  readonly amounts?: readonly Amount[];
  readonly quantities?: readonly Quantity[];
  readonly remarks?: readonly Remark[];
}

/** MIA, inpatient adjudication: covered days or visits, and the PPS amounts this writer carries. */
export interface InpatientAdjudication {
  readonly coveredDaysOrVisits: string;
  readonly ppsOperatingOutlier?: Cents;
  readonly drgAmount?: Cents;
  readonly remark?: string;
}

/** MOA, outpatient adjudication. */
export interface OutpatientAdjudication {
  /** MOA01: reimbursement rate, decimal text. */
  readonly reimbursementRate?: string;
  /** MOA02: HCPCS payable amount. */
  readonly hcpcsPayable?: Cents;
  /** MOA03..MOA07: up to five remark codes. */
  readonly remarks?: readonly string[];
  readonly esrdPayment?: Cents;
  readonly nonPayableProfessional?: Cents;
}

export interface Claim {
  /** CLP01. */
  readonly patientControlNumber: string;
  /** CLP02. */
  readonly status: ClaimStatusCode;
  /** CLP03. */
  readonly charge: Cents;
  /** CLP04. */
  readonly paid: Cents;
  /** CLP05. */
  readonly patientResponsibility?: Cents;
  /** CLP06: the claim filing indicator. */
  readonly filingIndicator: string;
  /** CLP07: the payer claim control number. */
  readonly payerClaimControlNumber: string;
  /** CLP08: facility type, or place of service on a professional claim. */
  readonly facilityCode?: string;
  /** CLP09: claim frequency. */
  readonly frequencyCode?: string;
  /** CLP11..CLP13. */
  readonly drgCode?: string;
  readonly drgWeight?: string;
  readonly dischargeFraction?: string;
  /** Claim-level CAS. */
  readonly adjustments: readonly CasSegment[];
  readonly patient: Party;
  readonly insured?: Party;
  readonly correctedPatient?: Party;
  readonly renderingProvider?: Party;
  readonly inpatient?: InpatientAdjudication;
  readonly outpatient?: OutpatientAdjudication;
  /** Other claim related identification (1L, 1W, 28, 6P, 9A, 9C, BB, CE, EA, F8, G1, G3, IG, SY). */
  readonly refs?: readonly Ref[];
  /** Rendering provider identification (0B, 1A..1J, D3, G2, LU). */
  readonly renderingRefs?: readonly Ref[];
  /** DTM 232 and 233. */
  readonly statementFrom?: CalendarDate;
  readonly statementTo?: CalendarDate;
  /** DTM 036. */
  readonly coverageExpiration?: CalendarDate;
  /** DTM 050: the date the payer received the claim. */
  readonly receivedDate?: CalendarDate;
  /** PER CX, up to two. */
  readonly contacts?: readonly Contact[];
  /** AMT: AU coverage (allowed) amount, D8, DY, F5, I interest, NL, T, T2, ZK..ZO. */
  readonly amounts?: readonly Amount[];
  readonly quantities?: readonly Quantity[];
  readonly lines: readonly ServiceLine[];
}

/** LX: a header number grouping claims. */
export interface ClaimGroup {
  readonly headerNumber: number;
  readonly claims: readonly Claim[];
}

export interface ProviderAdjustmentItem {
  /** PLB03-1 (and 05-1, ...): WO recoupment, FB forward balance, L6 interest, 72 authorized return, and others. */
  readonly code: string;
  /** PLB03-2: the reference, for example the payer claim control number a recoupment takes back. */
  readonly reference?: string;
  /**
   * PLB04 (and 06, ...), as the segment carries it: a positive amount reduces the payment (a
   * recoupment), a negative amount increases it (interest). See docs/adr/0021.
   */
  readonly amount: Cents;
}

/** One PLB segment: a provider, a fiscal period date and one to six adjustments. */
export interface ProviderAdjustment {
  readonly providerId: string;
  readonly fiscalPeriodDate: CalendarDate;
  readonly items: readonly ProviderAdjustmentItem[];
}

/** One 835 transaction set: one payment. */
export interface Remittance835 {
  readonly payment: Payment;
  readonly trace: Trace;
  /** CUR02 when the payer sends a currency. */
  readonly currency?: string;
  /** REF EV. */
  readonly receiverId?: string;
  /** REF F2. */
  readonly versionId?: string;
  /** DTM 405. */
  readonly productionDate?: CalendarDate;
  readonly payer: Payer;
  readonly payee: Payee;
  readonly claimGroups: readonly ClaimGroup[];
  readonly providerAdjustments: readonly ProviderAdjustment[];
}

export interface TransactionSet835 {
  /** ST02, four to nine characters. */
  readonly controlNumber: string;
  readonly remittance: Remittance835;
  /** Writes a wrong SE01 on purpose (test matrix PAR-26). */
  readonly seCountOverride?: number;
}

export interface FunctionalGroup835 {
  /** GS03: the application receiver's code. */
  readonly receiverCode: string;
  /** GS06. */
  readonly controlNumber: number;
  readonly date: CalendarDate;
  /** HHMM. */
  readonly time: string;
  readonly transactions: readonly TransactionSet835[];
}

export interface Interchange835 {
  /** ISA08, up to fifteen characters (padded). The sender is always SYNTHSENDER. */
  readonly receiverId: string;
  /** ISA13, up to nine digits (zero padded). */
  readonly controlNumber: number;
  readonly date: CalendarDate;
  /** HHMM. */
  readonly time: string;
  /** ISA15: T test or P production. */
  readonly usage: 'T' | 'P';
  readonly delimiters: Delimiters;
  readonly groups: readonly FunctionalGroup835[];
}

/** A file: one or more interchanges. */
export interface File835 {
  readonly interchanges: readonly Interchange835[];
}
