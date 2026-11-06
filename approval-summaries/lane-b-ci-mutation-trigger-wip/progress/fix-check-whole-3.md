# Whole-diff adversary, round 3 (fix-check-whole-3)

Head checked: f23850fa… (origin/co-001/wip-ci-mutation-trigger). Diff 50029e64..f23850fa….
Clone: /home/user/fx-p4-whole-3 (read only; removed at the end).

## Checked
- [x] fresh clone, head confirmed f23850fa…
- [x] read source/workflow diff 50029e64..f23850fa… (affected.ts, manifests.ts, runtime.ts, stryker.ts, mutation.yml) and docs/config diff (ADR 0066, ci.md, reconciliation-001, test-matrix, matrix.ts, CI-27/CI-29 fixtures, stryker/*.config.mjs, README)
- Gate job's checkout is default ref, so HEAD = GITHUB_SHA on pull_request (merge commit); runtime check placed after install, before download-artifact. OK.
- In progress: install (head), base worktree at 50029e64… for replay; replay set #104 (new since round 2) #46 #48 #76 #45 #94 #43 #91 #77 #86 #108 #75 #42 #90.
- [x] head install exit 0 (whole3/install.log). Base worktree /home/user/fx-p4-whole-3-base at 50029e64….
- [x] merge-tree head x origin/co-001/wip-ci-images-digest 932ea45f… (#86, merged as 24531dc2…): conflicts only ADR 0066 Date line + reconciliation-001, as rounds 1-2. Also vs origin/claude/build-platform e084da22… (#104 now in): the same two files only. Local-only trial merge 5fef9b76… in /home/user/fx-p4-whole-3-merged, both sides kept, Date line "...; Part 5 2026-10-28; N32 2026-10-28; Part 7 2026-11-02". (Local commit in a fresh clone with no hooks installed; never pushed.)
- Verified: @stryker-mutator/core dist/src/sandbox/ts-config-preprocessor.js has two import('typescript') calls; its package.json does not name typescript (N51 holds).
- Queued under the lock (whole3/checks.sh): base + merged install, head vitest tools/stryker tools/test, head typecheck, merged workflows.test via CI_TREE, merged tools/stryker.
- [x] base + merged installs exit 0. Head vitest --project unit tools/stryker tools/test: exit 0 (whole3/vitest-head.log).
- Probes at head (affected() over the real closures, one path each): docs/runbooks/ci.md none; tools/test/workflows.test.ts none; docs/x.gitattributes none; .gitattributes and apps/web/.gitattributes all four ("a global input"); docs/a<TAB>b.md and a U+2028 path all four, printed quoted; a U+00A0 path none (not a control character). No unexpected widening.
- Commit trailers: all 28 commits carry the repo's standard Co-Authored-By trailer, as 187 of the last 200 base commits do; no model name in any file of the diff.
- Replay (14 PRs, #104 new since round 2) running: whole3/replay-{base,head}.txt.
- No direct git process call is left in the changes job's code besides runGit (grep of tools/stryker non-test files).
- nit found: runtime.ts prints the --pnpm value and the user agent's pnpm through `shown`, which does not quote; a multi-line `pnpm --version` would print raw, split across lines (it still fails closed, and the workflow is the PR's own). Not N52's scope (paths), so nit.
- [x] head pnpm typecheck exit 0 (22 projects). Head vitest 35 files 499/499.
- [x] merged tree 5fef9b76… (local only): workflows.test.ts via CI_TREE 133 passed, 2 skipped (the CI_TREE skips), exit 0; its tools/stryker 14 files 208/208.
- Replay base side partial: #104 at 50029e64… = pricing+packets, 6 shards; head side pending.
- [x] Replay of 14 merged PRs (whole3/replay-{base,head}.txt; no ERROR, empty stderr): 13 identical at 50029e64… and f23850fa…; only #46 widens (none -> all four, 7 shards), solely its root .gitattributes (C-G1, N56), as rounds 1-2. #104 (new): pricing+packets, 6 shards on both. No typescript- or control-character-driven widening.
- [x] Clone clean at f23850fa… before removal; removed /home/user/fx-p4-whole-3 and both worktrees. The trial merge was local only. Nothing pushed, no ref created.
## Classified
- No blocking or should-level regression at f23850fa…. No rule loosened: every change in affected.ts, manifests.ts, runtime.ts, stryker.ts only widens what counts or what fails.
- nit (new): runtime.ts's `shown` prints the --pnpm value and the user agent's pnpm raw; a multi-line value would split its error line. Fails closed regardless.
- nit (new): ci.md's runtime paragraph has a ragged wrap ("...the commit tested"). Every shard's canary verdict names its" / "runtime and the commit it checked out"), left by 9f51eea9….
- should (carried, pending for the base merge): the description's replay figures; #46 now runs every shard.
- nit (carried): base-merge conflicts unchanged (ADR 0066 Date line; reconciliation-001 both paragraphs), also against claude/build-platform e084da22….
- PE-S1 pending as planned.
- Done.
