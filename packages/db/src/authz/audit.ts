import { ScopeError, requireUuid } from './ids';
import type { AnyScope, PracticeScope, ScopeClient } from './scope';

/**
 * The audit trail (PRD 6 Audit log; PRD 16; .claude/rules/privacy-and-tenant.md). Every PHI read goes
 * through readWithAudit(): the read and one audit_event per object it returned are written in the
 * same transaction, so a read whose audit row cannot be written fails with it. Every other audited
 * action records one event with recordAuditEvent(). Events carry codes and opaque IDs only; the
 * database refuses anything else (and refuses UPDATE and DELETE on audit_event for every role).
 */

const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function requireCode(value: string, what: string): string {
  if (!CODE.test(value)) {
    throw new ScopeError(`${what} must be a lowercase code (letters, digits and underscores)`);
  }
  return value;
}

function requireRequestId(value: string): string {
  if (!REQUEST_ID.test(value)) {
    throw new ScopeError('requestId must be an opaque request or job identifier');
  }
  return value;
}

export interface ReadContext {
  /** What was read: the table or view, as a code (claim, service_line, packet_version). */
  readonly objectType: string;
  /** Why it was read, as a code (case_review, packet_build, export). */
  readonly purpose: string;
  /** The request (or job) ID the read belongs to. */
  readonly requestId: string;
}

/** The object one returned row is, and the practice it belongs to. */
export interface AuditTarget {
  readonly objectId: string;
  readonly practiceId: string;
}

/** For rows that carry their own id and practiceId, as Drizzle selects them. */
export function rowTarget(row: { readonly id: string; readonly practiceId: string }): AuditTarget {
  return { objectId: row.id, practiceId: row.practiceId };
}

const INSERT_EVENTS = `INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id)
  SELECT $1::uuid, $2, $3, $4, t.object_id, t.practice_id, t.grant_id, $5, $6
    FROM unnest($7::uuid[], $8::uuid[], $9::uuid[]) AS t (object_id, practice_id, grant_id)`;

/**
 * Runs `read` inside the scope's transaction and records an audit_event (actor, action "read",
 * object type and ID, practice, grant, purpose, request ID) for every row it returns, before
 * returning them. A row outside the scope's practices is refused: it cannot be audited against a
 * grant, and under the policies it cannot have been read.
 */
export async function readWithAudit<C extends ScopeClient, R>(
  scope: PracticeScope<C>,
  context: ReadContext,
  read: (client: C) => Promise<readonly R[]>,
  identify: (row: R) => AuditTarget,
): Promise<R[]> {
  const objectType = requireCode(context.objectType, 'objectType');
  const purpose = requireCode(context.purpose, 'purpose');
  const requestId = requireRequestId(context.requestId);
  const rows = [...(await read(scope.client))];
  if (rows.length === 0) {
    return rows;
  }
  const objectIds: string[] = [];
  const practiceIds: string[] = [];
  const grantIds: (string | null)[] = [];
  for (const row of rows) {
    const target = identify(row);
    const practiceId = requireUuid(target.practiceId, 'every audited row’s practice');
    const access = scope.access(practiceId);
    if (access === undefined) {
      throw new ScopeError('a read returned a row outside the scope’s practices; it cannot be audited');
    }
    objectIds.push(requireUuid(target.objectId, 'every audited row’s object ID'));
    practiceIds.push(practiceId);
    grantIds.push(access.grantId);
  }
  await scope.client.query(INSERT_EVENTS, [scope.actorId, scope.actorKind, 'read', objectType, purpose, requestId, objectIds, practiceIds, grantIds]);
  return rows;
}

export interface AuditEventInput {
  /** What was done, as a code (grant_revoked, membership_ended, sign_in). Reads use readWithAudit. */
  readonly action: string;
  readonly objectType: string;
  readonly objectId?: string;
  /** The practice the action concerns; it must be in the scope. Omit for an action outside any practice. */
  readonly practiceId?: string;
  readonly purpose?: string;
  readonly requestId: string;
}

/** Records one audit event for the scope's actor. */
export async function recordAuditEvent<C extends ScopeClient>(scope: AnyScope<C>, event: AuditEventInput): Promise<void> {
  const action = requireCode(event.action, 'action');
  if (action === 'read') {
    throw new ScopeError('reads are recorded by readWithAudit');
  }
  const objectType = requireCode(event.objectType, 'objectType');
  const purpose = event.purpose === undefined ? null : requireCode(event.purpose, 'purpose');
  const requestId = requireRequestId(event.requestId);
  const objectId = event.objectId === undefined ? null : requireUuid(event.objectId, 'objectId');
  let practiceId: string | null = null;
  let grantId: string | null = null;
  if (event.practiceId !== undefined) {
    practiceId = requireUuid(event.practiceId, 'practiceId');
    const access = scope.access(practiceId);
    if (access === undefined) {
      throw new ScopeError('an audited action names a practice outside the scope');
    }
    grantId = access.grantId;
  }
  await scope.client.query(INSERT_EVENTS, [scope.actorId, scope.actorKind, action, objectType, purpose, requestId, [objectId], [practiceId], [grantId]]);
}
