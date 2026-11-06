# hom-fix-suite progress
Started fresh 2026-11-02 (no earlier file). Worktree at 87691be4 + uncommitted fix round (money, screens, docs, round-4 apply).
## Re-read (done)
- All 23 real findings checked against the diff; each holds (details in final record). Round-4 apply (N1, N2, F2, F4) present.
- One gap fixed: ux-r2-02 verdict item 4 (a test of Cases' "none (all N written off)"): extracted casesLinesCell() in components/triage/display.tsx, used in cases/page.tsx, unit test in display.test.tsx. eslint 0, vitest 2 files 14 pass.
- #42 overlap: only test-matrix.md, synth matrix.ts, registry.ts, watched-paths.txt, additions only. Nothing under packages/pricing|ledger|db; no migration.
## Suite (logs scratchpad/suite-hom/*.log, runner suite-hom/run.sh)
- install 0; check:fixtures 0 (333/3908); typecheck 0 (22); lint 0 (1,689 files); lint:copy 0 (540); lint:logs 0 (1090); verify-content 0; engine-freeze 43565235 0 (none let through); watched.ts --write: no change (542 lines); synth --all: 0 written, 661+16 unchanged (diff exit 1 only from the uncommitted fix round; re-check after commit)
- pnpm test: 410 files, 6,950 passed, 4 skipped, exit 0 (318 s)
- test:golden 5 files 376 passed; test:oracle 687 agree (676 valid, 11 malformed)
- db:migrate fresh tp_hom_migrate: 44 applied, 0 before (dropped); test:db 1/4: 33 files, 3,185 passed, 1 skipped (615 s)
- db 2/4: 33 files 2,622 passed (192 s); db 3/4: 33 files 2,557 passed (458 s)
- db 4/4: 32 files 926 passed (171 s). Total 131 files (= vitest list), 9,290 passed, 1 skipped
- COMMIT 8fd8a893 (fix round; tree clean). Next: synth diff on clean tree, build, stamp, e2e
- synth --all + watched --write on clean tree: 0 written, git diff clean. build 0 (39 s); stamped 8fd8a893
- e2e 1/2 FAILED: brand.spec:446 strict-mode, [data-figure=actionable] .font-mono now 2 elements (ux-r2-06 put the note's counts in mono). Real regression from the fix round, not a flake. Fixed brand.spec.ts: assert every mono span of the tile (>=2). Waiting for shard 2, then amend, rebuild, stamp, rerun shard 1.
- e2e 2/2 (at 8fd8a893): 32 passed (6.3 min)
- amended to 30c055c9 (brand.spec fix); build 0, stamped 30c055c9; rerunning e2e both shards
- stryker affected --base 43565235: no shards; gate (empty, --expected []): passed 'No money path changed'
- e2e 1/2 rerun at 30c055c9: 32 passed (5.8 min)
- e2e 2/2 rerun at 30c055c9: 32 passed (6.8 min). e2e total 64 passed
- pr93-body.md updated (reviewer table 27 rows, words, suite table, R2 overlap, follow-ups); not published
- Record written: /home/user/ops/approval-summaries/lane-b-ux-home-figures-fix-suite.md. DONE.
