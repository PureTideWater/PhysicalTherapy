# P4 #96 (ci-mutation-trigger): adversarial review, the payment engine's protection

Reviewer lens: ci-mutation's precedent. Could a realistic change that a money shard's run reads run fewer shards, or
none, under P4? Read only: nothing was pushed, commented, reviewed or edited on GitHub.

- **Tree:** a fresh clone at `50029e64…`, equal to `origin/co-001/ci-mutation-trigger`. Merge base `43565235…`. The
  base branch has since moved to `21fa10df…`. Installed with `pnpm install --frozen-lockfile` under the heavy lock.
- **Diff:** `git diff 43565235… 50029e64…` (29 files).
- **Logs:** `/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/p4/logs`.
- **Harness:** `…/scratchpad/p4/h` holds `scen.sh`, `replay.mts`, the scenario scripts in `s/` and the round outputs.
- **Scenario method:** each scenario was a local commit on the head (or the base). I ran
  `pnpm -s exec tsx tools/stryker/affected.ts --event pull_request --base <start>` on it.

**Verdict: 1 blocking, 1 should, 1 nit.** The classifier is otherwise tight. Every narrowing I aimed at a money
package either chose the right packages or failed closed. The one gap I found is real: a dependency that every shard
loads at run time is invisible to both the mirror rule and the lockfile rule.

## Findings

### PE-B1 (blocking): a `typescript` bump runs no shard, though every shard's Stryker run imports the root's typescript

**What happens.** A bump of the catalog line `typescript: ^6.0.3` to `^6.0.4`, with the lockfile moved to match
(scenario s09), gives different results on the two sides:

| | Head `50029e64…` | Base `43565235…` |
| --- | --- | --- |
| Packages | none | all four |
| Shards | none | all seven |
| Reason | `pnpm-workspace.yaml catalog."typescript" (imported by no closure and no tooling)` | `pnpm-workspace.yaml (mutation tooling, every package)` |

The same bump made in the root manifest (s10, root `devDependencies.typescript` set to `^6.0.4`) also runs nothing at
the head: `package.json devDependencies."typescript" (imported by no closure and no tooling)`. The lockfile rule
does not catch it either: a probe of `lockedPackages` for each closure plus the global imports finds no `typescript`
key. The counts were money 269, ledger 269, pricing 309 and packets 309.

**Why it matters.** Every Stryker run loads that typescript: the canary, and each package's run in each shard.

- `@stryker-mutator/core@10.1.1`'s `dist/src/sandbox/ts-config-preprocessor.js` runs
  `const { default: ts } = await import('typescript')` at `:45` and `:85`. It parses and rewrites the sandbox's
  `tsconfig.json` and its `extends` chain (`tsconfigFile` defaults to `tsconfig.json`; the run is not `inPlace`).
- `typescript` is not in core's `package.json`. Resolved from core's file, it reaches the root's own devDependency,
  `node_modules/.pnpm/typescript@6.0.3/…` (checked with `createRequire(...).resolve('typescript')`).
- A canary run at the head logged two `TSConfigPreprocessor Rewriting file` lines (`canary-debug.log`). The sandbox's
  `tsconfig.base.json` was typescript's own re-serialisation of the file, and every package's `tsconfig.json`
  extends it.
- **The outcome depends on that version.** I replaced the root's `node_modules/typescript` with a stub whose
  `parseConfigFileTextToJson` throws. The canary then fails: rc 1, `Unexpected error occurred while running Stryker
  Error: stub typescript: no parseConfigFileTextToJson` (`canary-stub-ts.log`). With the real link restored it passes
  5 of 5 on Node v24.22.0, pnpm 10.34.8, at the head commit (`canary-real-ts.log`). The clone's `node_modules` was put
  back and removed with the clone.

So under P4 a pull request that only moves typescript gets "no money path changed" and merges. A typescript that
breaks the rewrite (for example a major with another JS API) breaks every shard. That first shows on the next push
run, red for all four packages. This is exactly the merge P4 must not allow.

`docs/runbooks/ci.md:194-197` states the gap as the rule: "nothing when no closure and none of the mutation tooling
imports what moved". Dependabot puts typescript minors and patches in `minor-and-patch`, which usually also moves
`TEST_TOOLING` (that keeps the risk low, but does not remove it). A typescript-only group, a security update or a
person's deliberate bump hits it.

**How it differs from R4.** The design's R4 / Part 7 limit names a *new* root dependency moving a phantom require
through `.pnpm/node_modules`. This one is the root's existing, direct `typescript` entry. The tooling reaches it by an
undeclared dynamic import.

**The scan.** I listed bare imports in the dist of `@stryker-mutator/{core,vitest-runner,instrumenter,util}` that are
not declared in their own `package.json`:

- `typescript` (core): the only one that matters.
- `json-schema` (type-only).
- `svelte` (instrumenter, `.svelte` files only).

**Fix.**
1. Add `typescript` to `TEST_TOOLING`. Both the classifier and the lockfile rule then read a typescript move as global.
2. Add a guard test in `affected.test.ts` or `manifests.test.ts` that scans the installed `TEST_TOOLING` packages'
   `dist` for bare `import()` / `require()` / `from` specifiers. Each one must be declared in that package's
   manifest, in `TEST_TOOLING`, or on a short allowlist with a reason (`json-schema` types, `svelte`). The next
   Stryker or Vitest release that adds one then fails a test instead of narrowing silently.
3. Add the case to the CI-27 fixture: a catalog `typescript` move is global.
4. Correct `ci.md:194-197` and ADR 0066 Part 7's inert list to match.

### PE-S1 (should): #84's two packets shards. What P4 must do at its base merge

#84 (`co-001/packet-day-counts`, head `e3299ea2…`) adds `packets-roles` and `packets-words`, making nine shards. It
also adds `roles.ts` and `roles-words.ts` to packets' MUTATE.

I trial-merged `e3299ea2…` into `50029e64…` in a scratch worktree (local commit `d0380c35…`, never pushed):

- **One conflict:** `docs/runbooks/ci.md`, the shard table (`:515-535`). P4's E7 time column and its seven rows meet
  #84's two new rows on the old time column.
- **Auto-merged cleanly:** `tools/stryker/affected.test.ts` (#84's `:364-365`, nine shards) and
  `tools/stryker/shards.test.ts` (#84's `:23`, `:69`). P4's new `running a shard` describe iterates `readShards()`,
  so it covers the two new shards with no edit.
- **Tests:** `vitest run tools/stryker packages/synth/src/cases` on the merge gave 165 passed and 1 failed. The failure
  is the same test, failing only because the trial worktree's `node_modules` was a symlink: `stryker.ts` correctly
  refuses a core outside the root's own `node_modules`. It is not a merge defect.
- **The runner proof still holds:** #84 leaves `money-ledger` holding money and ledger whole.

**What P4 must do at that merge:**
1. Keep P4's table with all nine rows, adding `packets-roles` and `packets-words` with times read on P4's E7 basis.
   #84's 6 min 47 s and 22 min 42 s are single 2026-10-28 measurements on another basis. When I resolved the trial
   merge, I put them in only as placeholders.
2. Re-measure or re-date the sentence at `ci.md:524-525`: "53.4 runner-minutes for the shards, 54.2 with changes and
   mutation", over the push runs since `stryker/shards.json` last changed. Do the same for "every shard, about 54
   runner-minutes" at `ci.md:194` and ADR 0066 Part 7's savings figures (~294 runner-minutes). `shards.json` changes
   at #84's merge, packets-words alone is ~23 minutes, and a full run grows by about 30 runner-minutes. Every figure
   that counts seven shards is then wrong.
3. Re-run the shard-count assertions and the replay, so `shardsFor([...MUTATION_PACKAGES])` is 9 on the merged tree.

### PE-N1 (nit): the package configs still direct people through the root `stryker` script, which P4 made inert

At the head, deleting `scripts.stryker` from the root manifest affects nothing (s16: `package.json scripts."stryker"
(no mutation step runs it)`). That is correct, since CI runs Stryker by path.

But `stryker/{money,pricing,ledger,packets}.config.mjs:7-8` still say "`pnpm stryker run stryker/<pkg>.config.mjs`".
`ci.md:642` caveats this ("not as CI does"); the configs do not.

**Fix:** point the four comments at `pnpm -s exec tsx tools/stryker/stryker.ts run stryker/<pkg>.config.mjs`.

## What I checked and found sound

- **Where P4 narrows.** Outside the four classified files, P4 only widens `affected()` at the base:
  - `GLOBAL_LOADED`;
  - the global closure with `includeTests`;
  - the holding package's `tsconfig.json`;
  - eight new `GLOBAL_INPUTS` globs.

  The narrowing is confined to `manifests.ts`: the root manifest, the workspace file, workspace manifests and
  `mutation.yml`, plus the pin-only runner proof.
- **The closures at the head** (probe):

  | Package | Files | Also reaches |
  | --- | --- | --- |
  | money | 8 | (none) |
  | ledger | 31 | money |
  | pricing | 97 | contracts, db, money, rules, tools |
  | packets | 145 | contracts, db, money, rules, triage, pricing |

  The global holding packages are `.`, `tools` and `tools/stryker/canary/lib`. The ten closure files that read the
  file system are all listed readers, and none reads a manifest.
- **Scenarios at the head:**

  | Scenario | Change | Result |
  | --- | --- | --- |
  | s01 | catalog `decimal.js` (money's only third-party import) | all four, by the mirror rule |
  | s03 | `packages/money/package.json` `imports` | all four, as owners |
  | s07 | `packages/money/package.json` `sideEffects` | all four |
  | s08 | `packages/triage/package.json` `zod` | packets alone, correct (only packets' closure holds triage) |
  | s06 | `apps/web` renamed to `@tp/money` (it is earlier in workspace order) | pricing, ledger and packets: the capture is seen through the head's closure; money has no bare self-import |
  | s12 | catalog `vitest` | all four, as test tooling |
  | s13 | a broken `exports["./testing"]` in pricing | fails closed: closureProblems, "an import that resolves to no file" |
  | s17 | an equivalents file (`tools/stryker/equivalent/pricing.json`) | all four |
  | s18 | an `upload-artifact` pin | all four (transport excluded from pin-only) |
  | s05, s15 | `setup-node` or `checkout` pin only | `money-ledger` alone |

- **The runner proof for a step-SHA-only change.**
  - Every shard job runs the same steps: no step is conditioned on the shard.
  - Each step a pin can move has a leg the gate checks:
    - Node, Unicode and ICU for setup-node (the runtime check);
    - pnpm for action-setup;
    - `GITHUB_SHA` for checkout.
  - The artifact actions are excluded, and the whole-package check on `RUNNER_PROOF_SHARD` runs at run time.
  - I found no pin-only path that `money-ledger` does not exercise.

  The residual is R2's: a slower step pushing the longest shard past the 30-minute timeout. It is speculative, I
  could show no case, and it widens with #84's 22-minute `packets-words`.
- **The 85% gate and the equivalents.**
  - The `gate.ts` diff only adds things: the runtime, pnpm and commit legs, the shard view's first line, and
    `UNICODE_FILE` moved to `runtime.ts` and re-exported.
  - `THRESHOLD_PERCENT` is still 85.
  - The equivalents rules are unchanged: review, staleness, detected and Unicode.
  - The canary verdict adds `commit` and `pnpm`, and the gate fails a verdict without them.
- **Replay of 13 real merged PRs** (`replay.mts`, trees from git objects): #91, #95, #42, #90, #93, #92, #77, #48,
  #49, #56, #52, #47 and #44, through `affected()` at the head and at the base. The head equals the base for all 13:
  - none: #91, #90, #93, #92, #56, #47;
  - pricing and packets (6 shards): #95, #42;
  - all four (7 shards): #77, #48, #49, #52, #44.

  The inert lines at the head are the expected ones: apps and model-gateway dependencies, billing `exports`,
  `actions:check` and `toolchain:check` scripts, and catalog `playwright-core`. The first six (#92 to #91) merged
  after P4's base, so P4's base merge does not change their verdicts.
- **Not a finding.** A new nested `tsconfig.json` (`packages/pricing/src/tsconfig.json`, s04) selects no package at
  both the head and the base. But in a `vitest.mutation.config.ts` run, Vite honoured `useDefineForClassFields: false`
  neither from a nested tsconfig nor from the package's own, so I could show no effect.

## Housekeeping

- An early run of my scenario script left the scratch clone checked out at the base after s09's base side. The first
  head replay ran on that checkout. I found this, discarded it, and re-ran the replay at `50029e64…`. Every head
  scenario above ran at `50029e64…`.
- The clone and its two scratch worktrees are removed at the end of this review.
