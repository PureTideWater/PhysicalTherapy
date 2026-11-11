ACTING (Lane A's account, https://claude.ai/code/session_019i9if9wx1DzzAD4jRFYi2P) holds this item from 2026-11-11 17:16 UTC; Lane B: read lanes/lane-b.md's latest entries before resuming.

# Queues item 25 (c), (b), (d): three PRs, one after the other (W14)

## RESUME-BLOCK
- **(c) the migration runner's `lock_timeout`:** draft **#145**, branch `co-001/migrate-lock-timeout`, head 7c83dfee (the base 91bc6b7c is its ancestor), WIP ref `co-001/wip-migrate-lock-timeout` at the same commit. Four reviews done, every confirmed finding fixed; the full local suite ran once on 7c83dfee, all pass (unit 13,518; db 10,250; golden 381; oracle 738; e2e 87; domain-model check). W14 is subscribed to #145. Next: when the required checks are green on a head that has the base as its ancestor, merge (a merge commit), record it, unsubscribe, one line to the orchestrator, then open (b). If CI dies at `playwright install --with-deps`, re-run only the failed jobs, 30 minutes or more apart. No migration, no new ADR or matrix number.
- **(b) the free-screening upload's bounded wait:** not started. Opens after (c) merges.
- **(d) the session's end and its audit event in one transaction:** not started. Opens after (b) merges.

## For Lane A (needs a migration; not built here)
- Nothing yet.

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

## Proposals for the orchestrator to queue
- The migration custom resource stops its ECS task when its 50 minutes pass (today the task runs on and a later deploy waits behind it on the advisory lock). Infra; from C2-2.

## Log
- 2026-11-11 17:16 UTC: started. The machine was ready except PostgreSQL (the setup script run again, then OK).
