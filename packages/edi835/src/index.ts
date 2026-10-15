/**
 * @tp/edi835: the X12 835 parser and loader events, written against the purchased 005010X221A1
 * implementation guide (milestone 2). A pure function from bytes to typed events plus an error
 * report; no model is anywhere near it.
 */

/** The 835 version the parser reads (PRD section 2). */
export const TRANSACTION_VERSION = '005010X221A1';

/**
 * Typed parser errors (PRD section 10). Each carries the segment index, segment ID and element
 * position, never a patient field.
 */
export const EDI_ERROR_CODES = [
  'EDI_SYNTAX',
  'EDI_CONTROL_MISMATCH',
  'EDI_UNBALANCED',
  'EDI_UNKNOWN_CODE',
  'EDI_DUPLICATE',
  'EDI_NOT_835',
] as const;
export type EdiErrorCode = (typeof EDI_ERROR_CODES)[number];
