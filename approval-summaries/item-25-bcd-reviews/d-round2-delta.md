# Item 25 (d), round 2: adversarial review of the fix delta

Scope: `git diff ac1f11f5..HEAD` on `co-001/session-end-one-transaction` (sessions.ts, scope.ts, scope.test.ts,
session-end.db.test.ts). Checked on PostgreSQL 18.4 (port 5433) and 16.15 (port 5432) with a scratch database and an
unprivileged role (both dropped afterwards), and with pg 8.23.1 as the repository resolves it. One run of
`session-end.db.test.ts` on PostgreSQL 18: 1 file, 13 tests, all passed (5.5 s). No repository file was edited.

## Findings

### D3-1 (should fix): the idle kill reaches Node as an unhandled `'error'` event on the checked-out client
- Where: `packages/db/src/authz/scope.ts:199-231` (`transaction`), `packages/db/src/connect.ts:30-36` (`openPool`);
  the trigger is new in `apps/web/src/lib/auth/sessions.ts:167` (`RESOLVE_SESSION`).
- Evidence: a pg Pool removes its own error listener from a client while it is checked out, and neither `openPool` nor
  `transaction` adds one (no `pool.on(...)` or client `on('error')` in packages/db/src or apps/web/src outside
  migrate.ts and uploads/queue.ts). A copy of `transaction()` on a real pool, bound set to 200 ms, both servers:
  - process blocked 1 s between the resolving statement and the next one (the "web task stalls" case the bound exists
    for): `uncaughtException: Connection terminated unexpectedly`, process exit;
  - an awaited 1 s gap between the statements: `uncaughtException: 25P03 terminating connection due to
    idle-in-transaction timeout`, process exit.
  The test itself had to add `client.on('error', () => undefined)` (session-end.db.test.ts, the idle-bound test) to
  survive the same kill, which production code does not do.
  With a listener attached, the path is sound: the next statement rejects (25P03 or "not queryable"), ROLLBACK fails,
  `release(true)` discards the client, and the pool's next connection works with the bound at 0.
- Reach: under `next start`, Next 16.4.3 registers a process `uncaughtException` handler that logs and continues
  (`next/dist/server/lib/router-server.js:719-722`; I did not confirm whether that registration is unconditional), so
  the web task probably survives but writes an error through Next's logger, outside the app's logger. Any other host
  of this code (a script, a test, a custom server) exits. The repository has no process-level handler of its own.
  Before this delta a 10 s stall resumed and committed; now it ends in this event.
- Smallest fix: in `openPool`, `pool.on('connect', (client) => client.on('error', () => undefined))` (the failure
  still reaches the caller through the rejected statement), or attach and remove a listener in `transaction()` around
  the work. Add a test that runs `withResolvedActor` on a real pool with a short bound and no listener of its own, and
  asserts the rejection and a working pool afterwards.

### D3-2 (should fix): no test drives the kill through `transaction()`; the idle-bound test proves the server's half only
- Where: `apps/web/src/lib/routes/session-end.db.test.ts`, "bounds the resolving transaction's idleness ...".
- Evidence: the test uses a hand-held client (`one.connect()`, BEGIN, COMMIT, `client.release(true)` by hand) with
  its own error listener. It proves the bound is set, reverts at COMMIT and that the server frees the rows. It does not
  prove what the name's second half implies for the product: that `resolveSession`/`withResolvedActor` survives the
  kill, rejects, and discards the connection (rollback fails -> `release(true)`). That is exactly where D3-1 lives.
  Reversion at ROLLBACK is also not asserted (it holds: verified by hand on 16 and 18).
- Smallest fix: the test named in D3-1, plus one `bound(client)` assertion after a ROLLBACK.

### D3-3 (note): the race test's "a faulted one among them" is proven in one ordering only
- Where: session-end.db.test.ts, "writes one event when requests race ...", second half.
- Evidence: when the sound request reaches the row first, the faulted one finds the session ended, writes no event,
  the fault is never met (`faultsMet` is not asserted) and the outcome `['resolved', ended/idle]` is accepted. The
  test is not flaky (both orderings are accepted and both leave one event), but in that ordering it shows nothing about
  a fault. The first half (three clean racers -> `['ended','ended','idle']`) is deterministic: FOR UPDATE serialises.
- Smallest fix: hold the row from the owner connection, start the faulted request, then the sound one, release; or
  accept as is and drop "a faulted one among them" from the name.

### D3-4 (note): the 1 s sleep against a 200 ms bound is timing-dependent, with wide margin
- Where: the idle-bound test, `setTimeout(resolve, 1_000)` then `expect(client.query('COMMIT')).rejects.toThrow()`.
- Evidence: 800 ms of slack; passes here. A runner stalled for more than that between the two would still fail the
  COMMIT (the server has ended the connection by then in any ordering where the timer fired), so the realistic failure
  is only a server timer that has not fired in 1 s. Low risk.
- Smallest fix (optional): poll `pg_stat_activity` from the owner until the backend is gone instead of sleeping.

### D3-5 (note): the door guards `actAs`, not the client or the scope it returned
- Where: `packages/db/src/authz/scope.ts:362-378`.
- Evidence: a kept `client` or a kept `ActorScope.client` can still send statements after release; that predates the
  delta and the comment claims only the actor. A floating `actAs` (called, not awaited, before the work returns) is
  safe: pg queues its `set_config(..., true)` ahead of COMMIT. After a failed `actAs` the door stays `used`, which
  refuses a retry; the transaction is aborted by then, so no legitimate call is lost.
- No change needed.

## Could not break

- (b) role and versions: `set_config('idle_in_transaction_session_timeout', $2, true)` is honoured for a NOSUPERUSER
  role on 16.15 and 18.4 (the setting is user-settable): `10s` inside the transaction.
- (b) shape: the statement returns exactly the function's columns (no `bound` column, even when the function has an
  output column itself named `bound`); the function body ran once per execution (a counter table: 1); plan on both
  versions is a nested loop of two function scans; a function returning zero rows gives zero rows and one row gives
  one row. A malformed value fails the statement (22023) and so the transaction; the value is a constant.
- (b) reversion: `0` after COMMIT, after ROLLBACK, after ROLLBACK TO SAVEPOINT, and after the statement run in
  autocommit, on a reused connection; the pool's next checkout showed `0`.
- (b) idle only: with a 200 ms bound, a 1.2 s wait on a row lock and a 1 s `pg_sleep` both completed and committed on
  both versions. Only time spent with no statement running counts, so a slow audit insert or a lock wait cannot hit it;
  a healthy request is idle for the microtask gap between statements (`resolveSession` awaits nothing else between
  them).
- (b) commit after a kill: the COMMIT rejects with 25P03 (a server refusal) or a connection error (reported as outcome
  unknown); neither is reported as committed.
- (b) proxies: one grep of `infra/` for pgbouncer, RDS Proxy, DBProxy, pooler: no match. A transaction-scoped
  `set_config` is in any case the form the code base already uses for `app.actor_id`.
- (a) the door: open during the work, `used` after one call, `shut` in the `finally` on return, throw and synchronous
  throw; the kept-call unit test sends nothing on the connection. No legitimate `actAs` is refused.
- (c) `inTransaction()`: filtered by `current_database()`; each failed try awaits its ROLLBACK before rejecting, so the
  count is read after the connections are back. I did not confirm how the scratch database is named per file; the run
  showed no pollution.
- (c) the `refused` fault (SELECT 1/0, code 22012) does abort the transaction on the server, and the `answer` fault
  does run the statement before losing its answer: both names match what they do.
