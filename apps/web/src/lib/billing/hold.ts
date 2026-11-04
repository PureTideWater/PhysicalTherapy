import { type PracticeScope, type ScopeClient, SUSPENSION_REASONS, type SuspensionReason, rolesPermit } from '@tp/db/runtime';

import { type HoldCause, type HoldSource, type PracticeHold, RUN_STARTING_PERMISSIONS, type RunStartingPermission, type WorkPause } from './suspension-words';

/**
 * The hold on new work at a practice, as the scope's person reads it (docs/adr/0080; design SS-01, section 5.3): Postgres
 * decides it once (practice_run_hold, on practice_work_hold, the decision the route's question and the trigger share),
 * whose hold it is, its cause, its reason and since when, and for a grantee's hold the work it stops for this person.
 * The cause already carries D6's rule: someone outside the held organization never receives suspended or nonpayment,
 * and never a reason. Here only what the person may read is added: their own organization's name, for a grantee's
 * hold, and whether they are a member of the held organization and hold its billing.
 */

interface HoldRow {
  readonly source: HoldSource;
  readonly organization_id: string;
  readonly cause: HoldCause;
  readonly reason: string | null;
  readonly since: Date | null;
  readonly stopped: string[] | null;
}

const isReason = (reason: string | null): reason is SuspensionReason => SUSPENSION_REASONS.some((known) => known === reason);
const isPermission = (permission: string): permission is RunStartingPermission => RUN_STARTING_PERMISSIONS.some((known) => known === permission);

/** The hold on new work at the practice now, for the scope's person, or null when nothing is held for them. */
export async function practiceHold(scope: PracticeScope<ScopeClient>, practiceId: string): Promise<PracticeHold | null> {
  const row = (await scope.client.query<HoldRow>('SELECT source, organization_id, cause, reason, since, stopped FROM practice_run_hold($1)', [practiceId])).rows[0];
  if (row === undefined) {
    return null;
  }
  const memberships = await scope.client.query<{ role: string }>('SELECT role FROM app_actor_memberships() WHERE organization_id = $1', [row.organization_id]);
  const member = memberships.rows.length > 0;
  const billing = member && memberships.rows.some((membership) => rolesPermit([membership.role], 'organization.billing'));
  // A member reads their own organization's row (the organization_members policy); a grantee's hold is only ever theirs.
  const name =
    row.source === 'grantee' && member ? ((await scope.client.query<{ name: string }>('SELECT name FROM organization WHERE id = $1', [row.organization_id])).rows[0]?.name ?? null) : null;
  return {
    source: row.source,
    cause: row.cause,
    reason: isReason(row.reason) ? row.reason : null,
    since: row.since,
    stopped: (row.stopped ?? []).filter(isPermission),
    name,
    viewer: member ? 'member' : 'other',
    billingHref: billing ? `/settings/billing/${row.organization_id}` : null,
  };
}

interface PauseRow {
  readonly reason: string | null;
  readonly source: HoldSource | null;
  readonly cause: HoldCause | null;
}

/**
 * Why the scope's person starts no new work needing `permission` at the practice now (practice_run_refusal_for, the
 * route wrapper's question), with whose hold it is and whether lifting it restarts the work (practice_run_hold), or null.
 * One statement, so the sentence and the hold agree.
 */
export async function workPause(scope: PracticeScope<ScopeClient>, practiceId: string, permission: RunStartingPermission): Promise<WorkPause | null> {
  const row = (
    await scope.client.query<PauseRow>('SELECT r.reason, h.source, h.cause FROM practice_run_refusal_for($1, $2) AS r(reason) LEFT JOIN practice_run_hold($1) AS h ON true', [
      practiceId,
      permission,
    ])
  ).rows[0];
  if (row?.reason === null || row?.reason === undefined || row.source === null) {
    return null;
  }
  return { reason: row.reason, source: row.source, restarts: row.cause !== 'closed' };
}

/**
 * Whether the practice's own organization holds new work at it (practice_run_hold's owner row): the hold the worker's
 * gate applies to the practice's own jobs, which see no grantee's hold in a job's scope (docs/adr/0080). A grantee's hold
 * on the person stops their own work only, never the practice's monitoring.
 */
export async function ownerHolds(scope: PracticeScope<ScopeClient>, practiceId: string): Promise<boolean> {
  const { rows } = await scope.client.query<{ held: boolean }>("SELECT EXISTS (SELECT 1 FROM practice_run_hold($1) WHERE source = 'owner') AS held", [practiceId]);
  return rows[0]?.held === true;
}
