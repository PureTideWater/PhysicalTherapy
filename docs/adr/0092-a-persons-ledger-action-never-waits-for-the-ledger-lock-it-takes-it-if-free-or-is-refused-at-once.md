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

## Amendment, 2026-11-11: no signed-in request waits long on a lock

Queue item 24 (`co-001/web-lock-timeout`; test matrix CAS-57), the same decision made general, as the orchestrator
ruled on 2026-11-10: the seven actions above take the ledger lock or are refused at once; every other lock wait of a
signed-in request is now bounded too.

1. **Where the web's transactions are made.** Every signed-in request runs in one transaction that the routes'
   wrapper opens (`apps/web/src/lib/http/invoke.ts`: a person's own and the platform's routes, a practice's, an
   organization's), and the wrapper now opens each with a bound on its lock waits of three seconds
   (`apps/web/src/lib/server/lock-timeout.ts`). The scope sets it as the transaction's first statement after `BEGIN`,
   before its own opening read (`packages/db/src/authz/scope.ts`, `LockWaitBound`: PostgreSQL's `lock_timeout`, for
   that transaction only). It holds for every statement the request issues in that transaction, in a handler, a
   trigger or a library, so no handler has to remember it and none can leave it out. `lock-timeout.test.ts` fails if
   a transaction of the wrapper's is opened without it, and counts, by file, every place the web's code reaches the
   application pool itself.
2. **The queue producer's pool too.** A handler queues a job inside its request's open transaction ("Queued in the
   request"), on pg-boss's own connection, so a send that waited would hold the request's connection for as long.
   That pool carries the same timeout as pg's own setting (`apps/web/src/lib/uploads/queue.ts`, `producerOptions`).
   A send is one statement: one that gives up leaves nothing written. A database URL cannot undo the setting
   silently: pg lets a URL's query replace a pool's own settings, so a URL that names `lock_timeout` is refused as
   the queue is made, in words that never hold the URL. (A URL's `options`, which a production login's carries for
   its role, cannot replace it: the server applies the pool's setting after them.)
3. **Nothing else is bounded, on purpose.** Sign-in, the session's read, the rate limit's count, the public forms
   and webhooks, and billing's, the e-signature vendor's and the model gateway's pools wait as they always have.
   They commit in steps of their own or must never give a write up (a session's end and its audit event, a failed
   sign-in's count, a sign-in step after the provider's grant is released, a model call's record written after the
   model has answered), so a timeout there would lose a record or say "nothing was saved" falsely; and none of them
   meets a lock a reconcile pass holds. The review of the first build of this amendment, which set the timeout on
   the web's pools, found exactly those losses, and that is why it is set on the request's transaction instead.
4. **Each lock wait, not each request.** PostgreSQL applies `lock_timeout` to each wait for a lock: a row, a key
   behind a foreign key or a unique index, an advisory lock, a table behind a schema change. A statement that takes
   two locks may wait twice, and a request of several statements more. What is bounded is what this decision is
   about: a wait whose length another transaction decides.
5. **Not a role setting, so no migration,** and the worker's waits do not change: a job may wait. The scopes take
   the bound as an option that only the web's wrapper passes; the worker, the gateway, the capacity harness and
   every other caller pass none, and their transactions are statement for statement as they were.
6. **The refusal is 0092's.** PostgreSQL's `55P03` (lock not available) from the request's transaction, or from a
   send a handler made inside it, becomes `{ status: 'busy' }` in the routes' own catch. The transaction is already
   rolled back there: the whole request, with its audit event and its request key. It is logged by its code and the
   request's own ID alone, never pg's words, which name the statement and the relation.
7. **A closed word.** The outcome carries `what`: `ledger` for the try-lock above; `records` for a lock timeout; and
   `request` where the same request key was sent while its first request is still running. That one waits first on
   a lock of the key's own, in a statement of its own, so that only it is called `request` (an advisory lock in a
   key space the request keys have to themselves: a key is text its sender chooses, and in the space the ledger's
   and the other locks share it could be made to equal another practice's lock): inside three seconds it
   is answered as any key used before (or goes on, where the first was rolled back), and past them it is refused,
   but "nothing was saved" would be false of it, since the first may yet save. No word names a table, a row, a job
   or a person.
8. **The words are true of the form they are shown on.** "The recovery ledger is being updated, so nothing was
   saved.", "The records this form needs are being updated, so nothing was saved." (the held record is often another
   than the one on the page: a case's row behind a submission), or "This form was already sent and is still being
   processed, so nothing new was saved." The server's words then say "Try again in a few minutes." (or, for a form
   already sent, "Reload the page in a few minutes to see whether it saved.") and claim nothing about the form,
   which a post without JavaScript does not keep. A form with JavaScript writes its own lead from the outcome's word
   once it has read the page (`busy-words.ts`, `RefusalLead`): what was typed is still here; all but passwords and
   codes, which a refusal empties (the password is typed again, and a code is a new one, since the one typed has
   passed by then); or nothing, on a form that is one button or one code.
   A form already sent is titled "Not confirmed", keeps its request key, and is sent again unchanged ("Send it again
   in a few minutes, changing nothing. If the first send saved, PaidWhole says so; if not, this one saves it. Nothing
   is saved twice."): the same send is answered "Already sent" once the first has saved, and does the work where it
   did not, where a changed one would lose its changes without a word. A refused
   download says "The records this download needs are being updated. Try again in a few minutes."; the upload client
   says the same of "this upload" and never asks for a reload, which would drop the files on screen. A page whose
   read is refused shows the error state and its "Try again", never "not found" for a record that is there. A JSON
   client gets 409 with `Retry-After: 60` for `records` and `request`, each of which held a connection for three
   seconds to answer; 5 stays for the try-lock, which answers at once.
9. **Three seconds.** Two people's short requests on one row pass each other in milliseconds, and a triage job holds
   a case's rows for a second or two; a wait past three seconds means a holder that keeps the lock for a long
   transaction (a pass, or a request that runs a model call). A request holds its connection for three seconds at
   most for each lock it waits on, where it held it for the pass.

Consequences of the amendment:

- Logging a submission, recording a payer response and assigning a case no longer wait for a pass: each is refused
  after three seconds while the pass holds its case's row. So is any signed-in request that meets
  another long holder: a pricing run's `pricing_current:` lock behind a plan mapping or a packet's attestation, a
  packet export's `packet:` lock.
- The seven actions keep the try-lock: they must serialize with the ledger, and they answer at once, not after three
  seconds. The write-off and the reopen can no longer wait behind a triage job for longer than the timeout.
- A page is not immune. A read takes no row lock, but it waits behind a table lock (a migration's `ALTER TABLE`
  queued behind a long job holds up every reader of that table), and a page's audit event can wait as well. Such a
  page showed nothing for as long; it now shows the error state after three seconds.
  `packages/db/src/migrate.ts` sets no `lock_timeout` of its own, so a migration can still queue behind a long job:
  a gap of the deploy that this change makes visible and does not close.
- What a refusal does not undo is work outside the request's transaction. A job a handler queued stays queued (the
  send is the handler's last step, "Queued in the request", so that a failure to queue undoes the request; the
  reverse, a request rolled back after its send, leaves a job that finds nothing committed to do, as any failure
  after the send always has). The rate limit's count stands. On a route that runs a model call, the gateway's own
  rows stand; on a billing action, what it asked of the payment provider and wrote under billing's own login stands.
  Each of these was already so for any failure after the effect; the timeout adds an expected one. So the words say
  what is true for the person: nothing of theirs was saved by this request.
- Not bounded, and so as before: a request waiting for its session's read or its rate limit's count (both come
  before its transaction, and wait only behind a schema change of their own tables), a public form
  (a second free-screening upload for the same practice or contact still waits for the first and then replaces it),
  and a wait on billing's or the model gateway's pool while the request's transaction is open. None of these is
  held by a reconcile pass. They are the next places to look if a connection is ever seen held for long.
- Whatever the queue producer runs in the background on its own connections carries the timeout as its sends do: a
  statement that met a lock for three seconds, as a worker changes the queue's schema, would be logged as a queue
  error where it used to wait in silence.

Alternatives considered for the amendment: the timeout as a connection parameter of the web's pools (built first,
and reviewed: it reaches sign-in, the session's read and the public forms, which commit in steps, and a timeout
there lost an audit event, skipped a failed sign-in's count and said "nothing was saved" of a step that had saved);
`SET LOCAL lock_timeout` in each handler (a handler can forget it; the wrapper cannot); in `withPracticeScope`
(shared with the worker and the gateway); `ALTER ROLE ... SET lock_timeout` (a migration, and it would bound the
application login wherever it is used); the try-lock for every writer (refuses a whole practice for a whole pass for
writers that need no serializing); a try-lock on the request key (it answers at once, but a first request that ends
in a moment would be answered "still being processed" where a wait of up to three seconds answers "already sent");
a page of its own for a page's busy state (rare, and the error state's "Try again" is the true next step).

Revisit when a request's legitimate wait on another request approaches three seconds (a slow handler holding a row or
an advisory lock): shorten the holder's transaction first.
