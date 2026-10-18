import { createHash } from 'node:crypto';

import { type PracticeScope, type ScopeClient, loadPracticeCipher, readWithAudit, recordAuditEvent } from '@tp/db/runtime';
import { type PacketContent, VERIFIER_FORMAT, type VerifierReport, draftNarrative } from '@tp/packets';
import { type PacketVersionDetail, approvePacketVersion, packetOfCase, packetVersionOf, writePacketVersion } from '@tp/worker/packets';

import type { Services } from '../server/services';
import type { JobQueue } from '../uploads/queue';
import { peopleEmails } from '../cases/people';
import { NotFoundError } from '../http/route';
import { type ApprovalState, approvalState } from './approval';

/**
 * The packet builder's reads and steps (PRD 7, Packet builder: "citation, line table, traces, narrative
 * editor with verifier results, interest, evidence list, approval panel, export history"; "edit,
 * request approval, approve (second person), export"; PRD 12; test matrix CAS-08 to CAS-13; docs/adr/0041
 * and 0044), over @tp/worker/packets, which assembles, verifies and writes every version and asks the
 * database for every approval. A version's identifiers are placeholders on screen; only the export
 * job inserts them, into the PDF and CSV. Each step is made once: saving the text a current version
 * already holds writes nothing, approving an approved version and exporting an exported one do
 * nothing.
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
}

/** The case's packet's versions, newest first (codes, dates and hashes; no narrative). */
async function history(scope: Scope, practiceId: string, packetId: string): Promise<{ rows: HistoryRow[]; drafterId: string | null }> {
  const { rows } = await scope.client.query<HistoryRow>(
    `SELECT v.id, v.version_no, p.current_version_id = v.id AS current, v.created_at, v.drafted_by, v.verifier_passed, v.approved_at, v.approved_by, v.approved_alone,
            v.exported_at, v.export_sha256, v.export_csv_sha256
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

function versionView(detail: PacketVersionDetail, writtenBy: string | null): VersionView {
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
  const approval = approvalState(
    {
      verifierPassed: shown.verifier_passed,
      verifierCurrent: detail.verifier.format === VERIFIER_FORMAT,
      current: shown.current,
      matchesCase: facts[0]?.matches ?? false,
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
    })),
    version: versionView(detail, person(shown.drafted_by)),
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

/** Why an export is not asked for. */
export const NOT_EXPORTABLE = 'an export prints the packet’s current version once it is approved';

/**
 * Asks the worker to print a version's export (the packet_export job: the PDF and the CSV schedule, the
 * identifiers inserted, stored sealed, their SHA-256 recorded on the version; CAS-11, CAS-12). A version
 * exported already is left as it is ('exported'); one not approved or not current is refused.
 */
export async function requestExportOnce(scope: Scope, queue: JobQueue, input: { readonly practiceId: string; readonly caseId: string; readonly versionId: string }): Promise<'queued' | 'exported' | 'refused'> {
  const version = await versionOfCase(scope, input.practiceId, input.caseId, input.versionId);
  if (version.exported) {
    return 'exported';
  }
  if (!version.approved || !version.current) {
    return 'refused';
  }
  await queue.enqueue('packet_export', { practice_id: input.practiceId, packet_version_id: input.versionId });
  return 'queued';
}

/** A stored export did not match the SHA-256 its version recorded: it is never sent. */
export class PacketFileIntegrityError extends Error {
  override readonly name = 'PacketFileIntegrityError';
}

async function collect(source: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of source) {
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}

/**
 * A version's exported PDF or CSV (line-level PHI: the identifiers are in it), read from the sealed
 * store, checked against the SHA-256 the version recorded, and recorded as an audited line-level
 * export. Undefined when the version has no export.
 */
export async function exportFile(
  scope: Scope,
  services: Pick<Services, 'keys' | 'documents'>,
  input: { readonly practiceId: string; readonly caseId: string; readonly versionId: string; readonly file: 'pdf' | 'csv'; readonly requestId: string },
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'packet_version', purpose: 'line_export', requestId: input.requestId },
    async (client) =>
      (
        await client.query<{ id: string; practice_id: string; key: string | null; sha256: string | null }>(
          `SELECT v.id, v.practice_id, ${input.file === 'pdf' ? 'v.export_pdf_key' : 'v.export_csv_key'} AS key, ${input.file === 'pdf' ? 'v.export_sha256' : 'v.export_csv_sha256'} AS sha256
             FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE v.id = $1 AND v.practice_id = $2 AND p.case_id = $3`,
          [input.versionId, input.practiceId, input.caseId],
        )
      ).rows,
    (found) => ({ objectId: found.id, practiceId: found.practice_id }),
  );
  if (row?.key === null || row?.key === undefined || row.sha256 === null) {
    return undefined;
  }
  const cipher = await loadPracticeCipher(scope, services.keys, input.practiceId);
  const bytes = await collect(services.documents.read(cipher, row.key));
  if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
    throw new PacketFileIntegrityError('the stored packet export does not match the SHA-256 its version recorded');
  }
  await recordAuditEvent(scope, { action: 'packet_export_downloaded', objectType: 'packet_version', objectId: input.versionId, practiceId: input.practiceId, purpose: 'line_export', requestId: input.requestId });
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}
