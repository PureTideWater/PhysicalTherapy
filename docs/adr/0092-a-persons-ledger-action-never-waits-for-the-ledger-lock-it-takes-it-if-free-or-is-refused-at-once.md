# 0092. A person's ledger action never waits for the ledger lock: it takes it if free, or is refused at once

- **Status:** proposed (`co-001/web-ledger-try-lock`, acting Lane B; no migration, index, table or function); accepted
  when the founder approves its pull request (docs/adr/0063). Follows
  [0087](0087-reconcile-a-practice-with-reads-per-pass-never-per-open-line-writing-in-the-rules-order.md), whose design
  handed this to the web's owner; reverses none of its rulings.
- **Date:** 2026-11-10
- **Deciders:** the build (acting Lane B), on SUITE-CAP-3's design (section 14.4, item 14; review rounds 4 to 7) and
  LANES.md's queue item 21; the orchestrator, who ruled on 2026-11-10 that this is its own decision record; the founder,
  on the pull request's review. Every option is judged under the founder's standing rule of 2026-10-18.
- **PRD sections:** 7 (Reconciliation and Cases: match by hand, reverse a match, write off and reopen a line; "every
  error shown with a next step"), 13 (the recovery ledger), 15 (the worker); CLAUDE.md rules 1 and 4 and the
  conventions for every mutation; test matrix CAS-56.

## Context

A reconcile pass holds the practice's `ledger:` advisory lock for its whole transaction (ADR 0087): 220 s for practice
F at 10,000 lines, and minutes more at a real month until the ledger trigger fixes land. Seven things a person does in
the web take that lock, or change rows the pass holds locked to its commit:

- the five manual reconciliation actions (match a posting, a deposit or a claim by hand, reverse a match, adjust an
  entry), whose shared first step in `apps/worker/src/reconcile/manual.ts` took the lock with a blocking
  `pg_advisory_xact_lock`;
- the write-off and the reopen of a case line (`apps/web/src/lib/routes/triage.ts`), which took no lock but update a
  case line, whose refresh updates the case a pass has locked, and (the reopen) write a stage event beside the pass's.

Nothing in the repository sets `lock_timeout` or `statement_timeout`, so each such request waited for the length of
the pass, holding one of the web's application connections, a pool of 10 that every practice shares. A few clicks on
one practice during its pass could hold every practice's requests. The reopen could also meet the pass's stage write in
a deadlock, which ADR 0087's savepoint retry absorbs on the pass's side.

## Decision

1. **Taken if free, never waited for.** `tryLockLedger` (beside `lockLedger`, the same key) takes the lock with
   `pg_try_advisory_xact_lock` and says whether it was granted. The manual actions' first step and the write-off and
   reopen handlers call it at their start, inside the request's practice-scoped transaction, before any row is read
   for update. Granted, the action holds the lock to its commit, so it runs only while no pass and no other person's
   ledger action is under way, and it never waits. The reconcile job keeps the blocking `lockLedger`: a job may wait.
2. **Refused at once, writing nothing.** Not granted, the worker's action throws `ReconciliationError('ledger_busy')`
   and the web's handlers throw `BusyError`; the request's transaction rolls back, so no row, audit event or request
   key is written, and the outcome is `{ status: 'busy' }`, a new member of the routes' closed list of outcomes.
3. **The refusal names nothing.** The outcome is a status alone. The form says "The recovery ledger is being updated, so
   nothing was saved.", then what stays in the form and "try again in a few minutes" (the words as the amendment of
   2026-11-11 leaves them), and keeps what was typed; it never says that a reconciliation is running, since
   another person's action holds the same lock, and it carries no identifier. A JSON client gets 409 with
   `Retry-After: 5`.
4. **Placed everywhere an outcome is read.** `busy` has its HTTP status, its form message and, so the closed list of a
   download's refusals stays whole, its download words, though no download takes the lock today.

## Consequences

- A person's action on a practice during its pass is refused, not queued: the person presses again. During a real-size
  pass that can be minutes of refusals; the alternative was minutes of a held connection for every practice.
- Two people's ledger actions on one practice still never interleave: the second is refused while the first's
  transaction is open, where it used to wait the few milliseconds the first took. Acceptable: the action is one press.
- The reopen no longer crosses a pass's stage write, since it runs only with the lock. ADR 0087's savepoint retry stays:
  a triage job still takes the case then the head outside the lock, and CAS-49.6 holds the retry.
- CAS-56 holds the seven: each answers `busy` at once (within two seconds, the whole request) while the lock is held,
  writes nothing (a request key sent with a refused press is still unused afterwards), and goes through once the lock is
  free; a second person's action sent while the first is in flight is refused the same way.
- **The seven are not every web writer a pass can hold up** (the pull request's security review). A pass also holds,
  to its commit, the `case` rows of the lines it writes a stage event or a payer response for, and three more requests
  rewrite a case's row through a trigger: logging a submission (`submission_refresh_case`), recording a payer response
  (`payer_response_refresh_case`) and assigning a case (`case_activity_sets_owner`). Each still waits when, and only
  when, its own case is one the running pass has written for. They need no serializing with the ledger, so refusing
  them for a whole pass with the try-lock would be wrong; the remedy for them, and for any writer like them, is a short
  `lock_timeout` on the web's mutations answered as `busy`: the amendment of 2026-11-11 below.
- A write-off of a line already written off, or a reopen of a line not written off, used to answer as done without
  writing; while the lock is held it now answers `busy`, since the lock is taken before the line is read.
- The write-off and the reopen now hold the lock while they read the case line for update. A triage job holding that
  row makes them wait for it (seconds, never a pass), and a pass starting meanwhile waits behind them: the same shape
  the manual actions already had.
- A refused press still counts toward the person's mutation rate limit (120 a minute), as every refusal does; the
  form's "in a few minutes" and a client's `Retry-After` keep an honest retry far inside it.
- No amount, stage, rule or total changes: a refused action writes nothing, and a granted one runs as before.

## Alternatives considered

| Option | Why not |
| --- | --- |
| The blocking lock in the reopen and the write-off as well | Makes two more requests wait for a pass; the starvation it fixes for none |
| `SET LOCAL lock_timeout` of a few seconds around the wait | Still holds a connection for those seconds for each press, and turns the wait into an error just the same; kept only as the floor for a writer that cannot take the try-lock, set around that one statement and never in `withPracticeScope` |
| A bounded wait in the handler (poll the try-lock for a second or two) | Holds the connection while it polls; a pass outlasts any bound worth holding a connection for, so the person is refused anyway, later |
| Queue the action as a job behind the pass | The action's answer (a refusal for a mismatched amount, a match already standing) would arrive after the person left the form; a queued write in a person's name needs its own approval rules |
| A larger web pool, or a pool per practice | Moves the limit; a waiting request is still a held connection |
| An input error on a field ("Fix the fields listed here") | Nothing the person typed is wrong; the refusal is retryable as sent and belongs with the outcomes, not with a field |

## Revisit when


- A pass no longer holds the `ledger:` lock for its whole transaction (shorter transactions, or a lock per case): the
  refusal may then be rare enough to become a short bounded wait.
- The refusals show in support's records as a complaint during real-size passes: then the pass's own length, not this
  rule, is what to change.

## Amendment, 2026-11-11: no web request waits long on a lock

Queue item 24 (`co-001/web-lock-timeout`; test matrix CAS-57), the same decision made general, as the orchestrator
ruled on 2026-11-10: the seven actions above take the ledger lock or are refused at once; every other lock wait of a
web request is now bounded too.

1. **Where the web's connections are opened.** The web opens its request pools (the application's, billing's and the
   e-signature vendor's logins) through `openWebPool` (`apps/web/src/lib/server/web-pool.ts`), which sets
   `lock_timeout` to three seconds as a connection parameter. Its queue producer's pool (pg-boss,
   `apps/web/src/lib/uploads/queue.ts`, `producerOptions`) carries the same parameter: a handler queues inside its
   request's open transaction, so a send that waited would hold the request's connection for as long. The setting
   holds for every statement on every connection of those pools, in a handler, a wrapper or a library, so no request
   can run without it and nothing has to remember to set it. `web-pool.test.ts` fails, naming the file, if the web's
   own code opens a pool or a client any other way.
2. **Each lock wait, not each request.** PostgreSQL applies `lock_timeout` to each wait for a lock: a row, a key
   behind a foreign key or a unique index, an advisory lock, a table behind a schema change. A statement that takes
   two locks may wait twice (the free screening's submit takes two), and a request of several statements more. What
   is bounded is what this decision is about: a wait whose length another transaction decides.
3. **Not a role setting, so no migration,** and the worker's waits do not change: the worker opens its own pool with
   no timeout, and a job may wait. `withPracticeScope` is untouched (the gateway, the capacity harness and the
   worker's test worlds use it). A database URL cannot undo the setting: pg lets a URL's query replace a pool's own
   settings, so a URL that sets `lock_timeout` (by name, or in its `options`) is refused when the pool is opened, in
   words that never hold the URL. A URL's `options` for anything else stays (a production login's role), and pg
   sends both.
4. **The model gateway's pool is the one exception.** It is opened once in `services.ts` without the timeout. What it
   writes are the gateway's own short transactions (a rate limit's count, a budget hold, a call's record), and a
   call's record is written after the model has answered: it must wait for its lock, never be given up. What a
   request writes for itself stays on the application pool. A request that runs a model call holds its application
   connection for the call's length, as before; the gateway's limit on calls in flight bounds how many do.
5. **The refusal is 0092's, from one place.** PostgreSQL's `55P03` (lock not available) anywhere in a route (the
   session's read, the rate limit's count, the request's transaction, a public handler's own) becomes
   `{ status: 'busy' }` in one wrapper around every kind of route (`invoke.ts`, `lockBounded`). No path answers it as
   a server error, and pg's error, which names the statement and the relation, is never thrown on to the framework's
   log. The statement's transaction is rolled back: for a request inside the routes' wrapper that is the whole
   request, with its audit event and its request key.
6. **A closed word.** The outcome carries `what`: `ledger` for the try-lock above; `records` for a lock timeout; and
   `request` where the same request key was sent while its first request is still running. The second waits on the
   first's uncommitted key: inside three seconds it is answered as any key used before, and past them it is refused,
   but "nothing was saved" would be false of it, since the first may yet save. No word names a table, a row, a job
   or a person.
7. **The words are true of the form they are shown on.** "The recovery ledger is being updated, so nothing was
   saved.", "The records this form needs are being updated, so nothing was saved." (the held record is often another
   than the one on the page: a case's row behind a submission), or "This form was already sent and is still being
   processed, so nothing new was saved." The server's words end "Try again in a few minutes." and claim nothing about
   the form, which a post without JavaScript does not keep. A form with JavaScript writes its own lead from the
   outcome's word (`busy-words.ts`, `RefusalLead`): "What you typed is still here: try again in a few minutes.", or
   "What you typed is still here, except passwords and codes: type them again, then try again in a few minutes."
   where it held one (a refusal empties them), or the server's ending on a form that is one button. A refused
   download says "The records this download needs are being updated. Try again in a few minutes."; the upload client
   says the same of "this upload" and never asks for a reload, which would drop the files on screen. A page whose
   read is refused shows the error state and its "Try again", never "not found" for a record that is there. A JSON
   client gets 409 with `Retry-After: 60` for `records` and `request`, each of which held a connection for three
   seconds to answer; 5 stays for the try-lock, which answers at once.
8. **Three seconds.** Two people's short requests on one row pass each other in milliseconds, and a triage job holds
   a case's rows for a second or two; a wait past three seconds means a holder that keeps the lock for a long
   transaction (a pass, or a request that runs a model call). A request holds its connection for three seconds at
   most for each lock it waits on, where it held it for the pass.

Consequences of the amendment:

- Logging a submission, recording a payer response and assigning a case no longer wait for a pass: each is refused
  after three seconds when, and only when, the pass holds its case's row.
- So is any web request that meets another long holder: a pricing run's `pricing_current:` lock behind a plan
  mapping or a packet's attestation, a packet export's `packet:` lock. A second free-screening upload for the same
  practice or contact used to wait for the first and then replace it; where the first is still being stored after
  three seconds, the second is now refused and the prospect sends it again.
- The seven actions keep the try-lock: they must serialize with the ledger, and they answer at once, not after three
  seconds. The write-off and the reopen can no longer wait behind a triage job for longer than the timeout.
- A page is not immune. A read takes no row lock, but it waits behind a table lock (a migration's `ALTER TABLE`
  queued behind a long job holds up every reader of that table), and a page's audit event or its session's read can
  wait as well. Such a page showed nothing for as long; it now shows the error state after three seconds.
  `packages/db/src/migrate.ts` sets no `lock_timeout` of its own, so a migration can still queue behind a long job:
  a gap of the deploy that this change makes visible and does not close.
- What a refusal does not undo is work outside the request's transaction. A job a handler queued stays queued (the
  send is the handler's last step, "Queued in the request", so that a failure to queue undoes the request; the
  reverse, a request rolled back after its send, leaves a job that finds nothing committed to do, as any failure
  after the send always has). The rate limit's count stands. On a route that runs a model call, the gateway's own
  rows stand; on a billing action, what it asked of the payment provider and wrote under billing's own login stands.
  A public handler that makes several transactions of its own (a sign-in step) keeps what it committed before the
  one that timed out. Each of these was already so for any failure after the effect; the timeout adds an expected
  one. So the words say what is true for the person: nothing of theirs was saved by this request.

Alternatives considered for the amendment: `SET LOCAL lock_timeout` in each handler (a handler can forget it; the
pool cannot); in `withPracticeScope` (shared with the worker and the gateway); `ALTER ROLE ... SET lock_timeout` (a
migration, and it would bound the application login wherever it is used); the try-lock for every writer (refuses a
whole practice for a whole pass for writers that need no serializing); a try-lock on the request key (it answers at
once, but a first request that ends in a moment would be answered "still being processed" where a wait of up to
three seconds answers "already sent"); the timeout on the model gateway's pool too (a call's record would be given
up after three seconds); a page of its own for a page's busy state (rare, and the error state's "Try again" is the
true next step).

Revisit when a request's legitimate wait on another request approaches three seconds (a slow handler holding a row or
an advisory lock): shorten the holder's transaction first.
