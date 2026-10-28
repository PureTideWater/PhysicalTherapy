# PR 42 fresh-clone verification of be63bdc2…
Started 2026-10-28 (~07:45 UTC). Clone: scratchpad/pr42f-verify
## Step 1: clone -- DONE
- HEAD = be63bdc2…: OK
- clone origin is the local repo; its claude/build-platform = 165c5993 (#74): ancestor OK; 56ed6279 (#81): ancestor OK
- PROBLEM: GitHub's claude/build-platform moved to 83d71fd6 (#78 merged 06:50:21 UTC, 6 min after be63bdc2 at 06:44:04 UTC); NOT an ancestor of HEAD (19 commits behind). git merge-tree HEAD 83d71fd6: clean (tree e907a7e2). Integrator recorded it (PRE-PUSH note) and pushed anyway per its instruction; next round must merge #78 (rule 6).
- pnpm install --frozen-lockfile: exit 0
## Step 2: diff since 46974a25 -- DONE
- first-parent: 89d33579 (merge 165c5993 #74), bd589960 (ci port), 17e233f0 (merge 56ed6279 #81), be63bdc2 (ci hand-over patch)
- both merges: git merge-tree of their parents == actual merge tree (89d33579 e1201c2a, 17e233f0 99e55ae1): pure auto-merges, no hand resolution, no extra generator writes
- 138 files changed = 136 base files (a6e754fc..56ed6279) + ci.yml + workflows.test.ts; only 7 files differ from 56ed6279: ci.yml, workflows.test.ts, and 5 both-sides auto-merged (e2e/helpers.ts, test-matrix.md, synth matrix.ts, registry.ts, watched-paths.txt)
- ci.yml net: exactly the 2 env lines (BUILT: fromJSON(steps.<x>.outputs.metadata || '{}')['containerimage.config.digest']) + 2 run lines (built="$BUILT"); identical to #86 (co-001/ci-images-digest 9ec30e1d) and to port.patch (sha256 8cf981fb..., matches) minus #86's 3-line comment
- workflows.test.ts net: the 2 env pins + web built pin + worker built pin. DEVIATION: the new rule test bd589960 added was REMOVED in be63bdc2 (deferred to #86's broader value rule, 'one environment string under Linux's 131,072 bytes'); HEAD merges clean with #86 9ec30e1d
- unchanged since 46974a25: migrations/*.sql, domain-model.md, approvers.json, content/releases, packages/pricing/src: OK (empty diff)
- added lines (10,571): no model name (2 'claude' hits = branch name claude/build-platform and path .claude/rules/brand.md, both from base); no 40/64-hex string. Commit trailers carry the session attribution (Co-Authored-By ...) as every earlier commit in history does.
## Step 3: local checks -- in progress
- typecheck: exit 0, 22 projects passed
