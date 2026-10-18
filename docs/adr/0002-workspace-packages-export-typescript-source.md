# 0002. Workspace packages export TypeScript source; the consumers compile it

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 15 (repository, stack)

## Context

The monorepo has thirteen `@tp/*` packages consumed by the web app, the worker, the CDK app, the tools and
the tests. Each package could build its own `dist/` (with declarations and project references), or every
consumer could compile the source directly.

## Decision

Every package's `package.json` has `"exports": { ".": "./src/index.ts" }` and no build step. Each consumer
compiles what it imports:

- **apps/web**: Next.js compiles the packages listed in `transpilePackages`.
- **apps/worker**: esbuild bundles the worker and every package it imports into `dist/main.js` for the image;
  `tsx` runs it in development.
- **tools, infra and the root scripts**: `tsx`.
- **Tests**: Vitest.
- **Type checking**: each package runs `tsc --noEmit` against its own `tsconfig.json`, which extends
  `tsconfig.base.json`; imported packages are checked from source under the same strict settings.

Workspace dependencies between packages are declared up front with `workspace:*` (for example pricing on
money and rules, ledger on money and db, packets on money, pricing and triage), and shared tool versions come
from the pnpm catalog in `pnpm-workspace.yaml`. Pure packages keep their dependency lists free of database
code: `@tp/rules` and `@tp/pricing` do not depend on `@tp/db`, so the engine cannot import it even
transitively.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Per-package `tsc` builds with project references | A build graph to keep in order, stale `dist/` in development, and declaration maps to debug through; no benefit while nothing is published to a registry |
| A task runner with remote caching | Another tool to secure and evidence; the whole workspace type-checks in seconds today |

## Consequences

- Relative imports inside packages are extensionless (Bundler resolution); no file is runnable by plain `node`
  without a compiler. The worker image runs the esbuild bundle only.
- A package that ever needs publishing outside the repository gets its own build then.
- `pnpm typecheck` checks some files more than once (each consumer checks its imports); acceptable at this size.
