# Database review: co-001/web-transaction-scope (head 766467cd)

Scope: the COMMIT classification (`committed`, `refusedByServer`, `transaction`) and the two-commit ordering
(`RequestSends`, `transacted`, `PgBossQueue.hold`), against PostgreSQL 18, pg 8.23.1, pg-pool 3.14.0, pg-boss 12.38.0.

Verdict: no blocker. One should-fix (D1). The rest are notes: bounded failure modes the comments do not admit.

Experiments ran against the local PostgreSQL 18 in a throwaway pg-boss schema (`pgboss_review_d`, dropped afterwards),
producer configured as `producerOptions` does (max 2, lock_timeout 3000 ms) except connectionTimeoutMillis 4000 in
place of 10000. Script: /tmp/claude-0/-home-user-PhysicalTherapy/d4ba65ad-c462-5c16-87a6-6ea8352cefd1/scratchpad/exp.mjs

## Findings

### D1 (should fix): a socket errno of five capitals is read as the server's ERROR
File: packages/db/src/authz/scope.ts:66 and :73-79.

`SQLSTATE = /^[0-9A-Z]{5}$/`, and an error with such a `code` and no `severity` is "read as the server's" (the
stand-in allowance in the comment). Node's `EPIPE` is five capitals.

- Verified: `/^[0-9A-Z]{5}$/.test('EPIPE')` is true (`ECONNRESET` false). Other errnos of that shape: EPERM, EINTR, EBUSY, ENXIO, EROFS.
- Reasoned, not reproduced: pg rejects the active query with the socket's own error, so a COMMIT whose write fails
  with EPIPE rejects with `{ code: 'EPIPE' }` and no severity. `committed()` rethrows it raw, as "rolled back for
  certain". `transacted` then rolls the held jobs back and answers a plain failure, where the design says this is
  the outcome-unknown path (jobs committed, COMMIT_OUTCOME_UNKNOWN logged).
- In practice an EPIPE on the one write that carries COMMIT means the COMMIT did not reach the server, so the
  "not saved" answer is very likely true. It is true by accident, though: the classifier is the one place that must
  be exact, and with TLS a later write could fail after the COMMIT was delivered.

Fix: require the positive evidence pg gives. Either `severity === 'ERROR'` (every pg `DatabaseError` carries it; the
experiments showed `severity: "ERROR"` on 55P03 and 40P01), or `instanceof DatabaseError`, and make the stand-ins set
a severity. That closes D2 as well.

### D2 (note): severity is compared in the server's language
File: packages/db/src/authz/scope.ts:78.

pg-protocol 1.16.1 sets `message.severity = fields.S` (dist/parser.js:307), the localized field, and ignores the
non-localized `V`. Under a non-English `lc_messages` whose FATAL or PANIC is translated (Japanese, for one), a FATAL
with an SQLSTATE at COMMIT would not equal 'FATAL' and would be read as a certain rollback. Reasoned; I could not
read the local server's `lc_messages` (no psql in the sandbox). Harmless while it is English; a positive
`severity === 'ERROR'` test fails safe (unknown) instead.

### D3 (note): two requests queuing the same singleton keys in opposite order deadlock
File: apps/web/src/lib/http/request-sends.ts:52 (insertion order kept), apps/web/src/lib/uploads/queue.ts:130-132.

New with this change: a send used to commit alone, so two requests never held uncommitted keys against each other.

- Verified (E3): A holds key x, B holds key y, then A sends y and B sends x. After 1003 ms one gets
  `40P01 deadlock detected`; that request rolls back.
- Verified (E2): with the same key in two held transactions, the second insert waits on the first's transaction and
  fails with `55P03` after 3008 ms if the first has not ended. So `ON CONFLICT DO NOTHING` is a wait, not a no-op,
  against an uncommitted holder. In normal flow the holder ends within milliseconds and the second gets null.

Both are bounded and roll the request back cleanly, with no leak (pool idle 2 of 2 afterwards). Sorting `pending`
by (type, singleton key) before `hold` removes the deadlock. Whether `refusal()` maps 40P01 from the queue to "busy"
I did not check.

### D4 (note): the two-connection producer pool is now held across the request's COMMIT
File: apps/web/src/lib/uploads/queue.ts:124-149, apps/web/src/lib/server/pools.ts (queue: 2).

- Verified (E4): with two holds open, a direct `send` and a third `beginTransaction` each fail with
  `timeout exceeded when trying to connect` after the connection timeout (10 s in production). The error has no
  SQLSTATE, so it is a plain failure, not a "busy" refusal. A third request waiting in `hold()` keeps its
  application transaction and row locks open for that wait.
- Verified (E5): pg-boss reads a queue missing from its cache on the pool, not on the `db` passed
  (`getQueueCache` to `this.getQueue`, dist/manager.js:1044-1055). Two concurrent holds sending to a queue created
  after the producer's last cache load each hold one connection and wait for a second; both failed at the timeout.
  The cache loads at `start()` and every 60 s, so the window is a web task started before the worker created its
  queues, for up to a minute. It heals itself.
- In steady state a hold lasts the remaining inserts plus two COMMITs (milliseconds), so two connections serve the
  ten-connection application pool. But anything that slows a request's COMMIT now also occupies half the producer
  pool, and public screening sends and after-commit sends share it.

The comment at queue.ts:57-67 says no connection is added to the budget. That is true, and it is what makes the
pool the bottleneck. Consider saying so, or sizing the pool for holds.

### D5 (note): the direct re-send can run a job twice
File: apps/web/src/lib/http/request-sends.ts:99-113.

The comment says "the singleton key makes one already queued a no-op". The queues are `policy: 'exclusive'`
(apps/worker/src/jobs/registry.ts:128), unique only while the job is created or active.

- Verified (E6): a send while queued returns null; a send after that job completed inserts a new job.
- So a queue COMMIT that was applied but whose answer was lost, followed by a worker finishing the job before the
  re-send, runs the job twice. This is tiny, and safe only if every job type is idempotent, which I did not check.

## Tried and could not break

- **COMMIT answered ROLLBACK.** Verified (E1b): after a swallowed `select 1/0`, `executeSql('COMMIT')` returns
  the tag ROLLBACK, so `committed()` throws `TransactionNotCommittedError`. The later ROLLBACK is a no-op and the
  connection returns to the pool clean.
- **An ERROR at COMMIT that nonetheless committed.** Reasoned: none found. PostgreSQL raises failures after the
  commit record as PANIC or WARNING; a cancelled synchronous-replication wait is a WARNING with tag COMMIT, or a
  closed connection (unknown). FATAL and PANIC go to unknown, which is the safe side.
- **ROLLBACK after an unknown COMMIT** (scope.ts:221). Reasoned: pg queues statements per connection, so it runs
  after the COMMIT and cannot undo it; on a dead connection it fails and the client is destroyed.
- **Worker jobs and other scope callers.** Reasoned: the only change is that a silently rolled-back or unanswered
  commit now throws, so a job fails and retries where it used to report success with nothing written.
  `withPublicSnapshot` (read only) still gets the tag COMMIT.
- **Visibility.** Verified (E1): a job sent with `db` is invisible to another connection before the queue's COMMIT
  (count 0), and the tag reads COMMIT. `#createJob` runs its insert only on the given `db`; the one statement on the
  pool is the cache miss in D4. `notify` is in the same statement, so it is delivered at commit.
- **Ordering.** Reasoned: `settle` runs only after the scope's promise ends, so the queue's COMMIT always follows
  the request's. Anything thrown other than `CommitOutcomeUnknownError` rolls the jobs back.
- **Leaks.** Reasoned from the code, and pool counts were idle after every experiment:
  - `hold()` rolls back on any send failure;
  - `beginTransaction` releases on a BEGIN failure and on a connection error while checked out;
  - `commit()` always ends in `rollback()`, which is idempotent, never rejects and is bounded at 5 s;
  - `settle` with no hold is a no-op;
  - both `transacted` paths call `settle`, and all three callers call `mine.hold()` as the last statement before
    the scope's COMMIT.
- **`executeSql('COMMIT')` then `rollback()` on pg-boss's handle.** Verified sound (E1, pool idle 1 of 1 after).
  It costs one extra round trip (a ROLLBACK outside a transaction, a server WARNING) per committed hold.

## Not examined
- Whether job handlers do nothing when their record is absent (the unknown-outcome path relies on it), and job idempotency.
- The process-death window between the two commits (the comment admits it and defers to an outbox table).
- An EPIPE reproduction against a real socket.
