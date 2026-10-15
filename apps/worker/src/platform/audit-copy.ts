import { OWNER_ROLE, retainUntil } from '@tp/db';

import type { ObjectStore, PutOutcome } from '../storage/object-store';
import { sha256Hex } from '../storage/object-store';

/**
 * The nightly audit copy (PRD 6 Audit log: "nightly copy to write-once storage"; PRD 16; Data
 * dictionary audit_event): every audit_event of one UTC day, as JSON lines in a fixed column order
 * sorted by time and ID, written once to the object store with seven years of retention (PRD 19).
 *
 * Idempotent per day: a closed day's rows never change (audit_event is append-only and its `at` is
 * set by the database), so a re-run produces the same bytes and the store answers "unchanged"; a
 * copy that differs from its day is refused by the store, which is the alarm. A day is copied only
 * once it is over. The copy reads through the owner role (the operator path), whose policy reads the
 * whole log; audit_event holds codes and opaque IDs only, never PHI.
 */

export const AUDIT_COPY_CONTENT_TYPE = 'application/x-ndjson';
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export class AuditCopyError extends Error {
  override readonly name = 'AuditCopyError';
}

export interface OperatorClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** The UTC calendar day before `now`, as YYYY-MM-DD. */
export function previousDay(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString().slice(0, 10);
}

/** The day's start (UTC) after checking it is a real calendar day. */
function dayStart(day: string): Date {
  const match = DAY.exec(day);
  const start = match === null ? new Date(Number.NaN) : new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== day) {
    throw new AuditCopyError('the audit copy names a calendar day, YYYY-MM-DD');
  }
  return start;
}

/** audit-events/v1/<year>/<month>/<day>.jsonl: opaque, and one object per day. */
export function auditCopyKey(day: string): string {
  dayStart(day);
  const [year, month, date] = day.split('-');
  return `audit-events/v1/${year ?? ''}/${month ?? ''}/${date ?? ''}.jsonl`;
}

const DAY_ROWS = `
  SELECT json_build_object(
           'id', id,
           'at', to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
           'actor_id', actor_id, 'actor_kind', actor_kind, 'action', action,
           'object_type', object_type, 'object_id', object_id, 'practice_id', practice_id,
           'grant_id', grant_id, 'purpose', purpose, 'request_id', request_id
         )::text AS line
    FROM audit_event
   WHERE at >= ($1::date)::timestamp AT TIME ZONE 'UTC'
     AND at < ($1::date + 1)::timestamp AT TIME ZONE 'UTC'
   ORDER BY at, id`;

export interface AuditCopyResult {
  readonly day: string;
  readonly key: string;
  readonly rows: number;
  readonly sha256: string;
  readonly outcome: PutOutcome;
}

export interface AuditCopyOptions {
  /** An owner-capable connection (it can SET ROLE to the owner). */
  readonly client: OperatorClient;
  readonly store: ObjectStore;
  readonly day: string;
  readonly now?: Date;
}

/** Copies one closed UTC day of audit_event to write-once storage. */
export async function copyAuditDay(options: AuditCopyOptions): Promise<AuditCopyResult> {
  const start = dayStart(options.day);
  const now = options.now ?? new Date();
  const end = new Date(start.getTime() + 86_400_000);
  if (end.getTime() > now.getTime()) {
    throw new AuditCopyError('a day is copied once it is over');
  }
  const { client } = options;
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  let lines: string[];
  try {
    await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    lines = ((await client.query(DAY_ROWS, [options.day])).rows as { line: string }[]).map((row) => row.line);
  } finally {
    await client.query('ROLLBACK');
  }
  const body = Buffer.from(lines.map((line) => `${line}\n`).join(''), 'utf8');
  const key = auditCopyKey(options.day);
  const outcome = await options.store.putImmutable({
    key,
    body,
    contentType: AUDIT_COPY_CONTENT_TYPE,
    retainUntil: retainUntil('audit', { createdAt: end }),
  });
  return { day: options.day, key, rows: lines.length, sha256: sha256Hex(body), outcome };
}
