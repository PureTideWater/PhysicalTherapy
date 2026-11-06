# Review of #96 (P4, ci-mutation-trigger): CI tooling and security

Reviewer lens: CI tooling and security (.claude/agents/security-reviewer.md where it applies, plus the supply chain).
Reviewed head: 50029e64… (equal to origin/co-001/ci-mutation-trigger), merge base 43565235…. I worked in a fresh
clone at /home/user/rv-p4-ci-tooling-security and installed it with `pnpm install --frozen-lockfile`. The clone is
now removed. My experiment commits were local only and were reset. Nothing was pushed, commented or reviewed on
GitHub. Logs are in scratchpad/p4/logs/sec/.

Totals: **1 blocking, 2 should, 3 nit.**

## Findings

### B1 (blocking). A `typescript` change is judged inert, but every shard's Stryker loads `typescript`

- **Where:** `tools/stryker/affected.ts:129` (`TEST_TOOLING`), and the mirror rule in `tools/stryker/manifests.ts:270-276`.
  It applies to the root `devDependencies.typescript` and to `pnpm-workspace.yaml` `catalog.typescript`.
- **What goes wrong:** Stryker core 10.1.1's `dist/src/sandbox/ts-config-preprocessor.js:45,85` runs
  `await import('typescript')` on every run that is not in place. It does this to rewrite the sandbox's
  tsconfig.json: `extends`, `references`, `include`, `exclude` and `files`. Core does not declare `typescript`, so Node
  finds the root's own install: `node_modules/.pnpm/typescript@6.0.3/…`. The lockfile rule does not see it either,
  because no snapshot key of the tooling carries typescript. A typescript bump (for example to 7.x, whose package
  changes the JS API) is therefore called "none". The PR merges green and breaks every shard afterwards. A subtler
  bump would change how the sandbox tsconfig is rewritten, which is what esbuild and Vite then read.
- **Evidence:**
  1. End to end: a local commit on 50029e64 changed `catalog.typescript` to `^6.0.2` and moved the lockfile from
     6.0.3 to 6.0.2. Then `affected.ts --event pull_request --base 50029e64` printed:
     `read and affecting no package: pnpm-workspace.yaml catalog."typescript" (imported by no closure and no tooling)` /
     `shards: none (no money path changed)` (x-typescript.txt).
  2. A harness over every root devDependency and every catalog line gave `[]` (inert) for root `typescript` and
     catalog `typescript` (h1.mts).
  3. Loading proof: I put a stub `node_modules/typescript` in place whose main file throws, then ran
     `pnpm -s exec tsx tools/stryker/stryker.ts run tools/stryker/canary/stryker.config.mjs`. The run exited 1 with
     `ERROR Stryker Unexpected error occurred while running Stryker Error: PLANTED typescript loaded by Stryker core`
     (x-planted-ts.txt). The real install was restored afterwards.
  4. Scope: I scanned the dists of `@stryker-mutator/{core,instrumenter,vitest-runner}`, vitest, vite,
     `@vitest/coverage-v8` and tsx for undeclared bare imports that resolve from the checkout (phantom.cjs). The only
     real one is core → `typescript`.
- **Why this is blocking:** the design's own soundness rule (§2) says a row is inert only when the frozen install
  refuses it, or when "no step and no closure file reads it". A step reads `typescript` here. This is a concrete,
  present instance of R4's "hoisting limit", which the design treats as hypothetical. Design :652 lists catalog
  `eslint`, `typescript-eslint` and `playwright-core` as inert, but not `typescript`, so this was never ruled on.
- **Fix:** add `typescript` to `TEST_TOOLING`, with a comment naming ts-config-preprocessor.js. Add a guard test that
  fails when an installed tooling package (`@stryker-mutator/*`, vitest, vite) holds a bare `import()` or `require()`
  of a name it does not declare that resolves from the root. That would catch the next one. Record the instance under
  R4 in ADR 0066 Part 7.

### S1 (should). Paths with control characters: raw newlines in the log, and global globs that skip them

- **Where:** `tools/stryker/affected.ts:722-726` (reasons print `${file}` raw) and `globToRegExp` (`:275-288`).
  `globToRegExp` writes a trailing `**` as `.*`, which does not match `\n`. A `*` is written as `[^/]*`, which does.
- **What goes wrong:**
  - A changed path holding a newline starts a workflow command in the changes job's log and summary.
  - A path under a global glob that holds a newline affects no package. This hits `tools/stryker/**` and `stryker/**`,
    and also the PR's new `patches/**` and `.github/actions/**`.
  - P4 quotes only manifest paths and keys (6bfa5f6c), so the invariant it states is half applied.
- **Evidence:** one local commit added two files: `packages/money/src/a⏎::warning title=forged::injected by a path.ts`
  and `tools/stryker/z⏎.json`. affected.ts then printed `money: affected by packages/money/src/a` and, on its own line,
  `::warning title=forged::injected by a path.ts (imported)`. Every other package was "not affected", so the
  tools/stryker file reached none (x-newline.txt). A harness call with `tools/stryker/a⏎…ts` gave no reason at all
  (h2.mts). The printing and globToRegExp come from the base, but this PR adds globs and extends the
  quoting claim.
- **Fix:** in `affected()` (or `changeSince`), make any changed path holding a control character affect every
  package, and print it JSON-quoted, as `classifyManifests` already does. Compile globs with the `s` flag (or `[^]*`)
  so `**` matches every character.

### S2 (should). Tests miss several of the fail-closed rules: mutated code stays green

Each mutant below was applied to the PR's code and run against the relevant test files. I first used manifests,
stryker, runtime, gate and verdict, plus affected.test.ts for affected.ts mutants. I then reran the workflow-rule
survivors and M01, M10 and M16 with affected.test.ts, workflows.test.ts and shards.test.ts added. Results are in
mut-results.txt and mut2-results.txt.

- **Survived, so a regression would pass CI:**
  - M01–M05: removing `pnpm:devPreinstall`, `preprepare`, `postprepare`, `prepublish` or `install` from
    `LIFECYCLE_SCRIPTS` (manifests.ts:44). Only `postinstall`, `prepare` and `prepublishOnly` are exercised. A dropped
    name would make an install script inert.
  - M10: removing U+2028/2029 from `hasControlCharacter`.
  - M16: deleting the "named file added or deleted → global" branch.
  - M12: dropping the scalar-source comparison from the pin-only test (manifests.ts:502).
  - M13: dropping the `!whole` guard on the runner-proof shard (manifests.ts:507). Today only shards.json's data
    holds this; the branch itself is untested.
  - Also survived, against the first set of tests only: M08 (BOM), M09 (directive), M11 (MAX_SPECIFIER), M14 (YAML
    warnings) and M15 (merge key; the alias check covers the case under test). M32 swaps changeSince's null-before
    rule; it fails toward global for modified files.
- **Killed:**
  - M06 (`bun`)
  - M07 (transport exclusion, killed by affected.test.ts)
  - M17–M29: path control character, both readings of `packages`, the holding kind, loadedName, the three Stryker
    path guards, gitEnvironment's two filters, the headCommit `..` check and commondir, the gate's two commit checks
  - M33 and M34
- **Fix:** turn the lifecycle list into a table test, one case per name, root and workspace manifest each. Add cases
  for U+2028, a named file added or deleted, a pin move plus re-quoting of the same `uses` (must be global), a
  synthetic shard set where the proof shard does not hold its packages whole, a BOM, a `%YAML` directive and a 257+
  character specifier.

### N1 (nit). The NODE_PATH and "root's own install" claim is stronger than the check

`stryker.ts` refuses a core outside `<root>/node_modules`. However, the tsx shim's NODE_PATH includes
`<root>/node_modules/.pnpm/node_modules`, which is inside that directory. So a core reached only through hoisting would
be accepted. I confirmed this by reading `node_modules/.bin/tsx:13`. It is harmless, because removing the root's
direct dependency is tooling-global anyway. Either word the claim as "under the root's node_modules", or require the
resolved path's parent link to be `<root>/node_modules/@stryker-mutator/core`. No test sets NODE_PATH; only the
parent-directory case is tested.

### N2 (nit). The pnpm leg is reported by the process itself

`pnpmOfUserAgent` reads `npm_config_user_agent`. A `user-agent` setting in `.npmrc` or `pnpm-workspace.yaml` sets this
value, and pnpm 10 switches itself to the `packageManager` version in any case. So the leg proves little beyond
"packageManager was honoured". Both setting files are global, so no inert change can spoof it. Consider reading the
version from `npm_execpath`'s package.json instead.

### N3 (nit). The gate job's own runtime is never checked

Only the changes job runs `runtime.ts`. Shards are held to the pins through their canary verdicts. The `mutation`
(gate) job installs Node and pnpm, and a pin-only move of its setup steps is "proved" by money-ledger, which never
exercises that job's setup. The gate's logic does not rest on Unicode data, so this is low risk. One
`runtime.ts` step before the gate would close it.

## Checked and found sound

- **Lifecycle, overrides, settings, catalogs, aliases:** these changes come out global:
  - `pnpm` and `packageManager`
  - unknown root and workspace keys (`nodeLinker`, hoisting, `configDependencies` and the like)
  - `overrides`, `onlyBuiltDependencies`, `patchedDependencies`
  - `dependenciesMeta` in any manifest, and lifecycle scripts in any manifest, `other` kind included
  - root `workspace:`, `link:` and `file:` specifiers, and runtime names
  - `npm:` aliases whose name is tooling

  Catalog and dependency entries follow the mirror rule and are backed by the frozen lockfile. Of everything the
  harness found inert in the root and the catalog, only `typescript` is loaded (B1).
- **YAML tricks:** anchors and aliases, tags, directives, BOMs, duplicate keys, multiple documents and a different
  reading of `packages` by the tooling all go global. A source-text comparison stops parser disagreement from hiding
  a change in global keys or in the workflow.
- **Duplicate and capturing names:** vitest's aliases (first exact match, in workspace order) and
  `resolveWorkspaceImport` (stable sort by name length) choose the same package. A capture therefore shows up in the
  head closures, and the manifest becomes a closure manifest.
- **Symlinks and type changes:** `git show` returns the link target, which is not JSON or YAML, so the change goes
  global. Renames come out as a deletion plus an addition under `--no-renames`.
- **Pin-only rule:** it needs the same action and path on both sides and lowercase 40-hex SHAs. Artifact actions are
  excluded (tested). Job-level `uses`, `docker://` and local refs go global.
- **stryker.ts:** the core is resolved from the root, realpath'd and kept inside `<root>/node_modules`, and the bin is
  kept inside the package. A planted parent-directory core is refused (tested; the M21–M23 mutants were killed). The
  spawn uses `process.execPath`.
- **gitEnvironment:** under `pnpm exec`, PATH gets `./node_modules/.bin` and `<root>/node_modules/.bin`, and both are
  stripped. Every `git` spawn in the changes job goes through it.
- **Commit pin:** `headCommit` reads `.git` without running git, refuses `..` in refs and handles worktrees and
  packed-refs. The gate holds every shard to GITHUB_SHA on Actions and fails a missing or non-hex SHA.
- **mutation.yml:**
  - `permissions: contents: read`, and `persist-credentials: false` on every checkout
  - `run:` lines take expressions only through `env`, and are allowlisted by workflows.test.ts
  - the gate validates the outputs against a name regex before using them
  - the guard scan of spawns and manifest readers runs on the real tree; it is skipped only for CI_TREE copies
- **Runtime check:** it runs in the changes job after the install and before the decision. Its tests cover each leg.
