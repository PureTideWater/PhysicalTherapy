# PR42i merge (PR 6b-4 #42, approval head 9426a8d1 + base 88708069)
## Step 1 DONE
- worktree clean at 6c28d6a2; ff to 9426a8d1; diff 6c28d6a2..9426a8d1 = approval line only (domain-model.md L7334, SHA b23fed0e... unchanged).
- merge base is bce57f16 (#82); delta = #83, #92, #93, #90 to 88708069. No migration / domain-model / approvers / db/functions in delta.
- both sides changed: docs/product/test-matrix.md, packages/synth/src/cases/{matrix,registry}.ts, pnpm-lock.yaml, tools/screening-capacity/watched-paths.txt
## Step 2 DONE: merge commit 9bb0604e (clean auto-merge of the 5 shared files), merge base 88708069
## Step 3 DONE: install --frozen-lockfile ok (lockfile unchanged), watched.ts --write (551 lines, no change), synth --all (no change), no untracked under fixtures
## Step 4 checks (suite: scratchpad/pr42i/suite.sh; results pr42i/suite/results.tsv)
- PG was down; setup-container.sh ran OK (pr6b4 untouched at 9bb0604, node_modules match lockfile).
- Decisions: build+e2e NOT run: the 5 files both sides changed are none under apps/web, and no web file #42 changes is in the delta (overlap empty) -> CI runs e2e on the pushed head.
  test:db: targeted run (dbt) of the delta's 8 db test files (they now run on #42's mail_streams schema) + #42's 6 apps db tests (routes/worker modules the delta's route/digest code sits beside); packages/db tests not run (delta touches no packages/db code, no migration).
- Chunk A launched: typecheck lint lint-copy lint-logs check-fixtures actions toolchain tables affected domain-model unit dbt
- Capacity watched matching (screening-capacity.yml logic, 9426a8d1...HEAD, 121 paths): 29 hits (sign-in auth, format.ts, screening components, worker digest/reconcile/triage, model-gateway manifest+src, synth, pnpm-lock, watched-paths.txt) -> capacity S1,S4 binding with fresh --out REQUIRED; it needs a build (images), so build runs for capacity (pr42i/capacity.sh). e2e still not run (reason above).
- typecheck 0 (22 projects); lint 0 (1,734 files, 3 groups, 0 err 0 warn); lint:copy 0 (554); lint:logs 0 (1,111); check:fixtures 0 (333 read, 4,006 searched); actions:check 0 (no pin new); toolchain:check 0 (0 err, 1 warn: newer pnpm 10.34.9, by hand at triage; lockfile adds 2 versions, trust ok)
- tables.test.ts 0: 7 passed (AFTER_42 1/2/1 unchanged, none loosened); affected --base 9426a8d1 0: shards none (no money path) -> no shard, no gate
- domain-model (fresh tp_pr6b4i_dm_1, dropped): migrate ok, --check 0 (matches 20261107090000_mail_streams.sql), --require-approval 0 ("carries an approval for this text", text SHA b23fed0e...2518)
- unit (CI=true, ENGINE_FREEZE_BASE=88708069, GITLEAKS 8.24.3) 0: 427 files, 7,198 passed | 1 skipped
- dbt first attempt exit 127 (my script's file-list quoting, not a test); fixed; chunk B: dbt build
- skip confirmed: packages/rules/src/content.test.ts:179 (skipIf uid 0), the only one
- dbt 0 (fresh tp_pr6b4i_db_1, migrate, dropped): 14 files, 185 passed; build 0 stamp 9bb0604e. Next: capacity S1,S4 binding
- capacity S1,S4 binding (process runtime, images from the 9bb0604e build, fresh out pr42i/capacity-out-20261102T063626-9bb0604e, db tp_pr6b4i_cap_1 dropped) exit 1, verdict reasons 12, all environment-only (partial run 1, limit not applied 5, cold start not applied 4, oracle not compared 2) = the 6c28d6a2 set; timeWarnings []. S1-1 33.2 s, S1-2 2.5 s; S4#1 38.2/37.8/36.5/26.9; S4#2 41.6/37.5/40.2/28.6; S4#3 39.7/38.3/38.8/29.6 (MIDDLE S4#3 39.7 s, under 48 and 44). Slower than 6c28d6a2's 30.0 s middle, on a container restarted 30 min earlier (PG was down); CI measures on the pushed head.
- Next: push
## Step 5 DONE
- PUSHED 9426a8d1..9bb0604e to co-001/pr-06b-mail-streams (pre-push hook ran: 1 commit, fixture guard 0 files, 5 text files searched, gitleaks no secret); new branch co-001/wip-pr42-final at 9bb0604e. ls-remote: both 9bb0604e, claude/build-platform 88708069. No tp_pr6b4i_* databases left. DONE.
