# Skeptic 1 of 3, finding S2 (ci-tooling-security), PR #96 at 50029e64...

Clone: /home/user/sk-p4-ci-tooling-security-S2-0 (to be removed at the end). Logs: scratchpad p4/logs/s2-0-*.

## Step 1, clone (done)
Baseline at 50029e64...: tools/stryker/ + tools/check-action-pins/ green, 19 files, 246 tests (log s2-0-base.txt).
Confirmed by reading: scripts() (manifests.ts:279-288) marks any script name not in LIFECYCLE_SCRIPTS inert, so a dropped name makes that script's change "none".

## Step 2, mutants (in progress)
Script: scratchpad p4/s2-0/mut.py (my own applications of M01-M05, M08-M16, plus control M00 = drop postinstall). Smoke: M01 survives manifests.test.ts.
Full run against tools/stryker/, tools/test/workflows.test.ts, tools/test/collection.test.ts, tools/screening-capacity/watched.test.ts, tools/check-action-pins/ -> log s2-0-mut.txt.
Partial (22 files, 371 tests per run): M00 control KILLED (4 fail); M01-M05 SURVIVED; M08 SURVIVED.
Full result (log s2-0-mut.txt; each run 22 files, 371 tests): M00 control KILLED; M01, M02, M03, M04, M05, M08, M09, M10, M11, M12, M13, M14, M15, M16 all SURVIVED. Clone left clean after each mutant.

## Verdict
REAL, not refuted. Severity: should. A test gap, not a live fail-open: the code at 50029e64... is fail-closed on each rule, but removing any of these rules (most importantly a lifecycle name, which scripts() then reports as inert, so the mutation check skips that change) leaves every test green. The design (follow-up-p4 §2 table, CI-27) names each lifecycle script as global, so the tests do not hold what the design claims.

Fix (refined): it.each over all nine LIFECYCLE_SCRIPTS (eight for a workspace manifest, plus pnpm:devPreinstall at the root), each expecting ALL for root and for packages/db, and a guard test that LIFECYCLE_SCRIPTS equals the design's list; a key holding U+2028 and one holding U+2029; the root manifest, pnpm-workspace.yaml and mutation.yml each added and deleted -> ALL; a pin move plus a re-quoted uses scalar on the same step -> global; a shards fixture where money-ledger's package is also in another shard -> global "does not hold its packages whole"; a BOM, a %YAML 1.2 directive, a YAML warning case and a `<<` merge key in pnpm-workspace.yaml and mutation.yml, each with no other error so only that rule can fire; a 257-character specifier that REGISTRY_RANGE would otherwise accept (e.g. a long `||` range) -> ALL, and a 256-character one -> its normal verdict. Each new case to be shown failing first on its mutant.

Clone removed.
