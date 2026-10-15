/**
 * Typed parser errors (PRD section 10). Every error carries the segment index (every segment of the
 * file counted from 1, ISA being 1, across interchanges), the segment ID and the element position
 * (from 1; 0 means the segment as a whole). Messages are built here from codes, positions, counts,
 * control numbers and amounts only: never from an element's text, so a patient field can never reach
 * one (docs/adr/0025).
 */
import { type Cents, formatCents } from '@tp/money';

export const EDI_ERROR_CODES = [
  'EDI_SYNTAX',
  'EDI_CONTROL_MISMATCH',
  'EDI_UNBALANCED',
  'EDI_UNKNOWN_CODE',
  'EDI_DUPLICATE',
  'EDI_NOT_835',
] as const;
export type EdiErrorCode = (typeof EDI_ERROR_CODES)[number];

/** What an EDI_SYNTAX error found wrong. */
export const SYNTAX_REASONS = [
  /** The input ended inside a segment, or before the trailers that close what it opened. */
  'truncated',
  /** No segment terminator within MAX_SEGMENT_LENGTH characters (the tokenizer's memory bound). */
  'segment_too_long',
  /** The ISA header is not 106 characters of fixed-width elements with four distinct delimiters. */
  'header',
  /** A segment the 005010X221A1 structure does not allow where it appears. */
  'unexpected_segment',
  /** A segment the structure requires is not there. */
  'missing_segment',
  /** A segment appears more often than the structure allows. */
  'segment_repeats',
  /** A required element is empty. */
  'missing_element',
  /** An element repeats (no 835 element does). */
  'element_repeats',
  /** An amount that is not a decimal with at most two places. */
  'invalid_amount',
  /** A quantity, rate or count that is not a decimal. */
  'invalid_decimal',
  /** A date that is not a valid calendar date in the element's format. */
  'invalid_date',
  /** A control number or count that is not a whole number. */
  'invalid_number',
  /** Service units that are not above zero. */
  'units_not_positive',
  /** A code the structure needs to read the transaction (BPR03, DTM05) outside its code set. */
  'invalid_code',
] as const;
export type SyntaxReason = (typeof SYNTAX_REASONS)[number];

/** What an EDI_UNBALANCED error failed to balance (docs/adr/0021). */
export type BalanceScope = 'transaction' | 'claim' | 'claim_lines' | 'line';

export interface Position {
  readonly segmentIndex: number;
  readonly segmentId: string;
  readonly elementPosition: number;
  /** The component of a composite element, from 1, when the error is about one component. */
  readonly componentPosition?: number;
}

export interface EdiError extends Position {
  readonly code: EdiErrorCode;
  readonly message: string;
  /** EDI_SYNTAX: what was wrong. */
  readonly reason?: SyntaxReason;
  /** EDI_UNBALANCED: what failed to balance, and the exact difference. */
  readonly scope?: BalanceScope;
  readonly differenceCents?: Cents;
  /**
   * EDI_CONTROL_MISMATCH, EDI_NOT_835 and some EDI_SYNTAX errors: the count, control number,
   * transaction type or segment ID expected, and the one found. Never an element that can hold a
   * patient field.
   */
  readonly expected?: string;
  readonly found?: string;
}

/** A programming error in how the package is called (not a property of the document). */
export class Edi835UsageError extends Error {
  override readonly name = 'Edi835UsageError';
}

const SEGMENT_ID = /^[A-Z][A-Z0-9]{1,2}$/;
const TOKEN = /^[A-Za-z0-9]{1,15}$/;

/**
 * Only what is shaped like a segment ID, a code, a count or a control number is ever repeated from a
 * document into an error: a segment ID that is not one (text before the first element separator can be
 * anything) becomes '', and any other value read from the file that is not a short code becomes
 * "(not shown)".
 */
function safe(position: Position): Position {
  return SEGMENT_ID.test(position.segmentId) ? position : { ...position, segmentId: '' };
}

function shown(value: string): string {
  return value === '' || TOKEN.test(value) ? value : '(not shown)';
}

function where(position: Position): string {
  const id = position.segmentId === '' ? 'segment' : position.segmentId;
  const element = position.elementPosition === 0 ? '' : ` element ${String(position.elementPosition)}`;
  const component = position.componentPosition === undefined ? '' : ` component ${String(position.componentPosition)}`;
  return `segment ${String(position.segmentIndex)} (${id}${element}${component})`;
}

const SYNTAX_TEXT: Record<SyntaxReason, string> = {
  truncated: 'the input ends before the segment or envelope is complete',
  segment_too_long: 'no segment terminator within the longest segment the parser reads',
  header: 'the ISA header is not a valid 106-character fixed-width header',
  unexpected_segment: 'the segment is not allowed here',
  missing_segment: 'a required segment is missing',
  segment_repeats: 'the segment repeats more often than allowed',
  missing_element: 'a required element is empty',
  element_repeats: 'the element repeats, and no 835 element repeats',
  invalid_amount: 'the amount is not a decimal with at most two places',
  invalid_decimal: 'the value is not a decimal number',
  invalid_date: 'the date is not a valid calendar date',
  invalid_number: 'the value is not a whole number',
  units_not_positive: 'the units are not above zero',
  invalid_code: 'the code is not one the structure allows',
};

/** `detail.expected` is the parser's own; `detail.found` (a segment ID read from the file) is shown only when shaped like one. */
export function syntaxError(at: Position, reason: SyntaxReason, detail: { expected?: string; found?: string } = {}): EdiError {
  const position = safe(at);
  const expected = detail.expected === undefined ? '' : ` (expected ${detail.expected})`;
  const found = detail.found === undefined ? {} : { found: SEGMENT_ID.test(detail.found) ? detail.found : '' };
  return { code: 'EDI_SYNTAX', ...position, reason, ...detail, ...found, message: `EDI_SYNTAX at ${where(position)}: ${SYNTAX_TEXT[reason]}${expected}` };
}

export function controlMismatch(at: Position, what: string, expected: string, foundText: string): EdiError {
  const position = safe(at);
  const found = shown(foundText);
  return { code: 'EDI_CONTROL_MISMATCH', ...position, expected, found, message: `EDI_CONTROL_MISMATCH at ${where(position)}: ${what} is ${found === '' ? 'empty' : found}, expected ${expected}` };
}

export function notAn835(at: Position, expected: string, foundText: string): EdiError {
  const position = safe(at);
  const found = shown(foundText);
  return { code: 'EDI_NOT_835', ...position, expected, found, message: `EDI_NOT_835 at ${where(position)}: found ${found === '' ? 'no X12 interchange' : found}, expected ${expected}` };
}

export function unbalanced(at: Position, scope: BalanceScope, differenceCents: Cents): EdiError {
  const position = safe(at);
  return { code: 'EDI_UNBALANCED', ...position, scope, differenceCents, message: `EDI_UNBALANCED at ${where(position)}: the ${scope.replace('_', ' ')} is off by ${formatCents(differenceCents)}` };
}

export function unknownCode(at: Position, list: string): EdiError {
  const position = safe(at);
  return { code: 'EDI_UNKNOWN_CODE', ...position, message: `EDI_UNKNOWN_CODE at ${where(position)}: the code is not in the ${list} list; loaded with this flag` };
}

export function duplicate(at: Position, what: 'document' | 'remittance'): EdiError {
  const position = safe(at);
  return {
    code: 'EDI_DUPLICATE',
    ...position,
    message: `EDI_DUPLICATE at ${where(position)}: ${what === 'document' ? 'the same bytes were received before' : 'the same remittance was received before'}; zero rows load`,
  };
}
