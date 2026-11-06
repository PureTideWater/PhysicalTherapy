# Fix check G1, round 1 (B1/PE-B1, N1, N2, N3)

Started 2026-11-04. Target WIP head 30efef6d...

## Setup
- Clone /home/user/fx-p4-G1-1 at 30efef6d... (= origin/co-001/wip-ci-mutation-trigger); install --frozen-lockfile exit 0 under the heavy lock.
- Logs: scratchpad/p4/logs/fix/G1-1/.

## Checks
- Unit job coverage: vitest.config.ts unit project includes `{apps,packages,infra,tools}/**/*.test.{ts,tsx}`; ci.yml unit job runs `pnpm test` (= `vitest run --project unit --coverage`). So affected.test.ts's guard runs in CI's unit job. PASS.
- N3 runtime.ts CLI at head: pinned + HEAD exit 0; --pnpm 10.35.0 exit 1; --commit HEAD~1 exit 1; 12-hex commit exit 1; --pnpm= (empty) exit 1; unknown flag exit 1. No flags exits 0 (flags optional; workflows.test.ts holds both jobs to the full RUNTIME_CHECK line). PASS.
- N3 workflow: gate's check is after install, before download-artifact, under run=='true'; actions/checkout default ref = GITHUB_SHA for push, pull_request (merge ref), schedule, dispatch. PASS.
- Head suite (tools/stryker, tools/test): 35 files, 492/492 pass. typecheck exit 0.
- Nothing loosened: 50029e64's five changed test files run against head sources (with packages/synth): 640/642; the 2 failures are workflows.test.ts asserting the old exact runtime.ts run line (and the Dependabot-rewrite test that reruns that file), i.e. the intended N2/N3 change. Head asserts the new line exactly. PASS.
- B1 guard, planted undeclared imports (new files only; node_modules/.pnpm files are hardlinks to the store, so none edited): `import 'pg'` (.js), `require("pg")` (.cjs), `export * from 'react'` (.mjs) in @stryker-mutator/core, `await import('pg')` in vitest: all named, test fails. Harmless: unresolvable name, a held name (zod), typescript: not named. PASS.
- B1 guard misses (nit): a line starting with a block comment then code (`/*! x */ require('pg')`, `/* a */ import 'pg'`) is skipped; a template-literal require(`pg`) is not read; files under examples/test dirs are skipped by design. Scan of installed tooling: 0 real lines of the first shape today.
- B1 red recheck at head (should): with only 'typescript' removed from TEST_TOOLING, the guard stays green, the lockfile-move test's behavior assertion stays green, and manifests.test.ts still gives all four; only `toContain('typescript')` and the reason-string check fail. Cause: affected.ts's TEST_TOOLING doc comment contains the text import('typescript'), which the import graph reads as an import by importer `tools`, so typescript is in the global import closure (verified: with that comment text removed, typescript drops out of lockedPackages without TEST_TOOLING). Fail-safe today, but the fix's behavior rests on a comment and the guard cannot see a TEST_TOOLING regression.
- N1: real install resolves the direct link; with stryker.ts as at 50029e64 the new child-Node NODE_PATH test fails (1 failed). PASS.
- N2/N3 red recheck: runtime.ts + mutation.yml as at 608d96df: 3 failed (pnpm leg, commit, workflow run lines). PASS.
- Docs: ADR N51, N53-N55, ci.md and test-matrix CI-29 match the code. PASS.
- Clone removed.
