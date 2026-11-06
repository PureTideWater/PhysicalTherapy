# Skeptic 2 of 3, finding S2 (ci-tooling-security), PR #96 at 50029e64...
Clone: /home/user/sk-p4-ci-tooling-security-S2-1 (remove at end). Logs: scratchpad p4/logs/s2-1-*.
## Step 1, clone (done); pnpm install offline ok; baseline vitest tools/stryker + tools/check-action-pins: 19 files, 246 tests green
## Step 2, mutants (in progress)
Runner: scratchpad p4/sk2/mut.sh, one vitest run per mutant over tools/stryker, tools/check-action-pins, tools/test/workflows.test.ts, tools/test/collection.test.ts, packages/synth. Results: scratchpad p4/logs/s2-1-results.txt.
- M00 baseline: 550 tests green.
- Static check: scripts() at manifests.ts:284-287 makes a script name not in LIFECYCLE_SCRIPTS inert, so dropping a name is a real fail-open (not equivalent). manifests.test.ts names only postinstall, prepare, prepublishOnly.
- M01 (pnpm:devPreinstall dropped) SURVIVED 550/550; M02 (install dropped) SURVIVED 550/550. Batch killed at 30 min (lock contention); rerun M03+ on tools/stryker + tools/test/{workflows,collection}.
- M03 prepublish, M04 preprepare, M05 postprepare dropped: SURVIVED 285/285. Controls M06 postinstall (4 red) and M07 prepublishOnly (1 red) KILLED.
- M10 (U+2028/2029), M11 (MAX_SPECIFIER), M12 (pin-only source compare), M13 (!whole), M14 (directive+BOM), M15 (merge key): all SURVIVED 285/285.
- M16 (named add/delete rule), M17 (YAML warning return), M18 (BOM only), M19 (directive only): all SURVIVED 285/285. Mutants restored after each run (git diff clean).
## Step 3, fail-open probe (done)
Temporary probe test in the clone (tools/stryker/zzprobe.test.ts, 18 cases) asserting all four packages through affected() on this repository's graph. Original code: 18/18 green (the rules hold today). Under each mutant:
- M01-M05: root and packages/db manifest gaining that lifecycle script -> [] (none). Real fail-open: the mutation run is skipped.
- M10: a script key holding U+2028 -> not all four. M11: a 300-char `||` range on an otherwise inert root devDependency -> not all four.
- M14: `%YAML 1.2` directive on pnpm-workspace.yaml -> not all four (BOM probe stayed all four by another path).
- M16: root package.json deleted -> [] (none); pnpm-workspace.yaml add/delete stayed all four by another path.
- M15: merge key under an inert key stayed all four in my probe (defended elsewhere; still untested in isolation).
## Verdict
Reproduced, not refuted. Severity should: no fail-open in the shipped code (probe green on original), but the list and guards that keep a money-affecting change from skipping mutation have no test that pins them; a later edit dropping any of five lifecycle names or the add/delete rule turns the required check off for that change with CI green.
Refined fix: a hard-coded table (not imported from LIFECYCLE_SCRIPTS, so removing a name goes red) of all nine names, each asserted ALL for the root and for a workspace manifest (packages/db) and for a manifest added with it; package.json, pnpm-workspace.yaml and mutation.yml each added and deleted -> ALL; a script key with U+2028 and with U+2029; a %YAML directive alone and a BOM alone; a specifier of 257 chars on an otherwise inert dependency (and 256 judged as a range); a pin move plus re-quoting of another scalar -> ALL; a synthetic proof shard sharing a package -> ALL; a YAML warning case; a merge key under an inert key. Re-run the mutants to show each is killed.
Clone removed: see below.
- [x] clone /home/user/sk-p4-ci-tooling-security-S2-1 removed
