/**
 * The closed list of unpriced reasons (PRD section 11; docs/product/unpriced-reasons.md). A line is
 * priced, or it carries exactly one of these. A test keeps this list, that table and the rules
 * reference's table identical.
 */
export const UNPRICED_REASONS = [
  'NO_AGREEMENT',
  'NO_MAPPING',
  'AMBIGUOUS_RATE',
  'NO_RATE_FOR_CODE',
  'NO_PFS_VALUE',
  'UNSUPPORTED_METHOD',
  'SECONDARY_PAYER',
  'MUE_EXCEEDED',
  'UNITS_RULE_UNKNOWN',
  'DATE_OUTSIDE_VERSIONS',
  'REVERSED_CLAIM',
  'ENGINE_ERROR',
] as const;
export type UnpricedReason = (typeof UNPRICED_REASONS)[number];

/**
 * Why a line is ENGINE_ERROR, as a fixed code (never free text, so no identifier or document text can
 * reach a trace, a log or an operator alert through it).
 */
export const ENGINE_ERROR_DETAILS = [
  /** The caller's agreement resolution raised an invariant error (two mappings in force and the like). */
  'agreement_unresolved',
  /** The resolution named a contract version that is not signed off (CON-07). */
  'version_not_signed_off',
  /**
   * apply_mppr on a FIXED_SCHEDULE, LESSER_OF or PER_VISIT term: the reduction cuts a fee-schedule
   * practice-expense part, which such an amount does not have (fixtures/golden/QUESTIONS.md, Q39). For
   * review, not an operator alert (REVIEW_DETAILS).
   */
  'mppr_needs_fee_schedule',
  /** A contract-named locality is priced once it has golden lines; the engine prices the practice's locality. */
  'locality_basis_not_in_phase_one',
  /** The line's place of service is not in the facility settings. */
  'place_of_service_unmapped',
  /** No locality_map record for the practice ZIP on the service date. */
  'no_locality',
  /** No pfs_gpci record for the locality in the basis year. */
  'no_gpci',
  /** No conversion_factor record of the named applicability in the basis year. */
  'no_conversion_factor',
  /** Units are not a whole number of at least one (the engine prices whole units; QUESTIONS Q26). */
  'units_not_whole',
  /** More units on one line than MAX_UNITS: malformed input, never ranked or priced. */
  'units_above_limit',
  /** The practice ZIP's locality_map record says the ZIP needs its ZIP+4 to name a locality, and the settings give no ZIP+4. */
  'locality_needs_zip_plus_four',
  /**
   * The practice ZIP's locality_map record needs its ZIP+4, and the release has no locality_map_plus_four record of the
   * ZIP in force on the service date: a gap in the content, never the practice's ZIP+4.
   */
  'no_locality_plus_four',
  /** The ZIP's locality_map_plus_four record in force on the service date has no range holding the practice's ZIP+4. */
  'zip_plus_four_not_in_locality_map',
  /** An always-therapy code with no share of its own and no general practice-expense reduction in force. */
  'no_mppr_rate',
  /** CQ or CO on the line and no assistant_modifier record in force on the service date. */
  'no_assistant_record',
  /** CQ and CO on one line with different percentages. */
  'assistant_percentages_differ',
  /** No sequestration record (in force or suspended) on the service date. */
  'no_sequestration_record',
  /**
   * Claim status 23 or 25: valid in an 835, with no pricing rule yet (fixtures/golden/QUESTIONS.md,
   * Q31). For review, not an operator alert (REVIEW_DETAILS).
   */
  'claim_status_not_priced',
  /** A claim status outside the 835's own list (1, 2, 3, 4, 19, 20, 21, 22, 23 and 25). */
  'claim_status_unknown',
  /** A reversed claim that a correction supersedes: its correction is priced, not it. */
  'reversed_and_corrected',
  /** Two records of one rule are in force on one date; a checked release never has that. */
  'release_records_overlap',
  /** Line facts that do not have the shape the engine reads (a malformed code, date or amount). */
  'invalid_line_facts',
  /** Two lines of the claim share a line number. */
  'duplicate_line_no',
  /** Practice settings that do not have the shape the engine reads. */
  'invalid_settings',
  /** Anything else that went wrong: an operator looks at the trace. */
  'unexpected',
] as const;
export type EngineErrorDetail = (typeof ENGINE_ERROR_DETAILS)[number];

/**
 * ENGINE_ERROR details whose input is valid and expected, with no pricing rule yet: the line is
 * reviewed, and the operator is not paged for it. Every other detail is an operator alert (the
 * remedy the closed list gives ENGINE_ERROR); milestone 7's pricing runs raise it.
 */
export const REVIEW_DETAILS = ['claim_status_not_priced', 'mppr_needs_fee_schedule'] as const satisfies readonly EngineErrorDetail[];

/** Whether an unpriced line's ENGINE_ERROR detail pages the operator. */
export function pagesOperator(detail: EngineErrorDetail): boolean {
  return !(REVIEW_DETAILS as readonly EngineErrorDetail[]).includes(detail);
}

/** Why a line is NO_PFS_VALUE: no relative value for the code, or none for the setting. */
export const NO_PFS_VALUE_DETAILS = ['no_rvu_in_basis_year', 'practice_expense_not_available'] as const;
export type NoPfsValueDetail = (typeof NO_PFS_VALUE_DETAILS)[number];

/** An input or release problem found while pricing one line; the engine records ENGINE_ERROR for it. */
export class EngineInputError extends Error {
  override readonly name = 'EngineInputError';
  readonly detail: EngineErrorDetail;

  constructor(detail: EngineErrorDetail) {
    super(`pricing input problem: ${detail}`);
    this.detail = detail;
  }
}
