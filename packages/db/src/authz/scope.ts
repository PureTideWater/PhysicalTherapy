import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { ScopeError, isUuid, requireUuid } from './ids';

/**
 * The transaction API every request and job uses (PRD 3, Authorization in code; PRD 15, Request path
 * for a PHI page; CLAUDE.md conventions). Each helper takes a connection from the pool, opens a
 * transaction, sets app.actor_id and app.practice_ids with SET LOCAL (set_config(..., true)), runs the
 * caller's work and commits, so the settings never outlive the transaction:
 *
 * - withActor: identity resolution. The actor is set and the practice scope is empty, so no PHI row
 *   is visible; the actor's memberships, organizations and allowed-practice set can be read.
 * - withPracticeScope: a request. The database computes the practices the actor may reach right now
 *   (effective_practice_access(): memberships intersected with the grants in force, the actor's own
 *   group's practices, an unexpired support grant) and the scope is the requested ones among them, so
 *   a revoked or expired grant yields nothing on the next transaction. A request that asks for one
 *   snapshot (oneSnapshot) runs at REPEATABLE READ, so every statement in it reads the database as it
 *   stood at the first; every other transaction runs at READ COMMITTED.
 * - withJobScope: a job. Exactly one practice (test matrix SEC-06): a bulk job spanning practices is
 *   refused before any connection is taken. The actor is the job, of kind service, and a job ID that names
 *   a person is refused before the job's work runs, so no job acts in a person's name through this API.
 *   The worker connects as its own login, which the database tells from the web's whatever app.actor_id
 *   holds (docs/adr/0061).
 *
 * docs/adr/0013 records the model.
 */

export interface ScopeClient {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
  release(destroy?: boolean | Error): void;
}

/** A pg Pool, or anything that hands out clients the same way. */
export interface ScopePool<C extends ScopeClient> {
  connect(): Promise<C>;
}

/** The client a pool hands out: a pg PoolClient for a pg Pool (whose overloaded connect() defeats inference). */
export type ClientOf<P> = P extends Pool ? PoolClient : P extends ScopePool<infer C> ? C : never;

/** How the actor reaches a practice. A job reaches its one practice by being that practice's job. */
export type AccessVia = 'ownership' | 'grant' | 'support' | 'job';

export interface PracticeAccess {
  readonly practiceId: string;
  readonly via: AccessVia;
  /** The grant or support grant the access rests on; null for ownership and for jobs. */
  readonly grantId: string | null;
  /** Every membership role that reaches the practice (empty for a job). */
  readonly roles: readonly string[];
}

export type ScopeActorKind = 'user' | 'service';

interface BaseScope<C> {
  /** The transaction's connection: query through it (or `drizzle(scope.client)`), never release it. */
  readonly client: C;
  readonly actorId: string;
  readonly actorKind: ScopeActorKind;
  /** The practices app.practice_ids holds for this transaction, sorted. */
  readonly practiceIds: readonly string[];
  access(practiceId: string): PracticeAccess | undefined;
}

export interface ActorScope<C> extends BaseScope<C> {
  readonly kind: 'actor';
  /** The practices the actor may reach right now, from the effective-permission function. */
  allowedPracticeIds(): Promise<string[]>;
}

export interface PracticeScope<C> extends BaseScope<C> {
  readonly kind: 'practice' | 'job';
}

export type AnyScope<C> = ActorScope<C> | PracticeScope<C>;

/** A job asked for more than one practice, or for none. */
export class OnePracticePerJobError extends ScopeError {
  override readonly name = 'OnePracticePerJobError';
}

/** A job's ID named a person: a job never acts in a person's name. */
export class JobActorIsPersonError extends ScopeError {
  override readonly name = 'JobActorIsPersonError';
}

/**
 * Runs `open` then `run` in one transaction on one connection. A failure anywhere rolls back; a
 * connection whose rollback fails is destroyed rather than returned to the pool.
 */
async function transaction<P extends ScopePool<ScopeClient>, S, T>(
  pool: P,
  open: (client: ClientOf<P> & ScopeClient) => Promise<S>,
  run: (scope: S) => Promise<T>,
  begin: 'BEGIN' | 'BEGIN ISOLATION LEVEL REPEATABLE READ' = 'BEGIN',
): Promise<T> {
  const client = (await pool.connect()) as ClientOf<P> & ScopeClient;
  try {
    await client.query(begin);
  } catch (error) {
    client.release(true);
    throw error;
  }
  let discard = false;
  try {
    const result = await run(await open(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

const VIA_ORDER: readonly AccessVia[] = ['ownership', 'grant', 'support'];

interface AccessRow {
  readonly practice_id: string;
  readonly via: string;
  readonly grant_id: string | null;
  readonly role: string;
}

function isVia(value: string): value is AccessVia {
  return (VIA_ORDER as readonly string[]).includes(value);
}

/**
 * One PracticeAccess per practice from effective_practice_access() rows. When the actor reaches a
 * practice more than one way, ownership wins over a grant and a grant over a support grant (the
 * lowest grant ID breaks a tie), so the audit trail names one route deterministically.
 */
export function accessByPractice(rows: readonly AccessRow[]): Map<string, PracticeAccess> {
  const ordered = [...rows].sort((a, b) => {
    const via = VIA_ORDER.indexOf(a.via as AccessVia) - VIA_ORDER.indexOf(b.via as AccessVia);
    return via !== 0 ? via : (a.grant_id ?? '').localeCompare(b.grant_id ?? '');
  });
  const access = new Map<string, PracticeAccess>();
  for (const row of ordered) {
    if (!isVia(row.via)) {
      throw new ScopeError('the effective-permission function returned an unknown route');
    }
    const known = access.get(row.practice_id);
    if (known === undefined) {
      access.set(row.practice_id, { practiceId: row.practice_id, via: row.via, grantId: row.grant_id, roles: [row.role] });
    } else if (!known.roles.includes(row.role)) {
      access.set(row.practice_id, { ...known, roles: [...known.roles, row.role].sort() });
    }
  }
  return access;
}

const SET_ACTOR = "SELECT set_config('app.actor_id', $1, true)";

/** Identity resolution: the actor is set, no practice is in scope. */
export function withActor<P extends ScopePool<ScopeClient>, T>(pool: P, actorId: string, run: (scope: ActorScope<ClientOf<P>>) => Promise<T>): Promise<T> {
  const actor = requireUuid(actorId, 'actorId');
  return transaction(
    pool,
    async (client): Promise<ActorScope<ClientOf<P>>> => {
      await client.query(`${SET_ACTOR}, set_config('app.practice_ids', '{}', true)`, [actor]);
      return {
        kind: 'actor',
        client,
        actorId: actor,
        actorKind: 'user',
        practiceIds: [],
        access: () => undefined,
        allowedPracticeIds: async () => {
          const { rows } = await client.query<{ ids: string[] }>('SELECT allowed_practice_ids() AS ids');
          return rows[0]?.ids ?? [];
        },
      };
    },
    run,
  );
}

export interface PracticeScopeRequest {
  readonly actorId: string;
  /** The practices the request is about; the scope is those the actor may reach right now. */
  readonly practiceIds: readonly string[];
  /**
   * Every statement reads one snapshot: the transaction runs at REPEATABLE READ, so what it reads in its
   * first statement and its last agree, whatever commits in between. For a page whose figures sit beside
   * the rows they come from (the ledger's totals beside its lines' stages and entries), whose only writes
   * are its audit events. A step that writes stays at READ COMMITTED, where the pricing locks hold and are
   * required (docs/adr/0061).
   */
  readonly oneSnapshot?: boolean;
}

/** A request's transaction, scoped to the requested practices the actor may reach right now. */
export function withPracticeScope<P extends ScopePool<ScopeClient>, T>(
  pool: P,
  request: PracticeScopeRequest,
  run: (scope: PracticeScope<ClientOf<P>>) => Promise<T>,
): Promise<T> {
  const actor = requireUuid(request.actorId, 'actorId');
  const requested = [...new Set(request.practiceIds.map((id) => requireUuid(id, 'every practice ID')))].sort();
  return transaction(
    pool,
    async (client): Promise<PracticeScope<ClientOf<P>>> => {
      await client.query(SET_ACTOR, [actor]);
      const { rows } = await client.query<AccessRow>('SELECT practice_id, via, grant_id, role FROM open_practice_scope($1::uuid[])', [requested]);
      const access = accessByPractice(rows);
      return {
        kind: 'practice',
        client,
        actorId: actor,
        actorKind: 'user',
        practiceIds: [...access.keys()].sort(),
        access: (practiceId) => access.get(practiceId),
      };
    },
    run,
    request.oneSnapshot === true ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN',
  );
}

export interface JobScopeRequest {
  /** The queue's job ID: the actor of everything the job does. */
  readonly jobId: string;
  /** The job's one practice. */
  readonly practiceId: string;
}

const JOB_KEYS = new Set(['jobId', 'practiceId']);

/** Refuses anything but one job and one practice; returns them normalized. */
export function onePracticeJob(request: JobScopeRequest): { jobId: string; practiceId: string } {
  const given = request as unknown as Record<string, unknown>;
  const practice = given.practiceId;
  if (Object.keys(given).some((key) => !JOB_KEYS.has(key)) || Array.isArray(practice) || !isUuid(typeof practice === 'string' ? practice.toLowerCase() : practice)) {
    throw new OnePracticePerJobError('a job runs for exactly one practice; a bulk job spanning practices is refused by design');
  }
  return { jobId: requireUuid(given.jobId, 'jobId'), practiceId: (practice as string).toLowerCase() };
}

/** A job's transaction, scoped to its one practice. */
export function withJobScope<P extends ScopePool<ScopeClient>, T>(pool: P, request: JobScopeRequest, run: (scope: PracticeScope<ClientOf<P>>) => Promise<T>): Promise<T> {
  const { jobId, practiceId } = onePracticeJob(request);
  const access: PracticeAccess = { practiceId, via: 'job', grantId: null, roles: [] };
  return transaction(
    pool,
    async (client): Promise<PracticeScope<ClientOf<P>>> => {
      // ARRAY[$2::uuid] holds one element by construction: the database never sees a list from a job.
      await client.query(`${SET_ACTOR}, set_config('app.practice_ids', ARRAY[$2::uuid]::text, true)`, [jobId, practiceId]);
      // A job's ID is the queue's, never a user's: one that names a person would make the job that person.
      const { rows } = await client.query<{ person: boolean }>('SELECT app_actor_is_person() AS person');
      if (rows[0]?.person === true) {
        throw new JobActorIsPersonError('a job ID names no person; a job never acts in a person\'s name');
      }
      return {
        kind: 'job',
        client,
        actorId: jobId,
        actorKind: 'service',
        practiceIds: [practiceId],
        access: (id) => (id === practiceId ? access : undefined),
      };
    },
    run,
  );
}
