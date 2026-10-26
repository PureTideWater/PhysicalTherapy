# P4: a narrower mutation trigger for manifest and pin-only changes (`co-001/ci-mutation-trigger`)

Lane B, after ci-deps (§3.2) and ci-browser (§3.3) merge; cut from `claude/build-platform` then. Written against
6ddd587 plus both designs, and against `co-001/ci-deps` at 19e3d98e (2026-10-26, still moving: its manifests have the
gates but not yet the bumps). Every cite is at 6ddd587 unless marked; the builders re-read them at the cut. ADR 0066
**Part 7**; test-matrix and synth cases **CI-27 to CI-29** (all three used). No migration: it changes `tools/stryker`,
one step of `mutation.yml`, tests and documents. It is ci-mutation's area (§3.4), and it keeps that design's rule: a
pull request runs every shard of each affected package or none of them. Folded with its review on 2026-10-26 (§13).

Rulings it rests on: the co-founder's 2026-10-26 ~00:20 UTC ruling (every choice takes the recommended option, for
security the safer one); Q3 (engineering-only choices inside a ruled design are pre-approved, each listed in §10).
P4 itself was proposed in §3.2.6 as an engineering item.

## 1. Goal and acceptance

Goal: a pull request runs mutation only on what can change a shard's result. Today `tools/stryker/affected.ts:111-120`
treats any edit of the root `package.json`, `pnpm-workspace.yaml` or `mutation.yml` as touching every package, and
`affected.ts:618` treats any edit of a closure's `package.json` (`packages/*/package.json`, `tools/package.json`) as
touching that package. So a new root or package script, a catalog line no money code imports, a release-age exclude,
or a Dependabot actions bump each runs all six shards: 31-36 runner-minutes (push runs 40223130477 and 40229005837;
#40's run 40223436319). P4 reads those files field by field, on both sides of the change. It fails closed: any field
it does not list as inert, any file it cannot parse, and any file it has no text for keeps today's whole-file rule.

Acceptance (measurable):
1. The 35 pull requests into the build branch so far (#1-#49), replayed through the changed rule (§9): 16 full runs
   become 9. Seven pull requests run less: #2, #3, #4, #6, #25, #31 and #43, about 173 runner-minutes at their final
   heads. No package that today's rule affects through a closure file, data file or lockfile move is lost, on any
   of the 35. The two actions bumps (#37, #40) stay full: #37 moved tag refs, which ci-deps' check-action-pins now
   refuses, and #40 moved the artifact actions (§2).
2. A Dependabot actions pull request that changes only step `uses:` refs from one full SHA to another (same
   owner, repository and path), and their comments, in `mutation.yml`, and moves neither `actions/upload-artifact`
   nor `actions/download-artifact`, runs `money-ledger` alone, which covers money and ledger in full. That shard's
   canary and the gate prove the new pins: Node, Unicode, ICU and pnpm must equal the pinned ones (§3.3).
3. Everything §2 lists as global still affects all four packages: `packageManager`, `engines`, `type`, `pnpm`, an
   install lifecycle script in **any** workspace manifest, a test-tooling specifier; the workspace's `packages`,
   `onlyBuiltDependencies`, `overrides`, `patchedDependencies`, any YAML anchor, alias or merge key, and every key not
   listed; in `mutation.yml`, a job-level `uses:`, a non-SHA ref, an artifact-action ref, or any other edit; a new
   `.npmrc`, `.pnpmfile.*` or `patches/**` file. A closure manifest's unlisted field affects that manifest's packages.
4. `pnpm test` (the ★ narrowing cases failing first on their assertions, §5), `pnpm lint`, `pnpm typecheck` and CI
   green. P4's own pull request edits `tools/stryker/**`, so it runs all six shards, the live proof of §3.2 and §3.3:
   per package, its mutant count and each mutant's status equal those of the base's last push run (the gate's
   per-package summary and `reports/mutation/*.json`), not only green.

## 2. What a shard reads from these files: every field, and why

A shard runs these steps in order (`mutation.yml:81-98`): checkout; pnpm/action-setup, which installs the pnpm that
`packageManager` names; setup-node with `node-version: 24.22.0`; `pnpm install --frozen-lockfile`; the canary; the shard
(`shards.ts:41` spawns `pnpm stryker run …`); and upload. The gate job (`:168-186`) checks out, installs, and downloads
every shard's artifact (`pattern: mutation-*`, `merge-multiple: true`). pnpm 10.34.8, the version ci-deps pins, is read
below from its own `dist/pnpm.cjs`. On a frozen install it does four things:
- It refuses a lockfile whose recorded settings differ from the configuration: catalogs, overrides,
  patchedDependencies, packageExtensions, the pnpmfile checksum and ignoredOptionalDependencies
  (`LOCKFILE_CONFIG_MISMATCH`, `:175231-175249`).
- It refuses a lockfile that any manifest's specifiers do not satisfy (`OUTDATED_LOCKFILE`, `:175441-175453`).
- It installs without resolving. `minimumReleaseAge` and `trustPolicy` are read only on the resolution path
  (`:169491-169495`, `:175724-175728`).
- It runs `preinstall`, `install`, `postinstall`, `preprepare`, `prepare` and `postprepare` for **every workspace
  project** it installs (`projectsToBeBuilt`, `:167203`, `:175971`), not only the root's, and the root's
  `pnpm:devPreinstall` (`:175212`).

`pnpm <script>` also runs `pre<script>` and `post<script>` (`enable-pre-post-scripts` defaults to true, `:18906`;
`:204854-204858`). `pnpm exec` exports the selected project's `name` as `PNPM_PACKAGE_NAME` (`:205081`). When two
packages link the same bin name, direct dependencies win over hoisted ones, then the package whose own name is the
bin's, then the later package name in `localeCompare` order (`:103318-103365`).

So a specifier on its own cannot change what is installed: either the lockfile moves with it, and the lockfile rule
(§3.4.1, `affected.ts:623-637`) decides, or every install fails, in ci.yml's required jobs too. The tables keep a
second, specifier-level rule anyway (the "mirror" rule), which costs no run in practice (§10, C3).

Every field is compared order-sensitively: the parsed value of each side, serialised without sorting keys
(`JSON.parse` and `yaml` keep key order). Order matters in `exports` and `imports` (condition order) and in
`overrides` (overlapping selectors), so reordering a global field is a change. Fields judged per entry (`scripts`,
dependency maps, catalogs) are compared entry by entry, so reordering them alone changes nothing.

**Root `package.json`** (keys at 6ddd587 `:2-55`, and after ci-deps):

| Field | Can it change a shard? | P4 |
|---|---|---|
| `packageManager` | Yes: action-setup installs it, and it runs the install and every `pnpm` step | global |
| `engines`, `devEngines` | `engines` changes no run while engine-strict is off, but one `.npmrc` line turns it into a failure. pnpm 10 reads `devEngines.runtime` | global (fail closed; neither is ever bumped) |
| `type` | Yes: it decides ESM or CJS for root files outside any workspace package (`stryker/*.mjs` excepted), such as `vitest.mutation.config.ts`, which tsx and Vite load | global |
| `pnpm` (overrides, patchedDependencies, onlyBuiltDependencies and the rest) | Resolution or execution | global |
| `scripts.{pnpm:devPreinstall, preinstall, install, postinstall, prepublish, preprepare, prepare, postprepare}` | Yes: they run on every install | global |
| `scripts.stryker`, `prestryker`, `poststryker` | Yes today (`mutation.yml:92`, `shards.ts:41`). After §3.2, no: the tooling runs Stryker by path and invokes no root script | inert after §3.2 |
| every other script (`test`, `test:golden`, `typecheck`, `lint`, the release, db and check scripts) | No: no mutation step runs one (each `run:` is held to an allowlist of whole commands) and no closure file spawns a process or reads the manifest (§5, the guard tests) | inert, held by those tests |
| `devDependencies`, `dependencies`, `optionalDependencies`, per entry | Only through the lockfile (above) | mirror rule: `TEST_TOOLING` (`:108`) or a name the global entry points import (yaml, vitest, `@stryker-mutator/api`) → global; a name a package's closure imports → that package; else inert |
| `name` | `pnpm exec` exports it as `PNPM_PACKAGE_NAME` (`:205081`) to every tsx step | global |
| `private`, and any key not listed (`exports`, `imports`, `workspaces`, `resolutions`, `peerDependencies`, …) | Unknown or rare | global (fail closed) |

**A closure's own `package.json`** (`packages/{money,ledger,pricing,packets,contracts,db,rules,…}/package.json`,
`tools/package.json`: the `manifests` of `closureOf`, `affected.ts:403-415`). Its "owners" are the packages whose
closure lists it (today's reason line, `:618`).

| Field | Can it change a shard? | P4 |
|---|---|---|
| install lifecycle scripts (the list above, without `pnpm:devPreinstall`) | Yes: every frozen install runs them (above) | global |
| every other script | No: as for the root's (the same guard tests; no step runs a package script) | inert |
| `dependencies`, `devDependencies`, `optionalDependencies`, per entry | Only through the lockfile, and only for imports from that package's own files (pnpm links each project's declared dependencies into its own `node_modules`) | a `workspace:` specifier on either side → its owners; `TEST_TOOLING` or a global-entry import → global; a name that package's files import in some closure (`Closure.imports` keyed by that directory, `:378-391`) → those closures' packages; else inert |
| `name`, `exports`, `imports`, `type`, `main`, and every key not listed | Resolution of the package's own imports, module format | its owners (today's rule, kept for these) |

**Every other workspace manifest** (`apps/*`, packages in no closure): today it affects nothing. P4 reads it when it
changes, and an added, removed or changed install lifecycle script is global, since every shard's install runs it.
Nothing else in it is read by a shard.

**`pnpm-workspace.yaml`** (6ddd587 `:1-29`; ci-deps adds `:31-43` and `overrides`; ci-browser adds a catalog line):

| Key | Can it change a shard? | P4 |
|---|---|---|
| `packages` | Yes: the workspace aliases and the closures come from it (`tools/stryker/workspace.ts:36-59`) | global |
| `catalog`, `catalogs.<name>`, per entry | Only through the lockfile (catalogs are a locked setting, `:175234`) | mirror rule, as for devDependencies |
| `onlyBuiltDependencies`, `neverBuiltDependencies`, `ignoredBuiltDependencies` | Yes: which install scripts run (esbuild's binary, which tsx and Vite use) | global |
| `overrides`, `patchedDependencies`, `packageExtensions`, `ignoredOptionalDependencies` | Resolution; locked settings | global (the task's list; also fail closed) |
| `minimumReleaseAge`, `minimumReleaseAgeExclude`, `trustPolicy`, `trustPolicyExclude`, `trustPolicyIgnoreAfter` | No: a frozen install never resolves, so pnpm 10 never reads them there. pnpm 11.3's `trustLockfile` could fail an install, but never change a score, and moving to pnpm 11 is a `packageManager` change, which is global | inert |
| any anchor, alias or `<<` merge key, on either side | pnpm reads the file with js-yaml, which applies merge keys; the `yaml` package's YAML 1.2 default does not, so the two could disagree | global (fail closed) |
| every other key (`nodeLinker`, hoisting, `supportedArchitectures`, `injectWorkspacePackages`, …) | Layout or execution | global (fail closed) |

**`mutation.yml`**: the parsed document is compared, so comments and formatting are never a change. The change is
**pin-only** when the two sides are equal after this one substitution, and only then: a value at
`jobs.<id>.steps[<i>].uses` (never a job-level `jobs.<id>.uses`, a reusable workflow that replaces a whole job) of the
form `<owner>/<repo>[/<path>]@<40 lowercase hex>` on **both** sides, with the same owner, repository and path, has its
SHA removed. `actions/upload-artifact` and `actions/download-artifact` are never substituted. So `docker://`, `./local`,
a tag or branch ref (`@v7`, `@main`), a changed path, a job-level ref and an artifact-action move are all global, as is
any other difference (`runs-on`, `with:`, `run:`, a new or reordered step). The pattern is ci-deps' own `PIN`
(`ci-deps:tools/check-action-pins/workflows.ts:14`), which ci.yml's `Action pins` step (`ci-deps:ci.yml:80-86`,
`pnpm actions:check`, ADR 0066 Part 2) applies to every workflow and which verifies a new SHA against its tag on
GitHub; P1 (Part 5) adds its age floor. P4 does not rely on that check to stay sound: a ref it would not vouch for is
global here anyway.

A pin can change the runner, and nothing else: the checkout, the pnpm and Node installed. So a pin-only change runs
`money-ledger`, the one shard that holds whole packages (`stryker/shards.json`: money and ledger in full). Its canary,
its runtime check (§3.3) and the gate prove the new pins on the runner. The artifact transport is the exception: with
one shard the gate downloads and merges one artifact, never several, so a regression in merging several
(`merge-multiple: true`) would pass there and fail every later pricing or packets pull request. A move of either
artifact action is therefore global and runs all six shards. Dependabot's weekly `actions` group
(`ci-deps:.github/dependabot.yml:84-86`) carries those two only in the weeks they move.

**Added to `GLOBAL_INPUTS`** (none exists today; each would change the install unseen): `.npmrc` (pnpm reads the
workspace root's), `.pnpmfile.*` (install hooks, though checksummed in the lockfile), `patches/**` (ci-mutation deleted
it; a patch's content is hashed in the lockfile). Unchanged: `tsconfig.json` and `tsconfig.base.json`, which tsx and
Vite read, and every closure's `tsconfig.json`, which stay whole-file.

**Soundness, and its limit.** Every way these files reach a shard is a row above. A row is inert only when (a) the
frozen install refuses any lockfile the change does not match, or (b) no step and no closure file reads it, and a
guard test holds (b). For (a), the claim is exactly as strong as the lockfile rule (§3.4.1), the same rule every
non-root manifest already relies on today, and no stronger: when the lockfile moves with a specifier, the installed
tree changes. pnpm hoists every package into `node_modules/.pnpm/node_modules` (`hoist-pattern: *`), so a new root
dependency can change the version an imported third-party package reaches through an undeclared (phantom) require,
which the lockfile rule (it follows declared dependencies only) does not see. Today the root manifest's whole-file
rule happens to cover that; after P4 it is the lockfile rule's limit, named in Part 7's revisit list (§6). A pin-only
change is not claimed inert. It is proved on the runner, and the first push run measures every package with the
same pins.

## 3. What changes

### 3.1 `tools/stryker/affected.ts` and the new `tools/stryker/manifests.ts`
- `Change` (`:553-558`) gains `texts?: Record<string, { before?: string; after?: string }>`. `changeSince`
  (`:699-712`) fills it, as it does for the lockfile, for `package.json`, `pnpm-workspace.yaml`,
  `.github/workflows/mutation.yml`, and every changed `package.json` of a workspace directory
  (`workspaceDirectories`).
- `classifyManifests(change, closures, global)` returns, per file: `global` (with the fields, for the reason line),
  the packages the mirror rule or the owner rule names, `inert`, or `runner-proof`. §2's tables are its constants:
  `LIFECYCLE_SCRIPTS` (the Stryker scripts are not in it: §3.2 lands in the same pull request), `DEPENDENCY_FIELDS`, `WORKSPACE_INERT_KEYS`, `PINNED_USES` (ci-deps' `PIN`),
  `TRANSPORT_ACTIONS`. Fail closed: no text on either side, a parse error, a YAML anchor, alias or merge key
  (`parseDocument`, then any `Alias` node or anchor), or a key in no list → global (root, workspace, workflow) or
  owners (closure manifest).
- `affected()` (`:603-639`): a classified file is taken out of the global-glob test (`:613`) and the manifest test
  (`:618`) and judged by its class. Each reason names the fields, e.g. `package.json scripts.lint (inert)`,
  `pnpm-workspace.yaml catalog.zod (imported by pricing, packets)`, `packages/db/package.json scripts.db:domain-model
  (inert)`. `RUNNER_PROOF_SHARD = 'money-ledger'` adds money and ledger. A test requires each of that shard's packages
  to have no other shard (`shardsOf`), so a rebalance cannot silently split one.
- `GLOBAL_INPUTS` gains `.npmrc`, `.pnpmfile.*` and `patches/**`; the header comment (`:38-39`) states the field rule.

### 3.2 Stryker run by path, not by root script or bin
- New `tools/stryker/stryker.ts`: `runStryker(args, env)` spawns `process.execPath` on the `bin.stryker` file of
  `@stryker-mutator/core`. It resolves that package's `package.json`, which its `exports` allow (`./package.json`), from
  the repository's root (`createRequire`). The bin file itself is not exported (`ERR_PACKAGE_PATH_NOT_EXPORTED`). As a
  CLI: `pnpm -s exec tsx tools/stryker/stryker.ts run <config>`.
- `shards.ts:41` calls it. `mutation.yml:92`'s canary line becomes
  `pnpm -s exec tsx tools/stryker/stryker.ts run tools/stryker/canary/stryker.config.mjs`.
- Why: today a root devDependency that adds a `stryker` bin would win the link over `@stryker-mutator/core` (both are
  direct, neither has the bin's own name, and `@` sorts first, `:103356-103362`), and a `prestryker` script would run.
  With the narrowing, neither change would reach mutation, so the tooling stops depending on either. `tsx` stays a bin:
  it carries its own name, so no other package can take it (`:103357-103360`).
- Stryker then starts without the `npm_lifecycle_*` and `npm_package_*` variables `pnpm stryker` set. Nothing in
  `stryker/`, `tools/stryker` or the Vitest runner reads them (the builder greps and says so in the pull request), and
  acceptance 4 compares mutant counts and statuses, not only the verdict, to prove it.
- The root `stryker` script stays, for people (`docs/runbooks/ci.md:325, 332`).

### 3.3 Every shard's runtime held to the pins (`tools/stryker/canary/verdict.ts`, `tools/stryker/gate.ts`)
- The verdict's `runtime` (`verdict.ts:57-66`) gains `pnpm`, taken from `npm_config_user_agent` (`^pnpm/(\S+) `).
  The verdict runs under `pnpm -s exec`, which sets it (`makeEnv`, `:202927`; user agent `:19036`).
- The gate fails any shard that ran on a Node other than `unicode.json`'s `checkedOn.node` (which `workflows.test.ts`
  already holds equal to `mutation.yml`'s), on other Unicode or ICU data, or on a pnpm other than root
  `packageManager`'s. `packageManager` is parsed with `^pnpm@(\d+\.\d+\.\d+)(\+sha(?:1|224|256|384|512)\.[0-9a-f]+)?$`;
  anything else (another manager, a range, a tag) fails the gate, naming the value. Today the gate checks Unicode
  only for shards that score bound equivalents (`gate.ts:352-361`). Every shard is pinned to that Node already, so
  the stricter rule fails only a runner that did not install what the workflow asked for. That is what a pin change
  could do, and it is what makes §2's runner proof meaningful.
- The pnpm leg is close to tautological on its own: `manage-package-manager-versions` defaults to true
  (`pnpm.cjs:18940`, switch at `:214066`), so the pnpm that runs is `packageManager`'s whatever action-setup
  installed. It is kept as a guard against that setting turned off and against a user-agent override (both global
  inputs anyway); Node, Unicode and ICU are the legs a pin change can move.

### 3.4 Also corrected
§3.2.1's load plan and §3.4.1 say `browser-tests` reaches no money closure. At 6ddd587 it does: `tools/package.json`
is a manifest of pricing's closure (`tools/golden-worksheet`, `tools/content-files.ts`), so #38's `playwright-core`
line ran pricing's three shards (replayed, §9). After ci-browser that line is `catalog:` and Dependabot edits the
catalog instead, which today runs all six. Under P4 both run none, since no closure imports `playwright-core`. ADR
0066 Part 7 records the correction.

## 4. Files
- New: `tools/stryker/{manifests.ts, manifests.test.ts, stryker.ts, stryker.test.ts}`.
- Changed: `tools/stryker/{affected.ts, affected.test.ts, shards.ts, shards.test.ts, gate.ts, gate.test.ts}`,
  `tools/stryker/canary/{verdict.ts, verdict.test.ts}`; `.github/workflows/mutation.yml` (the canary line `:92`, and the
  header comment `:10-13`); `tools/test/workflows.test.ts` (`:1364`'s expected canary line; the guard rules, §5);
  `tools/test/collection.test.ts` `FILES` (the new tests).
- Documents and registries: §6.
- Not touched: `package.json`, `pnpm-workspace.yaml`, the lockfile and every other manifest; `stryker/**`;
  `vitest.mutation.config.ts`; any money code or test; `watched.ts`; any migration.

## 5. Tests (failing first)
Commit 1 holds the cases marked ★ and exports a stub `classifyManifests` that returns `global` for every file, so
each ★ narrowing case fails on its assertion, not on a missing module. Cases marked ◆ are guards: green against
6ddd587 and after, and there to stay green. Commit 2 makes the ★ cases pass. All run on synthetic worlds
(`affected.test.ts`'s `syntheticWorld`) or on this repository's own graph.

`manifests.test.ts`:
- ★ root: adding `scripts.lint:x`, editing `scripts.test`, or bumping `@next/eslint-plugin-next` affects none; a name
  only pricing's closure imports affects pricing.
- ◆ root: `packageManager`, `engines`, `type`, `name`, `pnpm.overrides`, `scripts.postinstall`, `scripts.prepare`;
  `vitest`, `@vitest/coverage-v8`, `@stryker-mutator/core`, `fast-check`, `tsx`, `yaml`; `decimal.js` (money's
  closure, which every other closure reaches): each affects all four.
- ★ closure manifest: `packages/db/package.json` gaining `scripts.db:domain-model` affects none (#3's change);
  `tools/package.json` gaining `playwright-core` affects none; a dependency entry `packages/db`'s files import affects
  the packages whose closure holds those files; a `workspace:` specifier, `exports`, `type` or an unlisted key affects
  its owners; ◆ `scripts.postinstall` there affects all four.
- ★ other workspace manifest: `apps/web/package.json` gaining `scripts.postinstall` affects all four (S4); ◆ its
  `scripts.dev` or a dependency affects none.
- ★ workspace: a catalog line for `react` or `playwright-core` affects none; `zod` affects pricing and packets; adding
  `minimumReleaseAgeExclude` or `trustPolicyExclude` entries affects none. ◆ `vitest`, `packages`,
  `onlyBuiltDependencies`, `overrides`, `patchedDependencies` and an unknown key (`nodeLinker`) each affect all four;
  ◆ `catalog: { <<: *base }` or any anchor or alias, on either side, affects all four.
- Order: ★ reordering `scripts` or catalog entries alone affects none; ◆ reordering two `exports` conditions in a
  closure manifest affects its owners, and reordering two `overrides` entries affects all four.
- ◆ fail closed: invalid JSON or YAML on either side, a missing side, or no text affects all four (owners, for a
  closure manifest); `affects(['package.json'])` with no texts still gives all four (`affected.test.ts:242`).
- ★ comments alone affect none (YAML comments; JSON whitespace).

`affected.test.ts`:
- ★ `mutation.yml`: only step `uses:` SHAs (same path, 40 hex both sides) and their comments changed gives money and
  ledger, with the reason "pins only: runner proved on money-ledger"; ★ a comment-only change gives none.
- ◆ `mutation.yml` gives all four for: a SHA to `@v7`, `@v7` to a SHA, `@main`; a job-level `uses:` ref; `docker://`
  and `./local` refs; a path change (`actions/checkout` to `foo/checkout`); an `actions/upload-artifact` or
  `actions/download-artifact` SHA move; `runs-on`, `with:`, `run:`, a new step or a step-order change.
- ★ `RUNNER_PROOF_SHARD`'s packages each have exactly that shard in `stryker/shards.json`.
- ◆ `.npmrc`, `.pnpmfile.cjs` and `patches/x.patch` give all four (★ until `GLOBAL_INPUTS` gains them).
- On this repository's graph: the replay of §9 for #3, #31, #40 and #43 as fixtures (each pull request's changed
  manifests and workflow at base and head, copied in as text; they hold no PHI and no repository data beyond
  manifests and a workflow): none, pricing and packets, all four, none.
- `:334-338` ("all four for the mutation tooling") keeps every glob, with the manifests given a global field.

`workflows.test.ts` (the guards that hold the "every other script" rows inert):
- ★ every `run:` in `mutation.yml` is one of an allowlist of whole commands: `pnpm install --frozen-lockfile`,
  `pnpm -s exec tsx tools/stryker/<file>.ts …` (the changes job, the canary, the shard, the gate), and the gate job's
  and changes job's own shell lines, each listed verbatim. No `node --run`, `npm`, `npx`, `corepack`, or `pnpm` other
  than those two forms, anywhere.
- ★ over the union of the global entry points' closure and the four packages' closures (`repositoryClosures`,
  `globalFiles`): no file imports `node:child_process` or `child_process` other than `tools/stryker/shards.ts` and
  `tools/stryker/stryker.ts`, whose spawns are asserted to be `process.execPath` with the Stryker bin and nothing
  else; and no file contains the literal `package.json`, `pnpm-workspace.yaml` or `mutation.yml` except those this
  test lists with the reason (`affected.ts`, `workspace.ts`, `stryker.ts`, which read them as data for the classifier
  or to find the bin).
- the canary line is the new one.

`gate.test.ts`: ★ a shard whose verdict names Node v24.21.0, or pnpm 10.34.9 against `packageManager` 10.34.8, fails,
naming both; a verdict without `pnpm` fails ("no runtime"); a matching one passes; `packageManager`
`pnpm@10.34.8+sha512.<hex>` matches 10.34.8; `pnpm@^10`, `yarn@4.0.0` and `pnpm@10.34` fail closed.
`verdict.test.ts`: the user agent `pnpm/10.34.8 npm/? node/v24.22.0 linux x64` gives `10.34.8`, and none gives `''`.
`stryker.test.ts`: it resolves `bin.stryker` through `package.json` and spawns `process.execPath`; a missing package
fails, naming it.

## 6. Documents
- **ADR 0066, Part 7** (new, after Part 6): the context (`:111-120`'s whole-file globals, `:618`'s manifest rule,
  and their cost); the decision (§2's tables, fail closed, order-sensitive fields, the mirror and owner rules, the
  runner proof and why transport is excluded, Stryker by path, the runtime check); the measurement (§9); the
  alternatives (§10); the correction of §3.4; and when to revisit: pnpm 11, whose frozen install checks the release
  age and trust policy; a new workspace key; a shards rebalance that splits money or ledger; the hoisting limit of §2
  (phantom requires through `node_modules/.pnpm/node_modules`, which neither the lockfile rule nor P4 sees); a later
  pnpm that stops checking specifiers on a frozen install.
- **ADR 0066 Part 4**, `:413` ("the root manifest, the workspace list, the root tsconfigs and the workflow affect all
  four") gains "(narrowed field by field by Part 7)". Part 4's text otherwise stands.
- **`docs/runbooks/ci.md`**, "Mutation testing" `:205-206`: the field rule in one paragraph, with the reason lines a
  person will see; `:325`'s local canary command may stay `pnpm stryker run`, and gains the by-path form CI uses.
- **`mutation.yml:10-13`**: the header names the field rule, the runner proof and the transport exception.
- **`docs/product/reconciliation-001.md`**, the CI series list (`:143-146`): one line after item 4, as P1 does
  (`p1-design.md:258`): "P4 (`co-001/ci-mutation-trigger`, ADR 0066 Part 7, CI-27 to CI-29): mutation runs only for
  manifest fields and pins a shard reads; an engineering item of §3.2.6."
- Outside the pull request: `/home/user/ops/lanes/lane-b.md` (the ops branch's lane log, a session commit, not a
  repository file; `git ls-files` has no `lanes/`) records P4 done, with the replay's figures.

## 7. Test-matrix rows (and `packages/synth` cases)
| ID | Case | Assertion |
|---|---|---|
| CI-27 | Mutation from the manifests and workspace, field by field | A change confined to fields no shard reads (a non-lifecycle script in the root or any workspace manifest, a dependency or catalog entry no closure or tooling imports, the release-age and trust settings) runs no package; a dependency or catalog entry a closure imports, or a closure manifest's module fields, run that package; the pnpm, Node and module settings, an install lifecycle script in any workspace manifest, the test tooling, the workspace list, a reordered order-sensitive field, a YAML anchor or alias, and any unlisted or unparseable field run all four |
| CI-28 | A pin-only workflow change proved on the runner | A change to `mutation.yml` that moves only step action SHAs, same action on both sides and neither artifact action, runs every shard of money and ledger and no other; a tag, branch, job-level or artifact-action ref, or any other change to it, runs all four; a comment-only change runs none |
| CI-29 | Every shard on the pinned runtime | Each shard's canary verdict names its Node, Unicode, ICU and pnpm, and the gate fails a shard whose runtime differs from the pinned Node or `packageManager`'s pnpm; the tooling runs Stryker by path, and no mutation step or closure file runs a root or package script |

The intro sentence (`test-matrix.md:211-212`) gains "CI-27 to CI-29 narrow what affects mutation (Part 7)". In
`matrix.ts`, three rows go after CI-26, in `CI-17`'s form (`:292`). In `registry.ts`, each is `none(0, …)`:
"Manifests, workspaces and workflows are synthetic, written to a temporary directory, or this repository's own; no
file." Each is listed with its test files, after `CI-17` (`:465`). Then `pnpm synth --all`. CI-17's wording stands.

## 8. Builders
One builder, M5, owns everything in §4: the classifier, `affected.ts`, `stryker.ts`, `shards.ts`, the verdict and gate
change, `mutation.yml`'s line, the tests and `collection.test.ts`. The files are tightly coupled, and about 550 lines
of code and tests is one builder's work. An integrator owns the documents, the matrix, synth, the fresh-clone
verification, and acceptance 1 (the replay, run from the scratchpad clone with the PR's `affected.ts`; the prototype
is `scratchpad/p4/sim2.ts`) and 4 (the full run on the PR, compared per package with the base's last push run).

## 9. Measured: what the narrowing saves
Method: a shared clone (`git clone --shared`, PR heads fetched as `refs/pull/*/head`), and each pull request's head
against its base's merge base. Both are run through 6ddd587's `repositoryClosures`, `globalFiles`, `unionClosures` and
`affected`, as-is ("current") and with §2's classifier ("narrowed"; prototype `scratchpad/p4/sim2.ts`, output
`scratchpad/p4/sim2.out`; the pre-review prototype and output are `sim.ts`, `sim.out`). Older pull requests are judged
under today's sets and shards: the counterfactual P4 changes. Shard times are the means of three full runs (above):
money-ledger 4.0 minutes, packets-scan 6.4, packets-rest 6.1, pricing-engine 7.2, pricing-recompute 4.0, pricing-rest
5.2; 33.0 in all (pricing 16.4, packets 12.5).

| PR | What it changed in these files | Current | Narrowed | Saved (runner-min, final head) |
|---|---|---|---|---|
| #2, #4 | a root script (`lint:copy`, `check:fixtures`) | all four | ledger | 29.0 each |
| #3 | `db:domain-model` script, in the root and `packages/db/package.json` | all four | none | 33.0 |
| #6 | `lint` script | all four | pricing, ledger | 12.5 |
| #25, #43 | scripts (`hooks:install`; `typecheck`, `lint`) | all four | none | 33.0 each |
| #31 | `screening:capacity` script (root and `tools/package.json`), `tools/package.json` `exports` (pricing, its owner) | all four | pricing, packets | 4.0 |
| #37 | `mutation.yml` tag refs (`@v4` to `@v7`), before ci-deps' SHA rule | all four | all four (not a SHA pin) | 0 |
| #40 | `mutation.yml` SHA pins, the artifact actions among them | all four | all four (transport) | 0 |
| #23, #26, #38 | vitest in root, catalog (and #26/#38 `tools/package.json`) | all four | all four (test tooling) | 0 |
| #35, #44, #48 | Stryker, `patchedDependencies`/`packages`, `packageManager` | all four | all four | 0 |

Across the 35 pull requests into the build branch, full runs drop from 16 to 9, and the final heads save about 173
runner-minutes (#3 alone gains 16.4 from the closure-manifest rule). Every push to a pull request re-runs mutation,
so this is a lower bound: #43 had 24 commits. No case widened, and on the other 26 pull requests current and narrowed
agree exactly.

Projected per week once ci-deps' groups run (`dependabot.yml` at 19e3d98e: eight npm groups, actions weekly), each a
synthetic commit through the same rules:
- **actions**, in a week it does not move an artifact action: 33 → 4 plus the changes and gate jobs, about 29 saved;
  in a week it does, unchanged;
- **next**, whenever it moves `@next/eslint-plugin-next` (root): 33 → 0;
- **browser-tests** (catalog `playwright-core`, after ci-browser): 33 → 0;
- a release-age or trust exclude added or expired alone: 33 → 0; a catalog `zod` line: 33 → 28.9 (pricing's three
  shards and packets' two);
- **minor-and-patch**: unchanged whenever it moves vitest, tsx, fast-check or Stryker, which all three so far did;
  **aws-sdk**: pricing and packets by the lockfile, either way;
- a lane pull request that adds a script to a closure manifest (`packages/db`, `packages/rules`, `tools`): that
  package's shards no longer run for it.

That is up to about 95 runner-minutes in a week when `actions` (without transport), `next` and `browser-tests` all
open, some 15% of §3.2.1's 550-650 Thursday batch, and the 20 job slots free sooner then.

## 10. Choices made, with reasons
- C1. **Fail closed, with inert fields listed (an allowlist), rather than global fields listed.** A field pnpm adds
  later (pnpm 10 gained `devEngines`, the trust and release-age keys) is then global until someone proves it inert.
  The brief's list (packageManager, engines, the Stryker and test scripts, `TEST_TOOLING`'s specifiers, overrides) is
  covered: every item is global, apart from the two scripts below.
- C2. **Test scripts are inert, not global** (a departure from the brief). No mutation step and no closure file runs
  a root or package script, and the guard tests hold that (an allowlist of whole `run:` commands; no process spawn and
  no manifest read in any closure), so marking them global would only cost runs (#43's `typecheck` and `lint`).
  **The Stryker script is taken out of the path instead** (§3.2): that removes the bin-shadowing case, and the bin
  provenance check it would otherwise need.
- C3. **The mirror rule for specifiers**, where the frozen install alone would let every specifier be inert. It never
  costs a run, because a specifier that moves an imported package moves the lockfile too, and the lockfile rule names
  the same packages. It also keeps the rule sound if a later pnpm stops checking specifiers on a frozen install.
- C4. **Release-age and trust keys are inert**, the one place P4 relies on the frozen install alone. pnpm 10.34.8 reads
  them only during resolution, a frozen install never resolves, and they can fail an install but never change a score.
  The safer reading (global) would cost a full run on every exclude a person adds or expires.
- C5. **A pin-only change runs `money-ledger`, not nothing and not a canary-only job.** Nothing would let a broken pin
  merge green and fail the first push run. A canary-only job would need a new gate mode. `money-ledger` uses the
  existing machinery, about 4 minutes, and keeps "all or none": it holds money and ledger whole.
- C6. **Pin-only is scoped to step refs from SHA to SHA of the same action, and the artifact actions are excluded**
  (review S1, S2). A job-level `uses:` replaces a job's logic, a tag is not a pin, and a one-shard run cannot prove a
  multi-artifact merge. The alternative for transport, running money-ledger plus packets' two shards (three
  artifacts, about 16.6 minutes), would prove the merge but not that pricing's artifacts upload; the safer reading
  (all six) costs a full run only in the weeks those two actions move.
- C7. **Every shard's runtime is held** (§3.3) rather than only on pin-only runs: one rule, with no mode to test. It
  can only fail a runner that ignored the workflow's pins.
- C8. **Closure manifests are classified too** (review S7; the draft left them whole-file on the false reason that the
  replay saved nothing). #3 shows otherwise, and lane pull requests add scripts to `packages/db`, `packages/rules` and
  `tools` regularly. Unlisted fields keep today's owner rule, so the extension narrows only scripts and dependency
  entries a package's files do not import.
- C9. **Order-sensitive comparison per field** (review S6): reordering `exports` conditions or `overrides` can change
  resolution, so only per-entry fields ignore order.
- C10. **Every changed workspace manifest is read for install lifecycle scripts** (review S4): the gap predates P4,
  but the soundness claim needs it, and no manifest has such a script today, so nothing runs more.
- C11. **The added globals** (`.npmrc`, `.pnpmfile.*`, `patches/**`) and **YAML anchors as global** close gaps in
  today's rule. None exists, so nothing runs more today.

## 11. Interplay
- **ci-mutation's rule** ("each package's shards all or none", CI-17) holds: the classifier names packages, never
  shards, and the runner proof names a shard that holds its packages whole, held by a test.
- **Lane A's #42** (`pr42-files.txt`) shares `docs/product/test-matrix.md`, `docs/product/reconciliation-001.md` and
  `packages/synth/src/cases/{matrix,registry}.ts`. These are LANES rule 6 documents, and P4 writes its own rows and
  line. The pull request merged second keeps both and runs `pnpm synth --all`. P4 touches no other #42 file: no
  lockfile, manifest, `watched-paths.txt` or ADR 0062. #42 edits `tools/screening-capacity/**` (no closure file),
  whose `tools/package.json` script #31 added; after P4, a script-only edit of `tools/package.json` runs no shard.
- **ci-deps and ci-browser** merge first. P4 classifies their keys as §2 lists them (`minimumReleaseAge*`,
  `trustPolicy*` inert; `overrides` global; the catalog's `eslint`, `typescript-eslint` and `playwright-core` lines
  inert under the mirror rule). ci-browser's `runs-on` change to `mutation.yml` stays global, which is correct. At the
  cut, re-read `stryker/shards.json`: if ci-browser's O7 rebalance (§3.3.5) has split money or ledger, the
  `RUNNER_PROOF_SHARD` test fails and the builder moves the constant to a shard that holds whole packages. P4 relies
  on ci-deps' `PIN` pattern (copied, not imported, so P4 stays sound if check-action-pins changes).
- **P1 (Part 5)** and **P2 (Part 6)** edit `tools/check-action-pins`, `tools/check-toolchain`, `ci.yml` and
  `release.yml`, not `mutation.yml` or `tools/stryker`. They share ADR 0066, the matrix, synth and
  `reconciliation-001.md` under rule 6, and all three edit `tools/test/workflows.test.ts` (`p1-design.md:194`,
  `p2-design.md:255`, here §5): different `describe` blocks, so the pull request merged later rebases and re-runs
  `pnpm test` (rule 6 covers documents, not tests, so this is the merge-order rule of §3's series). A P1 or P2 pull
  request that bumps a step SHA in `mutation.yml` is itself pin-only; P1's age floor then vouches for the new SHA.
- **P5** (catalog lines) is cheaper under P4: its catalog edits are inert unless a closure imports the package.

## 12. Risks and rollback
- R1. **A later pnpm checks the release age or trust policy on frozen installs** (pnpm 11.3's `trustLockfile`). That
  can fail an install, never change a score, and it arrives through `packageManager`, which is global. Part 7's revisit
  list names it.
- R2. **A pin-only change that breaks only the pricing or packets shards.** The runtime check (§3.3) catches the
  mechanisms a step pin controls: Node, ICU and pnpm. The artifact transport is never pin-only (§2), so the window
  holds only what a checkout, pnpm or Node action change could break in those shards and not in money-ledger's, which
  runs the same steps. That shows on the first push run, which runs every package minutes after the merge, and on the
  weekly run.
- R3. **A misclassified field** narrows too far. The allowlist is short, every entry has a test and the reason above,
  and fail closed covers everything unlisted.
- R4. **The hoisting limit** (§2): a new root dependency could change a phantom require's target unseen. It is the
  lockfile rule's existing limit for every non-root manifest; Part 7 names it for revisit.
- R5. **Reason lines get longer.** The changes job's summary lists the fields per file, capped as today (5 per package).
- **Rollback**: revert the pull request. It holds no state and no migration. The old whole-file rule is the one-line
  `GLOBAL_INPUTS` and `:618` it restores.

## 13. Review (2026-10-26)
The adversarial review (`follow-ups/p4-review.md`: B 0, S 7, N 10) was re-checked against 6ddd587, ci-deps at
19e3d98e (unchanged) and pnpm 10.34.8's `dist/pnpm.cjs`, and the replay was re-run with the folded rules
(`scratchpad/p4/sim2.ts`, `sim2.out`). All 17 findings were real; all 17 are fixed. None is left open.

| Finding | Re-checked | Disposition |
|---|---|---|
| S1 pin-only unscoped | True: the draft cut every `uses:` at its last `@`. #37 (tags) replays as pin-only under it | Fixed: step refs only, ci-deps' `PIN` on both sides, same path; job-level, `docker://`, `./`, tag and branch refs global; ◆ cases; check-action-pins and P1 named (§2, §5, §11, C6) |
| S2 transport not proved by one shard | True: `mutation.yml:181-186` merges one artifact on a money-ledger run; #40 moved both artifact actions | Fixed: an artifact-action move is global; acceptance 1-2, §9 (#40 now 0 saved; the weekly projection conditional), R2, C6 |
| S3 guard test narrower than the claim | True on all three gaps (no such use today) | Fixed: whole-command `run:` allowlist; the union of global and package closures scanned for `child_process` and the three file names (§5) |
| S4 workspace lifecycle scripts | True: `projectsToBeBuilt` at `:167203`, `:175971` | Fixed: every changed workspace manifest read; an install script is global (§2, §3.1, §5, CI-27, C10) |
| S5 "same installed tree" overclaimed | True: hoisting can move a phantom require | Fixed in wording: claim bounded by the lockfile rule, the limit named, Part 7 revisit, R4; no code change |
| S6 key order fail-open | True for `exports`, `imports`, `overrides` | Fixed: order-sensitive per field, per-entry fields order-free; the ★/◆ pair replaces the old case (§2, §5, C9) |
| S7 C7's reason false | True: #3's only pricing reason was `packages/db/package.json`, a script-only diff | Fixed: closure manifests classified (§2 table, §3.1, C8); replay: #3 none, 33.0 saved |
| N1 browser-tests clause | True of the draft; with S7 the clause would hold, but P4 lands after ci-browser | Fixed: clause dropped, §3.4 states both forms run none |
| N2 shared `workflows.test.ts` | True | Fixed: named in §11 with the rebase order |
| N3 reconciliation-001 claimed but not edited | True | Fixed: P4 adds its line, as P1 does (§6) |
| N4 `lanes/lane-b.md` not in the repository | True | Fixed: marked as the ops branch's file, outside the PR (§6) |
| N5 ★ cases already green | True | Fixed: stub `classifyManifests` in commit 1; ★ narrowing vs ◆ guard cases (§5) |
| N6 `packageManager` parse | True | Fixed: the regex, `+sha512.` and fail-closed cases (§3.3, §5) |
| N7 pnpm leg near-tautological | True (`:18940`, `:214066`) | Fixed: its scope stated (§3.3) |
| N8 YAML merge keys | True (js-yaml vs `yaml` 1.2) | Fixed: anchors, aliases and merge keys global (§2, §3.1, §5) |
| N9 env change under Stryker by path | True | Fixed: acceptance 4 compares mutant counts and statuses; the builder greps for readers (§1, §3.2) |
| N10 `name` reason; O7 sentence | True (`:205081`) | Fixed: `name` global with the cite; O7 replaced by the re-read at the cut (§2, §11) |

Net effect on the measurement: full runs 16 → 9 (the draft said 7), seven pull requests narrowed (the draft said
nine), about 173 runner-minutes at final heads (the draft said 215): S1 and S2 take #37 and #40 back to full, and S7
adds #3's remaining 16.4.
