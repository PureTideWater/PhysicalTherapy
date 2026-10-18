import type { AgreementResolution } from '@tp/contracts';
import type { Cents, RoundingRule, UnroundedCents } from '@tp/money';

import type { IsoDate } from './dates';
import type { EngineErrorDetail, NoPfsValueDetail, UnpricedReason } from './reasons';
import type { IndexedRelease } from './release';
import type { PricingTrace } from './trace';

/**
 * The engine's inputs and outputs (PRD section 11, Inputs). Everything is plain data: the caller
 * loads the line facts, resolves each line's agreement with @tp/contracts' pure resolver, reads the
 * rule release and the practice settings, and hands them over; the engine reads no database, network,
 * clock or locale.
 */

/** Whether a place of service is paid the facility or the non-facility practice-expense value. */
export type PlaceOfServiceSetting = 'facility' | 'non_facility';

/** One patient-responsibility adjustment of the line (CAS PR): its reason code and amount. */
export interface PatientShareAdjustment {
  readonly groupCode: 'PR';
  readonly reasonCode: string;
  readonly amountCents: Cents;
}

/**
 * The caller could not resolve the line's agreement: the resolver raised AgreementInvariantError
 * (records the database rules out). The line is ENGINE_ERROR, never a guess.
 */
export interface AgreementFailure {
  readonly outcome: 'RESOLUTION_FAILED';
}

/** The agreement of one line: the resolver's result, or its failure. */
export type AgreementInput = AgreementResolution | AgreementFailure;

/** One service line as the remittance gave it, with the agreement resolved for it. */
export interface LineFacts {
  /** The line's number in its claim, unique in the claim. */
  readonly lineNo: number;
  /** service_line.id when the line is stored; recorded in the trace. */
  readonly serviceLineId?: string | null;
  readonly procedureCode: string;
  /** In billed order, at most four. */
  readonly modifiers: readonly string[];
  /** Units as billed, as decimal text ("2"). */
  readonly units: string;
  readonly serviceDate: IsoDate;
  readonly placeOfService: string | null;
  readonly chargeCents: Cents;
  readonly observedAllowedCents: Cents;
  /** AMT B6, or paid plus the PR adjustments (Rules reference, Observed allowed and variance). */
  readonly observedAllowedBasis: 'amt_b6' | 'paid_plus_pr';
  /** The line's PR adjustments; their sum is the patient share, reported and never subtracted. */
  readonly patientShareAdjustments: readonly PatientShareAdjustment[];
  readonly agreement: AgreementInput;
}

/** The claim the lines belong to: the multiple procedure reduction ranks a claim's units per day. */
export interface ClaimFacts {
  /** CLP02: 1 primary, 2 secondary, 3 tertiary, 4 denied, 22 reversal. */
  readonly claimStatusCode: string;
  /** A later reversal reverses this claim. */
  readonly reversed: boolean;
  /** A corrected claim supersedes this claim. */
  readonly corrected: boolean;
  /** The remittance's date (BPR16): dispute windows are measured from it. Null when unknown. */
  readonly remittanceDate: IsoDate | null;
  /** The payer and plan the lines resolved against (service_line.payer_plan_key). */
  readonly payerPlanKey: string | null;
  readonly lines: readonly LineFacts[];
}

/** Practice settings (PRD 11, Inputs). */
export interface PracticeSettings {
  /** The billing ZIP; the locality is the release's locality_map record for it on the service date. */
  readonly zip: string;
  /** The rounding when a contract is silent; null leaves the engine's default, HALF_UP_CENT. */
  readonly defaultRounding: RoundingRule | null;
  /**
   * The facility or non-facility setting of each place of service the practice bills. No rule record
   * carries the split (fixtures/golden/QUESTIONS.md, Q08), so it is an input; a place of service
   * missing from it is ENGINE_ERROR on a percent-of-Medicare line.
   */
  readonly placeOfServiceSettings: Readonly<Record<string, PlaceOfServiceSetting>>;
}

/** One claim to price. */
export interface PricingInput {
  readonly claim: ClaimFacts;
  readonly release: IndexedRelease;
  readonly settings: PracticeSettings;
  /** The date the dispute deadline is judged against (the run's triage date); the engine reads no clock. */
  readonly asOf: IsoDate;
}

/** The adjustments of PRD 11 step 4, in the order they apply: the flagged Medicare ones, then the rate record's own. */
export const ADJUSTMENT_NAMES = ['mppr', 'assistant_reduction', 'sequestration', 'contract_adjustment'] as const;
export type AdjustmentName = (typeof ADJUSTMENT_NAMES)[number];

/** The methods that price a line (UNSUPPORTED stops it with UNSUPPORTED_METHOD). */
export const PRICED_METHODS = ['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT'] as const;
export type PricedMethod = (typeof PRICED_METHODS)[number];

/**
 * A review flag on a priced line: something a person looks at, which never changes the amount. NCCI_PTP: an NCCI
 * procedure-to-procedure edit in force on the date pairs this line's code (column 2) with another line's code
 * (column 1), and no 59 or X modifier bypasses it (PRD 2 point 6; test matrix PRC-11).
 */
export const REVIEW_FLAGS = ['NCCI_PTP'] as const;
export interface ReviewFlag {
  readonly flag: (typeof REVIEW_FLAGS)[number];
  /** The line whose code is in column 1 of the edit. */
  readonly column1LineNo: number;
  readonly column1Code: string;
  /** This line's code. */
  readonly column2Code: string;
}

/** One flagged adjustment with the amount before and after it (an adjustment that changes nothing still appears). */
export interface AppliedAdjustment {
  readonly name: AdjustmentName;
  readonly beforeCents: UnroundedCents;
  readonly afterCents: UnroundedCents;
}

/** What priced (or was found for) the line: the mapping, and for a contract its version and rate record. */
export interface PricingTerms {
  readonly mappingId: string;
  readonly mappingKind: string;
  readonly contractVersionId: string | null;
  readonly rateRecordId: string | null;
}

/** The dispute window's state on the triage date (PRD 11 step 8). */
export type WindowStatus = 'OPEN' | 'WINDOW_PASSED' | 'NO_WINDOW';

export interface DisputeWindow {
  /** The last day a dispute can be filed; null when no window is known. */
  readonly endsOn: IsoDate | null;
  /** WINDOW_PASSED is for triage (validated, not actionable); it never changes the price. */
  readonly status: WindowStatus;
}

export interface PricedLine {
  readonly outcome: 'priced';
  readonly lineNo: number;
  readonly method: PricedMethod;
  readonly terms: PricingTerms;
  /** Whole cents after the one rounding. */
  readonly expectedAllowedCents: Cents;
  /** The exact amount before that rounding, kept beside it. */
  readonly expectedUnroundedCents: UnroundedCents;
  readonly rounding: RoundingRule;
  /**
   * After units (step 3), before any adjustment: the amount per unit times the units, the lesser of that and the
   * line charge (LESSER_OF), or the visit amount on the first included line and zero on the others (PER_VISIT).
   */
  readonly baseCents: UnroundedCents;
  readonly adjustments: readonly AppliedAdjustment[];
  /** The review flags of the line's edits, in column-1 line order; never a change to the amount. */
  readonly reviewFlags: readonly ReviewFlag[];
  /** The sum of the line's PR adjustments, reported beside the expected amount. */
  readonly patientShareCents: Cents;
  readonly observedAllowedCents: Cents;
  /** Expected allowed minus observed allowed; negative is an overpayment, recorded and never pursued. */
  readonly varianceCents: Cents;
  readonly window: DisputeWindow;
  readonly trace: PricingTrace;
}

export interface UnpricedLine {
  readonly outcome: 'unpriced';
  readonly lineNo: number;
  readonly reason: UnpricedReason;
  /** A fixed code for ENGINE_ERROR and NO_PFS_VALUE; null for the other reasons. */
  readonly detail: EngineErrorDetail | NoPfsValueDetail | null;
  /** The method of the terms found, when the agreement resolved to terms. */
  readonly method: string | null;
  /** What the agreement resolved to, when it got as far as a mapping. */
  readonly terms: PricingTerms | null;
  readonly trace: PricingTrace;
}

export type LinePricing = PricedLine | UnpricedLine;
