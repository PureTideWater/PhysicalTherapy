# fix-integrate (#86, ci-images-digest) — progress

## Step 0 (2026-11-04)
- ls-remote: WIP 2648ccf0…, PR branch 83167b8f…, claude/build-platform 4846f043….
- Worktree HEAD = origin/co-001/wip-ci-images-digest = 2648ccf0…. Clean.
- Merge base with build-platform: 43565235… (#83). Base brings #92, #93, #90, #42, #95, #91, #94 (first-parent merges).
Next: step 1, base merge.
- merge commit b8837f47…, clean, no conflicts; merged tree differs from base only in the branch's 9 files.

## Step 1 done
- Generators on merged tree (under lock): install --frozen-lockfile exit 0, watched.ts --write exit 0, synth --all exit 0; git status clean: they changed nothing, no commit.
- T6 re-check: whole workflows.test.ts 124/124 on merged tree; no fingerprint or ref changed by the base, no commit.
- WIP ref pushed 2648ccf0..b8837f47 (hook: gitleaks clean).
Next: step 2 trial merges.

## Step 2 (trial merges), in progress
- Relevant live co-001 heads (diff vs their merge base with build-platform touches a workflow, workflows.test.ts, a T6-cited file, or a file-command name): 13. merge-tree with HEAD b8837f47: all 13 conflicted; conflicts #86 adds (beyond the branch's own with the base): ci-mutation-trigger/wip-ci-mutation-trigger ADR 0066 + reconciliation-001; trivy-install/trivy-pin ci.md; wip-ci-findings-transport ADR, reconciliation-001, workflows.test.ts (11 hunks: the over row it removes); wip-interest-chain release.yml, reconciliation-001, workflows.test.ts (stale, its descendant ledger-interest-once adds none). The other 7 add none (their conflicts are with the base only).
- Doc-only conflicts materialised keep-both (union, trial only; scratchpad/imgdigest/trial/run.sh): ci-mutation-trigger 50029e64: merged file 126/126; head file with CI_TREE 1 failed (mutation canary command, #96's own change) / 122 passed / 1 skipped.
- wip-ci-mutation-trigger: same as ci-mutation-trigger (merged 126/126; CI_TREE 1 failed / 122 / 1 skipped, same canary row).
- #96's own change, for its base merge: test "mutation testing … runs every selected shard, the canary first" (workflows.test.ts ~2679) expects canary run 'pnpm stryker run tools/stryker/canary/stryker.config.mjs'; #96's tree has 'pnpm -s exec tsx tools/stryker/stryker.ts run tools/stryker/canary/stryker.config.mjs'. Not #86's; no fix here.
- ci-trivy-install-2026-11-04 trial interrupted (superseded by step 2b: #107 merges into the base first).
- Other 10 relevant heads: conflicted, not materialised (conflicts listed above).
## Step 2 done
Next: step 2b (wait for #107).
