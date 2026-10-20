import { PRICING_CHECK_RESULTS, type PracticeScope, type PricingCheckResult, type ScopeClient } from '@tp/db/runtime';
import { type PayerResponseKind, type SubmissionChannel } from '@tp/packets';
import { SUBMISSION_UNATTESTED_WORDS, type SubmissionSent, type SubmissionUnattestedReason, submissionSentOf } from '@tp/worker/packets';
import type { PricingCheckCause } from '@tp/worker/pricing';

import { PRICING_CAUSE_TEXT } from './pricing';

/**
 * A submission sent without sign-off (the founder's ruling of 2026-10-20; docs/adr/0061; migration 20261103090000):
 * when a version's pricing goes stale after its export and before its attestation, the attestation stays refused and
 * the packet is never attested, and a submission of that export can still be logged, recorded truthfully as unattested
 * with its reason, 'sent without sign-off: pricing went stale after export', so reconciliation tracks the payer's
 * answer. The submission's pricing_check still records the cause. Only that reason allows an unattested submission;
 * every other submission still needs the attestation. The database decides which a submission is as it is logged
 * (packet_version_unattested_reason(), submission.unattested_reason) and records the audit event; these are the words
 * the review, submissions and reconciliation pages say it in, and the reads they show it from. No value, identifier
 * or person's text is in any of them.
 */

type Scope = PracticeScope<ScopeClient>;

/** The badge a submission sent without sign-off carries wherever it is listed. */
export const SENT_WITHOUT_SIGN_OFF = 'Sent without sign-off';

/** The founder's words for the reason, as a sentence's start: "Sent without sign-off: pricing went stale after export". */
export function unattestedReasonText(reason: SubmissionUnattestedReason): string {
  const words = SUBMISSION_UNATTESTED_WORDS[reason];
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** A submission's kind in words: an attested export's, or the reason it was sent without sign-off. */
export function submissionSentText(sent: SubmissionSent): string {
  return sent.kind === 'attested' ? 'Attested export' : unattestedReasonText(sent.reason);
}

/** A cause in words, without its full stop, for a version whose pricing is no longer current. */
function causeText(cause: PricingCheckCause): string {
  return PRICING_CAUSE_TEXT[cause];
}

/** What the reviewer and the practice do about an export whose pricing went stale after it was made (re-price, a new version, a new export). */
export interface StaleExportStep {
  readonly id: 'reprice' | 'version' | 'export';
  readonly text: string;
}

/**
 * The three steps that replace an export whose pricing went stale after it was made, by cause: re-price (an accepted
 * re-run has done it already when the lines were priced again; otherwise a re-run of their period under what is in
 * force now, accepted by a billing manager), a new version on the pricing in effect (nothing refreshes a case on new
 * pricing yet, so the stale lines are written off on the case page and leave this dispute), and a new export, which a
 * reimbursement reviewer attests. A stale line never becomes current again, so waiting changes nothing.
 */
export function staleExportSteps(cause: PricingCheckCause): readonly StaleExportStep[] {
  return [
    {
      id: 'reprice',
      text:
        cause === 'PRICING_NOT_IN_EFFECT'
          ? 'Re-price: done already. The stale lines were priced again by an accepted re-run or a later run of their period; Pricing now shows their figures now.'
          : 'Re-price: a billing manager re-runs the stale lines’ period under the release, mapping and contract version in force now and accepts the re-run; Pricing now shows their figures once it is accepted.',
    },
    {
      id: 'version',
      text: 'A new version: refreshing a case on new pricing is not available yet, so the practice writes the stale lines off on the case page (they leave this dispute) and writes and approves a new version of the packet on the pricing in effect. When every line of the case is stale, nothing is left to write until a case can be refreshed.',
    },
    { id: 'export', text: 'A new export: the new version is exported, and a reimbursement reviewer reviews and attests that export before the practice sends it.' },
  ];
}

/**
 * The review page's words for an export whose pricing went stale after it was made: why the attestation is refused,
 * what to do, and what the practice logs if the export already went to the payer.
 */
export const STALE_EXPORT_REVIEW = {
  title: 'Not attested: this export’s pricing went stale after the export',
  why: (cause: PricingCheckCause) =>
    `${causeText(cause)}. Its files no longer show the pricing in effect, so the attestation is refused, here and in the database, and stays refused: a stale line never becomes current again, so this export is never attested.`,
  whatToDo: 'What to do instead:',
  ifSent:
    'If the practice already sent this export to the payer, a billing manager logs that submission on its submissions page as it happened. It is recorded unattested, sent without sign-off: pricing went stale after export, flagged with the cause, and reconciliation tracks the payer’s answer.',
  sent: (submittedOn: string) =>
    `The practice logged this export’s submission of ${submittedOn} as sent without sign-off: pricing went stale after export. This version is never attested; reconciliation tracks the payer’s answer to it.`,
  /** The disabled attest button's reason. */
  button: 'Not attested: its pricing went stale after the export, so this export is never attested. Its replacement, a new version’s export, is the one to attest.',
} as const;

/** The packet builder's line for an export whose pricing went stale after it was made, where it would otherwise wait for the attestation. */
export const STALE_EXPORT_BUILDER =
  'Never attested: this export’s pricing went stale after the export. Do not send it; the stale lines are re-priced, and a new version is written, approved and exported on the pricing in effect. If it already went to the payer, log it on the submissions page as sent without sign-off.';

/** The submissions page's words for logging an export whose pricing went stale after it was made, never attested. */
export const STALE_EXPORT_SUBMISSION = {
  title: 'This export is never attested: its pricing went stale after the export',
  why: (cause: PricingCheckCause) =>
    `${causeText(cause)}. The reimbursement reviewer cannot attest an export whose pricing is no longer current, so this one never will be.`,
  notSent: 'If it has not gone to the payer, do not send it: the stale lines are re-priced, a new version is written and approved on the pricing in effect, and its new export is attested before it is sent.',
  sent:
    'If it already went to the payer, log the submission below as it happened. It is recorded as sent without sign-off: pricing went stale after export, unattested with that reason and flagged with the cause, and reconciliation tracks the payer’s answer as it does for any submission.',
  confirm: 'This export went to the payer without the reimbursement reviewer’s sign-off, after its pricing went stale. Log it as sent without sign-off.',
  submit: 'Log the submission sent without sign-off',
  /** The refusal when the confirmation is not given. */
  confirmRequired: 'confirm that this export went to the payer without the reimbursement reviewer’s sign-off; it is logged as sent without sign-off',
  /** The notice once it is logged. */
  logged:
    'The submission is logged as sent without sign-off: pricing went stale after export. It is recorded unattested with that reason and flagged with the cause, its packet version is never attested, and reconciliation tracks the payer’s answer to it.',
} as const;

/** The submission log's line for a submission sent without sign-off. */
export function sentWithoutSignOffLine(reason: SubmissionUnattestedReason): string {
  return `${unattestedReasonText(reason)}. It was logged without the reimbursement reviewer’s attestation, which its export never received; the payer’s answer is tracked as for any submission.`;
}

/** Reconciliation's words for the submissions sent without sign-off. */
export const RECONCILIATION_UNATTESTED = {
  title: 'Submissions sent without sign-off',
  description:
    'Each was logged without the reimbursement reviewer’s attestation, for the one reason the product allows: its pricing went stale after the export, so its export is never attested. Reconciliation tracks the payer’s answer to each as to any submission: its responses, and the remittances that reprocess its lines, count at their own stages.',
  empty: 'No submission was sent without sign-off.',
} as const;

const PRICING_RESULTS: ReadonlySet<string> = new Set(PRICING_CHECK_RESULTS);

/** A stored pricing check; anything the CHECK does not hold reads as not current. */
function pricingCheckOf(value: string | null): PricingCheckResult | null {
  return value === null ? null : PRICING_RESULTS.has(value) ? (value as PricingCheckResult) : 'PRICING_NOT_IN_EFFECT';
}

/**
 * The submission of a version's export logged sent without sign-off, the earliest when there are several (the review
 * page says the version is never attested); null when none was.
 */
export async function sentWithoutSignOffOf(scope: Scope, input: { readonly practiceId: string; readonly versionId: string }): Promise<{ readonly submittedOn: string; readonly reason: SubmissionUnattestedReason } | null> {
  const { rows } = await scope.client.query<{ submitted_on: string; unattested_reason: string }>(
    `SELECT s.submitted_on::text, s.unattested_reason FROM submission s
      WHERE s.packet_version_id = $1 AND s.practice_id = $2 AND s.unattested_reason IS NOT NULL
      ORDER BY s.submitted_on, s.created_at, s.id LIMIT 1`,
    [input.versionId, input.practiceId],
  );
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  const sent = submissionSentOf(row.unattested_reason);
  return sent.kind === 'unattested' ? { submittedOn: row.submitted_on, reason: sent.reason } : null;
}

export interface UnattestedSubmissionView {
  readonly submissionId: string;
  readonly caseId: string;
  readonly versionNo: number;
  readonly disputeLevel: number;
  readonly submittedOn: string;
  readonly channel: SubmissionChannel;
  readonly reason: SubmissionUnattestedReason;
  /** The cause the database recorded when it was logged (submission.pricing_check). */
  readonly pricingCheck: PricingCheckResult | null;
  /** The payer's latest answer to it, if any: its kind and the day it was received. */
  readonly latestResponse: { readonly kind: PayerResponseKind; readonly receivedOn: string } | null;
}

/** How many submissions reconciliation lists at most, newest first; the count says how many there are. */
export const UNATTESTED_LISTED = 50;

/**
 * The practice's submissions sent without sign-off, newest first (one case's when `caseId` names one), with the payer's
 * latest answer to each: what reconciliation shows plainly. No reference, no amount and no person is read.
 */
export async function submissionsSentWithoutSignOff(
  scope: Scope,
  input: { readonly practiceId: string; readonly caseId: string | null },
): Promise<{ readonly total: number; readonly items: readonly UnattestedSubmissionView[] }> {
  const { rows } = await scope.client.query<{
    id: string;
    case_id: string;
    version_no: number;
    dispute_level: number;
    submitted_on: string;
    channel: SubmissionChannel;
    unattested_reason: string;
    pricing_check: string | null;
    response_kind: PayerResponseKind | null;
    response_on: string | null;
    total: number;
  }>(
    `SELECT s.id, s.case_id, v.version_no, s.dispute_level, s.submitted_on::text, s.channel, s.unattested_reason, s.pricing_check,
            r.kind AS response_kind, r.received_on::text AS response_on, count(*) OVER ()::int AS total
       FROM submission s
       JOIN packet_version v ON v.id = s.packet_version_id AND v.practice_id = s.practice_id
       LEFT JOIN LATERAL (SELECT x.kind, x.received_on FROM payer_response x WHERE x.submission_id = s.id ORDER BY x.received_on DESC, x.created_at DESC, x.id DESC LIMIT 1) r ON true
      WHERE s.practice_id = $1 AND s.unattested_reason IS NOT NULL AND ($2::uuid IS NULL OR s.case_id = $2)
      ORDER BY s.submitted_on DESC, s.created_at DESC, s.id DESC
      LIMIT ${String(UNATTESTED_LISTED)}`,
    [input.practiceId, input.caseId],
  );
  const items: UnattestedSubmissionView[] = [];
  for (const row of rows) {
    const sent = submissionSentOf(row.unattested_reason);
    if (sent.kind !== 'unattested') {
      continue;
    }
    items.push({
      submissionId: row.id,
      caseId: row.case_id,
      versionNo: row.version_no,
      disputeLevel: row.dispute_level,
      submittedOn: row.submitted_on,
      channel: row.channel,
      reason: sent.reason,
      pricingCheck: pricingCheckOf(row.pricing_check),
      latestResponse: row.response_kind === null || row.response_on === null ? null : { kind: row.response_kind, receivedOn: row.response_on },
    });
  }
  return { total: rows[0]?.total ?? 0, items };
}
