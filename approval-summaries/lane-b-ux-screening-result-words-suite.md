# UX PR 4b (PR #131): full local suite

Worktree /home/user/ux-screening-result-words, branch co-001/ux-screening-result-words. Base 31a7345fe07f0f8e5eb03084ad644db79f5c219a.

## Head

**9e577017748fc4f91967cacaaa5c3639a190d2bf** (`git rev-parse HEAD` at the start and at the end).

- The task text names c2725961 as the head. The tree under test is 3 commits past it, the fix round's: 03ec41f5 (on origin), e01d96bc (4B-UX-03) and 9e577017 (4B-UX-02).
- e01d96bc and 9e577017 are local only. Origin's branch is still at 03ec41f5, so CI has not seen the head this suite ran on. The orchestrator owns the push; this step did not push.
- No fix commit: nothing failed. The tree was clean before and after. Nothing was rebased, reset, amended, stashed or forced.

## Scope (git diff 31a7345f..HEAD, 15 files)

- Nothing under packages/db, pricing, ledger or money. No migration.
- model-gateway, packets and pnpm-lock.yaml are untouched.
- Shared files carry TBL-08 only: test-matrix.md (TBL-08 row), matrix.ts (TBL-08 assertion), registry.ts (2 lines in TBL-08's assertedBy).
- No model identifier in the diff. Each commit message ends with the two mandated attribution lines and nothing else.

## Results

Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, in the order of the finish-suite summary. Toolchain: Node v24.22.0, pnpm 10.34.8, Playwright 1.63.0, PostgreSQL 18.4 on 5433.
- Logs: scratchpad/suite4b/<step>.log
- Runners: scratchpad/suite4b/run.sh and phase1.sh to phase4.sh
- Step lines (step, exit code, seconds, command): scratchpad/suite4b/results.tsv

| Command | Result | Counts | Time |
| --- | --- | --- | --- |
| pnpm install --frozen-lockfile | Pass | Lockfile up to date, already up to date | 1 s |
| pnpm check:fixtures | Pass | 342 files read by the guard, 4,231 searched for an X12 header | 1 s |
| pnpm typecheck | Pass | 23 projects (23 of 23 warm) | 18 s |
| pnpm lint | Pass | 1,868 files in 3 groups (packages 568, apps/web 708, root 592), 0 errors, 0 warnings | 83 s |
| pnpm lint:copy | Pass | 595 files | 2 s |
| pnpm lint:logs | Pass | 1,177 files | 2 s |
| pnpm verify-content | Pass | Every content set passes (drafts: 10 records) | 1 s |
| pnpm -s exec tsx tools/engine-freeze/check.ts 31a7345f | Pass | No non-test file under packages/pricing/src changes. Nothing let through, no problems | 1 s |
| pnpm synth --all | Pass | 319 cases: 0 written, 720 unchanged, 0 removed. EMR: 8 formats, 16 unchanged | 2 s |
| git diff --exit-code && test -z "$(git status --porcelain)" | Pass | Tree clean | 0 s |
| pnpm test | Pass | 479 of 479 files passed. 9,954 tests: 9,950 passed, 4 skipped, 0 failed. No model-gateway redaction flake (MOD-13 or MOD-16) this run | 342 s |
| pnpm test:golden | Pass | 5 files, 381 tests | 46 s |
| TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3 pnpm test:oracle | Pass | pyx12 4.0.0 agrees on all 689 fixtures (678 valid, 11 malformed), and edi835 agrees | 43 s |
| pnpm db:migrate (fresh tp_4b_migrate, dropped afterwards) | Pass | Applied 47 of 47 (schema_migrations: 47) | 2 s |
| pnpm exec vitest list --project db --filesOnly | Pass | 149 files | 1 s |
| pnpm test:db --shard=1/4 | Pass | 38 files, 3,290 passed, 1 skipped | 375 s |
| pnpm test:db --shard=2/4 | Pass | 37 files, 2,256 passed | 141 s |
| pnpm test:db --shard=3/4 | Pass | 37 files, 3,311 passed | 224 s |
| pnpm test:db --shard=4/4 | Pass | 37 files, 1,006 passed | 263 s |
| test:db total | Pass | 149 files, equal to `vitest list --project db` (149). 9,863 passed, 1 skipped, 0 failed | 1,003 s |
| pnpm build | Pass | Web (next build, warm .next cache, compiled in 3.1 s) and worker (esbuild) | 15 s |
| build-stamp.ts --write 9e577017… then --expect | Pass | Stamped 9e577017. Both e2e web servers read "the build is 9e577017…'s" | 0 s |
| E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_4b E2E_PORT=3185 pnpm test:e2e --shard=1/2 --workers=2 | Pass | 41 passed, including layout-1280.spec.ts:131 | 319 s |
| same, --shard=2/2 | Pass | 40 passed, including screening-phone.spec.ts:123, screening.spec.ts:170 (SCR-01 to 07, SCR-18), screening.spec.ts:742 (SCR-15), tables-phone.spec.ts:171 and :293 | 395 s |
| e2e total | Pass | 81 passed, 0 failed. The known screening.spec.ts flake did not occur, so there was no re-run | 714 s |
| pnpm -s exec tsx tools/stryker/affected.ts --event pull_request --base 31a7345f | Pass | money, pricing, ledger and packets: not affected. any=false, shards=[] | 14 s |
| pnpm -s exec tsx tools/stryker/gate.ts (empty reports dir, --expected '[]') | Pass | "No money path changed: no mutation run, nothing to judge." Mutation gate passed | 1 s |

## Cleanup

- Dropped: tp_4b_migrate (by the migrate step) and tp_e2e_4b (WITH (FORCE)).
- Removed: its 6 /tmp/tp-e2e-tp_e2e_4b-* directories.
- Left on 5433: postgres, template0, template1.
- Port 3185 is free.
