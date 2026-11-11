import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { openedPool } from '../connect';
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
 * - withPublicSnapshot: a public page's reads (no actor, no practice in scope) in one snapshot: a
 *   read-only transaction at REPEATABLE READ, oneSnapshot's counterpart for a page nobody signs in to,
 *   which reads only what definer's-rights functions granted to the application role return.
 *
 * A request's or a job's scope opened on a pool openPool opened is recorded here while its transaction is open, so
 * openScopeReaches can tell it from an object of the same shape (combined audit item 120's review, P12).
 *
 * docs/adr/0013 records the model.
 */

export interface ScopeClient {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
  release(destroy?: boolean | Error): void;
}

/**
 * A transaction's COMMIT was answered, and the answer was not COMMIT: PostgreSQL ends a transaction in which a
 * statement failed with the tag ROLLBACK and no error, so work whose code swallowed a statement's error would be
 * reported as done with nothing written. Nothing of the transaction was saved, its audit event included. The message
 * holds no statement, value or identifier.
 */
export class TransactionNotCommittedError extends ScopeError {
  override readonly name = 'TransactionNotCommittedError';
  constructor() {
    super('the transaction was rolled back at its commit: nothing was saved');
  }
}

/**
 * A transaction's COMMIT ended without the server's word on it (the connection ended, or the server ended the
 * session): the commit may or may not have been made, so the work is neither done nor undone as far as its caller can
 * know. The cause is kept for a debugger and is never logged: pg's words can hold a statement.
 */
export class CommitOutcomeUnknownError extends ScopeError {
  override readonly name = 'CommitOutcomeUnknownError';
  constructor(cause: unknown) {
    super('the transaction’s commit ended without an answer: whether it was saved is not known', { cause });
  }
}

/** An SQLSTATE: five characters of digits and upper-case letters. Node's own codes can have the same shape (EPIPE), so it is never read alone. */
const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * Whether the server itself refused the statement with an ERROR, which rolls its transaction back for certain: an
 * SQLSTATE and the severity ERROR, both. Anything else is not known to be a rollback: a severity that ends the session
 * (FATAL, PANIC: the commit may have been made before the session ended), a socket's failure (whose code can have an
 * SQLSTATE's shape and has no severity), and a severity in another language than English (pg reads the localized
 * field alone; the deployment's lc_messages is English, and the unknown side is the safe one).
 */
function refusedByServer(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { code, severity } = error as { readonly code?: unknown; readonly severity?: unknown };
  return typeof code === 'string' && SQLSTATE.test(code) && severity === 'ERROR';
}

/** What commits: a connection with a transaction open, as far as `committed` uses it (a pg client, or a queue's transaction). */
export interface Committing {
  query(text: string): Promise<{ readonly command?: unknown } | undefined>;
}

/**
 * Commits the client's open transaction and reads the answer, which a bare `COMMIT` does not (docs/adr/0092, the
 * amendment of 2026-11-11, item 4 of its follow-ups): returns only when the server answered COMMIT. A transaction
 * that had failed is answered ROLLBACK, and this throws TransactionNotCommittedError; an ERROR of the server's own
 * (a deferred constraint, a serialization failure, a lock timeout) is rethrown as it is, the transaction rolled back
 * for certain; any other end is CommitOutcomeUnknownError. Every scope here commits through it; a caller that writes
 * its own transaction may too.
 */
export async function committed(client: Committing): Promise<void> {
  let answer: { readonly command?: unknown } | undefined;
  try {
    answer = await client.query('COMMIT');
  } catch (error) {
    throw refusedByServer(error) ? error : new CommitOutcomeUnknownError(error);
  }
  if (answer?.command !== 'COMMIT') {
    throw new TransactionNotCommittedError();
  }
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
 * A transaction's bound on its lock waits, for a caller that asks for one: PostgreSQL's lock_timeout, set as the
 * transaction's first statement after BEGIN and for that transaction only (set_config's is_local), so every later
 * wait in it for a lock, the scope's own opening read included, ends after this many milliseconds, and the pooled
 * connection never carries the setting to other work. A web request's (docs/adr/0092, the amendment of 2026-11-11);
 * a job gives none and may wait.
 */
export interface LockWaitBound {
  readonly lockTimeoutMs?: number;
}

const SET_LOCK_TIMEOUT = "SELECT set_config('lock_timeout', $1, true)";

/** The most PostgreSQL takes for lock_timeout: an integer setting, in milliseconds. */
const MAX_LOCK_TIMEOUT_MS = 2_147_483_647;

/**
 * The bound as the setting's text, or none; refused before any connection is taken when it is not a whole number of
 * milliseconds above zero that PostgreSQL would take.
 */
function lockTimeoutText(bound: LockWaitBound): string | undefined {
  if (bound.lockTimeoutMs === undefined) {
    return undefined;
  }
  if (!Number.isInteger(bound.lockTimeoutMs) || bound.lockTimeoutMs <= 0 || bound.lockTimeoutMs > MAX_LOCK_TIMEOUT_MS) {
    throw new ScopeError('lockTimeoutMs must be a whole number of milliseconds above zero');
  }
  return String(bound.lockTimeoutMs);
}

/**
 * Runs `open` then `run` in one transaction on one connection. A failure anywhere rolls back; a
 * connection whose rollback fails is destroyed rather than returned to the pool. The work's result is returned only
 * when the server answered COMMIT (committed): a transaction rolled back at its commit throws, so no caller reports
 * work as saved that was not. With `lockTimeout`, the transaction's
 * lock waits are bounded from its first statement (LockWaitBound).
 */
async function transaction<P extends ScopePool<ScopeClient>, S, T>(
  pool: P,
  open: (client: ClientOf<P> & ScopeClient) => Promise<S>,
  run: (scope: S) => Promise<T>,
  begin: 'BEGIN' | 'BEGIN ISOLATION LEVEL REPEATABLE READ' | 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' = 'BEGIN',
  lockTimeout?: string,
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
    if (lockTimeout !== undefined) {
      await client.query(SET_LOCK_TIMEOUT, [lockTimeout]);
    }
    const result = await run(await open(client));
    await committed(client);
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

/** What a scope this module opened on a pool openPool opened proves: its access as the database answered it. */
interface OpenedScope {
  readonly access: (practiceId: string) => PracticeAccess | undefined;
  open: boolean;
}

/** The request and job scopes opened on a pool openPool opened: module-private, so only this module adds to it. */
const openedScopes = new WeakMap<object, OpenedScope>();

/** The scope as its opener returns it, recorded with the access it was built with when the pool is one openPool opened. */
function opened<S extends object>(pool: object, scope: S, access: OpenedScope['access']): S {
  if (openedPool(pool) !== undefined) {
    openedScopes.set(scope, { access, open: false });
  }
  return scope;
}

/** Runs the caller's work on the scope, a recorded scope marked open while the work runs and closed when it ends. */
async function recorded<S extends object, T>(scope: S, run: (scope: S) => Promise<T>): Promise<T> {
  const entry = openedScopes.get(scope);
  if (entry === undefined) {
    return run(scope);
  }
  entry.open = true;
  try {
    return await run(scope);
  } finally {
    entry.open = false;
  }
}

/**
 * Whether the scope is one withPracticeScope or withJobScope opened on a pool openPool opened, its transaction still
 * open, that reaches the practice: an access route to it (the scope's practices are exactly those it has a route to),
 * read from this module's record of what the database answered when the scope opened, never from the object's own
 * properties. A copy, an object of the same shape, a scope opened on a stub pool and one kept past its transaction all
 * answer false (combined audit item 120's review, P12: the contract screen's practice check takes the caller's scope
 * as its proof of reach).
 */
export function openScopeReaches(scope: unknown, practiceId: string): boolean {
  const entry = typeof scope === 'object' && scope !== null ? openedScopes.get(scope) : undefined;
  return entry?.open === true && entry.access(practiceId) !== undefined;
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

/** The actor's scope on a connection whose transaction is open: the actor set for that transaction only, no practice in scope. */
async function actorScope<C extends ScopeClient>(client: C, actor: string): Promise<ActorScope<C>> {
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
}

/** Identity resolution: the actor is set, no practice is in scope. `bound`: the transaction's lock waits, for a web request (LockWaitBound). */
export function withActor<P extends ScopePool<ScopeClient>, T>(
  pool: P,
  actorId: string,
  run: (scope: ActorScope<ClientOf<P>>) => Promise<T>,
  bound: LockWaitBound = {},
): Promise<T> {
  const actor = requireUuid(actorId, 'actorId');
  const lockTimeout = lockTimeoutText(bound);
  return transaction(pool, (client) => actorScope(client, actor), run, 'BEGIN', lockTimeout);
}

/**
 * Identity resolution that begins before the actor is known: a session cookie's, whose user only the database can
 * name. The work starts on the bare connection, with no actor and no practice set, and may then act as the user the
 * database named, once, in the same transaction: `actAs` sets the actor (and an empty practice scope) for the rest of
 * it and answers the actor's scope. So what the database did while naming the user (ending a session past its limit)
 * and what is recorded in that user's name (the audit event of that end) commit together or not at all, through
 * `committed` like every scope here (Queues item 25 (d)). No lock timeout: a session's paths are deliberately not
 * under the web's (docs/adr/0092, the amendment of 2026-11-11).
 */
export function withResolvedActor<P extends ScopePool<ScopeClient>, T>(
  pool: P,
  run: (client: ClientOf<P> & ScopeClient, actAs: (actorId: string) => Promise<ActorScope<ClientOf<P>>>) => Promise<T>,
): Promise<T> {
  return transaction(
    pool,
    (client) => Promise.resolve(client),
    async (client) => {
      // The one door to an actor: open while the work runs, used once, shut when the work ends however it ends, so a
      // call kept past it can never set an actor on a connection the pool has handed to other work.
      let door: 'open' | 'used' | 'shut' = 'open';
      try {
        return await run(client, async (actorId) => {
          const actor = requireUuid(actorId, 'actorId');
          if (door !== 'open') {
            throw new ScopeError(door === 'used' ? 'a resolved transaction acts as one user, once' : 'a resolved transaction’s work has ended: it names no actor now');
          }
          door = 'used';
          return actorScope(client, actor);
        });
      } finally {
        door = 'shut';
      }
    },
  );
}

export interface PracticeScopeRequest extends LockWaitBound {
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
  const lockTimeout = lockTimeoutText(request);
  return transaction(
    pool,
    async (client): Promise<PracticeScope<ClientOf<P>>> => {
      await client.query(SET_ACTOR, [actor]);
      const { rows } = await client.query<AccessRow>('SELECT practice_id, via, grant_id, role FROM open_practice_scope($1::uuid[])', [requested]);
      const access = accessByPractice(rows);
      const reach = (practiceId: string) => access.get(practiceId);
      const scope: PracticeScope<ClientOf<P>> = {
        kind: 'practice',
        client,
        actorId: actor,
        actorKind: 'user',
        practiceIds: [...access.keys()].sort(),
        access: reach,
      };
      return opened(pool, scope, reach);
    },
    (scope) => recorded(scope, run),
    request.oneSnapshot === true ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN',
    lockTimeout,
  );
}

/**
 * A public page's reads in one snapshot: one read-only transaction at REPEATABLE READ with no actor and no practice
 * in scope, so every statement reads the database as it stood at the first and one now(), and a row another
 * transaction deletes between two reads is read whole or not at all (the free screening's result page, read by its
 * link; docs/adr/0062). It writes nothing; a write in it fails.
 */
export function withPublicSnapshot<P extends ScopePool<ScopeClient>, T>(pool: P, run: (client: ClientOf<P> & ScopeClient) => Promise<T>): Promise<T> {
  return transaction(pool, (client) => Promise.resolve(client), run, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
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
      const reach = (id: string) => (id === practiceId ? access : undefined);
      const scope: PracticeScope<ClientOf<P>> = {
        kind: 'job',
        client,
        actorId: jobId,
        actorKind: 'service',
        practiceIds: [practiceId],
        access: reach,
      };
      return opened(pool, scope, reach);
    },
    (scope) => recorded(scope, run),
  );
}
