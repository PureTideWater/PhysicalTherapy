import {
  type KeyProvider,
  PermissionDeniedError,
  type PracticeScope,
  type ScopeClient,
  loadPracticeCipher,
  readWithAudit,
  recordAuditEvent,
  requirePlatformPermission,
  requirePracticePermission,
} from '@tp/db/runtime';
import { type Cents, centsToString, parseCents } from '@tp/money';
import {
  FOLLOW_UP_DAYS,
  PAYER_RESPONSE_KINDS,
  type PacketContent,
  type PayerResponseKind,
  SUBMISSION_CHANNELS,
  type SubmissionChannel,
  type VerifierReport,
  addDays,
  assemblePacket,
  draftNarrative,
  isIsoDate,
  narrativeFacts,
  verifyNarrative,
  versionSha256,
} from '@tp/packets';
import type { DeadlineStatus } from '@tp/triage';

import { type JobSender, enqueue } from '../jobs/enqueue';
import { todayUtc } from '../triage/execute';
import { packetExportDownloads } from './downloads';
import { scheduleIdentifiers } from './identifiers';
import { type ExportReadinessReason, exportReadiness } from './readiness';
import { PacketRefusedError, loadAssembly } from './records';
import { type SubmissionSent, submissionSentOf } from './submission-kinds';

/**
 * The packet workflow the web app's server actions call (PRD 5, J9 and J10; PRD 12), each in the
 * caller's own scope, which the database checks again for every role: writing a version (assembled
 * from the case and approved records, the narrative the person's or the code-built draft, verified,
 * hashed and encrypted), the specialist's confirmation of a regulation, approval, asking for the export
 * (the worker prints it), logging a submission and recording a payer response; and the reads the
 * workbench and the recovery ledger need. No function here takes a verifier result, an approval flag,
 * a hash it did not compute or an identifier: the verifier always runs, and identifiers are inserted
 * only when the export is printed.
 */

/** The longest narrative a version holds. */
export const NARRATIVE_MAX_LENGTH = 20_000;

/** A rule the database holds refused the step: its sentence says which (fixed words, no value). */
export class PacketRuleError extends Error {
  override readonly name = 'PacketRuleError';

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const RULE_CODES = new Set(['23514', '42501', '23505', '23503']);

/** Runs a statement whose refusal is one of the database's packet rules, as a PacketRuleError. */
async function underRules<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && RULE_CODES.has(error.code) && error instanceof Error) {
      throw new PacketRuleError(error.code, error.message);
    }
    throw error;
  }
}

export interface WriteVersionInput {
  readonly practiceId: string;
  readonly caseId: string;
  /** The version the person edited (null for a packet's first): a later one written meanwhile refuses this. */
  readonly basedOnVersionId: string | null;
  /** The person's narrative; the code-built draft of the pattern statement when absent. */
  readonly narrative?: string;
  readonly promptPayState?: string | null;
  readonly attachedDocumentIds?: readonly string[];
  readonly requestId: string;
  /** The version's date (UTC); today unless a test names one. */
  readonly asOf?: string;
}

export interface WrittenVersion {
  readonly packetId: string;
  readonly versionId: string;
  readonly versionNo: number;
  readonly contentSha256: string;
  readonly content: PacketContent;
  readonly verifier: VerifierReport;
}

/**
 * Writes a packet version (CAS-13: an edit is a new version, which clears the packet's approval): the
 * case's lines not written off and its approved records, assembled by @tp/packets; the narrative, put
 * in its NFKC form (so the stored text, the verifier's positions and the export are the same
 * characters), checked by the verifier against the version's facts and against the schedule rows' own
 * identifiers (read from the canonical records, an audited read, and never stored), whose result and
 * report the version stores (a failing one is stored too, and the database refuses to approve it,
 * CAS-08). Opens the case's packet on its first version.
 */
export async function writePacketVersion(scope: PracticeScope<ScopeClient>, keys: KeyProvider, input: WriteVersionInput): Promise<WrittenVersion> {
  if (input.narrative !== undefined && input.narrative.normalize('NFKC').length > NARRATIVE_MAX_LENGTH) {
    throw new PacketRefusedError('narrative_too_long', `a narrative is at most ${String(NARRATIVE_MAX_LENGTH)} characters`);
  }
  const { content, identifiers, cipher } = await assembleVersion(scope, keys, input);
  const narrative = (input.narrative ?? draftNarrative(content)).normalize('NFKC');
  const verifier = verifyNarrative(narrative, narrativeFacts(content), identifiers);

  const { client } = scope;
  const existing = await client.query<{ id: string; current_version_id: string | null }>('SELECT id, current_version_id FROM packet WHERE case_id = $1 AND practice_id = $2', [input.caseId, input.practiceId]);
  let packetId = existing.rows[0]?.id;
  if ((existing.rows[0]?.current_version_id ?? null) !== input.basedOnVersionId) {
    throw new PacketRefusedError('stale_version', 'another version of the packet was written since this one was opened');
  }
  if (packetId === undefined) {
    const opened = await underRules(() => client.query<{ id: string }>('INSERT INTO packet (practice_id, case_id) VALUES ($1, $2) RETURNING id', [input.practiceId, input.caseId]));
    packetId = (opened.rows[0] as { id: string }).id;
  }
  const { rows: numbered } = await client.query<{ next: number }>('SELECT 1 + coalesce(max(version_no), 0) AS next FROM packet_version WHERE packet_id = $1', [packetId]);
  const versionNo = numbered[0]?.next ?? 1;
  const contentSha256 = versionSha256({ packetId, versionNo, content, narrative });
  const written = await underRules(() =>
    client.query<{ id: string }>(
      `INSERT INTO packet_version (practice_id, packet_id, version_no, content, narrative, content_sha256, verifier_passed, verifier_report, drafted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, app_actor_id()) RETURNING id`,
      [input.practiceId, packetId, versionNo, JSON.stringify(content), cipher.encrypt('packet_version.narrative', narrative), contentSha256, verifier.passed, JSON.stringify(verifier)],
    ),
  );
  return { packetId, versionId: (written.rows[0] as { id: string }).id, versionNo, contentSha256, content, verifier };
}

/** The case's next version's content and the schedule rows' identifiers, as writePacketVersion assembles and checks them. */
async function assembleVersion(scope: PracticeScope<ScopeClient>, keys: KeyProvider, input: DraftInputsRequest) {
  const assembly = await loadAssembly(scope, {
    practiceId: input.practiceId,
    caseId: input.caseId,
    asOf: input.asOf ?? todayUtc(),
    promptPayState: input.promptPayState ?? null,
    attachedDocumentIds: input.attachedDocumentIds ?? [],
    requestId: input.requestId,
  });
  const content = assemblePacket(assembly);
  const cipher = await loadPracticeCipher(scope, keys, input.practiceId);
  const identifiers = await scheduleIdentifiers(scope, cipher, content, { purpose: 'packet_verification', requestId: input.requestId });
  return { content, identifiers: identifiers.all, cipher };
}

export type DraftInputsRequest = Pick<WriteVersionInput, 'practiceId' | 'caseId' | 'promptPayState' | 'attachedDocumentIds' | 'requestId' | 'asOf'>;

export interface DraftInputs {
  /** The content the case's next version would hold (identifiers as placeholders). */
  readonly content: PacketContent;
  /** The schedule rows' own identifiers (an audited read): a draft is checked against them, never given them. */
  readonly identifiers: readonly string[];
}

/**
 * What a narrative drafter is given for the case's next version (docs/adr/0052): the content
 * writePacketVersion would assemble with the same choices on the same day, and the identifiers its
 * verifier checks a narrative against. The model gateway's drafter sends the pattern-level facts only;
 * the identifiers stay here, for the check.
 */
export async function packetDraftInputs(scope: PracticeScope<ScopeClient>, keys: KeyProvider, input: DraftInputsRequest): Promise<DraftInputs> {
  const { content, identifiers } = await assembleVersion(scope, keys, input);
  return { content, identifiers };
}

export interface PacketVersionDetail {
  readonly versionId: string;
  readonly packetId: string;
  readonly caseId: string;
  readonly versionNo: number;
  readonly current: boolean;
  readonly content: PacketContent;
  /** The person's words with identifier placeholders (never identifiers: those are inserted at export). */
  readonly narrative: string;
  readonly contentSha256: string;
  readonly verifierPassed: boolean;
  readonly verifier: VerifierReport;
  readonly draftedBy: string;
  readonly draftedByEmail: string | null;
  readonly createdAt: Date;
  readonly regulationConfirmedBy: string | null;
  readonly regulationConfirmedByEmail: string | null;
  readonly regulationConfirmedAt: Date | null;
  readonly approvedBy: string | null;
  readonly approvedByEmail: string | null;
  readonly approvedAt: Date | null;
  /** The audit flag: approved by its own writer in a single-user practice after the 24-hour delay. */
  readonly approvedAlone: boolean;
  readonly exportSha256: string | null;
  readonly exportCsvSha256: string | null;
  readonly exportPdfKey: string | null;
  readonly exportCsvKey: string | null;
  readonly exportedAt: Date | null;
  /** The deadline status the version stated when it was written (CO-12; tp-packet/1: unverified). Never trusted at export. */
  readonly deadlineStatus: DeadlineStatus;
  /** The verifier's report over the narrative the export printed (CO-05). */
  readonly exportVerifier: VerifierReport | null;
  /** The reimbursement reviewer's attestation over the export's two SHA-256 (D16). */
  readonly attestedBy: string | null;
  readonly attestedAt: Date | null;
  readonly attestation: PacketAttestation | null;
}

interface VersionRow {
  readonly id: string;
  readonly practice_id: string;
  readonly packet_id: string;
  readonly case_id: string;
  readonly version_no: number;
  readonly current: boolean;
  readonly content: PacketContent;
  readonly narrative: string;
  readonly content_sha256: string;
  readonly verifier_passed: boolean;
  readonly verifier_report: VerifierReport;
  readonly drafted_by: string;
  readonly created_at: Date;
  readonly regulation_confirmed_by: string | null;
  readonly regulation_confirmed_at: Date | null;
  readonly approved_by: string | null;
  readonly approved_at: Date | null;
  readonly approved_alone: boolean;
  readonly export_sha256: string | null;
  readonly export_csv_sha256: string | null;
  readonly export_pdf_key: string | null;
  readonly export_csv_key: string | null;
  readonly exported_at: Date | null;
  readonly deadline_verification_status: DeadlineStatus;
  readonly export_verifier_report: VerifierReport | null;
  readonly attested_by: string | null;
  readonly attested_at: Date | null;
  readonly attestation: PacketAttestation | null;
  readonly drafted_by_email: string | null;
  readonly approved_by_email: string | null;
  readonly regulation_confirmed_by_email: string | null;
}

export const VERSION_COLUMNS = `v.id, v.practice_id, v.packet_id, p.case_id, v.version_no, (p.current_version_id = v.id) AS current, v.content, v.narrative, v.content_sha256,
  v.verifier_passed, v.verifier_report, v.drafted_by, v.created_at, v.regulation_confirmed_by, v.regulation_confirmed_at, v.approved_by, v.approved_at, v.approved_alone, v.export_sha256,
  v.export_csv_sha256, v.export_pdf_key, v.export_csv_key, v.exported_at, v.deadline_verification_status, v.export_verifier_report, v.attested_by, v.attested_at, v.attestation,
  people.drafted_by_email, people.approved_by_email, people.regulation_confirmed_by_email`;

/** A version as stored, its narrative decrypted (a read of the packet, audited), or undefined. */
export async function packetVersionOf(
  scope: PracticeScope<ScopeClient>,
  keys: KeyProvider,
  input: { readonly practiceId: string; readonly versionId: string; readonly requestId: string; readonly purpose?: string },
): Promise<PacketVersionDetail | undefined> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'packet_version', purpose: input.purpose ?? 'packet_review', requestId: input.requestId },
    async (client) =>
      (
        await client.query<VersionRow>(
          `SELECT ${VERSION_COLUMNS} FROM packet_version v JOIN packet p ON p.id = v.packet_id, LATERAL packet_version_people(v.id) people
            WHERE v.id = $1 AND v.practice_id = $2`,
          [input.versionId, input.practiceId],
        )
      ).rows,
    (found) => ({ objectId: found.id, practiceId: found.practice_id }),
  );
  if (row === undefined) {
    return undefined;
  }
  const cipher = await loadPracticeCipher(scope, keys, input.practiceId);
  return {
    versionId: row.id,
    packetId: row.packet_id,
    caseId: row.case_id,
    versionNo: row.version_no,
    current: row.current,
    content: row.content,
    narrative: cipher.decrypt('packet_version.narrative', row.narrative),
    contentSha256: row.content_sha256,
    verifierPassed: row.verifier_passed,
    verifier: row.verifier_report,
    draftedBy: row.drafted_by,
    draftedByEmail: row.drafted_by_email,
    createdAt: row.created_at,
    regulationConfirmedBy: row.regulation_confirmed_by,
    regulationConfirmedByEmail: row.regulation_confirmed_by_email,
    regulationConfirmedAt: row.regulation_confirmed_at,
    approvedBy: row.approved_by,
    approvedByEmail: row.approved_by_email,
    approvedAt: row.approved_at,
    approvedAlone: row.approved_alone,
    exportSha256: row.export_sha256,
    exportCsvSha256: row.export_csv_sha256,
    exportPdfKey: row.export_pdf_key,
    exportCsvKey: row.export_csv_key,
    exportedAt: row.exported_at,
    deadlineStatus: row.deadline_verification_status,
    exportVerifier: row.export_verifier_report,
    attestedBy: row.attested_by,
    attestedAt: row.attested_at,
    attestation: row.attestation,
  };
}

export interface VersionAction {
  readonly practiceId: string;
  readonly versionId: string;
  readonly requestId: string;
}

/**
 * A contract specialist (under a support grant) confirms the regulation applies to a Medicare Advantage
 * non-contracted case before its packet is approved (PRD 2, step 5; Rules reference), in their own name:
 * a practice the specialist reaches and the platform permission pricing.answer (as rate_record.approve is
 * checked for the specialist's approvals), checked here and by the database, which records who and when.
 */
export async function confirmRegulation(scope: PracticeScope<ScopeClient>, input: VersionAction): Promise<void> {
  if (scope.access(input.practiceId) === undefined) {
    throw new PermissionDeniedError('pricing.answer', 'no_access', []);
  }
  await requirePlatformPermission(scope, 'pricing.answer');
  const { rowCount } = await underRules(() => scope.client.query('UPDATE packet_version SET regulation_confirmed_by = app_actor_id() WHERE id = $1 AND practice_id = $2', [input.versionId, input.practiceId]));
  if (rowCount !== 1) {
    throw new PacketRefusedError('version_not_found', 'no such packet version in this practice');
  }
}

export interface RegulationAwaiting {
  readonly versionId: string;
  readonly caseId: string;
  readonly versionNo: number;
  readonly writtenAt: Date;
  /** The regulation the version cites, and what it says (the rule release's words). */
  readonly reference: string;
  readonly statement: string;
  readonly payerName: string;
  readonly planKey: string;
  readonly lines: number;
  readonly claims: number;
  readonly varianceCents: Cents;
}

/**
 * The packet versions waiting for a contract specialist to confirm the regulation applies (PRD 2, step 5;
 * Rules reference, Medicare Advantage non-contracting): each packet's current version, not approved,
 * citing the regulation, not yet confirmed, oldest first. The version's own content only, which holds no
 * identifier (they are placeholders).
 */
export async function regulationsAwaiting(scope: PracticeScope<ScopeClient>, input: { readonly practiceId: string }): Promise<RegulationAwaiting[]> {
  const { rows } = await scope.client.query<{ id: string; case_id: string; version_no: number; created_at: Date; content: PacketContent }>(
    `SELECT v.id, p.case_id, v.version_no, v.created_at, v.content
       FROM packet_version v JOIN packet p ON p.current_version_id = v.id
      WHERE v.practice_id = $1 AND v.content -> 'citation' ->> 'kind' = 'regulation' AND v.regulation_confirmed_by IS NULL AND v.approved_by IS NULL
      ORDER BY v.created_at, v.id`,
    [input.practiceId],
  );
  return rows.map((row) => {
    const citation = row.content.citation;
    return {
      versionId: row.id,
      caseId: row.case_id,
      versionNo: row.version_no,
      writtenAt: row.created_at,
      reference: citation.kind === 'regulation' ? citation.reference : '',
      statement: citation.kind === 'regulation' ? citation.statement : '',
      payerName: row.content.payer.name,
      planKey: row.content.payer.plan_key,
      lines: row.content.pattern.lines,
      claims: row.content.pattern.claims,
      varianceCents: parseCents(row.content.pattern.variance_cents),
    };
  });
}

export interface ApprovedVersion {
  readonly approvedAt: Date;
  /** The audit flag: the practice has no one else who approves packets, and the 24 hours had passed. */
  readonly approvedAlone: boolean;
}

/**
 * Approves a version, naming its hash (PRD 12, Approval). The database refuses a version the verifier
 * failed, a version that is not current or whose case's lines have changed, a person who does not
 * approve packets, and the person who drafted the packet or wrote this version (CAS-09) unless no one
 * else may approve the practice's packets and 24 hours have passed since the version was written, which
 * it then flags (CAS-10); the flag is also an audit event.
 */
export async function approvePacketVersion(scope: PracticeScope<ScopeClient>, input: VersionAction & { readonly versionSha256: string }): Promise<ApprovedVersion> {
  const { rows } = await underRules(() =>
    scope.client.query<{ approved_at: Date; approved_alone: boolean }>(
      'UPDATE packet_version SET approved_by = app_actor_id(), approved_sha256 = $3 WHERE id = $1 AND practice_id = $2 RETURNING approved_at, approved_alone',
      [input.versionId, input.practiceId, input.versionSha256],
    ),
  );
  const approved = rows[0];
  if (approved === undefined) {
    throw new PacketRefusedError('version_not_found', 'no such packet version in this practice');
  }
  if (approved.approved_alone) {
    await recordAuditEvent(scope, {
      action: 'packet_approved_alone',
      objectType: 'packet_version',
      objectId: input.versionId,
      practiceId: input.practiceId,
      purpose: 'single_user_practice',
      requestId: input.requestId,
    });
  }
  return { approvedAt: approved.approved_at, approvedAlone: approved.approved_alone };
}

/**
 * Asks the worker to print a version's export (PDF and CSV schedule, identifiers inserted, stored
 * sealed, their SHA-256 recorded on the version; CAS-12). Only a version the export job would print is
 * queued: the readiness the job asks again (exportReadiness(), ./readiness.ts; audit item #26) refuses
 * here first, with the first reason that holds in words (the database's own where it has them), so
 * nothing is queued that the job would refuse. Returns the job's ID, or null when it is already queued.
 */
export async function requestPacketExport(scope: PracticeScope<ScopeClient>, queue: JobSender, input: VersionAction): Promise<string | null> {
  const readiness = await exportReadiness(scope.client, { practiceId: input.practiceId, versionId: input.versionId, asOf: todayUtc() });
  if (readiness === undefined) {
    throw new PacketRefusedError('version_not_found', 'no such packet version in this practice');
  }
  if (readiness.outcome === 'exported') {
    throw new PacketRuleError('23514', 'a packet version is exported once');
  }
  if (readiness.outcome === 'refused') {
    throw new PacketRuleError('23514', EXPORT_REQUEST_REFUSALS[readiness.reasons[0]]);
  }
  return enqueue(queue, 'packet_export', { practice_id: input.practiceId, packet_version_id: input.versionId });
}

/** The refusal of an export or an attestation whose deadline is not verified (the database's words). */
export const DEADLINE_NOT_VERIFIED = 'a packet version whose deadline is not verified is not exported';

/** The refusal of an attestation before the reviewer has downloaded both files of the export (the review's next step). */
export const EXPORT_NOT_DOWNLOADED = 'download the export’s PDF and CSV from this review before attesting it; each download is checked against its SHA-256';

/** The refusal of an export of a version written at an earlier dispute level than the case's now (the database's words). */
export const NOT_CASE_LEVEL = 'only a version of the case\'s dispute level is exported; write the packet again at this level';

/** The refusal of an export whose pricing is no longer current (audit item #4; the database's words, packet_version_export_guard). */
export const PRICING_NOT_CURRENT =
  'a packet version is exported only while its pricing is current: every line on the pricing in effect, under a rule release not withdrawn and the mapping in force for its plan, with its contract version signed off and covering the service date';

/**
 * Why requestPacketExport() queues nothing, by the first reason exportReadiness() gives: the database's own
 * words where its guard holds the rule, fixed words naming the rule and the next step otherwise (no value).
 */
export const EXPORT_REQUEST_REFUSALS: Readonly<Record<ExportReadinessReason, string>> = {
  not_approved: 'exporting a packet needs its current version approved',
  not_current: 'exporting a packet needs its current version approved',
  outdated: 'a packet version written before packets stated their deadline is not exported; write the packet again',
  case_changed: 'a packet version is exported only while it asks for exactly its case\'s lines and the case is not closed; write the packet again',
  not_case_level: NOT_CASE_LEVEL,
  window_passed: 'a packet version is not exported once a line\'s dispute window has passed; write the line off and write the packet again without it',
  next_window_passed: 'a packet version of a later dispute level is not exported once the window the reopening denial gave for that level has ended',
  pricing_not_current: PRICING_NOT_CURRENT,
  deadline_unverified: DEADLINE_NOT_VERIFIED,
  inputs_differ: 'a packet version is exported only while it states its deadlines and calculations as its inputs give them now; write the packet again',
  contact_missing: 'a packet is exported once the practice administrator has set the correspondence contact under Settings, Correspondence',
};

/**
 * What a reimbursement reviewer confirms over a packet's export before attesting it (D16), as codes:
 * the attestation holds these and the two SHA-256, never a word a person typed (the database refuses any).
 */
export const PACKET_ATTESTATION_ITEMS = ['figures', 'deadline', 'calculation', 'identifiers', 'files', 'independent'] as const;
export type PacketAttestationItem = (typeof PACKET_ATTESTATION_ITEMS)[number];

/** The attestation over an export (tp-attestation/1, as audit_report's): its checklist's codes and the files' SHA-256. */
export interface PacketAttestation {
  readonly format: 'tp-attestation/1';
  readonly checklist: readonly PacketAttestationItem[];
  readonly pdf_sha256: string;
  readonly csv_sha256: string;
}

export interface AttestExportInput extends VersionAction {
  /** The SHA-256 of the PDF and CSV the reviewer reviewed: they must be the export's. */
  readonly pdfSha256: string;
  readonly csvSha256: string;
}

export interface AttestedExport {
  readonly attestedAt: Date;
  /** False when the export was attested already (by anyone): nothing changed. */
  readonly attested: boolean;
}

/**
 * The reimbursement reviewer's attestation over a packet's export (D16; docs/adr/0061), as audit_report's
 * over its files: once the export is made and hashed, a reviewer (audit_finding.validate, the reviewer
 * role, reached under a support grant) attests once over the SHA-256 of the PDF and the CSV they reviewed,
 * in their own name; a submission is logged only after it. The database refuses the person who drafted,
 * wrote or approved the packet, a version not current or whose case changed, one whose deadline is not
 * verified, files that are not the export's, an attester who has not downloaded both files since the export
 * (each checked against its SHA-256 as it was served), and anyone else; this checks the permission, the files
 * and the downloads first. An attested export is left as it is. Internal users approve nothing: the practice's approval
 * stands as before, and this is the founder's attestation beside it.
 */
export async function attestPacketExport(scope: PracticeScope<ScopeClient>, input: AttestExportInput): Promise<AttestedExport> {
  requirePracticePermission(scope, input.practiceId, 'audit_finding.validate');
  const { rows } = await scope.client.query<{ export_sha256: string | null; export_csv_sha256: string | null; attested_at: Date | null }>(
    'SELECT export_sha256, export_csv_sha256, attested_at FROM packet_version WHERE id = $1 AND practice_id = $2 FOR UPDATE',
    [input.versionId, input.practiceId],
  );
  const found = rows[0];
  if (found === undefined) {
    throw new PacketRefusedError('version_not_found', 'no such packet version in this practice');
  }
  if (found.attested_at !== null) {
    return { attestedAt: found.attested_at, attested: false };
  }
  if (found.export_sha256 === null || found.export_csv_sha256 === null) {
    throw new PacketRuleError('23514', 'a packet version is attested once its export is made');
  }
  if (found.export_sha256 !== input.pdfSha256 || found.export_csv_sha256 !== input.csvSha256) {
    throw new PacketRuleError('23514', 'the files reviewed are not this export’s; open the review again');
  }
  // The owner's addition of 2026-10-18: the attester's own downloads of both files since the export, each
  // served only after its bytes hashed to the SHA-256 above (the database asks the same before it attests).
  const downloaded = await packetExportDownloads(scope, { versionId: input.versionId });
  if (!downloaded.includes('pdf') || !downloaded.includes('csv')) {
    throw new PacketRefusedError('export_not_downloaded', EXPORT_NOT_DOWNLOADED);
  }
  const attestation: PacketAttestation = { format: 'tp-attestation/1', checklist: [...PACKET_ATTESTATION_ITEMS], pdf_sha256: input.pdfSha256, csv_sha256: input.csvSha256 };
  const { rows: attested } = await underRules(() =>
    scope.client.query<{ attested_at: Date }>('UPDATE packet_version SET attested_by = app_actor_id(), attestation = $3 WHERE id = $1 AND practice_id = $2 RETURNING attested_at', [
      input.versionId,
      input.practiceId,
      JSON.stringify(attestation),
    ]),
  );
  const at = attested[0];
  if (at === undefined) {
    throw new PacketRefusedError('version_not_found', 'no such packet version in this practice');
  }
  return { attestedAt: at.attested_at, attested: true };
}

export interface ExportAwaitingAttestation {
  readonly versionId: string;
  readonly caseId: string;
  readonly versionNo: number;
  readonly disputeLevel: number;
  readonly exportedAt: Date;
  readonly exportSha256: string;
  readonly exportCsvSha256: string;
  readonly deadlineEndsOn: string | null;
  readonly payerName: string;
  readonly planKey: string;
  readonly lines: number;
  readonly varianceCents: Cents;
}

/**
 * The exports waiting for a reimbursement reviewer's attestation (D16): each packet's current version,
 * exported, not attested, oldest first. The version's own content only (identifiers are placeholders in it).
 */
export async function exportsAwaitingAttestation(scope: PracticeScope<ScopeClient>, input: { readonly practiceId: string }): Promise<ExportAwaitingAttestation[]> {
  const { rows } = await scope.client.query<{ id: string; case_id: string; version_no: number; exported_at: Date; export_sha256: string; export_csv_sha256: string; content: PacketContent }>(
    `SELECT v.id, p.case_id, v.version_no, v.exported_at, v.export_sha256, v.export_csv_sha256, v.content
       FROM packet_version v JOIN packet p ON p.current_version_id = v.id
      WHERE v.practice_id = $1 AND v.exported_at IS NOT NULL AND v.attested_by IS NULL
      ORDER BY v.exported_at, v.id`,
    [input.practiceId],
  );
  return rows.map((row) => ({
    versionId: row.id,
    caseId: row.case_id,
    versionNo: row.version_no,
    disputeLevel: row.content.dispute_level,
    exportedAt: row.exported_at,
    exportSha256: row.export_sha256,
    exportCsvSha256: row.export_csv_sha256,
    deadlineEndsOn: row.content.format === 'tp-packet/2' ? row.content.deadline.ends_on : null,
    payerName: row.content.payer.name,
    planKey: row.content.payer.plan_key,
    lines: row.content.pattern.lines,
    varianceCents: parseCents(row.content.pattern.variance_cents),
  }));
}

export interface LogSubmissionInput {
  readonly practiceId: string;
  readonly versionId: string;
  readonly submittedOn: string;
  readonly channel: SubmissionChannel;
  /** The payer's reference (a portal confirmation, a fax receipt): stored encrypted. */
  readonly reference: string | null;
  /** The follow-up date; 45 days after the submission unless named (CAS-14). */
  readonly followUpOn?: string | null;
  readonly requestId: string;
}

export interface LoggedSubmission {
  readonly submissionId: string;
  readonly caseId: string;
  readonly disputeLevel: number;
  readonly followUpOn: string;
  readonly exportSha256: string;
  readonly exportCsvSha256: string;
  /** An attested export, or one sent without sign-off with its reason, as the database recorded it (submission.unattested_reason). */
  readonly sent: SubmissionSent;
}

/**
 * Logs a submission the customer made through the payer's own channel (the product never submits),
 * carrying the export's SHA-256 into the log (CAS-12). The database refuses a version not exported, a
 * version an edit replaced (unless it was sent before the edit; CAS-13), a date before the export or
 * after today, a dispute the payer has answered (unless a denial reopened it, then within the next
 * level's window), and anyone who does not log submissions.
 */
export async function logSubmission(scope: PracticeScope<ScopeClient>, keys: KeyProvider, input: LogSubmissionInput): Promise<LoggedSubmission> {
  if (!isIsoDate(input.submittedOn) || (input.followUpOn !== undefined && input.followUpOn !== null && !isIsoDate(input.followUpOn))) {
    throw new PacketRuleError('22007', 'a submission and its follow-up are calendar dates');
  }
  if (!(SUBMISSION_CHANNELS as readonly string[]).includes(input.channel)) {
    throw new PacketRuleError('23514', 'a submission goes through the payer portal, fax, mail or provider-relations email');
  }
  const { rows: versions } = await scope.client.query<{ case_id: string; export_sha256: string | null; export_csv_sha256: string | null; attested: boolean; current: boolean; replaced_on: string | null }>(
    `SELECT p.case_id, v.export_sha256, v.export_csv_sha256, v.attested_by IS NOT NULL AS attested, p.current_version_id = v.id AS current,
            (SELECT (n.created_at AT TIME ZONE 'UTC')::date::text FROM packet_version n WHERE n.packet_id = v.packet_id AND n.version_no = v.version_no + 1) AS replaced_on
       FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE v.id = $1 AND v.practice_id = $2`,
    [input.versionId, input.practiceId],
  );
  const version = versions[0];
  if (version === undefined) {
    throw new PacketRefusedError('version_not_found', 'no such packet version in this practice');
  }
  if (version.export_sha256 === null || version.export_csv_sha256 === null) {
    throw new PacketRuleError('23514', 'a packet is submitted once it is exported');
  }
  // D16: the reviewer's attestation over the export is its release, as for an audit report.
  if (!version.attested) {
    throw new PacketRuleError('23514', 'a packet is submitted once a reimbursement reviewer has attested its export');
  }
  // An edit clears the approval (CAS-13): a version an edit replaced was sent only if it went before the edit.
  if (!version.current && (version.replaced_on === null || input.submittedOn >= version.replaced_on)) {
    throw new PacketRuleError('23514', "a submission sends the packet's current version; one an edit replaced is logged only when it was sent before the edit");
  }
  const cipher = await loadPracticeCipher(scope, keys, input.practiceId);
  const reference = input.reference === null || input.reference.trim() === '' ? null : cipher.encrypt('submission.reference', input.reference.trim());
  const { rows } = await underRules(() =>
    scope.client.query<{ id: string; dispute_level: number; follow_up_on: string; export_sha256: string; export_csv_sha256: string; unattested_reason: string | null }>(
      `INSERT INTO submission (practice_id, case_id, packet_version_id, submitted_on, channel, reference, submitted_by, follow_up_on, export_sha256, export_csv_sha256)
       VALUES ($1, $2, $3, $4, $5, $6, app_actor_id(), $7, $8, $9)
       RETURNING id, dispute_level, follow_up_on::text, export_sha256, export_csv_sha256, unattested_reason`,
      [input.practiceId, version.case_id, input.versionId, input.submittedOn, input.channel, reference, input.followUpOn ?? null, version.export_sha256, version.export_csv_sha256],
    ),
  );
  const logged = rows[0] as { id: string; dispute_level: number; follow_up_on: string; export_sha256: string; export_csv_sha256: string; unattested_reason: string | null };
  return {
    submissionId: logged.id,
    caseId: version.case_id,
    disputeLevel: logged.dispute_level,
    followUpOn: logged.follow_up_on,
    exportSha256: logged.export_sha256,
    exportCsvSha256: logged.export_csv_sha256,
    sent: submissionSentOf(logged.unattested_reason),
  };
}

export interface RecordResponseInput {
  readonly practiceId: string;
  readonly submissionId: string;
  readonly kind: PayerResponseKind;
  /** What the payer accepted (accepted, partial), in cents; nothing for the other kinds. */
  readonly amountCents: Cents | null;
  /** The response's document (an upload of the practice). */
  readonly documentId: string | null;
  /** For reprocessed with no change, the remittance the recovery ledger matched (its job records these). */
  readonly remittanceId?: string | null;
  readonly receivedOn: string;
  readonly denialCategory?: string | null;
  readonly notes?: string | null;
  /** A denial with a reason that reopens the case for the next dispute level (the database computes its window). */
  readonly reopensCase?: boolean;
  readonly requestId: string;
}

export interface RecordedResponse {
  readonly responseId: string;
  readonly caseState: string;
  readonly nextWindowEndsOn: string | null;
}

/**
 * Records a payer response to the case's latest submission (PRD 12; J10). Recording one never writes a
 * ledger entry and never moves a line to payer approved or recovered (LED-01): the recovery ledger does
 * both from the response (acceptedPayerResponses) and the remittances. A person records it in their own
 * name with its document; the recovery ledger's matching (a job) records a reprocessed remittance with no
 * change in no one's name. The case's state follows from it.
 */
export async function recordPayerResponse(scope: PracticeScope<ScopeClient>, keys: KeyProvider, input: RecordResponseInput): Promise<RecordedResponse> {
  if (!isIsoDate(input.receivedOn)) {
    throw new PacketRuleError('22007', 'a response is received on a calendar date');
  }
  if (!(PAYER_RESPONSE_KINDS as readonly string[]).includes(input.kind)) {
    throw new PacketRuleError('23514', 'a response is accepted, partial, denied, information requested, or reprocessed with no change');
  }
  const cipher = input.notes === undefined || input.notes === null || input.notes.trim() === '' ? null : await loadPracticeCipher(scope, keys, input.practiceId);
  const notes = cipher === null ? null : cipher.encrypt('payer_response.notes', (input.notes ?? '').trim());
  const { rows } = await underRules(() =>
    scope.client.query<{ id: string; next_window_ends_on: string | null }>(
      `INSERT INTO payer_response (practice_id, submission_id, kind, amount_cents, document_id, remittance_id, received_on, denial_category, notes, reopens_case, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN app_actor_is_person() THEN app_actor_id() END)
       RETURNING id, next_window_ends_on::text`,
      [
        input.practiceId,
        input.submissionId,
        input.kind,
        input.amountCents === null ? null : centsToString(input.amountCents),
        input.documentId,
        input.remittanceId ?? null,
        input.receivedOn,
        input.denialCategory ?? null,
        notes,
        input.reopensCase ?? false,
      ],
    ),
  );
  const recorded = rows[0] as { id: string; next_window_ends_on: string | null };
  const { rows: state } = await scope.client.query<{ state: string }>('SELECT c.state FROM "case" c JOIN submission s ON s.case_id = c.id WHERE s.id = $1', [input.submissionId]);
  return { responseId: recorded.id, caseState: state[0]?.state ?? 'open', nextWindowEndsOn: recorded.next_window_ends_on };
}

export interface SubmissionLogEntry {
  readonly submissionId: string;
  readonly packetVersionId: string;
  readonly versionNo: number;
  readonly disputeLevel: number;
  readonly submittedOn: string;
  readonly channel: SubmissionChannel;
  /** The payer's reference, decrypted. */
  readonly reference: string | null;
  readonly submittedBy: string;
  readonly followUpOn: string;
  /** The export's SHA-256, as sent (CAS-12). */
  readonly exportSha256: string;
  readonly exportCsvSha256: string;
  /** An attested export, or one sent without sign-off with its reason (submission.unattested_reason). */
  readonly sent: SubmissionSent;
  readonly responses: readonly {
    readonly responseId: string;
    readonly kind: PayerResponseKind;
    readonly amountCents: Cents | null;
    readonly receivedOn: string;
    readonly denialCategory: string | null;
    readonly reopensCase: boolean;
    readonly nextWindowEndsOn: string | null;
    readonly documentId: string | null;
  }[];
}

/** A case's submission log, newest first, each with its export's hashes and its responses (CAS-12). */
export async function submissionLog(scope: PracticeScope<ScopeClient>, keys: KeyProvider, input: { readonly practiceId: string; readonly caseId: string; readonly requestId: string }): Promise<SubmissionLogEntry[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'submission', purpose: 'case_review', requestId: input.requestId },
    async (client) =>
      (
        await client.query<{
          id: string;
          practice_id: string;
          packet_version_id: string;
          version_no: number;
          dispute_level: number;
          submitted_on: string;
          channel: SubmissionChannel;
          reference: string | null;
          submitted_by: string;
          follow_up_on: string;
          export_sha256: string;
          export_csv_sha256: string;
          unattested_reason: string | null;
          responses: { id: string; kind: PayerResponseKind; amount_cents: string | null; received_on: string; denial_category: string | null; reopens_case: boolean; next_window_ends_on: string | null; document_id: string | null }[];
        }>(
          `SELECT s.id, s.practice_id, s.packet_version_id, v.version_no, s.dispute_level, s.submitted_on::text, s.channel, s.reference, s.submitted_by, s.follow_up_on::text,
                  s.export_sha256, s.export_csv_sha256, s.unattested_reason,
                  coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'amount_cents', r.amount_cents::text, 'received_on', r.received_on::text,
                                                                'denial_category', r.denial_category, 'reopens_case', r.reopens_case,
                                                                'next_window_ends_on', r.next_window_ends_on::text, 'document_id', r.document_id)
                                             ORDER BY r.received_on, r.created_at, r.id)
                              FROM payer_response r WHERE r.submission_id = s.id), '[]') AS responses
             FROM submission s JOIN packet_version v ON v.id = s.packet_version_id
            WHERE s.case_id = $1 AND s.practice_id = $2
            ORDER BY s.submitted_on DESC, s.created_at DESC, s.id DESC`,
          [input.caseId, input.practiceId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  const cipher = rows.some((row) => row.reference !== null) ? await loadPracticeCipher(scope, keys, input.practiceId) : null;
  return rows.map((row) => ({
    submissionId: row.id,
    packetVersionId: row.packet_version_id,
    versionNo: row.version_no,
    disputeLevel: row.dispute_level,
    submittedOn: row.submitted_on,
    channel: row.channel,
    reference: row.reference === null || cipher === null ? null : cipher.decrypt('submission.reference', row.reference),
    submittedBy: row.submitted_by,
    followUpOn: row.follow_up_on,
    exportSha256: row.export_sha256,
    exportCsvSha256: row.export_csv_sha256,
    sent: submissionSentOf(row.unattested_reason),
    responses: row.responses.map((response) => ({
      responseId: response.id,
      kind: response.kind,
      amountCents: response.amount_cents === null ? null : parseCents(response.amount_cents),
      receivedOn: response.received_on,
      denialCategory: response.denial_category,
      reopensCase: response.reopens_case,
      nextWindowEndsOn: response.next_window_ends_on,
      documentId: response.document_id,
    })),
  }));
}

export interface FollowUp {
  readonly caseId: string;
  readonly submissionId: string;
  readonly submittedOn: string;
  readonly followUpOn: string;
  readonly daysWaiting: number;
}

/**
 * The follow-up list (PRD 6: "a case with a submission but no response in 45 days appears in the
 * follow-up list"; CAS-14): every case whose latest submission has no response and whose follow-up date
 * has come by `asOf`, the oldest first. Counts and opaque IDs only.
 */
export async function followUpsDue(scope: PracticeScope<ScopeClient>, input: { readonly practiceId: string; readonly asOf?: string }): Promise<FollowUp[]> {
  const asOf = input.asOf ?? todayUtc();
  const { rows } = await scope.client.query<{ case_id: string; submission_id: string; submitted_on: string; follow_up_on: string; days_waiting: number }>(
    `SELECT c.id AS case_id, s.id AS submission_id, s.submitted_on::text, s.follow_up_on::text, ($2::date - s.submitted_on) AS days_waiting
       FROM "case" c JOIN submission s ON s.id = case_latest_submission(c.id)
      WHERE c.practice_id = $1 AND c.state <> 'closed_written_off' AND s.follow_up_on <= $2::date
        AND NOT EXISTS (SELECT 1 FROM payer_response r WHERE r.submission_id = s.id)
      ORDER BY s.follow_up_on, s.submitted_on, c.id`,
    [input.practiceId, asOf],
  );
  return rows.map((row) => ({ caseId: row.case_id, submissionId: row.submission_id, submittedOn: row.submitted_on, followUpOn: row.follow_up_on, daysWaiting: row.days_waiting }));
}

/**
 * The follow-up reminder (PRD 6, Submissions and payer responses: "follow-up dates; reminders"; CAS-14):
 * once for each submission whose follow-up date has come by `asOf` with no response from the payer, the
 * case's owner is told in the app, or the practice's people when the case has no owner who reaches the
 * practice and keeps in-app notices on. Counts only (the days since it was submitted), the submission's
 * opaque ID as its subject, so a replay tells no one twice. A practice job's (the daily monitor), since
 * only a job reads the recipients. Returns how many were told.
 */
export async function remindFollowUps(scope: PracticeScope<ScopeClient>, input: { readonly practiceId: string; readonly asOf?: string }): Promise<number> {
  const due = await followUpsDue(scope, input);
  if (due.length === 0) {
    return 0;
  }
  const people = (await scope.client.query<{ user_id: string; in_app: boolean }>('SELECT user_id, in_app FROM practice_notification_recipients()')).rows.filter((person) => person.in_app);
  let told = 0;
  for (const followUp of due) {
    const owner = (await scope.client.query<{ owner_user_id: string | null }>('SELECT owner_user_id FROM "case" WHERE id = $1', [followUp.caseId])).rows[0]?.owner_user_id ?? null;
    const recipients = owner !== null && people.some((person) => person.user_id === owner) ? [owner] : people.map((person) => person.user_id);
    if (recipients.length === 0) {
      continue;
    }
    const { rowCount } = await scope.client.query(
      `INSERT INTO notification (practice_id, user_id, kind, subject_id, counts, totals_cents)
       SELECT $1, u.id, 'follow_up', $2, $3, '{}' FROM unnest($4::uuid[]) AS u (id) ORDER BY u.id
       ON CONFLICT (user_id, kind, subject_id) DO NOTHING`,
      [input.practiceId, followUp.submissionId, JSON.stringify({ days_waiting: followUp.daysWaiting }), recipients],
    );
    told += rowCount ?? 0;
  }
  return told;
}

/** The follow-up date a submission gets unless the person names one. */
export function defaultFollowUp(submittedOn: string): string {
  return addDays(submittedOn, FOLLOW_UP_DAYS);
}

export interface AcceptingResponse {
  readonly responseId: string;
  readonly submissionId: string;
  readonly caseId: string;
  readonly packetVersionId: string;
  readonly kind: 'accepted' | 'partial';
  readonly amountCents: Cents;
  readonly receivedOn: string;
  readonly documentId: string | null;
  /** The schedule's lines the submitted version asked for, with their variance (the ledger allocates). */
  readonly lines: readonly { readonly serviceLineId: string; readonly varianceCents: Cents }[];
}

/**
 * For the recovery ledger (milestone 9), which writes the `approved` entries and moves lines to payer
 * approved: the payer responses that accept an amount (accepted, partial), with their document and the
 * lines the submitted version asked for. Reading them changes nothing; nothing here writes the ledger.
 */
export async function acceptedPayerResponses(scope: PracticeScope<ScopeClient>, input: { readonly practiceId: string; readonly caseId?: string }): Promise<AcceptingResponse[]> {
  const { rows } = await scope.client.query<{
    id: string;
    submission_id: string;
    case_id: string;
    packet_version_id: string;
    kind: 'accepted' | 'partial';
    amount_cents: string;
    received_on: string;
    document_id: string | null;
    lines: { service_line_id: string; variance_cents: string }[];
  }>(
    `SELECT r.id, r.submission_id, s.case_id, s.packet_version_id, r.kind, r.amount_cents::text, r.received_on::text, r.document_id,
            (SELECT jsonb_agg(jsonb_build_object('service_line_id', l ->> 'service_line_id', 'variance_cents', l ->> 'variance_cents') ORDER BY (l ->> 'row')::integer)
               FROM jsonb_array_elements(v.content -> 'lines') l) AS lines
       FROM payer_response r JOIN submission s ON s.id = r.submission_id JOIN packet_version v ON v.id = s.packet_version_id
      WHERE r.practice_id = $1 AND r.kind IN ('accepted', 'partial') AND ($2::uuid IS NULL OR s.case_id = $2)
      ORDER BY r.received_on, r.created_at, r.id`,
    [input.practiceId, input.caseId ?? null],
  );
  return rows.map((row) => ({
    responseId: row.id,
    submissionId: row.submission_id,
    caseId: row.case_id,
    packetVersionId: row.packet_version_id,
    kind: row.kind,
    amountCents: parseCents(row.amount_cents),
    receivedOn: row.received_on,
    documentId: row.document_id,
    lines: row.lines.map((line) => ({ serviceLineId: line.service_line_id, varianceCents: parseCents(line.variance_cents) })),
  }));
}

/**
 * The approvals a report shows with their audit flag (CAS-10; PRD 12: "the gap is shown in the
 * report"): every version of the practice approved by its own writer in a single-user practice, with
 * how long after it was written.
 */
export async function singleUserApprovals(scope: PracticeScope<ScopeClient>, input: { readonly practiceId: string }): Promise<{ readonly versionId: string; readonly caseId: string; readonly writtenAt: Date; readonly approvedAt: Date; readonly hoursWaited: number }[]> {
  const { rows } = await scope.client.query<{ id: string; case_id: string; created_at: Date; approved_at: Date; hours_waited: number }>(
    `SELECT v.id, p.case_id, v.created_at, v.approved_at, floor(extract(epoch FROM v.approved_at - v.created_at) / 3600)::integer AS hours_waited
       FROM packet_version v JOIN packet p ON p.id = v.packet_id
      WHERE v.practice_id = $1 AND v.approved_alone
      ORDER BY v.approved_at, v.id`,
    [input.practiceId],
  );
  return rows.map((row) => ({ versionId: row.id, caseId: row.case_id, writtenAt: row.created_at, approvedAt: row.approved_at, hoursWaited: row.hours_waited }));
}

/** A case's packet and its current version, for the workbench's builder (no figures); undefined for no such case. */
export async function packetOfCase(
  scope: PracticeScope<ScopeClient>,
  input: { readonly practiceId: string; readonly caseId: string },
): Promise<{ readonly caseId: string; readonly state: string; readonly packetId: string | null; readonly currentVersionId: string | null } | undefined> {
  const { rows } = await scope.client.query<{ id: string; state: string; packet_id: string | null; current_version_id: string | null }>(
    `SELECT c.id, c.state, p.id AS packet_id, p.current_version_id FROM "case" c LEFT JOIN packet p ON p.case_id = c.id WHERE c.id = $1 AND c.practice_id = $2`,
    [input.caseId, input.practiceId],
  );
  const found = rows[0];
  return found === undefined ? undefined : { caseId: found.id, state: found.state, packetId: found.packet_id, currentVersionId: found.current_version_id };
}
