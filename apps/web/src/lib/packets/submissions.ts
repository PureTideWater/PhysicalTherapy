import { type KeyProvider, PRICING_CHECK_RESULTS, type PracticeScope, type PricingCheckResult, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import { type Cents, centsToString } from '@tp/money';
import { FOLLOW_UP_DAYS, type PacketContent, type PayerResponseKind, type SubmissionChannel, addDays, packetReference } from '@tp/packets';
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
 * payer's answer is recorded with its letter; a denial with a reason may reopen the case for the next
 * dispute level within its window, which the database computes. Recording a response writes no ledger
 * entry and moves no line (LED-01): the recovery ledger does both from the response and the remittances.
 * Each is recorded once: the same submission or response again records nothing.
 *
 * A response's letter is a case's evidence, never a contract's source (docs/adr/0085, D4): a top-level payer letter
 * or other document, scanned clean and stored, that no contract version names (RESPONSE_DOCUMENT), checked under the
 * document's lock, which the tagging handlers take too, so a tag of the same letter cannot pass beside it. The
 * letters are read audited: a payer's letter is about a patient.
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
  /** Null for a response the recovery ledger recorded from a reprocessed remittance. */
  readonly documentId: string | null;
  /** The letter it names, as its receipt names it; null when it names none. */
  readonly document: ResponseDocument | null;
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
  /** The packet's reference the export printed and a payer quotes back (from the version's approved SHA-256; audit item #37 part 1). */
  readonly packetReference: string | null;
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
async function submissionPricing(
  scope: Scope,
  input: { readonly practiceId: string; readonly caseId: string },
): Promise<ReadonlyMap<string, { readonly check: PricingCheckResult | null; readonly content: PacketContent; readonly packetReference: string | null }>> {
  const { rows } = await scope.client.query<{ id: string; pricing_check: string | null; content: PacketContent; approved_sha256: string | null }>(
    `SELECT s.id, s.pricing_check, v.content, v.approved_sha256 FROM submission s JOIN packet_version v ON v.id = s.packet_version_id AND v.practice_id = s.practice_id
      WHERE s.case_id = $1 AND s.practice_id = $2`,
    [input.caseId, input.practiceId],
  );
  return new Map(
    rows.map((row) => [
      row.id,
      // A value the CHECK does not hold cannot be stored; anything else unexpected reads as not current.
      {
        check: row.pricing_check === null ? null : PRICING_RESULTS.has(row.pricing_check) ? (row.pricing_check as PricingCheckResult) : 'PRICING_NOT_IN_EFFECT',
        content: row.content,
        packetReference: row.approved_sha256 === null ? null : packetReference(row.approved_sha256),
      },
    ]),
  );
}

/**
 * The case's submission log, newest first, with each submission's follow-up state on `asOf` and its pricing flag, and
 * each response's letter as its receipt names it (UX-007: the letters are listed on the submissions page).
 */
export async function submissionsOf(scope: Scope, keys: KeyProvider, input: { readonly practiceId: string; readonly caseId: string; readonly readsPhi: boolean; readonly asOf: string; readonly requestId: string }): Promise<SubmissionView[]> {
  const log = await submissionLog(scope, keys, { practiceId: input.practiceId, caseId: input.caseId, requestId: input.requestId });
  const emails = await peopleEmails(scope, input.practiceId, log.map((entry) => entry.submittedBy));
  const checks = await submissionPricing(scope, input);
  const letters = await documentsNamed(scope, {
    practiceId: input.practiceId,
    ids: log.flatMap((entry) => entry.responses.flatMap((response) => (response.documentId === null ? [] : [response.documentId]))),
    requestId: input.requestId,
  });
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
    packetReference: checks.get(entry.submissionId)?.packetReference ?? null,
    responses: entry.responses.map((response) => ({
      responseId: response.responseId,
      kind: response.kind,
      amountCents: response.amountCents === null ? null : centsToString(response.amountCents),
      receivedOn: response.receivedOn,
      denialCategory: response.denialCategory,
      reopensCase: response.reopensCase,
      nextWindowEndsOn: response.nextWindowEndsOn,
      documentId: response.documentId,
      document: response.documentId === null ? null : (letters.get(response.documentId) ?? null),
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
  /** The packet's reference its export printed (audit item #37 part 1). */
  readonly packetReference: string | null;
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
  /** How many lines the version has (when every one is stale, no new version can be written from it yet). */
  readonly versionLines: number;
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
    approved_sha256: string | null;
  }>(
    `SELECT v.id, v.version_no, v.dispute_level, (v.exported_at AT TIME ZONE 'UTC')::date::text AS exported_on, v.export_sha256, v.export_csv_sha256, v.attested_at, v.content, v.approved_sha256
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
        packetReference: row.approved_sha256 === null ? null : packetReference(row.approved_sha256),
        attestedAt: row.attested_at?.toISOString() ?? null,
        pricing: await pricingNow(scope, { practiceId: input.practiceId, content: row.content, requestId: input.requestId }),
        unattestedReason: row.attested_at === null ? await packetVersionUnattestedReason(scope.client, { practiceId: input.practiceId, versionId: row.id }) : null,
        versionLines: row.content.lines.length,
      };
}

/** An export an edit replaced that may still be logged, as sent before the edit (CAS-13). */
export interface EarlierExport {
  readonly versionId: string;
  readonly versionNo: number;
  readonly disputeLevel: number;
  readonly exportedOn: string;
  /** The day the next version was written (UTC): the export is logged only as sent before it. */
  readonly replacedOn: string;
  /** The last day it may be logged as sent (the day before replacedOn). */
  readonly lastDay: string;
  readonly exportSha256: string;
  readonly exportCsvSha256: string;
  readonly packetReference: string | null;
  readonly attested: boolean;
  /** 'pricing_stale_after_export' when it is never attested and is logged sent without sign-off; null when attested. */
  readonly unattestedReason: SubmissionUnattestedReason | null;
}

/** How many replaced exports the page offers at most, newest first. */
export const EARLIER_EXPORTS_LISTED = 5;

/**
 * The exports an edit replaced that a submission may still send (submission_belongs: a replaced version is logged only
 * when it went to the payer before the next version was written): exported at least a day before that, not logged yet,
 * either attested or never attested because its pricing went stale after the export (logged sent without sign-off), and
 * dated no later than the case's latest submission allows; newest first. So an export that went to the payer is still
 * logged after the stale lines were written off and a new version written (the founder's ruling of 2026-10-20). The
 * database decides again as it is logged.
 */
export async function earlierExports(scope: Scope, input: { readonly practiceId: string; readonly caseId: string }): Promise<readonly EarlierExport[]> {
  const { rows } = await scope.client.query<{
    id: string;
    version_no: number;
    dispute_level: number;
    exported_on: string;
    replaced_on: string;
    last_day: string;
    export_sha256: string;
    export_csv_sha256: string;
    approved_sha256: string | null;
    attested: boolean;
    unattested_reason: string | null;
  }>(
    `SELECT v.id, v.version_no, v.dispute_level, (v.exported_at AT TIME ZONE 'UTC')::date::text AS exported_on,
            (n.created_at AT TIME ZONE 'UTC')::date::text AS replaced_on, ((n.created_at AT TIME ZONE 'UTC')::date - 1)::text AS last_day,
            v.export_sha256, v.export_csv_sha256, v.approved_sha256, v.attested_by IS NOT NULL AS attested,
            CASE WHEN v.attested_by IS NULL THEN packet_version_unattested_reason(v.id) END AS unattested_reason
       FROM packet p
       JOIN packet_version v ON v.packet_id = p.id AND v.practice_id = p.practice_id AND v.id <> p.current_version_id
       JOIN packet_version n ON n.packet_id = v.packet_id AND n.version_no = v.version_no + 1
      WHERE p.case_id = $1 AND p.practice_id = $2 AND v.exported_at IS NOT NULL
        AND (v.exported_at AT TIME ZONE 'UTC')::date < (n.created_at AT TIME ZONE 'UTC')::date
        AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.packet_version_id = v.id AND s.practice_id = v.practice_id)
        AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.case_id = p.case_id AND s.practice_id = p.practice_id AND s.submitted_on >= (n.created_at AT TIME ZONE 'UTC')::date)
      ORDER BY v.version_no DESC
      LIMIT ${String(EARLIER_EXPORTS_LISTED)}`,
    [input.caseId, input.practiceId],
  );
  return rows.flatMap((row) => {
    const reason = row.unattested_reason === null ? null : submissionSentOf(row.unattested_reason);
    if (!row.attested && reason?.kind !== 'unattested') {
      return [];
    }
    return [
      {
        versionId: row.id,
        versionNo: row.version_no,
        disputeLevel: row.dispute_level,
        exportedOn: row.exported_on,
        replacedOn: row.replaced_on,
        lastDay: row.last_day,
        exportSha256: row.export_sha256,
        exportCsvSha256: row.export_csv_sha256,
        packetReference: row.approved_sha256 === null ? null : packetReference(row.approved_sha256),
        attested: row.attested,
        unattestedReason: reason?.kind === 'unattested' ? reason.reason : null,
      },
    ];
  });
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

/**
 * The letters a response may carry, in three groups, each newest first (docs/adr/0085, D3): another case's letter,
 * about another patient, is offered only in its own last group, so choosing it is deliberate.
 */
export interface ResponseLetters {
  /** No payer response names them yet. */
  readonly unused: readonly ResponseDocument[];
  /** A response to a submission of this case names them. */
  readonly thisCase: readonly ResponseDocument[];
  /** Only responses of other cases name them. */
  readonly otherCases: readonly ResponseDocument[];
}

/** How many letters the response form lists at most, over its three groups. */
export const RESPONSE_LETTERS_LISTED = 50;

/**
 * A document a payer response may carry (alias d): top-level (no zip's entry), a payer letter or other document,
 * scanned clean and stored (so never one still in intake, a duplicate, an expanded zip or one held), and no contract
 * version's source. A response never changes, so it never points at evidence intake may still hold, and a document
 * is a case's evidence or a contract's source, never both. The list and the handler read this one predicate.
 */
const RESPONSE_DOCUMENT = `d.parent_document_id IS NULL AND d.kind IN ('payer_letter', 'other') AND d.scan_status = 'clean' AND d.status = 'stored'
  AND NOT EXISTS (SELECT 1 FROM contract_version v WHERE v.practice_id = d.practice_id AND d.id = ANY (v.source_document_ids))`;

/**
 * The document's transaction lock, taken first by every handler that makes a document a response's evidence or a
 * contract's source (this one and lib/contracts/tagging.ts's), before its check: the check after it sees the other's
 * commit, so a tag and a response of the same letter cannot both pass.
 */
const DOCUMENT_USE_LOCK = "SELECT pg_advisory_xact_lock(hashtextextended('document_use:' || $1::text, 0))";

type LetterGroup = 'unused' | 'this_case' | 'other_cases';

interface LetterRow {
  readonly id: string;
  readonly practice_id: string;
  readonly kind: string;
  readonly created_at: Date;
  readonly sha256: string | null;
}

const letterOf = (row: LetterRow): ResponseDocument => ({ id: row.id, kind: row.kind, uploadedAt: row.created_at.toISOString(), sha256: row.sha256 });

/**
 * The letters a response to this case may carry (RESPONSE_DOCUMENT), grouped: those no response names first, then
 * those this case's responses name, then those only other cases' responses name (a payer answering two cases in one
 * letter); newest first in each, one limit over all three, so other cases' letters only fill the room left. An
 * audited read.
 */
export async function responseDocuments(scope: Scope, input: { readonly practiceId: string; readonly caseId: string; readonly requestId: string }): Promise<ResponseLetters> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'source_document', purpose: 'case_review', requestId: input.requestId },
    async (client) =>
      (
        await client.query<LetterRow & { letter_group: LetterGroup }>(
          `SELECT d.id, d.practice_id, d.kind, d.created_at, d.sha256, g.letter_group
             FROM source_document d
             CROSS JOIN LATERAL (
               SELECT CASE
                        WHEN EXISTS (SELECT 1 FROM payer_response r JOIN submission s ON s.id = r.submission_id AND s.practice_id = r.practice_id
                                      WHERE r.practice_id = d.practice_id AND r.document_id = d.id AND s.case_id = $2) THEN 'this_case'
                        WHEN EXISTS (SELECT 1 FROM payer_response r WHERE r.practice_id = d.practice_id AND r.document_id = d.id) THEN 'other_cases'
                        ELSE 'unused'
                      END AS letter_group
             ) g
            WHERE d.practice_id = $1 AND ${RESPONSE_DOCUMENT}
            ORDER BY array_position(ARRAY['unused', 'this_case', 'other_cases'], g.letter_group), d.created_at DESC, d.id
            LIMIT ${String(RESPONSE_LETTERS_LISTED)}`,
          [input.practiceId, input.caseId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  const of = (group: LetterGroup) => rows.filter((row) => row.letter_group === group).map(letterOf);
  return { unused: of('unused'), thisCase: of('this_case'), otherCases: of('other_cases') };
}

/**
 * Whether a response may carry the document (RESPONSE_DOCUMENT, in the practice): checked by the handler before the
 * response is recorded, under the document's lock (DOCUMENT_USE_LOCK), in the transaction that records it. Another
 * practice's document, which the policies hide, reads as one that does not exist.
 */
export async function responseDocumentChoosable(scope: Scope, practiceId: string, documentId: string): Promise<boolean> {
  await scope.client.query(DOCUMENT_USE_LOCK, [documentId]);
  const { rowCount } = await scope.client.query(`SELECT 1 FROM source_document d WHERE d.id = $1 AND d.practice_id = $2 AND ${RESPONSE_DOCUMENT}`, [documentId, practiceId]);
  return rowCount === 1;
}

/** The documents the case's responses name, by ID, as their receipts name them (an audited read). */
async function documentsNamed(scope: Scope, input: { readonly practiceId: string; readonly ids: readonly string[]; readonly requestId: string }): Promise<ReadonlyMap<string, ResponseDocument>> {
  const ids = [...new Set(input.ids)];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await readWithAudit(
    scope,
    { objectType: 'source_document', purpose: 'case_review', requestId: input.requestId },
    async (client) =>
      (await client.query<LetterRow>('SELECT d.id, d.practice_id, d.kind, d.created_at, d.sha256 FROM source_document d WHERE d.practice_id = $1 AND d.id = ANY ($2::uuid[])', [input.practiceId, ids])).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return new Map(rows.map((row) => [row.id, letterOf(row)]));
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
