/**
 * The log-field allowlist (CLAUDE.md: "Log IDs"). A structured log line may carry only these keys;
 * `pnpm lint:logs` fails on any other key in a log call, and the runtime logger drops anything else.
 *
 * Every entry is an opaque identifier or a code, never a value that can identify a patient. Adding
 * a field is a reviewed change to this file; a field matching FORBIDDEN_FIELD_PATTERNS can never be
 * added (a test enforces it).
 */
export const ALLOWED_LOG_FIELDS = [
  'request_id',
  'trace_id',
  'actor_id',
  'user_id',
  'organization_id',
  'practice_id',
  'grant_id',
  'support_grant_id',
  'agreement_id',
  'audit_event_id',
  'restore_drill_id',
  'worker_id',
  'job_id',
  'job_type',
  'document_id',
  'remittance_id',
  'claim_id',
  'service_line_id',
  'pricing_run_id',
  'audit_report_id',
  'digest_id',
  'case_id',
  'packet_id',
  'packet_version_id',
  'ledger_entry_id',
  'contract_version_id',
  'rate_record_id',
  'release_no',
  'error_code',
] as const;

export type LogField = (typeof ALLOWED_LOG_FIELDS)[number];

const ALLOWED = new Set<string>(ALLOWED_LOG_FIELDS);

export function isAllowedLogField(key: string): key is LogField {
  return ALLOWED.has(key);
}

/**
 * Fields that must never be logged whatever the allowlist says: names, dates of birth, member IDs,
 * claim numbers and document text (PRD section 16, logging discipline).
 */
export const FORBIDDEN_FIELD_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'name', pattern: /name/i },
  { label: 'date of birth', pattern: /(^|_)dob($|_)|birth/i },
  { label: 'member ID', pattern: /member|subscriber|insured/i },
  { label: 'claim number', pattern: /claim_?(number|no|num)|control_?number|(^|_)(pcn|icn|clp0?[17])($|_)/i },
  { label: 'document text', pattern: /text|content|body|page|quote|narrative|raw/i },
];

/** The forbidden category a key falls in, or undefined when it matches none. */
export function forbiddenFieldLabel(key: string): string | undefined {
  return FORBIDDEN_FIELD_PATTERNS.find(({ pattern }) => pattern.test(key))?.label;
}
