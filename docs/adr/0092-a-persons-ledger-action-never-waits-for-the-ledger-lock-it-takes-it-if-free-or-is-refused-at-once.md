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
   nothing was saved. What you typed is still here: try again in a minute." and keeps what was typed; it never says that a reconciliation is running, since
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
  `lock_timeout` on the web's mutations answered as `busy`, which is its own change with its own review (queued; see
  Revisit when).
- A write-off of a line already written off, or a reopen of a line not written off, used to answer as done without
  writing; while the lock is held it now answers `busy`, since the lock is taken before the line is read.
- The write-off and the reopen now hold the lock while they read the case line for update. A triage job holding that
  row makes them wait for it (seconds, never a pass), and a pass starting meanwhile waits behind them: the same shape
  the manual actions already had.
- A refused press still counts toward the person's mutation rate limit (120 a minute), as every refusal does; the
  form's "in a minute" and a client's `Retry-After` keep an honest retry far inside it.
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

- The floor for the rest of the class is built: a `lock_timeout` of a few seconds on a web mutation's transaction,
  with PostgreSQL's `55P03` answered as `busy`, so that no request waits on any row a pass holds (submissions, payer
  responses and assignments first). The try-lock stays for the seven, which must also serialize with the ledger.

- A pass no longer holds the `ledger:` lock for its whole transaction (shorter transactions, or a lock per case): the
  refusal may then be rare enough to become a short bounded wait.
- The refusals show in support's records as a complaint during real-size passes: then the pass's own length, not this
  rule, is what to change.
