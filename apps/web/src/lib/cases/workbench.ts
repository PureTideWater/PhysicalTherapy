import { type KeyProvider, type PracticeCipher, type PracticeScope, type ScopeClient, loadPracticeCipher, readWithAudit } from '@tp/db/runtime';

import type { CaseEvent } from '../triage/queries';
import { peopleEmails } from './people';
import { type CHANNEL_TEXT, type ResponseKindText, type TimelineEvent, inOrder } from './timeline';

/**
 * The workbench's own records of a case (PRD 7, Cases: "notes", "assign", the timeline; Packet
 * builder: "request approval"; docs/adr/0044): its activity (case_activity, append-only: notes in the
 * person's words, encrypted with the practice's key; assignments, which set the case's owner; approval
 * requests), and its timeline, read from every record of the case: the case itself, its lines' stage
 * events, write-offs and reopens, its activity, its packet's versions, their approvals and exports, its
 * submissions and the payer's responses. Each change is made once: repeating it on a record already
 * changed does nothing (the route tests call every mutation with every role allowed it).
 */

type Scope = PracticeScope<ScopeClient>;

export interface ActivityView {
  readonly id: string;
  readonly kind: 'note' | 'assigned' | 'approval_requested';
  readonly at: string;
  readonly by: string | null;
  /** A note's or a request's words, for the roles that read PHI; null otherwise. */
  readonly text: string | null;
  /** An assignment's new owner (email), null when left unassigned. */
  readonly owner: string | null;
  readonly packetVersionId: string | null;
  readonly versionNo: number | null;
}

interface ActivityRow {
  readonly id: string;
  readonly practice_id: string;
  readonly kind: ActivityView['kind'];
  readonly body: string | null;
  readonly owner_user_id: string | null;
  readonly packet_version_id: string | null;
  readonly version_no: number | null;
  readonly created_by: string;
  readonly created_at: Date;
}

/** The case's activity, oldest first (an audited read: notes are a person's words). */
export async function caseActivity(scope: Scope, practiceId: string, caseId: string, cipher: PracticeCipher | null, requestId: string): Promise<ActivityView[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'case_activity', purpose: 'case_review', requestId },
    async (client) =>
      (
        await client.query<ActivityRow>(
          `SELECT a.id, a.practice_id, a.kind, a.body, a.owner_user_id, a.packet_version_id, v.version_no, a.created_by, a.created_at
             FROM case_activity a LEFT JOIN packet_version v ON v.id = a.packet_version_id
            WHERE a.case_id = $1 AND a.practice_id = $2 ORDER BY a.created_at, a.id`,
          [caseId, practiceId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  const emails = await peopleEmails(scope, practiceId, rows.flatMap((row) => [row.created_by, row.owner_user_id]));
  const person = (id: string | null) => (id === null ? null : (emails.get(id) ?? 'a former member of the practice'));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    at: row.created_at.toISOString(),
    by: person(row.created_by),
    text: cipher === null || row.body === null ? null : cipher.decrypt('case_activity.body', row.body),
    owner: person(row.owner_user_id),
    packetVersionId: row.packet_version_id,
    versionNo: row.version_no,
  }));
}

/** Adds a note to the case in the person's own name, its words encrypted with the practice's key. */
export async function addNote(scope: Scope, keys: KeyProvider, input: { readonly practiceId: string; readonly caseId: string; readonly text: string }): Promise<string> {
  const cipher = await loadPracticeCipher(scope, keys, input.practiceId);
  const { rows } = await scope.client.query<{ id: string }>(
    "INSERT INTO case_activity (practice_id, case_id, kind, body, created_by) VALUES ($1, $2, 'note', $3, app_actor_id()) RETURNING id",
    [input.practiceId, input.caseId, cipher.encrypt('case_activity.body', input.text)],
  );
  return (rows[0] as { id: string }).id;
}

/**
 * Assigns the case to a person who works the practice's cases (or leaves it unassigned): the
 * assignment is recorded, and the database makes it the case's owner. Assigning the owner the case
 * already has records nothing (false).
 */
export async function assignOwner(scope: Scope, input: { readonly practiceId: string; readonly caseId: string; readonly ownerUserId: string | null }): Promise<boolean> {
  // One assignment of a case at a time (the application role does not lock case rows for update).
  await scope.client.query("SELECT pg_advisory_xact_lock(hashtextextended('case_owner:' || $1::text, 0))", [input.caseId]);
  const { rows } = await scope.client.query<{ owner_user_id: string | null }>('SELECT owner_user_id FROM "case" WHERE id = $1 AND practice_id = $2', [input.caseId, input.practiceId]);
  const found = rows[0];
  if (found === undefined || found.owner_user_id === input.ownerUserId) {
    return false;
  }
  await scope.client.query("INSERT INTO case_activity (practice_id, case_id, kind, owner_user_id, created_by) VALUES ($1, $2, 'assigned', $3, app_actor_id())", [
    input.practiceId,
    input.caseId,
    input.ownerUserId,
  ]);
  return true;
}

/**
 * Asks a second person to approve the packet's current version (PRD 7, Packet builder: "request
 * approval"), with optional words to the approver; the database refuses a version that is not current,
 * not passing the verifier, or approved. A version already requested is left as it is (false).
 */
export async function requestApproval(
  scope: Scope,
  keys: KeyProvider,
  input: { readonly practiceId: string; readonly caseId: string; readonly versionId: string; readonly message: string | null },
): Promise<boolean> {
  // Serialized with the case's packet writes (apps/worker/src/packets/records.ts takes the same lock).
  await scope.client.query("SELECT pg_advisory_xact_lock(hashtextextended('packet:' || $1::text, 0))", [input.caseId]);
  const { rowCount } = await scope.client.query("SELECT 1 FROM case_activity WHERE practice_id = $1 AND kind = 'approval_requested' AND packet_version_id = $2", [input.practiceId, input.versionId]);
  if ((rowCount ?? 0) > 0) {
    return false;
  }
  const body = input.message === null ? null : (await loadPracticeCipher(scope, keys, input.practiceId)).encrypt('case_activity.body', input.message);
  await scope.client.query("INSERT INTO case_activity (practice_id, case_id, kind, body, packet_version_id, created_by) VALUES ($1, $2, 'approval_requested', $3, $4, app_actor_id())", [
    input.practiceId,
    input.caseId,
    body,
    input.versionId,
  ]);
  return true;
}

interface MilestoneRows {
  readonly versions: readonly { drafted_by: string; created_at: Date; version_no: number; verifier_passed: boolean; approved_by: string | null; approved_at: Date | null; approved_alone: boolean; exported_at: Date | null; export_sha256: string | null; attested_at: Date | null }[];
  readonly submissions: readonly { submitted_by: string; created_at: Date; version_no: number; dispute_level: number; channel: keyof typeof CHANNEL_TEXT }[];
  readonly responses: readonly { recorded_by: string | null; created_at: Date; kind: ResponseKindText; reopens_case: boolean }[];
}

async function milestones(scope: Scope, practiceId: string, caseId: string): Promise<MilestoneRows> {
  const { rows: versions } = await scope.client.query<MilestoneRows['versions'][number]>(
    `SELECT v.drafted_by, v.created_at, v.version_no, v.verifier_passed, v.approved_by, v.approved_at, v.approved_alone, v.exported_at, v.export_sha256, v.attested_at
       FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE p.case_id = $1 AND v.practice_id = $2 ORDER BY v.version_no`,
    [caseId, practiceId],
  );
  const { rows: submissions } = await scope.client.query<MilestoneRows['submissions'][number]>(
    `SELECT s.submitted_by, s.created_at, v.version_no, s.dispute_level, s.channel
       FROM submission s JOIN packet_version v ON v.id = s.packet_version_id WHERE s.case_id = $1 AND s.practice_id = $2 ORDER BY s.created_at, s.id`,
    [caseId, practiceId],
  );
  const { rows: responses } = await scope.client.query<MilestoneRows['responses'][number]>(
    `SELECT r.recorded_by, r.created_at, r.kind, r.reopens_case
       FROM payer_response r JOIN submission s ON s.id = r.submission_id WHERE s.case_id = $1 AND r.practice_id = $2 ORDER BY r.created_at, r.id`,
    [caseId, practiceId],
  );
  return { versions, submissions, responses };
}

/**
 * The case's whole timeline, oldest first: its opening, the line events of the page the detail shows,
 * its activity, packet versions (written, approved, exported), submissions and responses.
 */
export async function caseTimeline(
  scope: Scope,
  input: { readonly practiceId: string; readonly caseId: string; readonly openedAt: string; readonly lineEvents: readonly CaseEvent[]; readonly activity: readonly ActivityView[] },
): Promise<TimelineEvent[]> {
  const rows = await milestones(scope, input.practiceId, input.caseId);
  const emails = await peopleEmails(scope, input.practiceId, [
    ...rows.versions.flatMap((row) => [row.drafted_by, row.approved_by]),
    ...rows.submissions.map((row) => row.submitted_by),
    ...rows.responses.map((row) => row.recorded_by),
  ]);
  const person = (id: string | null) => (id === null ? null : (emails.get(id) ?? 'a former member of the practice'));
  // Who opened the case: the first line event of the opening, a person's when one opened it by hand.
  const opener = input.lineEvents.find((event) => event.kind === 'stage' && event.stage === 'actionable')?.by ?? null;
  const events: TimelineEvent[] = [{ kind: 'opened', at: input.openedAt, by: opener }];
  for (const event of input.lineEvents) {
    if (event.kind === 'stage' && event.stage !== null) {
      events.push({ kind: 'stage', at: event.at, by: event.by, position: event.position, stage: event.stage });
    } else if (event.kind === 'reopened_stage' && event.stage !== null && event.reopenedFrom !== null) {
      events.push({ kind: 'reopened_stage', at: event.at, by: event.by, position: event.position, stage: event.stage, from: event.reopenedFrom });
    } else if (event.kind === 'written_off' && event.writeOffReason !== null) {
      events.push({ kind: 'written_off', at: event.at, by: event.by, position: event.position, reason: event.writeOffReason });
    } else if (event.kind === 'reopened') {
      events.push({ kind: 'line_reopened', at: event.at, by: event.by, position: event.position });
    }
  }
  for (const item of input.activity) {
    if (item.kind === 'note') {
      events.push({ kind: 'note', at: item.at, by: item.by, text: item.text });
    } else if (item.kind === 'assigned') {
      events.push({ kind: 'assigned', at: item.at, by: item.by, owner: item.owner });
    } else {
      events.push({ kind: 'approval_requested', at: item.at, by: item.by, versionNo: item.versionNo ?? 0 });
    }
  }
  for (const row of rows.versions) {
    events.push({ kind: 'version_written', at: row.created_at.toISOString(), by: person(row.drafted_by), versionNo: row.version_no, verifierPassed: row.verifier_passed });
    if (row.approved_at !== null) {
      events.push({ kind: 'version_approved', at: row.approved_at.toISOString(), by: person(row.approved_by), versionNo: row.version_no, approvedAlone: row.approved_alone });
    }
    if (row.exported_at !== null && row.export_sha256 !== null) {
      events.push({ kind: 'version_exported', at: row.exported_at.toISOString(), by: null, versionNo: row.version_no, sha256: row.export_sha256 });
    }
    if (row.attested_at !== null) {
      events.push({ kind: 'export_attested', at: row.attested_at.toISOString(), by: null, versionNo: row.version_no });
    }
  }
  for (const row of rows.submissions) {
    events.push({ kind: 'submitted', at: row.created_at.toISOString(), by: person(row.submitted_by), versionNo: row.version_no, level: row.dispute_level, channel: row.channel });
  }
  for (const row of rows.responses) {
    events.push({ kind: 'response', at: row.created_at.toISOString(), by: person(row.recorded_by), response: row.kind, reopens: row.reopens_case });
  }
  return inOrder(events);
}
