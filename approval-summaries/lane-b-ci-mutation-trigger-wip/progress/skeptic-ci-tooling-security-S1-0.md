# Skeptic 1 of 3, finding S1 (ci-tooling-security), PR #96 at 50029e64...

Clone: /home/user/sk-p4-ci-tooling-security-S1-0 (removed at the end). Logs: scratchpad p4/logs/s1-0-*.

## Step 1, harness (done)
globToRegExp: `tools/stryker/**`, `patches/**`, `.github/actions/**` do not match a path holding \n or \r (`**` at the end becomes `.*`, no s flag). `**/` and `*` do match a newline.
affected() with empty closures: `tools/stryker/z\n.json` -> [] ; `tools/stryker/z.json` -> all four.
Also found: data globs ending in `/**` miss the same way: `fixtures/golden/**` (pricing), `packages/packets/src/explain/__golden__/**` (packets), both read by readdirSync (tools/golden-worksheet/engine.ts readGoldenClaims, golden.test.ts).

## Step 2, end to end (in progress)
Local commit on 50029e64... adding `packages/money/src/a\n::warning title=forged::injected.ts`, `tools/stryker/z\n.json` and `fixtures/golden/claims/G99\n.json` (a copy of G01), then `tsx tools/stryker/affected.ts --event pull_request --base 50029e64...` (log s1-0-e2e.txt, s1-0-sum):
- stdout and the step summary carry a line starting `::warning title=forged::injected.ts (imported)`: a workflow command from a path.
- pricing: not affected, though readGoldenClaims (readdirSync, `.json` suffix) loads G99\n.json into the pricing golden tests; tools/stryker/z\n.json reached no package.
- money affected (by the injected file), shards money-ledger.

## Verdict
REAL, not refuted. Severity: should. Fail-open in the classifier guarding the money check (pricing data via `fixtures/golden/**`, packets via `explain/__golden__/**`, the tooling globs); reachable only by an added path holding a control character, and a PR author can already print workflow commands from any test, so the log injection is spoofing, not escalation. Printing and globToRegExp predate P4.

Fix: (1) affected(): any changed path holding a C0/C1 control or U+2028/U+2029 (manifests.ts hasControlCharacter) affects every package, with a reason naming it JSON-quoted; (2) globToRegExp compiles with the `s` flag (or `[^]*` for a trailing `**`); (3) every reason prints a path through the manifests.ts quoting, stdout and summary alike; (4) tests: affected.test.ts cases for `tools/stryker/z\n.json`, `fixtures/golden/claims/G99\n.json`, `patches/a\r.patch`, and an injected `::` line never at the start of an output line.

Clone removed.
