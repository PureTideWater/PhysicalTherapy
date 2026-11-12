# Schema PR 5: the stored-statement preflight (step 3.3), redesigned to meet the 5-minute limit (addendum, W41, 2026-11-12)

Addendum to `designs/lane-a-ledger-freeze-batch.md`. It replaces that note's step 3.3 and its tests T2 and T2c, and
nothing else. It changes no granted text: Appendix A and Appendix D2 with its header line are pasted as granted.
Reference text of the block (not a migration): `lane-a-wip/schema-pr5/w41/preflight.sql`, SHA-256 `73c0f7bc6eccb702...`.

## 1. The design
One `DO` block between 3.2 and 3.4, run as `tp_owner` in the runner's transaction:
1. Refuse unless the transaction is READ COMMITTED (each later read must see what has been committed).
2. Read every practice ID (deleted practices too; `tp_owner` reads `practice` whole through `practice_resolver`).
3. **For each practice:** `set_config('app.practice_ids', ARRAY[id]::text, true)`, then one query
   `WHERE s.practice_id = id` that counts its statements and those for which `roi_links_valid(s.links) IS NOT TRUE`.
   It calls the new function itself, as the note requires.
4. **Closing count:** for each practice again, the stored count against the count checked; a practice whose count
   moved is read again; practices created meanwhile are added. Up to three rounds, then it refuses.
5. **Empty-pass guard:** with every practice in scope, `EXISTS (SELECT 1 FROM roi_statement)` must agree with
   "statements checked > 0". It stops at the first row, so the long list is read against one row (about 1 ms).
6. Scope back to `'{}'`; refuse if any statement failed; else a NOTICE with counts and times only.

**Tenant isolation is untouched.** No policy, role, grant or FORCE setting changes; nothing bypasses; `tp_app` owns
nothing. The migration role reads through the same `roi_statement_tenant` policy, under its own transaction-local
setting, as the precedent does (`20261109090000_line_status_heads.sql:127-132`, `20261101090000_billing_review.sql:49`).
The precedent opens every practice at once; this opens one at a time, so the policy compares against a one-element
list and its cost no longer grows with the number of practices.

## 2. Measured (PostgreSQL 18.4, the machine's defaults, SYNTHETIC rows only)
1,000,000 four-key statements of 40 IDs in 1,000 practices (2,136 MB), each practice's statements spread over the
whole table (the worst order for reading by practice). Each run as the runner runs a file, rolled back.
Scripts and output: `lane-a-wip/schema-pr5/w41/` (`jobA.sh`, `jobB.sh`, `out/`).

| Option | Time | Verdict |
| --- | --- | --- |
| The note's 3.3 as written: every practice in scope, one scan | **734.1 s (12 min 14 s)** | fails (W's run: 764.9 s) |
| **This design**, statistics gathered | 197.9 s, 196.0 s | **meets** |
| This design, statistics never gathered | 202.1 s | meets |
| This design, statistics gathered while the table was empty | 205.0 s | meets |
| This design with a writer beside it (5 statements at 60 s) | 200.6 s; 1,000,005 checked, 1 practice read again | meets |
| Every practice in scope, one statement, `enable_seqscan` off | 212.7 s, with two parallel workers | rejected |
| The floor: the function alone, no policy (scratch superuser; a yardstick, not an option) | 193.0 s | - |

- The design costs the function's own time plus 3 to 12 s. The floor is Appendix A's cost and cannot be lowered
  without changing A. The margin under the limit is 95 to 104 s.
- **Plans:** the per-practice reads used `roi_statement_by_period` (index or bitmap scan) in all three statistics
  states, with custom and generic plans. The closing count took 0.12 to 0.15 s (vacuumed) and 2.6 to 2.7 s (never
  vacuumed) for all 1,000 practices.
- **Why not one statement over every practice:** the planner's own choice for a whole-scope count or check was a
  sequential scan with the policy as a per-row filter in two of three statistics states (the 12-minute path). Forced
  onto the index it still re-reads the long list on every row of a lossy bitmap page. Its time depends on the plan
  and on `work_mem`; the per-practice design's does not.
- **Not taken, each a founder ask if wanted:** dropping and re-adding the CHECK as NOT VALID and validating it
  (DDL on a ledger table, an ACCESS EXCLUSIVE lock); the cheaper `links = '{}'` test (it changes what is proved).
- **Size:** time grows with statements and their IDs, not with practices. 10,000 practices: the closing count about
  ten times longer (1 to 27 s), extrapolated, not run. Five-key statements cannot exist before this migration.
- **Cold storage, arithmetic, not measured:** the scan reads the table's 250,000 pages in index order. Here the
  operating system held them. At 3,000 reads a second with nothing cached that adds about 83 s: about 4 min 45 s.
- At launch the table is empty: 4.5 ms measured on the empty database.

## 3. Locks, and what a failure prints
- **Taken and held to commit:** ACCESS SHARE on `roi_statement`, its three indexes, `practice` and two of its
  indexes (`pg_locks`, `out/*preflight*`). Nobody waits. It holds back vacuum's horizon for the 3.3 minutes.
- **A refusal prints counts and statement IDs only** (measured, three planted `{}` statements): `3 of 1000003 stored
  ROI statements, in 2 of 1000 practices, fail the new roi_links_valid; nothing is changed. Statement IDs (the first
  3): <uuid>, <uuid>, <uuid>`, `check_violation`. At most 20 IDs. No links text, no practice name, no figure.
  The stored body after the rollback was today's `49416713dd4d13dd`.

## 4. The proof
- **Every stored statement is checked:** (a) `practice_id` is NOT NULL with a foreign key to `practice`, so every
  statement belongs to a practice the block lists; (b) per practice, the closing count equals the count checked; the
  table is insert-only (`roi_statement_rules` refuses DELETE and any change of `links`; TRUNCATE is refused), so equal
  counts are the same statements; (c) the empty-pass guard catches a scope that opened nothing.
- **A failing statement stops the migration:** the block raises, the runner rolls the try back, and 3.2's new body
  goes with it.
- **What is not covered without question 1's lock:** a statement committed after its practice's closing count and
  before the migration commits (milliseconds; up to about 3 s at this size). Today's CHECK still checks it, so only a
  stored `{}` could slip through, which no code writes but the app's role can insert by hand.

**Failing-first tests** (real file, through the runner, as `tp_owner`, never a superuser; synthetic rows; in
`packages/db/src/`, beside `migrate.db.test.ts`):
- **P1 (replaces T2):** three practices with valid statements, one of them deleted and holding a `{}` inserted in
  scope as the app's role. The migration refuses with `check_violation`; the message has "1 of N", "1 of 3" and that
  statement's ID, and no other row's text; both bodies keep today's hashes. Fails first: no migration.
- **P2 (replaces T2c), three altered copies of the file, each must REFUSE** (the old T2c demanded a silent pass):
  (a) the loop's `set_config` removed: the empty-pass guard refuses; (b) the first loop skips the last practice, which
  holds the `{}`: the closing count reads it and refuses; (c) the closing loop removed and the first loop skipping the
  last practice: must fail the test, proving (b) rests on the closing count.
- **P3:** a passing run's NOTICE states the test's own count of statements and practices; `app.practice_ids` is
  `'{}'` after a pass and after a refusal.
- **P4 (with the lock only):** a second connection holds an uncommitted `{}` insert; the migration cannot take the
  lock; the test commits; the migration reads that practice again and refuses, naming the statement.
- **P5:** the file has no `ALTER TABLE`, `POLICY`, `ROLE`, `SECURITY DEFINER`, `GRANT` or `row_security`.
- T2b stays. The build re-runs `w41/jobA.sh` and `jobB.sh` against the real file and records the times.

## 5. The build cut (one session, one stage each)
0. **A person types, in the building session, after PR 4 has merged:** `/new-migration roi_statement_actionable_lines`
   (the only migration in PR 5).
1. **Migration and its tests:** `packages/db/migrations/<timestamp>_roi_statement_actionable_lines.sql` (the note's
   3.1, 3.2, this 3.3, 3.4 with D2 and its header line, 3.5, 3.6); tests T1, P1 to P5, T2b, T3, T3b.
2. **Writer** (note 4.1): `apps/worker/src/triage/actionable-now.ts`, `apps/worker/src/reconcile/statements.ts`,
   `packages/db/src/schema/ledger.ts`; T4 to T8, T11, T15, T16.
3. **Readers** (note 4.2): `apps/web/src/lib/reconciliation/queries.ts`, `apps/worker/src/reconcile/print.ts`; T9,
   T10, T12, T13.
4. **Measurements:** T14 and this preflight on the real file; the status file.
5. **Domain model, records, description** (note 4.3 and 7); the gates.
6. **Two reviews, one fix round;** the approval line as a suggested change.

## 6. Open questions for a person
1. **Should the block take a short SHARE lock on `roi_statement` for the closing count?** Recommendation: **yes.**
   It makes the proof exact: no statement can be committed between the closing count and the migration's commit.
   Cost, measured: writers of statements wait 0.12 to 2.7 s at 1,000,000 statements (nothing at launch); readers never
   wait. It is taken with NOWAIT, tried once a second for 30 s, so nobody queues behind it (the pattern of
   `20261109090000`, section 2). Its failure, measured: a writer's transaction open for 90 s across the closing made
   the migration refuse at 216.5 s with nothing changed, and the deploy is run again. A writer open for 20 s: the lock waited 9.0 s, the new
   statement was read and checked, 206.2 s in all.
   **This corrects a sentence the founder read** ("it takes only reading locks"), so the orchestrator decides whether
   it is relayed. It touches no granted text. Unanswered, step 1 builds without the lock.
2. **Cold storage:** accept the arithmetic above (about 4 min 45 s, never a real run)? Recommendation: yes; the limit
   stays at 5 minutes.
3. **Should the scan stop itself at 5 minutes?** Recommendation: no. A larger database could then never migrate.

Nothing here is a founder ask: no granted text is touched.
