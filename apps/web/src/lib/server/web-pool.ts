import { openPool } from '@tp/db/runtime';

/**
 * How long a web request's statement may wait for one lock before PostgreSQL refuses it (docs/adr/0092, the amendment
 * of 2026-11-11): three seconds. The bound is on each lock wait (a row, a key, an advisory lock, a table behind a
 * schema change), not on the statement or the request: a statement that takes two locks may wait twice. Two people's
 * short requests on one row pass each other in milliseconds, and a triage job holds a case's rows for a second or two,
 * so a wait this long means something holds the lock for a long transaction: a reconcile pass, minutes at real size,
 * or a request that runs a model call. Each waiting request holds one of the web's few connections, which every
 * practice shares, so the wait ends here and the request is answered `busy` (invoke.ts, lockBounded), its transaction
 * rolled back.
 */
export const WEB_LOCK_TIMEOUT_MS = 3_000;

/**
 * A pool for a web request's transactions: every connection it opens has lock_timeout set for its whole session, as a
 * connection parameter, so no statement a request issues on it, in a handler, a wrapper or a library, can wait longer
 * for a lock, and no code path can forget to set it. The web opens its request pools here and nowhere else, and its
 * queue producer's pool carries the same timeout (uploads/queue.ts); web-pool.test.ts holds both. Not a role setting:
 * the worker's login and its jobs, which may wait, are untouched.
 */
export function openWebPool(url: string, max: number): ReturnType<typeof openPool> {
  return openPool(url, max, { lockTimeoutMs: WEB_LOCK_TIMEOUT_MS });
}
