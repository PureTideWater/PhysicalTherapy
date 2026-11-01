# P4: a narrower mutation trigger for manifest and pin-only changes (`co-001/ci-mutation-trigger`)

Lane B, after ci-deps (§3.2) and ci-browser (§3.3), (14) both merged (#48, e908c214; #77, ecebdc90); (14) cut locally
from `claude/build-platform` at bce57f16 (2026-11-01, after P1's #82). Written against
6ddd587 plus both designs, and against `co-001/ci-deps` at 19e3d98e (2026-10-26, still moving: its manifests have the
gates but not yet the bumps). Every cite is at 6ddd587 unless marked; (14) §14 re-reads the design at bce57f16 and
re-maps every cite (14.2), and builders work from it. ADR 0066
**Part 7**; test-matrix and synth cases **CI-27 to CI-29** (all three used). No migration: it changes `tools/stryker`,
one step of `mutation.yml` ((14) and adds one to its changes job, §15), tests and documents. It is ci-mutation's area (§3.4), and it keeps that design's rule: a
pull request runs every shard of each affected package or none of them. Folded with its review on 2026-10-26 (§13);
(14) re-read at bce57f16 (§14) and folded with that re-read's review on 2026-11-01 (§15).

Rulings it rests on: the co-founder's 2026-10-26 ~00:20 UTC ruling (every choice takes the recommended option, for
security the safer one); Q3 (engineering-only choices inside a ruled design are pre-approved, each listed in §10).
P4 itself was proposed in §3.2.6 as an engineering item.

## 1. Goal and acceptance

Goal: a pull request runs mutation only on what can change a shard's result. Today `tools/stryker/affected.ts:111-120`
((14) `:121-130` at bce57f16)
treats any edit of the root `package.json`, `pnpm-workspace.yaml` or `mutation.yml` as touching every package, and
`affected.ts:618` ((14) `:639`) treats any edit of a closure's `package.json` (`packages/*/package.json`, `tools/package.json`) as
touching that package. So a new root or package script, a catalog line no money code imports, a release-age exclude,
or a Dependabot actions bump each runs (14) every shard (seven at bce57f16, at least nine once #84 merges): 52.0 to 57.8
runner-minutes, mean 54.8 with the changes and gate jobs (the ten push runs 40339580137 to 41330911489; 14.3). P4 reads
those files field by field, on both sides of the change. (14) On CI the two sides are the pull request's fork point
(`pull_request.base.sha`) and the merge commit GitHub tests, so base commits since the fork count as the pull
request's: a field-level superset of what the merge changes, so the rule stays sound (14.1). It fails closed: any field
it does not list as inert, any file it cannot parse, and any file it has no text for keeps today's whole-file rule.

Acceptance (measurable):
1. (14) The 58 pull requests into the build branch to #89 (37 merged, 12 closed unmerged, 9 open), replayed through
   the changed rule at bce57f16's sets and shards (§9; 14.3): 22 full runs become 15. Seven pull requests run less:
   #2, #3, #4, #6, #25, #31 and #43, about 297 runner-minutes at their final heads (294 at the replay's twelve-run
   means); none of the 25 since the design runs less. No package that today's rule affects through a closure file,
   data file or lockfile move is lost, and none is widened, on any of the 58. The two actions bumps (#37, #40) stay
   full: #37 moved tag refs, which ci-deps' check-action-pins now refuses, and #40 moved the artifact actions (§2).
   (14) "None widened" holds under §15's rule for an added or deleted workspace manifest (judged against `{}`, S5): #2
   adds `packages/brand/package.json`, which "a missing side gives all four" would have widened from ledger to all
   four; and no replayed pull request reaches a rule §15 adds (`tmp/fold1/check58.sh`, 20:37Z).
2. A Dependabot actions pull request that changes only step `uses:` refs from one full SHA to another (same
   owner, repository and path), and their comments, in `mutation.yml`, and moves neither `actions/upload-artifact`
   nor `actions/download-artifact`, runs `money-ledger` alone, which covers money and ledger in full. That shard's
   canary and the gate prove the new pins: Node, Unicode, ICU and pnpm must equal the pinned ones (§3.3), (14) and
   the commit each shard ran on must be the one GitHub tested (`GITHUB_SHA`, §15 S2).
3. Everything §2 lists as global still affects all four packages: `packageManager`, `engines`, `type`, `pnpm`, an
   install lifecycle script in **any** workspace manifest, a test-tooling specifier; the workspace's `packages`,
   `onlyBuiltDependencies`, `overrides`, `patchedDependencies`, any YAML anchor, alias or merge key, and every key not
   listed; in `mutation.yml`, a job-level `uses:`, a non-SHA ref, (14) a `$/` self-reference, an artifact-action ref,
   or any other edit; a new `.npmrc`, `.pnpmfile.*`, `patches/**` (14) or `.github/workflows/actions.lock` file; (14)
   any manifest another global glob already matches (`tools/stryker/canary/lib/package.json`); and (14) in
   `tools/package.json`, whose directory holds the mutation tooling's own files, `type`, `imports`, an install
   lifecycle script and every unlisted key. A closure manifest's unlisted field affects that manifest's packages.
   (14) Also global (§15): a root dependency entry named `node`, `deno` or `bun`, or with a specifier other than a
   registry version or range, `catalog:` or `npm:` alias (`runtime:`, `workspace:`, `link:`, `file:`, git, URL);
   `prepublishOnly` and `dependenciesMeta` in any workspace manifest; an added or deleted workspace manifest with an
   install lifecycle script; a `packages` edit that either the YAML or the mutation tooling's own reading of it sees;
   any explicit YAML tag, parse warning or duplicate key; a manifest key holding a control character; any
   `package.yaml` or `package.json5`, a root `.pnp.cjs`, `.github/actions/**`; `tools/tsconfig.json`; and, in a
   manifest whose package a global file imports by name, its `name` and `exports`.
4. `pnpm test` (the ★ narrowing cases failing first on their assertions, §5), `pnpm lint`, `pnpm typecheck` and CI
   green. P4's own pull request edits `tools/stryker/**`, so it runs (14) every shard (seven at bce57f16, at least nine
   once #84 merges), the live proof of §3.2 and §3.3: per package, (14) per file, its mutant count and its counts by status
   equal those of the push run of the commit its run was merged into (the merge commit's first parent, which the
   checkout log prints as "Merge <head> into <tip>"; not `pull_request.base.sha`, the fork point), read from each
   shard job's Stryker table because the proxy refuses artifact downloads (`lanes/lane-b.md:246`); a mutant that moves
   only between Killed and Timeout is listed, not counted (E4). Not only green.

## 2. What a shard reads from these files: every field, and why

A shard runs these steps in order (`mutation.yml:81-98`; (14) `:81-107` at bce57f16): checkout; pnpm/action-setup,
which (14) installs its own bootstrap pnpm (11.25.0 at v6.1.0) and runs `self-update` to the version `packageManager`
names; setup-node with `node-version: 24.22.0`; `pnpm install --frozen-lockfile`; the canary; the shard
(`shards.ts:41` spawns `pnpm stryker run …`); (14) the shard's own gate view (`:96-98`, which judges nothing); and
upload. The gate job (`:168-186`) checks out, installs, and downloads
every shard's artifact (`pattern: mutation-*`, `merge-multiple: true`). pnpm 10.34.8, (14) `packageManager`'s
(`package.json:5`, with its `+sha512`), is read
below from its own `dist/pnpm.cjs`. (14) That hash is the registry's tarball integrity, held so by ci's Toolchain step
(`tools/check-toolchain/check.ts:370-393`) and checked by both Dockerfiles' install; no mutation runner checks it:
action-setup strips it and self-updates by version alone (its `src/install-pnpm/run.ts:112-114, :154-158`), so the
runtime check (§3.3) holds the version, not the bytes (P44, numbered P39 until §15's completeness critic). On a
frozen install it does four things:
- It refuses a lockfile whose recorded settings differ from the configuration: catalogs, overrides,
  patchedDependencies, packageExtensions, the pnpmfile checksum and ignoredOptionalDependencies
  (`LOCKFILE_CONFIG_MISMATCH`, `:175231-175249`).
- It refuses a lockfile that any manifest's specifiers do not satisfy (`OUTDATED_LOCKFILE`, `:175441-175453`).
- It installs without resolving. `minimumReleaseAge` and `trustPolicy` are read only on the resolution path
  (`:169491-169495`, `:175724-175728`).
- It runs `preinstall`, `install`, `postinstall`, `preprepare`, `prepare` and `postprepare` for **every workspace
  project** it installs (`projectsToBeBuilt`, `:167203`, `:175971`), not only the root's, and the root's
  `pnpm:devPreinstall` (`:175212`); (14) for a workspace package another project injects (`dependenciesMeta.<name>.
  injected`, or `injectWorkspacePackages`), `preinstall`, `install`, `postinstall`, `prepare` and `prepublishOnly`
  (`:164572`).

`pnpm <script>` also runs `pre<script>` and `post<script>` (`enable-pre-post-scripts` defaults to true, `:18906`;
`:204854-204858`). `pnpm exec` exports the selected project's `name` as `PNPM_PACKAGE_NAME` (`:205081`). When two
packages link the same bin name, direct dependencies win over hoisted ones, then the package whose own name is the
bin's, then the later package name in `localeCompare` order (`:103318-103365`).

(14) `pnpm exec` puts the root's `./node_modules/.bin` first on `PATH` (`:205061-205063`), and the `tsx` and `stryker`
shims run `"$basedir/node"` whenever `node_modules/.bin/node` exists (`node_modules/.bin/tsx:17-21`,
`node_modules/.bin/stryker:17-21`). So a root dependency that links a bin named `node` is the Node every `pnpm -s exec
tsx` step runs: a `workspace:` package declaring that bin (shown at 20:24Z: `pnpm -s exec sh -c 'command -v node'`
prints `./node_modules/.bin/node`; `link:` alike, not run), or a registry package whose bin is a Node binary (`node-linux-x64@24.22.2`,
bin `node`, no scripts, published 2026-10-29; whether ci's trust rule admits it is not verified). Two forms do not reach it: a `runtime:` specifier, whose lockfile
resolution (`{type: variations}`, `:62452-62459`) ci's Toolchain step refuses (`check.ts:578-597`, run at `:819` and
`:848`), and the npm package `node`, whose bin its own `preinstall` writes, a build `onlyBuiltDependencies`
(`pnpm-workspace.yaml:37-38`) does not allow (shown at 20:24Z: no `.bin/node`). And `pnpm exec` requires a root
`.pnp.cjs` into every step it runs (`NODE_OPTIONS=--require`, `:205052-205053`, `:205073-205076`, `:103645-103649`).

So a specifier on its own cannot change what is installed: either the lockfile moves with it, and the lockfile rule
(§3.4.1, `affected.ts:623-637`, (14) `:644-658`) decides, or every install fails, in ci.yml's required jobs too. The tables keep a
second, specifier-level rule anyway (the "mirror" rule), which costs no run in practice (§10, C3).

Every field is compared order-sensitively: the parsed value of each side, serialised without sorting keys
(`JSON.parse` and `yaml` keep key order). Order matters in `exports` and `imports` (condition order) and in
`overrides` (overlapping selectors), so reordering a global field is a change. Fields judged per entry (`scripts`,
dependency maps, catalogs) are compared entry by entry, so reordering them alone changes nothing.

**Root `package.json`** (keys at 6ddd587 `:2-55`, and after ci-deps; (14) at bce57f16 `:2-57`: `name`, `private`,
`type`, `packageManager`, `engines`, `scripts`, `devDependencies`, with no `pnpm`, `devEngines` or `dependencies`):

| Field | Can it change a shard? | P4 |
|---|---|---|
| `packageManager` | Yes: action-setup installs it, and it runs the install and every `pnpm` step | global |
| `engines`, `devEngines` | `engines` changes no run while engine-strict is off, but one `.npmrc` line turns it into a failure. pnpm 10 reads `devEngines.runtime` | global (fail closed; neither is ever bumped) |
| `type` | Yes: it decides ESM or CJS for root files outside any workspace package (`stryker/*.mjs` excepted), such as `vitest.mutation.config.ts`, which tsx and Vite load | global |
| `pnpm` (overrides, patchedDependencies, onlyBuiltDependencies and the rest) | Resolution or execution | global |
| `scripts.{pnpm:devPreinstall, preinstall, install, postinstall, prepublish, preprepare, prepare, postprepare}`, (14) `prepublishOnly` | Yes: they run on every install ((14) `prepublishOnly` for an injected package, above) | global |
| `scripts.stryker`, `prestryker`, `poststryker` | Yes today (`mutation.yml:92`, `shards.ts:41`). After §3.2, no: the tooling runs Stryker by path and invokes no root script | inert after §3.2 |
| every other script (`test`, `test:golden`, `typecheck`, `lint`, the release, db and check scripts; (14) `actions:check` and `toolchain:check` (#48, `:37-38`), `hooks:install`, `gitleaks:install`, and P2's `trivy:pin`) | No: no mutation step runs one (each `run:` is held to an allowlist of whole commands) and no closure file spawns a process or reads the manifest (§5, the guard tests) | inert, held by those tests |
| `devDependencies`, `dependencies`, `optionalDependencies`, per entry | Only through the lockfile (above) | mirror rule: `TEST_TOOLING` (`:108`; (14) `:118`) or a name the global entry points import (yaml, vitest, `@stryker-mutator/api`) → global; a name a package's closure imports → that package; else inert. (14) Eight root entries are `catalog:` (`:47-49, :51, :53-56`), so their versions move in the catalog; a specifier moved to or from `catalog:` is judged by its name, so a `TEST_TOOLING` one stays global |
| (14) a dependency entry named `node`, `deno` or `bun`, or whose specifier on either side is not a registry version or range, `catalog:`/`catalog:<name>` or `npm:<name>@<range>` (so `runtime:`, `workspace:`, `link:`, `file:`, git and URL forms) | Yes: it can link a `node` bin into the root's `.bin` (above), and `workspace:` and `link:` install a tree no lockfile package entry records, which the lockfile rule cannot see | global, before the mirror rule (§15 B1); none exists |
| (14) `dependenciesMeta` | Yes: `injected` runs the injected package's install scripts, `prepublishOnly` among them (above) | global (it was already, as an unlisted key; named so the closure and other tables share it) |
| `name` | `pnpm exec` exports it as `PNPM_PACKAGE_NAME` (`:205081`) to every tsx step | global |
| `private`, and any key not listed (`exports`, `imports`, `workspaces`, `resolutions`, `peerDependencies`, …) | Unknown or rare | global (fail closed) |

**A closure's own `package.json`** (`packages/{money,ledger,pricing,packets,contracts,db,rules,…}/package.json`,
`tools/package.json`: the `manifests` of `closureOf`, `affected.ts:403-415`; (14) `:420-432`). Its "owners" are the
packages whose closure lists it (today's reason line, `:618`; (14) `:639`).

| Field | Can it change a shard? | P4 |
|---|---|---|
| install lifecycle scripts (the list above, without `pnpm:devPreinstall`; (14) with `prepublishOnly`), (14) `dependenciesMeta` | Yes: every frozen install runs them (above) | global |
| every other script | No: as for the root's (the same guard tests; no step runs a package script) | inert |
| `dependencies`, `devDependencies`, `optionalDependencies`, per entry | Only through the lockfile, and only for imports from that package's own files (pnpm links each project's declared dependencies into its own `node_modules`) | a `workspace:` specifier on either side → its owners; `TEST_TOOLING` or a global-entry import → global; a name that package's files import in some closure (`Closure.imports` keyed by that directory, `:378-391`; (14) the field `:377`, `importsOf` `:395-408`) → those closures' packages; else inert |
| `name`, `exports`, `imports`, `type`, `main`, and every key not listed | Resolution of the package's own imports, module format | its owners (today's rule, kept for these) |
| (14) in `tools/package.json`, or any manifest whose directory is the nearest package of a file the global entry points reach (E1): `type`, `imports`, an install lifecycle script and every key not listed | Module format and resolution of the mutation tooling itself (`"type": "module"`, `:5`), which tsx loads in every job | global; `exports` and `name` stay its owners'; other scripts inert; dependency entries by the mirror rule against its owners' and the global imports (`yaml`, keyed by `tools`) |
| (14) in such a manifest (E1): a dependency entry named `node`, `deno` or `bun`, or a `runtime:`, `link:`, `file:`, git or URL specifier | No bin it links is on a mutation step's `PATH` (only the root's `./node_modules/.bin`, `pnpm.cjs:205061-205063`), but none exists and the root's rule costs nothing here | global; a `workspace:` entry keeps the row above (its owners, or global by the mirror rule when a global file imports that package: `packageName` keeps workspace names, `affected.ts:256-260`), since `tools/package.json` holds eleven (`:17-26`, `:32`) that lane pull requests edit |
| (14) in such a manifest, `name` and `exports` when its `name`, on either side, is a package a global file imports by name (`global.imports`, which §15 S3 widens to the files a shard loads by path: today `@tp/stryker-canary`, `tools/stryker/canary/linked.test.ts:1`; (14) reached only because `globalFiles` follows them with `includeTests`, §3.1) | Yes: the alias every shard's canary resolves (`vitest.mutation.config.ts:88-104`), and another manifest that takes that name captures it, earlier in workspace order (`pnpm-workspace.yaml:2-8`; `resolveWorkspaceImport` keeps the first of equal length, `workspace.ts:124-125`) | global (§15 S3); `tools/package.json`'s `@tp/tools` is imported by no global file, so its `exports` stay pricing's |
| (14) its directory's `tsconfig.json` (`tools/tsconfig.json` today) | Yes: Vite resolves each TS file's nearest tsconfig (Vite 8.3.4 `dist/node/chunks/node.js:7556-7570`, its default Oxc transform; `:7312-7328` for esbuild), and the canary's files under `tools/stryker/canary/` have none nearer, so every shard's canary reads it | global (§15 S9; it was pricing's alone) |

**Every other workspace manifest** (`apps/*`, packages in no closure): today it affects nothing. P4 reads it when it
changes, and an added, removed or changed install lifecycle script is global, since every shard's install runs it;
(14) so is one P4 cannot read or parse, which may hold one (§3.1, the completeness critic's N-2).
Nothing else in it is read by a shard. (14) That last sentence was wrong: `workspace.ts:83-91` reads every workspace
manifest's `name` and `exports` into the aliases every shard uses (`vitest.mutation.config.ts:88-123`). They stay
inert because `closureOf` resolves imports by the same reading (`workspace.ts:124`), so an edit that captures an import
a closure makes turns that manifest into a closure manifest at the head, and its owners run. A manifest another
`GLOBAL_INPUTS` glob matches (`tools/stryker/canary/lib/package.json`, under `tools/stryker/**`, which the canary's case
3 imports by name in every shard) is never classified: it stays global (§3.1, E2). (14) Three more rules (§15): its
`prepublishOnly` and `dependenciesMeta` are global, like its install lifecycle scripts (S7); a manifest added or deleted
is judged against `{}` on its absent side, so it is global only for an install lifecycle script (or `dependenciesMeta`),
and its `name` and `exports` follow F9 (S5; "absent" is `git diff --name-status`'s A or D, while a side git cannot read
stays fail-closed); and a `name` that captures an import a global file makes (`@tp/stryker-canary`) makes that
manifest global-holding at the head, where the row above makes its `name` and `exports` global (S3). Closures and the
global inputs are both unions of the two sides (`unionClosures`, `unionGlobal`, `affected.ts:602-621`), so releasing a
capture is seen as well as making one.

**`pnpm-workspace.yaml`** (6ddd587 `:1-29`; ci-deps adds `:31-43` and `overrides`; ci-browser adds a catalog line;
(14) at bce57f16 `:1-52`: `packages` `:1-8`, `catalog` `:11-29`, `overrides` `:33-34`, `onlyBuiltDependencies`
`:37-38`, the release-age and trust keys `:44-52`; no `catalogs`, `patchedDependencies` or anchors):

| Key | Can it change a shard? | P4 |
|---|---|---|
| `packages` | Yes: the workspace aliases and the closures come from it (`tools/stryker/workspace.ts:36-59`) | global. (14) Read two ways, and unchanged only when both readings are equal on the two sides: as YAML, which pnpm uses, and by `workspace.ts`'s own pattern reader (`:37-45`, exported as a pure `workspacePatterns(text)`), which every shard's aliases and every closure use and which a blank line or a column-0 comment inside the list cuts short; a throw on either reading is global (§15 S1) |
| `catalog`, `catalogs.<name>`, per entry | Only through the lockfile (catalogs are a locked setting, `:175234`) | mirror rule, as for devDependencies |
| `onlyBuiltDependencies`, `neverBuiltDependencies`, `ignoredBuiltDependencies` | Yes: which install scripts run (esbuild's binary, which tsx and Vite use) | global |
| `overrides`, `patchedDependencies`, `packageExtensions`, `ignoredOptionalDependencies` | Resolution; locked settings | global (the task's list; also fail closed) |
| `minimumReleaseAge`, `minimumReleaseAgeExclude`, `trustPolicy`, `trustPolicyExclude`, `trustPolicyIgnoreAfter` | No: a frozen install never resolves, so pnpm 10 never reads them there. pnpm 11.3's `trustLockfile` could fail an install, but never change a score, and moving to pnpm 11 is a `packageManager` change, which is global | inert |
| any anchor, alias or `<<` merge key, on either side | pnpm reads the file with js-yaml, which applies merge keys; the `yaml` package's YAML 1.2 default does not, so the two could disagree | global (fail closed) |
| (14) any explicit tag (`!`, `!!`), any parse error or warning (`doc.errors`, `doc.warnings`; a duplicate key is an error under `yaml`'s default), on either side; and a global key whose scalars' source text differs although the parsed values are equal | The two readers can differ on tags and on scalars such as `030` and `30` (js-yaml's exact reading not verified) | global (fail closed, §15 N12); the same rules hold for `mutation.yml` |
| every other key (`nodeLinker`, hoisting, `supportedArchitectures`, `injectWorkspacePackages`, …) | Layout or execution | global (fail closed) |

**`mutation.yml`**: the parsed document is compared, so comments and formatting are never a change ((14) formatting
that leaves a scalar's source text as it was; the YAML rules of the row above apply, §15 N12). The change is
**pin-only** when the two sides are equal after this one substitution, and only then: a value at
`jobs.<id>.steps[<i>].uses` (never a job-level `jobs.<id>.uses`, a reusable workflow that replaces a whole job) of the
form `<owner>/<repo>[/<path>]@<40 lowercase hex>` on **both** sides, with the same owner, repository and path, has its
SHA removed. `actions/upload-artifact` and `actions/download-artifact` are never substituted. So `docker://`, `./local`,
(14) a `$/` self-reference (no `@ref`, run at the workflow's own commit; github/docs 33b1f4a6 `workflow-syntax.md:741-749`),
a tag or branch ref (`@v7`, `@main`), a changed path, a job-level ref and an artifact-action move are all global, as is
any other difference (`runs-on`, `with:`, `run:`, a new or reordered step). The pattern is ci-deps' own `PIN`
(`ci-deps:tools/check-action-pins/workflows.ts:14`; (14) `tools/check-action-pins/workflows.ts:14` on the base), which
ci.yml's `Action pins` step (`ci-deps:ci.yml:80-86`; (14) `ci.yml:82-92`,
`pnpm actions:check`, ADR 0066 Part 2) applies to every workflow and which verifies a new SHA against its tag on
GitHub; P1 (Part 5) (14) added its age floor, with the job's token on that step (`:91`), and refuses a reusable
workflow of another repository (`workflows.ts:113-124`). P4 does not rely on those checks to stay sound: a ref it would
not vouch for is global here anyway.

A pin can change the runner, and nothing else: the checkout, the pnpm and Node installed. So a pin-only change runs
`money-ledger`, the one shard that holds whole packages (`stryker/shards.json`: money and ledger in full). Its canary,
its runtime check (§3.3) and the gate prove the new pins on the runner ((14) each step a pin moves has its leg: Node,
Unicode and ICU for setup-node; pnpm for action-setup; and, for the checkout, the commit each shard ran on, which must
be `GITHUB_SHA`, the merge commit on a pull request (§15 S2): a checkout that took another ref would pass every
shard's tests, and every push run checks out the pushed commit either way, so only this leg sees it). The artifact
transport is the exception: with
one shard the gate downloads and merges one artifact, never several, so a regression in merging several
(`merge-multiple: true`) would pass there and fail every later pricing or packets pull request. A move of either
artifact action is therefore global and runs (14) every shard. Dependabot's weekly `actions` group
(`ci-deps:.github/dependabot.yml:84-86`; (14) `.github/dependabot.yml:74-86` on the base: Tuesdays at 04:37 UTC, a
7-day cooldown) carries those two only in the weeks they move. (14) At bce57f16 all five `mutation.yml` pins are their
repositories' latest tags (`git ls-remote --tags`, 17:29:38Z), so no actions pull request touches it yet.

**Added to `GLOBAL_INPUTS`** (none exists today; each would change the install unseen): `.npmrc` (pnpm reads the
workspace root's), `.pnpmfile.*` (install hooks, though checksummed in the lockfile), `patches/**` (ci-mutation deleted
it; a patch's content is hashed in the lockfile); (14) and `.github/workflows/actions.lock`, GitHub's workflow
dependency lockfile, in public preview on github.com, under which "the locked commit is what runs" for an onboarded
workflow, transitive actions included (github/docs 33b1f4a6 `workflow-dependency-lockfiles.md:18, :26, :30-31, :34`).
(14) Also (§15): `**/package.yaml` and `**/package.json5`, which pnpm reads as a project's manifest when it has no
`package.json` (`pnpm.cjs:3423`, `:13505-13548`) and which `workspaceDirectories` never reads (`workspace.ts:58`), S8;
`.pnp.cjs`, which `pnpm exec` requires into every step (above), V7; and `.github/actions/**`, the files of a local
action, which `mutation.yml` would run unseen once it uses one, N14. None is tracked (`git ls-files`, 20:48Z).
Unchanged: `tsconfig.json` and `tsconfig.base.json`, which tsx and
Vite read, and every closure's `tsconfig.json`, which stay whole-file.

**Soundness, and its limit.** Every way these files reach a shard is a row above. A row is inert only when (a) the
frozen install refuses any lockfile the change does not match, or (b) no step and no closure file reads it, and a
guard test holds (b) ((14) "closure file" counting the files a shard loads by path, and the global closure grown from
them, §15 S3). For (a), the claim is exactly as strong as the lockfile rule (§3.4.1), the same rule every
non-root manifest already relies on today, and no stronger: when the lockfile moves with a specifier, the installed
tree changes. pnpm hoists every package into `node_modules/.pnpm/node_modules` (`hoist-pattern: *`), so a new root
dependency can change the version an imported third-party package reaches through an undeclared (phantom) require,
which the lockfile rule (it follows declared dependencies only) does not see. Today the root manifest's whole-file
rule happens to cover that; after P4 it is the lockfile rule's limit, named in Part 7's revisit list (§6). A pin-only
change is not claimed inert. It is proved on the runner, and the first push run measures every package with the
same pins.

## 3. What changes

### 3.1 `tools/stryker/affected.ts` and the new `tools/stryker/manifests.ts`
- `Change` (`:553-558`; (14) `:574-579`) gains `texts?: Record<string, { before?: string; after?: string }>`. (14) As
  typed (§15, the completeness critic's N-5): `texts?: Readonly<Record<string, { readonly before?: string | null;
  readonly after?: string | null }>>`, each side in one of three states: a string is that side's text, `null` says the
  file does not exist at that revision (absent), and `undefined`, or a file with no entry in `texts`, says it was not
  read (unread, which fails closed).
  `changeSince` (`:699-712`; (14) `:720-733`) fills it, as it does for the lockfile, for `package.json`,
  `pnpm-workspace.yaml`, `.github/workflows/mutation.yml`, and every changed `package.json` of a workspace directory
  (`workspaceDirectories`). (14) A file another `GLOBAL_INPUTS` glob matches is never classified and stays global
  (`tools/stryker/canary/lib/package.json`, under `tools/stryker/**`; E2). (14) Each side is the text, or `null` when
  the file does not exist at that revision, read from `git diff --name-status --no-renames` (A: no before, D: no
  after); a side that exists and that git cannot show fails closed (§15 S5). `changeSince` today folds both into
  `undefined` (`:725-731`).
- `classifyManifests(change, closures, global)` returns, per file: `global` (with the fields, for the reason line), the
  packages the mirror rule or the owner rule names, `inert`, or `runner-proof`. §2's tables are its constants:
  `LIFECYCLE_SCRIPTS` (the Stryker scripts are not in it: §3.2 lands in the same pull request), `DEPENDENCY_FIELDS`,
  `WORKSPACE_INERT_KEYS`, `PINNED_USES` (ci-deps' `PIN`), `TRANSPORT_ACTIONS`. Fail closed: no text on either side, a
  parse error, a YAML anchor, alias or merge key (`parseDocument`, then any `Alias` node or anchor), or a key in no list
  → global (root, workspace, workflow) or owners (closure manifest). (14) Corrected (§15, the completeness critic's N-2,
  V9): no text, an unread side or a parse error gives all four for **every** classified file, each workspace manifest
  included (a closure manifest, a global-holding one such as `tools/package.json`, and any other), since an install
  lifecycle script it might hold is global in each (§2); the owners answer above would have let a closure manifest's
  unseen `postinstall` run only its owners. A key in no list stays as §2's tables give it. As folded (§15):
  `LIFECYCLE_SCRIPTS` gains `prepublishOnly` (S7); `RUNTIME_NAMES` (`node`, `deno`, `bun`) and the registry-specifier
  test (B1); `dependenciesMeta` global in every workspace manifest (S7); `packages` compared by both readings,
  `workspacePatterns` imported from `workspace.ts` (S1); an explicit tag, `doc.errors` or `doc.warnings` global, and
  global keys' scalars compared by source text (N12); a key holding a control character global (N11); an absent side
  (`null`) judged against `{}` for a workspace manifest and global for the root manifest, the workspace YAML and
  `mutation.yml`, while an unread side stays fail-closed (S5).
- `affected()` (`:603-639`; (14) `:624-660`): a classified file is taken out of the global-glob test (`:613`; (14)
  `:634`, which only the three named files leave) and the manifest test (`:618`; (14) `:639`) and judged by its class. Each reason names the fields, e.g. `package.json scripts.lint (inert)`,
  `pnpm-workspace.yaml catalog.zod (imported by pricing, packets)`, `packages/db/package.json scripts.db:domain-model
  (inert)`. `RUNNER_PROOF_SHARD = 'money-ledger'` adds money and ledger. A test requires each of that shard's packages
  to have no other shard (`shardsOf`), so a rebalance cannot silently split one; (14) it reads the shards from
  `stryker/shards.json` and names no other shard (E10). (14) Every key a reason line prints, which the pull request
  controls, is printed with `JSON.stringify`, so no key starts a workflow command in the log or the step summary (N11).
- (14) `GLOBAL_LOADED` (new, §15 S3): the files a shard loads by path, not by import: `stryker/<package>.config.mjs`
  (`shards.ts:41`), `tools/stryker/seed-setup.ts` (`SEED_SETUP_FILE`, `vitest.mutation.config.ts:70`, `:127`), and the
  canary's `stryker.config.mjs` (`mutation.yml:92`), `vitest.config.ts` and five case tests (`CANARY_TESTS`,
  `canary/vitest.config.ts:10-16`). `globalFiles` (`:595-599`) follows imports from `GLOBAL_ENTRY_POINTS` and these
  together, so their imports join `global.imports` and their directories E1; a test holds the list equal to those
  loads. (14) Made exact (§15, the completeness critic's S-1 and N-4): `globalFiles` calls `importGraph(…, root, {
  includeTests: true })`, since `importGraph` skips every `*.test.ts`, seeds included, unless told
  (`tools/screening-capacity/watched.ts:128-136`), and five of these files are tests: without it they give no file at
  all (`tmp/fold2/s1.mts`, 21:12:32Z: `[]`, and 12 files with it). The global closure grown from `GLOBAL_ENTRY_POINTS`
  and `GLOBAL_LOADED` is then 29 files, not 18 (10 from the entry points alone), the 11 it gains all
  `tools/stryker/canary/**` files, among them `lib/index.ts` (`@tp/stryker-canary`), and
  `global.imports` keyed by `tools` gains `@tp/stryker-canary` and `fast-check`; the global-holding directories become
  `.`, `tools` and `tools/stryker/canary/lib`, whose manifest a glob already holds (E2); `closureProblems` stays `[]`
  (`tmp/critic/fixcheck.mts`, re-run 21:12:45Z). The canary's `vitest.config.ts` is loaded by path, as the
  `vitest.configFile` of `canary/stryker.config.mjs:25`; only `canary/verdict.test.ts:8` imports it. `AffectedConfig`
  (`:206-216`) gains an optional `globalLoaded` (`REPOSITORY_CONFIG`'s is `GLOBAL_LOADED`), so a synthetic world names
  its own. No replayed pull request changes: the added files are under `tools/stryker/**`, `fast-check` is a
  `TEST_TOOLING` name (`:118`; only #48 moves it, global both ways, `tmp/replay.out:321`), and the
  `@tp/stryker-canary` entry (`tools/package.json:32`) came in with the canary itself (ffb51d09, `git log -S`).
- (14) Every `git` the changes job spawns (`:688`, `:706`, `:721`, `:740`) gets `PATH` with each `node_modules/.bin`
  entry removed, so no dependency's bin answers for git (§15 B1).
- `GLOBAL_INPUTS` gains `.npmrc`, `.pnpmfile.*` and `patches/**` ((14) and `.github/workflows/actions.lock`; and, §15,
  `**/package.yaml`, `**/package.json5`, `.pnp.cjs` and `.github/actions/**`); the header
  comment (`:38-39`) states the field rule. (14) The `--github-output` write (`:776`) keeps its three outputs exactly
  (E12).

### 3.2 Stryker run by path, not by root script or bin
- New `tools/stryker/stryker.ts`: `runStryker(args, env)` spawns `process.execPath` on the `bin.stryker` file of
  `@stryker-mutator/core`. (14) In full (§15, the completeness critic's N-3): `runStryker(args, env, root =
  repositoryRoot, spawn = spawnSync)`, resolving from `root` and spawning with `cwd: root`, as `runShard` passes `cwd:
  root` today (`shards.ts:37-45`); `runShard(name, root, spawn)` hands its `spawn` through, so a test injects a recorder
  and no test starts a real Stryker run. It resolves that package's `package.json`, which its `exports` allow
  (`./package.json`), from the repository's root (`createRequire`). The bin file itself is not exported
  (`ERR_PACKAGE_PATH_NOT_EXPORTED`). As a CLI: `pnpm -s exec tsx tools/stryker/stryker.ts run <config>`.
- `shards.ts:41` calls it. `mutation.yml:92`'s canary line becomes
  `pnpm -s exec tsx tools/stryker/stryker.ts run tools/stryker/canary/stryker.config.mjs`.
- Why: today a root devDependency that adds a `stryker` bin would win the link over `@stryker-mutator/core` (both are
  direct, neither has the bin's own name, and `@` sorts first, `:103356-103362`), and a `prestryker` script would run.
  With the narrowing, neither change would reach mutation, so the tooling stops depending on either. `tsx` stays a bin:
  it carries its own name, so no other package can take it (`:103357-103360`).
- Stryker then starts without the `npm_lifecycle_*` and `npm_package_*` variables `pnpm stryker` set. Nothing in
  `stryker/`, `tools/stryker` or the Vitest runner reads them (the builder greps and says so in the pull request), and
  acceptance 4 compares mutant counts and statuses, not only the verdict, to prove it. (14) Its `NODE_PATH` changes
  too (§15 N8): the canary's Stryker gets the stryker shim's today (`@stryker-mutator/core`'s own `node_modules`
  directories and `.pnpm/node_modules`, `node_modules/.bin/stryker:12-16`) and a shard's Stryker that with tsx's
  appended; by path, both get tsx's alone (`node_modules/.bin/tsx:12-16`). Both carry `.pnpm/node_modules`, and
  `stryker/base.mjs:83` names the runner plugin; the builder's grep includes `NODE_PATH`, and acceptance 4 is the proof
  (Stryker's plugin resolution under it is not verified here).
- The root `stryker` script stays, for people (`docs/runbooks/ci.md:325, 332`; (14) `:589, :596`).

### 3.3 Every shard's runtime held to the pins (`tools/stryker/canary/verdict.ts`, `tools/stryker/gate.ts`)
- The verdict's `runtime` (`verdict.ts:57-66`) gains `pnpm`, taken from `npm_config_user_agent` (`^pnpm/(\S+) `).
  The verdict runs under `pnpm -s exec`, which sets it (`makeEnv`, `:202927`; user agent `:19036`).
- (14) The verdict also records `commit`, the commit its shard ran on (§15 S2): `headCommit(root)` reads `.git` (a
  directory, or a `gitdir:` file as in a worktree), then `HEAD`, a detached SHA on a pull request (`git checkout
  --progress --force refs/remotes/pull/N/merge`) or `ref: refs/heads/<branch>` on a push (`checkout --progress --force
  -B claude/build-platform …`, `raw-pins/runs/log-122652986211.txt`), resolved through the loose ref (in the git
  directory, then its `commondir`) or `packed-refs`; anything else gives `''`. It reads files only (`verdict.ts:1`
  imports `node:fs`), so no closure file gains a spawn (E3). The gate requires every shard's `commit` to be 40 hex,
  equal to the others', and, on Actions (`GITHUB_ACTIONS` is `true`), equal to `GITHUB_SHA`, a default variable read
  from `process.env`, so `mutation.yml` gains no `${{ }}` expression (E12); off Actions it holds them equal only, and
  says so.
- (14) The pins are the gate judge's input, `{ node, unicode, icu, pnpm }` and the expected commit (§15 S4): only
  the CLI reads them, through the new `tools/stryker/runtime.ts` (`readPins(root)`: `unicode.json`'s `checkedOn` and
  `package.json:5`'s `packageManager`, parsed with the pattern below), so no test reads the repository's manifest
  and a `packageManager` bump touches no test. `runtime.ts` also holds the pattern, `pnpmOfUserAgent`, and
  `runtimeProblems(runtime, pins)`, which the gate, the shard's gate view and the changes job share. The Node leg
  compares `v` + `checkedOn.node` with `process.version` (`v24.22.0` against `24.22.0`; `gate.test.ts:392` already
  pairs the two forms), N15.
- (14) **The changes job checks its own runtime before it decides** (§15 B1): a step before "What the change affects"
  runs `pnpm -s exec tsx tools/stryker/runtime.ts`, which fails, naming each difference, unless this process's Node,
  Unicode, ICU and pnpm equal the pins. It runs through the same shims as every later step, so a `node` bin a root
  dependency links fails the pull request's own `mutation` check, whatever the classifier decided; on a push it fails
  the run before any shard.
- The gate fails any shard that ran on a Node other than `unicode.json`'s `checkedOn.node` (which `workflows.test.ts`
  already holds equal to `mutation.yml`'s, (14) `:2618-2625`), on other Unicode or ICU data, or on a pnpm other than root
  `packageManager`'s. `packageManager` is parsed with `^pnpm@(\d+\.\d+\.\d+)(\+sha(?:1|224|256|384|512)\.[0-9a-f]+)?$`;
  anything else (another manager, a range, a tag) fails the gate, naming the value. Today the gate checks Unicode
  only for shards that score bound equivalents (`gate.ts:352-361`). Every shard is pinned to that Node already, so
  the stricter rule fails only a runner that did not install what the workflow asked for. That is what a pin change
  could do, and it is what makes §2's runner proof meaningful.
- (14) The pnpm leg checks what a `pnpm/action-setup` pin controls. That action installs its own bootstrap pnpm
  (11.25.0 at v6.1.0, its `src/install-pnpm/bootstrap/pnpm-lock.json:12`) and runs `self-update` to `packageManager`'s
  version (`src/install-pnpm/run.ts:38, :108-114`; job 122675954379 logs "Switching pnpm from v11.25.0 to v10.34.8"),
  so a bump of that pin moves both the bootstrap and the switch. (14) As corrected (§15 N9): when action-setup works,
  the pnpm on `PATH` already is `packageManager`'s, and when its `self-update` fails the step fails (`run.ts:114-117`),
  so pnpm 10's `manage-package-manager-versions` (`pnpm.cjs:18940`, switch at `:214066`) never acts on a mutation
  runner; were a later action-setup to leave another pnpm on `PATH`, the only guard behind the leg would be that pnpm's
  own handling of `packageManager`. The 2026-10-26 text called the leg "close to tautological" on pnpm 10's setting;
  the leg is the check. Node, Unicode, ICU, pnpm (14) and the commit are each legs a pin change can move.

### 3.4 Also corrected
§3.2.1's load plan and §3.4.1 say `browser-tests` reaches no money closure. At 6ddd587 it does: `tools/package.json`
is a manifest of pricing's closure (`tools/golden-worksheet`, `tools/content-files.ts`), so #38's `playwright-core`
line ran pricing's three shards (replayed, §9). After ci-browser that line is `catalog:` and Dependabot edits the
catalog instead, which today runs (14) every shard. Under P4 both run none, since no closure imports `playwright-core`. ADR
0066 Part 7 records the correction.

## 4. Files
- New: `tools/stryker/{manifests.ts, manifests.test.ts, stryker.ts, stryker.test.ts}`.
- Changed: `tools/stryker/{affected.ts, affected.test.ts, shards.ts, shards.test.ts, gate.ts, gate.test.ts}`,
  `tools/stryker/canary/{verdict.ts, verdict.test.ts}`; `.github/workflows/mutation.yml` (the canary line `:92`, and the
  header comment `:10-13`; (14) `:10-18`); `tools/test/workflows.test.ts` (`:1364`'s expected canary line, (14) `:2537`;
  the guard rules, §5; (14) after #86 merges, the cites in its bounded-value rows to `affected.ts:776` and
  `mutation.yml:44-47`, `:77`, E12); `tools/test/collection.test.ts` `FILES` (the new tests; (14) `:28-46`).
- (14) Added by §15: new `tools/stryker/{runtime.ts, runtime.test.ts}` (B1, S4); changed `tools/stryker/workspace.ts`
  (`workspacePatterns` exported from `:37-45`, behaviour unchanged, S1), `tools/stryker/test-support.ts`
  (`TEST_RUNTIME` gains `pnpm`, `canaryOf` a `commit`, and `TEST_PINS`, S2, S4), and `mutation.yml`'s changes job (the
  runtime step, B1); and `fixtures/synthetic/CI-2{7,8,9}/expected.json`, which `pnpm synth --all` writes and the
  integrator commits (S6). (14) Added by §15's completeness critic: `tools/stryker/canary/stryker.config.mjs`, whose
  comment (`:17-18`) says the shard's step runs `pnpm stryker run` (N-10).
- Documents and registries: §6.
- Not touched: `package.json`, `pnpm-workspace.yaml`, the lockfile and every other manifest; `stryker/**`;
  `vitest.mutation.config.ts`; any money code or test; `watched.ts`; any migration.

## 5. Tests (failing first)
Commit 1 holds the cases marked ★ and exports a stub `classifyManifests` that returns `global` for every file, so
each ★ narrowing case fails on its assertion, not on a missing module. Cases marked ◆ are guards: green against
6ddd587 and after, and there to stay green. Commit 2 makes the ★ cases pass. All run on synthetic worlds
(`affected.test.ts`'s `syntheticWorld`) or on this repository's own graph.

(14) 14.6 lists the cases as amended at bce57f16 (49, one `it` each; 65 after §15's fold, with the commits and builders) and governs where
the two differ. The additions are F9's, F10's and F11's manifest cases, `$/` and `actions.lock` (D7, D8), the gate's
reach to every shard (V5) and `shards.test.ts`'s case; no case names a shard or counts them (E10), since #84 rewrites
the shard list. (14) §15 amends 14.6 again (its cases, files, commits and counts); 14.6 as amended governs, and the
lines below marked "(14)" point to it.

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
  closure manifest); `affects(['package.json'])` with no texts still gives all four (`affected.test.ts:242`). (14) A
  missing side now means an unread one; an absent side (an added or deleted file) is judged against `{}` for a
  workspace manifest (§15 S5, 14.6). (14) And every workspace manifest, a closure one included, gives all four when
  it fails closed (§3.1), not its owners or none: 14.6 puts those assertions in ★ cases and edits
  `affected.test.ts:237-238`.
- ★ comments alone affect none (YAML comments; JSON whitespace). (14) Except a blank line or a column-0 comment inside
  `packages`, which the mutation tooling's own reading sees (§15 S1).

`affected.test.ts`:
- ★ `mutation.yml`: only step `uses:` SHAs (same path, 40 hex both sides) and their comments changed gives money and
  ledger, with the reason "pins only: runner proved on money-ledger" ((14) built from `RUNNER_PROOF_SHARD`, not
  written, §15 N16); ★ a comment-only change gives none.
- ◆ `mutation.yml` gives all four for: a SHA to `@v7`, `@v7` to a SHA, `@main`; a job-level `uses:` ref; `docker://`
  and `./local` refs; (14) a `$/` reference; a path change (`actions/checkout` to `foo/checkout`); an `actions/upload-artifact` or
  `actions/download-artifact` SHA move; `runs-on`, `with:`, `run:`, a new step or a step-order change.
- ★ `RUNNER_PROOF_SHARD`'s packages each have exactly that shard in `stryker/shards.json`. (14) ◆, not ★: with the
  constant exported it passes in commit 1, and without it commit 1 does not typecheck (§15 N1).
- ◆ `.npmrc`, `.pnpmfile.cjs` and `patches/x.patch` ((14) and `.github/workflows/actions.lock`) give all four (★ until
  `GLOBAL_INPUTS` gains them).
- On this repository's graph: the replay of §9 for #3, #31, #40 and #43 as fixtures (each pull request's changed
  manifests and workflow at base and head, copied in as text; they hold no PHI and no repository data beyond
  manifests and a workflow): none, pricing and packets, all four, none. (14) #31's fixture gives pricing alone, the
  owners of `tools/package.json` (its `exports`), read from the closures, not named: its "pricing, packets" came from
  `packages/db/src/**` files, not manifests (`tmp/replay.out:154-163`; §15 S10).
- `:334-338` ((14) `:345-349`; "all four for the mutation tooling") keeps every glob, with the manifests given a global
  field.

`workflows.test.ts` (the guards that hold the "every other script" rows inert):
- ★ every `run:` in `mutation.yml` is one of an allowlist of whole commands: `pnpm install --frozen-lockfile`,
  `pnpm -s exec tsx tools/stryker/<file>.ts …` (the changes job, the canary, the shard, the gate), and the gate job's
  and changes job's own shell lines, each listed verbatim. No `node --run`, `npm`, `npx`, `corepack`, or `pnpm` other
  than those two forms, anywhere.
- ★ over the union of the global entry points' closure and the four packages' closures (`repositoryClosures`,
  `globalFiles`): (14) as written this failed on the base, since `affected.ts` imports `node:child_process` (`:1`) to
  run `git` (`:688, :706, :721, :740`) and the names also occur in `watched.ts` and `vitest.mutation.config.ts`. As
  amended (F14, E3): no file imports `node:child_process` or `child_process` other than `tools/stryker/affected.ts`,
  whose spawns are asserted to be `git` alone, and `tools/stryker/stryker.ts`, whose spawn is asserted to be
  `process.execPath` with the Stryker bin and nothing else (`shards.ts` calls `runStryker` and imports none); and no
  file contains the literal `package.json`, `pnpm-workspace.yaml` or `mutation.yml` except those this test lists with
  what each reads (`affected.ts` and `manifests.ts`, as data for the classifier; `workspace.ts`, every manifest's `name`
  and `exports` and the workspace's `packages`; `stryker.ts`, to find the bin; `gate.ts`, the root `packageManager`;
  `tools/screening-capacity/watched.ts`, its path list; `vitest.mutation.config.ts`, comments), each entry required to
  still hold its literal. (14) As folded (§15, E3): the union also holds `GLOBAL_LOADED` and their imports (S3); the
  `packageManager` reader is `runtime.ts`, not `gate.ts` (S4); `tools/stryker/canary/stryker.config.mjs` is listed for
  its comment (`:5`); and the scanned literals gain `read-pkg`, `read-package-up`, `pkg-up`, `@npmcli/package-json` and
  `npm_package_` (N13).
- the canary line is the new one.

`gate.test.ts`: ★ a shard whose verdict names Node v24.21.0, or pnpm 10.34.9 against `packageManager` 10.34.8, fails,
naming both; a verdict without `pnpm` fails ("no runtime"); (14) a shard that scores no bound equivalent and names
ICU 77.1 fails (V5); a matching one passes; `packageManager`
`pnpm@10.34.8+sha512.<hex>` matches 10.34.8; `pnpm@^10`, `yarn@4.0.0` and `pnpm@10.34` fail closed. (14) §15 adds
the commit leg (S2), the existing cases' edits (S4) and `runtime.test.ts` (B1); 14.6.
`verdict.test.ts`: the user agent `pnpm/10.34.8 npm/? node/v24.22.0 linux x64` gives `10.34.8`, and none gives `''`.
`stryker.test.ts`: it resolves `bin.stryker` through `package.json` and spawns `process.execPath`; a missing package
fails, naming it.

## 6. Documents
- **ADR 0066, Part 7** (new, after Part 6): the context (`:111-120`'s whole-file globals, `:618`'s manifest rule,
  ((14) `affected.ts:121-130`, `:639`) and their cost); (14) a Part 7 line in the header's Status, Date, Deciders and
  PRD sections, where Part 5's sit (`:28-30`, `:31`, `:35-38`, `:52-53`); its notices numbered after #86's N32 and P2's
  Part 6 (E6); the decision (§2's tables, fail closed, order-sensitive fields, the mirror and owner rules, the
  runner proof and why transport is excluded, Stryker by path, the runtime check); the measurement (§9); the
  alternatives (§10); the correction of §3.4; and when to revisit: pnpm 11, whose frozen install checks the release
  age and trust policy; a new workspace key; a shards rebalance that splits money or ledger; the hoisting limit of §2
  (phantom requires through `node_modules/.pnpm/node_modules`, which neither the lockfile rule nor P4 sees); a later
  pnpm that stops checking specifiers on a frozen install; (14) the repository adopting `.github/workflows/actions.lock`,
  after which pin-only must read its entries for `mutation.yml` the way §2 reads step SHAs.
- **ADR 0066 Part 4**, `:413` ((14) `:1163-1164`; "the root manifest, the workspace list, the root tsconfigs and the workflow affect all
  four") gains "(narrowed field by field by Part 7)". Part 4's text otherwise stands. (14) Also Part 4's gate rule
  (`:1104-1106`: an equivalent resting on Unicode data fails only when a shard scoring it ran on other Unicode or ICU
  data) gains "(and every shard is held to the pinned Node, Unicode, ICU and pnpm and to the tested commit by Part 7)",
  since Part 7 widens it (§15 S4).
- **`docs/runbooks/ci.md`**, "Mutation testing" `:205-206` ((14) `:469-470`): the field rule in one paragraph, with
  the reason lines a person will see; `:325`'s ((14) `:589`'s) local canary command may stay `pnpm stryker run`, and
  gains the by-path form CI uses. (14) Also, in sections P4 already rewrites: the Dependabot paragraph (`:194`, "mutation
  in full (31 to 36 runner-minutes) when it changes the root manifest, the catalog or `mutation.yml`") restated for
  Part 7's field rule and today's cost; "What runs" (`:453`, "all six shards") becomes "every shard"; and the shard
  table (`:474-481`, with no packets-explain row since #52) takes one time column from CI (E7), keeping #84's rows.
  (14) Also "Running it locally" (`:585-586`, "on the Node the workflow pins (24.22.0: the gate holds the Unicode-bound
  equivalents to its data)"): the gate now holds every shard to the pinned Node, Unicode, ICU and `packageManager`'s
  pnpm, and the shards' commits to each other, so a local run uses that Node and that pnpm and runs every shard on one
  commit (§15, the completeness critic's N-10).
- **`mutation.yml:10-13`** ((14) "What runs" `:10-15`, the Node lines `:17-18`): the header names the field rule, the
  runner proof and the transport exception.
- **`docs/product/reconciliation-001.md`**, the CI series list (`:143-146`): one line after item 4, as P1 does
  (`p1-design.md:258`): "P4 (`co-001/ci-mutation-trigger`, ADR 0066 Part 7, CI-27 to CI-29): mutation runs only for
  manifest fields and pins a shard reads; an engineering item of §3.2.6." (14) P1 did not: its record is a paragraph
  and a bullet under the co-founder's 2026-10-26 ruling (`:659`, `:661`), and item 4 (`:146`) is unchanged. P4's record
  takes P1's form and goes last there, after P1's and after #86's, which merges first. (14) And after P2's, which
  appends its own entry after #86's and merges before P4 (`follow-up-p2-trivy-version.md:365-368, :656, :1068`; §15,
  the completeness critic's N-8).
- Outside the pull request: `/home/user/ops/lanes/lane-b.md` (the ops branch's lane log, a session commit, not a
  repository file; `git ls-files` has no `lanes/`) records P4 done, with the replay's figures. (14) Corrected (§15
  N17): the session records P4's result, with the replay's figures, in its status file
  (`approval-summaries/lane-b-ci-deps-status.md`); the orchestrator writes `lanes/lane-b.md` from it
  (`lanes/lane-b-session-brief.md:54`).
- (14) Part 7's revisit list also names: a new file a shard loads by path (`GLOBAL_LOADED`'s test fails until it is
  listed), and pnpm reading a new manifest form or a new install-time script (§15 S3, S7, S8).

## 7. Test-matrix rows (and `packages/synth` cases)
| ID | Case | Assertion |
|---|---|---|
| CI-27 | Mutation from the manifests and workspace, field by field | (14) A change confined to fields no shard reads (a non-lifecycle script in the root or any workspace manifest, a dependency or catalog entry no closure or tooling imports, the release-age and trust settings, a workspace manifest added or deleted with no install script) runs no package; a dependency or catalog entry a closure imports, or a closure manifest's module fields, run that package; the pnpm, Node and module settings, an install lifecycle script (`prepublishOnly` included) or `dependenciesMeta` in any workspace manifest, a root `node`, `deno` or `bun` entry or a specifier that is not a registry one, the test tooling, the workspace list as YAML or as the mutation tooling reads it, a reordered order-sensitive field, a YAML anchor, alias, tag or duplicate key, a `package.yaml`, `package.json5` or `.pnp.cjs`, the mutation tooling's own tsconfig, and any unlisted or unparseable field run all four |
| CI-28 | A pin-only workflow change proved on the runner | A change to `mutation.yml` that moves only step action SHAs, same action on both sides and neither artifact action, runs every shard of money and ledger and no other; a tag, branch, job-level or artifact-action ref, or any other change to it, runs all four; a comment-only change runs none |
| CI-29 | Every shard on the pinned runtime | (14) Each shard's canary verdict names its Node, Unicode, ICU, pnpm and commit, and the gate fails a shard whose runtime differs from the pinned Node or `packageManager`'s pnpm, or whose commit is not the one tested; the changes job fails, before it decides, on any other runtime; the tooling runs Stryker by path, and no mutation step or closure file, a file a shard loads by path included, runs a root or package script |

The intro sentence (`test-matrix.md:211-212`; (14) `:257-264`, rewritten, since `:261-262` says CI-21 to CI-23
"complete the series" and P2 rewrites it first) gains "CI-27 to CI-29 narrow what affects mutation (Part 7)". In
`matrix.ts`, three rows go after CI-26, in `CI-17`'s form (`:292`; (14) `:435`). In `registry.ts`, each is `none(0, …)`:
"Manifests, workspaces and workflows are synthetic, written to a temporary directory, or this repository's own; no
file." Each is listed with its test files, after `CI-17` (`:465`; (14) after P2's CI-26, under a comment of its own in
the per-part form of `:628`). Then `pnpm synth --all`. CI-17's wording stands. (14) That run writes
`fixtures/synthetic/CI-2{7,8,9}/expected.json` (each CI row has one: CI-01 to CI-23 at bce57f16; P1 added CI-21's in
edbc928e), which the integrator commits; a later rewording of CI-27 to CI-29 regenerates them (§15 S6).

## 8. Builders
(14) Superseded by 14.6: two builders on disjoint files (B1 the classifier; B2 Stryker by path, the runtime and the
workflow) and an integrator (E5). The 2026-10-26 plan was:
One builder, M5, owns everything in §4: the classifier, `affected.ts`, `stryker.ts`, `shards.ts`, the verdict and gate
change, `mutation.yml`'s line, the tests and `collection.test.ts`. The files are tightly coupled, and about 550 lines
of code and tests is one builder's work. An integrator owns the documents, the matrix, synth, the fresh-clone
verification, and acceptance 1 (the replay, run from the scratchpad clone with the PR's `affected.ts`; the prototype
is `scratchpad/p4/sim2.ts`; (14) not on this machine: the prototype is `/home/user/laneb-sp/p4reread/tmp/scripts/replay.mts`,
archived with the design, E9) and 4 (the full run on the PR, compared per package with the base's last push run; (14)
per file, with the push run of the merge commit's first parent, E4).

## 9. Measured: what the narrowing saves
(14) Re-measured at bce57f16 in 14.3: seven shards, the ten latest push runs' means (53.88 runner-minutes a full run),
58 pull requests (22 full runs → 15, about 297 runner-minutes, none narrowed since #49), and the weekly projection at
up to about 157. The figures below are the 2026-10-26 record at six shards and 35 pull requests; 14.3 governs. On CI a
pull request is diffed from its fork point, not from its merge base with the tip (14.1, D4), so CI runs at least what
this replay counts.

Method: a shared clone (`git clone --shared`, PR heads fetched as `refs/pull/*/head`), and each pull request's head
against its base's merge base. Both are run through 6ddd587's `repositoryClosures`, `globalFiles`, `unionClosures` and
`affected`, as-is ("current") and with §2's classifier ("narrowed"; prototype `scratchpad/p4/sim2.ts`, output
`scratchpad/p4/sim2.out`; the pre-review prototype and output are `sim.ts`, `sim.out`; (14) none of the four is on this
machine; the 2026-11-01 prototype is `/home/user/laneb-sp/p4reread/tmp/scripts/replay.mts`, which reproduces sim2's
result on every pull request sim2 listed, E9). Older pull requests are judged
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
open, some 15% of §3.2.1's 550-650 Thursday batch ((14) a share not re-verified, since the batch figure was never
re-measured; 14.3 drops it), and the 20 job slots free sooner then.

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
  artifacts, about 16.6 minutes; (14) at bce57f16 packets' three shards, four artifacts and about 36.6 minutes, and
  five packets shards once #84 merges), would prove the merge but not that pricing's artifacts upload; the safer reading
  (all six; (14) every shard) costs a full run only in the weeks those two actions move.
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
- C11. **The added globals** (`.npmrc`, `.pnpmfile.*`, `patches/**`; (14) and `.github/workflows/actions.lock`; and,
  §15, `**/package.yaml`, `**/package.json5`, `.pnp.cjs` and `.github/actions/**`) and
  **YAML anchors as global** close gaps in today's rule. None exists, so nothing runs more today.

## 11. Interplay
- **ci-mutation's rule** ("each package's shards all or none", CI-17) holds: the classifier names packages, never
  shards, and the runner proof names a shard that holds its packages whole, held by a test.
- **Lane A's #42** (`pr42-files.txt`) shares `docs/product/test-matrix.md`, `docs/product/reconciliation-001.md` and
  `packages/synth/src/cases/{matrix,registry}.ts`. These are LANES rule 6 documents, and P4 writes its own rows and
  line. The pull request merged second keeps both and runs `pnpm synth --all`. P4 touches no other #42 file: no
  lockfile, manifest, `watched-paths.txt` or ADR 0062; (14) except `tools/test/workflows.test.ts`, which #42 (be63bdc2,
  219 files) edits at `:1799-1815` (ci.yml's identity steps), outside P4's describe and not on the "Not while #42 is
  open" list (`LANES.md:84-92`), so both are kept. #42 edits `tools/screening-capacity/**` (no closure file),
  whose `tools/package.json` script #31 added; after P4, a script-only edit of `tools/package.json` runs no shard.
- **ci-deps and ci-browser** merge first ((14) merged: #48, e908c214; #77, ecebdc90). P4 classifies their keys as §2
  lists them (`minimumReleaseAge*`,
  `trustPolicy*` inert; `overrides` global; the catalog's `eslint`, `typescript-eslint` and `playwright-core` lines
  inert under the mirror rule). ci-browser's `runs-on` change to `mutation.yml` stays global, which is correct. At the
  cut, re-read `stryker/shards.json`: if ci-browser's O7 rebalance (§3.3.5) has split money or ledger, the
  `RUNNER_PROOF_SHARD` test fails and the builder moves the constant to a shard that holds whole packages. (14) Read at
  bce57f16: seven shards (#52 added packets-explain), money-ledger holds money and ledger whole and no other shard
  holds either; #84, which merges before P4, makes nine and leaves money-ledger so (head e3299ea2). P4 relies
  on ci-deps' `PIN` pattern (copied, not imported, so P4 stays sound if check-action-pins changes).
- **P1 (Part 5)** and **P2 (Part 6)** edit `tools/check-action-pins`, `tools/check-toolchain`, `ci.yml` and
  `release.yml`, not `mutation.yml` or `tools/stryker`. They share ADR 0066, the matrix, synth and
  `reconciliation-001.md` under rule 6, and all three edit `tools/test/workflows.test.ts` (`p1-design.md:194`,
  `p2-design.md:255`, here §5): different `describe` blocks, so the pull request merged later (14) merges the latest
  `claude/build-platform` in with a merge commit (`LANES.md:32`; never a rebase) and re-runs
  `pnpm test` (rule 6 covers documents, not tests, so this is the merge-order rule of §3's series). (14) P1 merged as
  #82 without touching `mutation.yml` or `tools/stryker`; a later pull request that bumps a step SHA in `mutation.yml`
  is pin-only, and P1's age floor vouches for the new SHA.
- (14) **#84 and #86** also share files with P4 (`tools/stryker/affected.test.ts` and `shards.test.ts`; ADR 0066,
  reconciliation-001, `ci.md` and `workflows.test.ts`'s bounded-value rows): 14.4.
- **P5** (catalog lines) is cheaper under P4: its catalog edits are inert unless a closure imports the package.

## 12. Risks and rollback
- R1. **A later pnpm checks the release age or trust policy on frozen installs** (pnpm 11.3's `trustLockfile`). That
  can fail an install, never change a score, and it arrives through `packageManager`, which is global. Part 7's revisit
  list names it.
- R2. **A pin-only change that breaks only the pricing or packets shards.** The runtime check (§3.3) catches the
  mechanisms a step pin controls: Node, ICU and pnpm. The artifact transport is never pin-only (§2), so the window
  holds only what a checkout, pnpm or Node action change could break in those shards and not in money-ledger's, which
  runs the same steps. That shows on the first push run, which runs every package minutes after the merge ((14) about
  16 minutes: 13.5 to 19.5 of wall time over the last ten push runs), and on the weekly run. (14) Not for a checkout
  pin that changes what a pull request checks out: every push run checks out the pushed commit either way, so no push
  run would show it; the commit leg (§3.3) shows it on the pin-only pull request itself (§15 S2).
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
| N2 shared `workflows.test.ts` | True | Fixed: named in §11 with the rebase order ((14) a merge commit, never a rebase, `LANES.md:32`) |
| N3 reconciliation-001 claimed but not edited | True | Fixed: P4 adds its line, as P1 does (§6) |
| N4 `lanes/lane-b.md` not in the repository | True | Fixed: marked as the ops branch's file, outside the PR (§6) |
| N5 ★ cases already green | True | Fixed: stub `classifyManifests` in commit 1; ★ narrowing vs ◆ guard cases (§5) |
| N6 `packageManager` parse | True | Fixed: the regex, `+sha512.` and fail-closed cases (§3.3, §5) |
| N7 pnpm leg near-tautological | True (`:18940`, `:214066`) | Fixed: its scope stated (§3.3). (14) Superseded: pnpm/action-setup installs a bootstrap pnpm and switches it, so the leg checks what that action's pin controls (§3.3 as edited; D6) |
| N8 YAML merge keys | True (js-yaml vs `yaml` 1.2) | Fixed: anchors, aliases and merge keys global (§2, §3.1, §5) |
| N9 env change under Stryker by path | True | Fixed: acceptance 4 compares mutant counts and statuses; the builder greps for readers (§1, §3.2) |
| N10 `name` reason; O7 sentence | True (`:205081`) | Fixed: `name` global with the cite; O7 replaced by the re-read at the cut (§2, §11) |

Net effect on the measurement: full runs 16 → 9 (the draft said 7), seven pull requests narrowed (the draft said
nine), about 173 runner-minutes at final heads (the draft said 215): S1 and S2 take #37 and #40 back to full, and S7
adds #3's remaining 16.4.

## 14. Re-read at bce57f16 (2026-11-01)

Re-read on 2026-11-01 from 17:23Z against `claude/build-platform` bce57f16 (#82, P1, merged 17:19:46Z; `git ls-remote`
at 17:50:24Z still names it). Since the design's 6ddd587 and ci-deps' 19e3d98e these merged: ci-deps #48 (e908c214),
#49, #76, ci-browser #77 (ecebdc90), #80, #79, #74, #81, #78 (83d71fd6) and P1 #82. The worktree is
`/home/user/ci-mutation-trigger` at bce57f16 with `node_modules` installed. Two scouts read it first, each in
`/home/user/laneb-sp/p4reread/`. One read the files and code (`scout-files.md`): every design cite compared at
bce57f16; the closures and a guard scan computed (`tmp/scripts/closures.mts`, `guards.mts`); all 58 pull requests into
the build branch replayed through bce57f16's own `affected.ts` and through a prototype of §2's tables
(`tmp/scripts/replay.mts`, output `tmp/replay.out`, totals `tmp/replay-summary.txt`); and `vitest run --project unit
tools/stryker tools/test` under the lock (32 files, 392 tests passed). The other read the versions, upstream facts and
runs (`scout-pins.md`): the lockfile and the npm registry at 17:24Z, Node's ICU data at three tags, pnpm/action-setup
ea17c68d's source and a CI log, every job of the last ten push runs of `mutation`, the three open Dependabot pull
requests' runs, and github/docs at 33b1f4a6 (raw output `raw-pins/`). This revision re-checked at bce57f16 every code
cite it uses (17:50Z to 18:10Z), recomputed the shard means from `raw-pins/runs/jobs.tsv` (`scripts/means.py`),
recounted the replay's states, and read the open pull requests' changed files and hunks from the API (`gh api
…/pulls/<n>/files`, 17:52Z to 17:58Z). Where this section and §1 to §13 differ, this section governs. §1 to §13 were
edited in place only where a fact, a cite or a statement of what P4 builds had become wrong, so that no builder copies
stale text; each edit is marked "(14)" and listed in 14.9. "F n" is scout-files' item n under "Changes the design
needs", "D n" scout-pins' item n, and "V n" a finding of this revision.

### 14.1 What changed from the 2026-10-26 text, and why

| § | Change | Evidence |
|---|---|---|
| Header | **Adopted, in place** (F1). Cut locally at bce57f16; ci-deps, ci-browser and P1 merged; every cite re-mapped in 14.2. Since 6ddd587, `tools/stryker` changed in three files (`affected.ts`, `affected.test.ts`, `shards.test.ts`; #49 and #52), `stryker/` in two (`shards.json`, `base.mjs`; #52), `mutation.yml` by #48 (pins) and #77 (runners). `workspace.ts`, `shards.ts`, `gate.ts` and `canary/verdict.ts` are unchanged. | `git diff --stat 6ddd587 bce57f16` over those paths (scout-files §1) |
| §1 goal, acceptance 4, §2 transport, §3.4, C6 | **Adopted, in place** (F2, F4, D1, D12). "All six shards" becomes "every shard": seven at bce57f16 (`stryker/shards.json:12, :38, :46, :64, :80, :88, :96`; #52 added packets-explain), (14) at least nine once #84 merges, whose fix round splits `packets-words` further (§15 N7). A full run costs 52.0 to 57.8 runner-minutes, mean 54.8 with the changes and gate jobs, 53.88 for the shards alone, not 31 to 36. Taken: the ten latest push runs (40339580137 to 41330911489) over scout-files' twelve (53.38, 40316928522 to 40646308297), because they include bce57f16's own run and six runs on ubuntu-26.04; the two differ by under 1%. | `raw-pins/runs/jobs.tsv`; `scripts/means.py` re-run at 18:00Z |
| §1 acceptance 1, §9 | **Adopted, in place, with a correction** (F3, D2, F22). The 58 pull requests into the build branch are 37 merged, 12 closed unmerged and 9 open. Scout-files' "13 closed, 8 open" miscounts #42, which is open. Replayed at bce57f16's sets and shards: full runs 22 → 15; the same seven run less (#2, #3, #4, #6, #25, #31, #43); about 297 runner-minutes saved at final heads at the ten-run means (294.3 at the replay's twelve); none of the 25 since the design (17 merged, #48 and #49 at their final heads among them, and 8 opened after #49) runs less; no package is widened or lost on any of the 58. The design's 35 (#1 to #49: 22 merged, 12 closed, #42 open) give 17 → 10, not 16 → 9, because #49's final merge adds `tools/stryker/affected.ts`, full both ways. §9 stays as the 2026-10-26 record, marked; 14.3 has the current table. | `tmp/replay-summary.txt`, recounted at 18:02Z; `tmp/replay.out` |
| §1, §9 method: the two sides on CI | **Adopted, in place** (D4). A `pull_request` run's `BASE` is `github.event.pull_request.base.sha` (`mutation.yml:63`), which three runs and the REST answers for five open pull requests show to be the fork point (`git merge-base <head> <tip>`), not the tip GitHub merged into; `affected.ts` diffs its merge base with HEAD (`:740`), and HEAD is the merge commit. So base commits since the fork count as the pull request's. P4 stays sound: at the field level that is a superset of what the merge changes, a clean merge cannot set a field the base changed back to its old value, and a pull request with a conflict does not run. CI therefore runs at least what §9 counts. Ending that over-charge changes the rule for every file, so it is P30, not P4. | runs 41331792024, 40651775778, 41329075505 (scout-pins §4); github/docs 33b1f4a6 `events-that-trigger-workflows.md:462, :466, :473-481` |
| §1 acceptance 4, §8 | **Adopted, in place** (D3), **and extended** (V3). The run compared is the push run of the merge commit's first parent, which the checkout log prints as "Merge <head> into <tip>", not `base.sha`'s and not "the base's last push run". The counts are read per file from each shard job's Stryker table, because the proxy refuses artifact downloads, so `reports/mutation/*.json` is out of reach (`lanes/lane-b.md:246`); a mutant that moves only between Killed and Timeout is listed, not a failure (E4). Three money-ledger push-run logs give identical tables: the canary 20 killed, 1 survived, 3 errors; money 226 killed, 8 survived, 7 errors; the ledger 2,005 killed, 13 timed out, 31 survived. | job logs 122411254697, 122652986211, 122675954379 (`raw-pins/runs/`) |
| §2 a shard's steps | **Adopted, in place** (F5, D5). The steps are `mutation.yml:81-107`, with the shard's own gate view (`:96-98`) before the upload; that view judges nothing (`gate.ts:49`). pnpm/action-setup v6.1.0 installs its bootstrap pnpm 11.25.0 and runs `self-update` to `packageManager`'s 10.34.8 (`package.json:5`, with `+sha512`). | action-setup ea17c68d `src/install-pnpm/bootstrap/pnpm-lock.json:12`, `src/install-pnpm/run.ts:38, :108-114`; job 122675954379: "Switching pnpm from v11.25.0 to v10.34.8" |
| §3.3, §13 N7 | **Adopted, in place** (D6). The pnpm leg is a real check: an action-setup pin moves the bootstrap pnpm and the code that switches it, and `manage-package-manager-versions` is a second guard behind that. (14) Overstated (§15 N9): that setting never acts on a runner, since a working action-setup leaves `packageManager`'s pnpm on `PATH` and a failed `self-update` fails the step (`run.ts:114-117`); §3.3 says so. | as above |
| §2 root table | **Adopted, in place** (F6). Keys at `package.json:2-57`. The scripts added since 6ddd587, `actions:check` and `toolchain:check` (#48, `:37-38`), are inert, as P2's `trivy:pin` will be. Eight root devDependencies are `catalog:` (`:47-49, :51, :53-56`), so their bumps arrive as catalog lines, which the workspace table judges by the same mirror rule; a specifier moved to or from `catalog:` is judged by its name, so a `TEST_TOOLING` one stays global. | `package.json:9-57`; `pnpm-workspace.yaml:11-29` |
| §2 workspace table | **Adopted, in place** (F7). No `catalogs`, `patchedDependencies`, `packageExtensions` or anchors at bce57f16; `minimumReleaseAgeExclude: []` is a flow sequence, which the YAML reader parses like any other. | `pnpm-workspace.yaml:1-52` |
| §2 cites into ci-deps; P1 | **Adopted, in place** (F8, D9). `PIN` is `tools/check-action-pins/workflows.ts:14`; "Action pins" is `ci.yml:82-92`, given the job's token by P1 (`:91`); Dependabot's actions group is `.github/dependabot.yml:74-86` (Tuesdays 04:37 UTC, 7-day cooldown `:82-83`). P1 also refuses a reusable workflow of another repository (`workflows.ts:113-124`); P4 does not rely on it. All five `mutation.yml` pins are their repositories' latest tags, so the Tuesday 2026-11-03 run cannot touch it. | `git ls-remote --tags` at 17:29:38Z (scout-pins §3) |
| §2 other workspace manifests | **Adopted, in place** (F9). `workspace.ts:83-91` reads every workspace manifest's `name` and `exports` into the aliases every shard uses (`vitest.mutation.config.ts:88-123`). They stay inert because `closureOf` resolves imports by the same reading (`resolveWorkspaceImport`, `workspace.ts:124`: the longest matching name, then the workspace's order, the order the aliases are built in), so an edit that captures an import a closure makes turns that manifest into a closure manifest at the head, and its owners run. A ◆ case holds it (14.6). | `workspace.ts:83-91, :124`; `vitest.mutation.config.ts:88-123` |
| §3.1, §5: the canary's manifest | **Adopted, the safer option, in place** (F10, E2). A file another `GLOBAL_INPUTS` glob matches is never classified and stays global; only `package.json`, `pnpm-workspace.yaml` and `.github/workflows/mutation.yml` leave the glob test. As written, `tools/stryker/canary/lib/package.json` (a workspace manifest, `pnpm-workspace.yaml:8`, under `tools/stryker/**`, `affected.ts:123`) would have become an "other workspace manifest" whose `exports` edit is inert, yet the canary's case 3 imports it by name in every shard (`canary/linked.test.ts:1`). (14) Corrected (§15 N2): #44 added it (`tmp/replay.out:286`, where the prototype, lacking E2, called it inert); #44 runs every shard either way, so nothing runs more. | `tools/stryker/canary/lib/package.json:7-9` |
| §2 closure table: `tools/package.json` | **Adopted, the safer option, in place** (F11, E1). `tools/package.json` (`"type": "module"`, `:5`) is the manifest of the global entry points' own files, yet today it counts for pricing alone. For a manifest whose directory holds a file the global entry points reach, `type`, `imports`, an install lifecycle script and every unlisted key are global; `exports` and `name` stay its owners'; other scripts are inert; dependency entries follow the mirror rule against its owners' imports and the global ones (`yaml`, keyed by `tools`). The set is computed from the global closure, not named (E1). No replayed pull request changes class: #31's edit there is `exports` and a script. | the global closure at bce57f16 (scout-files §1): `tools/stryker/{affected,gate,mutants,shards,workspace}.ts`, `tools/stryker/canary/verdict.ts`, `tools/content-files.ts`, `tools/screening-capacity/watched.ts`, `stryker/base.mjs`, `vitest.mutation.config.ts` |
| §3.1 cites | **Adopted, in place** (F12); 14.2. | `affected.ts` at bce57f16 |
| §3.2, §3.3, §4 cites | **Adopted, in place** (F13); 14.2. | as cited |
| §5 the guards | **Adopted, the safer option, in place, and widened** (F14, V2). As written they fail on the base: `affected.ts` imports `node:child_process` (`:1`) to run `git` (`:688, :706, :721, :740`), and the three names also occur in `watched.ts` (`:70-86`, its list) and `vitest.mutation.config.ts` (`:82-86`, comments). After P4 they also occur in `manifests.ts` and `stryker.ts`, and `gate.ts` reads the root `packageManager` (§3.3; (14) `runtime.ts` does, §15 S4). So `child_process` is allowed only in `affected.ts` (`git` alone) and `stryker.ts` (`process.execPath` with Stryker's bin), and the names only in `affected.ts`, `manifests.ts`, `workspace.ts`, `stryker.ts`, `gate.ts`, `watched.ts` and `vitest.mutation.config.ts`, each listed with the fields it reads, all of them global or owner fields under §2; each entry must still hold its literal, so the list cannot go stale (E3). **Declined:** matching reads rather than literals (scout-files' alternative), because a read can be built in ways a pattern misses, while a literal scan fails closed and a short reviewed list stays true. | `tmp/scripts/guards.mts`; `affected.ts:1, :688, :706, :721, :740`; `gate.ts:1` |
| §5, #84 | **Adopted, in place** (F15, D14, E10). No P4 test names a shard or counts them; the `RUNNER_PROOF_SHARD` test derives from `stryker/shards.json`. #84 rewrites `affected.test.ts:361-367` and `shards.test.ts:23, :69` for nine shards and leaves money-ledger holding money and ledger whole at its head e3299ea2. | `git show refs/pull/84/head:stryker/shards.json` (scout-pins §2, 17:36Z) |
| §2, §5: `$/` | **Adopted** (D7, E11). `uses: $/<path>` (a same-repository reference with no `@ref`, run at the workflow's own commit) joins the global forms with a ◆ case. Free: `PIN` and `workflows.test.ts:2627-2633` already refuse it. | github/docs 33b1f4a6 `workflow-syntax.md:741-749` |
| §2, §3.1, §5, §6, C11: `actions.lock` | **Adopted, the safer option** (D8, E11). `GLOBAL_INPUTS` gains `.github/workflows/actions.lock`, GitHub's workflow dependency lockfile (public preview on github.com; for an onboarded workflow "the locked commit is what runs", transitive actions included, and Dependabot rewrites the entry in the same pull request), with a ◆ case and a Part 7 revisit line. No such file exists, so nothing runs more. | github/docs 33b1f4a6 `workflow-dependency-lockfiles.md:18, :26, :30-31, :34`; `lock-workflow-dependencies.md:107-109` |
| §6 ADR | **Adopted, in place, with a correction** (F16). #86 renumbers its notice N29 to N32 (`LANES.md:198`) and P2's Part 6 merges before P4, so Part 7 goes after Part 6, and its notices take the numbers after Part 6's (provisionally N33 on, E6; (14) N43 on, since P2's G8 gives Part 6 N33 to N42, E6 as amended). Part 7 adds a line to the header's Status, Date, Deciders and PRD sections where Part 5's sit (`:28-30`, `:31`, `:35-38`, `:52-53`). | ADR 0066 at bce57f16; `approval-summaries/lane-b-ci-images-digest-status.md:57-59` |
| §6 `ci.md` | **Adopted, in place** (F17), **and extended** (E7). Cites `:469-470`, `:589`, `:596`; three more edits in the sections P4 already rewrites: the Dependabot paragraph (`:194`, "31 to 36 runner-minutes ... when it changes the root manifest, the catalog or `mutation.yml`"), "What runs" (`:453`, "all six shards"), and the shard table (`:474-481`, no packets-explain row since #52). | `docs/runbooks/ci.md` at bce57f16 |
| §6 `mutation.yml` header | **Adopted, in place** (F18): "What runs" `:10-15`, the Node lines `:17-18`. | `mutation.yml:10-18` |
| §6 reconciliation-001 | **Adopted, in place** (F19). P1's record is the paragraph at `:659` and the bullet at `:661`, under the co-founder's 2026-10-26 ruling, not a line after item 4 (`:146`, unchanged). #86 appends its own record there before P4 merges, so P4's paragraph and bullet go last. | `reconciliation-001.md:141-146, :653-661`; #86's diff (`@@ -655,3 +655,7 @@`) |
| §7 | **Adopted, in place** (F20). The intro is `test-matrix.md:257-264`, whose "and complete the series" (`:261-262`) P2 rewrites first; `matrix.ts` CI-17 is `:435`, the block ends with CI-23 `:441`; `registry.ts` gets its rows after P2's CI-26 under a comment of its own in the form of `:628`. | `test-matrix.md:257-264`; `matrix.ts:419-441`; `registry.ts:604-631` |
| §8, §9 prototype | **Adopted, in place** (F21, E9). `scratchpad/p4/sim2.ts` and its outputs are not on this machine. The prototype that exists is `/home/user/laneb-sp/p4reread/tmp/scripts/replay.mts`, which reproduces sim2's result on every pull request sim2 listed; it is archived with the design, and acceptance 1 is run with the pull request's own `affected()`. | `find / -name sim2.ts` (scout-files, 17:41Z) |
| §9 shard times, savings, projection | **Adopted in 14.3; §9 marked in place** (F22, D10, D11). The 2026-10-26 figures stay as that day's record. "Eight npm groups" was right then and is right now: seven version-update groups plus `security` (`dependabot.yml:49-72`). **Declined: recomputing** "some 15% of §3.2.1's 550-650 Thursday batch", since that batch figure (`ci.md:194-195`) was never re-measured; the share is dropped and the minutes stand alone. | `raw-pins/runs/jobs.tsv`; `.github/dependabot.yml:49-72` |
| C6 | **Adopted, in place** (F23, D12). The transport alternative is now four artifacts and about 36.6 minutes (money-ledger 4.54 plus packets' three shards 32.05), more once #84 gives packets five. | 14.3 |
| §11 | **Adopted, in place** (F24). The pull request merged second merges the base in with a merge commit (`LANES.md:32`), never a rebase; ci-deps and ci-browser merged; the shards were read; #42 also edits `tools/test/workflows.test.ts` (`:1799-1815`, not P4's describe, and not on the "Not while #42 is open" list, `LANES.md:84-92`); P1 merged without touching `mutation.yml`. | `LANES.md:31-36, :84-92`; #42's files (219, read at 17:55Z) |
| §12 R2 | **Adopted, in place** (D13): the first push run is about 16 minutes after the merge (13.5 to 19.5 over the last ten). | `raw-pins/runs/push-runs2.json` |
| §11 the shards at the cut | **Adopted, in place** (D14), with F15. | as above |
| §3.3, §6 | **Adopted in 14.3, no edit** (D15): no newer Stryker, vitest, tsx or fast-check release exists; Node 24.22.1 and 24.22.2 carry 24.22.0's ICU 78.3 and Unicode 17.0. | scout-pins §1 |
| §4, §6, 14.4: #86's bounded values (V1) | **New.** #86 adds a test that admits only listed expressions into a step's environment, input or script, each row naming its producer by file and line; the rows for `mutation.yml` cite `tools/stryker/affected.ts:776` (the `--github-output` write) and `mutation.yml:44-47` and `:77`. The test checks only the cite's form, so P4, which moves those lines and merges after #86, updates the three cites in its merge of the base, and adds no expression to `mutation.yml` (its one workflow edit is the canary's `run:` text) (E12). | #86's `workflows.test.ts` patch (`gh api …/pulls/86/files`, 17:57Z): `AFFECTED` and the seven `mutation.yml` rows; `affected.ts:776` |
| §5 `gate.test.ts` (V5) | **New.** §3.3's rule holds every shard to the pinned Unicode and ICU, where `gate.ts:351-361` checks only shards that score bound equivalents; §5 had no case for that reach. ★ A shard with no bound equivalent whose verdict names ICU 77.1 fails. | `gate.ts:351-361` |
| §8 builders (V6) | **Changed** (E5): two builders on disjoint files and an integrator, in place of one, so the classifier and the runtime work run in parallel. | 14.6 |
| §6, 14.6: the capacity gate (V4) | **New.** P4 edits `packages/synth/src/cases/{matrix,registry}.ts`, which the capacity measurement watches (`tools/screening-capacity/watched-paths.txt:463, :466`), so its pull request runs `screening-capacity` (about 17 minutes on P1's, 16:59Z to 17:16Z). | `watched-paths.txt:463, :466`; `approval-summaries/lane-b-ci-deps-status.md:30` |

### 14.2 Cites at bce57f16

Old cites are the design's, at 6ddd587 (or ci-deps' branch, marked); new ones are at bce57f16, each read there. Builders
work from the new column.

| Design § | Old | New (bce57f16) |
|---|---|---|
| §1, §3.1, §6 | `affected.ts:111-120`, `GLOBAL_INPUTS` | `:121-130` (`tools/stryker/**` `:123`, `package.json` `:125`, `pnpm-workspace.yaml` `:126`, `mutation.yml` `:129`) |
| §1, §3.1, §6 | `affected.ts:618`, the manifest test | `:639` |
| §2 | `affected.ts:108`, `TEST_TOOLING` | `:118` |
| §2 | `affected.ts:378-391`, `Closure.imports` | the field `:377`; `importsOf` `:395-408` |
| §2 | `affected.ts:403-415`, the closure's manifests | `closureOf` `:414`; manifests `:420`, `:428-432` |
| §2, §3.1 | `affected.ts:623-637`, the lockfile rule | `:644-658` |
| §3.1 | `affected.ts:553-558`, `Change` | `:574-579` (the paths and the lockfile's texts only) |
| §3.1 | `affected.ts:603-639`, `affected()` | `:624-660` |
| §3.1 | `affected.ts:613`, the global test | `:634` |
| §3.1 | `affected.ts:699-712`, `changeSince` | `:720-733` (texts for `pnpm-lock.yaml` only, `:732`) |
| §3.1 | `affected.ts:38-39`, the header | `:38-39` (unchanged) |
| review S3 | `affected.ts:126`, `DATA_ROOTS` | `:136` |
| (new) | none | `GLOBAL_ENTRY_POINTS` `:133`; `globalFiles` `:595-599`; `shardsFor` `:681`; `node:child_process` `:1`, `git` at `:688, :706, :721`, `git merge-base` `:740`; the `--github-output` write `:776` (#86's row cites it) |
| §5 | `affected.test.ts:242`; `:334-338` | `:242`; `:345-349`; #84 rewrites `:361-367` |
| §2, §3.2 | `shards.ts:41` | `:41` (`runShard` `:37-50`) |
| §3.3 | `canary/verdict.ts:57-66` | `Runtime` `:58-62`, `currentRuntime` `:64-66` |
| §3.3 | `gate.ts:352-361` | `:351-361`; `runtimeOf` `:222`; `canaryProblem` `:228-235` ("names no runtime" `:235`); `--shard` judges nothing `:49` |
| §2 | `workspace.ts:36-59` | `:36-59` (unchanged); `workspacePackages` `:83-91`; `resolveWorkspaceImport` `:124` |
| (new) | none | `vitest.mutation.config.ts`: the aliases `:88-123`, comments naming the manifests `:82-86` |
| §2 | `mutation.yml:81-98`, a shard's steps | `:81-107`: checkout `:81`, action-setup `:84`, setup-node 24.22.0 `:85-88`, install `:89`, canary `:90-93`, shard `:94-95`, the shard's gate view `:96-98`, upload `:100-107` |
| §3.2, §4 | `mutation.yml:92`, the canary line | `:92` |
| §2 | `mutation.yml:168-186`, `:181-186` | `:168-186`; download `:181-186`; the gate job `:112-191` |
| §4, §6 | `mutation.yml:10-13`, the header | "What runs" `:10-15`; the Node lines `:17-18` |
| (new) | none | `changes` `:41-64` (`BASE` `:63`, the affected call `:64`), its outputs `:44-47`, the shards' matrix `:77`, `runs-on: ubuntu-26.04` `:42, :72, :116`, `node-version: 24.22.0` `:56, :87, :177`, `on.pull_request` with no filter `:22` |
| §4, §5 | `workflows.test.ts:1364` | `:2537` (the canary line); the mutation describe `:2469-2657`; `on` `:2495`; the affected step `:2518-2520`; Node equal to `unicode.json` `:2618-2625`; every step pinned `:2627-2633` |
| §4 | `collection.test.ts` `FILES` | `:28-46` (ci-browser's block `:44-46`) |
| §2 | `package.json:2-55` | `:2-57` (`packageManager` `:5`, `engines` `:6-8`, `scripts` `:9-40`, `stryker` `:39`, `devDependencies` `:41-57`) |
| §2 | `pnpm-workspace.yaml:1-29`; ci-deps `:31-43` | `:1-52` (`packages` `:1-8`, the canary's `:8`; `catalog` `:11-29`; `overrides` `:33-34`; `onlyBuiltDependencies` `:37-38`; `minimumReleaseAge` `:44`; `minimumReleaseAgeExclude` `:45`; `trustPolicy` `:50`; `trustPolicyExclude` `:51-52`) |
| §2 | `ci-deps:tools/check-action-pins/workflows.ts:14`, `PIN` | `tools/check-action-pins/workflows.ts:14`; `reusableWorkflowProblems` `:113-124` |
| §2 | `ci-deps:ci.yml:80-86`, Action pins | `ci.yml:82-92` (the token `:91`) |
| §2 | `ci-deps:.github/dependabot.yml:84-86` | `.github/dependabot.yml:74-86` (the group `:84-86`, cooldown `:82-83`); npm's groups `:49-72` |
| §2, §11 | `stryker/shards.json` (six shards) | seven: money-ledger `:12`, packets-scan `:38`, packets-rest `:46`, packets-explain `:64`, pricing-engine `:80`, pricing-recompute `:88`, pricing-rest `:96` |
| §2 | `dist/pnpm.cjs` lines (pnpm 10.34.8) | unchanged; read at `/opt/pnpm-10.34.8/dist/pnpm.cjs` (scout-files, 17:27Z) |
| §6 | ADR 0066 `:413` | `:1163-1164`; header Status `:3-30` (Part 5 `:28-30`), Date `:31`, Deciders `:32-48` (Part 5 `:35-38`), PRD sections `:49-61` (Part 5 `:52-53`); Part 4 `:1002-1272` (Revisit `:1265-1271`); Part 5 `:1273-1681` (Notices N23 to N31 `:1608-1629`, Revisit `:1674-1681`) |
| §6 | `ci.md:205-206`, `:325`, `:332` | `:469-470`, `:589`, `:596`; also the Dependabot paragraph `:189-196` (`:194`), "What runs" `:451-472` (`:453`), the shard table `:474-481` |
| §7 | `test-matrix.md:211-212` | `:257-264` (`:261-262`); rows CI-01 to CI-23 `:268-290` (CI-17 `:284`) |
| §7 | `matrix.ts:292` | CI-17 `:435`; the CI block `:419-441` |
| §7 | `registry.ts:465` | CI-17 `:623`; the per-part comments `:604, :615, :620, :624, :628`; CI-23 `:631` |
| §6 | `reconciliation-001.md:143-146` | `:141-146`; P1's record `:659`, `:661` (the file's last line) |
| (new) | none | `tools/package.json:5` (`"type": "module"`), `:7-11` (`exports`); `tools/stryker/canary/lib/package.json:7-9`; `canary/linked.test.ts:1`; `tools/stryker/unicode.json:3-7` (`checkedOn`) |

### 14.3 Versions and facts measured today

**Stryker and the runtime, as locked at bce57f16** (scout-pins §1, read 17:23Z to 17:40Z):

| Item | Version | Where |
|---|---|---|
| `@stryker-mutator/{api,core,instrumenter,util,vitest-runner}` | 10.1.1 (published 2026-10-23T19:18:22Z, 9.0 days old) | `pnpm-lock.yaml:2233-2253`, `:5323-5380`; root `^10.1.1`, `package.json:44-46` |
| vitest-runner's peer on core | exactly 10.1.1 | `pnpm-lock.yaml:2249-2253` |
| `vitest`, `@vitest/coverage-v8` | 5.0.5 (2026-10-15) | `pnpm-lock.yaml:3825`, `:2451`; catalog `pnpm-workspace.yaml:16, :28` |
| `tsx`, `fast-check`, `vite`, `esbuild` | 4.23.15, 4.10.2, 8.3.4, 0.28.2 | `pnpm-lock.yaml:3718`, `:2859`, `:3782`, `:2787` |
| pnpm | 10.34.8 (2026-10-23T18:06:37Z), with `+sha512` | `package.json:5` |
| Node in all three jobs | 24.22.0 (Unicode 17.0, ICU 78.3) | `mutation.yml:56, :87, :177`; `tools/stryker/unicode.json:3-7`; held equal by `workflows.test.ts:2618-2625` |
| pnpm/action-setup | v6.1.0 (ea17c68d), bootstrap pnpm 11.25.0, self-updates to `packageManager` | its `src/install-pnpm/bootstrap/pnpm-lock.json:12`, `src/install-pnpm/run.ts:38, :108-114` |

- Stryker by path (§3.2) holds: the installed core 10.1.1 exports only `.` and `./package.json`, its bin is
  `./bin/stryker.js`; resolving `@stryker-mutator/core/package.json` from the root works, and the bin by specifier fails
  `ERR_PACKAGE_PATH_NOT_EXPORTED` (scout-pins, 17:25Z; `node_modules/@stryker-mutator/core/package.json` re-read here).
- `pnpm -s exec node` prints `npm_config_user_agent` = `pnpm/10.34.8 npm/? node/v24.22.0 linux x64`,
  `PNPM_PACKAGE_NAME=therapy-platform` and no `npm_lifecycle_event` (17:26:04Z): exactly §5's `verdict.test.ts` string.
- Newer releases (npm, 17:24Z; the floor is 4,320 minutes): no newer Stryker; vitest's `latest` is 5.0.5 and only
  5.1.0-beta.1, a prerelease `^5.0.5` excludes, is newer; tsx, fast-check and esbuild are each `latest`; vite 8.3.5 is
  aged but reached only through vitest, so its move is a `TEST_TOOLING` snapshot and global; pnpm 10.34.9 (7 days) is
  a `packageManager` move, global. Node 24.22.1 (2026-10-20, a security release, seven CVEs) and 24.22.2 (2026-10-27)
  carry 24.22.0's ICU 78.3 and Unicode 17.0 (`uvernum.h` and `tools/icu/current_ver.dep` at each tag), so a later move
  of mutation's Node, global under P4, leaves the runtime check's Unicode and ICU legs as they are (P31).
- (The Trivy release, its commit, signing time, SHA-256 and age, Sigstore's npm packages and Trivy's database are
  P2's, recorded in P2's re-read; P4 reads none of them.)

**What a full run costs now** (the ten push runs 40339580137 to 41330911489, all green, each `changes`, seven shards
and the gate; minutes from each job's `started_at` to `completed_at`; `raw-pins/runs/jobs.tsv`, recomputed 18:00Z):

| Job | Mean | Median | Min | Max | §9 (2026-10-26) |
|---|---|---|---|---|---|
| money-ledger | 4.54 | 4.83 | 3.13 | 5.10 | 4.0 |
| packets-scan | 7.17 | 7.54 | 5.00 | 8.53 | 6.4 |
| packets-rest | 13.15 | 14.21 | 8.80 | 15.35 | 6.1 |
| packets-explain | 11.73 | 12.56 | 7.55 | 13.47 | (none) |
| pricing-engine | 7.48 | 7.87 | 4.78 | 10.18 | 7.2 |
| pricing-recompute | 4.08 | 4.31 | 3.08 | 4.60 | 4.0 |
| pricing-rest | 5.73 | 5.81 | 3.97 | 7.13 | 5.2 |
| **shards** | **53.88** | | | | 33.0 |
| `changes`, the gate | 0.45, 0.44 | | | | |

- Per package: money and ledger 4.54, pricing 17.29, packets 32.05. All jobs: 52.0 to 57.8 a run, mean 54.8 (56 to 64
  with each job rounded up); wall time 13.5 to 19.5 minutes, mean 15.9. The repository is public and billable time is
  0 (`/actions/runs/40646308297/timing`), so these minutes are job slots, not money.
- Runner: ubuntu-26.04 from 40593100114 (#77) on; on 26.04 alone the shards sum to 52.91, so packets-rest's doubling
  (6.1 to 13.15) follows #52, not the image (P33).
- After #84 (nine shards: `packets-roles` took 10.07 minutes in its run 40646243545, and `packets-words` was cancelled at
  30.30 by the 30-minute timeout, `mutation.yml:73`), a full run is at least about 94 runner-minutes. Not verified until
  #84 fits that shard under the timeout. (14) Both figures are floors (§15 N7): #84's fix round splits `packets-words`
  further by word family (`approval-summaries/lane-b-packet-day-counts-status.md:30`), so at least nine shards and at
  least about 94 runner-minutes.

**The replay, re-priced** (the 58 pull requests into the build branch, `tmp/replay-summary.txt`; at the ten-run means;
"current" is bce57f16's `affected.ts`, "P4" the prototype (`tmp/scripts/replay.mts`); final heads). (14) The prototype
is not the specification (§15 N3): it hard-codes the workspace directories (`replay.mts:121`) and implements neither E2
(`replay.out:286`) nor F11, nor §15's rules; no replayed pull request reaches what it lacks (`tmp/fold1/check58.sh`,
20:37Z), so its results stand, and acceptance 1 is run with the pull request's own `affected()` (E9):

| Pull request | P4 runs | Saved (runner-minutes) | §9 (2026-10-26) |
|---|---|---|---|
| #2, #4 (a root script) | money-ledger (ledger) | 49.34 each | 29.0 each |
| #3 (`db:domain-model`, root and `packages/db`) | none | 53.88 | 33.0 |
| #6 (`lint`) | pricing, ledger | 32.05 (packets) | 12.5 |
| #25, #43 (scripts) | none | 53.88 each | 33.0 each |
| #31 (`screening:capacity`; `tools/package.json` `exports`) | pricing, packets | 4.54 | 4.0 |
| **Total** | | **296.9** (294.3 at the replay's twelve-run means) | 173 |

- All 58 (37 merged, 12 closed unmerged, 9 open): full 22 → 15, partial 8 → 12, none 28 → 31; no package widened or
  lost. The replay's "current" equals the shards every final-head mutation run actually chose (#42 6, #48 7, #49 7,
  #51 7, #52 7, #76 3, #77 7, #84 9 of its own, #87 7, #89 6, the rest none; `tmp/final-head-runs.tsv`).
- None of the 25 since the design runs less: every full run there comes from the mutation tooling (#49, #51, #52, #84),
  `runs-on` and `watched.ts` (#77), `packageManager`, the artifact actions and the test tooling's lockfile entries (#48),
  or a lockfile move of vitest's tree (#87), each global under P4 as well.
- The first Dependabot npm batch (2026-10-29) saves nothing: #87 (`@anthropic-ai/sdk` 0.131.0 to 1.3.0) ran all seven
  (run 40818722504) because the lockfile moves `@opentelemetry/api` 1.9.1 to 1.10.0, which re-keys vitest's snapshot in
  every importer, a `TEST_TOOLING` move under both rules (P32); #88 (aws-cdk) ran none (40818798127); #89
  (minor-and-patch, 10 updates) ran pricing and packets (40819336871), and under P4 the same two packages run: (14)
  corrected (§15 N4), its two closure-manifest reasons do not drop but are named by the mirror rule
  (`packages/contracts/package.json dependencies.@aws-sdk/client-textract (imported)`, `tmp/replay2.out:140-147`), beside
  the lockfile's `@aws-sdk/client-kms` and `-textract` moves.
- A week, projected at today's means, with ci-deps' groups (`dependabot.yml:49-86`): `actions` without an artifact-action
  move 53.88 → 4.54 (plus the changes and gate jobs either way), 49.3 saved; `next` and `browser-tests` 53.88 → 0
  each; a release-age or trust exclude alone 53.88 → 0; a catalog `zod` line 53.88 → 49.34. Up to about 157
  runner-minutes in a week when `actions`, `next` and `browser-tests` all open (§9 said about 95), more once #84's
  shards land. Each "→ 0" holds only while the lockfile move reaches no closure import and no `TEST_TOOLING` snapshot,
  which #87 shows a package outside every closure can still do. No Dependabot actions pull request has opened since
  #40, so the `actions` line is untested.

**GitHub's behaviour P4 relies on** (github/docs 33b1f4a6, committed 2026-10-31; scout-pins §4):
- A `pull_request` run tests the merge commit on `refs/pull/N/merge` (`events-that-trigger-workflows.md:462, :473-481`),
  does not run while the pull request conflicts (`:466`), and is not re-run when only the base moves (the default
  types, `:465`). Its `base.sha` is the fork point (14.1; three runs, five REST answers).
- Paths filters fail open past 3,000 changed files (`triggering-a-workflow-paths5.md:3-12`) and leave a skipped
  required check Pending (`skip-workflow-runs.md:21`); `mutation.yml` uses none (`:19-27`), as P4 keeps.
- Step references are `{owner}/{repo}[/{path}]@{ref}` (`workflow-syntax.md:680, :709, :727`), `./` (`:774`),
  `docker://` (`:780-821`), and the new `$/path` (`:741-749`); a job-level `uses:` is `:1550`.
- Dependabot rewrites `owner/repo@<commit>` with its same-line version comment and ignores `./` and `docker://`
  references (`dependabot-version-updates-actions-caveats.md:1-4`): acceptance 2's shape.
- Workflow dependency lockfiles (`.github/workflows/actions.lock`) are in public preview on github.com
  (`data/features/actions-workflow-lockfiles.yml`); the repository has none.

**What P4's pull request is expected to print on CI:**
- `mutation`, `changes`: "diffed from <fork point> … (the merge base of <fork point> and HEAD)", then every package
  "affected by tools/stryker/affected.ts (mutation tooling, every package); …", at most five reasons a package (the
  cap of `affected.ts:628`); `mutation.yml`'s reason, where listed, names the field that changed (a step's `run`) as
  global; shards: every shard (seven at bce57f16, (14) at least nine after #84).
- Each shard: action-setup's "Switching pnpm from v11.25.0 to v10.34.8"; the canary with no "> therapy-platform@
  stryker" banner (today's log prints one before every Stryker run: job 122675954379, its log's lines 253-254, 306-307, 410-411),
  since Stryker starts by path; the verdict's line (`verdict.ts:150`) naming Node v24.22.0, Unicode 17.0, ICU 78.3 and
  pnpm 10.34.8; "stryker (<shard>): <package>" per package with no banner; Stryker's per-file table; the shard's gate
  view with its runtime (E8).
- (14) The changes job's runtime step: Node v24.22.0, Unicode 17.0, ICU 78.3 and pnpm 10.34.8, equal to the pins,
  before "What the change affects" (§15 B1); each verdict and shard view also names the commit, the merge commit
  `GITHUB_SHA` (§15 S2).
- The gate: every package scored, every shard's runtime (14) and commit equal to the pins, and per file the same counts by status as
  the push run of the merge commit's first parent (acceptance 4, E4). About 55 runner-minutes at seven shards; at
  least about 94 at (14) nine or more.
- `ci`: `unit` at the counts of 14.6; "Action pins" prints "age: no pin new against the base, nothing read"
  (`tools/check-action-pins/age.ts:795`), since P4 adds no pin; "Toolchain" finds no manifest or lockfile change.
- `screening-capacity`: the measurement runs (P4 changes two watched files, 14.1 V4) and its gate must pass.

### 14.4 Overlaps and merge order

The merge order is #86, then #75, #84, #83 and #85; P2 and then P4 merge after their own pipelines (the session's
brief, section 4a). P4 therefore merges after every pull request below, and it resolves each overlap as the pull
request merged second: it merges the latest `claude/build-platform` in with a merge commit (`LANES.md:32`), keeps both
sides of every shared document (`:34`), regenerates what a generator writes (`:35`: `pnpm synth --all`; `watched.ts
--write` if the list moves; P4 changes no lockfile), and never rebases. Files and hunks are from `gh api
…/pulls/<n>/files` (17:52Z to 17:58Z; #42 paged in full, 219 files).

(14) Refreshed at 21:17Z to 21:18Z (§15, the completeness critic's N-7; `git ls-remote`, `gh api …/pulls/<n>` and
`…/files`). **#83 merged out of that order** at 2026-11-01T20:40:34Z, so `claude/build-platform` is 43565235, 16
commits past bce57f16 (`git rev-list --count`). The order that remains is #86, #75, #84 and #85, then P2 and P4.
#83's hunks lie after every P4 region (`test-matrix.md` from `:345`, `matrix.ts` from `:467`, `registry.ts` at
`:720`), and it touches no other file P4 edits, so the bce57f16 cites hold at 43565235, except one: the two lines V4
cites in `tools/screening-capacity/watched-paths.txt`, `:463` and `:466` at bce57f16, are `:465` and `:468` there
(`git show 43565235:…`, V10). Building on bce57f16 stands (below); the first merge of the base brings #83 in.

| Pull request | Files it shares with P4, and the hunks | What P4 does at its merge |
|---|---|---|
| #86 ci-images-digest (83167b8f, draft; next to merge; its merge of bce57f16 runs on `co-001/wip-ci-images-digest`) | ADR 0066: the Date line (`:31`), two Deciders lines after `:38`, and a notice in Part 3's notices, which it renumbers N29 to N32 (`LANES.md:198`); reconciliation-001: a paragraph and bullet appended under the co-founder's 2026-10-26 ruling; `ci.md`: the images job (`:123-126` in its base) and "Changing CI" (`:392-398` in its base), not P4's sections; `workflows.test.ts`: the ci.yml describe (`:1799-1835` in its base) and a new describe after "concurrency groups" (which ends at `:2715` at bce57f16), whose bounded-value rows cite `tools/stryker/affected.ts:776` and `mutation.yml:44-47`, `:77` | Keeps both; Part 7's notices after N32 and Part 6's; P4's reconciliation record after #86's; the three cites moved to the lines P4 leaves (E12). No code file is shared |
| #75 (871faff9, draft) | reconciliation-001, `test-matrix.md`, `matrix.ts`, `registry.ts`: its own series' rows | Keeps both (rule 6) |
| #84 (e3299ea2, draft; mutation not green: `packets-words` cancelled at 30.30 minutes, run 40646243545) | `stryker/{base.mjs, shards.json}` (nine shards), `tools/stryker/affected.test.ts:361-367`, `shards.test.ts:23, :69`, `equivalent/packets.json`, two rows of `ci.md`'s shard table, CAS rows in `test-matrix.md`, `matrix.ts`, `registry.ts` | P4's tests name no shard (E10), so its hunks in the two test files stay clear of #84's; the shard table keeps #84's rows and takes the time column of E7; `RUNNER_PROOF_SHARD` still holds money and ledger whole at e3299ea2. P4's own full run, and acceptance 4, are then nine shards |
| #83 (f4a97668; (14) 71536c60 at 20:32Z; (14) **merged** at 2026-11-01T20:40:34Z, base 43565235, above), #85 (90ec40ab), drafts | `test-matrix.md`, `matrix.ts`, `registry.ts`: their series' rows; #83 also `watched-paths.txt` (+2 at `:55`, `:58`) | Keeps both; #83's side is the base P4 merges in |
| #42 (be63bdc2; (14) c65f9cf2 at 20:32Z, still 219 files and only `@@ -1799` in `workflows.test.ts`, read 20:33Z; (14) 6c28d6a2 at 21:17Z, a merge of bce57f16 into c65f9cf2 committed 18:17:04Z, its `workflows.test.ts` hunk now `@@ -1853,16 +1853,17 @@`, still outside P4's describe `:2469-2657`; draft; Lane A's, run as acting Lane A; not in Lane B's merge order) | reconciliation-001, `test-matrix.md`, `matrix.ts`, `registry.ts`; `workflows.test.ts` (`:1799-1815`, ci.yml's identity steps), outside P4's describe and not on the "Not while #42 is open" list (`LANES.md:84-92`); also `apps/{web,worker}/package.json` and `pnpm-lock.yaml`, which P4 does not edit | Whichever of the two merges second keeps both |
| P2, `co-001/ci-trivy-version` (local at bce57f16; its re-read is running; merges before P4) | ADR 0066 (Part 6, its header lines and notices N33 to N42, P2 design `:1646-1648`); (14) `reconciliation-001.md` (its entry in P1's form, after #86's, P2 design `:365-368`, `:656`, `:1068`); `test-matrix.md` (the intro and CI-24 to CI-26); `matrix.ts`, `registry.ts` (rows and a Part 6 comment); `workflows.test.ts` (ci.yml's images, release and dry-run blocks, P2 design `:255-262`); `collection.test.ts` (`...testsIn('tools/trivy')` beside `:43`, next to P4's two lines after `:46`); `ci.md` (other sections). P2 alone edits the root `package.json` (`trivy:pin`), `tools/package.json` (`@sigstore/*`) and the lockfile | Keeps both: Part 7 after Part 6, (14) its notices from N43 (E6), P4's reconciliation record after P2's, CI-27 to CI-29 after CI-26, the intro sentence rewritten over P2's. P2's own pull request pays a full mutation run under today's rule; under P4's tables `trivy:pin` and the `@sigstore/*` entries would be inert (no closure imports them) |
| Dependabot #87, #88, #89 | none of P4's files (manifests and the lockfile only) | Nothing; never merged |
| (14) #90, PR A `co-001/deps-anthropic-sdk-1` (06f79c07, draft, opened 18:28:33Z; replaces #87; after #75 and #84, `LANES.md:202`) | `test-matrix.md` (+5), `matrix.ts` (+12), `registry.ts` (+3): MOD-17 and MOD-18; also the lockfile, `packages/model-gateway/package.json`, ADR 0048 and two MOD fixtures, none P4's | Keeps both (rule 6); `pnpm synth --all` |
| (14) #91, PR C `co-001/dependabot-group-routing` (651f8b80, draft, opened 18:34:25Z; after #86) | ADR 0066: a Part 2 amendment (+12) at the old `:728`, before Part 7, so P4's ADR cites shift; `test-matrix.md` and `matrix.ts`: the CI-12 row (+1 −1 each); `.github/dependabot.yml` (+20 −1: `exclude-patterns` on minor-and-patch), which moves P4's cite of the actions group (`:74-86`); also `fixtures/synthetic/CI-12`, `dependency-upgrades.md` and `tools/test/dependabot-config.test.ts`, none P4's | Keeps both; the integrator re-reads the `dependabot.yml` and ADR cites at that merge (§15 N5) |
| (14) PR B `co-001/deps-aws-cdk-minor-patch` (no pull request yet; replaces #88 and #89; after #42); (14) now **#94** (484e9f06, draft, opened 20:46:30Z, 13 files) | manifests and the lockfile, which P4 does not edit: (14) at #94, seven `package.json` files (`apps/web`, `apps/worker`, `infra`, `packages/{billing,contracts,db,model-gateway}`) and `pnpm-lock.yaml`, so it shares no file with P4 | Nothing to resolve; under P4 its `@aws-sdk/*` closure imports still run pricing and packets |
| (14) #92, UX PR 6 `co-001/ux-sign-in-time` (e4e05a0d, draft, opened 20:01:07Z; `lanes/lane-b.md:1123, :1217`) | `test-matrix.md` (`@@ -367`), `matrix.ts` (`@@ -508`), `registry.ts` (`@@ -739`), `watched-paths.txt` (`@@ -66`): its own rows, each hunk after P4's regions (`:257-290`, `:419-441`, `:604-631`), and a watched path, in a file P4 does not edit | Whichever merges second keeps both (rule 6) and runs `pnpm synth --all`; `watched.ts --write` if the watched list moves |
| (14) #93, UX PR 9 `co-001/ux-home-figures` (87691be4, draft, opened 20:35:12Z; `lanes/lane-b.md:1121`) | `test-matrix.md` (`@@ -371`), `matrix.ts` (`@@ -532`), `registry.ts` (`@@ -754`), `watched-paths.txt` (`@@ -245`): as #92's | As #92 |
| ci-findings-transport (no pull request yet; after #86) | #86's over-limit row in `workflows.test.ts` (`LANES.md:199`), not P4's rows | Keeps both if it merges first |

**When to cut.** Recommended: **build now on bce57f16**, not after a predecessor merges. P4 shares no code file with
#86, #75, #83, #85, #42 or P2, and with #84 only two test files whose shard lines it does not touch. Every other overlap
is a rule-6 document, a test file in another `describe`, or a cite to refresh, so waiting would add days and remove no
conflict. The draft pull request opens at once (pipeline step 3). Each predecessor is merged in as it merges, the
integrator's document lines re-mapped then. Acceptance 4 is read on the final head, which holds #84 ((14) at least nine shards), and
P4's pull request waits in the order ("ready; waiting on P2") if it is ready first. Each push runs every shard (about
55 runner-minutes now, at least about 94 after #84), so the pull request is pushed once per round.

### 14.5 Scope decisions

1. **Build P4 although no pull request since #49 would have run less. Recommended.** (a) As designed and amended
   here. (b) Only its soundness parts (every workspace manifest's install scripts, F10, F11, the added globals, Stryker
   by path, the runtime check), with the manifests left whole-file. (c) Not at all. **Taken: (a).** The saving per
   qualifying pull request has grown (53.9 runner-minutes, at least about 94 after #84), and the cases it serves recur:
   an `actions` week without an artifact-action move, `next`, `browser-tests`, a release-age exclude, and lane pull
   requests that add scripts to `packages/db`, `packages/rules` or `tools`. (b) is the same work minus a tested,
   fail-closed classifier, and saves nothing. Part 7's measurement states the zero since #49 beside the seven.
2. **The canary's manifest and `tools/package.json` (F10, F11): the safer option.** Both close a fail-open path the
   2026-10-26 text had, at no replayed cost. `tools/package.json`'s module and resolution fields become global
   because tsx loads every global entry point under them.
3. **The guards (F14, V2): the safer option.** A literal scan with a reviewed list, each entry holding its literal
   (E3), with `gate.ts` on it for the `packageManager` read §3.3 adds ((14) `runtime.ts` in its place, §15 S4).
4. **`.github/workflows/actions.lock` and `$/` (D7, D8): the safer option**, free today.
5. **Acceptance 4 (D3, V3).** Compared with the push run of the merge commit's first parent, per file from the shard
   logs, Killed and Timeout as one detected class (E4). The per-mutant comparison the design asked for needs the
   artifacts, which this environment cannot download.
6. **What P1 changed for P4.** P1's age floor and its refusal of another repository's reusable workflow now vouch,
   in `ci.yml`'s static job, for a pin-only change's new SHA; P4 still relies on neither, since anything its own rule
   cannot vouch for is global. P1's `releaseAgeMinutes` (`tools/check-toolchain/exclude-window.ts:29`) reads
   `minimumReleaseAge` for the action and image ages in that job; no mutation step or closure file imports
   `tools/check-toolchain` or `tools/check-action-pins`, so the release-age keys stay inert for mutation (C4 stands).
   P1 gave "Action pins" the job's token (`ci.yml:91`); `mutation.yml` keeps `contents: read` (`:29-30`) and P4 adds no
   token.
7. **What ci-deps and ci-browser changed.** `packageManager` carries `+sha512` (the gate's pattern accepts it, §3.3);
   eight root devDependencies are `catalog:` (F6); `overrides`, `onlyBuiltDependencies` and the release-age and trust
   keys exist (`pnpm-workspace.yaml:33-52`), classified as §2 says; every mutation job runs on ubuntu-26.04, a `runs-on`
   edit stays global. #52 added a seventh shard and #84 adds two more; money-ledger still holds money and ledger whole.
8. **#86's bounded values (V1).** P4 updates the three cites at its merge and adds no expression to `mutation.yml`
   (E12).
9. **Outside P4, proposed:** the fork-point over-charge (P30) and the lockfile's peer re-keying (P32) change rules P4's
   soundness rests on, so P4 keeps both as they are.
10. **Nothing here is the founder's.** No migration (no schema or `packages/db` source changes), no release tag, no
    owner-admin setting (`mutation` stays the required check, by the same name), no legal text, no freeze exception (no
    engine, ledger or `stryker/**` change), and no founder ruling reversed (F2 (b) and CQ1 (a) are untouched: P4 reads
    no age).

### 14.6 Build plan on this base

(14) As amended by the fold of the re-read's review (§15, 2026-11-01): the B1 and B2 file lists, the commits, the cases
(65, from 49), the counts and the fix round's synth check changed; the 18:12Z text is in
`/home/user/laneb-sp/p4reread/tmp/fold1/146.before.md`. Amended again by the fold of the completeness critic (15.5,
21:12Z to 21:30Z): `globalFiles` follows `GLOBAL_LOADED` with `includeTests`; every workspace manifest fails closed to
all four; commit 1 exports `RUNNER_PROOF_SHARD` and moves `DEPENDENCY_FIELDS`; the stubs return `''`; `runStryker` takes
the root and an injected `spawn`; the existing gate cases commit 4 turns red are listed, the bound-equivalent message
stays and E8 lives in `shardView`; B2 edits the canary config's comment; the builders' seams and `GLOBAL_LOADED`'s
members are made exact; the integrator re-reads #86's cites after both builders, edits `ci.md:585-586`, puts P4's record
after P2's and numbers Part 7's notices from N43. The count stays 65. The text before this fold is
`/home/user/laneb-sp/p4reread/tmp/fold2/146.before.md`.

The branch `co-001/ci-mutation-trigger` is cut at bce57f16 (the worktree `/home/user/ci-mutation-trigger`, installed, not
pushed; the build branch is now 43565235, 14.4). Two builders work in parallel on disjoint files, each failing first,
and the integrator follows (E5). Each builder runs its tests under the lock and records its red commit's failing test
names for the pull request's description. Every case goes through an entry point that exists in its red commit
(`affected()`, a stub `classifyManifests`, the stubbed constants and helpers named below, the gate's judge, `runShard`,
a `runStryker` that still spawns `pnpm stryker`, stub `runtime.ts` exports and a stub `headCommit`), so commits 1 and 3
are red on behaviour, not on a missing module; every commit typechecks. A ★ case is red in its red commit and green
after it; a ◆ case is a guard, green in its red commit and after. `manifests.test.ts` judges every case through
`affected()` with the change's texts, so in commit 1, where `affected()` does not yet read texts, each case gets today's
whole-file answer: ★ marks a case P4 decides differently from today, ◆ one it decides as today does. No test starts a
real Stryker or pnpm process (each spawn case injects a recording `spawn`), and no test holds the running process to
the pins: CI's `unit` job runs floating Node 24 (`ci.yml:45`; job 124920631257 logged `node: v24.22.1` at
2026-11-01T17:20:05Z), so each runtime case injects its runtime and its pins.

**B1, the classifier**: `tools/stryker/{manifests.ts (new), manifests.test.ts (new), affected.ts, affected.test.ts,
workspace.ts}`.
- Commit 1, red: `manifests.ts` with §2's constants as amended (`LIFECYCLE_SCRIPTS` with `prepublishOnly`,
  `RUNTIME_NAMES`, `DEPENDENCY_FIELDS`, `WORKSPACE_INERT_KEYS`, `PINNED_USES` copied from `PIN`, `TRANSPORT_ACTIONS`)
  and a stub `classifyManifests` that returns global for every file. `DEPENDENCY_FIELDS` is `affected.ts:499`'s, moved
  and exported with the same members in the same order (`dependencies`, `devDependencies`, `optionalDependencies`);
  `affected.ts` imports it for `lockedPackages` (`:520`, `:539`), so there is one list and the lockfile rule does not
  change. `manifests.ts` reads no `affected.ts` binding at module top level (it imports types, and functions it calls
  later), so the import cycle between the two cannot meet an uninitialised binding. `Change` (`affected.ts:574-579`)
  gains `texts`, typed with its three states (§3.1: a string, `null` for absent, `undefined` for unread). `affected.ts`
  exports `RUNNER_PROOF_SHARD = 'money-ledger'` with its real value, since the ◆ N1 case and the ★ pin-only reason use
  it and commit 1 typechecks only with it. Stubs `GLOBAL_LOADED = []` and `gitEnvironment(env)` returning `env`;
  `AffectedConfig` (`:206-216`) gains an optional `globalLoaded`, unread until commit 2, so the synthetic config
  (`affected.test.ts:137-146`) needs no edit. `workspace.ts` exports `workspacePatterns(text)`, the reader of `:37-45` as
  a pure function that `workspaceDirectories` calls (no behaviour change, so `workspace.test.ts` stays green).
  `manifests.test.ts`'s 36 cases and `affected.test.ts`'s 12 (below), and two edits of existing cases inside their `it`
  (`:235-243`): `:237` passes texts with an `exports` edit of `packages/pricing/package.json` (still pricing and
  packets, its owners) and `:238` texts with a `scripts.dev` edit of `packages/helper/package.json` and
  `apps/site/package.json` (still none), since with no texts both now fail closed to all four; the `affects` helper
  (`:192`) takes the texts. Both are green in commits 1 and 2. `:236` (money's manifest, all four either way), `:242`
  and `:345-349` stand.
- Commit 2, green: the classifier for the root, the workspace, the workflow, closure manifests, global-holding
  manifests (E1 as amended) and every other workspace manifest; each field compared order-sensitively, per-entry fields
  order-free; anchors, aliases, merge keys, explicit tags, parse errors and warnings global, and global keys' scalars
  compared by source text (`parseDocument`); `packages` by both readings (`workspacePatterns` and the YAML, E16); a root
  `node`, `deno` or `bun` entry and any specifier that is not a registry version or range, `catalog:` or `npm:` alias
  global (in a global-holding manifest, all but `workspace:`); `prepublishOnly` and `dependenciesMeta` global in every
  workspace manifest; an absent side judged against `{}` for a workspace manifest and global for the three named files;
  every key a reason prints `JSON.stringify`'d, and a key holding a control character global; fail closed, and for
  every classified file alike: no text, an unread side or a parse error gives all four, a workspace manifest of any
  kind included (§3.1). `changeSince` (`:720-733`) fills `texts` for the three files and every changed workspace
  `package.json` (`workspaceDirectories` on both sides), each side its text or `null` when `git diff --name-status
  --no-renames` says the file is absent there, a present side git cannot show left `undefined` and failing closed
  (E15). `affected()` (`:624-660`): only the three named files leave the glob test (`:634`, E2), a classified manifest
  leaves the manifest test (`:639`), and each reason names its fields; `GLOBAL_INPUTS` (`:121-130`) gains `.npmrc`,
  `.pnpmfile.*`, `patches/**`, `.github/workflows/actions.lock`, `**/package.yaml`, `**/package.json5`, `.pnp.cjs` and
  `.github/actions/**`; `GLOBAL_LOADED` lists the files a shard loads by path (E17, its members as amended), and
  `globalFiles` (`:595-599`) follows imports from `GLOBAL_ENTRY_POINTS` (`:133`) and the config's `globalLoaded`
  (`REPOSITORY_CONFIG`'s is `GLOBAL_LOADED`) together, through `importGraph(…, root, { includeTests: true })`, since five
  of the loaded files are tests, which `importGraph` otherwise drops even as seeds (`watched.ts:128-136`); the closure
  is then 29 files (§3.1); a global-holding directory's `tsconfig.json` is global; every `git` spawn (`:688`, `:706`,
  `:721`, `:740`) takes `gitEnvironment()`, `PATH` without any `node_modules/.bin` entry; the header (`:38-39`) states
  the field rule. The `--github-output` write (`:776`) keeps its three outputs exactly (E12).

**B2, Stryker by path, the runtime, the commit and the workflow**: `tools/stryker/{stryker.ts (new), stryker.test.ts
(new), runtime.ts (new), runtime.test.ts (new), shards.ts, shards.test.ts, gate.ts, gate.test.ts, test-support.ts}`,
`tools/stryker/canary/{verdict.ts, verdict.test.ts, stryker.config.mjs}` (the last for its comment `:17-18` alone),
`.github/workflows/mutation.yml` (`:92`, a new step in the changes job between `:58` and `:59`, and the header
`:10-18`), and `tools/test/workflows.test.ts` inside the mutation describe (`:2469-2657`) only.
- Commit 3, red: `stryker.ts` exporting a `Spawn` type and `runStryker(args, env, root = repositoryRoot, spawn =
  spawnSync)` that still spawns `pnpm stryker …` through `spawn` with `cwd: root`; `runShard(name, root =
  repositoryRoot, spawn?)` (`shards.ts:37-50`) still spawning `pnpm stryker run …` itself, but through the `spawn` it is
  given (`spawnSync` when none), so a test that injects a recorder sees `pnpm` and no process starts (with no
  injection, the case would start a real Stryker run of money and ledger); `runtime.ts` exporting stubs
  (`PACKAGE_MANAGER`, `packageManagerVersion` and `pnpmOfUserAgent` returning `''`, `runtimeProblems` returning `[]`,
  `readPins` returning empty pins without checking them, and `checkRuntime(runtime, pins)`, the CLI's body, returning
  no line and exit 0); `verdict.ts` exporting a stub `headCommit` that returns `''`; the types: `Runtime` gains `pnpm`,
  the verdict `commit`, the gate's input `pins` and `commit`, each filled with the stubs' values, so every commit
  typechecks. The cases of `stryker.test.ts`, `runtime.test.ts`, `shards.test.ts`, `gate.test.ts`, `verdict.test.ts`
  and `workflows.test.ts` (below), and these edits to existing cases (§15 S4, and the completeness critic's S-2), each
  inside its `it`:
  - `gate.test.ts:397-398`: the "names no runtime" message names `pnpm` beside node, unicode and icu; `:398`'s
    malformed runtime stays as it is;
  - in the describe at `:388-419`, each well-formed runtime literal (`:402`, `:404`, `:405`, `:408`, `:412`, `:415`,
    `:416`) gains `pnpm: '10.34.8'`, `TEST_PINS`'s, so each still reaches the check it was written for, not "names no
    runtime";
  - `:404` inverted (Node v24.23.0 with Unicode 17.0 and ICU 78.3 now fails, naming both Nodes) and its comment `:403`
    removed;
  - `:405-407` (Node v26.1.0, Unicode 18.0, ICU 79.1): the three pins failures (Node, Unicode, ICU, each naming the
    shard, its value and the pin), then the bound-equivalent message as it stands;
  - `:408` (ICU 78.4): two failures, the ICU one and the bound-equivalent message, `toEqual` of both in place of
    `toHaveLength(1)`;
  - `:402`, `:412`, `:415` and `:416` keep their expectations;
  - `:312-317`, the exact lines of `shardView` (`gate.ts:410-435`): the expected lines start with one more, the
    shard's runtime and commit as `TEST_RUNTIME` and `TEST_COMMIT` give them (E8), so P4's E8 assertion sits inside
    that `it` and the count stays 65;
  - `gate.test.ts:42`'s `input()` takes `pins` and the expected commit from `test-support.ts`, whose `TEST_RUNTIME`
    (`:105`) gains `pnpm: '10.34.8'`, whose `canaryOf` (`:108-118`) gains a `commit`, and which gains `TEST_PINS` and
    `TEST_COMMIT`;
  - `verdict.test.ts:132-133` expect `pnpm` beside the three keys: `:133`'s literal gains it on both sides, and
    `:132`'s expected value is `pnpmOfUserAgent(process.env.npm_config_user_agent)`, computed as the verdict computes
    it, so the case holds under `pnpm test` and under a bare `vitest` alike.

  Each ★ is red on its assertion: `:2537` expects the new canary line; the `run:` allowlist expects the changes job's
  runtime step; the guard scan is red on the base because `shards.ts` imports `node:child_process`. The edited
  `:312-317`, `:397-398`, `:404`, `:405-407` and `:408` are red until commit 4; the other edits are green throughout.
- Commit 4, green: `runStryker` resolves `@stryker-mutator/core/package.json` from `root` with `createRequire` and
  spawns, through `spawn`, `process.execPath` on its `bin.stryker` with `cwd: root`, `stdio: 'inherit'` and the given
  env; as a CLI (`pnpm -s exec tsx tools/stryker/stryker.ts run <config>`) it calls `runStryker(process.argv.slice(2),
  process.env)` and exits with its status. `runShard` calls `runStryker(['run', 'stryker/<package>.config.mjs'], env,
  root, spawn)`, so `shards.ts` no longer imports `node:child_process` (it imports the `Spawn` type alone).
  `runtime.ts`: §3.3's pattern, `packageManagerVersion`, `pnpmOfUserAgent` (`^pnpm/(\S+) `), `runtimeProblems(runtime,
  pins)` (Node compared as `v` + the pin, N15; Unicode; ICU; pnpm; each difference named), `readPins(root)`, the one
  reader of `unicode.json`'s `checkedOn` and `package.json:5`, failing closed on a `packageManager` the pattern
  refuses, naming the value; `checkRuntime(runtime, pins)`, every difference named and exit 1 on any; and, as a CLI,
  `checkRuntime` of this process's runtime (`process.version`, `process.versions`, `pnpmOfUserAgent` of its
  environment) against `readPins(repositoryRoot)` (E13). `verdict.ts` records `pnpm` and `commit` (`headCommit`, E14)
  and prints both on its runtime line (`:150`). `gate.ts`: `runtimeOf` (`:222`) and `canaryProblem` (`:228-235`)
  require `pnpm` and `commit`; the judge takes `pins` and the expected commit as input (the CLI passes `readPins` and,
  when `GITHUB_ACTIONS` is `true`, `process.env.GITHUB_SHA`); every shard is held to the pins by `runtimeProblems`,
  each difference a failure naming the shard, and every shard's commit to the others' and to the expected one. The
  bound-equivalent message (`:351-361`) stays, after the pins failures: on CI it always comes with an ICU or Unicode
  pins failure, since the CLI's pins are `unicode.json`'s `checkedOn`, but it alone names the equivalents that rest on
  that data and the remedy (check them again on that Node, then record it), and Part 4's rule (ADR 0066
  `:1104-1106`) stays true as written, Part 7 widening it (§6). `shardView` (`:410-435`) prints first the shard's
  runtime and commit from its canary verdict, or that the verdict names none, and still judges nothing (E8; the CLI's
  `--shard` path, `:544-552`, is unchanged). `mutation.yml`: `:92` becomes `pnpm -s exec tsx tools/stryker/stryker.ts
  run tools/stryker/canary/stryker.config.mjs`; the changes job gains, after its install (`:58`) and before "What the
  change affects" (`:59-64`), a step named "The runtime is the pinned one" running `pnpm -s exec tsx
  tools/stryker/runtime.ts`; the header names the field rule, the runner proof with its four legs (Node with Unicode
  and ICU, pnpm, the commit) and the transport exception; no `${{ }}` expression is added (E12).
  `tools/stryker/canary/stryker.config.mjs:17-18` names the command the shard's step now runs, the by-path form above,
  with `:5` untouched. `workflows.test.ts`: the run allowlist, with the runtime step required before the affected step,
  and the guard scan (E3 as amended) over `globalFiles(root, files)` and `repositoryClosures`, called, not rebuilt: on
  B2's branch that is the closure of `GLOBAL_ENTRY_POINTS`, and once B1 is merged in it holds `GLOBAL_LOADED` and their
  imports with no edit here. Its list holds the entries that scan meets, each required to be in the scanned union and
  to hold its literal. The root `stryker` script stays (`package.json:39`).

**The integrator** (after both builders; documents, matrix, synth and the full suite):
- Merges B1 and B2. The guard scan then meets two files that name the three files and is red until their entries join
  the list with their reasons: `manifests.ts` (it classifies them) and `tools/stryker/canary/stryker.config.mjs` (its
  comment `:5` names `mutation.yml`), which the scan reaches through `GLOBAL_LOADED`; of the files `GLOBAL_LOADED` adds
  to the scan, it is the only one holding a scanned literal (grep over `stryker/*.config.mjs`,
  `tools/stryker/seed*.ts` and `tools/stryker/canary/**`, 21:25:34Z). The guard is proved on real files (E3).
  `tools/test/collection.test.ts` `FILES` (`:28-46`) gains `tools/stryker/manifests.test.ts`,
  `tools/stryker/runtime.test.ts` and `tools/stryker/stryker.test.ts` after `:46`, under "// The mutation trigger
  (docs/adr/0066, Part 7)."
- ADR 0066: Part 7 after Part 6, or after Part 5 (`:1681`) while P2 has not merged, moved at that merge; a Part 7 line
  in Status, Date, Deciders and PRD sections where Part 5's sit (`:28-30`, `:31`, `:35-38`, `:52-53`); Part 4's
  `:1163-1164` gains "(narrowed field by field by Part 7)" and its gate rule `:1104-1106` the Part 7 widening (§6).
  Part 7 holds §6's content as amended: 14.3's measurement, the zero since #49 among it; the four legs of the runner
  proof and the changes job's own check; the revisit list with "the repository adopts `actions.lock`", "a new file a
  shard loads by path" and "pnpm reads a new manifest form or install-time script"; notices from N43, after #86's N32
  and Part 6's N33 to N42 (P2 design `:1646-1648`), renumbered in their own commit if those numbers move (E6).
- `docs/runbooks/ci.md`: `:194` (the field rule and today's cost), `:453` ("every shard"), `:469-470` (the field rule,
  with the reason lines a person will see, and what the runtime step and the commit leg print), the shard table
  `:474-481` (E7), `:585-586` ("Running it locally": the pinned Node and `packageManager`'s pnpm, every shard on one
  commit, since the gate holds both), and `:589` and `:596` (the by-path form beside `pnpm stryker run`).
  `docs/product/reconciliation-001.md`: P4's paragraph and bullet in P1's form, after P1's (`:659`, `:661`), #86's and
  P2's records. `docs/product/test-matrix.md`: the intro (`:257-264`) rewritten, CI-27 to CI-29 (§7 as amended) after
  CI-26, or after `:290` while P2 has not merged; `packages/synth/src/cases/matrix.ts` after CI-26 (or `:441`);
  `registry.ts` after CI-26 (or `:631`), under "// The mutation trigger, field by field (docs/adr/0066, Part 7).", each
  `none(0, …)` listing its test files (CI-29's `runtime.test.ts` among them). Then `pnpm synth --all`, which writes
  `fixtures/synthetic/CI-27/expected.json`, `CI-28/expected.json` and `CI-29/expected.json`; the integrator commits the
  three (§15 S6), and any later rewording of those rows regenerates them.
- At each merge of the base: #86's three cites (E12), once #86 is in, each re-read at the line it names after both
  builders' edits, since all three move: B1's edits move `affected.ts:776` (the `--github-output` write), B2's header
  rewrite (`mutation.yml:10-18`) moves `:44-47` (the changes job's outputs) and `:77` (the shards' matrix), and the new
  changes-job step moves `:77` by two lines more; #86's test checks only a cite's form
  (`tmp/pr86-workflows.patch:721-722`), so a stale cite passes CI and only this reading finds it. #91's
  `dependabot.yml` and ADR 0066 cites once #91 is in (14.4); the shared documents' lines re-mapped (#83's merge has
  already moved V4's `watched-paths.txt:463, :466` to `:465, :468`, V10); `pnpm synth --all` again.
- Acceptance 1: the archived replay harness (E9) run with the pull request's own `affected()` over every pull request
  into the build branch at that time. Expected on the 58: 22 full runs → 15, the same seven narrowed, none widened or
  lost (none of the 58 reaches a rule §15 adds, `tmp/fold1/check58.sh`, 20:37Z; nor `includeTests`' additions, §3.1);
  any pull request opened since is reported with its result.

**The cases, one `it` each** (★ red first; ◆ guards; 65 in all):
- `manifests.test.ts` (36). Root: ★ a new `scripts.lint:x` and an edited `scripts.test` affect none; ★
  `@next/eslint-plugin-next` bumped affects none; ★ a dependency only pricing's closure imports affects pricing; ◆
  `packageManager` (with and without `+sha512`), `engines`, `type`, `name`, `private`, `pnpm.overrides`,
  `scripts.postinstall` and `scripts.prepare` each affect all four; ◆ `vitest`, `@vitest/coverage-v8`,
  `@stryker-mutator/core`, `fast-check`, `tsx`, `yaml`, and `vitest` moved from `catalog:` to a range, each all four; ◆
  `decimal.js` all four; ◆ (B1) a `devDependencies` entry named `node`, `deno` or `bun`, and one whose specifier moves
  to or from `runtime:`, `workspace:`, `link:`, `file:` or a git URL, each all four. Closure manifests: ★ `packages/db`
  gaining `scripts.db:domain-model` affects none (#3); ★ `tools/package.json` gaining `playwright-core` or
  `@sigstore/verify` affects none; ★ a dependency `packages/db`'s files import affects the packages whose closure holds
  those files (built so that is fewer than the manifest's owners); ◆ a `workspace:` specifier, `exports`, `type` or an
  unlisted key in `packages/db` affects its owners; ★ (§15 V8: today's rule gives the owners) `scripts.postinstall` in
  `packages/db`, and (N-2) no text, an unread side or invalid JSON there, each affects all four; ★ (S7)
  `prepublishOnly` or `dependenciesMeta` in `packages/db` or in `apps/web/package.json` affects all four.
  `tools/package.json` (F11): ★ (V8) `type`, `imports`, `scripts.prepare`, an unlisted key or (N-2) no text affects all
  four, and `exports` or `name` its owners; ★ an edit of `scripts.screening:capacity` affects none; ★ (B1) a `node`
  entry or a `link:` specifier affects all four, and a new `workspace:` entry its owners; ★ (S3) in a synthetic world
  whose by-path-loaded file is a `*.test.ts` (so the case needs `includeTests`, S-1), a global-holding manifest whose
  `name` that file imports: its `name` or `exports` edit affects all four, and another manifest's `name` taking that
  import affects all four. Other workspace manifests: ★ `apps/web/package.json` gaining `scripts.postinstall`, and
  (N-2) no text, an unread side or invalid JSON there, each affects all four; ◆ its `scripts.dev` or a dependency
  affects none; ◆ (F9) in a synthetic world, a `name` or `exports` edit that captures a specifier a closure imports
  affects that closure's packages, and one that captures none affects none; ◆ (F10)
  `tools/stryker/canary/lib/package.json` gaining `scripts.x` or changing `exports` affects all four; ◆ (S5) an added
  or a deleted `apps/foo/package.json` with no install lifecycle script affects none; ★ (S5) one with `postinstall`,
  added or deleted, affects all four; ★ (N11) a script key holding a newline and `::warning::` makes the file global
  and is printed JSON-quoted. Workspace: ★ a catalog line for `react` or `playwright-core` affects none; ★ a catalog
  `zod` line affects pricing and packets; ★ adding `minimumReleaseAgeExclude` or `trustPolicyExclude` entries affects
  none; ◆ catalog `vitest`, `packages`, `onlyBuiltDependencies`, `overrides`, `patchedDependencies` and `nodeLinker`
  each affect all four; ◆ an anchor, alias or `<<` merge key on either side affects all four; ◆ (S1) a blank line or a
  column-0 comment inside `packages` affects all four; ◆ (N12) an explicit tag, a duplicate key, or a global key's
  scalar rewritten to the same value (`onlyBuiltDependencies`' item quoted) affects all four; ◆ (S3) in a synthetic
  world whose by-path-loaded file is a `*.test.ts`, a root or catalog entry for a package only that file imports
  affects all four (in commit 2 and after, only through `includeTests`). Order: ★ reordering `scripts` or catalog
  entries alone affects none; ◆ two reordered `exports` conditions affect the owners, two reordered `overrides`
  entries all four. ◆ Fail closed: invalid JSON or YAML on either side, an unread side, or no text in the root
  manifest, `pnpm-workspace.yaml` or `mutation.yml` gives all four, as today (a workspace manifest's fail-closed
  assertions are ★, in the three cases marked N-2 above, since today gives its owners or none). ★ Comments alone (YAML
  comments outside `packages`, JSON whitespace) affect none.
- `affected.test.ts` (12): ★ only step `uses:` SHAs and their comments changed in `mutation.yml` gives money and ledger,
  with the reason built from `RUNNER_PROOF_SHARD` ("pins only: runner proved on <shard>", N16); ★ a comment-only change
  gives none; ◆ all four for a SHA to `@v7`, `@v7` to a SHA, `@main`, a job-level `uses:`, `docker://`, `./local`,
  `$/…`, a path change, an upload- or download-artifact move, `runs-on`, `with:`, `run:`, a new step, a step-order
  change; ◆ (N1) `RUNNER_PROOF_SHARD`'s packages each have exactly that shard, read from `stryker/shards.json` (E10); ★
  `.npmrc`, `.pnpmfile.cjs`, `patches/x.patch`, `.github/workflows/actions.lock`, `apps/foo/package.yaml`,
  `apps/foo/package.json5`, `.pnp.cjs` and `.github/actions/x/action.yml` each give all four (S8, V7, N14); ★ (B1)
  `gitEnvironment` removes every `node_modules/.bin` entry from `PATH` and keeps the rest; ★ (S3) `GLOBAL_LOADED` holds
  every file a shard loads by path, and only those: `stryker/<package>.config.mjs` for each of `MUTATION_PACKAGES`;
  `SEED_SETUP_FILE`; the canary config, read as the one token ending `.config.mjs` in the canary step's `run:`
  (`mutation.yml:92`, which both its present and its by-path command contain); that config's `vitest.configFile`
  (`tools/stryker/canary/vitest.config.ts`), read from its default export; and `CANARY_TESTS` (E17); and, on this
  repository's graph, `globalFiles` holds `tools/stryker/canary/lib/index.ts` and its `imports` keyed by `tools` hold
  `@tp/stryker-canary` (S-1); ★ (S9) `tools/tsconfig.json` gives all four; the replay fixtures, one each: #3 ★ none,
  #31 ★ the owners of `tools/package.json` read from the closures (pricing at bce57f16; S10), #40 ◆ all four, #43 ★
  none. The edits of `:237` and `:238` (commit 1) are not cases; `:236`, `:242` and `:345-349` stand.
- `workflows.test.ts` (2): ★ every `run:` of `mutation.yml` is a whole command on the allowlist, and the changes job runs
  `pnpm -s exec tsx tools/stryker/runtime.ts` before its affected step; ★ the guard scan over the union of
  `globalFiles` (grown from `GLOBAL_LOADED` once B1 is merged in) and the four package closures, with E3's list and
  literals as amended, each entry in that union and holding its literal.
- `gate.test.ts` (8): ★ a verdict naming Node v24.21.0 fails, naming both; ★ pnpm 10.34.9 against the pinned 10.34.8
  fails, naming both; ★ a verdict without `pnpm` fails ("no runtime"); ★ (V5) a shard that scores no bound equivalent
  and names ICU 77.1 fails; ◆ a matching verdict passes (`v24.22.0` against the pin `24.22.0`, N15); ★
  `packageManagerVersion('pnpm@10.34.8+sha512.<hex>')` is `10.34.8`; ★ `readPins` on a synthetic root fails closed on
  `pnpm@^10`, `yarn@4.0.0` and `pnpm@10.34`, naming the value; ★ (S2) a shard whose commit differs from another's or from
  the expected commit, or names none, fails, naming both. E8 is asserted in the edited `:312-317` (commit 3), not as a
  case of its own.
- `verdict.test.ts` (3): ★ the user agent `pnpm/10.34.8 npm/? node/v24.22.0 linux x64` gives `10.34.8`; ◆ none gives
  `''` (green in commit 3 because the stub returns `''`); ★ (S2) `headCommit` resolves, in synthetic `.git`
  directories, a detached `HEAD`, a branch's loose ref, a packed ref and a worktree's `gitdir:` file with its
  `commondir`, and gives `''` for none.
- `stryker.test.ts` (2): ★ with a recording `spawn`, `runStryker` resolves `bin.stryker` through `package.json` from the
  given root and spawns `process.execPath` on it with `cwd` that root (commit 3's recorder sees `pnpm`); ★ on a
  synthetic root with no `@stryker-mutator/core`, it fails, naming the package, and spawns nothing.
- `shards.test.ts` (1): ★ with a recording `spawn`, `runShard` runs each of the shard's packages through `runStryker`
  (`process.execPath` on Stryker's bin, `run stryker/<package>.config.mjs`, the shard variable, `cwd` the root) and
  spawns no `pnpm`; no process starts in either commit.
- `runtime.test.ts` (1): ★ (B1) `checkRuntime`, given a runtime and `TEST_PINS`, never this process's, names each of a
  Node, Unicode, ICU and pnpm that differs from the pins, passes the pinned runtime with Node's `v` either way, and
  gives exit 1 on any difference.

**Counts the pull request must reach.** At bce57f16 the unit project is 404 files, 6,893 passed and 1 skipped (6,894)
(`ci` run 41330911483, `unit` job 124920631257, read 17:29Z). P4 adds 3 test files and 65 tests: **407 files, 6,958
passed and 1 skipped (6,959).** The scoped run `pnpm exec vitest run --project unit tools/stryker tools/test` goes from
32 files and 392 tests (scout-files, 17:28Z) to 35 and 457. The edits to existing cases (§15 S4; the completeness
critic's S-2 and N-2) add none. The base moves (#83 is in at 43565235; then #86, #75, #84, #85, P2, and #90, #91, #92,
#93 and #94 if they merge first), so the rule is the merge base's count plus P4's 65, both numbers in the description,
taken from CI's totals or a full local run, never from `vitest list` (`lanes/lane-b.md:240`).

**The fix round's checks** (the full local suite once, under the lock, `lanes/lane-b.md:230`): `pnpm typecheck`, `pnpm
lint`, `pnpm lint:logs`, `pnpm test`, `pnpm test:golden`, `pnpm test:oracle`, `pnpm test:db` in its shards one after
another (the catalog and cross-tenant tests, CLAUDE.md rule 4), the build, stamp and `pnpm test:e2e` with
`E2E_PREBUILT=1`, `pnpm verify-content`, `pnpm synth --all` then `ci.yml:140`'s line verbatim, `git diff --exit-code --
fixtures/synthetic && test -z "$(git status --porcelain -- fixtures/synthetic)"` (§15 S6: the plain diff misses the
three new, untracked fixtures), `pnpm -s exec tsx tools/stryker/runtime.ts` (the changes job's check, on the local Node
v24.22.0 and pnpm 10.34.8), and every mutation shard one at a time on one commit (P4 affects all four packages) then
the gate, whose per-file counts are acceptance 4's local preview and which, off Actions, holds the shards' commits
equal only. Because P4 changes a workflow: `pnpm actions:check --offline`, then `BASE=origin/claude/build-platform pnpm
actions:check` and `pnpm toolchain:check` (networked). Because P4 changes two capacity-watched files: `watched.ts
--write` then `git diff --exit-code -- tools/screening-capacity/watched-paths.txt`, and on CI the `screening-capacity`
measurement and gate green. Then one push, CI green on every required check (`all green`, `mutation`,
`screening-capacity gate`, approval-of-record), acceptance 4 read from the shard logs, and the fresh-clone
verification.

### 14.7 Engineering choices made here

Each is taken under the co-founder's 2026-10-26 ruling (the recommended option, for security the safer one), is
reversible by a later pull request, and is recommended.
- **E1. The manifests that hold the mutation tooling are computed, not named** (F11). A workspace manifest is
  "global-holding" when its directory is the nearest workspace package of any file in the global entry points'
  closure (`globalFiles`, `affected.ts:595-599`); today that is `tools/package.json` alone. A named list would miss the
  next package the tooling imports from. (14) As folded (§15): the global closure grows from `GLOBAL_LOADED` too (S3);
  it is the union of the two sides, like the closures; such a manifest's directory `tsconfig.json` is global (S9); its
  `name` and `exports` are global when its `name`, on either side, is in `global.imports` (S3); and the root's
  runtime-entry rule applies in it except for `workspace:` (B1).
- **E2. Only the three named files leave the glob test** (F10). Any other file a `GLOBAL_INPUTS` glob matches is
  never classified, so moving a manifest under `stryker/**` or `tools/stryker/**` can only widen.
- **E3. The guard is a literal scan with a reviewed list, and every entry must still hold its literal** (F14).
  `child_process`: `affected.ts` (spawning `git` only) and `stryker.ts` (`process.execPath` with Stryker's bin only),
  each spawn asserted. The three names: `affected.ts` and `manifests.ts` (diff and classify them as data),
  `workspace.ts` (every manifest's `name` and `exports`, F9, and the workspace's `packages`), `stryker.ts`
  (`@stryker-mutator/core`'s own manifest, under `node_modules`), `gate.ts` (the root `packageManager`),
  `tools/screening-capacity/watched.ts` (its path list) and `vitest.mutation.config.ts` (comments). Every field named is
  global or an owner field under §2. The integrator's merge adds `manifests.ts`, so the guard is seen red on a real
  file before it is green. (14) As folded (§15): the scan runs over the union of the global closure grown from
  `GLOBAL_LOADED` and the four package closures (S3); `runtime.ts` (the root `packageManager` and `unicode.json`)
  replaces `gate.ts` on the list, which reads neither (S4); `tools/stryker/canary/stryker.config.mjs` is listed for its
  comment (`:5`, `mutation.yml`); the scanned literals gain `read-pkg`, `read-package-up`, `pkg-up`,
  `@npmcli/package-json` and `npm_package_` (N13); and `canary/verdict.ts` reads `.git` with no spawn, so the
  `child_process` list stays `affected.ts` and `stryker.ts` (S2). (14) As the completeness critic's fold made exact
  (§15, N-4): the scan calls `globalFiles`, which follows `GLOBAL_LOADED` with `includeTests` once B1 is merged in, so
  B2's list holds only the entries B2's scan meets, each required to be in the scanned union and to hold its literal;
  the integrator's merge adds `manifests.ts` and `tools/stryker/canary/stryker.config.mjs`, each seen red first. In
  `stryker.ts` the asserted spawn is the call through the injected `spawn` (default `spawnSync`), with
  `process.execPath` and Stryker's bin.
- **E4. Acceptance 4 compares per file, from the logs, with Killed and Timeout as one class.** Stryker's timeout
  status is a wall-clock judgement, and three money-ledger push runs gave identical tables (14.1), so a move between the
  two is listed in the pull request and not counted; any other difference in a file's total, survivors, no-coverage or
  errors fails acceptance 4 and is investigated before the merge.
- **E5. Two builders and an integrator** (14.6), in place of one: the classifier and the runtime work touch disjoint
  files, so they run in parallel, and the guard joins them at the integrator's merge.
- **E6. Part 7's notices are numbered from N33, provisionally,** after #86's N32, and renumbered in their own commit
  after P2's Part 6 merges in, the way #86 renumbers its N29 (`approval-summaries/lane-b-ci-images-digest-status.md:59`).
  (14) Corrected (§15, the completeness critic's N-9): P2's G8 gives Part 6 N33 to N42 and starts Part 7 at N43
  (`follow-up-p2-trivy-version.md:1646-1648`, `:843`), and P2 merges first, so Part 7's notices are N43 on; they are
  renumbered in their own commit only if #86's or Part 6's numbers move.
- **E7. `ci.md`'s shard table gets one time column, CI's mean job time** over the push runs since `stryker/shards.json`
  last changed, for every row (packets-explain's, missing since #52, and #84's two), with the runs named. Today's
  column is a single local run on four shared CPUs (2026-10-25), which has no row for three of the nine shards. If fewer
  than three such push runs exist at the integrator's commit, it uses those there are and says how many.
- **E8. The shard's own gate view prints its runtime** (Node, Unicode, ICU, pnpm), so a runtime mismatch shows in the
  shard job's log as well as in the gate's. (14) And its commit (§15 S2). (14) In `shardView` (`gate.ts:410-435`), as
  its first line, read from the shard's canary verdict, not in the CLI (§15, the completeness critic's S-2): a pure
  function, so `gate.test.ts:312-317` asserts the line; the view still judges nothing.
- **E9. The replay harness is kept with the design** (`/home/user/laneb-sp/p4reread/tmp/scripts/replay.mts`; the
  session archives it on `claude/build-ops` beside this file when it commits the re-read), and acceptance 1 runs it
  with the pull request's own `affected()`, not the prototype.
- **E10. No test names a shard or counts them**; each derives them from `stryker/shards.json` (F15), so #84's nine
  shards, and any later rebalance, need no edit in P4's tests.
- **E11. `.github/workflows/actions.lock` and `$/` are global** (D7, D8): fail closed for a file and a reference form
  that change what runs, at no cost today.
- **E12. #86's bounded-value cites are moved with the lines, and `mutation.yml` gains no expression.** The three
  outputs `affected.ts` writes stay exactly `any`, `packages` and `shards`; the longer reason lines go to stdout and the
  step summary only, never to an output or an environment.
- (14) **E13. The changes job's runtime check is its own step, in `tools/stryker/runtime.ts`** (§15 B1), not code in
  `affected.ts`: the runtime work and its pattern stay with B2, the two builders' files stay disjoint, and the step
  fails the job before `affected.ts` decides anything. Inside `affected.ts`, the check would have made B1 import B2's
  parser.
- (14) **E14. A shard's commit is read from `.git` by file, not by spawning `git`** (§15 S2), so the `child_process`
  guard keeps its two entries; a form it cannot resolve gives `''`, which fails the gate on Actions (fail closed).
- (14) **E15. An added or deleted file is told from an unread one by `git diff --name-status`** (§15 S5), so the absent
  side is judged against `{}` while an unread side stays fail-closed.
- (14) **E16. `packages` is compared by both readings**, the YAML and `workspace.ts`'s own (§15 S1), rather than making
  `workspace.ts` parse YAML: a change to the tooling's reading would change every shard's aliases, so it is P4's to
  detect, not to fix.
- (14) **E17. `GLOBAL_LOADED` is a named list held by a test to the loads it stands for** (§15 S3): the four
  `stryker/<package>.config.mjs` paths (`MUTATION_PACKAGES`), `SEED_SETUP_FILE`, the canary config of `mutation.yml:92`
  and `CANARY_TESTS`; a glob over `tools/stryker/canary/**` would also take `verdict.test.ts`, which no shard loads.
  (14) Made to agree with §3.1 (§15, the completeness critic's N-4): also the canary's `vitest.config.ts`, which
  `canary/stryker.config.mjs:25` loads as its `vitest.configFile` and only `canary/verdict.test.ts:8` imports. The test
  reads the canary config as the one token ending `.config.mjs` in the canary step's `run:`, which the present and the
  by-path command both contain, and the Vitest config from that config's default export. `globalFiles` follows the list
  with `includeTests`, since five of its files are tests (S-1).

### 14.8 Proposed improvements outside this item

Continuing after P28, the highest in `lane-b-ci.md` (P17), the P1 design (P28, `follow-up-p1-pin-age.md:1129`) and the
status file (P22). P2's re-read, running at the same time, also starts at P29 (its progress file,
`/home/user/laneb-sp/p2reread/progress/revise.progress.md`, "P numbers", read at 18:12Z), so the session renumbers one of the two sets when it commits them. Each is reversible and
recommended. (14) Settled (§15, the completeness critic's N-9): P2's design took P38 to P42, "clear of P4's planned
P29 to P37" (`follow-up-p2-trivy-version.md:1178-1195`, `:1242-1243`), so P4 keeps P29 to P37, and the two this
file's §15 added are P43 and P44 (they were P38 and P39, which P2 holds); P36 is withdrawn as P2's P39.
- **P29.** (14) Withdrawn: folded into P4 (§15 S9). Make `tools/tsconfig.json` global, as F11 makes `tools/package.json`'s module fields: it is the nearest
  tsconfig of every global entry point under `tools/`, yet it counts for pricing alone. Which of its fields Vite 8 and
  tsx read for those files is not verified; its one commit in the repository's history is its creation (`git log --
  tools/tsconfig.json`), so the cost is nil. A ci-mutation follow-up, since P4 leaves tsconfigs whole-file.
- **P30.** Diff a pull request from the merge's first parent (`HEAD^1`, the tip GitHub merged into) rather than from
  `pull_request.base.sha`, the fork point (14.1, D4). That diff is exactly what the merge changes, ends the charge to a
  lagging pull request for every base commit since its fork, and makes acceptance 4's comparison run the same commit.
  It changes the rule for every file, and it needs a fallback when HEAD is not a two-parent merge.
- **P31.** Move mutation's Node from 24.22.0 to 24.22.2: it misses 24.22.1's security fixes (seven CVEs), while the
  other workflows' floating `24` already take 24.22.2. ICU and Unicode are the same, so the move is the three
  `node-version` lines, `unicode.json`'s `checkedOn.node` and the recorded re-check.
- **P32.** Narrow the lockfile rule's test-tooling reading: #87 ran every shard because `@opentelemetry/api`, an
  optional peer, moved inside vitest's snapshot key. A key that changes only in a peer's version, where the peer itself
  is imported by no closure and no tooling file, could count as no move. It needs proof that vitest never loads that
  peer in a mutation run; until then the present rule stays.
- **P33.** Rebalance packets: packets-rest about doubled after #52 (6.1 to 13.15 minutes), against `stryker/shards.json`'s
  "so packets-rest keeps its time" (`:2`), and #84's packets-words hit the 30-minute timeout. #84 must fit its shard
  before it merges; the rebalance is ci-mutation's open item O7 (ADR 0066 `:1267-1268`).
- **P34.** (14) Withdrawn: #91 states the cause in its ADR 0066 Part 2 amendment (a group with no patterns outranks a
  wildcard pattern) and fixes it (§15 N6). Dependabot's #89 carries nine `@aws-sdk/*` minors in `minor-and-patch` although `aws-sdk` comes first
  (`dependabot.yml:48, :62-64`) and the documentation says a dependency joins the first group it matches. The cause is
  not verified; read that run's job definition, for whoever owns Lane B's Dependabot configuration.
- **P35.** Correct the status file's "a replay of 35 merged PRs" (`approval-summaries/lane-b-ci-deps-status.md`, the 2026-10-26 04:20 "Designs done" row, `:255` at 18:06Z):
  35 pull requests, 22 of them merged, and today 58 (14.3).
- **P36.** (14) Withdrawn: it is P2's P39 (`follow-up-p2-trivy-version.md:1184-1186`, a test that each `BOUNDED_VALUES`
  cite still holds its producer, for #86's owner), which P4's three moved cites support (14.6). #86's bounded-value
  rows name their producers by file and line, and its test checks only the cite's form, so a cite goes stale
  whenever its file moves (P4 moves three). Name a symbol or a marker comment instead, or check that the cited line
  holds the producer.
- **P37.** Collect every `tools/stryker` unit test in `collection.test.ts` (`...testsIn('tools/stryker')` and its
  `canary` directory), not only P4's two, so each is checked for a temporary directory left at collection. Whether any
  existing one leaves one is not verified, so it is its own change.
- (14) **P43** (was P38; P2 holds P38). Decide a pull request's mutation with the base's classifier (§15, the review's
  proposal): today, and under P4, the changes job runs the merge commit's own `affected.ts`, so a pull request decides
  its own required check. Running `claude/build-platform`'s `tools/stryker` against the merge commit's tree would make
  the decision the base's. It changes how every pull request is judged, and a pull request that edits the classifier
  then runs under the old one; mutation is still no boundary against a pull request's own code.
- (14) **P44** (was P39; P2 holds P39). Check the running pnpm against `packageManager`'s `+sha512` on CI (§15 N10, the
  review's proposal): the gate could hash the pnpm package that ran, or the workflows could install it as both
  Dockerfiles do (`tools/check-toolchain/install-pnpm.sh`), so the bytes, not only the version, are held. Every workflow
  installs pnpm through action-setup, so it is a ci-deps follow-up, not P4's.

### 14.9 In-place edits

Each is marked "(14)" where it stands; the 2026-10-26 words are kept beside the new ones wherever they are a record
(§8, §9, §13), and replaced only where they would mislead a builder. The old and new text of every edit is in
`/home/user/laneb-sp/p4reread/revise.md` and in this file's diff against 11613513.
- Header: the merges and the cut at bce57f16; cites re-mapped in 14.2.
- §1: the goal's cites and cost (every shard, 52.0 to 57.8 runner-minutes) and the two sides on CI; acceptance 1 (58
  pull requests, 22 → 15, about 297, none since #49); acceptance 3 (`$/`, `actions.lock`, the canary's manifest,
  `tools/package.json`'s module fields); acceptance 4 (every shard, the first parent's push run, per file from the
  logs, E4).
- §2: the shard's steps (`:81-107`, the bootstrap pnpm, the gate view, `packageManager`); the lockfile rule's cite; the
  root table (keys, the new scripts, `catalog:` entries, `TEST_TOOLING`'s cite); the closure table (cites, the
  `tools/package.json` row); "every other workspace manifest" (F9's reading, F10); the workspace table's keys; the
  `mutation.yml` paragraph (`$/`, cites, P1's checks); the transport paragraph (every shard, Dependabot's cite and
  schedule, the pins at their latest tags); the added globals (`actions.lock`).
- §3.1: `Change`, `changeSince` and F10; `affected()`'s cites; `RUNNER_PROOF_SHARD`'s test reading `shards.json`;
  `GLOBAL_INPUTS` with `actions.lock`, and the `--github-output` write kept. §3.2: `ci.md`'s cites. §3.3: the
  `workflows.test.ts` cite; the pnpm leg rewritten (D6). §3.4: every shard.
- §4: `mutation.yml`'s header lines, `workflows.test.ts:2537`, #86's cites, `collection.test.ts`'s lines.
- §5: a pointer to 14.6's 49 cases; `$/`; `actions.lock`; `:345-349`; the guard rewritten (F14, E3); the gate's reach
  (V5).
- §6: Part 7's header lines and notices; the revisit line for `actions.lock`; Part 4's cite; `ci.md`'s cites and three
  more edits; `mutation.yml`'s header lines; reconciliation-001's placement.
- §7: the intro, `matrix.ts` and `registry.ts` placements. §8: superseded by 14.6, the prototype's path, acceptance
  4's comparison. §9: marked as the 2026-10-26 record (14.3 governs), the prototype's path, the dropped share.
- §10: C6's transport alternative and "every shard"; C11's `actions.lock`. §11: #42's `workflows.test.ts`; ci-deps and
  ci-browser merged and the shards read; a merge commit, never a rebase; P1 merged; #84 and #86. §12: R2's time. §13:
  the N2 and N7 rows.

## 15. Review of the re-read (2026-11-01)

**Totals: 28 findings (1 blocking, 10 should fix, 17 nits): 28 fixed, 0 fixed by another means as a whole, 0 not
taken. Five were fixed with a detail corrected against the code (B1, S1, S2, S9, N10), and one part of B1 was declined
with evidence (`workspace:` in a global-holding manifest). Two more were found while folding (V7, V8), both fixed.**

The review (`designs/lane-b-ci/follow-up-p4-mutation-trigger-reread-review.md`, 18:15Z to 20:25Z) was folded from
20:23Z to 20:51Z against the worktree `/home/user/ci-mutation-trigger` at bce57f16, pnpm 10.34.8's
`/opt/pnpm-10.34.8/dist/pnpm.cjs`, the installed packages, the npm registry and GitHub's API. Each finding was first
read as possibly wrong; scratch work is in `/home/user/laneb-sp/p4reread/tmp/fold1/` and the running record in
`/home/user/laneb-sp/p4reread/progress/fold1.progress.md`. Fixes are in place, marked "(14)" as the re-read's are, and
14.6 is rewritten; 15.3 lists the places.

### 15.1 Dispositions

| Finding | Disposition | Re-checked, and why |
|---|---|---|
| B1 a root `node` bin runs every tsx step | **Fixed** | Real, with two forms refuted: a `runtime:` dependency's lockfile resolution is `{type: variations}` (`pnpm.cjs:62452-62459`), which ci's Toolchain step refuses (`check.ts:578-597`, `:819`, `:848`); the npm package `node` writes its bin in a `preinstall` that `onlyBuiltDependencies` does not allow, so no `.bin/node` appears (installed at 20:24Z). Two forms stand: a `workspace:` package with a `node` bin (shown at 20:24Z: `pnpm -s exec` finds `./node_modules/.bin/node`) and a registry package whose bin is Node itself (`node-linux-x64@24.22.2`, bin `node`, no scripts, 2026-10-29). Since names alone cannot catch the registry form, the guard that holds is the changes job's own runtime check, a step of its own in the new `runtime.ts` (§3.3, E13), with the root table's `node`/`deno`/`bun` and non-registry-specifier rule (§2), `gitEnvironment` for every git spawn (§3.1) and CI-27's wording (§7). **Declined in part:** `workspace:` stays the owners' (or the mirror rule's) in a global-holding manifest, because only the root's `./node_modules/.bin` is on a step's `PATH` (`pnpm.cjs:205061-205063`) and `tools/package.json` holds eleven such entries (`:17-26`, `:32`) |
| S1 `packages` read by a regex | **Fixed** | Real: the real `workspaceDirectories` on edited copies (`tmp/fold1/wsdirs.mts`, 20:26Z) gives 20 directories with a blank line after `- tools` (the canary's lost), 18 with a column-0 comment, and none at all, not `[""]`, with `-` and its value on the next line (`workspace.ts:45` drops the empty pattern). `packages` is compared by both readings, `workspacePatterns` exported (§2, E16), with ◆ cases |
| S2 no checkout leg | **Fixed** | Real, with the read corrected: `.git/HEAD` holds a SHA only on a pull request (`checkout … refs/remotes/pull/N/merge`); a push runs `checkout -B claude/build-platform` (`raw-pins/runs/log-122652986211.txt`), so `HEAD` is a ref. `headCommit` resolves refs, packed refs and a worktree's `gitdir:` without a spawn (E14); the gate holds every shard's commit equal and, on Actions, equal to `GITHUB_SHA` (§3.3). The review's alternative, taking `actions/checkout` out of pin-only, is not taken: a full run on the wrong ref passes too, so it would not detect what the leg detects. R2 corrected (§12) |
| S3 path-loaded files outside the global closure | **Fixed, and extended** | Real: the global closure is ten files (`closures.mts`, 20:29Z); the canary runs under `mutationTestConfig`'s aliases (`canary/vitest.config.ts`); pnpm 10.34.8 has no duplicate-name check. `GLOBAL_LOADED` (E17) feeds `globalFiles`, E3's scan and `global.imports`. Extended: E1 kept a global-holding manifest's `name` and `exports` as its owners', which are none for a package only a global file imports, so they are global when its `name` is in `global.imports` (§2) |
| S4 existing tests contradict §3.3 | **Fixed** | Real (`gate.test.ts:397-398`, `:403-404`; `test-support.ts:105`, `:108-118`; `verdict.test.ts:131-133`; ADR 0066 `:1104-1106`). Also: many gate cases pass no `unicode` listing, so the pins must be an input, not read from it. The judge takes `pins` and the commit; only `runtime.ts`'s `readPins` reads the repository (§3.3); the edits are listed in 14.6's commit 3; §6 amends Part 4 `:1104-1106` |
| S5 an added or deleted manifest runs everything | **Fixed** | Real, and concrete: #2 adds `packages/brand/package.json` (`tmp/replay.out:16`), so the text as written would have widened #2 from ledger to all four. Absent and unread sides are told apart by `git diff --name-status` (E15); an absent side is judged against `{}` (§2, §3.1), with ◆ and ★ cases |
| S6 three synth fixtures | **Fixed** | Real: 23 `fixtures/synthetic/CI-xx/expected.json` at bce57f16; `ci.yml:140` adds `git status --porcelain`. The integrator commits CI-27 to CI-29's, §4 and §7 name them, and the fix round runs `:140` verbatim (14.6) |
| S7 `prepublishOnly`, `dependenciesMeta` | **Fixed** | Real (`pnpm.cjs:164572`); none in any manifest. Both global in every workspace manifest (§2, §3.1), ★ case |
| S8 `package.yaml`, `package.json5` | **Fixed** | Real (`pnpm.cjs:3423`, `:13505-13548`; `workspace.ts:58`); none tracked (20:48Z). Both in `GLOBAL_INPUTS` (§2) |
| S9 `tools/tsconfig.json` | **Fixed** | Real, cite widened: Vite 8's default transform is Oxc (`node.js:7556-7570`, which also resolves each file's tsconfig), besides the esbuild path the review cites (`:7312-7328`); no tsconfig in `tools/stryker` or its canary. Global as E1's directory tsconfig (§2); P29 withdrawn |
| S10 #31's fixture | **Fixed** | Real: #31's manifests change `tools/package.json`'s `exports`, a script and `playwright-core`, `apps/worker`'s `exports` and a root script (`git diff 5df4108f 2ec34490`), and packets' closure does not hold `tools/package.json`, so the fixture gives pricing alone. It expects the owners of `tools/package.json` read from the closures (pricing today), so a later closure change does not break it (§5, 14.6); the alternative, the whole changed-path list judged on the live graph, would fail whenever `packages/db/src/authz` moves |
| N1 `RUNNER_PROOF_SHARD` ★ | **Fixed** | Real; ◆ now, and every B2 case is marked with commit 3's stubs named (14.6). Found with it: V8 |
| N2 F10's "no replayed PR touched it" | **Fixed** | Real (`replay.out:286`, #44); 14.1 corrected, outcome unchanged |
| N3 the prototype called the specification | **Fixed** | Real (`replay.mts:121`); 14.3 says what it lacks, and that no replayed PR reaches it (`check58.sh`) |
| N4 #89's reasons "drop" | **Fixed** | Real (`replay2.out:140-147`); 14.3 corrected |
| N5 #90, #91 missing; heads moved | **Fixed** | Real (`gh api`, 20:32Z to 20:33Z): #90 06f79c07 and #91 651f8b80 added to 14.4 with PR B; #42 is c65f9cf2 (219 files, `workflows.test.ts` still `@@ -1799` only), #83 71536c60 |
| N6 P34 superseded | **Fixed** | Real (#91's ADR 0066 Part 2 amendment states and fixes the cause); P34 withdrawn |
| N7 "nine" provisional | **Fixed** | Real (`lane-b-packet-day-counts-status.md:30`); "at least nine", "at least about 94" throughout |
| N8 `NODE_PATH` | **Fixed** | Real (`.bin/stryker:12-16`, `.bin/tsx:12-16`); named in §3.2 and in the builder's grep; `stryker/base.mjs:83` names the plugin; resolution left to acceptance 4, not verified |
| N9 D6 overstated | **Fixed** | Real (`run.ts:114-117`); §3.3 and 14.1 reworded |
| N10 `+sha512` read as integrity | **Fixed** | Real, one clause corrected: ci's Toolchain step does hold the declared hash equal to the registry's (`check.ts:370-393`), and both Dockerfiles check against it; no mutation runner checks the pnpm it runs (`run.ts:154-158`). §2 says so; P39 (now P44) proposes the check |
| N11 reason lines print pull-request keys | **Fixed** | `JSON.stringify` and a control-character key global (§3.1), ★ case. Whether GitHub still acts on `::set-output` is not verified; other commands (`::warning::`) still parse from stdout |
| N12 stricter YAML | **Fixed** | Tags, `doc.errors`/`doc.warnings` (duplicate keys) global; global scalars by source text (§2), ◆ case. js-yaml's exact readings not verified, which the rule does not need |
| N13 library manifest reads | **Fixed** | No such read today (grep, 20:29Z); the literals added to E3's scan |
| N14 `.github/actions/**` | **Fixed** | None exists; in `GLOBAL_INPUTS` |
| N15 the `v` | **Fixed** | §3.3 states it; `gate.test.ts:392` pairs the forms; ◆ case |
| N16 a shard named in a case | **Fixed** | The expected reason is built from `RUNNER_PROOF_SHARD` |
| N17 `lanes/lane-b.md` | **Fixed** | Real (`lane-b-session-brief.md:54`); §6 records P4's result in the status file |

### 15.2 Found while folding

- **V7. A root `.pnp.cjs` is required into every `pnpm exec` step** (`NODE_OPTIONS=--require=<root>/.pnp.cjs`,
  `pnpm.cjs:205052-205053`, `:205073-205076`, `:103645-103649`; also at install, `:167090`), so it reaches every
  changes, canary, shard and gate step, yet today's rule and the design named no such file. **Fixed:** `.pnp.cjs` joins
  `GLOBAL_INPUTS` (§2), in the GLOBAL_INPUTS case. Free: none exists.
- **V8. Two of 14.6's ◆ cases were red in commit 1.** Judged through `affected()`, which reads no texts in commit 1,
  `scripts.postinstall` in `packages/db` and `tools/package.json`'s `type`, `imports`, `scripts.prepare` or unlisted key
  give the owners (pricing, packets; pricing) under today's rule, not all four. **Fixed:** both are ★, and 14.6 now says
  that every `manifests.test.ts` case judges through `affected()`, so ★ and ◆ mean "differs from today" and "as today".
- Replay unchanged: none of the 58 pull requests reaches a rule this fold adds (`tmp/fold1/check58.sh` over a shared
  clone with the 21 missing heads fetched, 20:36Z to 20:37Z: only #35, #44 and #48 touch comments or blank lines in
  `pnpm-workspace.yaml`, each full both ways), so acceptance 1's 22 → 15, the same seven and about 297 runner-minutes
  stand.

### 15.3 Where the fold changed the design

Each place is marked "(14)": the header; §1 (the goal's floor, acceptance 1's widening note, 2's commit, 3's globals,
4's floor); §2 (the `+sha512` sentence, injected packages, the `PATH` and `.pnp.cjs` paragraph, two root rows, the
closure table's lifecycle row and three E1 rows, the other-manifests paragraph, `packages`, the YAML row, the
`mutation.yml` sentence, the runner proof's legs, the added globals); "Soundness" (path-loaded files); §3.1 (texts,
constants, `JSON.stringify`, `GLOBAL_LOADED`, `gitEnvironment`, `GLOBAL_INPUTS`); §3.2 (`NODE_PATH`); §3.3 (the commit,
the pins as input, the changes job's step, D6); §4; §5 (the pointer, fail closed, comments, the pin-only reason,
`RUNNER_PROOF_SHARD`, #31, the guard list, the gate); §6 (Part 4 `:1104-1106`, the status file, the revisit list); §7
(CI-27, CI-29, the fixtures); C11; R2; 14.1 (the F2, F10, F14 and D6 rows); 14.3 (the prototype, #89, the floors, the
expected output); 14.4 (#42, #83, #90, #91, PR B); 14.5 (item 3); 14.6 (rewritten; the 18:12Z text is
`tmp/fold1/146.before.md`); 14.7 (E1, E3, E8 amended; E13 to E17 new); 14.8 (P29 and P34 withdrawn; P38, P39 new,
(14) since renumbered P43 and P44, and P36 withdrawn, by the completeness critic's fold, 15.5). The whole file
before the fold is `/home/user/laneb-sp/p4reread/tmp/fold1/design.before.md`.

### 15.4 Notes

- **P numbers.** P2's re-read also starts at P29 (14.8). P29 and P34 are withdrawn here and P38 and P39 added, so the
  session's renumbering covers P29 to P39 of this file. (14) Superseded (the completeness critic's N-9): P2's design
  took P38 to P42 clear of P4's P29 to P37, so no renumbering is left for the session: P4 holds P29 to P37 (P29, P34
  and P36 withdrawn) and P43 and P44.
- **Nothing here is the founder's.** The fold adds no migration, secret, owner-admin setting or release tag, and no
  file on the "Not while #42 is open" list (`LANES.md:84-92`); the new files are `tools/stryker/runtime.ts`, its test and
  three generated fixtures.
- **The reviewer's disclosure** (its first sitting fetched `refs/pull/{84,86,75}/head` into `/home/user/PhysicalTherapy`
  and deleted the refs; no tracked file changed) is recorded; this fold fetched only into its own scratch clone,
  `tmp/fold1/clone`, removed when done, and changed no tracked file in any worktree.
- **Scouts copied** unchanged to `designs/lane-b-ci/scout-ci-mutation-trigger-reread-files.md` and
  `…-reread-upstream.md`: neither holds a 64-hex digest or a 40-hex key fingerprint, and gitleaks 8.24.3 with the
  repository's `.gitleaks.toml` finds nothing in either (20:38Z).
- **Not verified:** `link:` linking a `node` bin as `workspace:` does (only `workspace:` was run); whether ci's trust
  rule admits `node-linux-x64` (the runtime step catches it either way); GitHub's handling of
  `::set-output` today (N11); js-yaml's readings (N12); Stryker's plugin resolution under the new `NODE_PATH` (N8, left
  to acceptance 4); the fields Oxc takes from a tsconfig (S9: that it reads the file is enough).

### 15.5 Completeness critic

**Totals: 12 gaps (2 should fix, 10 nits): 12 real, 12 fixed, 0 refuted, 0 not taken. One was fixed with a detail
corrected against GitHub (N-7: #94 shares no file with P4), and one was fixed more widely than asked (N-2, as V9). Two
more were found while folding (V9, V10), both fixed.**

The critic (`/home/user/laneb-sp/p4reread/critic.md`, 20:52Z to 21:12Z) was folded from 21:12Z to 21:30Z against the
worktree `/home/user/ci-mutation-trigger` at bce57f16, GitHub's API and `git ls-remote`. Each gap was first read as
possibly wrong; scratch work is in `/home/user/laneb-sp/p4reread/tmp/fold2/` and the running record in
`/home/user/laneb-sp/p4reread/progress/fold2.progress.md`. Fixes are in place, marked "(14)", and 14.6 is rewritten
(its text before this fold is `tmp/fold2/146.before.md`, the whole file before it `tmp/fold2/design.before.md`).

| Gap | Disposition | Re-checked, and why |
|---|---|---|
| S-1 `globalFiles` drops the five canary tests | **Fixed** | Real: `importGraph` skips a `*.test.ts` seed unless `includeTests` (`watched.ts:128-136`); the five `CANARY_TESTS` give `[]` without it and 12 files with it (`tmp/fold2/s1.mts`, 21:12:32Z); the closure grown from both lists is 18 files without, 29 with (10 today, `s1b.mts`, 21:20:27Z); `closureProblems` stays `[]` (`tmp/critic/fixcheck.mts` re-run, 21:12:45Z). `globalFiles` uses `includeTests: true` (§3.1, 14.6 commit 2); the ★ `GLOBAL_LOADED` case asserts `canary/lib/index.ts` and `@tp/stryker-canary` on the real graph; both S3 synthetic worlds load a `*.test.ts`. No replayed pull request changes (§3.1) |
| S-2 S4's list of existing-case edits short; E8 untested | **Fixed** | Real (`gate.test.ts:402`, `:404`, `:405-407`, `:408`, `:412`, `:415`, `:416` are three-key runtimes; `:312-317` is an exact `toEqual` of `shardView`, `gate.ts:410-435`). Each well-formed literal gains `pnpm`, and `:405-407`, `:408` take the pins failures; the bound-equivalent message (`gate.ts:351-361`) stays, after them, since it alone names the equivalents and their remedy and keeps Part 4's rule true as written; E8 lives in `shardView` (pure, so tested), asserted inside the existing `:312-317`, and the count stays 65 (14.6 commits 3 and 4, E8) |
| N-1 `RUNNER_PROOF_SHARD` only in commit 2; stubs loose; two `DEPENDENCY_FIELDS` | **Fixed** | Real (14.6 commit 1's list; `affected.ts:499`, used at `:520`, `:539`). Commit 1 exports `RUNNER_PROOF_SHARD = 'money-ledger'`; the stubs return `''`; `DEPENDENCY_FIELDS` moves to `manifests.ts`, same members and order, and `affected.ts` imports it, with no top-level read across the import cycle |
| N-2 no-text rule for other workspace manifests; `affected.test.ts:238` | **Fixed, and extended (V9)** | Real (`affected.test.ts:238` expects `[]` with no texts). Taken the safer way for every workspace manifest, closure ones included: no text, an unread side or a parse error gives all four, since an install lifecycle script it may hold is global in each (§2, §3.1). `:237` and `:238` pass texts (14.6 commit 1); the workspace manifests' fail-closed assertions join three ★ cases, so the count stays 65 |
| N-3 three test mechanics left open | **Fixed** | Real (`shards.ts:37-45` passes `cwd: root`; `ci.yml:45` floats Node 24; `tmp/unit-push-bce57f16.log:281`: `node: v24.22.1` at 17:20:05Z). `runStryker(args, env, root = repositoryRoot, spawn = spawnSync)` with `cwd: root`; `runShard` hands an injected `spawn` through, so commit 3's red case records `pnpm` and starts nothing; `checkRuntime(runtime, pins)` is injected in every runtime case; `verdict.test.ts:132`'s pnpm is computed as the verdict computes it (§3.2, 14.6) |
| N-4 the builders' seams; `GLOBAL_LOADED`'s members disagree | **Fixed** | Real (`canary/vitest.config.ts` is loaded by path, `canary/stryker.config.mjs:25`, and imported only by `canary/verdict.test.ts:8`). B2's scan calls `globalFiles`, which grows once B1 is merged in; B1's case reads the canary config as the one `.config.mjs` token of the canary step's `run:`, which both commands hold; §3.1, E17 and the ★ case list the Vitest config; `AffectedConfig` gains an optional `globalLoaded`; the integrator's merge adds `canary/stryker.config.mjs` (`:5`) to the guard list beside `manifests.ts`, the only such file the widened scan meets (grep, 21:25:34Z) |
| N-5 `Change.texts` has three states, typed with two | **Fixed** | Real (§3.1 `:240`). `before` and `after` are `string \| null \| undefined`: text, absent, unread (§3.1) |
| N-6 #86's `mutation.yml` cites move for two reasons | **Fixed** | Real (`mutation.yml:10-18` lies above `:44-47` and `:77`; #86's test checks a cite's form only, `tmp/pr86-workflows.patch:721-722`). The integrator re-reads all three after both builders' edits, `affected.ts:776` among them, which B1 moves (14.6) |
| N-7 14.4's overlaps out of date | **Fixed, one detail corrected** | Real (21:17Z to 21:18Z: `claude/build-platform` 43565235, 16 commits past bce57f16; #83 merged 20:40:34Z; #42 at 6c28d6a2, a merge of bce57f16 committed 18:17:04Z, its hunk `@@ -1853`; #92 e4e05a0d and #93 87691be4 share `test-matrix.md`, `matrix.ts`, `registry.ts` and `watched-paths.txt`). **Corrected:** #94 (PR B, 484e9f06) shares no file with P4, since P4 edits no lockfile (§4); its 13 files are seven manifests and `pnpm-lock.yaml`. 14.4 refreshed (the merge order, #83, #42, #92, #93, #94) |
| N-8 P2's reconciliation-001 entry | **Fixed** | Real (P2 design `:365-368`, `:656`, `:1068`). P4's record goes after P1's, #86's and P2's (§6, 14.4's P2 row, 14.6) |
| N-9 P and N numbers out of step with P2's | **Fixed** | Real (P2 design `:1178-1195`, `:1242-1243`, `:1646-1648`). P38 and P39 become P43 and P44; P36 is withdrawn as P2's P39 (`:1184-1186`); E6 and the integrator number Part 7's notices from N43; 14.8 and 15.4's renumbering note superseded |
| N-10 two stale comments on no file list | **Fixed** | Real (`canary/stryker.config.mjs:17-18`; `ci.md:585-586`). B2 edits the first (§4, 14.6), the integrator the second (§6, 14.6) |

**Found while folding.**
- **V9. A closure manifest's fail-closed answer was its owners**, while §2 makes an install lifecycle script global in
  every workspace manifest, so an unread or unparseable `packages/db/package.json` with a new `postinstall` would have
  run only pricing and packets. **Fixed** with N-2: all four for every workspace manifest (§3.1). No cost: on CI
  `changeSince` reads every changed workspace manifest, so only a git failure or a broken manifest, which fails the
  install anyway, reaches the rule.
- **V10. #83's merge moved one P4 cite.** V4's `tools/screening-capacity/watched-paths.txt:463, :466` (bce57f16) are
  `:465, :468` at 43565235 (`git show`, 21:18Z); every other P4 cite holds there, since #83's hunks in the shared files
  start after P4's regions. Recorded in 14.4 and 14.6; the integrator re-maps it at the first base merge.

**Where this fold changed the design** (each marked "(14)"): §2 (the `+sha512` sentence's proposal number, the E1
`name` row, the other-manifests paragraph); §3.1 (the `texts` type, the fail-closed rule, `GLOBAL_LOADED` with
`includeTests` and `globalLoaded`); §3.2 (`runStryker`'s signature); §4 (`canary/stryker.config.mjs`); §5 (fail
closed); §6 (reconciliation after P2's; `ci.md:585-586`); 14.1 (F16's notice number); 14.4 (the refresh, #83, #42, P2,
#92, #93, #94); 14.6 (rewritten); 14.7 (E3, E6, E8, E17); 14.8 (the intro, P36 withdrawn, P43 and P44); 15.1 (N10's
proposal number); 15.3; 15.4 (the P-number note).

**Notes.**
- **Disclosure.** At about 21:18Z this fold ran `git fetch -q origin claude/build-platform` in
  `/home/user/PhysicalTherapy` to count the commits since bce57f16. It moved only the remote-tracking ref
  `origin/claude/build-platform` (bce57f16 to 43565235, its reflog shows the fetch); `HEAD` stays bce57f16 and no
  tracked file changed. No other git command wrote to a worktree, and GitHub was only read.
- **Nothing here is the founder's**: no migration, secret, owner-admin setting, release tag or file on the "Not while
  #42 is open" list (`LANES.md:84-92`).
- **Not verified:** that a `vi.mock` of `node:child_process` would have served as well as the injected `spawn` (not
  tried; injection was taken because commit 3's red case must start no process and `trackedFiles` in `shards.test.ts:19`
  needs the real `execFileSync`); whether #92, #93 and #94 merge before P4 (not in Lane B's merge order).
