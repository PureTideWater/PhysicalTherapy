/**
 * @tp/rules: global rule records, numbered releases, code lists and the content checker. Global
 * content carries no practice_id and is read-only to the application role.
 */

/** Global rule record types (Data dictionary, `rule_record.record_type`). */
export const RULE_RECORD_TYPES = [
  'pfs_rvu',
  'pfs_gpci',
  'conversion_factor',
  'mppr_rate',
  'therapy_threshold',
  'assistant_modifier',
  'sequestration',
  'ncci_ptp',
  'ncci_mue',
  'carc',
  'rarc',
  'claim_status_code',
  'state_prompt_pay',
  'dispute_window',
  'locality_map',
] as const;
export type RuleRecordType = (typeof RULE_RECORD_TYPES)[number];

/**
 * Verification levels (PRD section 9): L1 script-checked, L2 read against the source by a person,
 * L3 confirmed by a reimbursement specialist.
 */
export const VERIFICATION_LEVELS = ['L1', 'L2', 'L3'] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];
