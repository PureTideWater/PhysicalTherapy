# Lane B P4 (#96) integrate — progress

## Step 1 (16:07 UTC)
- HEAD = origin/co-001/wip-ci-mutation-trigger = a614a4b2…; descends from origin/co-001/ci-mutation-trigger 50029e64….
- Base origin/claude/build-platform = c4941291…; fork point 43565235….
- Base merges since the fork (first parent): #92, #93, #90, #42, #95, #91, #94, #107, #105, #75, #106, #86, #108, #104, #109.

## Step 2 base merge (16:10 UTC)
- Merge commit a08ab953… (Merge claude/build-platform c4941291 …). Conflicts: ADR 0066 header Date line (N32 + Part 7 kept), reconciliation-001 (#86's N32 paragraph then #96's P4). Auto-merged: README, test-matrix, ci.md, synth matrix/registry, workflows.test.ts.
- Notice numbers: base has N1–N32; #96's N43–N56 do not collide; no renumbering.
- Generators + workflows.test + unit: running under lock (gen.log).
- Generators under lock (16:08:11–16:11:38): pnpm install --frozen-lockfile 0; watched.ts --write 0; synth --all 0; status clean (nothing to commit).

## Step 3 (16:11 UTC)
- Whole tools/test/workflows.test.ts on the merged tree: 1 file, 135/135 passed (#86's T3–T6 hold #96's mutation.yml as merged; no fingerprint or closed-list change needed).
- vitest --project unit tools/stryker tools/test: 35 files, 522/522 passed.
- No fixes needed in step 3.

## Step 4 replay (started ~16:20 UTC under the lock)
- All 80 PRs into claude/build-platform (53 merged, 21 closed unmerged, 6 open; REST list), each from its fork point (merged: merge commit's first parent; others: c4941291…) to its head; #96 at the merged head a08ab953….
- Clone /home/user/fx-p4-int-replay (full; a blobless one was too slow, killed); base tooling = worktree /home/user/fx-p4-int-base at c4941291… (tools/stryker unchanged since 43565235…); head tooling = /home/user/ci-mutation-trigger.
- Harness scratchpad/p4/int/replay.mts (whole3's, reasons printed); logs logs/integrate/replay/.
- Replay done (16:20–17:20 UTC), 0 errors, stderr empty. Results (base rule c4941291… → this branch at a08ab953…), ten-run shard means (money-ledger 4.54, pricing 17.29, packets 32.05; full 53.88):
  - The 58 (≤#89, today 41 merged / 15 closed / 2 open): full 23 → 17, partial 8 → 12, none 27 → 29; saved 243.03 runner-minutes.
  - Narrowed (same seven as the re-read): #2 ledger 49.34; #3 none 53.88; #4 ledger 49.34; #6 pricing+ledger 32.05; #25 none 53.88; #31 pricing+packets 4.54; #43 none 53.88 (= 296.91).
  - Widened: #46 none → all four (its root .gitattributes, N56): −53.88.
  - Base count 23 not 22: #88 (Dependabot) was re-pushed 2026-11-02 04:03Z, after the re-read's listing (01:03Z); its new head moves the lockfile, full under both rules.
  - #90–#95: equal under both (#94, #95 pricing+packets; others none). #95–#113 (17): equal under both; full 7, partial 3, none 7.
  - All 80: full 30 → 24, partial 12 → 16, none 38 → 40.
- Full suite started 17:20:27 UTC (setsid, under the lock), status logs/integrate/suite/status.txt.

## Step 5 suite (head a08ab953…, base c4941291…), logs logs/integrate/suite/
- typecheck: passed, 22 projects (100.6 s wall, 22/22 warm).
- lint: passed, 1,780 files in 3 groups, 0 errors, 0 warnings (180.6 s).
- lint:copy: 563 files. lint:logs: 1,129 files. check:fixtures: 342 guard files, 4,090 text files. verify-content: every set passes (drafts 10 records).
- pnpm test (ENGINE_FREEZE_BASE=c4941291…): 446 files, 7,691 passed, 1 skipped (7,692), 0 failed, 572 s. Skip: packages/rules/src/content.test.ts:179 skipIf(uid 0) (root here). Coverage: statements 68%, branches 65.32%, functions 62.42%, lines 68.14%. Base push unit job 126617610680: 443 files, 7,581 + 1 skipped → #96 adds 3 files, 110 tests.
- test:golden: 5 files, 381 passed. test:oracle: pyx12 4.0.0 agrees on all 689 (678 valid, 11 malformed rejected); edi835 agrees on every segment, amount, balance and verdict.
- test:db, 4 shards one after another, each on a fresh tp_suite_p4i_dbN (5433, PG18), migrated by itself, dropped after: 1/4 36 files 3,290 passed + 1 skipped (777 s); 2/4 36 files 2,763 (292 s); 3/4 36 files 2,745 (552 s); 4/4 35 files 970 (241 s). Union 143 files = every *.db.test.ts, none twice; 9,768 passed, 1 skipped, 0 failed.
  - The 1 skip: apps/worker/src/platform/restore-drill.db.test.ts 'restores the latest snapshot…' (this machine's pg_dump is 16, the server 18; CI's runner has 18 client tools).
- pnpm build: passed (web + worker, 131 s); tree clean after. Stamp: apps/web/.next/BUILD_COMMIT = a08ab953… (as ci.yml's build job writes it).
- E2E_PREBUILT=1 pnpm test:e2e --workers=2 (tp_suite_p4i_e2e, port 4796): 77 passed, 0 failed, 15.2 min; the web server's "build-stamp: the build is a08ab953…'s".
- affected.ts --event pull_request --base c4941291…: any=true, all four (mutation.yml steps; stryker/*.config.mjs and tools/stryker/** global inputs); 7 shards.
- Shards one at a time as the workflow runs them (canary + verdict, shards.ts, gate --shard): every canary 5 of 5 (~30 s each); money-ledger 361 s, packets-scan 445 s, packets-rest 1,040 s, packets-explain 1,085 s, pricing-engine 631 s, pricing-recompute 295 s, pricing-rest 448 s; all exit 0. Per file, mutants and detected equal to base push mutation run 41842546827 on all 42 files (money-ledger 15 files 2,244/2,283; packets-scan 1 995/1,059; packets-rest 11 1,309/1,344; packets-explain 8 2,006/2,006; pricing-engine 1 844/855; pricing-recompute 1 649/662; pricing-rest 5 441/443).
- Gate job: runtime.ts (GITHUB_ACTIONS=true, --pnpm 10.34.8 --commit a08ab953…) pinned, at the commit tested; gate.ts --expected <7> with GITHUB_ACTIONS=true GITHUB_SHA=a08ab953…: passed. money 96.58% (226/234), pricing 98.67% (1,934/1,960), ledger 98.48% (2,018/2,049), packets 97.75% (4,310/4,409); every undetected a recorded equivalent.
- synth --all: 0 written, 700 unchanged; status clean. actions:check --offline 0; BASE=… actions:check 0 (no pin new, nothing read); BASE=… toolchain:check passed 0 errors 1 warning (pnpm 10.34.9 newer than packageManager: the weekly triage's, not #96's); actionlint exit 0 no output; runtime.ts off and on runner: pinned, at a08ab953…. Final status clean. Suite done 19:42:33 UTC.

## Step 6 (19:50 UTC)
- Description drafted from the live body (REST pulls/96) and the base's template: scratchpad/p4/pr-body-new.md, 49,961 characters (50,137 bytes), no model identifier, ends with the attribution and session lines.

## Step 7 second base merge (19:43 UTC)
- origin/claude/build-platform moved c4941291… → 00fd2906… (#113, #114, #85, #115). Merge 0a750dd4… (no conflicts; message amended before any push to add the trailers).
- Under the lock 19:44:21–19:52:37: install 0; watched.ts --write 556 lines, no diff; synth --all 307 cases, 0 written, 708 unchanged (8 EMR, 16 unchanged); status clean. typecheck passed 22 projects; lint 1,792 files 0/0; lint:copy 569; lint:logs 1,135; check:fixtures 342 / 4,112; workflows.test.ts 135/135; vitest unit tools/stryker tools/test 35 files 522/522; status clean.
- Replay of the moved/new PRs at 00fd2906…: #114–#117 none under both; #85, #113 (merged, new heads) none under both; #110 (new head) pricing+packets under both; #96 at 0a750dd4… all four, 7 shards. All 84: full 30 → 24, partial 12 → 16, none 42 → 44. Base push mutation run at 00fd2906… (41898815408): per-file table equal to the local shards on all 42 files. Base unit at 00fd2906… (job 126815428927): 449 files, 7,664 + 1 → expected 452 files, 7,774 + 1.
- PUSHED 0a750dd4… to co-001/ci-mutation-trigger at 2026-11-04T20:02:17Z (fast-forward from 50029e64…, through the pre-push hook: fixture guard and gitleaks, no findings); WIP ref pushed to the same sha (fast-forward from a614a4b2…).
- Runs on 0a750dd4… (pull_request): ci 41902747142, mutation 41902746999, screening-capacity 41902747011, approval-of-record 41902746982 (queued / in progress at 20:03 UTC).
- Not done here (outside this step): the PR description is drafted only (scratchpad/p4/pr-body-new.md); no PR edit, comment, review, ready or merge.
