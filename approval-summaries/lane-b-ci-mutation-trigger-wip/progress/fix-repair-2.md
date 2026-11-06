# P4 fix repair 2 (round-2 verifier issues)

Start: WIP head 05d3291b… = origin/co-001/wip-ci-mutation-trigger; PR branch untouched at 50029e64….
Logs: scratchpad p4/logs/fix/repair2/.

## Issues
- G2-a (should) git stderr passed through raw: done in a069eb36… (runGit captures stderr; printable quotes lines with
  a control character or starting :: / ##[; child-process gitlink test red with stderr inherited, green after;
  ADR N52 and Part 7 bullet, ci.md updated).
- G2-b (nit) CLI uncaught Node errors: done in a069eb36… (main/cli; cli prints errorText through printable, exit 1;
  unit test red with errorText unquoted). Carried in the same commit, as the verifier allowed.
- G3-a (should) reconciliation-001 runtime sentence: done in 2fefffd8… (both jobs check runtime and checkout); ADR
  Measured bullet and reconciliation-001 replay sentence: one line each saying the figures predate the fixes and #46
  now runs every shard. Full re-measure (58-PR replay, counts, runner-minutes) pending for the base merge.
- G3-b (nit) ci.md runtime output order: done in 9f51eea9….
- G3-c (nit) repair-1 line counts: corrected in fix-repair-1.md (bytes, non-table; characters: all 42/110, non-table
  14/28, same at 50029e64… and 05d3291b…). No commit (not a repository file).
- G3-d (nit) mutation.yml short comment line: done in 3d49fb78….
- G1-a (nit) runtime.ts flags optional: done in 827b7477… (Checks onRunner; GITHUB_ACTIONS=true requires both; red/green).
- G1-b (nit) ci.md troubleshooting rows: done in f23850fa… (4 rows).
- whole-a (replay figures in the PR description) and whole-b (trial-merge conflicts): pending for the base merge, as
  planned; no change now. PE-S1 still pending after #84.

## Final at f23850fa…
Under the lock: vitest unit tools/stryker + tools/test 35 files 499/499 (final-suite.log); typecheck 0; eslint
tools/stryker 0; lint:logs 0; watched.ts --write and synth --all exit 0, no diff. Pushed the WIP ref fast-forward
05d3291b..f23850fa through the pre-push hook (push.log). co-001/ci-mutation-trigger untouched at 50029e64…; no base
merge.
