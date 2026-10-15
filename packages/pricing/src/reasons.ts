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
 * The reasons phase one of the engine (milestone 5) produces. The others are in the type so a stored
 * line can carry them, and are produced from milestone 7: MUE_EXCEEDED with the NCCI edits and
 * UNITS_RULE_UNKNOWN with minute logs.
 */
export const PHASE_ONE_REASONS = [
  'NO_MAPPING',
  'NO_AGREEMENT',
  'AMBIGUOUS_RATE',
  'NO_RATE_FOR_CODE',
  'DATE_OUTSIDE_VERSIONS',
  'NO_PFS_VALUE',
  'UNSUPPORTED_METHOD',
  'SECONDARY_PAYER',
  'REVERSED_CLAIM',
  'ENGINE_ERROR',
] as const satisfies readonly UnpricedReason[];

/** Reasons in the closed list that phase one never produces (milestone 7). */
export const LATER_REASONS = ['MUE_EXCEEDED', 'UNITS_RULE_UNKNOWN'] as const satisfies readonly UnpricedReason[];

/**
 * Why a line is ENGINE_ERROR, as a fixed code (never free text, so no identifier or document text can
 * reach a trace, a log or an operator alert through it).
 */
export const ENGINE_ERROR_DETAILS = [
  /** The caller's agreement resolution raised an invariant error (two mappings in force and the like). */
  'agreement_unresolved',
  /** The resolution named a contract version that is not signed off (CON-07). */
  'version_not_signed_off',
  /** FIXED_SCHEDULE, LESSER_OF and PER_VISIT are priced from milestone 7, with their golden lines. */
  'method_not_in_phase_one',
  /** A contract-named locality is priced once it has golden lines; phase one prices the practice's locality. */
  'locality_basis_not_in_phase_one',
  /** The line's place of service is not in the facility settings. */
  'place_of_service_unmapped',
  /** No locality_map record for the practice ZIP on the service date. */
  'no_locality',
  /** No pfs_gpci record for the locality in the basis year. */
  'no_gpci',
  /** No conversion_factor record of the named applicability in the basis year. */
  'no_conversion_factor',
  /** Units are not a whole number of at least one (phase one prices whole units). */
  'units_not_whole',
  /** An always-therapy code with no share of its own and no general practice-expense reduction in force. */
  'no_mppr_rate',
  /** CQ or CO on the line and no assistant_modifier record in force on the service date. */
  'no_assistant_record',
  /** CQ and CO on one line with different percentages. */
  'assistant_percentages_differ',
  /** No sequestration record (in force or suspended) on the service date. */
  'no_sequestration_record',
  /** A claim status other than 1, 2, 3, 4 and 22. */
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
