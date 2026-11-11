ACTING (Lane A's account, https://claude.ai/code/session_019i9if9wx1DzzAD4jRFYi2P) holds this item from 2026-11-11 17:16 UTC; Lane B: read lanes/lane-b.md's latest entries before resuming.

# Queues item 25 (c), (b), (d): three PRs, one after the other (W14)

## RESUME-BLOCK
- **(c) MERGED: #145 as ea8f200f** into `claude/build-platform` (2026-11-11 19:33 UTC), head 7c83dfee, a merge commit; every check green on that head, the required ones included; the base 91bc6b7c was its ancestor. No migration. W14 unsubscribed and cancelled its check-in. The WIP ref `co-001/wip-migrate-lock-timeout` and the branch can be deleted.
- **(b) MERGED: #147 as 356914e2** into `claude/build-platform` (2026-11-11 21:53 UTC), head fbc75a04, a merge commit; every required check green on that head (run 43099651185, attempt 4); the base f3f5a642 was its ancestor. No migration. W14 unsubscribed and cancelled its check-in. The WIP ref `co-001/wip-screening-upload-bounded-wait` and the branch can be deleted.
- **(d) the session's end and its audit event in one transaction: IN HAND by W19 (https://claude.ai/code/session_019i9ifCugezWgbRiXNvNRzC) from 2026-11-11.** Branch `co-001/session-end-one-transaction` (pushed; cut from 356914e2), first commit ac1f11f5 "A session's end at a limit and its audit event are one transaction". What was found: only the limit's end (`resolveSession`: idle, expired, device_revoked, user_disabled) was two transactions; sign-out, a device's revocation, both End membership routes and the reset's sweep already wrote their event in the transaction that ends the session (now pinned by tests). Built: `withResolvedActor` in `packages/db/src/authz/scope.ts` (one transaction that starts with no actor, lets the database name the user, acts as that user once, commits through `committed()`, no lock timeout per ADR 0092's amendment); `resolveSession` uses it. Tests: `apps/web/src/lib/routes/session-end.db.test.ts` (4 limits failed first on the old code: "expected 'idle' to be 'live'"; 4 routes; the active path), one case in `auth/sign-in.db.test.ts` (the reset's sweep), a block in `scope.test.ts`. No migration. Head 2cb72430 (both review rounds done; see Reviews of (d); the full local suite ran once on ae408a3e: all passed but 2 tests of `http/transaction-scope.db.test.ts`, whose commit faults met the session's new transaction, fixed test-only in 2cb72430; base still 356914e2). The draft PR is open and W19 is subscribed. **Next:** on green required checks, mark ready, merge, one line to the orchestrator, unsubscribe. Was: the full local suite once (Node 24: `/opt/node24/bin` on PATH; `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`; `TP_ORACLE_PYTHON=/root/.venvs/tp-oracle/bin/python`); draft PR from the template; base merged before the last push; merge on green; one line to the orchestrator.
## For Lane A (needs a migration; not built here)
- From (b)'s security review (B2-2): a screening practice's key (its name and ZIP) can be claimed by anyone who types them, so one sender can hold another's upload out for as long as they keep posting. Not needed by #147; a proposal.

## Reviews of (c) (reports in `approval-summaries/item-25-bcd-reviews/`)
### Round 1, on 6b044959 (2026-11-11; every finding checked against the code by W14). No blocker.
- C1-1 (should fix), CONFIRMED, DONE: a migration with its own `COMMIT; BEGIN` lost the bound and could be re-run half committed and reported as "changed nothing". The runner now checks the transaction's number after the SQL and asks `pg_xact_status` after a failed try: refused, never retried, its own message.
- C1-2 (should fix), ACCEPTED as a rule, not a scan: `EXCEPTION WHEN OTHERS` around a waiting statement swallows the cancellation. No migration has one (0 of 50); a text scan would refuse sound handlers and miss dynamic SQL. The rule is in ADR 0009's amendment (item 8) and the new-migration skill.
- C1-3 and C2-7 (notes), DONE: "the pauses are longer than the waits" was untrue of the first two; reworded. C1-4, C1-5 (notes): the safe direction; said in the ADR.
- C2-1 (should fix), CONFIRMED, DONE: a connection lost in a pause was an unhandled event and a raw stack trace. Now the migration's failure in the runner's own line.
- C2-2 (should fix), CONFIRMED (`infra/lib/constructs/migration-run.ts:22`, 50 minutes, no StopTask), DONE in part: the runner starts no new try 30 minutes into a run; both numbers pinned by tests. **Not built (the deploy's, proposed below):** stopping the task at the limit.
- C2-3 (should fix), DONE: a test holds the advisory lock past the dry run's timeout. C2-6 (note), DONE: the wall-clock assertion removed.
- C2-4 (should fix), ACCEPTED: a session-level setting set again in each try cannot be told from the transaction's own from outside the runner; no effect a test can see.
- C2-5, C2-8, C2-9 (notes): accepted; a throwing pause still releases the lock and the role.
- Could not break: the classification (14 shapes, PostgreSQL 16.15 and 18.4), the reader queue's release at the cancellation, the four lock-loop migrations, no double apply.

### Round 2, the delta `6b044959..8214f012` (one database review; checked by W14). No blocker.
- C3-1 (should fix), CONFIRMED, DONE in 213954c0: a file that rolled the runner's transaction back and began its own was retried and reported as "changed nothing". Each try now opens with a savepoint; after a failed try the runner rolls back to it and reads the transaction's number: gone or different means the file ended the transaction, which is never retried and is reported as "may be partly applied".
- C3-2, C3-3 (should fix), DONE: one wording for every such case, the dry run included; the runbook says stop.
- C3-4, C3-5, C3-7 (notes), DONE in words (the skill, ADR items 9 and 10). C3-6: moot, the status query is gone. C3-8: the missing tests added.
### Round 3, the delta `8214f012..213954c0` (one database review; checked by W14). No blocker.
- C4-1 (should fix), CONFIRMED, DONE in 7c83dfee: a failure of the runner's own COMMIT (a deferred constraint) was reported as "may be partly applied" and a wait cancelled there was not retried. No look at the savepoint once the checks have passed; a test with a deferred foreign key.
- C4-2 (note), ACCEPTED and said in the ADR and the skill: under the savepoint a file that creates an enum, adds a value and uses it fails (55P04); no migration does.
- C4-3 (note), ACCEPTED: a file that releases the runner's savepoint and then fails is reported as ended; contrived, and the careful side.
- C4-4 (note), DONE: the budget's clock counts the wait for another migrator again, as the deploy's limit does. C4-5 (note), DONE: a stale comment, an inexact sentence, two tests.
- 7c83dfee's own delta (one flag, the clock's line, two tests, words) was not sent to a further review: it is the reviewer's own smallest fix, with its tests.

## Reviews of (b) (reports in `approval-summaries/item-25-bcd-reviews/`)
### The UX and brand review, on 7bcefc94 (before and after screenshots at 1280 light, 390 light, 1280 dark, kept outside the repository). No blocker.
- B3-1 (should fix), CONFIRMED, DONE in 89e9242a: on this page "sent" means "left the browser", so "nothing was sent" contradicted it. The sentence is now "We could not take this screening just now, so nothing of it was stored and no result will be emailed. Wait a minute, then try again. If it happens again, request an audit instead."
- B3-2 to B3-4 (notes): not this change's. Sound: every field and the chosen file kept, the button usable, focus on the alert, contrast, 390 px.
### Round 1, on fe04a4f5 (2026-11-11; two security reviews; every finding checked against the code by W14). No blocker.
- B1-1 (should fix), CONFIRMED, DONE in 7bcefc94: the connection was always released to the pool, even after a failed BEGIN or ROLLBACK or an unanswered commit. Now discarded, as the scope's own transaction does.
- B1-2 (should fix, mostly not new), NOT BUILT, proposed below: the bound is per lock wait (6 to 9 s in practice), and a large upload's own run time has no limit while it holds one of the web's connections.
- B1-3, B1-4, B1-5 (notes), ACCEPTED: two tabs can meet the refusal, and it is the right answer; an unanswered commit is a generic error, as before; a schema change's wait is logged under the same code.
- B1-6 (should fix, test), DONE: the test holds each of the two advisory locks in turn and asserts that no session is left idle in a transaction. A row-lock case was not added: the same statement and the same timeout.
- B2-1 (note), ACCEPTED: the refusal after three seconds tells a prober no more than the wait's length did before; it never shows an earlier screening.
- B2-2 (should fix or accept), ACCEPTED AS A RISK and recorded in the PR, proposed below: someone who holds a practice's key with back-to-back slow uploads can have that practice's upload refused where before it waited and then replaced theirs. Costly (each holding upload passes the rate limit and the paid address check), and the root cause, that anyone can claim a practice's key, needs a migration.
- B2-3 (note): the log line holds a code and the request's ID alone. B2-5 (note), DONE: the sentence says what to do if it repeats. B2-6 (note), DONE: the comment names every holder.
- B2-4 (note, not new), proposed below.
- Could not break: every lock wait in the function and its triggers is bounded; the timeout cannot surface at COMMIT; the setting is the transaction's own; nothing typed reaches a URL, a cookie or a log; the form keeps its values in the browser alone.

## Reviews of (d) (reports in `approval-summaries/item-25-bcd-reviews/`)
### Round 1, on ac1f11f5 (2026-11-11; an auth review and a database review; every finding checked against the code by W19). No blocker.
- D1-1 (note), ACCEPTED: a `user_disabled` end that rolls back with its event leaves the session live until the next request ends it; were the user re-enabled in between, the session would live on. No route re-enables a user today (only the owner's SQL), and every request in between is refused.
- D1-2 (note), CONFIRMED, DONE in 8b59b5ce: `actAs` kept past the transaction could set an actor on a pooled connection. The door shuts when the work ends.
- D1-3, D1-4 (should fix, tests), DONE in 8b59b5ce: a route fails closed while the event cannot be written; requests racing to end one session write one event.
- D1-5, D1-6, D1-7 (notes, tests), DONE in 8b59b5ce: a commit with no answer; the actor on a real connection, before and after; the end fault runs the statement and loses its answer.
- D1-8 (note), ACCEPTED: the reset's sweep case does not count the sweep's statements; the order (lock, revoke, audit) is pinned by the existing order test in `sign-in.db.test.ts`, and the same case's second half shows the sweep ends the sessions.
- D1-9 (note, not new), proposed below: an error from session resolution reaches the framework's default output, outside the logger's allowlist (no token, hash or statement text was found in it).
- D2-1 (should fix), CONFIRMED, DONE in 75e5825a: the session's and device's rows are held across two round trips on every request, unbounded if the web task stalls. The resolving statement sets `idle_in_transaction_session_timeout` (10 s) for that transaction alone, in the same statement.
- D2-2 (a decision), NOT TAKEN, why: one autocommit statement (a CTE that resolves, sets the actor and inserts the event) would save two round trips, but it rests on the order PostgreSQL evaluates one statement's parts in, sets the actor mid-statement and writes the event outside `recordAuditEvent`; the safer option for a security path is the explicit transaction. The database-side form (the function writes the event) is proposed below for Lane A.
- D2-3 (should fix, test), DONE in 75e5825a: the event's failure is the server's own refusal, aborting the transaction. D2-4 (note), DONE: every failed try gives its connection back. D2-5: DONE with D1-4.
- D2-6 (note, not new), proposed below. D2-7 (note), ACCEPTED: `now()` is the transaction's start, one round trip earlier.
- Could not break: fail closed on every failure; atomicity under a real refusal; the audit policy after `actAs`; no new lock cycle (resolveSession never locks the account row); release or destroy on every path; all five ways a session ends are one transaction.
### Round 2, the delta `ac1f11f5..75e5825a` (one review; report `d-round2-delta.md`; checked by W19). No blocker.
- D3-1 (should fix), CONFIRMED (the new test without the fix: 13 passed, 2 unhandled errors), DONE in ae408a3e: a connection the server ends while a transaction holds it raised an 'error' event nothing heard, which ends a Node process; the idle bound made that reachable on every request's path. `openPool` hears the event; the holder's next statement is refused and its scope destroys the connection.
- D3-2 (should fix, test), DONE in ae408a3e: the stall runs inside `withResolvedActor` on a pool as the application opens it; the bound is read after a rollback.
- D3-3 (note), ACCEPTED: the race's faulted request is met in one ordering only; both orderings are accepted and the event count is the assertion. D3-4 (note), ACCEPTED: a 1 s wait against a 200 ms bound. D3-5 (note): the door guards the actor alone, as its comment says.
- Could not break: the bound is honoured for the application's role on PostgreSQL 16.15 and 18.4, counts idle time only (a 1.2 s lock wait under a 200 ms bound commits), reverts at COMMIT and ROLLBACK; the FROM form calls the function once and returns its columns alone; no pooler in `infra/`.
- ae408a3e's own delta (one listener in `openPool`, the test moved into the scope) was not sent to a further review: it is the reviewer's own smallest fix, verified failing first, and two fix rounds is the limit.

## Proposals for the orchestrator to queue
- The screening upload: a transaction-local `statement_timeout` sized from the capacity harness, and a cap on how many uploads store at once in one web process (B1-2).
- The screening upload: a busy refusal is not charged to the submitter's rate limit, and its log line tells the lock kinds apart (B2-2). **For Lane A (a migration):** a practice's key cannot be claimed by anyone who types its name and ZIP.
- `screening/routes.ts`: a database error other than the mapped ones is rethrown with pg's `detail`, which can hold a failing row's typed values; log the SQLSTATE and throw a plain error (B2-4; not new).
- **For Lane A (a migration), from (d):** `resolve_session()` writes the `session_ended` event itself, so a limit's end is one statement again (one round trip, not three, on every signed-in request) and atomic in the database (D2-2).
- From (d): `revokeDevice` ends the device's sessions before revoking the device, the order `resolve_session()` takes the two rows in; today the opposite orders can deadlock (one side gets 40P01; not new) (D2-6).
- From (d): both End membership routes sign the user out at the provider inside the transaction, before its commit; a failed commit leaves them signed out there with their sessions open here. Move the provider call after the commit (`afterCommit`).
- From (d): `openPool` has no listener for the pool's own 'error' event (an idle connection's failure); check whether one is needed as D3-1's was.
- From (d): an error thrown by session resolution skips the logger's allowlist (D1-9; not new).
- The migration custom resource stops its ECS task when its 50 minutes pass (today the task runs on and a later deploy waits behind it on the advisory lock). Infra; from C2-2.

## Log
- 2026-11-11 21:53 UTC: #147 merged as 356914e2. Its run 43099651185 failed `unit` three times on #146's wall-clock rows alone (attempt 1: 3.16, 3.74 and 4.58 s; attempt 2: 3.99 s; attempt 3: 3.05, 3.19 and 3.87 s; the limit is 3 s) and passed on attempt 4, the third re-run the orchestrator allowed; marking the PR ready queued `approval-of-record` again, which passed before the merge. W14 stands down; (d) is for a fresh session.
- 2026-11-11 21:16 UTC: #147's run 43099651185, attempt 1, failed in `unit` alone (job 130786707692): three wall-clock rows of `packages/model-gateway/src/functions/denial-letter.test.ts` from #146 (3.16 s, 3.74 s, 4.58 s against 3 s); not #147's (it touches nothing there; `unit` passed on the base's own run at f3f5a642). The orchestrator's ruling: the bound is W18's (Queues item 26); re-run the failed job at most three times, the run's end between them; merge on green; after three failures on those rows alone, tell the orchestrator and stand down with the PR open. Attempt 2 (the failed jobs re-run) started 21:17 UTC; one comment on the PR says so.
- 2026-11-11 19:35 UTC: the machine restarted (PostgreSQL down); the setup script run again, PostgreSQL back by 19:50 UTC. The script's summary listed five items as failed because the checkout had uncommitted work at that moment; the tools it names were in place from the first run (the pre-push hook and gitleaks ran on every push since).
- 2026-11-11 19:33 UTC: #145 merged as ea8f200f.
- 2026-11-11 17:16 UTC: started. The machine was ready except PostgreSQL (the setup script run again, then OK).
