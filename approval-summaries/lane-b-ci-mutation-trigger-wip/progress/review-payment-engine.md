# P4 #96 payment-engine review: progress

Started 2026-11-04. Fresh run (no earlier progress file). Clone /home/user/rv-p4-payment-engine at 50029e64… (= origin/co-001/ci-mutation-trigger); merge base 43565235…; base branch now 21fa10df…. Install done (frozen, under the lock).

## Checked
- Read affected.ts, manifests.ts, mutation.yml at the head; affected.ts diff vs merge base: outside the four classified files P4 only widens (GLOBAL_LOADED, includeTests on the global closure, holding tsconfig, new global globs). Narrowing is confined to manifests.ts (root/workspace/package manifests, mutation.yml) and the pin-only runner proof.
- Closures at head (probe): money 8 files; ledger 31 (+money); pricing 97 (contracts, db, money, rules, tools); packets 145 (+triage, pricing). Global holding: ., tools, tools/stryker/canary/lib.
- Closure fs readers listed (10 files); none reads a manifest.

## Scenarios run (head 50029e64)
- s01 catalog decimal.js -> all four; s02 catalog typescript -> none; s03 money imports -> all four; s04 nested tsconfig -> none; s05 setup-node pin-only -> money-ledger; s06 apps/web renamed @tp/money -> pricing, ledger, packets (capture seen); s07 money sideEffects -> all four; s08 triage zod -> packets; s09 typescript catalog+lockfile -> none at head, all at base.

## Also checked
- gate.ts diff: only additions (runtime/commit legs); THRESHOLD_PERCENT 85 and the equivalents rules unchanged.
- #84 (e3299ea2…) trial merge into 50029e64: one conflict, docs/runbooks/ci.md shard table (P4's E7 times vs #84's two new rows); affected.test.ts and shards.test.ts auto-merge; tools/stryker + synth cases tests on the merge: 165 passed, 1 failed only because the trial worktree's node_modules is a symlink (stryker.ts refuses core outside the root's node_modules: correct behaviour).
- Replay (13 merged PRs: #91 #95 #42 #90 #93 #92 #77 #48 #49 #56 #52 #47 #44) at base rule: see replay-base.txt; head rule re-running (first head run was on the wrong checkout).
- NOTE: the main clone was left at 43565235 by scen.sh after s09's base run; fixed (scen.sh now returns to 50029e64). Scenarios s01-s08 and s09-head ran at 50029e64.

## Next
- Scenario harness (local commits on the head, affected.ts --event pull_request --base 50029e64).
- Replay merged PRs since 43565235 (head rule vs base rule).
- gate.ts / verdict.ts / equivalents diff.
- #84 overlap.

## Findings
- F1 (blocking, P4 regression): a typescript catalog bump (pnpm-workspace.yaml `typescript: ^6.0.3` -> `^6.0.4`, lockfile moved with it) runs no shard at the head ("catalog.\"typescript\" (imported by no closure and no tooling)"), all seven at the base. Every Stryker run (canary and each package) imports the root's typescript: @stryker-mutator/core dist/src/sandbox/ts-config-preprocessor.js:45,85 `await import('typescript')`, undeclared in core's package.json, resolves to the root devDependency (node_modules/.pnpm/typescript@6.0.3); canary run shows two "TSConfigPreprocessor Rewriting file" lines and the sandbox tsconfig.base.json is typescript's re-serialisation, which every package tsconfig extends and Vite reads. lockedPackages for every closure holds no typescript key. Scan of @stryker-mutator/{core,vitest-runner,instrumenter,util} dist: undeclared bare imports typescript (core), json-schema (types), svelte (instrumenter, .svelte only). Fix: add typescript to TEST_TOOLING; guard test that every bare import in the tooling packages' dist is declared or in TEST_TOOLING.
- F1 evidence added: with the root's node_modules/typescript replaced by a stub whose parseConfigFileTextToJson throws, the canary run fails (rc 1, "Unexpected error occurred while running Stryker Error: stub typescript"); restored, the canary is 5 of 5 on the head (logs canary-stub-ts.log, canary-real-ts.log).
- (dropped) nested tsconfig.json selects no package at the head (s04), but Vite did not honour useDefineForClassFields from a package or nested tsconfig in a vitest run under vitest.mutation.config.ts, so no effect shown: not a finding.

## Final (2026-11-04)
- Replay at head re-run at 50029e64…: head = base for all 13 (none: #91 #90 #93 #92 #56 #47; pricing+packets: #95 #42; all four: #77 #48 #49 #52 #44).
- Round 3: s10 root typescript -> none (PE-B1); s12 catalog vitest -> all; s13 broken exports -> fails closed; s15 checkout pin-only -> money-ledger; s16 scripts.stryker deleted -> none (PE-N1); s17 equivalents -> all; s18 upload-artifact pin -> all; s04 at base -> none (same as head).
- Findings final: PE-B1 blocking (typescript), PE-S1 should (#84 base merge: ci.md table, runner-minute figures), PE-N1 nit (config comments). Review written: approval-summaries/lane-b-ci-mutation-trigger-review-payment-engine.md. Clone removed.
