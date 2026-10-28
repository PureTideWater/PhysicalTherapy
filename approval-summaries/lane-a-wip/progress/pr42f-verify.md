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
- lint (eslint --max-warnings=0 on the 119 changed .ts/.tsx/.js files): exit 0, no problems
- vitest unit tools/test/workflows.test.ts: exit 0, 1 file, 114 passed
- vitest unit apps/web/src/app/tables.test.ts: exit 0, 7 passed
- vitest unit apps/web (web unit project): exit 0, 80 files, 954 passed
- created db tp_pr6b4fv_dm_1
- db:migrate on tp_pr6b4fv_dm_1: exit 0, 45 migrations applied, last 20261107090000_mail_streams.sql
- db:domain-model --check --strict (fresh db): exit 0; doc matches schema at 20261107090000_mail_streams.sql; functions match 375 names; 98 tables, 1 view, 47 registered, 226 divergence rows (23 to approve), 0 explanation problems
- db:domain-model --check --strict --require-approval (local, read-only): exit 1 only for the approval ("names no person; date is not a date"); prints SHA-256 b23fed0e…; line 7334 'Approved by: ________  Date: ________  Document SHA-256: `b23fed0e...`' unchanged since 46974a25 (domain-model.md and packages/db/functions: empty diff)
- dropped tp_pr6b4fv_dm_1; created tp_pr6b4fv_db_1
- db:migrate on tp_pr6b4fv_db_1: exit 0 (45)
## Step 4: CI on be63bdc2 (runs created 07:42:07 UTC, pull_request; ci 40651775903, mutation 40651775778, screening-capacity 40651775779, approval-of-record 40651775777) -- all 26 check runs completed 07:59
- success: approval-of-record, build, capacity, changes x2, db 1-4/4, e2e 1/2 2/2, images, lint, mutation, screening-capacity gate, static, stryker x6 (packets-explain, packets-rest, packets-scan, pricing-engine, pricing-recompute, pricing-rest), unit
- skipped: notify
- failure: domain model, all green (reading logs)
- all green: failure ONLY because needs.domain-model = failure (log: "not every job succeeded: domain-model failure"; static, lint, unit, db, build, e2e, images success)
- domain model (job 122693286459): steps 1-9 success, step 10 'pnpm db:domain-model --check --strict --require-approval' failure: "docs/product/domain-model.md matches the schema at 20261107090000_mail_streams.sql", "packages/db/functions matches the schema's 375 function names", "is not approved: the approval names no person; the approval date is not a date (YYYY-MM-DD)", "The text compared with the schema has SHA-256 b23fed0e…". Expected.
- images (job 122693286333): success, every step success; step 10 env BUILT=sha256:f2676194f8d0... (71 bytes), "web: config sha256:f2676194..." match; step 11 env BUILT=sha256:a9bf13b849b6..., worker config match, target sha256:7c55e3e5..., loaded as target on the containerd store; step 12 headless shell equal to browser.json
- CI checked out b52d83dee086 = "Merge be63bdc2 into 83d71fd6" (approval-of-record job's checkout log): CI tested this head merged with the CURRENT base including #78, green but for domain model. PR API: mergeable=true, mergeable_state=behind (base.sha recorded 56ed6279).
- approval-of-record: success; "leaves it awaiting approval"; notice: APPROVAL_REVIEW_REQUIRED unset, not enforced
