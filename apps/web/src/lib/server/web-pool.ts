import { openPool } from '@tp/db/runtime';

/**
 * How long a web request's statement may wait for a lock before PostgreSQL refuses it (docs/adr/0092, the amendment of
 * 2026-11-11): three seconds. Two people's requests on one row pass each other in milliseconds, and a triage job holds
 * a case's rows for a second or two, so a wait this long means something holds the row for its whole transaction: a
 * reconcile pass, minutes at real size. Each waiting request holds one of the web's few connections, which every
 * practice shares, so the wait ends here and the request is answered `busy` (invoke.ts), writing nothing.
 */
export const WEB_LOCK_TIMEOUT_MS = 3_000;

/**
 * A pool for a web request's transactions: every connection it opens has lock_timeout set for its whole session, as a
 * connection parameter, so no statement a request issues on it, in a handler, a wrapper or a library, can wait longer,
 * and no code path can forget to set it. The web opens its request pools here and nowhere else (web-pool.test.ts holds
 * that). Not a role setting: the worker's login and its jobs, which may wait, are untouched.
 */
export function openWebPool(url: string, max: number): ReturnType<typeof openPool> {
  return openPool(url, max, { lockTimeoutMs: WEB_LOCK_TIMEOUT_MS });
}
