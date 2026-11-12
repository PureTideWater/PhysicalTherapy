# Review: stored-statement preflight (W41 addendum), tenant isolation and locks only

2026-11-12. `preflight.sql` SHA-256 `73c0f7bc6eccb702` (matches the addendum). Experiments on `pr5w41_t` (PostgreSQL
18.4, synthetic), all rolled back; the database is as found. No blocker for isolation. Five should-fix findings on
the SHARE lock and the tests, two notes.

## Findings

1. **Should fix (blocker if confirmed): the block's own lock refusal may be retried by the runner.**
   `preflight.sql:37` raises with `ERRCODE = 'lock_not_available'`, the SQLSTATE of a cancelled lock wait. The runner
   branches on `isLockTimeout(error)` (`migrate.ts:319`) inside `for (attempt = 1; ; ...)` (`:349`). If that test reads
   SQLSTATE 55P03, each try repeats the 200 s scan plus 30 s. The "refuse at 216.5 s" of section 6.1 was measured in
   psql (`run_preflight.sql`), not through the runner. Not verified: `isLockTimeout` is outside the lines I was given.
   The precedent raises the same code, but before any work. Fix: raise `object_in_use` (55006) here, or prove one try
   with a runner test (lock never free: one scan, then failure).

2. **Should fix: vacuum and analyze block the SHARE lock, and NOWAIT never cancels them.** E1: with a SHARE UPDATE
   EXCLUSIVE holder (the mode VACUUM, ANALYZE and autovacuum take), the loop printed
   `locked=f after 2 tries`. A NOWAIT try never queues, so the deadlock check that makes autovacuum yield to a waiter
   never runs. An autovacuum of a 2 GB table can outlast 30 s; each overlap costs a 230 s refusal. Section 6.1 names
   writers only. Fix: say so in sections 3 and 6; have the refusal name the blocker's pid and backend type (`pg_locks`
   joined to `pg_stat_activity`); add a P4 case with that holder.

3. **Should fix: the lock is held longer than "0.12 to 2.7 s".** That figure is the closing count. The lock lasts to
   COMMIT (the NOTICE says so): also lines 62-72, which run `roi_links_valid` again over every statement of up to 20
   failing practices on a path that then refuses; the probe; steps 3.4 to 3.6; the runner's bookkeeping; and in the dry
   run every later pending migration (`migrate.ts:299-327`, one transaction). It also stops the PDF-recording UPDATE
   (`20261024120000:88`) and vacuum (E2: `ShareUpdateExclusiveLock granted=false`). Fix: collect failing IDs in the
   scan itself (`(array_agg(s.id ORDER BY s.id) FILTER (WHERE ... IS NOT TRUE))[1:20]`), drop lines 66-69; state the
   hold as "closing count to COMMIT", measured through the runner. The SHARE lock must be the last lock the file takes:
   a later one that a queued writer blocks is a deadlock, and `deadlock_timeout` (1 s) fires before `lock_timeout`.

4. **Should fix: P3 and P2(a) assert states that do not occur.** T4/T5: after `ROLLBACK TO SAVEPOINT
   tp_migration_runner_try` and after ROLLBACK the scope printed `[]` (empty string), never `'{}'`. T6: in that
   session state `SELECT count(*) FROM roi_statement` as `tp_owner` raises `malformed array literal: ""`, so P2(a)
   (the loop's `set_config` removed) ends in that error, not the empty-pass guard, on any connection that ran an
   earlier migration. Both fail closed; the block is right, the tests are not. Fix: P3 asserts `'{}'` after a pass and
   "empty or unset" after a refusal; P2(a) accepts either refusal.

5. **Should fix: the test switch can turn the lock off silently.** Lines 6 and 29 (`w41.lock`). Dropping only line 6
   fails closed; softening line 29 to `current_setting('w41.lock', true)` never locks and still passes P1 to P3. Fix:
   the migration hard-codes the answer; P5 also refuses `w41` and any `set_config` other than `app.practice_ids`, and
   asserts one handler, `lock_not_available`, holding only the NOWAIT statement.

6. **Note: the half of the window after the lock is argued, not tested.** A writer queued behind SHARE inserts after
   COMMIT; the proof needs its CHECK to run the new body. `roi_links_valid` has `SET search_path` (proconfig), so it
   is never inlined, and PostgreSQL 18 caches SQL-function plans per session. Not tested: it needs a committed change.
   Fix: P4 adds a connection that inserted once, queues a `{}` behind the lock, and is refused after the commit.

7. **Note: without the lock, line 68 can list more IDs than the "N of M" it follows** (a `{}` arriving between the
   count and the list). Finding 3's fix removes it.

## Tested, could not break

- **Visibility.** `tp_owner` saw 3 of 3 practices with the scope unset and empty (T1, T6); in a one-practice scope,
  1,000 statements of 1 practice (T2), 3 x 1,000 = all. One policy on `roi_statement` (`roi_statement_tenant`,
  permissive, public), none restrictive; FORCE on both tables; neither role is superuser or BYPASSRLS.
- **Scope.** Kept across the aborted NOWAIT subtransaction (T3); gone after the savepoint rollback and ROLLBACK (T4,
  T5); `{}` after every pass in `out/`. The block has no policy, role, grant or FORCE statement. A later migration in
  the dry-run transaction inherits `{}`: nothing.
- **`tp_app`.** Table-level privilege is SELECT only (ACL `tp_app=r`; inserts by column grants), so it cannot LOCK
  TABLE above ACCESS SHARE; no CREATE on `public`. The refusal and NOTICE carry counts, times and statement IDs only.
- **Locks.** `out/*preflight*` agrees with section 3 (plus `pg_proc` and the transaction's own ID from step 3.2).
  No foreign key references `roi_statement`. NOWAIT cannot deadlock or queue (E1); a reader passed a queued
  vacuum-mode request without waiting (E2). The handler meets the skill's rule (lines 31-34).
- **READ COMMITTED.** `out/m1_writer_lock1b.txt:7`: lock wait 9013 ms, 1,000,007 checked, 1 practice read again.
- **Insert-only.** `roi_statement_rules` (row, before INSERT/UPDATE/DELETE) and `roi_statement_no_truncate` enabled.
- **plpgsql.** Zero practices, arrivals, 30 subtransactions: sound by reading. 10,000 practices not run.
