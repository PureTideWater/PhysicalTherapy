# Skeptic 1 of 3: ci-tooling-security N1 (#96, head 50029e64…)

Status: done. Verdict: NOT refuted (real), severity nit.

## Reproduction
- Fresh clone at 50029e64… (removed after). Probe imported tools/stryker/stryker.ts strykerBin() via the root tsx shim.
- Synthetic root: no node_modules/@stryker-mutator/core link; core only at node_modules/.pnpm/core@10/... with the
  hoisted link node_modules/.pnpm/node_modules/@stryker-mutator/core (pnpm's default hoist).
- Without NODE_PATH pointing there: REFUSED ("is not installed in <root>/node_modules").
- With NODE_PATH=<root>/node_modules/.pnpm/node_modules (exactly what node_modules/.bin/tsx exports): ACCEPTED,
  returns the hoisted core's bin. The `outside(modules, manifestPath)` test passes because require.resolve returns
  the realpath, which lies under <root>/node_modules/.pnpm for the direct and hoisted install alike.
- Reachable in the real tree: pnpm-lock.yaml has @stryker-mutator/vitest-runner peer-depending on core 10.1.1, so
  dropping the root's direct devDependency would still auto-install core and hoist it into .pnpm/node_modules.
- Tests: stryker.test.ts covers only the parent-directory case (line 67-68), no NODE_PATH case.

## Why only nit
The core supplied is still the frozen-lockfile install (same version and integrity), so no untrusted code runs and
no shard is skipped; the defect is that the doc comment ("one ... NODE_PATH supplies is refused") overclaims.

## Refined fix
Require the root's own link: lstat <root>/node_modules/@stryker-mutator/core must exist and its realpath must equal
dirname(manifestPath); otherwise refuse with the same "not installed in <root>/node_modules" message. (resolve
with `paths: [root]` does not help: Node still appends NODE_PATH's globalPaths.) Add a test that runs the probe in
a child process with NODE_PATH=<root>/node_modules/.pnpm/node_modules and a hoisted-only core, expecting refusal.
