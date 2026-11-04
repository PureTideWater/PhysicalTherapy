# Fix check, round 2, group G1 (B1/PE-B1 guard, N1, N2, N3)

Target: WIP ref co-001/wip-ci-mutation-trigger, head expected 05d3291b…. Clone /home/user/fx-p4-G1-2 (read only).

## Checks
- [started 2026-11-04] clone and install
- Clone at 05d3291b… (= origin WIP ref); co-001/ci-mutation-trigger still 50029e64…. Install --frozen-lockfile exit 0.
- Guard in CI: the guard is in tools/stryker/affected.test.ts; `pnpm test` = `vitest run --project unit`, whose include is
  `{apps,packages,infra,tools}/**/*.test.{ts,tsx}`, and ci.yml's unit job (ubuntu-26.04) runs `pnpm test`. No skipIf on it. PASS.
- Head suite tools/stryker + tools/test: 35 files, 495/495 pass (head-suite.log). PASS.
- B1 guard, planted (new files in the clone's node_modules, removed after): core dist `require('pg')`, core bin
  `import ... from '@aws-sdk/client-s3'`, vite `/*! license */ export * from 'pg'`, vite ``import(`pg-protocol`)`` each
  named (plant1.log, plant2.log); harmless variants not named: `// require('pg')`, ` * require('pg')`, `node:fs`, the
  declared `@stryker-mutator/api`. vite's `export * from 'zod'` and ``import(`semver`)`` not named: zod@4.6.7 and
  semver@7.8.5 are in the tooling lockfile closure (checked with lockedPackages), so held by design. PASS.
- B1 red recheck: TEST_TOOLING without typescript at head: 3 failed (the guard names core's ts-config-preprocessor.js -> typescript, the lockfile move, the catalog case) (B1-red-recheck.log); restored, status clean. ADR N51 / Part 7 limit and TEST_TOOLING comment match code. PASS.
- N1: synthetic hoisted-only core (root link moved away, a link under node_modules/.pnpm/node_modules, NODE_PATH set): head REFUSED ('not ... as the root's own dependency'), 50029e64's stryker.ts OK (accepted) -> gap closed. Normal install OK; root link absent, no hoisted copy: refused. Restored. PASS.
- N2/N3 CLI probes at head (runtime.ts): pinned pnpm + HEAD -> exit 0; pnpm 9.15.0, empty, v-prefixed -> exit 1 named;
  commit other, short, empty, uppercase -> exit 1 named; unknown flag -> parseArgs throws, exit 1. No flags at all ->
  exit 0 without either leg (flags optional; the run line is held by workflows.test.ts RUNTIME_CHECK in both jobs, and
  every non-shard job's first tsx step must be it). PASS (see nit on optional flags).
- Red rechecks (N-red-recheck.log; this one run was not under the heavy lock, by mistake; short vitest runs):
  N3 (runtime.ts + mutation.yml as at cc682f20): 3 failed; N2+N3 (as at 608d96df): 4 failed; N1 (stryker.ts as at
  50029e64): the hoisted-core test fails. Restored, status clean. PASS.
- Nothing loosened: 50029e64's 33 test files of tools/stryker and tools/test over head source: 455/457 pass; the 2
  failures are the base's exact `changes` run line `pnpm -s exec tsx tools/stryker/runtime.ts` (now with --pnpm and
  --commit) and the Dependabot-rewrite replay of the same assertion: the intended tightening, not a loosening
  (base-tests-at-head.log). Restored, status clean. PASS.
- Docs: ADR 0066 Part 7 (Stryker by path, runtime bullets, N51, N53-N55, the hoisting-limit note), ci.md lines
  466-468 and 507-513, test-matrix CI-29 and matrix.ts match the code. PASS.
- Nits: (1) runtime.ts's --pnpm and --commit are optional, so the run without them still exits 0 with neither leg;
  held only by workflows.test.ts. (2) ci.md's troubleshooting table has no row for "The checkout is not the commit
  tested", "The runtime is not the pinned one: pnpm --version prints ...", or strykerBin's "not installed ... as the
  root's own dependency".
- Remote refs unchanged: WIP 05d3291b…, co-001/ci-mutation-trigger 50029e64…. Nothing pushed. Clone removed.
## Result: resolved, nothing loosened; 0 blocking, 0 should, 2 nits.
