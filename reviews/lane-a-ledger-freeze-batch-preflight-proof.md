# Review: completeness of the proof, stored-statement preflight (addendum W41)

Block: `w41/preflight.sql` (SHA-256 `73c0f7bc6eccb702`, matches). Experiments on `pr5w41_t`, all rolled back (3,000 statements, none `{}`, as found).

## Findings

1. **Blocker. Without the lock the hole is any open writer, not "milliseconds; up to about 3 s" (addendum 73-75), and the default build has no lock (line 115).** A second session inserted a `{}` and stayed open 7 s; `-v lock=0 -f run_preflight.sql` beside it printed `3000 statements checked in 3 practices, 0 refused`. That insert was checked by today's body (`{}` gives NULL, the CHECK passes) and can commit after the closing count, or after the migration commits. Fix: make the SHARE lock part of the design, not question 1 (with `lock=1` the same run waited 5,007 ms for the writer), or correct the sentence to "any writer transaction open at the closing count".

2. **Should fix. The empty-pass guard is not a second road: it opens its scope from the same list.** The block run by a role without `practice_resolver` (`SET LOCAL ROLE tp_app` after A): `0 statements checked in 0 practices, 0 refused`, with 3,000 stored. It is also all-or-nothing: a mutant whose pass 1 and summing loop stop at `n-1`, one `{}` planted in the last practice, printed `2000 statements checked in 3 practices, 0 refused`. Proof (c) rests on the role and on P3's count, not on the guard. Fix: refuse unless `current_user = 'tp_owner'` and `pg_policies` has `practice_resolver`; under the whole scope, each practice with a zero count must also have no row (`EXISTS ... WHERE practice_id = id`, one index probe).

3. **Should fix. P2(a) as worded never reaches the guard.** Line 22 deleted, one `{}` planted: `ERROR: 1 of 3001 ... fail the new roi_links_valid` (the closing loop's own `set_config`, line 49, reads everything again). The guard fired only with lines 22 and 49 both deleted (`read 0 statements in 3 practices, but the table is not empty`). So P2(a) passes with the guard deleted. Fix: remove both; assert the SQLSTATE (55000, not 23514) in every P2 copy.

4. **Should fix. P2(c) contradicts its header.** "Each must REFUSE", yet (c) passes silently, which is its point. Reword: (c) must pass, with a short count in its NOTICE.

5. **Should fix. Bugs that P1 to P5 all miss:** (i) lines 14-16 deleted (the check works: under REPEATABLE READ the block refused; no test runs it); (ii) lines 43-47 deleted and the closing cut to one round with no "kept arriving" refusal: no test commits a statement or a practice between pass 1 and the closing without the lock; (iii) `LIMIT 20` removed; (iv) `IS NOT TRUE` changed to `= false`: A returned false, never NULL, for `{}`, a null value, a null element, JSON null and SQL NULL, so no test can tell them apart. Fix: P6 under REPEATABLE READ; P7 with 21 planted (20 IDs, "21 of N"); with the lock, delete the three-round code (line 57 makes it dead).

6. **Should fix. False refusals.** With the lock: a session holding SHARE UPDATE EXCLUSIVE (VACUUM's and ANALYZE's mode) for 34 s, writing nothing, gave `ERROR: roi_statement stayed in use for 30 seconds`, at 30.6 s. NOWAIT never queues, so it never cancels autovacuum. Without the lock: an arrival in each of rounds 2 and 3 (0.15 to 2.7 s each): near certain while the quarterly job writes a statement per practice, about 0.2% at one a minute, never at launch. Fix: a runbook line (not during the quarterly job); make the last try a waiting LOCK under the runner's 5 s `lock_timeout`.

7. **Should fix. Figures stated beyond the outputs.**
   - "4.5 ms on the empty database": no file in `out/`, no line in either job log. Mine, the table emptied in a rolled-back run: 9.8 ms.
   - The 20-second writer (206.2 s, 9.0 s): `m1_writer_lock1b.txt` exists, but `jobB.log` has no line for it, and 14:46:07 to 14:50:08 fits only the 216.5 s run. Re-running the two jobs may not reproduce it.
   - The 196.0 s and 205.0 s rows are `lock=1` runs; the table does not say so.
   - "Margin 95 to 104 s" leaves out the lock wait: 206.2 s measured, up to 30 s allowed, so 65 s.
   - Cold storage: 250,000 pages holds (`heap_blks_read` +250,003 a run). 3,000 reads a second has no source; a one-at-a-time index scan reaches it only at 0.33 ms a read (1 ms gives 250 s, about 7.6 min in all). 205.0 + 83 + 30 s of lock wait is 318 s, over the limit. Fix: one run with the cache dropped, or state the break-even (2,630 reads a second; 3,850 with the wait).
   - 10,000 practices: leaves out `id <> ALL (ids)` (n squared a round) and keeps 1,000,000 statements. State the ceiling: about 1.46 million statements of 40 IDs, warm (300/205).

8. **Note. IDs in the message.** All four RAISEs print counts and statement UUIDs only (read, and seen in runs). But the step replaced said "no ID list" (note line 90), and the repo's rule `privacy-and-tenant.md` bars identifiers in thrown errors. Flag the reversal to a person, or drop the list.

9. **Note.** P3's "`{}` after a refusal" is vacuous (the setting is transaction-local; the rollback restores it). P4 must commit only once the migration's backend shows `wait_event = PgSleep`, else pass 1 reads the row and the lock path never runs. P5 either misses lowercase or trips on the block's own comment (preflight.sql:5). "Equal counts are the same statements" fails only with the trigger off (the owner's ALTER TABLE, or a superuser's replica mode, as `fail.sql` plants); say so in section 4.

## Tested and not broken
- As `tp_owner` the practice list is whole (`practice_resolver`, `USING true`; 3 of 3 with no scope set), deleted practices included.
- Insert-only for `tp_app`: no DELETE grant, UPDATE on 2 columns, both triggers enabled; `links` and `practice_id` cannot change (20261024120000:43-48).
- With the lock an uncommitted writer is waited for, then read. Not tested (it needs a commit): that a writer released at the migration's commit runs the new body.
- The other section 2 and 3 figures match `out/`.
