# PR #85 check after merge104 (the #104 SS-01 merge, 1f7b82b2)

Worktree: /home/user/ux-payer-response. Branch: co-001/ux-payer-response. The origin head is still 03db7092, and nothing was pushed.

The final HEAD is **1f7b82b2d376a7d3e9900fed3fb8168c03d90f01**, the merge commit from merge104. No commit was added, and the tree is clean.

## Reviews
- Recorded as given: `{"confirmed":[],"dropped":[]}`.
- No finding was confirmed, so there was nothing to fix, no fail-first test and no commit.

## Golden, oracle and mutation: untouched by this merge (from git diff)
- **`git diff --name-only 03db7092..HEAD`** (95 files) touches none of these:
  - fixtures/golden
  - any .835 file. The only fixtures changed are fixtures/synthetic/BIL-05, BIL-07, BIL-08, BIL-09 and BIL-10 expected.json.
  - packages/pricing, ledger, packets, edi835, rules or contracts
  - tools/stryker, tools/test-oracle, tools/golden-worksheet or tools/test-golden.ts
- **Against the PR's merge base, e084da22:** `git diff e084da22 HEAD` touches nothing in packages/db, pricing, ledger, packets, edi835, contracts or rules.
- **`tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform`** (base c4941291, merge base e084da22): money, pricing, ledger and packets are not affected. Shards: none (no money path changed).
  - For comparison, `--base 03db7092` names pricing and packets. That comes only from #104's packages/db schema, which is base content.
- So golden, oracle and mutation were not run.

## Suite on 1f7b82b2
Each heavy step ran under flock /tmp/laneb-heavy.lock, one at a time. Logs are in scratch/logs104/.

| step | result |
|---|---|
| pnpm typecheck | passed: 22 projects (apps/web 4,268 files); exit 0 |
| pnpm lint | passed: 1,779 files in 3 groups; 0 errors, 0 warnings |
| pnpm lint:logs | 1129 files scanned; every log call uses allowlisted fields |
| pnpm lint:copy | 566 files read; the product copy keeps the brand's words |
| pnpm check:fixtures | 342 files read by the guard, 4091 text files searched for an X12 header; every interchange is synthetic |
| pnpm test (unit), run 1 | **exit 1**: 445 files, 2 failed and 443 passed; tests 2 failed, 7608 passed, 4 skipped (7614); 574 s. Both failures are timeouts (see below) |
| pnpm test (unit), run 2 | **exit 0**: 445 files passed; 7610 passed, 4 skipped (7614); 545 s |
| pnpm test:db 1/4 | 36 files; 3290 passed, 1 skipped (3291); 931 s |
| pnpm test:db 2/4 | 36 files; 2772 passed; 359 s |
| pnpm test:db 3/4 | 36 files; 2746 passed; 639 s |
| pnpm test:db 4/4 | 35 files; 970 passed; 246 s |
| test:db, all shards | 143 files, 143 distinct in the union of the shards' JSON lists, equal to `vitest list --project db` (143). 9778 passed, 1 skipped (restore-drill, which skips without its environment). Each shard ran on a fresh database at 5433 (tp_check104_db1..4) after `pnpm db:migrate`, and each database was dropped |
| pnpm synth --all | exit 0. 300 cases: 0 written, 701 unchanged, 0 removed. 8 EMR formats: 0 written, 16 unchanged. Tree unchanged |
| watched.ts --write | exit 0; 553 lines; tree unchanged |
| pnpm build | exit 0. BUILD_COMMIT stamped with `git rev-parse HEAD`, as ci.yml does. The web server reported "build-stamp: the build is 1f7b82b2d376a7d3e9900fed3fb8168c03d90f01's" |
| E2E_PREBUILT=1 pnpm test:e2e --workers=2 | **77 passed** (15.1 min). E2E_DATABASE=tp_e2e_check104, E2E_PORT=3492, admin at 5433. The database was dropped, the /tmp/tp-e2e-tp_e2e_check104-* directories were removed, and the tree is clean |
| gitleaks 8.24.3 git --log-opts="03db7092..HEAD" | The pinned binary at /root/.cache/paidwhole/gitleaks/8.24.3. The clone is not shallow. 29 commits scanned (~446 KB); no leaks found; exit 0 |
| pre-push hook standalone (remote sha 03db7092) | "1 commit checked: 0 file(s) read by the fixture guard, 17 text file(s) searched for an X12 header, and gitleaks found no secret."; exit 0. The hook checks only commits that are on no remote. #104's commits are already on origin, so only the merge commit is checked |

## The unit failure in run 1: root cause
Both failures were timeouts in tests that do a lot of CPU work under a fixed limit. Neither was an assertion failure.

| test | limit | run 1 | alone, under the lock, no coverage | full run 2 |
|---|---|---|---|---|
| tools/stryker/affected.test.ts:601, "gives each package a deleted or renamed test of its own…" | 120000 ms | 120862 ms | 70460 ms | 110456 ms |
| apps/web/src/app/tables.test.ts:750, "names each table of a list apart…" | 5000 ms | 5656 ms | 2280 ms | 3688 ms |

- **Why they run slow.**
  - The affected test rebuilds the repository's import closures six times.
  - The tables test reads every web .tsx file.
  - In the full parallel run with coverage on this 4-core machine, they reach 92% and 74% of their limits. Run 1 went over by 0.7% and 13%.
  - The load was about 4.6 on 4 cores even with the lock held. After the run, another lane's vitest (/home/user/redact-label-boundary) was seen using CPU.
- **Not this branch's code.**
  - Neither test file changed in 03db7092..HEAD.
  - What they scan grew only by #104's base content.
  - The base commit e084da22 passed its CI unit job.
  - Nothing in the product failed. The two files pass alone (42 tests), and the full run 2 passes.
- **For the orchestrator, not changed here.** The 120 s limit on the affected test leaves little room on a 4-core runner. That limit is base tooling, outside this PR.
- **The known flake.** apps/worker/src/intake/scan.test.ts passed in both unit runs, so it was not rerun.

## End state
- HEAD is 1f7b82b2 and the tree is clean. Nothing was rebased, amended, forced or pushed.
- No migration and no model identifier were added. The engine and ledger are untouched.
- 5433 holds only postgres, template0 and template1.
- origin/claude/build-platform has moved to c4941291 (#109: waitForVerdict's tests on a mocked clock). It was not merged, because merging is not this step.

## Files
- Progress: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pay/progress/check104.md
- Logs: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pay/scratch/logs104/
  - The two unit runs are test.log, and test2.log with test2.json.
  - The rerun of the two files alone is rerun-timeouts.log.
- Scripts:
  - /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pay/scratch/c104-suite.sh
  - /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pay/scratch/c104-db.sh
