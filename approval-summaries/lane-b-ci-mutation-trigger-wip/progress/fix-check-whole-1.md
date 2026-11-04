# P4 whole-diff adversary, round 1 (progress)
- Clone /home/user/fx-p4-whole-1, head 30efef6d…, range 50029e64…..30efef6d…
- [ ] read diff  [ ] replay merged PRs  [ ] merge-tree with wip-ci-images-digest 932ea45f… + workflows.test  [ ] vitest  [ ] typecheck  [ ] remove clone
## Findings
- Read source, workflow, docs diff 50029e64…..30efef6d… whole. C-G4 wording matches classifyPackage (manifests.ts ~351-370).
- merge-tree with origin/co-001/wip-ci-images-digest 932ea45f… (= #86's head; #86 has since merged as 24531dc2…): conflicts in ADR 0066 header (Part 7 / Date line) and reconciliation-001, the same two files and hunks as at 50029e64… (pre-existing, not from the fixes). Notices N51-N56 collide with none (#86 adds N32).
- Installs done (head and base worktree /home/user/fx-p4-whole-1-base). Replay of 22 merged PRs running (13 earlier + #86 #106 #75 #105 #107 #94 #83 #82 #46).
- First replay attempt printed nothing (the `#` PR labels commented out the inner bash -c); rerun via script reading args from file.
- Trial merge as local-only commit efd0be99… in worktree /home/user/fx-p4-whole-1-merged, the two doc conflicts resolved both-sides (date line: Part 5; N32; Part 7). Queued under the lock: head vitest tools/stryker tools/test, head typecheck, merged install, merged workflows.test (own and head's file) via CI_TREE, merged tools/stryker.
- Replay (22 merged PRs, trees from git objects, logs whole1/replay-{base,head}.txt): 21 of 22 identical at 50029e64… and 30efef6d…. One widened: #46 (377 files; 0 -> 7 shards), solely because it added the root .gitattributes (`packages/db/functions/*.sql linguist-generated=false text eol=lf`), now a global input (C-G1, N56). The added line does rewrite bytes (eol=lf), but only of files no shard reads; expected cost of the safer option, .gitattributes moves are rare (2 commits in 164 first-parent merges). No typescript-driven widening in the set (#48 already all four).
- Head vitest --project unit tools/stryker tools/test: 35 files, 492/492 passed (whole1/vitest-head.log). pnpm typecheck exit 0. Clone stayed clean.
- Merged tree (efd0be99…, local only): its own workflows.test.ts via CI_TREE 133 passed, 2 skipped (the CI_TREE skips); its tools/stryker 14 files, 201/201. Head's (pre-#86) workflows.test.ts on the merged CI files: 3 failed, all #86's (screening, images identity, release dry run), none mutation: expected, the merged file is what counts.
- Durations (verbose): N1 child-Node test 344ms, B1 guard 587ms, typescript lockfile 909ms; no flake risk seen.
- Removed /home/user/fx-p4-whole-1 and both worktrees. Nothing pushed; no ref created on origin.
## Classified
- should: description's replay figures (58 of 58, full runs 22 -> 15, ~294-297 runner-minutes) were computed at 50029e64…; at the head #46 widens 0 -> 7 shards (.gitattributes, C-G1). Re-run the 58-PR replay at the head before the push and update the figures (and say #46 widens, why).
- nit: ci.md says "a control character or a line break"; code and ADR N52 also hold DEL, C1, U+2028 and U+2029. Name them.
- nit: any .gitattributes edit, even a linguist-only one, runs every shard (N56 coarse by design); record that in N56 with the #46 replay case.
- nit (pre-existing): lockfile "moves name@version" reasons are printed raw; a YAML-quoted lockfile key with a line break would print unescaped. Quote through quoted() like paths.
- nit: the B1 guard scans what is installed, so optional platform packages differ off Linux; CI is deterministic.
- nit (base merge): ADR 0066 header and reconciliation-001 conflict with #86 as at 50029e64…; resolve both sides, Date line "...; Part 5 2026-10-28; N32 2026-10-28; Part 7 2026-11-02".
- Done.
