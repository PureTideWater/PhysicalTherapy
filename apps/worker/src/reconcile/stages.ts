import type { PracticeCipher } from '@tp/db/runtime';
import { type Cents, centsToString, parseCents, sumCents } from '@tp/money';

import type { Scope } from './ledger';

/**
 * Case lines' stages from the ledger, and the recoupment notice (PRD 8, The status machine; PRD 13,
 * Recoupments and reversals: "reopens the case with a note, and notifies the owner"; test matrix LED-06).
 *
 * A line moves to payer approved, and on to recovered, only where its entries hold it there
 * (ledger_line_stage, which the database also checks on every such event); it moves back, with the
 * negative entry behind it, never an edit: on a recoupment to actionable (the status machine's one way
 * back, which reopens its case: the case's state is derived from its lines), on a reversed proof to payer
 * approved. A move back carries its note (the reason, encrypted with the practice's key). Events are
 * written in no one's name by the reconcile job, and in the person's own for their manual match or
 * reversal.
 */

const RANK = { flagged: 1, validated: 2, actionable: 3, payer_approved: 4, recovered: 5 } as const;
type Stage = keyof typeof RANK;

/** The notes a move back carries: fixed sentences, never a person's words. */
export const REOPEN_NOTES = {
  recoupment: 'Reopened by the recovery ledger: the payer took money back (a recoupment) after this line was approved or recovered.',
  reversal: 'Moved back by the recovery ledger: a match that proved this line was reversed.',
  // docs/adr/0053: the practice now proves recovery by deposit, and this line's deposit has not matched yet.
  proofLevel: 'Moved back by the recovery ledger: the practice now counts recovered at deposit, and this line’s deposit has not matched yet; it returns to recovered when it does.',
} as const;

/**
 * Why a recovered line's entries now leave it payer approved: a reversal written since it reached recovered, or
 * else the practice's proof level, raised from posted to deposited (docs/adr/0053: the rule for lines already
 * recovered when the level changes).
 */
async function moveBackNote(scope: Scope, serviceLineId: string): Promise<string> {
  const { rows } = await scope.client.query<{ reversed: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM ledger_entry e
        WHERE e.service_line_id = $1 AND e.stage = 'reversed'
          AND e.created_at >= (SELECT max(s.set_at) FROM line_status s WHERE s.service_line_id = $1 AND s.stage = 'recovered')
     ) AS reversed`,
    [serviceLineId],
  );
  return rows[0]?.reversed === true ? REOPEN_NOTES.reversal : REOPEN_NOTES.proofLevel;
}

export interface StageSync {
  /** Events that moved a line forward (to payer approved or recovered). */
  readonly forward: number;
  /** Events that moved a line back. */
  readonly back: number;
}

interface LineRow {
  readonly service_line_id: string;
  readonly ledger_stage: 'payer_approved' | 'recovered' | null;
  readonly current_stage: Stage | null;
}

async function insertStage(scope: Scope, practiceId: string, serviceLineId: string, stage: Stage, setBy: string | null, reopen?: { readonly from: Stage; readonly reason: string }): Promise<void> {
  await scope.client.query('INSERT INTO line_status (practice_id, service_line_id, stage, set_by, reason, reopened_from) VALUES ($1, $2, $3, $4, $5, $6)', [
    practiceId,
    serviceLineId,
    stage,
    setBy,
    reopen?.reason ?? null,
    reopen?.from ?? null,
  ]);
}

/** Brings every case line with ledger entries to the stage its entries put it at. */
export async function syncLineStages(scope: Scope, cipher: PracticeCipher, practiceId: string, setBy: string | null): Promise<StageSync> {
  const { rows } = await scope.client.query<LineRow>(
    `SELECT cl.service_line_id, ledger_line_stage(cl.service_line_id) AS ledger_stage,
            (SELECT s.stage FROM line_status s WHERE s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) AS current_stage
       FROM case_line cl
      WHERE cl.practice_id = $1 AND EXISTS (SELECT 1 FROM ledger_entry e WHERE e.service_line_id = cl.service_line_id)
      ORDER BY cl.service_line_id`,
    [practiceId],
  );
  let forward = 0;
  let back = 0;
  for (const row of rows) {
    const target = row.ledger_stage;
    const current = row.current_stage;
    if (target !== null && (current === null || RANK[target] > RANK[current])) {
      if (target === 'recovered' && (current === null || RANK[current] < RANK.payer_approved)) {
        await insertStage(scope, practiceId, row.service_line_id, 'payer_approved', setBy);
        forward += 1;
      }
      await insertStage(scope, practiceId, row.service_line_id, target, setBy);
      forward += 1;
      continue;
    }
    if ((current === 'payer_approved' || current === 'recovered') && (target === null || RANK[target] < RANK[current])) {
      const note = target === null ? REOPEN_NOTES.recoupment : current === 'recovered' ? await moveBackNote(scope, row.service_line_id) : REOPEN_NOTES.reversal;
      await insertStage(scope, practiceId, row.service_line_id, target ?? 'actionable', setBy, { from: current, reason: cipher.encrypt('line_status.reason', note) });
      back += 1;
    }
  }
  return { forward, back };
}

export interface RecoupedEntry {
  readonly caseId: string;
  readonly entryId: string;
  readonly serviceLineId: string;
  readonly amountCents: Cents;
}

/**
 * Tells each case's owner (in the app, counts and totals only) of the recoupments a reconcile wrote
 * against it: once per case and recoupment (its first entry is the notice's subject), so a replay tells
 * no one twice. A case with no owner, or an owner who no longer reaches the practice or keeps in-app
 * notices off, tells the practice's people instead. A practice job's only (the recipients are a job's
 * to read): a recoupment a person's manual match wrote is told by the next reconcile.
 */
export async function notifyRecoupments(scope: Scope, practiceId: string, recouped: readonly RecoupedEntry[]): Promise<number> {
  if (recouped.length === 0) {
    return 0;
  }
  const people = (await scope.client.query<{ user_id: string; in_app: boolean }>('SELECT user_id, in_app FROM practice_notification_recipients()')).rows.filter((person) => person.in_app);
  let told = 0;
  for (const caseId of [...new Set(recouped.map((item) => item.caseId))]) {
    const entries = recouped.filter((item) => item.caseId === caseId);
    const owner = (await scope.client.query<{ owner_user_id: string | null }>('SELECT owner_user_id FROM "case" WHERE id = $1', [caseId])).rows[0]?.owner_user_id ?? null;
    const recipients = people.some((person) => person.user_id === owner) ? [owner as string] : people.map((person) => person.user_id);
    if (recipients.length === 0) {
      continue;
    }
    const { rowCount } = await scope.client.query(
      `INSERT INTO notification (practice_id, user_id, kind, subject_id, counts, totals_cents)
       SELECT $1, u.id, 'recoupment', $2, $3, $4 FROM unnest($5::uuid[]) AS u (id) ORDER BY u.id
       ON CONFLICT (user_id, kind, subject_id) DO NOTHING`,
      [
        practiceId,
        (entries[0] as RecoupedEntry).entryId,
        JSON.stringify({ recouped_lines: new Set(entries.map((item) => item.serviceLineId)).size }),
        JSON.stringify({ recouped: centsToString(sumCents(entries.map((item) => item.amountCents))) }),
        recipients,
      ],
    );
    told += rowCount ?? 0;
  }
  return told;
}

/** The recoupments people wrote by hand (a manual match of a lower claim): the reconcile job tells their cases' owners. */
export async function manualRecoupments(scope: Scope, practiceId: string): Promise<RecoupedEntry[]> {
  const { rows } = await scope.client.query<{ id: string; case_id: string; service_line_id: string; amount_cents: string }>(
    "SELECT e.id, e.case_id, e.service_line_id, e.amount_cents::text AS amount_cents FROM ledger_entry e WHERE e.practice_id = $1 AND e.stage = 'recouped' AND e.created_by IS NOT NULL ORDER BY e.seq",
    [practiceId],
  );
  return rows.map((row) => ({ caseId: row.case_id, entryId: row.id, serviceLineId: row.service_line_id, amountCents: parseCents(row.amount_cents) }));
}
