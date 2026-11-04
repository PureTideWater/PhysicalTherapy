# P4 whole-diff adversary, round 2 (progress)
- Clone /home/user/fx-p4-whole-2 (fresh; read only). Range 50029e64….. WIP head.
- [x] read diff  [x] replay merged PRs  [x] merge-tree with wip-ci-images-digest + workflows.test  [x] vitest  [x] typecheck  [x] remove clone
## Findings
- Head 05d3291b… (= origin WIP ref); PR branch 50029e64…. Installs of head and base worktree /home/user/fx-p4-whole-2-base: both exit 0.
- Read source/workflow/test diff (affected.ts, manifests.ts, runtime.ts, stryker.ts, mutation.yml, tests): no regression found so far.
- merge-tree with origin/co-001/wip-ci-images-digest 932ea45f…: conflicts only in ADR 0066 Date line and reconciliation-001 (as round 1). Local-only trial merge fb5ef26b… in /home/user/fx-p4-whole-2-merged, both sides kept.
- Replay of 36 merged PRs (round 1's 22 + #108 #78 #81 #74 #79 #80 #76 #51 #50 #55 #53 #54 #45 #43) running; checks queued under the lock (head vitest x2, typecheck, merged install + workflows.test via CI_TREE + merged tools/stryker).
- Checks (logs whole2/): head vitest --project unit tools/stryker tools/test 35 files 495/495, run twice, both green (no flake); pnpm typecheck 0 (22 projects). Merged tree fb5ef26b… (local only): install 0; its workflows.test.ts via CI_TREE 133 passed, 2 skipped (the CI_TREE skips); its tools/stryker 14 files 204/204.
- Spot runs at head: strykerBin() resolves the root's direct link (accepted); runtime.ts --pnpm "$(pnpm --version)" --commit <HEAD> exits 0 on a detached checkout.
- Docs vs code: ci.md "a catalog, root or tools/package.json move of typescript runs every shard" holds (mirror(): tooling first, for root, holding and closure kinds); ADR N51-N56, ci.md runtime paragraph and CI-27/CI-29 rows match the code read.
- Replay: first run hit the 30-minute background limit after base 36/36 and head 30/36; the head's last 6 (#50 #55 #53 #54 #45 #43) rerunning (replay-head-rest.txt). Of 30 compared: 29 identical; #46 widens 0 -> 7 shards (root .gitattributes, C-G1/N56), as round 1. No ERROR lines.
- Replay done, 36 of 36 (logs whole2/replay-base.txt, replay-head-all.txt): 35 identical at 50029e64… and 05d3291b…; only #46 widens (0 -> all four, 7 shards), solely the root .gitattributes (C-G1, N56). Full runs in this set: 6 at base, 7 at head. No typescript-driven widening (#48 already all four); no ERROR.
- Label grep: no file still quotes "(mutation tooling, every package)".
- Removed the clone and both worktrees; the trial merge fb5ef26b… was local only. Nothing pushed, no ref created.
## Classified
- No blocking, no should-level regression found at 05d3291b….
- should (carried, already pending): description replay figures must be recomputed at the post-base-merge head; #46 widening is confirmed again (by design).
- nit (carried, already pending): base-merge conflicts unchanged (ADR 0066 Date line; reconciliation-001 both paragraphs), resolve both sides.
- PE-S1 pending as planned.
- Done.
