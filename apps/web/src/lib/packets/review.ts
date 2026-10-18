import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import type { PacketContent, VerifierReport } from '@tp/packets';
import type { DeadlineStatus } from '@tp/triage';
import { type ExportAwaitingAttestation, type PacketAttestation, attestPacketExport, exportsAwaitingAttestation, packetVersionOf } from '@tp/worker/packets';

import type { Services } from '../server/services';
import { NotFoundError } from '../http/route';
import { deadlineNow } from './queries';

/**
 * The reimbursement reviewer's review of a packet's export (D16; docs/adr/0061), as the audit report's
 * checklist is: the version's content and its deadline, the export's two SHA-256 and the verifier's
 * report over what it printed, who wrote and approved it, and the reviewer's attestation once made. The
 * reviewer (audit_finding.validate, reached under a support grant) downloads the PDF and the CSV from
 * the review itself and attests over their SHA-256; the database refuses anyone who drafted, wrote or
 * approved the packet. Internal users approve nothing: the practice's approval stands beside it.
 */

type Scope = PracticeScope<ScopeClient>;

/** What the reviewer confirms, item by item, before attesting (the attestation names each code). */
export const PACKET_CHECKLIST = [
  { id: 'figures', text: 'Every figure, date, code and count in the PDF and the CSV is in the version’s records: the verifier passed what the export printed.' },
  { id: 'deadline', text: 'The deadline is verified: the contract window’s page, quote and hash are signed off, or the rule release’s window record is verified to the level required.' },
  { id: 'calculation', text: 'Each line’s calculation summary is its trace’s: the method, the steps, the one rounding and the patient share, shown apart from expected.' },
  { id: 'identifiers', text: 'The identifiers in the PDF and the CSV are the claim and patient records’ own, and the narrative holds none of them.' },
  { id: 'files', text: 'The PDF and the CSV I reviewed are the files whose SHA-256 is shown here.' },
  { id: 'independent', text: 'I had no part in drafting, writing or approving this packet.' },
] as const;

/** The sentence an attestation stands for. It holds no words a person typed: the checklist's codes and the two SHA-256. */
export const PACKET_ATTESTATION_TEXT = 'I attest that I reviewed this packet’s exported PDF and CSV against the checklist above.';

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
  readonly attestation: { readonly at: string; readonly byViewer: boolean; readonly checklist: PacketAttestation['checklist'] } | null;
  /** Whether the viewer drafted, wrote or approved the packet (the database refuses their attestation). */
  readonly viewerTookPart: boolean;
}

/** A version of the case's packet for the reviewer; not found when it is not the case's. */
export async function packetReview(scope: Scope, services: Pick<Services, 'keys'>, input: { readonly practiceId: string; readonly caseId: string; readonly versionId: string; readonly viewerId: string; readonly requestId: string }): Promise<PacketReview> {
  const detail = await packetVersionOf(scope, services.keys, { practiceId: input.practiceId, versionId: input.versionId, requestId: input.requestId, purpose: 'packet_review' });
  if (detail?.caseId !== input.caseId) {
    throw new NotFoundError();
  }
  const { rows } = await scope.client.query<{ drafted_by: string }>('SELECT v.drafted_by FROM packet_version v WHERE v.packet_id = $1 AND v.version_no = 1', [detail.packetId]);
  const firstDrafter = rows[0]?.drafted_by ?? detail.draftedBy;
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
    attestation: detail.attestedAt === null || detail.attestation === null ? null : { at: detail.attestedAt.toISOString(), byViewer: detail.attestedBy === input.viewerId, checklist: detail.attestation.checklist },
    viewerTookPart: [firstDrafter, detail.draftedBy, detail.approvedBy].includes(input.viewerId),
  };
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
