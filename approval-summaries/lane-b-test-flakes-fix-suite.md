# PR #76 (test flakes): full local suite

Worktree /home/user/test-flakes, branch co-001/test-flakes. Head b02435c5 (local, not yet pushed). The merge base with origin/claude/build-platform is e908c214. The diff (e908c214..HEAD) changes six test files only. Nothing was committed, pushed, checked out or edited. The head and a clean tree were confirmed before and after the run.

## Full local suite on b02435c5

Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, with Node 24.22.0 and PG18 on 5433.

| Command | Result |
| --- | --- |
| pnpm install --frozen-lockfile | Pass. Already up to date. |
| pnpm check:fixtures | Pass. 333 files read, 3,776 searched. |
| pnpm typecheck | Pass. 22 projects (23 s, cache warm). |
| pnpm lint | Pass. 1,612 files in 3 groups, 0 errors, 0 warnings (116 s). |
| pnpm lint:copy | Pass. 514 files. |
| pnpm lint:logs | Pass. 1,054 files. |
| pnpm verify-content | Pass. |
| tsx tools/engine-freeze/check.ts e908c214 (merge base) | Pass. No non-test pricing change, no problems. |
| pnpm synth --all, then git diff --exit-code | Pass. 236 cases: 0 written, 628 unchanged. EMR: 8 formats, 16 unchanged. The tree is clean. |
| pnpm test | Pass. 377 files: 6,262 passed, 4 skipped (232 s). That is 6,266 tests, the same total as the base's last measure (6,265 + 1). Three of the skips are tools/engine-freeze/differential.test.ts, which skips when ENGINE_FREEZE_BASE is unset (CI sets it). |
| pnpm test:golden | Pass. 5 files, 376 tests. |
| pnpm test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3) | Pass. pyx12 4.0.0 agrees on all 687 (676 valid, 11 malformed), and edi835 agrees. |
| pnpm db:migrate (5433, fresh database tp_tfl_db, dropped afterwards) | Applied 44 migrations. None were applied beforehand. |
| pnpm test:db --shard=1/6 | Pass. 22 files, 2,432 passed (167 s). |
| pnpm test:db --shard=2/6 | Pass. 21 files, 824 passed, 1 skipped (83 s). |
| pnpm test:db --shard=3/6 | Pass. 21 files, 2,510 passed (147 s). |
| pnpm test:db --shard=4/6 | Pass. 21 files, 1,836 passed (133 s). |
| pnpm test:db --shard=5/6 | Pass. 21 files, 1,398 passed (198 s). |
| pnpm test:db --shard=6/6 | Pass. 21 files, 222 passed (86 s). |
| test:db total | 127 files, the same as `vitest list --project db`: 9,222 passed, 1 skipped, 0 failed (base 9,222 + 1). |
| pnpm build | Pass (80 s). The tree was clean afterwards. |
| build-stamp.ts --write b02435c5fc17… | Stamped b02435c5. The web server read "the build is b02435c5…'s". |
| E2E_ADMIN_URL=…5433/postgres E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr76 E2E_PORT=3176 pnpm test:e2e --shard=1/2 --workers=2 | Pass. 27 passed (5.0 min). |
| same, --shard=2/2 | Pass. 27 passed (5.0 min). screening.spec passed, so no flake re-run was needed. |
| e2e total | 54 passed, 0 failed (base 54). tp_e2e_pr76 was dropped afterwards. |
| tsx tools/stryker/affected.ts --event pull_request --base e908c214 | packets is affected through packages/packets/src/verifier.test.ts. Money, pricing and ledger are not. Shards: packets-scan, packets-rest, packets-explain. |
| stryker (packets-scan): the canary, verdict.ts, shards.ts, then the shard's gate.ts | Pass. Canary 5 of 5 (349 s). |
| stryker (packets-rest), the same steps | Pass. Canary 5 of 5 (667 s). |
| stryker (packets-explain), the same steps | Pass. Canary 5 of 5 (747 s). |
| tsx tools/stryker/gate.ts reports/mutation --expected '["packets-scan","packets-rest","packets-explain"]' | Pass: "mutation gate: passed". packets scored 97.75% (4,310 detected of 4,409). All 99 undetected mutants are recorded equivalents; 2 load failures are left out. |
| Model identifiers in git diff e908c214 HEAD | None. |

## Failures

None. No command failed and no flake re-run was needed.

e2e used PG18 on 5433 through E2E_ADMIN_URL, as CI does, because PG16 on 5432 (the e2e default) is down.
