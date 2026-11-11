ACTING (Lane A's account, https://claude.ai/code/session_019i9ifDAwBuwwvswwPuj4AN) holds this item from 2026-11-11 12:55 UTC; Lane B: read lanes/lane-b.md's latest entries before resuming.

# Queues item 25 (a): the web's transaction scope (W12)

## RESUME-BLOCK
- Branch `co-001/web-transaction-scope` from 3bff4fd6; WIP ref `co-001/wip-web-transaction-scope` at 866f4891 (pushed): built, round 1 of both reviews in and fixed.
- Design: `designs/web-transaction-scope.md`. No migration. ADR 0092 carries a second amendment (no new number).
- Running at 14:15 UTC: the delta review of `766467cd..866f4891`.
- Next step: verify the delta review's findings; the full local suite once (to a file); merge the base; draft PR from the template; subscribe; merge on green.
- No PR, no subscription, no check-in scheduled.

## For Lane A (needs a migration; not built here)
- A queue outbox table, written in the request's transaction and relayed by the worker: the only design in which a
  job cannot be lost if the web process dies between the request's commit and the queue's (design, fault 2, option ii).

## Proposals for the orchestrator to queue
- Words of their own for "nothing was saved" and "not confirmed" after a failed or unknown COMMIT (the UX queue).
- The nine other hand-written COMMITs read their answer with the scope's exported check.
- `modelPool` narrowed to the gateway's functions.

## Reviews (reports in `approval-summaries/web-transaction-scope-reviews/`)
### Round 1, on 766467cd (2026-11-11 13:50 to 14:00 UTC; every finding checked against the code by W12)
No blocker. Fixed in 866f4891 unless said otherwise.
- S1 (auth, should fix), CONFIRMED (the model routes' database tests failed on it), DONE: the handler's services are a
  new object for each request, and three per-server maps were keyed by that object (the cap on model calls in flight,
  a test's model path, the remembered patient-name refusals), so each request had an empty cap and cache. Now keyed
  by the server the view was made from (`serverOf`); a test holds that two requests share one limiter.
- S2 (auth, should fix), CONFIRMED, a FOLLOW-UP already proposed below: `modelPool` is a second pool on the
  application login by design (ADR 0055). No cross-tenant read was found; RLS fails closed without a scope.
- S3 (note), ACCEPTED: the unknown-outcome error keeps pg's error as its cause; a thrown pg error was already seen by
  the framework's own logging before this change, and the new log lines hold codes and the request's ID alone.
- S4 (note), ACCEPTED, as designed: jobs are committed when the request's commit is unknown.
- D1 (database, should fix), CONFIRMED, DONE: a socket's code of an SQLSTATE's shape (EPIPE) with no severity was
  read as the server's refusal. Now an SQLSTATE and the severity ERROR, both. D2 (note), DONE with it: a localized
  severity falls on the unknown side, the safe one.
- D3 (note), CONFIRMED by the reviewer's experiment, DONE: two requests holding the same keys in opposite orders
  deadlocked in the queue's unique index (one ended with 40P01 after a second). Held sends now go in one order. The
  same key held by an unfinished request waits up to the lock timeout and is refused as busy: said in the comment.
- D4 (note), ACCEPTED and said in the comment and the ADR: a hold keeps one of the producer's two connections across
  the request's COMMIT; a third request waits up to the connection timeout; a queue made in the last minute can make
  two holds end at that timeout until pg-boss's cache reloads.
- D5 (note), DONE: the comment claimed more than the exclusive policy gives; a re-send after a lost answer can run a
  finished job a second time.
- Could not break: the wrapper's order (guards, session, gates, not found before forbidden, permission, request key,
  audit event, shell), the bound, the refusal mapping, the queue's door, held jobs' invisibility until the queue's
  commit, connection release on every throw path, the worker's jobs (a silent rollback now fails and retries).

## Log
- 2026-11-11 12:55 UTC: started; machine ready after one setup rerun; design note written.
- 2026-11-11 13:50 UTC: built (766467cd). Found in the build: a mutation's audit insert already tripped over a failed transaction (25P02); the false `ok` was reachable in reads of kind `handler` and in jobs. `signIn` also taken out of handlers' services.
- 2026-11-11 14:15 UTC: round 1 reviews in, fixes at 866f4891; delta review running.
