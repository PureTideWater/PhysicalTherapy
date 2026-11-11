/**
 * How long a web request waits for one lock before PostgreSQL refuses it (docs/adr/0092, the amendment of 2026-11-11):
 * three seconds. Two people's short requests on one row pass each other in milliseconds, and a triage job holds a
 * case's rows for a second or two, so a wait this long means something holds the lock for a long transaction: a
 * reconcile pass, minutes at real size, or a request that runs a model call. Each waiting request holds one of the
 * web's few connections, which every practice shares, so the wait ends here and the request is answered `busy`
 * (http/invoke.ts), its transaction rolled back.
 *
 * Where it is set: on every transaction the routes' wrapper opens for a signed-in request (http/invoke.ts, BOUNDED:
 * the scope sets it as the transaction's first statement, before its own opening read), and on the queue producer's
 * pool (uploads/queue.ts), whose sends a handler makes while that transaction is open. Nowhere else: sign-in, the
 * session's read, the rate limit's count, the public forms, and billing's, the e-signature vendor's and the model
 * gateway's pools wait as they always have, since they commit in steps or must never give a write up, and none of
 * them meets a lock a reconcile pass holds.
 *
 * PostgreSQL applies it to each wait for a lock (a row, a key behind a foreign key or a unique index, an advisory
 * lock, a table behind a schema change), not to the statement or the request: a statement that takes two locks may
 * wait twice.
 */
export const WEB_LOCK_TIMEOUT_MS = 3_000;

/**
 * pg's lock_timeout for a pool of connections that run single statements of their own (the queue producer's), as the
 * pool's own setting: sent with each connection's startup parameters. A database URL cannot undo it silently: pg lets
 * a URL's query replace a pool's own settings, so a URL that names lock_timeout is refused, in words that never hold
 * the URL. (A URL's `options` cannot replace it: the server applies a startup parameter after them. A production
 * login's URL carries `options` for its role, infra/lib/launch.ts, and pg sends both.)
 */
export function lockTimeoutParameter(url: string): { readonly lock_timeout: number } {
  let query: URLSearchParams;
  try {
    query = new URL(url).searchParams;
  } catch {
    // Never the parser's own error, which holds the URL and its password.
    throw new Error('the database URL could not be read to check that it sets no lock_timeout');
  }
  if (query.has('lock_timeout')) {
    throw new Error('the database URL sets lock_timeout itself, which would replace the pool’s own: take it out of the URL');
  }
  return { lock_timeout: WEB_LOCK_TIMEOUT_MS };
}
