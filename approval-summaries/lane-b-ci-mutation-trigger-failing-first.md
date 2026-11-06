# P4 (co-001/ci-mutation-trigger): failing first

Written by the integrator on 2026-11-02. Each ★ case of design 14.6 ran red at its red commit, in a temporary worktree
cut there (`git worktree add --detach`, then `pnpm install --frozen-lockfile --offline`), and green at the head
`50029e64…`, the same test files run the same way. Every red is an `AssertionError`: none is a missing export, a
module that cannot load or a syntax error. The temporary worktrees were removed afterwards.

| Run | Commit | Command | Result | Log (under `/home/user/laneb-sp/p4build/logs/`) |
| --- | --- | --- | --- | --- |
| B1 red | commit 1, `11c18c2f…` | `pnpm exec vitest run --project unit tools/stryker/manifests.test.ts tools/stryker/affected.test.ts tools/stryker/workspace.test.ts` | 2 of 3 files failed; **29 failed**, 60 passed (89); 29 of 29 an `AssertionError` | `int-ff-c1-red.log` (01:51:03Z to 01:52:05Z) |
| B1 at the head | `50029e64…` | the same | 3 files, 89 passed | `int-ff-head-b1.log` (to 01:59:19Z) |
| B2 red | commit 3, `01c70218…` | `pnpm exec vitest run --project unit tools/stryker tools/test` | 6 of 34 files failed; **20 failed**, 389 passed (409); 20 of 20 an `AssertionError` | `int-ff-c3-red.log` (to 01:58:03Z) |
| B2 at the head | `50029e64…` | the same | 35 files, 457 passed | `int-ff-head-b2.log` (to 02:00:59Z) |

JSON reports of the four runs: `/home/user/laneb-sp/p4build/ff/{c1-red,c3-red,head-b1,head-b2}.json`. The builders'
own red runs gave the same counts (`b1-commit1-red.log`, `b2-commit3-red.log`).

## The 44 ★ cases: red at their commit, green at the head

| # | Commit | File | Case | Red at its commit (first line of the assertion) | Head |
| --- | --- | --- | --- | --- | --- |
| 1 | commit 1 | `stryker/affected.test.ts` | gives the runner-proof shard’s packages alone when only step references move from one SHA to another, with their comments | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [ 'money', 'ledger' ] | passed |
| 2 | commit 1 | `stryker/affected.test.ts` | gives none for a change to mutation.yml’s comments alone | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [] | passed |
| 3 | commit 1 | `stryker/affected.test.ts` | gives all four for .npmrc, a pnpmfile, a patch, the workflows’ action lockfile, a package.yaml or package.json5, .pnp.cjs and a local action | AssertionError: .npmrc: expected [] to deeply equal [ 'money', 'pricing', 'ledger', …(1) ] | passed |
| 4 | commit 1 | `stryker/affected.test.ts` | gives all four for the tsconfig.json of a package that holds the mutation tooling (tools/tsconfig.json) | AssertionError: expected [ 'pricing' ] to deeply equal [ 'money', 'pricing', 'ledger', …(1) ] | passed |
| 5 | commit 1 | `stryker/affected.test.ts` | holds GLOBAL_LOADED to every file a shard loads by path, and only those, and follows their imports, tests included | AssertionError: expected [] to deeply equal [ 'stryker/ledger.config.mjs', …(11) ] | passed |
| 6 | commit 1 | `stryker/affected.test.ts` | gives none for #3’s manifests: a db:domain-model script in the root and in packages/db | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [] | passed |
| 7 | commit 1 | `stryker/affected.test.ts` | gives the owners of tools/package.json for #31’s manifests: its exports, besides scripts, an unread dependency and an app’s exports | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [ 'pricing' ] | passed |
| 8 | commit 1 | `stryker/affected.test.ts` | gives none for #43’s root manifest: the typecheck and lint scripts | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [] | passed |
| 9 | commit 1 | `stryker/affected.test.ts` | runs with no node_modules/.bin directory, and no relative one, on its PATH, every other entry and variable kept | AssertionError: expected { …(3) } to deeply equal { …(3) } | passed |
| 10 | commit 1 | `stryker/manifests.test.ts` | affects none for a new root script and an edited one (scripts.lint:x, scripts.test) | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [] | passed |
| 11 | commit 1 | `stryker/manifests.test.ts` | affects none for a bump of @next/eslint-plugin-next in the root manifest, which no closure and no tooling imports | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [] | passed |
| 12 | commit 1 | `stryker/manifests.test.ts` | affects none for packages/db gaining a script no install runs (scripts.db:domain-model, #3) | AssertionError: expected [ 'pricing', 'packets' ] to deeply equal [] | passed |
| 13 | commit 1 | `stryker/manifests.test.ts` | affects none for tools/package.json gaining playwright-core or @sigstore/verify, which no closure and no tooling imports | AssertionError: expected [ 'pricing' ] to deeply equal [] | passed |
| 14 | commit 1 | `stryker/manifests.test.ts` | affects all four for packages/db’s postinstall, and for no text, an unread side or invalid JSON there | AssertionError: expected [ 'pricing', 'packets' ] to deeply equal [ 'money', 'pricing', 'ledger', …(1) ] | passed |
| 15 | commit 1 | `stryker/manifests.test.ts` | affects all four for prepublishOnly or dependenciesMeta in packages/db or in apps/web | AssertionError: expected [ 'pricing', 'packets' ] to deeply equal [ 'money', 'pricing', 'ledger', …(1) ] | passed |
| 16 | commit 1 | `stryker/manifests.test.ts` | affects all four for tools/package.json’s type, imports, prepare, an unlisted key or no text, and its owners for its exports or name | AssertionError: type: expected [ 'pricing' ] to deeply equal [ 'money', 'pricing', 'ledger', …(1) ] | passed |
| 17 | commit 1 | `stryker/manifests.test.ts` | affects none for an edit of tools/package.json’s scripts.screening:capacity | AssertionError: expected [ 'pricing' ] to deeply equal [] | passed |
| 18 | commit 1 | `stryker/manifests.test.ts` | affects all four for a node entry or a link: specifier in tools/package.json, and its owners for a new workspace: entry | AssertionError: expected [ 'pricing' ] to deeply equal [ 'money', 'pricing', 'ledger', …(1) ] | passed |
| 19 | commit 1 | `stryker/manifests.test.ts` | affects all four for apps/web gaining a postinstall, and for no text, an unread side or invalid JSON there | AssertionError: expected [] to deeply equal [ 'money', 'pricing', 'ledger', …(1) ] | passed |
| 20 | commit 1 | `stryker/manifests.test.ts` | affects all four for a workspace manifest added or deleted with a postinstall | AssertionError: expected [] to deeply equal [ 'money', 'pricing', 'ledger', …(1) ] | passed |
| 21 | commit 1 | `stryker/manifests.test.ts` | affects all four for a script key holding a newline and a workflow command, and prints it JSON-quoted | AssertionError: expected [] to deeply equal [ 'money', 'pricing', 'ledger', …(1) ] | passed |
| 22 | commit 1 | `stryker/manifests.test.ts` | affects none for a catalog line for react or playwright-core, which no closure imports | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [] | passed |
| 23 | commit 1 | `stryker/manifests.test.ts` | affects pricing and packets for a catalog zod line: both import zod | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [ 'pricing', 'packets' ] | passed |
| 24 | commit 1 | `stryker/manifests.test.ts` | affects none for entries added to minimumReleaseAgeExclude or trustPolicyExclude, which a frozen install never reads | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [] | passed |
| 25 | commit 1 | `stryker/manifests.test.ts` | affects none for reordered scripts or catalog entries alone | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [] | passed |
| 26 | commit 1 | `stryker/manifests.test.ts` | affects none for comments alone (a YAML comment outside packages) or JSON whitespace | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [] | passed |
| 27 | commit 1 | `stryker/manifests.test.ts` | affects pricing alone for a root dependency only pricing’s closure imports | AssertionError: expected [ 'money', 'pricing', 'ledger', …(1) ] to deeply equal [ 'pricing' ] | passed |
| 28 | commit 1 | `stryker/manifests.test.ts` | affects the packages whose closure holds the files that import a dependency of packages/db, fewer than its owners | AssertionError: expected [ 'pricing', 'ledger', 'packets' ] to deeply equal [ 'pricing', 'packets' ] | passed |
| 29 | commit 1 | `stryker/manifests.test.ts` | affects all four for the name or exports of a manifest whose name a by-path-loaded test imports, and for another manifest taking that name | AssertionError: expected [] to deeply equal [ 'money', 'pricing', 'ledger', …(1) ] | passed |
| 30 | commit 3 | `stryker/gate.test.ts` | fails a shard whose verdict names another Node than the pinned one, naming both | AssertionError: expected [] to deeply equal [ Array(1) ] | passed |
| 31 | commit 3 | `stryker/gate.test.ts` | fails a shard whose verdict names another pnpm than the root packageManager’s, naming both | AssertionError: expected [] to deeply equal [ Array(1) ] | passed |
| 32 | commit 3 | `stryker/gate.test.ts` | fails a verdict that names no pnpm: it names no runtime | AssertionError: expected [] to deeply equal [ Array(1) ] | passed |
| 33 | commit 3 | `stryker/gate.test.ts` | fails a shard that scores no Unicode-bound equivalent and ran on other ICU data | AssertionError: expected [] to deeply equal [ Array(1) ] | passed |
| 34 | commit 3 | `stryker/gate.test.ts` | reads the pnpm version out of packageManager, its +sha integrity allowed, and nothing out of any other form | AssertionError: expected '' to be '10.34.8' // Object.is equality | passed |
| 35 | commit 3 | `stryker/gate.test.ts` | reads the pins from unicode.json’s checkedOn and the root packageManager, and refuses a packageManager it cannot pin, naming it | AssertionError: expected { Object (node, unicode, ...) } to deeply equal { node: '24.22.0', …(3) } | passed |
| 36 | commit 3 | `stryker/gate.test.ts` | fails a shard that names no commit, or ran on another commit than the tested one or than another shard, naming both | AssertionError: expected [] to deeply equal [ Array(1) ] | passed |
| 37 | commit 3 | `stryker/runtime.test.ts` | names each of a Node, Unicode, ICU and pnpm that differs from the pins, passes the pinned runtime with Node’s v either way, and exits 1 on any difference | AssertionError: expected { lines: [], status: +0 } to deeply equal { lines: [ …(2) ], status: +0 } | passed |
| 38 | commit 3 | `stryker/shards.test.ts` | runs each of the shard’s packages through Stryker by path, under the shard’s variable, in the root, and starts no pnpm | AssertionError: money-ledger: expected [ 'pnpm', 'pnpm' ] to not include 'pnpm' | passed |
| 39 | commit 3 | `stryker/stryker.test.ts` | runs @stryker-mutator/core’s bin.stryker, found through its package.json from the given root, on this Node, in that root | AssertionError: expected [ { command: 'pnpm', …(2) } ] to deeply equal [ { …(3) } ] | passed |
| 40 | commit 3 | `stryker/stryker.test.ts` | fails, naming the package, and starts nothing when the root holds no usable @stryker-mutator/core of its own | AssertionError: not installed: expected [Function] to throw an error | passed |
| 41 | commit 3 | `test/workflows.test.ts` | runs only whole commands it lists, none of them a script, Stryker by path, and checks the changes job’s runtime before it decides | AssertionError: changes: expected [ …(2) ] to deeply equal [ …(3) ] | passed |
| 42 | commit 3 | `test/workflows.test.ts` | lets no file a mutation run loads run a process but git and Stryker by path, or name a manifest or this workflow but those listed with what they read | AssertionError: expected [ …(4) ] to deeply equal [] | passed |
| 43 | commit 3 | `stryker/canary/verdict.test.ts` | reads pnpm’s version from the user agent pnpm sets for a step it runs | AssertionError: expected '' to be '10.34.8' // Object.is equality | passed |
| 44 | commit 3 | `stryker/canary/verdict.test.ts` | reads the commit checked out from .git: a detached HEAD, a branch’s loose or packed ref, a worktree’s; none when it cannot | AssertionError: expected '' to be '1111111111111111111111111111111111111…' // Object.is equality | passed |

## Red at commit 3 too, not P4 cases (the count stays 65)

| File | Case | Why red at commit 3 | Red (first line) | Head |
| --- | --- | --- | --- | --- |
| `stryker/gate.test.ts` | lists a failed gate’s problems in its summary, and one shard’s scores and survivors for its own log | an existing case edited inside its `it` (§15 S4, S-2; E8 at `:312-317`) | AssertionError: expected [ …(4) ] to deeply equal [ …(5) ] | passed |
| `stryker/gate.test.ts` | fails a shard whose canary verdict does not name the Node that ran it | an existing case edited inside its `it` (§15 S4, S-2; E8 at `:312-317`) | AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ] | passed |
| `stryker/gate.test.ts` | passes the equivalents on the Unicode data they were checked on, and fails them, naming each, on other data | an existing case edited inside its `it` (§15 S4, S-2; E8 at `:312-317`) | AssertionError: expected [] to deeply equal [ Array(1) ] | passed |
| `test/workflows.test.ts` | runs every selected shard, the canary first, then the shard in full, and uploads its reports overwriting a re-run’s | an existing case: the canary line it expects (`:2537`) is the by-path one | AssertionError: expected 'pnpm stryker run tools/stryker/canary…' to be 'pnpm -s exec tsx tools/stryker/stryke…' // Object.is equality | passed |
| `test/workflows.test.ts` | passes every workflow, Dependabot and version assertion with every action pin and image digest rewritten, and fails on one deliberate break, so the run reads the copy | an existing case: its nested vitest runs `workflows.test.ts`, which holds commit 3's red cases | AssertionError: JSON report written to /tmp/tp-workflows-H0OEb3/report-GrBNIH/report.json | passed |

## The 21 ◆ guards: green at their commit and at the head

| # | Commit | File | Case | At its commit | Head |
| --- | --- | --- | --- | --- | --- |
| 1 | commit 1 | `stryker/affected.test.ts` | gives all four for #40’s mutation.yml: it moves the artifact actions with the other pins | passed | passed |
| 2 | commit 1 | `stryker/affected.test.ts` | gives all four for any other change to mutation.yml: a tag or branch ref, a job-level ref, docker://, ./ and $/ refs, another action or path, an artifact action, runs-on, with:, run:, a new step, a step-order change | passed | passed |
| 3 | commit 1 | `stryker/affected.test.ts` | holds the runner-proof shard to packages no other shard holds, read from stryker/shards.json | passed | passed |
| 4 | commit 1 | `stryker/manifests.test.ts` | affects all four for a YAML anchor, alias or merge key on either side | passed | passed |
| 5 | commit 1 | `stryker/manifests.test.ts` | affects all four for a blank line or a column-0 comment inside packages, which the mutation tooling’s own reading sees | passed | passed |
| 6 | commit 1 | `stryker/manifests.test.ts` | affects all four for a root dependency named node, deno or bun, and for a specifier moved to or from runtime:, workspace:, link:, file: or git | passed | passed |
| 7 | commit 1 | `stryker/manifests.test.ts` | affects all four for a root or catalog entry of a package only a by-path-loaded test imports | passed | passed |
| 8 | commit 1 | `stryker/manifests.test.ts` | affects all four for an explicit tag, a duplicate key, or a global key’s scalar rewritten to the same value | passed | passed |
| 9 | commit 1 | `stryker/manifests.test.ts` | affects all four for catalog vitest, packages, onlyBuiltDependencies, overrides, patchedDependencies and nodeLinker | passed | passed |
| 10 | commit 1 | `stryker/manifests.test.ts` | affects all four for decimal.js in the root manifest: money imports it, and every closure reaches money | passed | passed |
| 11 | commit 1 | `stryker/manifests.test.ts` | affects all four for invalid JSON or YAML on either side, an unread side, or no text in the root manifest, the workspace file or the workflow | passed | passed |
| 12 | commit 1 | `stryker/manifests.test.ts` | affects all four for the canary’s manifest, which a global glob holds: a script or its exports | passed | passed |
| 13 | commit 1 | `stryker/manifests.test.ts` | affects all four for the root manifest’s packageManager (with and without its hash), engines, type, name, private, pnpm.overrides, postinstall and prepare | passed | passed |
| 14 | commit 1 | `stryker/manifests.test.ts` | affects all four for the test tooling and what the tooling imports in the root manifest: vitest, @vitest/coverage-v8, @stryker-mutator/core, fast-check, tsx, yaml, and vitest moved from catalog: to a range | passed | passed |
| 15 | commit 1 | `stryker/manifests.test.ts` | affects none for a workspace manifest added or deleted with no install script | passed | passed |
| 16 | commit 1 | `stryker/manifests.test.ts` | affects none for apps/web’s scripts.dev or a dependency of its own | passed | passed |
| 17 | commit 1 | `stryker/manifests.test.ts` | affects packages/db’s owners for a workspace: specifier, its exports, its type and a key no table lists | passed | passed |
| 18 | commit 1 | `stryker/manifests.test.ts` | affects the closure’s packages for a name that captures the import, and none for one that captures nothing | passed | passed |
| 19 | commit 1 | `stryker/manifests.test.ts` | affects the owners for two reordered exports conditions, and all four for two reordered overrides | passed | passed |
| 20 | commit 3 | `stryker/canary/verdict.test.ts` | gives no pnpm when no user agent names one | passed | passed |
| 21 | commit 3 | `stryker/gate.test.ts` | passes a shard on the pinned runtime, its Node as process.version writes it against the pin as checkedOn does | passed | passed |

## The integrator's seams, red before green

- **The guard scan** (E3): after both merges (`19af33ea…`), the scoped run was 35 files, 1 failed and 456 passed
  (`int-merge-scoped.log`): the guard named `tools/stryker/manifests.ts` (`package.json`, `pnpm-workspace.yaml`,
  `mutation.yml`) and `tools/stryker/canary/stryker.config.mjs` (`mutation.yml`), each a real file. Green with both
  entries in `5d75d2bf…` (`int-seams2.log`).
- **Collection** (`collection.test.ts`): with the three new test files in `FILES`, collecting left four
  `tp-manifests-` directories behind (`int-seams.log`: an `AssertionError`). Green once `manifests.test.ts` writes its
  synthetic worlds in `beforeAll`, in `77475c25…` (`int-seams2.log`).

## At the head

`pnpm test` (`int-check-test.log`): 409 files, 6,981 passed, 4 skipped (6,985), none failed. The scoped run
`pnpm exec vitest run --project unit tools/stryker tools/test`: 35 files, 457 passed (`int-ff-head-b2.log`).
