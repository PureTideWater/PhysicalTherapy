ACTING (Lane A's account, https://claude.ai/code/session_019i9ifDAwBuwwvswwPuj4AN) holds this item from 2026-11-11 12:55 UTC; Lane B: read lanes/lane-b.md's latest entries before resuming.

# Queues item 25 (a): the web's transaction scope (W12)

## RESUME-BLOCK
- Branch `co-001/web-transaction-scope` from 3bff4fd6; WIP ref `co-001/wip-web-transaction-scope` at 766467cd (pushed): all three faults built, typecheck and lint clean, the new tests green.
- Design: `designs/web-transaction-scope.md`. No migration. ADR 0092 carries a second amendment (no new number).
- Running at 13:50 UTC: two adversarial reviews (database; auth and tenant isolation), reports in the session's scratchpad, to be summarised under Reviews here; the web's database suites.
- Next step: verify each finding, fix, review the delta if a fix is made; the full local suite once (to a file); merge the base; draft PR from the template; subscribe; merge on green.
- No PR, no subscription, no check-in scheduled.

## For Lane A (needs a migration; not built here)
- A queue outbox table, written in the request's transaction and relayed by the worker: the only design in which a
  job cannot be lost if the web process dies between the request's commit and the queue's (design, fault 2, option ii).

## Proposals for the orchestrator to queue
- Words of their own for "nothing was saved" and "not confirmed" after a failed or unknown COMMIT (the UX queue).
- The nine other hand-written COMMITs read their answer with the scope's exported check.
- `modelPool` narrowed to the gateway's functions.

## Log
- 2026-11-11 12:55 UTC: started; machine ready after one setup rerun; design note written.
- 2026-11-11 13:50 UTC: built (766467cd). Found in the build: a mutation's audit insert already tripped over a failed transaction (25P02); the false `ok` was reachable in reads of kind `handler` and in jobs. `signIn` also taken out of handlers' services.
