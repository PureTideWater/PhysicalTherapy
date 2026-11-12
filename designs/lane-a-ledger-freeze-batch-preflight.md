# Schema PR 5: the stored-statement preflight (step 3.3), redesigned to meet the 5-minute limit (addendum, W41, 2026-11-12)

Addendum to `designs/lane-a-ledger-freeze-batch.md`. It replaces that note's step 3.3 and its tests T2 and T2c, and
nothing else. It changes no granted text: Appendix A and Appendix D2 with its header line are pasted as granted.
Reference text of the block (not a migration): `lane-a-wip/schema-pr5/w41/preflight.sql`, SHA-256 `38ddc2b78117a6e3...`
(revised after review; the full-size runs below used `73c0f7bc6eccb702...`, which differs only outside the scan loop).
Reviewed twice and revised once (section 7).

## 1. The design
One `DO` block between 3.2 and 3.4, run as `tp_owner` in the runner's transaction:
1. Refuse unless the transaction is READ COMMITTED, and unless the current role is the one `practice_resolver` lets
   read every practice (read from `pg_policy`).
2. Read every practice ID (deleted practices too).
3. **For each practice:** `set_config('app.practice_ids', ARRAY[id]::text, true)`, then one query
   `WHERE s.practice_id = id` that counts its statements and those for which `roi_links_valid(s.links) IS NOT TRUE`.
   It calls the new function itself, as the note requires.
4. **Closing count, under a short SHARE lock on `roi_statement` (question 1):** `LOCK ... NOWAIT`, tried once a second
   for 30 s, then a refusal. Under it: practices created meanwhile are added; for each practice the stored count
   against the count checked; a practice whose count moved is read again. Totals are summed from the whole arrays.
5. **Empty-pass guard:** with every practice in scope, `EXISTS (SELECT 1 FROM roi_statement)` must agree with
   "statements checked > 0". It stops at the first row (about 1 ms).
6. Scope back to `'{}'`; refuse if any statement failed; else a NOTICE with counts and times only.

The reference block's `w41.lock` switch is for measuring. The migration carries no switch.

**Tenant isolation is untouched.** No policy, role, grant or FORCE setting changes; nothing bypasses; `tp_app` owns
nothing. The migration role reads through the same `roi_statement_tenant` policy, under its own transaction-local
setting, as the precedent does (`20261109090000_line_status_heads.sql:127-132`, `20261101090000_billing_review.sql:49`).
The precedent opens every practice at once; this opens one at a time, so the policy compares against a one-element
list and its cost no longer grows with the number of practices. The review could not break it: in a one-practice
scope `tp_owner` saw exactly that practice's statements; the scope is `'{}'` after a pass and gone after a rollback.

## 2. Measured (PostgreSQL 18.4, the machine's defaults, SYNTHETIC rows only)
1,000,000 four-key statements of 40 IDs in 1,000 practices (2,136 MB), each practice's statements spread over the
whole table (the worst order for reading by practice). Each run as the runner runs a file (psql, not the runner),
rolled back. Scripts and output: `lane-a-wip/schema-pr5/w41/` (`README.md`, `jobA.sh`, `jobB.sh`, `out/`).

| Option | Time | Verdict |
| --- | --- | --- |
| The note's 3.3 as written: every practice in scope, one scan | **734.1 s (12 min 14 s)** | fails (W's run: 764.9 s) |
| **This design**, statistics gathered: without the lock; with it | 197.9 s; 196.0 s | **meets** |
| This design, statistics never gathered, without the lock | 202.1 s | meets |
| This design, statistics gathered while the table was empty, with the lock | 205.0 s | meets |
| With the lock, a writer's transaction open 20 s across the closing | 206.2 s (lock wait 9.0 s; the new statement read) | meets |
| Without the lock, 5 statements committed at 60 s | 200.6 s; 1,000,005 checked, 1 practice read again | meets |
| Every practice in scope, one statement, `enable_seqscan` off | 212.7 s, with two parallel workers | rejected |
| The floor: the function alone, no policy (scratch superuser; a yardstick, not an option) | 193.0 s | - |

- The design costs the function's own time plus 3 to 12 s. The floor is Appendix A's cost and cannot be lowered
  without changing A. Margin under the limit: 95 to 104 s; with the longest lock wait (30 s), 65 s.
- **Plans:** the per-practice reads used `roi_statement_by_period` (index or bitmap scan) in all three statistics
  states, with custom and generic plans. The closing count took 0.12 to 0.15 s (vacuumed) and 2.6 to 2.7 s (never
  vacuumed) for all 1,000 practices.
- **Why not one statement over every practice:** the planner's own choice for a whole-scope count or check was a
  sequential scan with the policy as a per-row filter in two of three statistics states (the 12-minute path). Forced
  onto the index it still re-reads the long list on every row of a lossy bitmap page. Its time depends on the plan
  and on `work_mem`; the per-practice design's does not.
- **Not taken, each a founder ask if wanted:** dropping and re-adding the CHECK as NOT VALID and validating it
  (DDL on a ledger table, an ACCESS EXCLUSIVE lock); the cheaper `links = '{}'` test (it changes what is proved).
- **Size:** time grows with statements and their IDs, not with practices. More practices at the same 1,000,000
  statements lengthen only the closing count (about ten times at 10,000 practices: 1 to 27 s); extrapolated, not run.
  Five-key statements cannot exist before this migration.
- **Cold storage is NOT shown to meet the limit.** The scan reads the table's 250,000 pages in index order; here the
  operating system held them. At an assumed 3,000 reads a second with nothing cached that adds about 83 s: 279 to
  288 s, and over 5 minutes with a long lock wait. Arithmetic, not measured (question 2).
- The empty table (every real run today): 5 to 66 ms (`out/base_empty_preflight_lock1.txt`).

## 3. Locks, and what a failure prints
- **Through the scan, to commit:** ACCESS SHARE on `roi_statement`, its three indexes, `practice` and two of its
  indexes (`pg_locks`, `out/*preflight*`). Nobody waits. It holds back vacuum's horizon for the 3.3 minutes.
- **The closing SHARE lock**, from the moment it is granted to the migration's commit: the closing count, the guard
  and steps 3.4 to 3.5 (0.12 to 2.7 s at this size plus milliseconds; nothing on an empty table). Meanwhile a
  statement insert, the PDF record and a vacuum or analyze of the table wait; readers do not. NOWAIT queues nobody and
  cannot deadlock. Its own refusal is not retried by the runner (`isLockTimeout` needs the cancellation's routine,
  `migrate.ts:106-108`), as in `20261109090000` section 2.
- **A refusal prints counts only**, `check_violation`: `3 of 1000003 stored ROI statements, in 2 of 1000 practices,
  fail the new roi_links_valid; nothing is changed`. The reference block also printed up to 20 statement IDs
  (measured); the migration leaves them out unless question 4 says otherwise, and its header comment carries the
  query that lists them. No links text, no name, no figure. The body after the rollback was today's
  `49416713dd4d13dd`.

## 4. The proof
- **Every stored statement is checked.** (a) `practice_id` is NOT NULL with a foreign key to `practice`, and the
  role reads `practice` whole (asserted in step 1), so every statement belongs to a listed practice. (b) Under the
  lock no insert is open, so every stored statement is committed and visible; per practice the stored count equals
  the count checked; the table is insert-only (`roi_statement_rules` refuses DELETE and any change of `links`;
  TRUNCATE is refused), so equal counts are the same statements. (c) The guard catches a scope that opened nothing.
  It rests on the same list of practices, so it is not a second witness of (a).
- **A failing statement stops the migration:** the block raises, the try is rolled back, and 3.2's body with it.
- **Without the lock the proof has a gap** (review, reproduced): a statement inserted before the migration commits
  by a transaction still open at the closing count is never seen, however long that transaction stays open. Only
  today's CHECK checked it, so only a `{}` gets through: no code writes one, the app's role can by hand. The note's
  own 3.3 has the same gap. Without the lock the closing also needs rounds, and a busy statement job can exhaust them.

**Failing-first tests** (the real file, through the runner, as `tp_owner`, never a superuser; synthetic rows; in
`packages/db/src/`, beside `migrate.db.test.ts`):
- **P1 (replaces T2):** three practices with valid statements, one deleted and holding a `{}` inserted in scope as
  the app's role. Refused with `check_violation`, "1 of N" and "1 of 3", no row's text; both bodies keep today's
  hashes. With 25 such statements the message says 25. Fails first: no migration.
- **P2 (replaces T2c), altered copies of the file:** (a) both per-practice `set_config` calls set `'{}'`: the guard
  refuses, by its own message; (b) the first loop skips the last practice, which holds the `{}`: refused, by the
  closing count; (c) run as a role `practice_resolver` does not name: refused in step 1; (d) run in a REPEATABLE
  READ transaction: refused in step 1. (e) A control that must PASS: (b) with the closing loop also removed, showing
  that (b)'s refusal rests on the closing count.
- **P3:** a passing run's NOTICE states the test's own count of statements and practices; inside the transaction
  after the block the scope is `'{}'`; after the run it names no practice.
- **P4 (the lock):** a second connection holds an uncommitted `{}` insert, opened before the migration starts; the
  test waits until the migration's backend is in `pg_sleep` (`pg_stat_activity`), then commits; the migration reads
  that practice again and refuses. Then, on a passing run: the same second connection, which called the old
  function earlier in its session, inserts a `{}` after the commit and is refused by the new CHECK.
- **P5 (the file's text, any letter case):** no `ALTER TABLE`, `POLICY`, `ROLE`, `SECURITY DEFINER`, `GRANT`,
  `row_security` or `w41`; it has `IS NOT TRUE` (the function never answers NULL today, so no row can test it).
- T2b stays. The build re-runs `w41/jobA.sh` and `jobB.sh` against the real file and records the times.

## 5. The build cut (one session, one stage each)
0. **A person types, in the building session, after PR 4 has merged and question 1 is answered:**
   `/new-migration roi_statement_actionable_lines` (the only migration in PR 5).
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
1. **May the block take the short SHARE lock on `roi_statement` for the closing count?** Recommendation: **yes.**
   Without it the proof has section 4's gap. Cost: section 3. Its failures, each "run the deploy again" with nothing
   changed after the 3.3-minute scan: a writer's transaction open more than 30 s across the closing (measured:
   refused at 216.5 s), or a vacuum or analyze of the table running that long (review: refused at 30.6 s on the small
   set). **It corrects a sentence the founder read** ("it takes only reading locks"), so the orchestrator decides
   whether it is relayed. It touches no granted text. **Step 1 does not start until this is answered.**
2. **Cold storage:** the limit is met as it was measured (pages cached), not shown on cold storage. Accept that,
   given every real run is on an empty table? Recommendation: yes. The limit stays at 5 minutes.
3. **Should the scan stop itself at 5 minutes?** Recommendation: no. A larger database could then never migrate.
4. **Statement IDs in the refusal?** `.claude/rules/privacy-and-tenant.md:14` bars identifiers in thrown errors; the
   note's 3.3 said "no ID list". Recommendation: counts only, as section 3 has it.

Nothing here is a founder ask: no granted text is touched.

## 7. Reviews (2026-11-12) and the one revision
Reports: `reviews/lane-a-ledger-freeze-batch-preflight-isolation-locks.md` (0 blockers, 5 to fix, 2 notes) and
`reviews/lane-a-ledger-freeze-batch-preflight-proof.md` (1 blocker, 6 to fix, 2 notes). Each was checked first.
- **Blocker, true:** the gap without the lock is any open writer, not "milliseconds". Section 4 says so; question 1
  now gates step 1.
- **True, fixed in the block:** the practice list trusted the role (step 1's assertion); totals summed by a loop
  (now from the arrays); a quadratic list test (now `EXCEPT`); more IDs than the count (capped).
- **True, fixed in the text:** P2(a), P2(c), P3 and P4 as first worded; the lock's real duration and what waits;
  vacuum blocks the lock; unlabelled lock runs; the margin; cold storage; the 10,000-practice line; the empty-table
  figure's file; the switch must not reach the migration.
- **Checked, not a fault:** the block's own `lock_not_available` refusal is not retried by the runner.
