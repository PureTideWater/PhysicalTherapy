import type { Figure, FigureKind } from '../scan';

/**
 * The role reader's kinds (../roles.ts; docs/adr/0086): the roles a figure is read in and an input held in, what an
 * amount or a count of units is stated per, a figure as read, and a text's tokens. Types and `as const` values alone,
 * in which Stryker finds no mutant (stryker/shards.json, noMutants).
 */

/** Every role a figure can be read in, and an input held in. */
export const FIGURE_ROLES = [
  // Numbers
  'window_days',
  'days_to_pay',
  'days_late',
  'citation_page',
  'window_page',
  'version',
  'release',
  'level',
  'lines',
  'claims',
  'patients',
  'units',
  'line_units',
  'row',
  'claim_row',
  'patient_row',
  // Amounts
  'expected',
  'allowed',
  'paid',
  'variance',
  'interest',
  'patient_share',
  'calculation',
  // Percentages
  'contract_percent',
  'interest_rate',
  // Dates, months, days of a month and years
  'service_date',
  'paid_date',
  'received_date',
  'due_date',
  'deadline',
  'effective_date',
  'as_of_date',
  'schedule_year',
] as const;
export type FigureRole = (typeof FIGURE_ROLES)[number];

/** What an amount or a count of units is stated per: each line, each unit, or the lines in total. */
export const SCOPES = ['line', 'unit', 'total'] as const;
export type Scope = (typeof SCOPES)[number];

/** What a figure is read as: the scanner's kinds, and a year (a number the words make a year). */
export type ReadKind = FigureKind | 'year';

/**
 * A figure as read: its kind and value, and the roles its words give it, `any` when its words name no role of its
 * kind (an amount, percentage or date with no cue), or `none` for a number with no role.
 */
export interface FigureReading {
  readonly figure: Figure;
  readonly kind: ReadKind;
  readonly value: string;
  /** Any one of them, or, when `every`, each of them. */
  readonly roles: readonly FigureRole[] | 'any' | 'none';
  /** The words name several roles and none is the figure's own (step 5): the figure must be held in every one. */
  readonly every: boolean;
  /** What an amount or a count of units is stated per (null: not said). */
  readonly scope: Scope | null;
  /**
   * A partitive's first number ("2 of the 3 claims"): a part of the count `roles` name, at most `of` (the second
   * number), or, with none, at most the largest count the inputs hold in those roles.
   */
  readonly part: { readonly of: string | null } | null;
  /** A five-digit figure before a count's noun, after an article or a preposition: the procedure code it may also be ('' for none). */
  readonly code: string;
  /** A day count stated in business or working days. */
  readonly business: boolean;
  /** "first" with no role, or an ordinal before another word or number: prose, as "one" is. */
  readonly prose: boolean;
  /** Where the figure is among the text's tokens (quotedHolds() compares the words around it). */
  readonly token: number;
  /** A figure of a "respectively" list in neither of its two plain forms (rule 3 of docs/adr/0086): it fails, whatever it is. */
  readonly unread: boolean;
  /** For an amount or a count of units in all, what its sentence names of the lines (the fail-closed triggers of rule 1 of docs/adr/0086); null for any other figure. */
  readonly parts: SentenceParts | null;
}

/**
 * What a sentence names of the lines (the fail-closed triggers of rule 1 of docs/adr/0086, as amended on 2026-11-04):
 * where it names a part of them, an amount in it whose role's per-line and total values differ fails with no scope,
 * whatever its words beside it say.
 */
export interface SentenceParts {
  /**
   * It names a part of the lines: a row, a claim's or a patient's ("line 2", "claim 1", "Patient 2", "the claim line",
   * "the third line"), a code or a modifier, a date of service, a patient, a partitive ("two of the 3 lines"), or
   * "remaining", "other", "first", "last" or "some".
   */
  readonly named: boolean;
  /** It names a claim ("for the claim", "a claim", "her claim", "the claim number"): a part of the claims unless the pattern has one. */
  readonly claim: boolean;
  /** It names a patient or a member ("the patient", "a patient", "patient B", "the patient owes"): a part of the patients unless the pattern has one. */
  readonly patient: boolean;
  /** It says "each claim", "every claim" or "per claim": a figure stated in total there is each claim's, unless the pattern has one claim (PE5-3). */
  readonly eachClaim: boolean;
  /** It says "each patient", "per patient" or "every patient's": a figure stated in total there is each patient's, unless the pattern has one. */
  readonly eachPatient: boolean;
  /** Each figure it reads in roles, with its value: one in the roles of a count of lines, claims or patients the pattern does not hold so names a part. */
  readonly counts: readonly { readonly roles: readonly FigureRole[]; readonly value: string }[];
  /** Its dates, months and days of a month: one a line's service date is, or falls in, names a part, whatever role its words give it. */
  readonly dates: readonly { readonly kind: 'date' | 'month' | 'month_day'; readonly value: string }[];
  /**
   * The scope of each phrase of the closed list that stands beside no figure ("On each line the payer allowed $210.00 in
   * total", "$300.00 in total; that is per line"): it grants nothing, and names a part for a figure stated per another.
   */
  readonly phrases: readonly Scope[];
}

/** A text read: its figures with their roles, and its tokens as quotedHolds() compares them (an edge is "|"). */
export interface ReadText {
  readonly readings: readonly FigureReading[];
  readonly tokens: readonly string[];
}

/** A quoted text as quotedHolds() compares a narrative's figure with it: its tokens, and the roles its own words give each figure. */
export interface QuotedText {
  readonly tokens: readonly string[];
  /** By token, the roles the quote's own words give the figure there (`none` or `any` for none). */
  readonly roles: ReadonlyMap<number, Pick<FigureReading, 'roles' | 'every'>>;
}

export type TokenKind = 'word' | 'figure' | 'edge';

export interface Token {
  readonly kind: TokenKind;
  /**
   * A word in lower case without a possessive's "'s" (a placeholder is the word "placeholder"), an edge's characters,
   * or a figure's comparison key.
   */
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** A word or a figure written with a possessive's "'s" ("Medicare's", "Patient 2's"). */
  possessive: boolean;
  /** A figure token's figure. */
  readonly figure?: Figure;
}
