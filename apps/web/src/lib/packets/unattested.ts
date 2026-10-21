import { PRICING_CHECK_RESULTS, type PracticeScope, type PricingCheckResult, type ScopeClient } from '@tp/db/runtime';
import { type PayerResponseKind, type SubmissionChannel } from '@tp/packets';
import { SUBMISSION_UNATTESTED_WORDS, type SubmissionSent, type SubmissionUnattestedReason, submissionSentOf } from '@tp/worker/packets';
import type { LinePricingNow, PricingCheckCause } from '@tp/worker/pricing';

import { PRICING_CAUSE_TEXT, type PricingNowView } from './pricing';

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

/** A version's pricing now as the stale-export words read it: the database's verdict and each stale line with its own cause. */
export type StalePricing = Pick<PricingNowView, 'status'> & { readonly lines: readonly Pick<LinePricingNow, 'row' | 'check'>[] };

/** The causes in the pricing check's order of severity (PRICING_CHECK_RESULTS without 'current'). */
const CAUSE_ORDER: readonly PricingCheckCause[] = PRICING_CHECK_RESULTS.filter((result): result is PricingCheckCause => result !== 'current');

/** Rows in words: "row 1", "rows 1 and 2", "rows 1, 2 and 3". */
export function rowsText(rows: readonly number[]): string {
  const sorted = [...new Set(rows)].sort((a, b) => a - b).map(String);
  if (sorted.length <= 1) {
    return `row ${sorted[0] ?? ''}`.trim();
  }
  return `rows ${sorted.slice(0, -1).join(', ')} and ${sorted.at(-1) ?? ''}`;
}

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
const lowered = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

/**
 * The stale lines' causes, each line's own (never only the version's most severe one), in the pricing check's order of
 * severity, each with its rows; the version's verdict alone when no line is listed (a line the caller cannot read
 * fails closed).
 */
export function staleCauses(pricing: StalePricing): readonly { readonly cause: PricingCheckCause; readonly rows: readonly number[] }[] {
  const byCause = new Map<PricingCheckCause, number[]>();
  for (const line of pricing.lines) {
    if (line.check !== 'current') {
      byCause.set(line.check, [...(byCause.get(line.check) ?? []), line.row]);
    }
  }
  if (byCause.size === 0) {
    return pricing.status === 'current' ? [] : [{ cause: pricing.status, rows: [] }];
  }
  return CAUSE_ORDER.flatMap((cause) => {
    const rows = byCause.get(cause);
    return rows === undefined ? [] : [{ cause, rows }];
  });
}

/** Why the version's pricing is no longer current, in words, each cause with its lines when there is more than one. */
function causesText(pricing: StalePricing): string {
  const causes = staleCauses(pricing);
  const [only] = causes;
  if (causes.length === 1 && only !== undefined) {
    return PRICING_CAUSE_TEXT[only.cause];
  }
  return causes.map(({ cause, rows }) => `${capitalized(rowsText(rows))}: ${lowered(PRICING_CAUSE_TEXT[cause])}`).join('. ');
}

/** A cause that leaves a line not priced again yet, in a few words for the re-price step. */
const NOT_PRICED_AGAIN_TEXT: Readonly<Record<Exclude<PricingCheckCause, 'PRICING_NOT_IN_EFFECT'>, string>> = {
  RELEASE_WITHDRAWN: 'rule release withdrawn',
  MAPPING_NOT_IN_FORCE: 'plan mapping corrected',
  CONTRACT_VERSION_NOT_SIGNED_OFF: 'contract version replaced by a correction',
  CONTRACT_VERSION_NOT_IN_FORCE: 'contract version closed before the service date',
};

/** What the reviewer and the practice do about an export whose pricing went stale after it was made (re-price, a new version, a new export). */
export interface StaleExportStep {
  readonly id: 'reprice' | 'version' | 'export';
  readonly text: string;
}

/**
 * The three steps that replace an export whose pricing went stale after it was made, built from each stale line's own
 * cause (never the version's most severe one alone): re-price ("done already" only when every stale line was priced
 * again by an accepted re-run or a later run of its period; otherwise the lines each cause leaves not priced again,
 * whose period a billing manager re-runs under what is in force now), a new version on the pricing in effect (nothing
 * refreshes a case on new pricing yet, so the stale lines are written off on the case page and leave this dispute; when
 * every line of the version is stale there is no line left to write one from, and writing them all off closes the
 * case), and a new export, which a reimbursement reviewer attests. A stale line never becomes current again, so waiting
 * changes nothing. An export that already went to the payer is logged first (STALE_EXPORT_REVIEW.ifSent, said before
 * these steps).
 */
export function staleExportSteps(pricing: StalePricing, versionLines: number): readonly StaleExportStep[] {
  const causes = staleCauses(pricing);
  const pricedAgain = causes.filter(({ cause }) => cause === 'PRICING_NOT_IN_EFFECT').flatMap(({ rows }) => rows);
  const notYet = causes.filter((entry): entry is { readonly cause: Exclude<PricingCheckCause, 'PRICING_NOT_IN_EFFECT'>; readonly rows: readonly number[] } => entry.cause !== 'PRICING_NOT_IN_EFFECT');
  const staleRows = causes.flatMap(({ rows }) => rows);
  const allStale = everyLineStale(pricing, versionLines);
  const notYetRows = notYet.flatMap(({ rows }) => rows);
  // Each cause that leaves lines not priced again, with its rows ("row 2 (rule release withdrawn) and rows 3 and 4 (plan
  // mapping corrected)"); without rows (no line listed) the stale lines with the version's cause.
  const notYetText =
    notYetRows.length === 0
      ? `the stale lines (${notYet.map(({ cause }) => NOT_PRICED_AGAIN_TEXT[cause]).join(' and ')})`
      : notYet.map(({ cause, rows }) => `${rowsText(rows)} (${NOT_PRICED_AGAIN_TEXT[cause]})`).join(' and ');
  const one = notYetRows.length === 1;
  const reprice =
    notYet.length === 0
      ? 'Re-price: done already. Every stale line was priced again by an accepted re-run or a later run of its period; Pricing now shows their figures now.'
      : `Re-price: ${notYetText} ${one ? 'is' : 'are'} not priced again yet: a billing manager re-runs ${one ? 'its' : 'their'} period under the release, mapping and contract version in force now and accepts the re-run; Pricing now shows the figures once it is accepted.${
          pricedAgain.length === 0 ? '' : ` ${capitalized(rowsText(pricedAgain))} ${pricedAgain.length === 1 ? 'was' : 'were'} priced again already.`
        }`;
  return [
    { id: 'reprice', text: reprice },
    {
      id: 'version',
      text: allStale
        ? 'A new version: not yet. Every line of this version is stale and refreshing a case on new pricing is not available yet, so no line is left to write a new version from. Writing every line off closes the case, and a closed case takes no submission and no new version.'
        : `A new version: refreshing a case on new pricing is not available yet, so the practice writes the stale lines${staleRows.length === 0 ? '' : ` (${rowsText(staleRows)})`} off on the case page (they leave this dispute) and writes and approves a new version of the packet on the lines left, on the pricing in effect.`,
    },
    {
      id: 'export',
      text: allStale
        ? 'A new export: once a new version can be written, it is exported, and a reimbursement reviewer reviews and attests that export before the practice sends it.'
        : 'A new export: the new version is exported, and a reimbursement reviewer reviews and attests that export before the practice sends it.',
    },
  ];
}

/** Whether every line of a version is stale (so no new version can be written from it until a case can be refreshed). */
export function everyLineStale(pricing: StalePricing, versionLines: number): boolean {
  return versionLines > 0 && staleCauses(pricing).flatMap(({ rows }) => rows).length >= versionLines;
}

/**
 * The review page's words for an export whose pricing went stale after it was made: why the attestation is refused,
 * by each stale line's cause; what the practice logs first if the export already went to the payer, said before the
 * steps (writing a line off or a new version changes what can be logged); and what to do instead.
 */
export const STALE_EXPORT_REVIEW = {
  title: 'Not attested: this export’s pricing went stale after the export',
  why: (pricing: StalePricing) =>
    `${causesText(pricing)}. Its files no longer show the pricing in effect, so the attestation is refused, here and in the database, and stays refused: a stale line never becomes current again, so this export is never attested.`,
  whatToDo: 'What to do instead:',
  ifSent:
    'If the practice already sent this export to the payer, a billing manager logs that submission first, on its submissions page, as it happened, before any step below: once every line of the case is written off the case is closed and takes no submission, and once a new version is written the export is logged only if it went before that day. It is recorded unattested, sent without sign-off: pricing went stale after export, flagged with the cause, and reconciliation tracks the payer’s answer.',
  sent: (submittedOn: string) =>
    `The practice logged this export’s submission of ${submittedOn} as sent without sign-off: pricing went stale after export. This version is never attested; reconciliation tracks the payer’s answer to it.`,
  /** The disabled attest button's reason. */
  button: 'Not attested: its pricing went stale after the export, so this export is never attested. Its replacement, a new version’s export, is the one to attest.',
} as const;

/**
 * The packet builder's line for an export whose pricing went stale after it was made, where it would otherwise wait for
 * the attestation: an export already sent is logged first, then what replaces it (none yet when every line is stale).
 */
export function staleExportBuilder(allStale: boolean): string {
  return `Never attested: this export’s pricing went stale after the export. If it already went to the payer, log it first, on the submissions page, as sent without sign-off, before any line is written off or a new version is written. If it has not, do not send it: ${
    allStale
      ? 'every line is stale, and no new version can be written until refreshing a case on new pricing is available.'
      : 'the stale lines are re-priced, and a new version is written, approved and exported on the pricing in effect.'
  }`;
}

/**
 * The submissions page's words for logging an export whose pricing went stale after it was made, never attested: an
 * export already sent is logged first, before any line is written off or a new version is written.
 */
export const STALE_EXPORT_SUBMISSION = {
  title: 'This export is never attested: its pricing went stale after the export',
  why: (pricing: StalePricing) =>
    `${causesText(pricing)}. The reimbursement reviewer cannot attest an export whose pricing is no longer current, so this one never will be.`,
  sent:
    'If it already went to the payer, log it here first, as it happened, before any line is written off or a new version is written: once every line is written off the case is closed and takes no submission. It is recorded as sent without sign-off: pricing went stale after export, unattested with that reason and flagged with the cause, and reconciliation tracks the payer’s answer as it does for any submission.',
  notSent: (allStale: boolean) =>
    allStale
      ? 'If it has not gone to the payer, do not send it: every line is stale, and no new version can be written until refreshing a case on new pricing is available.'
      : 'If it has not gone to the payer, do not send it: the stale lines are re-priced, a new version is written and approved on the pricing in effect, and its new export is attested before it is sent.',
  confirm: 'This export went to the payer without the reimbursement reviewer’s sign-off, after its pricing went stale. Log it as sent without sign-off.',
  submit: 'Log the submission sent without sign-off',
  /** The refusal when the confirmation is not given. */
  confirmRequired: 'confirm that this export went to the payer without the reimbursement reviewer’s sign-off; it is logged as sent without sign-off',
  /** The notice once it is logged. */
  logged:
    'The submission is logged as sent without sign-off: pricing went stale after export. It is recorded unattested with that reason and flagged with the cause, its packet version is never attested, and reconciliation tracks the payer’s answer to it.',
} as const;

/**
 * The submissions page's words for a case closed written off, in place of the form (the database refuses a submission
 * on it): how an export that already went to the payer is logged.
 */
export const CLOSED_CASE_SUBMISSION =
  'This case is closed written off: every line was written off, so no submission is logged on it. If an export of it already went to the payer, reopen a line on the case page with the reason, then log the submission here.';

/** The submissions page's words for an export an edit replaced, which is logged only if it went to the payer before that day. */
export const EARLIER_EXPORT_SUBMISSION = {
  title: (versionNo: number, replacedOn: string) => `Version ${String(versionNo)}’s export, replaced by a new version on ${replacedOn}`,
  description: (replacedOn: string) => `If this export went to the payer before ${replacedOn}, log it here as it happened. An edit clears the approval, so it is logged only as sent before that day.`,
} as const;

/** The reviewer's list of exports for one whose pricing went stale after it was made: never attested, listed apart. */
export const NEVER_ATTESTED_LIST = {
  title: 'Exports never attested',
  mark: 'Never attested: pricing went stale after the export',
  description:
    'Their pricing went stale after the export, so none of them is attested: there is nothing here to attest. Each stays listed until the practice logs it as sent without sign-off, if it already went to the payer, or replaces it with a new version, whose export is listed above once it is made.',
  emptyWithNever: 'An exported packet appears here until it is attested. The exports listed below are never attested.',
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
