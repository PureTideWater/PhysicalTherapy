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
