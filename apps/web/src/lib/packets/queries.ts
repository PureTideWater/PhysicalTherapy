import { type PracticeScope, type ScopeClient, loadPracticeCipher } from '@tp/db/runtime';
import { type PacketContent, VERIFIER_FORMAT, type VerifierReport, draftNarrative } from '@tp/packets';
import type { DeadlineStatus } from '@tp/triage';
import {
  type ExportReadiness,
  type ExportReadinessReason,
  type PacketAttestation,
  type PacketExportFile,
  type PacketVersionDetail,
  approvePacketVersion,
  downloadPacketExport,
  exportReadiness,
  packetOfCase,
  packetVersionOf,
  writePacketVersion,
} from '@tp/worker/packets';

import type { Services } from '../server/services';
import type { JobQueue } from '../uploads/queue';
import { peopleEmails } from '../cases/people';
import { NotFoundError } from '../http/route';
import { type ApprovalState, type BlockedReason, approvalState } from './approval';
import { type ExportAttempt, exportAttempt } from './export-attempts';
import { PRICING_BLOCKED_TEXT, type PricingNowView, pricingNow } from './pricing';

export { DEADLINE_NOT_EXPORTABLE, OUTDATED_NOT_EXPORTABLE, STALE_LEVEL_NOT_EXPORTABLE } from './export-attempts';

/**
 * The packet builder's reads and steps (PRD 7, Packet builder: "citation, line table, traces, narrative
 * editor with verifier results, interest, evidence list, approval panel, export history"; "edit,
 * request approval, approve (second person), export"; PRD 12; test matrix CAS-08 to CAS-13; docs/adr/0041
 * and 0044), over @tp/worker/packets, which assembles, verifies and writes every version and asks the
 * database for every approval. A version's identifiers are placeholders on screen; only the export
 * job inserts them, into the PDF and CSV. Each step is made once: saving the text a current version
 * already holds writes nothing, approving an approved version and exporting an exported one do
 * nothing.
 *
 * CO-05 (docs/adr/0061): the builder shows each line's deadline and its status, and the version's; the
 * export is asked for only when the database, deriving the deadline again now, says it is not
 * unverified. D16: once exported, a reimbursement reviewer attests the export over its two SHA-256 on
 * the review page; a submission is logged only after that.
 *
 * The best-option audit's items #4 and #26 (the founder's ruling of 2026-10-18): the version shown carries its
 * pricing now (pricingNow(): the stale lines with their figures then and now), its export readiness (the one
 * @tp/worker/packets exportReadiness() the export action and the job ask too, every reason with its fix) and
 * the latest attempt at its export (exportAttempt()); approval is blocked ahead while its pricing is not current.
 */

type Scope = PracticeScope<ScopeClient>;

/** One version in the packet's history, newest first. */
export interface VersionSummary {
  readonly id: string;
  readonly versionNo: number;
  readonly current: boolean;
  readonly writtenAt: string;
  readonly writtenBy: string | null;
  readonly verifierPassed: boolean;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly approvedAlone: boolean;
  readonly exportedAt: string | null;
  readonly exportSha256: string | null;
  readonly exportCsvSha256: string | null;
  /** The deadline status the version stated when it was written (tp-packet/1: unverified). */
  readonly deadlineStatus: DeadlineStatus;
  readonly attestedAt: string | null;
}

export interface VersionView {
  readonly id: string;
  readonly packetId: string;
  readonly versionNo: number;
  readonly current: boolean;
  readonly content: PacketContent;
  /** The person's words with identifier placeholders (never identifiers). */
  readonly narrative: string;
  /** The hash an approval names. */
  readonly contentSha256: string;
  readonly verifier: VerifierReport;
  readonly writtenAt: string;
  readonly writtenBy: string | null;
  readonly regulationConfirmed: boolean;
  /** Who confirmed the regulation applies (a contract specialist) and when; null until then, and for a contract citation. */
  readonly regulationConfirmation: { readonly by: string | null; readonly at: string } | null;
  readonly exportedAt: string | null;
  readonly exportSha256: string | null;
  readonly exportCsvSha256: string | null;
  /** The documents the person attached to its evidence list. */
  readonly attachedDocumentIds: readonly string[];
  /** The deadline status the version stated when it was written. */
  readonly deadlineStatus: DeadlineStatus;
  /** The deadline status the database derives now (what the export is held to; CO-05). */
  readonly deadlineNow: DeadlineStatus;
  /** Whether the version is of the case's dispute level now: one written before a denial reopened the case is not exported. */
  readonly atCaseLevel: boolean;
  /** The verifier's report over what the export printed, once exported. */
  readonly exportVerifier: VerifierReport | null;
  /** The reimbursement reviewer's attestation over the export (D16), once made. */
  readonly attestation: { readonly by: string | null; readonly at: string; readonly checklist: PacketAttestation['checklist'] } | null;
  /** Whether its pricing is still current, with the stale lines' figures then and now (audit item #4). */
  readonly pricingNow: PricingNowView;
  /** Whether it can be exported today, and every reason it cannot (audit item #26): what the export action and the job say. */
  readonly exportReadiness: ExportReadiness;
  /** The latest attempt at its export since the latest request (audit item #26). */
  readonly exportAttempt: ExportAttempt;
}

export interface ApprovalRequest {
  readonly at: string;
  readonly by: string | null;
  /** The request's words, for the roles that read PHI. */
  readonly message: string | null;
}

export interface AttachableDocument {
  readonly id: string;
  readonly kind: string;
  readonly uploadedAt: string;
  readonly sha256: string | null;
}

export interface BuilderView {
  readonly packetId: string | null;
  readonly versions: readonly VersionSummary[];
  /** The version shown: the one asked for, else the current one; null before the first. */
  readonly version: VersionView | null;
  readonly approval: ApprovalState | null;
  readonly approvalRequest: ApprovalRequest | null;
  readonly promptPayStates: readonly string[];
  readonly attachable: readonly AttachableDocument[];
}

interface HistoryRow {
  readonly id: string;
  readonly version_no: number;
  readonly current: boolean;
  readonly created_at: Date;
  readonly drafted_by: string;
  readonly verifier_passed: boolean;
  readonly approved_at: Date | null;
  readonly approved_by: string | null;
  readonly approved_alone: boolean;
  readonly exported_at: Date | null;
  readonly export_sha256: string | null;
  readonly export_csv_sha256: string | null;
  readonly deadline_verification_status: DeadlineStatus;
  readonly attested_at: Date | null;
}

/** The case's packet's versions, newest first (codes, dates and hashes; no narrative). */
async function history(scope: Scope, practiceId: string, packetId: string): Promise<{ rows: HistoryRow[]; drafterId: string | null }> {
  const { rows } = await scope.client.query<HistoryRow>(
    `SELECT v.id, v.version_no, p.current_version_id = v.id AS current, v.created_at, v.drafted_by, v.verifier_passed, v.approved_at, v.approved_by, v.approved_alone,
            v.exported_at, v.export_sha256, v.export_csv_sha256, v.deadline_verification_status, v.attested_at
       FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE v.packet_id = $1 AND v.practice_id = $2 ORDER BY v.version_no DESC`,
    [packetId, practiceId],
  );
  return { rows, drafterId: rows.find((row) => row.version_no === 1)?.drafted_by ?? null };
}

/** The documents a person may attach to a packet's evidence list: the practice's clean letters, contracts and other documents. */
async function attachable(scope: Scope, practiceId: string): Promise<AttachableDocument[]> {
  const { rows } = await scope.client.query<{ id: string; kind: string; created_at: Date; sha256: string | null }>(
    `SELECT id, kind, created_at, sha256 FROM source_document
      WHERE practice_id = $1 AND parent_document_id IS NULL AND scan_status = 'clean' AND kind IN ('payer_letter', 'other', 'contract', 'exhibit')
      ORDER BY created_at DESC, id LIMIT 50`,
    [practiceId],
  );
  return rows.map((row) => ({ id: row.id, kind: row.kind, uploadedAt: row.created_at.toISOString(), sha256: row.sha256 }));
}

/** The states whose prompt-pay rules the rule releases hold (the person names the one that applies; PRD 12: interest where a state rule applies). */
async function promptPayStates(scope: Scope): Promise<string[]> {
  const { rows } = await scope.client.query<{ state: string }>("SELECT DISTINCT key ->> 'state' AS state FROM rule_record WHERE record_type = 'state_prompt_pay' AND key ->> 'state' IS NOT NULL ORDER BY 1");
  return rows.map((row) => row.state);
}

function attachedOf(content: PacketContent): string[] {
  return content.evidence.filter((item) => item.kind === 'attached_document' && item.document_id !== null).map((item) => item.document_id as string);
}

/** The deadline status the database derives now for a version's content (CO-05: what the export is held to). */
export async function deadlineNow(scope: Scope, caseId: string, content: PacketContent): Promise<DeadlineStatus> {
  const { rows } = await scope.client.query<{ status: DeadlineStatus }>('SELECT packet_version_deadline_status($1, $2::jsonb) AS status', [caseId, JSON.stringify(content)]);
  return rows[0]?.status ?? 'unverified';
}

/** Whether a version's dispute level is the case's now (1 + its reopened denials), as the export and the attestation require. */
export async function atCaseLevel(scope: Scope, caseId: string, content: PacketContent): Promise<boolean> {
  const { rows } = await scope.client.query<{ level: number }>('SELECT 1 + case_reopened_levels($1) AS level', [caseId]);
  return rows[0]?.level === content.dispute_level;
}

interface VersionChecks {
  readonly deadlineNow: DeadlineStatus;
  readonly atCaseLevel: boolean;
  readonly pricingNow: PricingNowView;
  readonly exportReadiness: ExportReadiness;
  readonly exportAttempt: ExportAttempt;
}

function versionView(detail: PacketVersionDetail, writtenBy: string | null, attestedBy: string | null, checks: VersionChecks): VersionView {
  return {
    id: detail.versionId,
    packetId: detail.packetId,
    versionNo: detail.versionNo,
    current: detail.current,
    content: detail.content,
    narrative: detail.narrative,
    contentSha256: detail.contentSha256,
    verifier: detail.verifier,
    writtenAt: detail.createdAt.toISOString(),
    writtenBy,
    regulationConfirmed: detail.regulationConfirmedBy !== null,
    regulationConfirmation: detail.regulationConfirmedAt === null ? null : { by: detail.regulationConfirmedByEmail, at: detail.regulationConfirmedAt.toISOString() },
    exportedAt: detail.exportedAt?.toISOString() ?? null,
    exportSha256: detail.exportSha256,
    exportCsvSha256: detail.exportCsvSha256,
    attachedDocumentIds: attachedOf(detail.content),
    deadlineStatus: detail.deadlineStatus,
    exportVerifier: detail.exportVerifier,
    attestation: detail.attestedAt === null || detail.attestation === null ? null : { by: attestedBy, at: detail.attestedAt.toISOString(), checklist: detail.attestation.checklist },
    ...checks,
  };
}

/** The builder: the case's packet, its versions, the version shown with its approval panel for the viewer. */
export async function builderView(
  scope: Scope,
  services: Pick<Services, 'keys'>,
  input: { readonly practiceId: string; readonly caseId: string; readonly versionId?: string; readonly viewerId: string; readonly approves: boolean; readonly readsPhi: boolean; readonly requestId: string; readonly now: Date },
): Promise<BuilderView | undefined> {
  const found = await packetOfCase(scope, { practiceId: input.practiceId, caseId: input.caseId });
  if (found === undefined) {
    return undefined;
  }
  const common = { promptPayStates: await promptPayStates(scope), attachable: await attachable(scope, input.practiceId) };
  if (found.packetId === null) {
    if (input.versionId !== undefined) {
      throw new NotFoundError();
    }
    return { packetId: null, versions: [], version: null, approval: null, approvalRequest: null, ...common };
  }
  const { rows, drafterId } = await history(scope, input.practiceId, found.packetId);
  const shownId = input.versionId ?? found.currentVersionId;
  const shown = rows.find((row) => row.id === shownId);
  if (shown === undefined) {
    throw new NotFoundError();
  }
  const detail = await packetVersionOf(scope, services.keys, { practiceId: input.practiceId, versionId: shown.id, requestId: input.requestId, purpose: 'packet_build' });
  if (detail === undefined) {
    throw new NotFoundError();
  }
  const { rows: requests } = await scope.client.query<{ created_at: Date; created_by: string; body: string | null }>(
    "SELECT created_at, created_by, body FROM case_activity WHERE practice_id = $1 AND kind = 'approval_requested' AND packet_version_id = $2 ORDER BY created_at DESC LIMIT 1",
    [input.practiceId, shown.id],
  );
  const emails = await peopleEmails(scope, input.practiceId, [...rows.flatMap((row) => [row.drafted_by, row.approved_by]), ...requests.map((row) => row.created_by)]);
  const person = (id: string | null) => (id === null ? null : (emails.get(id) ?? 'a former member of the practice'));
  const { rows: facts } = await scope.client.query<{ matches: boolean; others: boolean }>(
    'SELECT packet_version_matches_case($1, v.content) AS matches, practice_has_other_packet_approver($2, app_actor_id()) AS others FROM packet_version v WHERE v.id = $3',
    [input.caseId, input.practiceId, shown.id],
  );
  const pricing = await pricingNow(scope, { practiceId: input.practiceId, content: detail.content, requestId: input.requestId });
  const readiness = await exportReadiness(scope.client, { practiceId: input.practiceId, versionId: shown.id, asOf: input.now.toISOString().slice(0, 10) });
  if (readiness === undefined) {
    throw new NotFoundError();
  }
  const approval = approvalState(
    {
      verifierPassed: shown.verifier_passed,
      verifierCurrent: detail.verifier.format === VERIFIER_FORMAT,
      current: shown.current,
      matchesCase: facts[0]?.matches ?? false,
      pricingCurrent: pricing.status === 'current',
      regulationCitation: detail.content.citation.kind === 'regulation',
      regulationConfirmed: detail.regulationConfirmedBy !== null,
      approvedAt: shown.approved_at?.toISOString() ?? null,
      approvedBy: person(shown.approved_by),
      approvedAlone: shown.approved_alone,
      writtenAt: shown.created_at.toISOString(),
      writerId: shown.drafted_by,
      drafterId: drafterId ?? shown.drafted_by,
    },
    { userId: input.viewerId, approves: input.approves, othersApprove: facts[0]?.others ?? true },
    input.now,
  );
  const request = requests[0];
  const cipher = request?.body === null || request?.body === undefined || !input.readsPhi ? null : await loadPracticeCipher(scope, services.keys, input.practiceId);
  return {
    packetId: found.packetId,
    versions: rows.map((row) => ({
      id: row.id,
      versionNo: row.version_no,
      current: row.current,
      writtenAt: row.created_at.toISOString(),
      writtenBy: person(row.drafted_by),
      verifierPassed: row.verifier_passed,
      approvedAt: row.approved_at?.toISOString() ?? null,
      approvedBy: person(row.approved_by),
      approvedAlone: row.approved_alone,
      exportedAt: row.exported_at?.toISOString() ?? null,
      exportSha256: row.export_sha256,
      exportCsvSha256: row.export_csv_sha256,
      deadlineStatus: row.deadline_verification_status,
      attestedAt: row.attested_at?.toISOString() ?? null,
    })),
    version: versionView(detail, person(shown.drafted_by), await attesterEmail(scope, detail.attestedBy), {
      deadlineNow: await deadlineNow(scope, input.caseId, detail.content),
      atCaseLevel: await atCaseLevel(scope, input.caseId, detail.content),
      pricingNow: pricing,
      exportReadiness: readiness,
      exportAttempt: await exportAttempt(scope, shown.id, input.now),
    }),
    approval,
    approvalRequest: request === undefined ? null : { at: request.created_at.toISOString(), by: person(request.created_by), message: cipher === null || request.body === null ? null : cipher.decrypt('case_activity.body', request.body) },
    ...common,
  };
}

export interface WriteRequest {
  readonly practiceId: string;
  readonly caseId: string;
  readonly basedOnVersionId: string | null;
  /** The person's words; absent for the code-built draft of the pattern statement. */
  readonly narrative: string | undefined;
  readonly promptPayState: string | null;
  readonly attachedDocumentIds: readonly string[];
  readonly requestId: string;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

/**
 * Writes a version (CAS-13: an edit is a new version, which clears the packet's approval), unless the
 * packet's current version already holds exactly what is asked (the same words, the same prompt-pay
 * state and attachments, its lines still the case's): then nothing is written and that version stands.
 */
export async function writeVersionOnce(scope: Scope, services: Pick<Services, 'keys'>, input: WriteRequest): Promise<{ readonly versionId: string; readonly written: boolean }> {
  const found = await packetOfCase(scope, { practiceId: input.practiceId, caseId: input.caseId });
  if (found === undefined) {
    throw new NotFoundError();
  }
  if (found.currentVersionId !== null) {
    const current = await packetVersionOf(scope, services.keys, { practiceId: input.practiceId, versionId: found.currentVersionId, requestId: input.requestId, purpose: 'packet_build' });
    if (current !== undefined) {
      const { rows } = await scope.client.query<{ matches: boolean }>('SELECT packet_version_matches_case($1, $2::jsonb) AS matches', [input.caseId, JSON.stringify(current.content)]);
      const wanted = input.narrative ?? draftNarrative(current.content);
      if (
        rows[0]?.matches === true &&
        wanted === current.narrative &&
        (current.content.interest?.state ?? null) === input.promptPayState &&
        sameSet(attachedOf(current.content), input.attachedDocumentIds)
      ) {
        return { versionId: current.versionId, written: false };
      }
    }
  }
  const written = await writePacketVersion(scope, services.keys, {
    practiceId: input.practiceId,
    caseId: input.caseId,
    basedOnVersionId: input.basedOnVersionId,
    ...(input.narrative === undefined ? {} : { narrative: input.narrative }),
    promptPayState: input.promptPayState,
    attachedDocumentIds: input.attachedDocumentIds,
    requestId: input.requestId,
  });
  return { versionId: written.versionId, written: true };
}

/** A version of the case's packet, as a step finds it; not found when it is not this case's. */
export async function versionOfCase(
  scope: Scope,
  practiceId: string,
  caseId: string,
  versionId: string,
): Promise<{ readonly packetId: string; readonly approved: boolean; readonly current: boolean; readonly exported: boolean; readonly verifierPassed: boolean; readonly contentSha256: string }> {
  const { rows } = await scope.client.query<{ packet_id: string; approved: boolean; current: boolean; exported: boolean; verifier_passed: boolean; content_sha256: string }>(
    `SELECT v.packet_id, v.approved_by IS NOT NULL AS approved, p.current_version_id = v.id AS current, v.exported_at IS NOT NULL AS exported, v.verifier_passed, v.content_sha256
       FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE v.id = $1 AND v.practice_id = $2 AND p.case_id = $3`,
    [versionId, practiceId, caseId],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new NotFoundError();
  }
  return { packetId: row.packet_id, approved: row.approved, current: row.current, exported: row.exported, verifierPassed: row.verifier_passed, contentSha256: row.content_sha256 };
}

/** Approves a version naming its hash, unless it is approved already (then nothing changes). The database decides the rest. */
export async function approveOnce(scope: Scope, input: { readonly practiceId: string; readonly caseId: string; readonly versionId: string; readonly versionSha256: string; readonly requestId: string }): Promise<boolean> {
  const version = await versionOfCase(scope, input.practiceId, input.caseId, input.versionId);
  if (version.approved) {
    return false;
  }
  await approvePacketVersion(scope, { practiceId: input.practiceId, versionId: input.versionId, versionSha256: input.versionSha256, requestId: input.requestId });
  return true;
}

/** Why approval is blocked, in words, with the next step (the approval panel's reason, beside its disabled button). */
export const BLOCKED_TEXT: Readonly<Record<BlockedReason, string>> = {
  verifier: 'Approval is blocked: the verifier failed this version (its mismatches are listed above). Correct the narrative and save a new version; only a version that passes can be approved.',
  verifier_outdated: 'An earlier verifier checked this version. Save it again as a new version so the current verifier checks it; only a version the current verifier passed can be approved.',
  not_current: 'A later version of this packet was written since; only the current version can be approved.',
  case_changed: 'The case’s lines changed since this version was written (a line was written off or reopened); write a new version first.',
  pricing_not_current: PRICING_BLOCKED_TEXT.approval,
  regulation:
    'A contract specialist confirms the Medicare Advantage regulation applies to this case before its packet can be approved: they do it on their Regulations to confirm page, under the practice’s support grant (the platform administrator opens one from a ticket).',
};

/** Why the drafter's Approve button is disabled (CAS-09; audit item #61): someone else approves, and the drafter asks them. */
export const DRAFTER_APPROVAL_TEXT = 'A second person who approves packets approves it; ask with Request approval.';

/** The person who attested an export, by email; null when they are no longer a user. */
async function attesterEmail(scope: Scope, userId: string | null): Promise<string | null> {
  if (userId === null) {
    return null;
  }
  const { rows } = await scope.client.query<{ email: string }>('SELECT email FROM "user" WHERE id = $1', [userId]);
  return rows[0]?.email ?? null;
}

/** What an export request came to: queued, exported already, or refused before anything was queued with every reason. */
export type ExportRequestOutcome =
  | { readonly outcome: 'queued' }
  | { readonly outcome: 'exported' }
  | { readonly outcome: 'refused'; readonly reasons: readonly [ExportReadinessReason, ...ExportReadinessReason[]] };

/**
 * Asks the worker to print a version's export (the packet_export job: the PDF and the CSV schedule, the
 * identifiers inserted, stored sealed, their SHA-256 recorded on the version; CAS-11, CAS-12). A version
 * exported already is left as it is ('exported'). Anything the job would refuse is refused here first, before
 * anything is queued, with every reason that holds (@tp/worker/packets exportReadiness(), which the job asks
 * again; audit item #26): not approved, not current, a tp-packet/1 version, the case changed or closed, an
 * earlier dispute level, a line's window passed on `asOf`, its pricing not current, its deadline not verified,
 * or its statements not its inputs'. The page shows each with its fix.
 */
export async function requestExportOnce(
  scope: Scope,
  queue: JobQueue,
  input: { readonly practiceId: string; readonly caseId: string; readonly versionId: string; readonly asOf: string },
): Promise<ExportRequestOutcome> {
  await versionOfCase(scope, input.practiceId, input.caseId, input.versionId);
  const readiness = await exportReadiness(scope.client, { practiceId: input.practiceId, versionId: input.versionId, asOf: input.asOf });
  if (readiness === undefined) {
    throw new NotFoundError();
  }
  if (readiness.outcome !== 'ready') {
    return readiness;
  }
  await queue.enqueue('packet_export', { practice_id: input.practiceId, packet_version_id: input.versionId });
  return { outcome: 'queued' };
}

/**
 * A version's exported PDF or CSV (line-level PHI: the identifiers are in it), read from the sealed
 * store, checked against the SHA-256 the version recorded, and recorded as the viewer's download of that
 * file (@tp/worker/packets downloadPacketExport(): packet_export_pdf_downloaded or
 * packet_export_csv_downloaded, a line-level export, written only once the bytes hashed to the recorded
 * SHA-256). A reimbursement reviewer's two downloads are what their attestation needs (docs/adr/0061).
 * Undefined when the version has no export; a file that does not match throws
 * PacketExportFileIntegrityError and is never sent.
 */
export function exportFile(
  scope: Scope,
  services: Pick<Services, 'keys' | 'documents'>,
  input: { readonly practiceId: string; readonly caseId: string; readonly versionId: string; readonly file: PacketExportFile; readonly requestId: string },
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  return downloadPacketExport(scope, services, input);
}
