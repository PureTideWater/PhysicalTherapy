# Skeptic 3 of 3, finding S2 (ci-tooling-security), PR #96 at 50029e64...
Clone: /home/user/sk-p4-ci-tooling-security-S2-2 (remove at end). Logs: scratchpad p4/logs/s2-2-*.
## Step 1, clone (in progress)
Baseline: 20 files, 364 tests green (log s2-2-base.txt).
## Step 2, mutants (in progress): scratchpad p4/s2-2/mut.py, log s2-2-mut.txt
Results (each run 20 files, 364 tests, over tools/stryker, tools/check-action-pins, tools/test/workflows.test.ts):
- C0 control (drop postinstall): KILLED (4 fail).
- Drop preprepare, install, pnpm:devPreinstall from LIFECYCLE_SCRIPTS: all SURVIVED. scripts() (manifests.ts:279-288) then marks the script inert, so a change to it runs no mutation: a real fail-open if the list is ever edited.
- M10 (U+2028/2029 removed from hasControlCharacter): SURVIVED.
- M13 (!whole guard disabled): SURVIVED.
- M16 (named file added/deleted rule removed): SURVIVED.
- MAX_SPECIFIER cap removed: SURVIVED.
Clone left clean after each mutant, then removed.
## Verdict
REAL, not refuted (agrees with skeptics 1 and 2). Severity: should. Code at 50029e64... is fail-closed; the gap is that tests do not pin these rules, so a later edit can silently open the money gate.
Fix: it.each over every LIFECYCLE_SCRIPTS name (root incl. pnpm:devPreinstall, and a workspace manifest) expecting global, plus a test that the list equals the design's nine names; U+2028 and U+2029 key cases; root manifest, pnpm-workspace.yaml and mutation.yml each added and each deleted -> global; pin move plus re-quoted uses on the same step -> global; a shards fixture where a money-ledger package is also in another shard -> global; BOM, %YAML directive, a warning, and a << merge key each isolated -> global; a 257-char specifier the range grammar would otherwise accept -> not registry, and 256 -> normal. Show each new case red on its mutant.
