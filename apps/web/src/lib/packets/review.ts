import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { type PacketContent, type VerifierReport, packetReference } from '@tp/packets';
import type { DeadlineStatus } from '@tp/triage';
import {
  type ExportAwaitingAttestation,
  type PacketAttestation,
  type PacketAttestationItem,
  type PacketExportFile,
  PacketRuleError,
  attestPacketExport,
  exportsAwaitingAttestation,
  packetExportDownloads,
  packetVersionOf,
} from '@tp/worker/packets';
import { packetPricingCheck } from '@tp/worker/pricing';
import { z } from 'zod';

import type { Services } from '../server/services';
import { NotFoundError } from '../http/route';
import { type ContactNow, contactNow } from './contact';
import { PRICING_BLOCKED_TEXT, type PricingNowView, pricingNow } from './pricing';
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
 * beside it. An export whose pricing is no longer current (audit item #4: a line priced again since, its rule
 * release withdrawn, or its contract version no longer signed off or no longer covering the service date) is
 * not attested: the review shows the lines with their figures then and now, and the attestation is refused here
 * and in the database.
 *
 * Audit item #37 part 1 (the founder's rulings of 2026-10-20; docs/adr/0061): the exported files are the payer's copy,
 * which print none of the internal record, so the review shows it instead (the approval's people and time, the audit
 * flag, the regulation's confirmation, the evidence with its SHA-256 and gaps, the releases' manifests, the version's
 * SHA-256 and its reference) beside what the payer's copy carries (the approval line with the reference, and the
 * correspondence contact the practice has set now). The checklist is the founder's seven items (Q5 (a)), and the
 * attest action's schema is built from it, so the two cannot drift.
 */

type Scope = PracticeScope<ScopeClient>;

/**
 * What the reviewer confirms, item by item, before attesting (the attestation names each code; the founder's wording,
 * Q5 (a)). Two items say what each file carries, since the CSV is the line schedule alone (review of 2026-10-21): the
 * PDF closes with the approval line, the reference and the contact, the CSV file is named by the reference (and each
 * of its rows leads with it, the founder's ruling of 2026-10-21); and above the first level the files state the
 * level's own window without a clause. The founder confirmed that wording as written on 2026-10-21 (docs/adr/0061).
 */
export const PACKET_CHECKLIST = [
  {
    id: 'figures',
    text: 'Every figure, date, code and count in the PDF and the CSV comes from the version’s records, its approval, or the practice’s correspondence contact (printed as set), and the verifier passed the narrative the export printed.',
  },
  {
    id: 'deadline',
    text: 'The deadline is verified: the contract window’s page, quote and hash are signed off, or the rule release’s window record is verified to the level required (shown on this page; the payer’s files state the window’s end and, at the first level, the clause or record behind it, not its verification).',
  },
  {
    id: 'calculation',
    text: 'Each line’s calculation in the PDF and the CSV is its trace’s: the method, the steps, the one rounding and the patient share, shown apart from expected; each trace’s SHA-256 is on this page.',
  },
  { id: 'identifiers', text: 'The identifiers in the PDF and the CSV are the claim and patient records’ own, and the narrative holds none of them.' },
  {
    id: 'payer_copy',
    text: 'The PDF and the CSV are fit to send to the payer: the PDF names the practice and closes with its approval line, this reference and its correspondence contact; the CSV is its line schedule, its file named by this reference; neither carries a login, record ID, SHA-256 or internal note (those are on this page).',
  },
  { id: 'files', text: 'The PDF and the CSV I downloaded and reviewed are the files whose SHA-256 is shown here.' },
  { id: 'independent', text: 'I had no part in drafting, writing or approving this packet.' },
] as const satisfies readonly { readonly id: PacketAttestationItem; readonly text: string }[];

/**
 * The items an attestation records, in its own order, each in the checklist's wording today (the attestation stores
 * the codes only, never the words; a code the checklist no longer holds shows as itself). The page says so beside them
 * (ATTESTED_WORDING_NOTE), so a later rewording never passes for what an earlier reviewer saw.
 */
export function attestedItems(codes: readonly string[]): readonly { readonly id: string; readonly text: string }[] {
  const words = new Map<string, string>(PACKET_CHECKLIST.map((item) => [item.id, item.text]));
  return codes.map((id) => ({ id, text: words.get(id) ?? id }));
}

/** Beside an attestation's items: what the record holds, and whose words are shown. */
export const ATTESTED_WORDING_NOTE = 'The attestation records each item by its code; the words shown are the checklist’s as it reads today.';

const confirmed = z.literal('on', 'confirm this item');

/**
 * The attest action's confirmations, one required `confirm_<id>` field per checklist item, built from the checklist
 * itself (D10): a form missing any box is refused before the service runs.
 */
export const ATTEST_CONFIRMATIONS = Object.fromEntries(PACKET_CHECKLIST.map((item) => [`confirm_${item.id}`, confirmed])) as {
  readonly [K in (typeof PACKET_CHECKLIST)[number]['id'] as `confirm_${K}`]: typeof confirmed;
};

/** The note the review carries in place of the payer copy's old footer: true of every amount, and no longer printed for the payer. */
export const COMPUTED_BY_CODE_NOTE =
  'Every amount in this packet was computed by code from the practice’s remittances and the cited contract terms or regulation; interest is stated apart from the variance.';

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
  /** Whether the version's pricing is still current, with the stale lines' figures then and now (the database refuses to attest it otherwise). */
  readonly pricingNow: PricingNowView;
  readonly attestation: { readonly at: string; readonly byViewer: boolean; readonly checklist: PacketAttestation['checklist'] } | null;
  /** The packet's reference, which the payer's copy prints and its files are named by (from the approved SHA-256); null until approved. */
  readonly reference: string | null;
  /** The contract specialist's confirmation that the regulation applies (a Medicare Advantage case), by email and time; null otherwise. */
  readonly regulationConfirmation: { readonly by: string | null; readonly at: string } | null;
  /**
   * The practice's correspondence contact now, in the payer copy's words when set. An export already made keeps the
   * contact it was printed with (its PDF and SHA-256 are the record), which may differ from this.
   */
  readonly contactNow: ContactNow;
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
    pricingNow: await pricingNow(scope, { practiceId: input.practiceId, content: detail.content, requestId: input.requestId }),
    attestation: detail.attestedAt === null || detail.attestation === null ? null : { at: detail.attestedAt.toISOString(), byViewer: detail.attestedBy === input.viewerId, checklist: detail.attestation.checklist },
    reference: detail.approvedAt === null ? null : packetReference(detail.contentSha256),
    regulationConfirmation: detail.regulationConfirmedAt === null ? null : { by: detail.regulationConfirmedByEmail, at: detail.regulationConfirmedAt.toISOString() },
    contactNow: await contactNow(scope, input.practiceId),
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

/**
 * Attests the export over the SHA-256 of the files the review showed, once; an attested export is left as it is.
 * An export whose pricing is no longer current is refused first, with the remedy (the database refuses it too).
 */
export async function attestOnce(scope: Scope, input: { readonly practiceId: string; readonly caseId: string; readonly versionId: string; readonly pdfSha256: string; readonly csvSha256: string; readonly requestId: string }): Promise<boolean> {
  const { rows } = await scope.client.query<{ content: PacketContent; attested: boolean }>(
    'SELECT v.content, v.attested_by IS NOT NULL AS attested FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE v.id = $1 AND v.practice_id = $2 AND p.case_id = $3',
    [input.versionId, input.practiceId, input.caseId],
  );
  const found = rows[0];
  if (found === undefined) {
    throw new NotFoundError();
  }
  if (!found.attested && (await packetPricingCheck(scope.client, found.content)) !== 'current') {
    throw new PacketRuleError('23514', PRICING_BLOCKED_TEXT.attestation);
  }
  const attested = await attestPacketExport(scope, { practiceId: input.practiceId, versionId: input.versionId, pdfSha256: input.pdfSha256, csvSha256: input.csvSha256, requestId: input.requestId });
  return attested.attested;
}
