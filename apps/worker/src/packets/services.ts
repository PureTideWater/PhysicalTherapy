import {
  type KeyProvider,
  PermissionDeniedError,
  type PracticeScope,
  type ScopeClient,
  loadPracticeCipher,
  readWithAudit,
  recordAuditEvent,
  requirePlatformPermission,
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

import { type JobSender, enqueue } from '../jobs/enqueue';
import { todayUtc } from '../triage/execute';
import { scheduleIdentifiers } from './identifiers';
import { PacketRefusedError, loadAssembly } from './records';

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
  readonly drafted_by_email: string | null;
  readonly approved_by_email: string | null;
  readonly regulation_confirmed_by_email: string | null;
}

export const VERSION_COLUMNS = `v.id, v.practice_id, v.packet_id, p.case_id, v.version_no, (p.current_version_id = v.id) AS current, v.content, v.narrative, v.content_sha256,
  v.verifier_passed, v.verifier_report, v.drafted_by, v.created_at, v.regulation_confirmed_by, v.regulation_confirmed_at, v.approved_by, v.approved_at, v.approved_alone, v.export_sha256,
  v.export_csv_sha256, v.export_pdf_key, v.export_csv_key, v.exported_at, people.drafted_by_email, people.approved_by_email, people.regulation_confirmed_by_email`;

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
 * sealed, their SHA-256 recorded on the version; CAS-12). Only an approved, current, unexported version
 * is queued; the export job checks again. Returns the job's ID, or null when it is already queued.
 */
export async function requestPacketExport(scope: PracticeScope<ScopeClient>, queue: JobSender, input: VersionAction): Promise<string | null> {
  const { rows } = await scope.client.query<{ approved: boolean; current: boolean; exported: boolean }>(
    `SELECT v.approved_by IS NOT NULL AS approved, p.current_version_id = v.id AS current, v.exported_at IS NOT NULL AS exported
       FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE v.id = $1 AND v.practice_id = $2`,
    [input.versionId, input.practiceId],
  );
  const found = rows[0];
  if (found === undefined) {
    throw new PacketRefusedError('version_not_found', 'no such packet version in this practice');
  }
  if (!found.approved || !found.current || found.exported) {
    throw new PacketRuleError('23514', found.exported ? 'a packet version is exported once' : 'exporting a packet needs its current version approved');
  }
  return enqueue(queue, 'packet_export', { practice_id: input.practiceId, packet_version_id: input.versionId });
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
  const { rows: versions } = await scope.client.query<{ case_id: string; export_sha256: string | null; export_csv_sha256: string | null; current: boolean; replaced_on: string | null }>(
    `SELECT p.case_id, v.export_sha256, v.export_csv_sha256, p.current_version_id = v.id AS current,
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
  // An edit clears the approval (CAS-13): a version an edit replaced was sent only if it went before the edit.
  if (!version.current && (version.replaced_on === null || input.submittedOn >= version.replaced_on)) {
    throw new PacketRuleError('23514', "a submission sends the packet's current version; one an edit replaced is logged only when it was sent before the edit");
  }
  const cipher = await loadPracticeCipher(scope, keys, input.practiceId);
  const reference = input.reference === null || input.reference.trim() === '' ? null : cipher.encrypt('submission.reference', input.reference.trim());
  const { rows } = await underRules(() =>
    scope.client.query<{ id: string; dispute_level: number; follow_up_on: string; export_sha256: string; export_csv_sha256: string }>(
      `INSERT INTO submission (practice_id, case_id, packet_version_id, submitted_on, channel, reference, submitted_by, follow_up_on, export_sha256, export_csv_sha256)
       VALUES ($1, $2, $3, $4, $5, $6, app_actor_id(), $7, $8, $9)
       RETURNING id, dispute_level, follow_up_on::text, export_sha256, export_csv_sha256`,
      [input.practiceId, version.case_id, input.versionId, input.submittedOn, input.channel, reference, input.followUpOn ?? null, version.export_sha256, version.export_csv_sha256],
    ),
  );
  const logged = rows[0] as { id: string; dispute_level: number; follow_up_on: string; export_sha256: string; export_csv_sha256: string };
  return { submissionId: logged.id, caseId: version.case_id, disputeLevel: logged.dispute_level, followUpOn: logged.follow_up_on, exportSha256: logged.export_sha256, exportCsvSha256: logged.export_csv_sha256 };
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
          responses: { id: string; kind: PayerResponseKind; amount_cents: string | null; received_on: string; denial_category: string | null; reopens_case: boolean; next_window_ends_on: string | null; document_id: string | null }[];
        }>(
          `SELECT s.id, s.practice_id, s.packet_version_id, v.version_no, s.dispute_level, s.submitted_on::text, s.channel, s.reference, s.submitted_by, s.follow_up_on::text,
                  s.export_sha256, s.export_csv_sha256,
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
