# Review of P4 (`p4-design.md`, a narrower mutation trigger), adversarial, 2026-10-26

Against 6ddd587 (`/home/user/PhysicalTherapy`), `co-001/ci-deps` at 19e3d98e (`/home/user/ci-deps`, unchanged since the
design read it), `lane-b-ci.md` §3.2.6, §3.3 (O7, `:2175-2185`) and §3.4, pnpm 10.34.8's own `dist/pnpm.cjs`
(`scratchpad/pnpm10348/...`), and the P1/P2 designs. **Counts: B 0, S 7, N 10.**

## What was checked and holds

- pnpm cites, each read at the line given: lockfile settings check `:175231-175249` (catalogs, overrides,
  patchedDependencies, packageExtensions, pnpmfile checksum, ignoredOptionalDependencies; no release-age or trust
  key); `OUTDATED_LOCKFILE` `:175441-175453`; release age and trust read only on the resolution path `:169491-169495`,
  `:175724-175728`; `enable-pre-post-scripts` true `:18906`; pre/post in `runScript` `:204854-204858`; bin conflict
  order `:103318-103365` (direct first, then own name, then later `localeCompare` name wins, so `@stryker-mutator/core`
  loses to any other non-own-name `stryker` bin: §3.2's reason is right).
- `pnpm -s exec` sets `npm_config_user_agent` (`makeEnv`, `:202927`, user agent built at `:19036`). Measured here:
  `pnpm -s exec tsx` prints `pnpm/10.28.0 npm/? node/v24.22.0 linux x64`, `execArgv` carries tsx's loader and
  `NODE_OPTIONS` does not, so `spawn(process.execPath, [bin])` runs Stryker on plain Node, as `pnpm stryker` does today.
- `@stryker-mutator/core` 10.1.1: `exports` = `{".", "./package.json"}`, `bin.stryker` = `./bin/stryker.js`.
- Shard means, recomputed from the three runs' jobs (`gh api .../actions/runs/<id>/jobs`): money-ledger 4.03,
  packets-scan 6.40, packets-rest 6.13, pricing-engine 7.24, pricing-recompute 3.99, pricing-rest 5.18; 33.0 in all.
- The replay (`scratchpad/p4/sim.out`): 35 pull requests into the build branch (`prmeta.tsv`: 48 rows, 13 into
  `main`), 16 full under today's rule and 7 narrowed (the seventh is #30, full for other reasons and not in §9's
  table); exactly nine differ (#2, #3, #4, #6, #25, #31, #37, #40, #43); 215 runner-minutes at final heads.
- Closures at 6ddd587 (`scratchpad/p4/closures.ts` re-run): no root-owned file in any package closure; no closure file
  spawns anything; global imports are `.`: `@stryker-mutator/api`, `vitest` and `tools`: `yaml`, as §2 says.
- Line cites: `affected.ts:108, 111-120, 553-558, 603, 613, 623-637, 699-712`; `affected.test.ts:242, 334-338`;
  `gate.ts:352-361`; `verdict.ts:57-66`; `workflows.test.ts:1364`; `workspace.ts:36-59`; `mutation.yml:81-98, 92`;
  `shards.ts:41`; ADR 0066 `:413`; `ci.md:205-206, 325, 332`; `test-matrix.md:211-212`; `matrix.ts:292`;
  `registry.ts:465`.
- ci-deps' `mutation.yml` diff is pins plus the header comment only, and its PR (#48) replays as pin-only plus a
  global `packageManager`. ci-browser changes `runs-on` only (global, correct). No `.npmrc`, `.pnpmfile.*` or `patches/`
  exists at either head, so C8 runs nothing more today.
- Upstream events and rate limits: the classifier reads `git show` texts only, and the new gate rules read the verdict
  and `package.json`. Neither touches the network, so neither can turn the lanes red on an upstream event.

## S (should fix)

**S1. Pin-only is not scoped. It would pass a reusable-workflow ref or a non-SHA ref as "pins only".**
§2 (`:86-91`) cuts *every* `uses:` value at its last `@`. A job-level `uses:` (a reusable workflow,
`jobs.<id>.uses: owner/repo/.github/workflows/x.yml@ref`) replaces a whole job's logic, the changes job's or the
gate's included, yet its ref change would count as pin-only and run one shard. A change from a SHA to `@v7` or `@main`
also counts as pin-only. `check-action-pins` (ci-deps, `tools/check-action-pins/index.ts`, every workflow, in
ci.yml's static job) refuses that, but P4 neither names nor tests that dependency, and its own rule should fail
closed without it.
*Fix:* pin-only only when every differing value is a `jobs.*.steps[*].uses` of the form
`<owner>/<repo>[/<path>]@<40-hex>` on **both** sides, with the same owner, repo and path. Anything else is global:
job-level `uses:`, `docker://`, `./local`, or a non-SHA ref. Add ★ cases for each. §2 should name check-action-pins
(Part 2; P1's age floor, Part 5) as what vouches for the new SHA.

**S2. The runner proof does not exercise what a transport pin changes. A broken pin can merge green and turn later
pricing and packets PRs red.**
With one shard, the gate's `download-artifact` (`mutation.yml:181-186`, `pattern: mutation-*`, `merge-multiple: true`)
merges one artifact, never several. ci-deps moves exactly these (upload v4.6.2 to v7.0.2, download v4.3.0 to v8.0.2). A
download or merge regression across several artifacts passes the money-ledger proof. It then fails every later pull
request that runs two or more shards, which every pricing or packets PR does, until someone fixes it. §1's "proves the
new pins end to end" (`:29-30`, `:90`) and R2's "small, bounded window" (`:319-321`) overstate the proof.
*Fix:* a change to the `actions/upload-artifact` or `actions/download-artifact` ref is global, and the other step
pins stay on money-ledger. Dependabot's weekly `actions` group (`ci-deps:.github/dependabot.yml:84-86`) carries those
two only in the weeks they move. Reword §2, R2 and §9's projection ("every week ... about 28 saved" becomes "in weeks
without an artifact-action bump").

**S3. The test that holds "every other script is inert" covers less than the claim it backs.**
§2 rests the row on "no mutation step and no closure file runs one" (`:71`, `:98-99`). The ★ test (`:190-192`) only
checks `pnpm` calls in `mutation.yml` and spawns in the *global entry points'* closure. Three gaps remain:
(a) `node --run <script>` (Node 24 runs `package.json` scripts), `npm run`, `npx` and `corepack pnpm …` all pass a
rule that only looks at `pnpm` calls;
(b) the four *package* closures are never scanned, though they are what "no closure file" means;
(c) nothing holds that no closure file *reads* `package.json`, `pnpm-workspace.yaml` or `mutation.yml`.
`DATA_ROOTS` (`affected.ts:126`) scans only `fixtures`, `content` and `docs`, so a listed reader could read the root
manifest unseen. None of the three happens today: I grepped and computed the closures. But this test is the only guard
on the narrowing.
*Fix:* hold each `run:` of `mutation.yml` to an allowlist of whole commands (`pnpm install --frozen-lockfile`,
`pnpm -s exec tsx tools/stryker/<file>.ts …`, and the gate job's shell). Scan the union of the global and package
closures for `child_process` use and for those three file names as literals.

**S4. The soundness claim misses workspace projects' install lifecycle scripts.**
pnpm runs `preinstall`, `install`, `postinstall`, `preprepare`, `prepare` and `postprepare` for every workspace
project on a frozen install (`pnpm.cjs:167203`, `:175971`; `projectsToBeBuilt`), not only the root's. So a `postinstall`
added to `apps/web/package.json` runs in every shard and can rewrite `node_modules`, and no rule affects any package
today. The gap predates P4. But C8 (`:295-296`) adds globals precisely "to close gaps in today's rule, which P4's
soundness claim needs", and §2's "Every way the three files reach a shard is a row above" leaves out the same
mechanism one directory down. No workspace manifest has such a script today (checked across `git ls-files
'*package.json'`).
*Fix:* the classifier reads every workspace manifest that changed, whether or not it is in a closure, and makes an
added or changed install lifecycle script in any of them global. Add a ★ case and a CI-27 clause.

**S5. "The frozen install proves it cannot change the installed tree" is false for an added or bumped root dependency.**
§2 (`:57`, `:98-101`) says an inert specifier leaves "the same installed tree". When the lockfile moves with the
specifier, the tree does change. pnpm hoists everything into `node_modules/.pnpm/node_modules` by default
(`hoist-pattern: *`), so a new root devDependency can change the version an imported third-party package reaches
through an undeclared (phantom) require. The lockfile rule (`affected.ts:623-637`) counts only declared transitive
dependencies, so it misses that move. Today the whole-file global covers the root manifest. After P4 only the lockfile
rule does, which is what every non-root manifest already relies on.
*Fix:* restate the claim as "no weaker than the lockfile rule already is for every other manifest", name the hoisting
limit, and add it to Part 7's revisit list. No code change is needed.

**S6. "JSON key order alone affects none" is fail-open for order-sensitive fields.**
§5 (`:177`) makes key order a non-change. In `exports` and `imports`, condition order decides resolution, and in
overrides, order can decide which of two overlapping selectors applies. Both are global fields, but if the comparison
ignores order, reordering them is "no change" and runs nothing.
*Fix:* compare each field order-sensitively, for example `JSON.stringify` of the parsed value without sorting keys
(`JSON.parse` and `yaml` both keep key order). A reordered inert field (`scripts`) stays inert. A reordered global
field becomes global. Replace the ★ case with that pair.

**S7. C7's reason is false: the replay does find a run that narrowing closure manifests would save.**
C7 (`:290-294`) keeps closure manifests (`packages/*/package.json`, `tools/package.json`) whole-file because "the replay
finds no run it would save". In `sim.out`, #3's only reason for pricing is `packages/db/package.json (a manifest of its
closure)`. That diff (merge base of 61b8b80 to f59bbed) only adds `scripts.db:domain-model`. Narrowed, #3 runs nothing:
16.4 more runner-minutes saved, and 17 runs in all rather than 9. Lane PRs edit db's, rules' and tools' scripts
regularly: `tools/package.json` has `scripts.screening:capacity`, and #42 touches `tools/screening-capacity/**`. Under
the standing rule, effort is not a reason to stop.
*Fix:* extend the classifier to closure manifests now. `scripts` other than lifecycle scripts are inert. Dependency
fields follow the mirror rule against that package's own closure imports. `name`, `exports`, `imports`, `type`,
`dependencies` with `workspace:` and every unlisted key make that manifest's packages affected, not all four. Restate
acceptance 1 (16 full runs become 7, ten runs saved) and add CI-27 wording. If it is still kept out, give a true
reason.

## N (nits)

- **N1.** §9 (`:259`): "before ci-browser, 16.4 → 0" for `browser-tests` contradicts C7. Before ci-browser, the bump
  edits `tools/package.json` (`playwright-core: 1.56.1`, a pricing closure manifest), which C7 leaves whole-file, so it
  stays 16.4. Drop the clause, or make it true by S7.
- **N2.** §11 (`:310-312`) says P1 and P2 share "only ADR 0066, the matrix and synth". All three edit
  `tools/test/workflows.test.ts` (`p1-design.md:194`, `p2-design.md:255`, here `:155`). Name it, and say who rebases
  (rule 6 applies to documents, not tests).
- **N3.** §11 lists `docs/product/reconciliation-001.md` as shared with #42, but §6 never edits it. Its Lane B list
  (`:143-146`) names the four PRs. Either add P4's line there (P1 does, `p1-design.md:258`) or drop the claim.
- **N4.** §6 lists `lanes/lane-b.md`, which is not in the repository (`git ls-files` finds no `lanes/`). It is
  `/home/user/ops/lanes/lane-b.md`, a session commit on the ops branch, not part of the PR. Say so.
- **N5.** Failing first: some ★ cases pass against 6ddd587, because `packageManager`, `runs-on`, `vitest` and the
  "gives all four" cases already give all four. `manifests.test.ts` and `RUNNER_PROOF_SHARD` fail only because the
  module or export is missing. Split ★ into narrowing cases, which must fail on their assertion (export a stub
  `classifyManifests` that returns `global` in commit 1), and guard cases, which are green before and after.
- **N6.** §3.3 compares to "root `packageManager`'s pnpm". Specify the parse (`^pnpm@(\d+\.\d+\.\d+)(\+sha\d+\..+)?$`,
  anything else fails closed) and test the `+sha512.` form that Corepack and Dependabot may write.
- **N7.** The pnpm leg of §3.3 is close to tautological: `manage-package-manager-versions` defaults to true
  (`pnpm.cjs:18940`; switch at `:214066`), so the pnpm that runs is `packageManager`'s, whatever action-setup installed.
  Keep it, but say it guards only `manage-package-manager-versions=false` and a user-agent override, which are global
  inputs anyway.
- **N8.** pnpm reads `pnpm-workspace.yaml` with js-yaml, which applies `<<` merge keys. The `yaml` package's 1.2
  default does not. A `catalog: { <<: *x }` would parse to a catalog entry named `<<`, which the mirror rule calls inert.
  The lockfile rule backs it up, but the clean fix is fail-closed: any anchor, alias or merge key in either file is
  global, with a ★ case.
- **N9.** §3.2 changes how every shard launches Stryker: the `npm_lifecycle_*` and `npm_package_*` variables that
  `pnpm stryker` set are gone. Acceptance 4 should require P4's full run to report, per package, the same mutant counts
  and statuses as the base's last push run, not only green.
- **N10.** The `name` row (`:73`) says "unknown or rare". The concrete reason is that `pnpm exec` exports it as
  `PNPM_PACKAGE_NAME` (`pnpm.cjs:205081`). Cite that. Also, §11's O7 sentence is moot at P4's cut, since ci-browser has
  merged by then. Replace it with "re-read `stryker/shards.json` at the cut; the `RUNNER_PROOF_SHARD` test holds it".

## Is it the best option?

The approach is right: fail closed, an allowlist of inert fields, specifiers left to the lockfile, Stryker run by path,
and the runtime held on every shard. With S1, S2 and S6 it is safe. With S3, S4 and S5 its soundness claim is true as
written. S7 is where the design falls short of the standing rule, because it stops short of the same classifier on
closure manifests for a reason the replay disproves.
