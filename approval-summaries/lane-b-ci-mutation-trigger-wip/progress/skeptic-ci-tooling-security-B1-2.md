# Skeptic 3 of 3: ci-tooling-security B1 (typescript judged inert), PR #96 head 50029e64…

Status: done. Verdict: NOT refuted. Severity: blocking.

## Reproduction (fresh clone /home/user/sk-p4-ci-tooling-security-B1-2 at 50029e64…, removed after)
1. Local commit: catalog `typescript: ^6.0.3` -> `^6.0.2`, lockfile entries 6.0.3 -> 6.0.2.
   `tsx tools/stryker/affected.ts --base 50029e64…` printed all four packages "not affected",
   `read and affecting no package: pnpm-workspace.yaml catalog."typescript" (imported by no closure and no tooling)`,
   `shards: none (no money path changed)`.
2. Why no closure claims it: the only money-package importers (packages/pricing/src/purity.test.ts,
   packages/packets/src/explain/purity.test.ts) are in vitest.mutation.config.ts EXCLUDED, so they are not in any closure.
   TEST_TOOLING (affected.ts:129) is vitest, @vitest/*, @stryker-mutator/*, fast-check, tsx; no typescript.
3. Stryker core 10.1.1 dist/src/sandbox/ts-config-preprocessor.js:45 and :85 do `await import('typescript')`;
   its package.json does not declare typescript; it resolves to the root's node_modules/typescript (6.0.3).
4. Replaced node_modules/typescript with a stub that throws; `tsx tools/stryker/stryker.ts run
   tools/stryker/canary/stryker.config.mjs` exited 1: `ERROR Stryker Unexpected error ... Error: PLANTED typescript loaded`.
   So every shard (canary step first) loads typescript on every run.

## Verdict
Real and reachable: a typescript catalog/root move (incl. a Dependabot catalog bump) passes the required `mutation`
check with no shard run, though every later run loads the new typescript. Fail-open against design §2 rule (b).
Consequence is most likely a loud break on the next money PR rather than a silent wrong verdict, but it is the
classifier saying "none" for an input every step reads, which the PR claims cannot happen. Blocking.

## Refined fix
- Add 'typescript' to TEST_TOOLING with a comment naming @stryker-mutator/core's sandbox/ts-config-preprocessor.js.
- Guard test (tools/stryker): walk the installed dist files of every TEST_TOOLING package and their deps (@stryker-mutator/*,
  vitest, @vitest/*, vite, tsx, fast-check); for each bare static import, dynamic import() or require() of a name not in
  the package's dependencies/optionalDependencies/peerDependencies that resolves from the root, fail unless the name
  matches TEST_TOOLING. Plus a planted-commit test: catalog typescript move => every shard.
- Record under R4 in ADR 0066 Part 7 (undeclared tooling loads) and a CI-matrix case.
