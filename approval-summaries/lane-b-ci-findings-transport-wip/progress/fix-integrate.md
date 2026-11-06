# ci-findings-transport: fix-round integrate (2026-11-04)

## Step 1: base merge
- 23:55 UTC: fetched. HEAD = origin/co-001/wip-ci-findings-transport = 3d48d0b3… (clean).
- Live base origin/claude/build-platform = 7fb3e102… (#84, #116, #117 since 30871f72…; 42 commits). Merge-base 30871f72….
- 23:56 UTC: merged 7fb3e102… with a merge commit 811c65b7… (no conflicts; auto-merged ADR 0066, test-matrix.md, ci.md, synth matrix.ts; both sides kept).
- Generators under the lock: pnpm install --frozen-lockfile 0; watched.ts --write 0; synth --all 0 (309 cases, 0 written, 710 unchanged; 8 EMR formats, 0 written). Status clean, nothing to commit.
- workflows.test.ts whole: 142/142 passed (97.7 s).

## Step 2: full suite (logs in scratchpad/cft/logs/suite/)
- 23:59–00:03 UTC (one lock hold, head 811c65b7…): typecheck 0 (66 s); lint 0 (159 s); lint:copy 0; lint:logs 0; check:fixtures 0; verify-content 0.
- 23:59 UTC: tools/stryker/affected.ts against the merge base 7fb3e102…: money, pricing, ledger, packets not affected; any=false, shards none (gate not run).
- ~00:10 UTC: the container restarted mid unit run (log ends without a summary; kept as unit-interrupted.log). Resumed from unit at 00:15 UTC under a new lock hold (cft/bin/suite-rest.sh).
- 00:17 UTC: design §7's closing sentence corrected (the proof shows 124 and 137); the design's "Fix round (2026-11-04)" section was already written before the restart. PR description draft (scratchpad/cft/pr-body.md, suite numbers to fill) and title (pr-title.txt) written.
- 00:22 UTC: pnpm test (unit, coverage) exit 0, 457 s: 461 files, 9,261 passed, 0 failed, 4 skipped (3 tools/engine-freeze/differential.test.ts: ENGINE_FREEZE_BASE unset outside CI; 1 packages/rules/src/content.test.ts "throws when content/outgoing is unreadable": root uid). Coverage lines 68.74%, statements 68.61%, branches 66.2%, functions 63.12%.
- 00:23 UTC: test:golden exit 0: 5 files, 381 passed. 00:24 UTC: test:oracle exit 0: pyx12 4.0.0 agrees with all 689 synthetic 835s (678 valid, 11 malformed rejected); edi835 agrees on every one.
- 00:34 UTC: test:db 1/4 (fresh cft_db_1 on 5433, migrated): exit 0, 619 s, 36 files, 3,292 passed, 1 skipped.
- 00:49 UTC: test:db, four shards one after another, each on a fresh PG18 database on 5433, migrated: 1/4 36 files 3,292 passed 1 skipped (restore-drill: local pg_dump vs server 18); 2/4 36 files 2,773; 3/4 36 files 2,765; 4/4 35 files 975. Total 143 files, 9,805 passed, 0 failed, 1 skipped. No route-tests.8 flake this run.
- 00:51 UTC: build exit 0 (108 s); stamped 811c65b7…. e2e (E2E_PREBUILT=1, 2 workers) running.
- 01:04 UTC: e2e (E2E_PREBUILT=1, --workers=2) exit 0: 81 passed (13.1 min). synth --all: 309 cases, 0 written, 710 unchanged; 8 EMR formats 0 written; status clean (0 lines). actions:check --offline 0; BASE=origin/claude/build-platform actions:check 0 (no pin new against the base; upload-artifact cf430e03 is v7.0.2); toolchain:check 0 errors, 1 warning (pnpm 10.34.9 newer than packageManager's 10.34.8: the base's, weekly triage); actionlint 1.7.7 plain exit 1, 46 messages all `label "ubuntu-26.04" is unknown` (this version's label list), with `-shellcheck= -pyflakes= -ignore 'label "ubuntu-26\.04" is unknown'` exit 0. Suite end 01:04:34 UTC: nothing red.
- Fast-check numbers (00:01-00:03): typecheck 22 projects; lint 1,819 files 0/0; lint:copy 584 files; lint:logs 1,152 files; check:fixtures 342 guarded, 4,144 searched; verify-content passes.
- 01:06 UTC: live base now 370b8973… (#119, test-flakes-6), past 7fb3e102…: base merge 3 to do (step 5).

## Step 5: up-to-date check and base merge 3
- 01:05 UTC: base 370b8973… (#119, test-flakes-6: apps/worker/src/screening/threads.test.ts only) not an ancestor; merged with a merge commit cd2c91c0… (no conflict, both sides kept).
- Under one lock hold 01:08-01:14 UTC: install 0; watched.ts --write 0 (568 lines); synth --all 0 (309 cases, 0 written, 710 unchanged; 8 EMR 0 written); status clean, nothing to commit; typecheck 0 (22 projects); lint 0 (1,819 files, 0/0); lint:copy 0 (584); lint:logs 0 (1,152); check:fixtures 0; workflows.test.ts 142/142; vitest --project unit tools/test tools/content-calendar 23 files 353/353; status clean.
- 01:15 UTC: re-fetched: base still 370b8973…, an ancestor of HEAD. Diff against the base: 13 files, +827 −213.

## Push
- 2026-11-05T01:15:20Z: `git push -u origin HEAD:refs/heads/co-001/ci-findings-transport`, new branch at **cd2c91c0…**; pre-push hook: 2 commits checked, fixture guard 0 files read, 4 text files searched, gitleaks no secret. Not forced, no --no-verify.
- 2026-11-05T01:15:29Z: WIP ref fast-forwarded 3d48d0b3..cd2c91c0 (hook: nothing new to check). Both refs = cd2c91c0….
- No PR opened, commented, reviewed or edited. Description draft scratchpad/cft/pr-body.md (24,473 characters), title pr-title.txt.
