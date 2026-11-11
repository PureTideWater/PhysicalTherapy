# The web's transaction scope: three faults, one PR (Queues item 25 (a))

W12 (acting Lane B), 2026-11-11. Branch `co-001/web-transaction-scope`, base 3bff4fd6. **No migration, table, index,
function or grant.** Every option is judged under the founder's standing rule of 2026-10-18; where the best option
needs a migration it is recorded below as "for Lane A" and the best option that needs none is built.

## Fault 1: the scope does not read COMMIT's answer

**Today.** `transaction()` (`packages/db/src/authz/scope.ts`) awaits `COMMIT` and returns the work's result. PostgreSQL
answers a `COMMIT` sent in a failed transaction with the command tag `ROLLBACK` and no error. So a transaction whose
statement failed and whose error the caller's code swallowed is reported as done: the web answers `ok` ("Saved"), runs
the after-commit work, and nothing was written, the audit event included.

**Fix.** The scope reads the answer. Three ends of a `COMMIT`, told apart in one place (the scope, so the worker's
jobs and the gateway get the same truth):

| COMMIT's end | Meaning | The scope throws |
| --- | --- | --- |
| tag `COMMIT` | saved | nothing; the result is returned |
| tag `ROLLBACK` (any tag but `COMMIT`) | not saved, certainly | `TransactionNotCommittedError` |
| the server's ERROR with an SQLSTATE (a deferred constraint, 40001, 40P01, 55P03) | not saved, certainly | the error itself, as today, so the routes' own mapping of codes stands |
| anything else (the connection ended, FATAL or PANIC, no SQLSTATE) | **unknown**: the commit may have been made | `CommitOutcomeUnknownError` (the cause kept, never logged) |

Neither new error's message holds a statement, a value or an identifier.

**Where it bites in the web (found in the build).** A mutation's audit event is the statement after its handler, and
PostgreSQL refuses it in a failed transaction (25P02), so a mutation whose handler swallowed an error was already a
server error, not "Saved". The false `ok` is reached where no statement of the wrapper's follows the handler's: a
download or another read of kind `handler`, answered with rows whose audit events were rolled back; and a job's scope
in the worker, reported complete. Both are closed by the one change in the scope.

**What the person sees.** Not saved, certainly: the request fails as any server fault does (the error state, "Something
went wrong", with its reference; a JSON client gets 500). Never "Saved". The request key was rolled back with the
rest, so sending again does the work. Logged by code `COMMIT_NOT_APPLIED` and the request's ID. A swallowed statement
error is a fault in a handler, so the fault's own state is the true one; a known code at COMMIT (a lock timeout, a
rule the records keep) keeps the refusal it already has. Unknown: the same error state, logged as
`COMMIT_OUTCOME_UNKNOWN`; it is not said to be saved or unsaved, because neither is known.

**What the audit event records.** Nothing, in both certain cases: the event is a row of the same transaction (CLAUDE.md:
every mutation's audit event), so it is written exactly when the change is. That is the property wanted: an audit
event never says a change was made that was not. A second transaction to record "a commit failed" would be an audit
row about a change that does not exist, written on a connection the request does not hold; the operator's record of it
is the log line above. In the unknown case the event is there exactly if the change is.

**Proposed, not built (for the UX queue, beside item 25 (e)):** words of their own for the two cases ("Nothing was
saved" and "Not confirmed: send it again unchanged", the form keeping its request key). They are new sentences a
person reads, so they need the UX and brand review; the fault this item closes is the false "Saved".

**Not in this item:** nine other hand-written `COMMIT`s share the fault (the e-signature webhook in
`apps/web/src/lib/routes/onboarding.ts`; the worker's `billing/scope.ts`, `platform/*`, `screening/operator.ts`,
`support/support-mail.ts`; `packages/model-gateway/src/postgres-store.ts`; `packages/rules/src/loader.ts`;
`packages/db/src/crypto/practice-keys.ts`). The scope's check is exported (`committed()`), so each is a one-line
change; proposed to the orchestrator as a follow-up, since they are other lanes' files and other reviews.

## Fault 2: a handler's queue send commits by itself

**Today.** Twelve sends in signed-in handlers run on the queue producer's own connection while the request's
transaction is open, each committing as it is made. Two losses follow. A request that rolls back after its send leaves
a job with nothing to do. Worse, a worker can take the job **before** the request commits, read nothing, and finish:
the request then commits and its work is never done.

**Options.**
- (i) The send as a statement of the request's own transaction. Exact, and refused: the application login is not a
  member of `tp_queue` and has no right on `pgboss` (README; `logins.db.test.ts`), and should not get one: the
  application role could then read and rewrite every practice's jobs. It needs a grant, so a migration.
- (ii) An outbox table written in the request's transaction and relayed by the worker. Exact (one commit), keeps the
  roles apart. **The best option; it needs a table, so a migration: for Lane A.**
- (iii) Every send after the commit. No send survives a rollback; but a send that fails after the commit is a saved
  record with no job and a person told "saved", where today a failed send undoes the request. A new loss.
- (iv) **Built: the sends held in a transaction of the queue's own, committed in step with the request's.** The
  handler's sends are kept in order (payloads validated as they are made, so a bad one fails in the handler). When the
  handler, its audit event and the shell are done, as the last step before the request's `COMMIT`, the queue opens one
  transaction on a connection of the producer's pool and inserts the jobs in it (pg-boss's own `db` option and
  transaction handle; the pool's `lock_timeout` holds). A send that fails there fails the request, as today. Then the
  request commits; then the queue's transaction commits. If the request did not commit (any throw, a `ROLLBACK`
  answer), the queue's transaction is rolled back: **no worker ever sees the job.** A job is visible to a worker only
  after the request's commit, which closes the early-worker loss too.

**What (iv) leaves, said plainly.** Two commits are not one. Between the request's commit and the queue's (one
round trip, the inserts already made) the process can die or the queue's connection can fail. Then: the queue's
commit failed in a living process: the same jobs are sent again directly, each tried three times, and a job still
unsent is logged as an error by code `JOB_NOT_QUEUED_AFTER_COMMIT`, its type and the request's ID (the request still
answers `ok`: its records are saved). The process died in the window: the job is lost with no line. Only (ii) closes
that; recorded for Lane A. Where the request's commit is **unknown** (fault 1's last row), the queue's transaction is
committed: a job that finds nothing committed does nothing, as any job after a failed request did until now, and a
job lost for a saved record is the worse error.

**The connection.** The queue's transaction holds one of the producer pool's two connections from the first insert to
its own commit: the inserts and the request's `COMMIT`, milliseconds. No new pool and no change to the connection
budget (`WEB_POOL_CONNECTIONS.queue` stays 2). While it waits for a connection the request holds its application
connection, as a send does today, bounded by the pool's connection timeout.

**Unchanged.** The four `afterCommit` sends of the monitor job (a failure there must not undo a saved location; the
job's schedule takes it up) and the public screening's send with its sweep (ADR 0062): both go straight to the queue
after their commits, as now. The worker's job contract (`@tp/worker/jobs`) is used as it is.

## Fault 3: the signed-in handlers' services carry the application pool (R4-S2)

**Today.** A handler's context has `services: Services`, and `Services.pool` is the application pool, so a handler (or
a function it hands `services` to) can call `services.pool.connect()`: a second connection outside the request's
transaction, with no practice scope set by the wrapper, no lock bound, and able to starve the pool of 10. A test
counts the textual uses by file; an alias or a helper in a package passes the count.

**Fix: by type and at run time.** A signed-in handler's context carries `SignedInServices`: `Services` without `pool`,
and with `queue` replaced by the request's held sends (fault 2), so the only way to queue from a handler is the one
that commits with the request. The wrapper builds that object without the property (not a cast), so code that
reaches for it at run time through `any` finds `undefined`. Public routes keep `Services`: they open no scope and take
their own connections by design. The wrapper itself keeps the pool (it opens the transaction). The count test stays,
for the process-wide `services()` accessor, which a type cannot remove.

**Also removed (found in the build):** `signIn`, the sign-in flow, which is built on the application pool and commits
in steps of its own; only the public sign-in routes use it. And a handler's `queue` is a frozen object with `enqueue`
alone, so a handler cannot hold or settle the request's jobs even through `any`.

**Kept, on purpose:** `billingPool` and `esignPool` (other logins, each used after the person's permission is checked;
ADR 0055) and `modelPool` (the gateway's rows must outlive a rolled-back request and must not wait on the request's
connection; ADR 0055). `modelPool` is on the application login, so it is a second application connection by design,
with its own budget of 5; narrowing it to the gateway's functions alone is proposed as a follow-up, not done here.

## What does not change
The practice-scoped transaction (`SET LOCAL app.actor_id`, `app.practice_ids` from `open_practice_scope`), the role
check in the handler and in Postgres (RLS, forced), the request key, the lock bound, and the audit event in the same
transaction: no line of them is touched, and the existing tests of each stay as they are.

## Tests (failing first)
1. Scope (`packages/db`): a transaction whose statement failed and was swallowed rejects with
   `TransactionNotCommittedError` (stub and database); an ERROR at COMMIT (a deferred constraint) rejects with the
   server's error; a connection ended at COMMIT rejects with `CommitOutcomeUnknownError`.
2. Web (database): a route whose handler swallows a failed statement is not answered `ok`, writes no audit event and
   no request key, and its after-commit work and its sends do not run.
3. Queue (database, real pg-boss): a send in a request that rolls back leaves no job row; a send in a request that
   commits leaves exactly one, not visible before the request's commit; a failed queue commit is sent again; a failed
   insert fails the request.
4. Services: `SignedInServices` has no `pool` (a type test), a handler's `services` has none at run time, and no
   signed-in handler or the functions it calls is typed with `Services`.

## Reviews
Two adversarial reviews on the built head: database (the scope's COMMIT handling and the two-commit order) and auth
and tenant isolation (the services' type and run-time shape, the scope, role check and audit event unchanged).
