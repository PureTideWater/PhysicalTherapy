# Skeptic 3 of 3, finding S1 (ci-tooling-security), PR #96 at 50029e64...

Clone: /home/user/sk-p4-ci-tooling-security-S1-2 (offline install, removed at the end). Logs: scratchpad p4/logs/s1-2-*.

## Step 1, harness (done; s1-2-harness.txt)
globToRegExp: `tools/stryker/**`, `stryker/**`, `patches/**`, `.github/actions/**`, `fixtures/golden/**` do not match `<prefix>z\n.json`, `<prefix>a\r.ts` or `<prefix>dir/z\n.json` (trailing `**` compiles to `.*`, no s flag). A plain name matches.
changeSince lists paths with `git diff --name-status -z`, so a raw newline path reaches affected() intact.

## Step 2, end to end (done; s1-2-e2e.txt)
Local throwaway commit (never pushed) adding `packages/money/src/a\n::warning title=forged::injected by a path.ts`, `tools/stryker/z\n.json`, `fixtures/golden/claims/G99\n.json`; `tsx tools/stryker/affected.ts --event pull_request --base 50029e64...`:
- stdout has a line starting `::warning title=forged::injected by a path.ts (imported)` (workflow command from a path).
- pricing, ledger, packets: not affected; shards money-ledger. tools/stryker/z\n.json reached no package; fixtures/golden G99\n.json (read by readdirSync in tools/golden-worksheet/engine.ts) did not reach pricing.

## Verdict
REAL, not refuted. Severity: should (fail-open in the classifier for the required money check, reachable only via an added control-character path; log injection is spoofing, since a PR's own tests can already print workflow commands). Both behaviours predate P4.
Fix: affected() makes any changed path holding a control character (manifests.ts hasControlCharacter, C0/C1, U+2028/2029) affect every package with a JSON-quoted reason; globToRegExp compiles with the s flag (or `[^]*`); every printed path goes through the manifests.ts quoting; affected.test.ts cases for tools/stryker, fixtures/golden, patches \r, and no output line starting with an injected `::`.

Clone removed.
