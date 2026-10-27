# PR #79 fix round: full local suite

Worktree /home/user/ux-table-scroll, branch co-001/ux-table-scroll. Nothing pushed, no rebase, no reset, no stash, no force, no migration.

## Head

Final head: 88a66bd3… (local only, 8 commits ahead of origin's 35b14cd5).

On top of origin's PR head 35b14cd5:
- e0557d91 Merge claude/build-platform (085299bd, PR #76) into co-001/ux-table-scroll.
- 18165dfb F1, N1, N2, F3, N3, UX-PR79-03, UX-PR79-04.
- ccc4e1f6 UX-PR79-01, -02, -06, -07.
- d8169b87 F2, UX-PR79-05, and UX-PR79-01's guard rule.
- 88a66bd3 F4, F1, N4 (e2e).

Merge base with origin/claude/build-platform: 085299bd… (PR #76).

The suite caused no failure, so there is no fix commit. The tree was clean before and after the suite.

## Scope checks (on git diff 085299bd HEAD, 101 files)

- Of pr42-files.txt, the diff touches only docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts and registry.ts. All three are rows added only (+14, +24 and +19 lines, 0 removed).
- Nothing changes under packages/db, packages/pricing, packages/ledger or packages/money. No migration.
- Model identifiers in the diff: none. In the 16 commit messages: only the two attribution lines.

## Full local suite on 88a66bd3

Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, with Node v24.22.0, pnpm 10.34.8 and PG18 on 5433.
- Logs: scratchpad/suite79/*.log.
- Runners: scratchpad/suite79/phase1-4.sh.
- Step lines: scratchpad/suite79/results.tsv.

| Command | Result | Counts | Time |
| --- | --- | --- | --- |
| pnpm install --frozen-lockfile | Pass | Already up to date, 22 projects | 3 s |
| pnpm check:fixtures | Pass | 333 files read, 3,787 searched | 2 s |
| pnpm typecheck | Pass | 22 projects | 27 s |
| pnpm lint | Pass | 1,618 files in 3 groups (packages 499, apps/web 596, root 523), 0 errors, 0 warnings | 124 s |
| pnpm lint:copy | Pass | 516 files | 3 s |
| pnpm lint:logs | Pass | 1,056 files | 4 s |
| pnpm verify-content | Pass | Every content set passes | 1 s |
| pnpm -s exec tsx tools/engine-freeze/check.ts 085299bd (merge base) | Pass | No non-test pricing change, nothing let through, no problems | 3 s |
| pnpm synth --all | Pass | 240 cases: 0 written, 632 unchanged, 0 removed. EMR: 8 formats, 16 unchanged | 4 s |
| git diff --exit-code && test -z "$(git status --porcelain)" | Pass | Tree clean | 0 s |
| pnpm test | Pass | 380 files: 6,303 passed, 4 skipped (6,307) | 287 s |
| pnpm test:golden | Pass | 5 files, 376 tests | 26 s |
| pnpm test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3) | Pass | pyx12 4.0.0 agrees on all 687 (676 valid, 11 malformed), and edi835 agrees | 73 s |
| pnpm db:migrate (fresh tp_pr79_migrate on 5433, dropped afterwards) | Pass | Applied 44, none before (schema_migrations: 44) | 3 s |
| DATABASE_URL=…5433/postgres pnpm test:db --shard=1/6 | Pass | 22 files, 2,432 passed | 188 s |
| same, --shard=2/6 | Pass | 21 files, 824 passed, 1 skipped | 83 s |
| same, --shard=3/6 | Pass | 21 files, 2,510 passed | 157 s |
| same, --shard=4/6 | Pass | 21 files, 1,836 passed | 138 s |
| same, --shard=5/6 | Pass | 21 files, 1,398 passed | 203 s |
| same, --shard=6/6 | Pass | 21 files, 222 passed | 85 s |
| test:db total | Pass | 127 files, the same as `vitest list --project db` (127): 9,222 passed, 1 skipped, 0 failed | 854 s |
| pnpm build | Pass | Web compiled from the warm .next cache, worker esbuild | 19 s |
| build-stamp.ts --write 88a66bd3c7b7… | Pass | Stamped 88a66bd3. Both web servers read "the build is 88a66bd3…'s" | 1 s |
| E2E_ADMIN_URL=…5433/postgres E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr79 E2E_PORT=3179 pnpm test:e2e --shard=1/2 --workers=2 | Pass | 28 passed. layout-1280.spec.ts:155 is included and passed | 316 s (5.2 min) |
| same, --shard=2/2 | Pass | 28 passed. tables-phone.spec.ts:242 (TBL-02, TBL-03) and :404 passed. screening.spec.ts:135 (SCR-01..07) passed, so no flake re-run was needed | 337 s (5.6 min) |
| e2e total | Pass | 56 passed, 0 failed. tp_e2e_pr79 dropped; fix-2's tp_e2e_fix2 left as found | 653 s |
| pnpm -s exec tsx tools/stryker/affected.ts --event pull_request --base 085299bd | Pass | No shards: money, pricing, ledger and packets are all not affected | 18 s |
| pnpm -s exec tsx tools/stryker/gate.ts (empty reports dir, --expected '[]') | Pass | "No money path changed: no mutation run, nothing to judge." Mutation gate passed | 1 s |

About the build: it took 19 s because Next compiled from the .next cache that the fix rounds left. The stamp is written only on a clean tree, and the stamp check passed in both e2e shards.

## Proposals

- None from this run. The suite found nothing to fix.
- Push the five local commits (e0557d91..88a66bd3) so the CI run covers the head this suite ran on. The orchestrator owns the push; this step does not push.
