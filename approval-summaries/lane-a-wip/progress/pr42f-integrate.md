# PR 42 (6b-4) final integrate round (progress)
- Start 2026-10-28 UTC: fresh (no earlier file). Head expected 46974a25.
## Steps
- [x] 1 MERGED origin/claude/build-platform 165c5993 (#74) -> 89d33579, clean (no conflict). Files both sides changed (auto-merged): apps/web/e2e/helpers.ts, docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts, registry.ts, tools/screening-capacity/watched-paths.txt. Generators on the merged tree: pnpm install --frozen-lockfile 'Already up to date' (lock sha ba976a82 unchanged); watched.ts --write 543 lines, nothing written; synth --all 258 cases 0 written (650 unchanged) + 8 EMR formats 0 written; nothing untracked under fixtures/. tables.test.ts: #74 changed neither it nor the three files; test 7/7 passed; exemptions 1/2/1 still match -> no edit (decision: leave; no count changed, wrapping belongs to the UX PRs named in removedBy)
- [x] 2 PORTED images fix -> bd589960 (ci.yml lines 734/736 and 746/748 only; workflows.test.ts 1802/1803/1811 pins + one new test 'gives no step a build's whole metadata as one variable...' covering step env and with inputs, real workflows [] + the two BUILT reads named + 5 shapes). Failing-first: on the unfixed tree (CI_TREE=git archive of 89d33579) both the pins test and the new test fail; fixed tree: workflows.test.ts 115/115 passed; actionlint 1.7.7 -ignore 'label "ubuntu-26\.04" is unknown' exit 0; eslint on the test file 0. NOTE: CLAUDE.md wants pnpm actions:check + toolchain:check after a workflow change: add to step 3
- [ ] 3 checks
- [ ] 4 push
## Step 3 decisions (delta since 46974a25 = #74's merge 89d33579 + the port bd589960)
- MUTATION: tools/stryker/affected.ts --event pull_request --base 46974a25 -> money/pricing/ledger/packets not affected, "shards: none (no money path changed)" -> no shard and no gate run (output scratchpad/pr42f-affected.out/.md)
- CAPACITY: the capacity workflow's own matching (watched-paths.txt of 46974a25 and HEAD vs git diff --name-only 46974a25...HEAD) -> 21 watched hits (#74's action-form.tsx, field.tsx, form-issues.tsx, http/form.ts, http/next.ts, routes/sign-in.ts, ui button/input/loading-*, synth matrix etc; list scratchpad/pr42f-watched-hits.txt) -> run S1,S4 binding with a FRESH --out (capacity-out-<UTC stamp>)
- Workflow changed -> also pnpm actions:check and BASE=origin/claude/build-platform pnpm toolchain:check (CLAUDE.md)
- e2e: playwright has ONE project (chromium); "as CI" = CI's 2 shards, CI=true (retry 1 + failOnFlakyTests), E2E_PREBUILT=1 on the stamped build of the build step
- suite script: scratchpad/pr42f/suite.sh; results scratchpad/pr42f/suite/results.tsv (+ .done); dbs tp_pr6b4f_*
## Resume 1 (2026-10-28, after an interruption)
- Found: HEAD bd589960 clean; origin/claude/build-platform still 165c5993 (no new base); origin PR head still 46974a25. Steps 1-2 verified in the code (ci.yml 4 lines, test pins + new test).
- Suite results so far: typecheck 0 (22 projects passed). lint was cut by the interruption (apps/web 624 files 0/0, packages 505 files 0/0 passed; '.' group killed, no result row) -> rerun lint and continue.
- Step 3 results (bd589960): typecheck 0 (22 projects); lint 0 (1,673 files in 3 groups, 0 errors 0 warnings); lint:copy 0 (529 files); lint:logs 0 (1,081 files); check:fixtures 0 (333 read, 3,908 searched); synth --all 0 (258 cases 0 written/650 unchanged; 8 EMR 0/16) + diff clean + nothing untracked; engine-freeze 0 (no problems)
- Next: unit golden oracle verify-content (chunk B, started)
## Resume 2 (2026-10-28 ~05:45 UTC): orchestrator stopped run at bd589960 to take #81 too
- bd589960's check results above DO NOT COUNT for the push; step 3 restarts from the start on the new head.
- origin/claude/build-platform now 56ed6279 (#81 SUITE-CAP-1a: d3a9a3d7, 483c3167, f25333a6). PR head on origin still 46974a25.
- [ ] 1b merge 56ed6279 after bd589960 (own merge commit), generators, tables.test
- [x] 1b MERGED 56ed6279 (#81) -> 17e233f0 (parents bd589960, 56ed6279), clean. Files both sides changed (auto-merged): docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts, registry.ts (CAS-41), watched-paths.txt (+csv-arena.ts). db-shards.test 15 slow-first = 12 route tests (unchanged by #42) + lease + 2 CAS-41. Generators: install --frozen-lockfile 'Already up to date' (lock ba976a82 unchanged); watched.ts --write 544 lines, nothing beyond the merge; synth --all 259 cases 0 written/651 unchanged, 8 EMR 0/16; nothing untracked under fixtures/. tables.test.ts 7/7, exemptions 1/2/1 unchanged (#81 touches no apps/web) -> no edit.
- [ ] 3 checks on 17e233f0 FROM THE START (new results dir scratchpad/pr42f/suite2)
## Step 3 decisions RE-DERIVED on 17e233f0 (delta 46974a25...17e233f0 = #74 + port + #81; 138 changed paths)
- MUTATION: affected.ts --event pull_request --base 46974a25 -> money/pricing/ledger/packets not affected, "shards: none (no money path changed)" -> no shard, no gate (scratchpad/pr42f-affected2.out). #81's reconcile/report/triage files are apps/worker, outside every mutation closure.
- CAPACITY: screening-capacity.yml's own matching (base+head watched lists vs diff) -> 27 watched hits incl. #81's triage/execute.ts, report/content.ts, csv-arena.ts, generate.ts, reconcile/patient-share.ts, remittances.ts (scratchpad/pr42f-watched-hits2.txt) -> run S1,S4 --time-mode binding, FRESH --out
- e2e: 2 shards (public repo -> CI's [1,2]), one playwright project 'chromium'
- suite script scratchpad/pr42f/suite2.sh (= suite.sh, OUT=pr42f/suite2); chunk A launched: typecheck lint lint-copy lint-logs check-fixtures synth engine-freeze unit golden oracle verify-content
