# sgn-suite progress (PR #92, worktree /home/user/ux-sign-in-time, HEAD e4e05a0d + uncommitted fix rounds)
Logs: scratchpad/suite-sgn/*.log. Each command under flock /tmp/laneb-heavy.lock, Node 24, PG18 on 5433.
Note: tree has uncommitted fix-round edits (22 files M); no commit allowed in this stage.
## Batch 1 (done, all pass)
- pnpm install --frozen-lockfile: pass 2s
- pnpm check:fixtures: pass, 333 read, 3,901 searched
- pnpm typecheck: pass, 22 projects, 52s
- pnpm lint: pass, 1,686 files in 3 groups, 0 err 0 warn, 110s
- pnpm lint:copy: pass, 541 files; lint:logs: pass, 1,090 files; verify-content: pass
- engine-freeze check bce57f16: pass, no pricing change, no problems
- watched.ts --write: 540 lines; git diff --exit-code on watched-paths.txt: clean (no change)
- pnpm synth --all: 265 cases 0 written 657 unchanged; EMR 8 formats 16 unchanged; git diff md5 identical to pre-suite snapshot
## Next: test, golden, oracle
## Batch 2 (done, all pass)
- pnpm test: pass, 409 files, 6,932 passed, 4 skipped (6,936), 276s
- pnpm test:golden: pass, 5 files, 376 tests, 22s
- pnpm test:oracle: pass, pyx12 4.0.0 agrees on 687 (676 valid, 11 malformed); edi835 agrees, 55s
## Next: db:migrate fresh, then test:db 4 shards each on fresh DB tp_sgn_db{k} (dropped after)
## Batch 3 (done, all pass)
- pnpm db:migrate (fresh tp_sgn_migrate, dropped): applied 44, 0 before
- test:db --shard=1/4 (fresh tp_sgn_db1): 33 files, 3,165 passed 1 skipped, 483s
- --shard=2/4 (tp_sgn_db2): 32 files, 2,613 passed, 175s
- --shard=3/4 (tp_sgn_db3): 32 files, 2,564 passed, 359s
- --shard=4/4 (tp_sgn_db4): 32 files, 956 passed, 141s
- total 129 files (= vitest list --project db: 129), 9,298 passed, 1 skipped, 0 failed; all tp_sgn_* dropped
## Next: pnpm build, stamp, e2e 2 shards (tp_e2e_pr92, port 3192)
- pnpm build: pass, 17s (warm .next cache)
- build-stamp.ts --write HEAD: REFUSED by design (tree has 22 uncommitted files; stage may not commit). Not a code failure.
  Deviation: e2e run with E2E_PREBUILT unset (runbook ci.md: "with edits in the tree, leave E2E_PREBUILT unset and the web server builds first").
## RESUMED 2026-11-02 ~01:10 UTC (earlier run stopped by 5-hour limit during e2e; machine restarted)
- fix round now committed locally as b8654622 (not pushed); git status clean (0 files). PG18 on 5433 accepting.
- Batches 1-3 results kept. Now: build, stamp, e2e E2E_PREBUILT=1 2 shards, stryker affected, gate.
