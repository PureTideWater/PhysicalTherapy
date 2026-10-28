# merge re-check of ae26bf7 (PR #74, co-001/ux-forms)

Started 2026-10-28 UTC. Worktree /home/user/ux-forms, head ae26bf7 = merge of claude/build-platform 0dd1ba7 into 001cdbf. Not pushed.
Logs: scratchpad/merge-logs/<step>.log (runner scratchpad/bin/merge-run.sh: one command under flock /tmp/laneb-heavy.lock).
Lane-b.md "Merging" step 2: re-check what the merge touched, the affected mutation shard included (push is NOT this task's).
Merge diff 001cdbf..ae26bf7: 76 files (workflows, e2e brand baselines + Playwright 1.64.1 config, model-gateway redact, worker packets identifiers, restore-drill.db.test.ts, tools/ci, screening-capacity, synth registry/matrix + fixtures CI-18..20, MOD-13/14, lockfile).

## Commands (status / counts)
- PHASE A driver started (bin/merge-phase-a.sh, nohup; status merge-logs/phase-a.status; skips steps already "exit=0"): 01 typecheck, 02 lint, 03 lint:copy, 04 lint:logs, 05 check:fixtures, 06 synth --all + git status, 07 test (ENGINE_FREEZE_BASE=0dd1ba7, PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers). If interrupted: rerun the driver (it skips passed steps).
- test:db decision: RUN all 4 shards. The merge changed code that db tests import: apps/worker/src/packets/services.ts + identifiers.ts (new `names`; imported by packets.db.test.ts, payer-copy, export-attempts, pricing-race, pricing-current, unattested-submission, report/unattested-report, contracts.db.test.ts), apps/worker playwright-core 1.56.1 -> 1.64.1 (the worker's PDF printing, used by the packet/report db tests), and restore-drill.db.test.ts itself (comment-only). This PR also changes three route db tests (onboarding/sign-in/workbench).
- PHASE B driver started (bin/merge-phase-b.sh; waits PHASE-A-DONE; status merge-logs/phase-b.status): fresh DB tp_mrg_uxf_db (5433), 08 db:migrate, 09 test:db --shard=1..4/4 (json merge-logs/db-k.json), DROP. If interrupted: drop tp_mrg_uxf_db, rerun missing shards.
- PHASE C driver started (bin/merge-phase-c.sh; waits PHASE-B-DONE + file merge-logs/phase-c.go, created after reviewing A; status merge-logs/phase-c.status): clean-tree guard, 10 build, 11 stamp --write HEAD, 12 e2e 1/2 and 2/2 (E2E_PREBUILT=1, --workers=2, DB tp_mrg_uxf_e2e, port 4788, --output scratchpad/merge-e2e-results/k), drop DB, rm /tmp/tp-e2e-tp_mrg_uxf_e2e-*, 13 affected.ts --event pull_request --base 0dd1ba7.
- Pre-existing (not mine, leave): DB tp_e2e_uxforms and /tmp/tp-e2e-tp_e2e_uxforms-* .
- Checked: no remaining getByLabel('Practice switcher'/'Account menu') in the PR's specs after the merge's shell.tsx change (CI-19 names from content).
- 01 pnpm typecheck: PASS (22 projects passed, 0 failed), 00:38:08-00:39:26.
- 02 pnpm lint: PASS 1,633 files in 3 groups (packages 501, apps/web 601, . 531), 0 errors, 0 warnings, 157 s.
- 03 pnpm lint:copy: PASS 517 files.
- 04 pnpm lint:logs: PASS 1,062 files.
- 05 pnpm check:fixtures: PASS 333 guard files, 3,817 text files searched.
- 06 pnpm synth --all + git status: PASS 249 cases (244 + the merge's CI-18..20, MOD-13, MOD-14), 0 written, 641 unchanged, 0 removed; EMR 8 formats 16 unchanged; git status --porcelain empty (tree clean).
- 07 pnpm test: running (started 00:42:20).
- 07 pnpm test (ENGINE_FREEZE_BASE=0dd1ba7): FAIL 389 files (2 failed, 387 passed); 6,525 tests: 6,521 passed, 3 failed, 1 skipped; 397 s. Failures:
  F1 packages/synth/src/fixtures.test.ts "holds every row of docs/product/test-matrix.md, word for word": TEST_MATRIX (packages/synth/src/cases/matrix.ts) FRM-01 and FRM-08 lack the wording 001cdbf added to docs/product/test-matrix.md (", in the neutral notice's look, never the failure colour"; "a SHA-256 in it set in Plex Mono as the page sets it,"). Cause: THIS PR, commit 001cdbf (the polish) edited test-matrix.md only; matrix.ts has neither phrase at 001cdbf (git show 001cdbf:... grep 0). Not the merge. Fix: the two matrix.ts rows to match, then pnpm synth --all (FRM-01/FRM-08 expected.json embed the assertion).
  F2+F3 tools/test/workflows.test.ts (2 tests: "installs Playwright's own Chromium..." and "a simulated Dependabot rewrite ...", the second fails through the first's assertion): "the apt key's glob over node_modules/.pnpm must find exactly the playwright-core the lockfile installs": found playwright-core@1.56.1 AND @1.64.1. Cause: LOCAL ENVIRONMENT, an orphan 1.56.1 left in this worktree's node_modules/.pnpm by the pre-merge install (lockfile now names only 1.64.1). The test's own remedy: pnpm install --frozen-lockfile --config.modules-cache-max-age=0 (docs/runbooks/ci.md "Upgrading the browser"). Not code; CI installs fresh.
  No db test reads matrix.ts or FRM fixtures (only comments mention FRM-04/07), so editing them while phase B runs leaves its result valid.
- FIX ROUND: matrix.ts FRM-01 and FRM-08 assertions edited to test-matrix.md's words (uncommitted). Fix driver started (bin/merge-fix.sh; status merge-logs/fix.status; skips done steps): f1 pnpm install --frozen-lockfile --config.modules-cache-max-age=0 (prune orphans), f2 synth --all + git status, f3 check:fixtures, f4 vitest the two failed files. Interleaves between db shards (one lock).
- 09 test:db shard 1/4: exit 0 (00:49:06-00:52:52); shard 2/4: exit 0 (-00:56:31). Counts below once all four end.
- f1 pnpm install --frozen-lockfile --config.modules-cache-max-age=0: PASS, "Already up to date", orphans removed (no 1.56.1 / axe-core 4.13 left in node_modules/.pnpm).
- f2 pnpm synth --all: 249 cases, 2 written (FRM-01, FRM-08 expected.json: the assertion line only), 639 unchanged, 0 removed; tree: those 2 + matrix.ts modified (the fix).
- f3 pnpm check:fixtures: PASS 333 guard files, 3,817 text files.
- f4 vitest --project unit fixtures.test.ts + workflows.test.ts: PASS 2 files, 137 tests, 0 failed.
- 09 test:db shard 3/4 and 4/4: exit 0. test:db total: shard1 32 files 3,151 passed + 1 skipped; shard2 32 files 2,615; shard3 32 files 2,534; shard4 31 files 922 -> 127 files (unique 127 = every tracked *.db.test.ts), 9,222 passed, 1 skipped, 0 failed (same as a57fbf5). tp_mrg_uxf_db dropped 01:04:32. (Ran on ae26bf7 + the uncommitted matrix.ts/FRM fixture fix, which no db test reads.)
- FIX COMMIT 34f7427 "Forms: after the merge of 0dd1ba7" (matrix.ts FRM-01/FRM-08 + FRM-01/FRM-08 expected.json; 3 files, 4+/4-), local only. Tree clean.
- PHASE A2 driver started on 34f7427 (bin/merge-phase-a2.sh; status merge-logs/phase-a2.status): typecheck, lint, synth --all + status, whole pnpm test; creates merge-logs/phase-c.go only if all pass (phase C driver is waiting on it). If interrupted: rerun the driver (skips passed steps).
- a2-01 pnpm typecheck (34f7427): PASS 22 projects.
- a2-02 pnpm lint (34f7427): PASS 1,633 files in 3 groups, 0 errors, 0 warnings, 148 s.
- a2-03 pnpm synth --all + git status (34f7427): PASS 249 cases, 0 written, 641 unchanged, 0 removed; EMR 16 unchanged; tree clean.
- a2-04 pnpm test (34f7427, ENGINE_FREEZE_BASE=0dd1ba7): PASS 389 files, 6,524 passed, 1 skipped (6,525), 0 failed, 392 s. Browser tests ran: @playwright/test 1.64.1 resolves /opt/pw-browsers/chromium-1248/chrome-linux64/chrome (exists); one skip only (a missing Chromium would skip every browser test). (+157 tests vs a57fbf5's 6,368: the merge's #77/#80 tests.)
- phase-c.go created 01:15:25 by A2: PHASE C (build, stamp, e2e 1/2 + 2/2, affected) running on 34f7427.
- 10 pnpm build (34f7427): PASS worker + web (Next.js 16.4.3 Turbopack, compiled 53 s), 120 s; tree clean after (0 changes).
- 11 build-stamp --write: stamped 34f74273… (.next/BUILD_COMMIT).
- 12 e2e shard 1/2: running (from 01:17:34).
- 12 e2e shard 1/2 (E2E_PREBUILT=1, --workers=2, Playwright 1.64.1 / Chromium 1248): PASS 30 passed, 0 failed, 0 flaky (6.2 min); web server "build-stamp: the build is 34f74273...'s". All 4 brand.spec.ts tests in this shard, incl. the workspace test with the header-1280/390, header-lockup and report-cover screenshot comparisons against the merge's regenerated baselines: passed; no baseline touched.
- 12 e2e shard 2/2: PASS 30 passed, 0 failed, 0 flaky (5.8 min); stamp 34f74273...'s.
- e2e total: 60 passed, 0 failed, 0 flaky, 0 skipped over all 27 spec files (playwright --list: 60 tests in 27 files, same as a57fbf5). No screenshot baseline updated.
- 13 tools/stryker/affected.ts --event pull_request --base 0dd1ba7 (on 34f7427): money/pricing/ledger/packets not affected; any=false packages=[] shards=[] -> no mutation shard; mutation.yml passes "No money path changed" (no gate.ts run).
- CLEANUP: tp_mrg_uxf_db dropped 01:04:32, tp_mrg_uxf_e2e dropped 01:29:43, /tmp/tp-e2e-tp_mrg_uxf_e2e-* removed, scratchpad merge-e2e-results removed, nothing on 4788, no tp_test_*/tp_mrg_* left; no /tmp/tp-workflows-* left; no driver running. Pre-existing tp_e2e_uxforms + its /tmp dirs left (not mine). Model identifiers in + lines of ae26bf7..34f7427: 0.
- FINAL: local head 34f74273… ("Forms: after the merge of 0dd1ba7", parent ae26bf7), tree clean, not pushed.
## STATUS: COMPLETE
