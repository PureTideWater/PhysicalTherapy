import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import type { PacketContent, VerifierReport } from '@tp/packets';
import type { DeadlineStatus } from '@tp/triage';
import {
  type ExportAwaitingAttestation,
  type PacketAttestation,
  type PacketExportFile,
  attestPacketExport,
  exportsAwaitingAttestation,
  packetExportDownloads,
  packetVersionOf,
} from '@tp/worker/packets';

import type { Services } from '../server/services';
import { NotFoundError } from '../http/route';
import { atCaseLevel, deadlineNow } from './queries';

/**
 * The reimbursement reviewer's review of a packet's export (D16; docs/adr/0061), as the audit report's
 * checklist is: the version's content and its deadline, the export's two SHA-256 and the verifier's
 * report over what it printed, who wrote and approved it, and the reviewer's attestation once made. The
 * reviewer (audit_finding.validate, reached under a support grant) downloads the PDF and the CSV from
 * the review itself, each checked against its SHA-256 as it is served and recorded as their download, and
 * attests over their SHA-256 only once both are downloaded (the owner's addition of 2026-10-18: the
 * handler and the database each refuse an attestation before it); the database refuses anyone who
 * drafted, wrote or approved the packet. Internal users approve nothing: the practice's approval stands
 * beside it.
 */

type Scope = PracticeScope<ScopeClient>;

/** What the reviewer confirms, item by item, before attesting (the attestation names each code). */
export const PACKET_CHECKLIST = [
  { id: 'figures', text: 'Every figure, date, code and count in the PDF and the CSV is in the version’s records: the verifier passed what the export printed.' },
  { id: 'deadline', text: 'The deadline is verified: the contract window’s page, quote and hash are signed off, or the rule release’s window record is verified to the level required.' },
  { id: 'calculation', text: 'Each line’s calculation summary is its trace’s: the method, the steps, the one rounding and the patient share, shown apart from expected.' },
  { id: 'identifiers', text: 'The identifiers in the PDF and the CSV are the claim and patient records’ own, and the narrative holds none of them.' },
  { id: 'files', text: 'The PDF and the CSV I downloaded and reviewed are the files whose SHA-256 is shown here.' },
  { id: 'independent', text: 'I had no part in drafting, writing or approving this packet.' },
] as const;

/** The sentence an attestation stands for. It holds no words a person typed: the checklist's codes and the two SHA-256. */
export const PACKET_ATTESTATION_TEXT = 'I attest that I downloaded and reviewed this packet’s exported PDF and CSV against the checklist above.';

export interface PacketReview {
  readonly versionId: string;
  readonly caseId: string;
  readonly versionNo: number;
  readonly current: boolean;
  readonly content: PacketContent;
  readonly contentSha256: string;
  readonly writtenBy: string | null;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly approvedAlone: boolean;
  readonly exportedAt: string | null;
  readonly exportSha256: string | null;
  readonly exportCsvSha256: string | null;
  readonly exportVerifier: VerifierReport | null;
  /** The deadline the database derives now: an attestation needs it not unverified. */
  readonly deadlineNow: DeadlineStatus;
  /** Whether the version is of the case's dispute level now (the database refuses to attest one that is not). */
  readonly atCaseLevel: boolean;
  readonly attestation: { readonly at: string; readonly byViewer: boolean; readonly checklist: PacketAttestation['checklist'] } | null;
  /** Whether the viewer drafted, wrote or approved any version of the packet (the database refuses their attestation). */
  readonly viewerTookPart: boolean;
  /** The files of this export the viewer has downloaded since it was made, each checked against its SHA-256 as it was served: the attestation needs both. */
  readonly viewerDownloaded: Readonly<Record<PacketExportFile, boolean>>;
}

/** A version of the case's packet for the reviewer; not found when it is not the case's. */
export async function packetReview(scope: Scope, services: Pick<Services, 'keys'>, input: { readonly practiceId: string; readonly caseId: string; readonly versionId: string; readonly viewerId: string; readonly requestId: string }): Promise<PacketReview> {
  const detail = await packetVersionOf(scope, services.keys, { practiceId: input.practiceId, versionId: input.versionId, requestId: input.requestId, purpose: 'packet_review' });
  if (detail?.caseId !== input.caseId) {
    throw new NotFoundError();
  }
  // Every version's writer and approver, as the database reads them when it refuses an attestation.
  const { rows } = await scope.client.query<{ drafted_by: string; approved_by: string | null }>('SELECT v.drafted_by, v.approved_by FROM packet_version v WHERE v.packet_id = $1', [detail.packetId]);
  const people = new Set([detail.draftedBy, detail.approvedBy, ...rows.flatMap((row) => [row.drafted_by, row.approved_by])]);
  return {
    versionId: detail.versionId,
    caseId: detail.caseId,
    versionNo: detail.versionNo,
    current: detail.current,
    content: detail.content,
    contentSha256: detail.contentSha256,
    writtenBy: detail.draftedByEmail,
    approvedBy: detail.approvedByEmail,
    approvedAt: detail.approvedAt?.toISOString() ?? null,
    approvedAlone: detail.approvedAlone,
    exportedAt: detail.exportedAt?.toISOString() ?? null,
    exportSha256: detail.exportSha256,
    exportCsvSha256: detail.exportCsvSha256,
    exportVerifier: detail.exportVerifier,
    deadlineNow: await deadlineNow(scope, detail.caseId, detail.content),
    atCaseLevel: await atCaseLevel(scope, detail.caseId, detail.content),
    attestation: detail.attestedAt === null || detail.attestation === null ? null : { at: detail.attestedAt.toISOString(), byViewer: detail.attestedBy === input.viewerId, checklist: detail.attestation.checklist },
    viewerTookPart: people.has(input.viewerId),
    viewerDownloaded: await viewerDownloads(scope, detail.versionId),
  };
}

/** The files of the version's export the viewer has downloaded since it was made (the database's own reading). */
async function viewerDownloads(scope: Scope, versionId: string): Promise<Readonly<Record<PacketExportFile, boolean>>> {
  const files = await packetExportDownloads(scope, { versionId });
  return { pdf: files.includes('pdf'), csv: files.includes('csv') };
}

/** The practice's exports waiting for the reviewer's attestation, oldest first. */
export function awaitingAttestation(scope: Scope, practiceId: string): Promise<ExportAwaitingAttestation[]> {
  return exportsAwaitingAttestation(scope, { practiceId });
}

/** Attests the export over the SHA-256 of the files the review showed, once; an attested export is left as it is. */
export async function attestOnce(scope: Scope, input: { readonly practiceId: string; readonly caseId: string; readonly versionId: string; readonly pdfSha256: string; readonly csvSha256: string; readonly requestId: string }): Promise<boolean> {
  const { rowCount } = await scope.client.query('SELECT 1 FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE v.id = $1 AND v.practice_id = $2 AND p.case_id = $3', [input.versionId, input.practiceId, input.caseId]);
  if (rowCount !== 1) {
    throw new NotFoundError();
  }
  const attested = await attestPacketExport(scope, { practiceId: input.practiceId, versionId: input.versionId, pdfSha256: input.pdfSha256, csvSha256: input.csvSha256, requestId: input.requestId });
  return attested.attested;
}
