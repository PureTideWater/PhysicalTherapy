/**
 * The mutation canary's case 3 (tools/stryker/canary/expected.json): `@tp/stryker-canary`, a private workspace package
 * whose one function only a test outside it kills, a `tools` test that imports it by name (tools/stryker/canary/
 * linked.test.ts). pnpm links the package into tools/node_modules, and Stryker links node_modules into its sandbox, so
 * that import reaches this file as it is in the checkout, unmutated, unless the run aliases every workspace package to
 * the sandbox's files (vitest.mutation.config.ts, workspaceAliases): without the aliases its mutants have no coverage.
 * So do the golden engine tests' imports of `@tp/pricing` and the packets tests' of `@tp/money`. The package declares no
 * dependency of its own, so pnpm gives it no node_modules under tools/ (tools/test/repository.test.ts); its typecheck
 * finds TypeScript and Node's types through the workspace's.
 */
export function centsOfDollars(dollars: bigint): bigint {
  return dollars * 100n;
}
