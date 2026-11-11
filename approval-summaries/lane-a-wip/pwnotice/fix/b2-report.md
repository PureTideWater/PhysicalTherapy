B2 report: the migration and packages/db (fix round, worktree /home/user/pwnotice)

All eight items are built. Two files changed, nothing else touched:
- /home/user/pwnotice/packages/db/migrations/20261111090000_password_changed_notice.sql (put in place twice, each time by the one-command marker route; `.claude/.allow-protected-edit` does not exist)
- /home/user/pwnotice/packages/db/src/password-notice.db.test.ts (24 cases at the branch head, 39 now)

Migration SHA-256 when I finished: e1288b9c074ced20fc8d08b7d64001786a7d29b23ae3d1695eff551eb20ea0eb

migration-ready: created 2026-11-11T06:06:05Z, on the first drop (R3 + R8, SHA 94959ba1...), after the worktree's password-notice.db.test.ts passed 26/26. The second and last drop (R9, the header, comments) went in at 06:21:16Z. A database someone migrated between those two times holds the first drop's checksum and the runner will refuse to re-migrate it ("changed after it was applied"); recreate it. Tests that create their own database are unaffected.

Final state: `vitest run --project db packages/db` = 1610 passed, 3 failed (the three drift cases, expected, named below); unit project of packages/db 292/292; eslint clean on the test file; packages/db type-checks; `pnpm -s lint:logs` passes. Test runs used DATABASE_URL on my own tp_fix_b2_1, under the flock. All my databases are dropped and my scratch copy of the tree is removed. Every proof file named below is in <W6 scratchpad>/fix/b2/out/ (full paths given per item).

## Per item

1. R3 (claim returns mfa_enrolled). Files: migration (function, its comment, the header's list); test file (new case "returns with the address whether the account has a second factor enrolled...", helpers read the four columns by name).
   - Red: on the migration as it stood, 2 failed | 24 skipped; the R3 case got three columns, not four. <W6 scratchpad>/fix/b2/out/red-items-1-2-new-cases.out
   - Green: 26/26 on drop 1, 39/39 on the final file. <W6 scratchpad>/fix/b2/out/green-drop2-worktree-verbose.out
   - The case covers an enrolled account (true), an invited account with no second factor (false), and that the value is read at the claim, not when the notice was queued.

2. R8 (`_sent` reads only a password_changed record). Files: migration (`AND m.kind = 'password_changed'`, comment); test file (new case: a probe that bounced, a digest rejected, a digest delivered).
   - Red: in a scratch copy with R3 only, 1 failed: "probe bounced: expected true to be false". <W6 scratchpad>/fix/b2/out/red-item-2-r8-on-r3-only.out
   - Green: 39/39. By hand, the reviewer's exp3 step: before `undelivered|...|t` with password_notice_undelivered; now `sent|...|f`, only password_notice_sent. <W6 scratchpad>/fix/b2/out/exp3-probe-before-after.out

3. R9 (preflight by SHA-256). Files: migration (three hash comparisons replace the substring checks; the six column names' check stays; a comment says where the values come from and how to recompute them).
   - Red: on the old preflight, 6 failed | 33 passed: one more statement in either function and one more reserved action in the policy all "applied"; a missing expiry got PostgreSQL's 42883, not the migration's words. <W6 scratchpad>/fix/b2/out/red-r9-db06-on-drop1.out and, by hand, <W6 scratchpad>/fix/b2/out/preflight-before.out
   - Green: 39/39; by hand the new file applies on the unchanged base and refuses each of ten perturbations in its own words. <W6 scratchpad>/fix/b2/out/preflight-after.out
   - The worktree's runner applied it on the base (48 already, 1 applied), also on a base seeded with 500,000 mail records in 271 ms. <W6 scratchpad>/fix/b2/out/runner-applies-on-seeded-base.out

4. DB-06. File: test file, new describe "the migration on the previous head" (13 cases on one database the runner migrated to every file before this one).
   - (a) Ten refusal cases over the preflight's seven RAISEs, each asserting code 55000 and the exact message; one case that the three pinned values equal the previous head's hashes and, for the two bodies, the hash of migration 20261107090000's own text; one case through the real runner (MigrationError naming the file and message, nothing recorded, then applies once the body is put back). Red/green as item 3; the six refusals that already fired pass before and after.
   - (b) Whole-file lock case: strongest mode per pre-existing public relation must equal exactly the loop's three. Red: the reviewer's `LOCK TABLE user_session IN ACCESS EXCLUSIVE MODE;` mutant, 1 failed | 38 passed, user_session appears. <W6 scratchpad>/fix/b2/out/mutant-queueing-lock-full.out. A stronger lock on "user" after the loop fails it too. Green: 39/39.

5. DB-04 (lock-loop test). File: test file.
   - Red: the migration's loop replaced by reviews/db/loop-mutant.sql word for word (checked), three runs, each 1 failed at "refused while the write of mail_send is open": it held audit_event AccessExclusiveLock and "user" ShareRowExclusiveLock. <W6 scratchpad>/fix/b2/out/mutant-loop-keeps-partial-run1.out (and run2, run3 beside it)
   - Green: the migration's own loop 3/3, then 8/8 more. <W6 scratchpad>/fix/b2/out/stability-loop-and-previous-head.out
   - Decision for you: I did not keep the real sleep. A refused try of a correct loop leaves nothing visible from outside, and the gap between two one-second sleeps is too short to poll, so "a new try" could only be inferred from the clock. The test runs the loop as it stands except `PERFORM pg_sleep(1);`, which becomes a wait on an advisory key the test holds (made inside the migration's own rolled-back transaction). Each try then happens only after the test has ended a holder; at each pause the test asserts no granted or waiting lock on the three tables, then runs the sign-in. It is deterministic and takes milliseconds. What it gives up: the test no longer observes the `PgSleep` wait event; the sleep statement is pinned by text. I also release the holders in the loop's own order ("user", audit_event, mail_send) so each new try gets one lock further. If you want the real-sleep, clock-based version instead, say so.

6. DB-10 (database half). File: test file (the held notice is aged to 23 h 59 min 50 s in one statement; the wait now asserts the cutoff really passed; test timeout 120 s).
   - Red: the test as it stood, with a 4 s stall injected before the claim, fails (claim returns nothing). <W6 scratchpad>/fix/b2/out/db10-old-test-with-4s-stall.out
   - Green: the new test with the same stall passes. <W6 scratchpad>/fix/b2/out/db10-new-test-with-4s-stall.out
   - Cost: the file now runs about 17 s instead of 9 s.

7. DB-03 / DB-09 header (comments only, no test). All the listed sentences are changed: jobs and sign-ins wait and proceed; a signed-in request is refused as busy after its three-second lock timeout with nothing saved (docs/adr/0092's amendment of 2026-11-11, pull request #137); every audited read and every audited mutation; the measured window; the Rollout sentence names no order between services; the dead-letter queue keeps an event 14 days; both "the web is unchanged" sentences; the claim's list.
   - I re-measured the window on a base seeded with 500,000 mail records: the ALTER TABLE 204 to 220 ms, the whole file 224 to 241 ms in psql and 271 ms through the runner. <W6 scratchpad>/fix/b2/out/window-run1.out

8. Pinned tests: no change needed. mail.db.test.ts, hardening.db.test.ts, migrate.db.test.ts, catalog and cross-tenant pass unchanged (their grant maps are keyed by signature, which did not change). <W6 scratchpad>/fix/b2/out/final-db-package.out

## The three pinned values and how they were produced

Commands (output in <W6 scratchpad>/fix/b2/out/base-hashes.out; scripts in <W6 scratchpad>/fix/b2/scripts/):
- `git -C /home/user/pwnotice archive refs/review/pwn-base packages/db/migrations | tar -x -C <scratch>/base` (48 files)
- `createdb -h /tmp -p 5433 -U postgres tp_fix_b2_2`, then from the worktree `pnpm -s exec tsx <scratch>/scripts/migrate-to.mts tp_fix_b2_2 <scratch>/base/packages/db/migrations` (the worktree's own `migrate()`; applied 48, last 20261110090000_ledger_interest_once.sql)
- `SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = 'operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text)'::regprocedure;`
  = 3c175325fc14b48c68b45c7d53dd7463948fe802c9664ccbaa40e0198999c490
- the same for `'operator_mail_expire(integer)'::regprocedure`
  = faa298581d4c547909bfb08258b4a5a4cdf5f80cd08fa4edadda3a31fc1c9723
- `SELECT encode(sha256(convert_to(with_check, 'UTF8')), 'hex') FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_event' AND policyname = 'audit_event_record';`
  = aa4610040f9d9eed924d4bdb04b305438d6e3847eaeda968083b09595b6ffd8d (the same value from `pg_get_expr(polwithcheck, polrelid)`)

The first 16 digits of the two body hashes match what the base's packages/db/functions files print.

## Not done, and why

- docs/product/domain-model.md and packages/db/functions are not regenerated, as told. Three cases fail until you do:
  - domain-model.db.test.ts: "matches the schema a fresh database migrates to..."
  - function-files.db.test.ts: DBF-01 "matches the functions of a fresh migrated database..."
  - function-files.db.test.ts: DBF-04 "--check passes on exact copies..."
  A preview written only into my scratch directory (since deleted) showed what regeneration changes: two function files (operator_password_notice_claim.sql, operator_password_notice_sent.sql; 389 files, 2 written, 0 removed) and seven document lines, with `--strict` clean.
- No schema file changed: nothing in packages/db types the claim's row.
- I did not run the worker's or web's database tests, the e2e, or a whole-repository typecheck or lint (other builders mid-edit).

## Found, not foreseen by the rulings (not fixed outside my files)

1. R7 words in the migration. R7 changes when the job calls `operator_password_notice_failed` and adds the code RecordFailed, and the migration's comments described both. I updated four sentences (the header's functions list, the table's comment, step 4's comment, "a failed try" in the helper's callers), matching the worker's `PASSWORD_NOTICE_RECORD_FAILED = 'RecordFailed'`. This is beyond my item list; strike it if unwanted.
2. /home/user/pwnotice/packages/db/src/schema/operations.ts line 341 lists the error codes without RecordFailed. Not mine to edit under the schema-file rule.
3. The header now cites docs/adr/0092, so the regenerated domain model adds "ADR 0092" to this migration's provenance on three lines (password_notice's "Created by", row D22, Appendix D row 49).
4. The preflight still leaves replaced things uncompared (R9 as ruled covers bodies and the WITH CHECK only):
   - the two CHECKs it rewrites whole (mail_send_kind is only checked for not already admitting password_changed; mail_send_stream_kind not at all);
   - the policy's command and roles;
   - the record function's grants, which DROP and CREATE restate.
5. A missing `operator_mail_expire(integer)` is now refused in the migration's own words (it used to raise PostgreSQL's 42883). Covered by a case.
6. The policy's value is PostgreSQL 18's print of the expression. docker-compose and infra's VER_18 are both major 18; if a server ever printed it differently the deploy would be refused before any change, never applied wrongly.
7. The two earlier lock-loop tests (/home/user/pwnotice/packages/db/src/ledger-interest.db.test.ts and /home/user/pwnotice/packages/db/src/line-status.db.test.ts) have the weakness DB-04 names: they wait for PgSleep and never look at what a refused try holds.
8. The reviewer counted six preflight refusals; the block has seven RAISEs (the record function has both "does not exist" and "is not the body").
