import { SUBMISSION_UNATTESTED_REASONS, type ScopeClient, type SubmissionUnattestedReason } from '@tp/db/runtime';

/**
 * What a logged submission sent (migration 20261103090000; the founder's ruling of 2026-10-20; docs/adr/0061): an
 * export a reimbursement reviewer attested, or one sent without sign-off for the one reason the database allows, an
 * export whose pricing went stale after it was made and before its attestation, so the attestation is refused and
 * stays refused, while reconciliation still tracks the payer's answer. The database decides which as the submission is
 * logged (submission.unattested_reason, written from packet_version_unattested_reason() beside pricing_check, which
 * records the cause) and records the audit event submission_logged_unattested; neither the person nor the application
 * chooses it, and the application role cannot write either column. Such a version is never attested.
 */
export type SubmissionSent = { readonly kind: 'attested' } | { readonly kind: 'unattested'; readonly reason: SubmissionUnattestedReason };
export type SubmissionKind = SubmissionSent['kind'];
export const SUBMISSION_KINDS = ['attested', 'unattested'] as const satisfies readonly SubmissionKind[];

export { SUBMISSION_UNATTESTED_REASONS, type SubmissionUnattestedReason };

/** The founder's words for why a submission was logged without the reviewer's attestation (2026-10-20), by reason. */
export const SUBMISSION_UNATTESTED_WORDS: Readonly<Record<SubmissionUnattestedReason, string>> = {
  pricing_stale_after_export: 'sent without sign-off: pricing went stale after export',
};

/** The audit event the database records for a submission sent without sign-off, its purpose the reason (migration 20261103090000). */
export const SUBMISSION_LOGGED_UNATTESTED = 'submission_logged_unattested';

const REASONS: ReadonlySet<string> = new Set(SUBMISSION_UNATTESTED_REASONS);

function isUnattestedReason(value: string): value is SubmissionUnattestedReason {
  return REASONS.has(value);
}

/**
 * A submission's kind from its stored submission.unattested_reason: null is an attested export's. A value the
 * database's CHECK does not admit is refused (a TypeError), never read as attested.
 */
export function submissionSentOf(unattestedReason: string | null): SubmissionSent {
  if (unattestedReason === null) {
    return { kind: 'attested' };
  }
  if (!isUnattestedReason(unattestedReason)) {
    throw new TypeError('a submission’s unattested reason is not one the database admits');
  }
  return { kind: 'unattested', reason: unattestedReason };
}

/**
 * Whether the export of a packet version may be logged sent without sign-off now, and why, in the caller's scope
 * (packet_version_unattested_reason()): 'pricing_stale_after_export' when the export guard made its export, no
 * reviewer attested it and its pricing is no longer current; null when only an attested export may be logged (a version
 * attested, unexported, still current, or one the caller cannot see). The submissions page asks it to offer the log of
 * an unattested export with its reason, and logSubmission() asks it before the database decides again under the
 * pricing lock. A value the database does not return fails closed (null: the attestation is required).
 */
export async function packetVersionUnattestedReason(client: ScopeClient, input: { readonly practiceId: string; readonly versionId: string }): Promise<SubmissionUnattestedReason | null> {
  const { rows } = await client.query<{ reason: string | null }>(
    'SELECT packet_version_unattested_reason(v.id) AS reason FROM packet_version v WHERE v.id = $1 AND v.practice_id = $2',
    [input.versionId, input.practiceId],
  );
  const reason = rows[0]?.reason ?? null;
  return reason !== null && isUnattestedReason(reason) ? reason : null;
}
