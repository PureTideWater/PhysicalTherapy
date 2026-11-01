# P4 re-read at bce57f16: adversarial review (security and supply chain; CI infrastructure)

Reviewed: `designs/lane-b-ci/follow-up-p4-mutation-trigger.md` as revised on 2026-11-01 (17:47Z to 18:13Z; 1,074 lines,
§14 and the 56 edits marked "(14)"). Read whole, then checked against the worktree `/home/user/ci-mutation-trigger` at
bce57f16, pnpm 10.34.8's `/opt/pnpm-10.34.8/dist/pnpm.cjs`, the installed packages, GitHub's API and github/docs
33b1f4a6 (read only). Run in two sittings: 18:15Z to about 18:45Z, then 19:57Z to 20:25Z. Every cite is at bce57f16
unless a time or URL is given. Scratch work: `/home/user/laneb-sp/p4reread/tmp/rv/`.

**Verdict: 1 blocking, 10 should fix, 17 nits.** The re-read's arithmetic, cites and GitHub facts hold (listed at the
end). The blocking finding is a Node change the classifier calls inert that §3.3's new Node leg then turns into a red
push run. Most should-fix findings are places where the classifier compares what the shard does not read (S1, S3, S9),
where the install runs something §2 does not list (S7, S8), or where the plan omits work the pipeline will hit (S4, S6).

## Blocking

### B1. A root `node` dependency is inert under P4, yet every `pnpm -s exec tsx` step then runs on it, so the push run goes red after a pull request that ran nothing

- **Shims.** `node_modules/.bin/tsx:17-21` runs `"$basedir/node"` whenever `node_modules/.bin/node` exists. Only
  otherwise does it run `node` from `PATH`. `node_modules/.bin/stryker:17-21` does the same. `pnpm exec` puts the root's
  `./node_modules/.bin` first on `PATH` (`pnpm.cjs:205061-205063`), so a bare `node` lookup finds that file too.
- **What creates `.bin/node`.** pnpm resolves a root dependency `"node": "runtime:<v>"` to a package whose `bin` is
  `node` (`pnpm.cjs:62435-62460`; `deno` and `bun` likewise at `:62577`, `:62662`). pnpm's own writer turns such an
  entry into `devEngines.runtime` (`:13650-13690`), which §2 already makes global. The forms that stay a dependency are:
  - a hand-written `"devDependencies": {"node": "runtime:24.22.2"}`;
  - the npm package named `node`;
  - a root `workspace:` entry whose package declares a `node` bin.
- **How P4 classes it.** The root table's mirror rule (§2, `:103`) finds `node` neither in `TEST_TOOLING` nor imported,
  so the entry is inert. The lockfile rule (`lockedPackages`, `affected.ts:514-546`) follows only imports and
  `TEST_TOOLING`, so it sees no move.
- **Today.** The root `package.json` is whole-file global, so the pull request runs every shard. Today's gate holds only
  Unicode and ICU (`gate.ts:351-361`), and Node 24.22.2 carries 24.22.0's ICU 78.3 and Unicode 17.0 (14.3), so the run
  passes.
- **Under P4.** The pull request runs no shard and `ci` stays green: the tests pass on 24.22.2. After the merge, every
  shard's verdict names v24.22.2, and §3.3's new Node leg fails every shard of the push run. P31 proposes exactly this
  Node move.
- **The same lookup, already on the base.** The changes job's `git` (`execFileSync('git', …)`, `affected.ts:688, :706,
  :721, :740`) and today's `runShard` `pnpm` (`shards.ts:41`) are also found through `node_modules/.bin`.

**Fix (inside P4's files):**
1. In the root table, and for E1's global-holding manifests, these entries are global, each with a ◆ case:
   - an entry named `node`, `deno` or `bun`;
   - any `runtime:` specifier;
   - any `workspace:` entry.
2. Before it decides anything, the changes job checks its own runtime and fails closed with a message on any
   difference (one ★ case):
   - `process.version` must equal `v` + `unicode.json`'s `checkedOn.node`;
   - the pnpm in `npm_config_user_agent` must equal `packageManager`'s.

   This catches any `.bin/node` shadow on every pull request, whatever the classification.
3. `affected.ts` spawns `git` with `node_modules/.bin` removed from `PATH`.
4. CI-27's assertion names the runtime entries.

## Should fix

### S1. pnpm-workspace.yaml's `packages` list is read by a regex, not as YAML, so "comments and formatting are never a change" is false for it
`workspaceDirectories` reads the list with `/^packages:\r?\n((?:[ \t]+[-#][^\n]*(?:\n|$))+)/m` (`workspace.ts:37-45`,
the pattern at `:39`). The aliases every shard uses (`vitest.mutation.config.ts:88-123`) and every closure come from
it. P4 compares the parsed YAML. `tmp/rv/wsregex.mjs` (20:00Z) shows edits that leave the YAML `packages` equal while
the regex reads something else:
- a blank line after `- tools` drops `tools/stryker/canary/lib`;
- a column-0 comment after `- packages/*` keeps only `apps/*` and `packages/*`;
- `-` with its value on the next line gives `[""]`, the root as a workspace directory.

P4's ★ "comments alone affect none" makes each of these inert. Today only `workspace.test.ts:63-68`, a `ci` unit test
naming seven directories, catches them.

**Fix:**
- Export the pattern reader of `workspace.ts:37-45` as a pure function, and classify `packages` by both readings:
  any difference, or a throw on either side, is global.
- Add ◆ cases for the blank line and the column-0 comment.

### S2. The runner proof has no checkout leg, so R2's "it shows on the first push run" is false for a checkout regression
§2 names the checkout among what a pin changes. The checks see less:
- §3.3 and E8 hold only Node, Unicode, ICU and pnpm.
- A `pull_request` run checks out the merge ref by default; a push checks out `github.sha`.
- A pin-only `actions/checkout` bump that changed what a pull request checks out passes money-ledger's canary and the
  gate, and every later pull request.
- The push runs, which check out the pushed commit either way, never show it.

**Fix:**
- The verdict records the commit its shard ran on. After checkout `.git/HEAD` holds the detached SHA, and `verdict.ts:1`
  already imports `node:fs`.
- The gate requires every shard's commit to equal the others' and `GITHUB_SHA`, a default variable read from
  `process.env`, so no `${{ }}` expression is added and E12 holds.
- One ★ gate case.

The alternative, taking `actions/checkout` out of pin-only like the transport actions, costs the saving in checkout
weeks.

### S3. The global closure and the guard scan miss the files Stryker and Vitest load by path
`GLOBAL_ENTRY_POINTS` (`affected.ts:133`) and `globalFiles` (`:595-599`) follow imports only. The global closure at
bce57f16 is ten files (`tmp/scripts/closures.mts`, re-run 19:59Z). These run in every shard yet are not in it:
- `stryker/{money,ledger,pricing,packets}.config.mjs`, whose paths `shards.ts:41` passes;
- `tools/stryker/seed-setup.ts`, a `setupFiles` path (`vitest.mutation.config.ts:70, :127`);
- every file under `tools/stryker/canary/` except `verdict.ts`.

Consequences:
- (a) E3's scan (the global closure plus the package closures) never reads them. A manifest read or a spawn added there
  escapes the guard that holds the "every other script" rows inert. `canary/stryker.config.mjs:5` already holds the
  literal `mutation.yml` (a comment).
- (b) Their bare imports are not in `global.imports`, so a root or catalog entry for a package only they import would be
  inert under the mirror rule. Today they import only `fast-check` and `vitest`.
- (c) F9's "a capture turns that manifest into a closure manifest" does not hold for the canary's `@tp/stryker-canary`
  (`canary/linked.test.ts:1`), which no closure holds.
  - A workspace package of the same name earlier in workspace order (`apps/*` comes first, `pnpm-workspace.yaml:2-8`;
    `resolveWorkspaceImport` keeps the first of equal length, `workspace.ts:124`) would capture it in every shard's
    aliases.
  - P4, like today's rule, calls that edit inert.

**Fix:**
- Treat those files as global entry points for the closure computation, so their imports reach `global.imports` and
  their directories reach E1.
- Run E3's scan over the same union, with `canary/stryker.config.mjs` listed for its comment.
- This is free: all of them already sit under `GLOBAL_INPUTS` globs.

### S4. Existing tests contradict §3.3, and the files they live in are not in the plan
- `gate.test.ts:403-404` reads "Another Node with the same data is the same data", and passes v24.23.0 with 17.0 and
  78.3. P4's Node leg inverts that.
- `gate.test.ts:397-398` expect today's "names no runtime (node, unicode and icu, …)" text.
- `test-support.ts:104-105`'s `TEST_RUNTIME` has no `pnpm`. `canaryOf` (`:117`) builds every gate fixture's verdict
  from it, so every gate case that uses it fails "no runtime" once `pnpm` is required.
- `verdict.test.ts:131-133` expects `.runtime` to equal the three keys.
- `test-support.ts` is in neither §4's list nor B2's files (14.6).
- ADR 0066 Part 4 states the Unicode-and-ICU-only rule at `:1104-1106`, which Part 7 widens, yet §6 amends only
  `:1163-1164`.

**Fix:**
- B2's commit 4 lists these edits:
  - `:404` inverted, so Node v24.23.0 fails, naming both;
  - the message at `:397-398`;
  - `TEST_RUNTIME` gains `pnpm`;
  - `verdict.test.ts:132-133` gains `pnpm`.
- `test-support.ts` joins §4 and B2's files.
- The gate's judge takes the wanted pnpm as an input and only the CLI reads `package.json:5`, so tests never read the
  repository's manifest and a `packageManager` bump touches no test.
- §6 adds the amendment at Part 4 `:1104-1106`.
- The counts do not change: every edit sits inside an existing `it`.

### S5. Every added or removed workspace manifest would run all four packages: a widening the replay did not measure
- **The rule as written.** §5 (`:291-292`) and 14.6 (`:928-929`) say "a missing side … gives all four", and §3.1
  (`:197-199`) fails closed on "no text on either side".
- **What it does.** An "other workspace manifest" that is added or deleted has a missing side. So a lane pull request
  adding `packages/foo` would run every shard; today it runs none (`affected.ts:624-660`).
- **What the replay measured.** The prototype judged #44's added manifest "inert (added/removed other manifest)"
  (`tmp/replay.out:286`). Acceptance 1's "none is widened" was therefore measured under another rule.
- **Why the 58 did not show it.** None of them adds a workspace package: all but the canary's predate #1 (`git log
  --diff-filter=A`, c81168c7).

**Fix:**
- Tell "absent at that revision" apart from "could not be read". An absent side is judged against `{}`:
  - an install lifecycle script on the present side is global;
  - `name` and `exports` follow F9;
  - anything else is inert.
- An unreadable side stays fail-closed.
- ◆ cases: an added `apps/foo/package.json` with no lifecycle script affects none; one with `postinstall` affects all
  four; the same for a deletion.
- The root manifest, the workspace YAML and `mutation.yml` keep "missing → global".

### S6. `pnpm synth --all` writes three fixtures; the plan says none, and its local check would not see them
- Every CI row has `fixtures/synthetic/CI-xx/expected.json` (CI-01 to CI-23 at bce57f16; P1 added CI-21's in
  edbc928e). The file holds the row's title, assertion and `assertedBy` (CI-17's).
- 14.6 says "`pnpm synth --all` with no fixture changed".
- The fix round checks `git diff --exit-code -- fixtures/synthetic`, which ignores untracked files.
- `ci.yml:140` adds `test -z "$(git status --porcelain -- fixtures/synthetic)"`. So the local check passes, and CI fails
  on the three new directories if they are not committed: one more round.

**Fix:**
- The integrator commits `fixtures/synthetic/CI-2{7,8,9}/expected.json`, and §4 lists them.
- The fix round runs `ci.yml:140`'s line verbatim.
- A later rewording of CI-27 to CI-29 regenerates them.

### S7. `prepublishOnly` and `dependenciesMeta` are missing from §2's install rows
An injected workspace package runs `preinstall`, `install`, `postinstall`, `prepare` and `prepublishOnly` at install
(`pnpm.cjs:164572`). The gap:
- `LIFECYCLE_SCRIPTS` (§2 `:100`, `:113`) lacks `prepublishOnly`.
- `dependenciesMeta` is inert in an "other workspace manifest" and an owners' key in a closure manifest.

So two edits together run in every shard's install, yet P4 runs nothing: `"dependenciesMeta": {"@tp/x": {"injected":
true}}` in `apps/web/package.json`, and a `prepublishOnly` in `packages/x`.

**Fix:**
- `LIFECYCLE_SCRIPTS` gains `prepublishOnly`.
- `dependenciesMeta` in any workspace manifest is global.
- ◆ cases for both.
- This is free: no manifest has either, and no `injectWorkspacePackages` is set (grep, 20:19Z).

### S8. `package.yaml` and `package.json5` manifests fall outside the rule acceptance 3 states
pnpm reads a project's manifest from `package.json`, `package.json5` or `package.yaml` (`pnpm.cjs:3423`,
`:13499-13545`). P4 reads only `package.json`:
- `workspaceDirectories` keeps only directories with a `package.json` (`workspace.ts:58`);
- §3.1 fills `texts` only for `package.json`.

So a workspace directory whose `package.yaml` holds a `postinstall` runs it in every shard, yet neither P4 nor today's
rule reads it. Acceptance 3 and C10 say "an install lifecycle script in any workspace manifest" is global.

**Fix:**
- `GLOBAL_INPUTS` gains `**/package.yaml` and `**/package.json5`, with a ◆ case.
- This is free: none is tracked (`git ls-files`, 20:19Z).

### S9. P29 belongs inside P4: `tools/tsconfig.json` is read for the canary in every shard
- Vite 8.3.4 resolves each TS file's nearest tsconfig (`vite/dist/node/chunks/node.js:7312-7328` in
  `node_modules/.pnpm/vite@8.3.4…`, read 20:08Z). From it, it takes `alwaysStrict`, `experimentalDecorators`,
  `importsNotUsedAsValues`, the `jsx*` options, `preserveValueImports`, `target`, `useDefineForClassFields` and
  `verbatimModuleSyntax`.
- The canary's TS files have no tsconfig nearer than `tools/tsconfig.json`: there is none in `tools/stryker/` or
  `tools/stryker/canary/`.
- Today that file counts for pricing alone, so an edit there runs pricing's shards while the canary in money-ledger and
  packets reads it too.
- P29 said this was "not verified"; it is now. It is F11's class, at nil cost: one commit in its history, its creation.

**Fix:**
- E1 also makes the global-holding directory's `tsconfig.json` global (today `tools/tsconfig.json`), with a ◆ case.
- Drop P29.

### S10. The #31 replay fixture's expected value comes from code files, not manifests
- Under the prototype, #31's narrowed "pricing, packets" are all `packages/db/src/**` files (imported), at
  `tmp/replay.out:154-163`.
- Its manifest reasons are the inert `screening:capacity` scripts and `playwright-core` entry, plus `tools/package.json`
  `exports` (pricing).
- §5 (`:304-306`) and 14.6 (`:936-937`) build the fixture from "each pull request's changed manifests and workflow …
  copied in as text". That yields pricing alone, not the ★ "pricing and packets".

**Fix:** state either one:
- the fixture carries #31's whole changed-path list (paths only) with the manifest texts, judged on this repository's
  graph; or
- the fixture expects pricing alone.

## Nits

- **N1. The `RUNNER_PROOF_SHARD` ★ cannot fail first.** If commit 1 exports the constant the case passes; if not,
  typecheck fails. Mark it ◆. Also say which commit holds the unmarked `gate.test.ts` parse cases and the
  `verdict.test.ts` cases, and that commit 3 stubs their exports, since "every commit typechecks".
- **N2. F10's "No replayed pull request touched it" is false.** #44 added `tools/stryker/canary/lib/package.json`
  (`tmp/replay.out:286`). The outcome is unchanged: #44 runs every shard either way.
- **N3. 14.3 calls the prototype "§2's tables as amended here", which overstates it.**
  - `replay.mts:121` hard-codes the workspace directories.
  - It implements neither E2 (`replay.out:286`) nor F11.
  - The results do not change.

  Say so, so that nobody treats it as the specification. E9 rightly runs acceptance 1 with the pull request's own
  `affected()`.
- **N4. 14.3's "#89 … its two closure-manifest reasons drop" is false.** Under the prototype they stay, named by the
  mirror rule ("`dependencies.@aws-sdk/client-textract (imported)`", `tmp/replay2.out:140-147`).
- **N5. 14.4 omits the Dependabot batch's replacement pull requests**, which brief §4a lets merge once ready, possibly
  before P4:
  - #90 (06f79c07, opened 18:28:33Z) touches `test-matrix.md`, `matrix.ts`, `registry.ts` and the lockfile.
  - #91 (651f8b80, opened 18:34:25Z) adds an ADR 0066 Part 2 amendment at old `:728`, rewrites the CI-12 row in
    `test-matrix.md` and `matrix.ts`, and changes `.github/dependabot.yml` (+20 −1). P4 cites the latter at `:74-86`,
    which may move.
  - PR B is claimed (`LANES.md:202`).

  Heads have also moved since 14.4: #42 is c65f9cf2 (its 219 files and its `workflows.test.ts` hunk at `@@ -1799` are
  unchanged, read 20:13Z) and #83 is 71536c60.
- **N6. P34 is superseded.** #91 states the cause in its ADR amendment: a group with no patterns outranks wildcard
  patterns. Drop P34.
- **N7. "Nine once #84 merges" is provisional.** #84's fix round splits `packets-words` further
  (`approval-summaries/lane-b-packet-day-counts-status.md:30`; reviews PE-5 and CORR-19). Write "at least nine" and "at
  least about 94". E10 keeps P4's tests clear of it.
- **N8. §3.2's list of what changes in Stryker's environment omits `NODE_PATH`.**
  - Today the canary's Stryker gets the stryker shim's `NODE_PATH`: core's own `node_modules` directories plus
    `.pnpm/node_modules` (`.bin/stryker:12-16`). A shard's Stryker gets that with tsx's appended.
  - By path, Stryker gets tsx's alone (`.bin/tsx:12-16`).

  Name it, and add `NODE_PATH` to the builder's grep. Acceptance 4 is the proof.
- **N9. D6 overstates the second guard.**
  - When action-setup works, the pnpm on `PATH` already is 10.34.8.
  - When self-update fails, the step fails (`run.ts:114-117`, fetched 20:05Z).
  - If a later action-setup left another pnpm on `PATH`, the guard would be that pnpm's handling of `packageManager`,
    not pnpm 10's setting.

  Reword.
- **N10. "with its `+sha512`" (§2) reads as integrity, which nothing checks on CI.** action-setup strips the hash
  (`run.ts:154-158`) and self-updates by version in its own directory (`:112-114`). Say so; a check is proposed below.
- **N11. Reason lines print keys the pull request controls** (script names, catalog names) to stdout and the step
  summary. A key holding a newline and `::` is read as a workflow command. Print each key with `JSON.stringify`, and make
  a key with a control character global. This is a nit because mutation is no boundary against a pull request's own
  code.
- **N12. Make the YAML read stricter, at no cost.**
  - Fail closed on any explicit tag (`!`, `!!`) and on `doc.errors` or `doc.warnings`. Duplicate keys are errors under
    `yaml`'s default.
  - Compare global keys' scalars by source text: `yaml`'s core schema and pnpm's js-yaml differ on timestamps and tags,
    and `030` and `30` both parse to 30.
- **N13. The literal guard misses library reads.** A manifest read through a helper package (`read-pkg`,
  `read-package-up`, `pkg-up`, `@npmcli/package-json`) or through `process.env.npm_package_*` holds no literal. Add those
  module names and the variable prefix to the scanned literals.
- **N14. A local action's files are not global.** D7 makes a changed `$/` reference global, but once `mutation.yml` uses
  a local action, edits to its files (`.github/actions/**`) are no global input. Add `.github/actions/**` to
  `GLOBAL_INPUTS`. It is free: no `.github/actions` exists.
- **N15. State the `v` normalization in the Node leg.** `process.version` is `v24.22.0` and `checkedOn.node` is
  `24.22.0`. Keep a ◆ case with both forms; `gate.test.ts:392`'s fixtures already differ that way.
- **N16. The pin-only ★ case names a shard.** It expects "pins only: runner proved on money-ledger", against E10. Build
  the expected text from `RUNNER_PROOF_SHARD`.
- **N17. §6's "`lanes/lane-b.md` records P4 done" conflicts with the brief.** `lane-b-session-brief.md:54` says the
  orchestrator writes `lanes/lane-b.md` from the status file. Record P4's result in the status file.

## Checked and holds

- **Replay counts** (`tmp/replay-summary.txt`, recounted 20:17Z):
  - the 35 (#1 to #49) go from 17 to 10 full runs;
  - the 58 go from 22 to 15, and are 37 merged, 12 closed and 9 open;
  - the seven narrowed are #2, #3, #4, #6, #25, #31 and #43;
  - saved: 294.29 runner-minutes at the twelve-run means, 296.91 at the ten-run means (49.34 × 2 + 53.88 × 3 + 32.05 +
    4.54);
  - the weekly projection is 49.34 + 53.88 + 53.88 = 157.1.
- **C4.** pnpm 10.34.8 reads the release-age and trust keys only when resolving (`pnpm.cjs:169491-169495`,
  `:175724-175728`; the reads at `:178543` and on are `outdated`'s). action-setup's self-update runs in its own
  directory, so it never reads the repository's `pnpm-workspace.yaml` (`run.ts:112-114`).
- **The §3.3 pattern** matches `package.json:5` (`pnpm@10.34.8+sha512.<hex>`).
- **D4.** `base.sha` is the merge base. The first sitting checked #75, #84 and #86 at 18:20Z; #75's head was committed
  after the tip it was not merged with.
- **github/docs 33b1f4a6:** `workflow-syntax.md:741-749` (`$/`) as cited.
- **E4's premise.** The first sitting found all seven shards' per-file Stryker tables identical between push runs
  40646308297 and 41330911489 (fetched 18:27Z), which is stronger than 14.1's three money-ledger tables.
- **Cites spot-checked:**
  - `mutation.yml` throughout;
  - `workflows.test.ts:2469`, `:2537`, `:2618-2625`, `:2627-2633`;
  - `collection.test.ts:28-46`;
  - `verdict.ts:58-66`, `:150`;
  - `gate.ts:49`, `:222`, `:228-235`, `:351-361`;
  - `ci.yml:82-92` (the token at `:91`);
  - `dependabot.yml:74-86`;
  - `check-action-pins/workflows.ts:14`, `:113-124`;
  - `age.ts:795`;
  - `exclude-window.ts:29`;
  - the eight `catalog:` entries at `package.json:47-49`, `:51`, `:53-56`;
  - job 122675954379's lines 172 ("Switching pnpm …") and 253-254 (the banner).
- **Duplicate keys.** Node 24 reads the last duplicate key of a `package.json`, as `JSON.parse` does (`tmp/rv/dupkey`,
  20:11Z), so the two readings do not diverge.
- **Test counts.** 49 = 26 + 9 + 2 + 7 + 2 + 2 + 1. `collection.test.ts` is a single `it` (`:52`), so new `FILES`
  entries add no test.
- **Nothing reserved.** P4 needs no secret, no migration and no founder-kept decision. It touches no file on the "Not
  while #42 is open" list (`LANES.md:84-92`).

## Proposals outside P4 (for the status file)

- **Decide a pull request's mutation with the base's classifier.** Today, and under P4, the changes job runs the merge
  commit's own `affected.ts`, so a pull request decides its own required check.
- **Check the running pnpm against `packageManager`'s hash on CI** (N10). For example, the gate hashes the pnpm package
  that ran, or the workflow installs through corepack.

## Notes

- The P-number clash with P2's re-read stands (both start at P29). With S9, P29 drops; with N6, P34 drops.
- **Not verified:**
  - whether GitHub still acts on a `::set-output` line in stdout (N11);
  - js-yaml's exact reading of the scalars in N12;
  - Stryker's plugin resolution under the changed `NODE_PATH` (N8), left to acceptance 4.
- **Disclosed from the first sitting.** At 18:20Z it fetched `refs/pull/{84,86,75}/head` into `/home/user/PhysicalTherapy`
  as `refs/remotes/pr/*` and deleted those refs at once (`git update-ref -d`). No tracked file changed, and the objects
  remain loose. No other tree was touched.
- **Scratch.** The blobless github/docs clone and the test directories under `tmp/rv/` were removed when this review
  was written.
