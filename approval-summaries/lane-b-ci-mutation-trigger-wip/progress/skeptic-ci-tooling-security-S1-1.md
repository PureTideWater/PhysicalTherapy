# Skeptic 2 of 3: ci-tooling-security S1 (#96, head 50029e64...)

Status: done. Fresh clone removed after the run.

## Reproduction (clone at 50029e64..., node_modules symlinked from the PR worktree, one local commit each)
- changeSince lists paths with `git diff --name-status -z`, so a newline in a path reaches affected() raw.
- Commit A: `tools/stryker/z\n.json`, `fixtures/golden/q\n.json`, `packages/money/src/a\n::warning title=forged::injected.ts`.
  The output was `money: affected by packages/money/src/a` and then `::warning title=forged::injected.ts (imported)` at the
  start of its own line. pricing, ledger and packets: not affected (logs/sk2-S1-run.txt).
- Commit A without the money file: every package not affected, `shards: none` (logs/sk2-S1-run2.txt).
- Control (the same two files with no newline): every package affected through tools/stryker/z.json, and pricing also
  through fixtures/golden/q.json (logs/sk2-S1-control.txt).
- Same root cause, wider than the finding says: every DATA_FILES glob that ends in `/**` misses such a path too
  (fixtures/golden/**, release-synth-*/**, CAS-08/**, packets explain __golden__/**). `packages/packets/src/explain/__golden__/x\n.json`
  gave `shards: none` (logs/sk2-S1-golden.txt), and golden.test.ts runs readdirSync on that directory, so a `x\n.traces.json`
  there would be read by the packets run that got skipped.
- Nothing on the server side refuses such a path. The control-character refusals in tools/hooks are session write hooks,
  and check:fixtures does not look at paths.

## Limits on the impact
- Adding a file can only add inputs. Changing or removing an existing input changes a normally named path, and that is
  caught. The canary tests and equivalents are read by name, so a new file under tools/stryker that nothing imports does
  nothing. An added golden pin adds assertions, and unit CI runs it as well. I found no path where this lowers a mutation
  score, but it breaks the stated rule that anything under tools/stryker/** affects every package, and a data file a
  money run reads can change without that run.
- Workflow-command injection: the workflow triggers on `pull_request`, so the PR's own code runs and its author can
  already print anything. No privilege boundary is crossed, and the step outputs come from the GITHUB_OUTPUT file. Nit.

## Verdict
Not refuted. Severity should: a fail-open in the required money check's classifier, cheap to close, though no harm to a
mutation score is shown. The fix has two parts:
1. globToRegExp: compile with the `s` flag (`new RegExp(`^${pattern}$`, 's')`). Only `.*` changes; `[^/]` already
   matches a newline.
2. affected(): any changed path for which manifests.ts hasControlCharacter is true (C0, DEL, C1, U+2028/9) affects every
   package, and its reason prints the path JSON-quoted, like classifyManifests. Do the same quoting for every printed
   path in a reason. Add affected.test.ts cases for a newline path under tools/stryker/**, under a data `/**` glob, and in
   a money closure.
