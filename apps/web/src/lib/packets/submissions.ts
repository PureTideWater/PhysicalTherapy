import { type KeyProvider, PRICING_CHECK_RESULTS, type PracticeScope, type PricingCheckResult, type ScopeClient } from '@tp/db/runtime';
import { type Cents, centsToString } from '@tp/money';
import { FOLLOW_UP_DAYS, type PacketContent, type PayerResponseKind, type SubmissionChannel, addDays } from '@tp/packets';
import {
  type LogSubmissionInput,
  type RecordResponseInput,
  type SubmissionSent,
  type SubmissionUnattestedReason,
  logSubmission,
  packetVersionUnattestedReason,
  recordPayerResponse,
  submissionLog,
  submissionSentOf,
} from '@tp/worker/packets';

import { peopleEmails } from '../cases/people';
import { type PricingNowView, pricingNow } from './pricing';
import { type FollowUpState, followUpState } from './view';

/**
 * Submissions and responses, per case (PRD 7: "Per case: submissions, responses, follow-ups, documents";
 * "log a submission or response; set a follow-up"; PRD 12, Submission, response and follow-up; test
 * matrix CAS-12, CAS-14; docs/adr/0041 and 0044), over @tp/worker/packets: the customer submits through
 * the payer's own channel and logs it here with the exported hash (the product never submits); the
 * payer's answer is recorded with its document; a denial with a reason may reopen the case for the next
 * dispute level within its window, which the database computes. Recording a response writes no ledger
 * entry and moves no line (LED-01): the recovery ledger does both from the response and the remittances.
 * Each is recorded once: the same submission or response again records nothing.
 *
 * A submission is never refused because the version's pricing is no longer current (audit item #4): it records
 * something that already happened outside the product, so it is logged and the database flags it
 * (submission.pricing_check, read here with its own query), and the page shows the cause with the figures sent and
 * the pricing in effect now.
 *
 * A submission sends an attested export, with the one exception the founder ruled on 2026-10-20 (docs/adr/0061): an
 * export whose pricing went stale after it was made and before its attestation is never attested, and its submission
 * is logged sent without sign-off, recorded unattested with its reason (submission.unattested_reason, the database's),
 * so reconciliation tracks the payer's answer. The page offers that log only when the database says the export is one
 * (packet_version_unattested_reason()), with the person's confirmation that it went to the payer that way.
 */

type Scope = PracticeScope<ScopeClient>;

export interface ResponseView {
  readonly responseId: string;
  readonly kind: PayerResponseKind;
  /** What the payer accepted (stage four once the ledger approves it), cents as text. */
  readonly amountCents: string | null;
  readonly receivedOn: string;
  readonly denialCategory: string | null;
  readonly reopensCase: boolean;
  readonly nextWindowEndsOn: string | null;
  readonly documentId: string | null;
}

export interface SubmissionView {
  readonly submissionId: string;
  readonly packetVersionId: string;
  readonly versionNo: number;
  readonly disputeLevel: number;
  readonly submittedOn: string;
  readonly channel: SubmissionChannel;
  /** The payer's reference, for the roles that read PHI. */
  readonly reference: string | null;
  readonly submittedBy: string | null;
  readonly followUpOn: string;
  readonly followUp: FollowUpState;
  /** The export's SHA-256, as sent (CAS-12). */
  readonly exportSha256: string;
  readonly exportCsvSha256: string;
  readonly responses: readonly ResponseView[];
  /**
   * Whether the version it sent was still priced current when it was logged, as the database recorded it
   * (submission.pricing_check): 'current', or the cause; null only for a submission logged before the check.
   */
  readonly pricingCheck: PricingCheckResult | null;
  /** For a submission flagged so, the figures it sent and the pricing in effect now; null otherwise. */
  readonly pricing: PricingNowView | null;
  /** An attested export, or one sent without sign-off with its reason, as the database recorded it (submission.unattested_reason). */
  readonly sent: SubmissionSent;
}

const PRICING_RESULTS: ReadonlySet<string> = new Set(PRICING_CHECK_RESULTS);

/** Each submission's pricing check as the database recorded it, and the content of the version it sent. */
async function submissionPricing(scope: Scope, input: { readonly practiceId: string; readonly caseId: string }): Promise<ReadonlyMap<string, { readonly check: PricingCheckResult | null; readonly content: PacketContent }>> {
  const { rows } = await scope.client.query<{ id: string; pricing_check: string | null; content: PacketContent }>(
    `SELECT s.id, s.pricing_check, v.content FROM submission s JOIN packet_version v ON v.id = s.packet_version_id AND v.practice_id = s.practice_id
      WHERE s.case_id = $1 AND s.practice_id = $2`,
    [input.caseId, input.practiceId],
  );
  return new Map(
    rows.map((row) => [
      row.id,
      // A value the CHECK does not hold cannot be stored; anything else unexpected reads as not current.
      { check: row.pricing_check === null ? null : PRICING_RESULTS.has(row.pricing_check) ? (row.pricing_check as PricingCheckResult) : 'PRICING_NOT_IN_EFFECT', content: row.content },
    ]),
  );
}

/** The case's submission log, newest first, with each submission's follow-up state on `asOf` and its pricing flag. */
export async function submissionsOf(scope: Scope, keys: KeyProvider, input: { readonly practiceId: string; readonly caseId: string; readonly readsPhi: boolean; readonly asOf: string; readonly requestId: string }): Promise<SubmissionView[]> {
  const log = await submissionLog(scope, keys, { practiceId: input.practiceId, caseId: input.caseId, requestId: input.requestId });
  const emails = await peopleEmails(scope, input.practiceId, log.map((entry) => entry.submittedBy));
  const checks = await submissionPricing(scope, input);
  const pricing = new Map<string, PricingNowView>();
  for (const entry of log) {
    const found = checks.get(entry.submissionId);
    if (found !== undefined && found.check !== null && found.check !== 'current') {
      pricing.set(entry.submissionId, await pricingNow(scope, { practiceId: input.practiceId, content: found.content, requestId: input.requestId }));
    }
  }
  return log.map((entry, index) => ({
    submissionId: entry.submissionId,
    packetVersionId: entry.packetVersionId,
    versionNo: entry.versionNo,
    disputeLevel: entry.disputeLevel,
    submittedOn: entry.submittedOn,
    channel: entry.channel,
    reference: input.readsPhi ? entry.reference : null,
    submittedBy: emails.get(entry.submittedBy) ?? 'a former member of the practice',
    followUpOn: entry.followUpOn,
    // Only the latest submission waits on the payer; an earlier one was sent again or answered.
    followUp: index === 0 ? followUpState(entry.followUpOn, input.asOf, entry.responses.length > 0) : 'answered',
    exportSha256: entry.exportSha256,
    exportCsvSha256: entry.exportCsvSha256,
    responses: entry.responses.map((response) => ({
      responseId: response.responseId,
      kind: response.kind,
      amountCents: response.amountCents === null ? null : centsToString(response.amountCents),
      receivedOn: response.receivedOn,
      denialCategory: response.denialCategory,
      reopensCase: response.reopensCase,
      nextWindowEndsOn: response.nextWindowEndsOn,
      documentId: response.documentId,
    })),
    pricingCheck: checks.get(entry.submissionId)?.check ?? null,
    pricing: pricing.get(entry.submissionId) ?? null,
    sent: entry.sent,
  }));
}

export interface SubmittableVersion {
  readonly versionId: string;
  readonly versionNo: number;
  readonly disputeLevel: number;
  readonly exportedOn: string;
  readonly exportSha256: string;
  readonly exportCsvSha256: string;
  readonly attestedAt: string | null;
  /**
   * Whether the version's pricing is still current now, with the stale lines' figures then and now. A submission
   * that already happened is logged either way (the database flags it); the form says so before it is logged.
   */
  readonly pricing: PricingNowView;
  /**
   * Why its export may be logged without the attestation: 'pricing_stale_after_export' when the export was made, not
   * attested, and its pricing went stale since, so it is never attested (packet_version_unattested_reason()); null when
   * only an attested export is logged (attested, or still current and waiting for the reviewer).
   */
  readonly unattestedReason: SubmissionUnattestedReason | null;
}

/**
 * The exported version a submission may send now: the packet's current version, once exported, whether the
 * reimbursement reviewer has attested its export (D16: a submission is logged only after), and whether its
 * pricing is still current (audit item #4: logged and flagged when it is not, never refused).
 */
export async function submittableVersion(scope: Scope, input: { readonly practiceId: string; readonly caseId: string; readonly requestId: string }): Promise<SubmittableVersion | null> {
  const { rows } = await scope.client.query<{
    id: string;
    version_no: number;
    dispute_level: number;
    exported_on: string;
    export_sha256: string;
    export_csv_sha256: string;
    attested_at: Date | null;
    content: PacketContent;
  }>(
    `SELECT v.id, v.version_no, v.dispute_level, (v.exported_at AT TIME ZONE 'UTC')::date::text AS exported_on, v.export_sha256, v.export_csv_sha256, v.attested_at, v.content
       FROM packet p JOIN packet_version v ON v.id = p.current_version_id
      WHERE p.case_id = $1 AND p.practice_id = $2 AND v.exported_at IS NOT NULL`,
    [input.caseId, input.practiceId],
  );
  const row = rows[0];
  return row === undefined
    ? null
    : {
        versionId: row.id,
        versionNo: row.version_no,
        disputeLevel: row.dispute_level,
        exportedOn: row.exported_on,
        exportSha256: row.export_sha256,
        exportCsvSha256: row.export_csv_sha256,
        attestedAt: row.attested_at?.toISOString() ?? null,
        pricing: await pricingNow(scope, { practiceId: input.practiceId, content: row.content, requestId: input.requestId }),
        unattestedReason: row.attested_at === null ? await packetVersionUnattestedReason(scope.client, { practiceId: input.practiceId, versionId: row.id }) : null,
      };
}

/** The pricing check the database recorded on a submission when it was logged (null for one it cannot see or logged before the check). */
export async function loggedPricingCheck(scope: Scope, input: { readonly practiceId: string; readonly submissionId: string }): Promise<PricingCheckResult | null> {
  return (await loggedSubmission(scope, input))?.check ?? null;
}

/**
 * What the database recorded on a submission as it was logged: its pricing check (null for one logged before the check)
 * and whether it sent an attested export or one sent without sign-off, with its reason. Undefined for one the caller
 * cannot see.
 */
export async function loggedSubmission(scope: Scope, input: { readonly practiceId: string; readonly submissionId: string }): Promise<{ readonly check: PricingCheckResult | null; readonly sent: SubmissionSent } | undefined> {
  const { rows } = await scope.client.query<{ pricing_check: string | null; unattested_reason: string | null }>('SELECT pricing_check, unattested_reason FROM submission WHERE id = $1 AND practice_id = $2', [
    input.submissionId,
    input.practiceId,
  ]);
  const row = rows[0];
  if (row === undefined) {
    return undefined;
  }
  const value = row.pricing_check;
  return { check: value === null ? null : PRICING_RESULTS.has(value) ? (value as PricingCheckResult) : 'PRICING_NOT_IN_EFFECT', sent: submissionSentOf(row.unattested_reason) };
}

export interface ResponseDocument {
  readonly id: string;
  readonly kind: string;
  readonly uploadedAt: string;
  readonly sha256: string | null;
}

/** The documents a response may carry: the practice's clean payer letters and other documents, newest first. */
export async function responseDocuments(scope: Scope, practiceId: string): Promise<ResponseDocument[]> {
  const { rows } = await scope.client.query<{ id: string; kind: string; created_at: Date; sha256: string | null }>(
    `SELECT id, kind, created_at, sha256 FROM source_document
      WHERE practice_id = $1 AND parent_document_id IS NULL AND scan_status = 'clean' AND kind IN ('payer_letter', 'other')
      ORDER BY created_at DESC, id LIMIT 50`,
    [practiceId],
  );
  return rows.map((row) => ({ id: row.id, kind: row.kind, uploadedAt: row.created_at.toISOString(), sha256: row.sha256 }));
}

/** The follow-up date a submission gets unless the person names one (PRD 12: "follow-ups default to 45 days"). */
export function defaultFollowUpOn(submittedOn: string): string {
  return addDays(submittedOn, FOLLOW_UP_DAYS);
}

/**
 * Logs a submission (the export's hashes carried into the log), unless the case's latest submission is
 * already this one: the same version, date and channel, unanswered (a form sent twice).
 */
export async function logSubmissionOnce(scope: Scope, keys: KeyProvider, input: LogSubmissionInput & { readonly caseId: string }): Promise<{ readonly submissionId: string; readonly logged: boolean }> {
  const { rows } = await scope.client.query<{ id: string; packet_version_id: string; submitted_on: string; channel: string; answered: boolean }>(
    `SELECT s.id, s.packet_version_id, s.submitted_on::text, s.channel, EXISTS (SELECT 1 FROM payer_response r WHERE r.submission_id = s.id) AS answered
       FROM submission s WHERE s.id = case_latest_submission($1) AND s.practice_id = $2`,
    [input.caseId, input.practiceId],
  );
  const latest = rows[0];
  if (latest !== undefined && !latest.answered && latest.packet_version_id === input.versionId && latest.submitted_on === input.submittedOn && latest.channel === input.channel) {
    return { submissionId: latest.id, logged: false };
  }
  const logged = await logSubmission(scope, keys, input);
  return { submissionId: logged.submissionId, logged: true };
}

/** Records a payer response, unless the submission's latest response is already this one (the same kind, date, document and amount). */
export async function recordResponseOnce(scope: Scope, keys: KeyProvider, input: RecordResponseInput): Promise<{ readonly responseId: string; readonly recorded: boolean }> {
  const { rows } = await scope.client.query<{ id: string; kind: string; received_on: string; document_id: string | null; amount_cents: string | null }>(
    'SELECT r.id, r.kind, r.received_on::text, r.document_id, r.amount_cents::text FROM payer_response r WHERE r.id = submission_latest_response($1) AND r.practice_id = $2',
    [input.submissionId, input.practiceId],
  );
  const latest = rows[0];
  const amount = (value: Cents | null) => (value === null ? null : centsToString(value));
  if (latest !== undefined && latest.kind === input.kind && latest.received_on === input.receivedOn && latest.document_id === input.documentId && latest.amount_cents === amount(input.amountCents)) {
    return { responseId: latest.id, recorded: false };
  }
  const recorded = await recordPayerResponse(scope, keys, input);
  return { responseId: recorded.responseId, recorded: true };
}
