# P4 re-read: files and code at bce57f16 (scout-files)

Scout for the re-read of `designs/lane-b-ci/follow-up-p4-mutation-trigger.md` (and its 2026-10-26 review) against
`claude/build-platform` bce57f16 (#82 merged 2026-11-01 17:19:46Z). Read 2026-11-01 17:24-17:43 UTC in the worktree
`/home/user/ci-mutation-trigger` (at bce57f16, nothing changed in it) and a scratch clone
`/home/user/laneb-sp/p4reread/tmp/repo` (`git clone --shared`, every `refs/pull/*/head` fetched from GitHub; removed
after). Every cite below is at bce57f16 unless marked; old cites are the design's (6ddd587). Scripts and raw output:
`/home/user/laneb-sp/p4reread/tmp/scripts/{closures,guards,replay}.mts`, `summarise.py`;
`tmp/{replay.out,replay2.out,replay-summary.txt,mutation-runs.tsv,pr-run-costs.tsv,all-prs-full.tsv}`; progress
`progress/scout-files.progress.md`.

## 1. Every cite, re-read at bce57f16

Since 6ddd587, `tools/stryker` changed in three files only (`affected.ts` +29 -4, `affected.test.ts` +17 -3,
`shards.test.ts` +6 -3: all #49 and #52), `stryker/` in two (#52: `shards.json`, `base.mjs`), `vitest.mutation.config.ts`
(+8, #52), `mutation.yml` (#48 pins, #77 runners) and the manifests (#48, #77, #49, #52, #56, #47) (`git diff --stat
6ddd587 bce57f16 -- …`). `workspace.ts`, `shards.ts`, `gate.ts`, `canary/verdict.ts` and `equivalent/*.json` are
unchanged.

| Design cite (6ddd587) | bce57f16 | Holds? |
|---|---|---|
| `affected.ts:38-39` header ("…the root manifest, the workspace list, the workflow) affect all four") | `:38-39` | yes |
| `affected.ts:108` `TEST_TOOLING` | `:118` (`['vitest', '@vitest/*', '@stryker-mutator/*', 'fast-check', 'tsx']`) | yes |
| `affected.ts:111-120` `GLOBAL_INPUTS` | `:121-130` (`package.json` `:125`, `pnpm-workspace.yaml` `:126`, `mutation.yml` `:129`, `tools/stryker/**` `:123`) | yes, whole-file |
| `affected.ts:126` `DATA_ROOTS` | `:136` | yes |
| `affected.ts:378-391` (`Closure.imports` keyed by directory) | field `:377`; `importsOf` `:395-408` | yes |
| `affected.ts:403-415` (closure manifests) | `closureOf` `:414`; manifests `:420`, `:428-432` (package.json and tsconfig.json of every workspace package a closure file lies in) | yes |
| `affected.ts:553-558` `Change` | `:574-579` (files + lockfile texts only) | yes |
| `affected.ts:603-639` `affected()` | `:624-660` | yes |
| `affected.ts:613` global test | `:634` | yes |
| `affected.ts:618` manifest test | `:639` | yes |
| `affected.ts:623-637` lockfile rule | `:644-658` | yes |
| `affected.ts:699-712` `changeSince` | `:720-733` (texts for `pnpm-lock.yaml` only, `:732`) | yes |
| `affected.test.ts:242` (`affects(['package.json'])` gives all four) | `:242` | yes |
| `affected.test.ts:334-338` ("gives all four for the mutation tooling") | `:345-349` | yes |
| `shards.ts:41` (`spawnSync('pnpm', ['stryker', 'run', …])`) | `:41` | yes |
| `canary/verdict.ts:57-66` (`Runtime`, `currentRuntime`) | `:58-62`, `:64-66` | yes |
| `gate.ts:352-361` (Unicode only for bound equivalents) | `:351-361` | yes |
| `workspace.ts:36-59` (`workspaceDirectories`) | `:36-59` | yes |
| `mutation.yml:81-98` (a shard's steps) | `:81-107` (checkout `:81`, action-setup `:84`, setup-node 24.22.0 `:85-88`, install `:89`, canary `:90-93`, shard `:94-95`, per-shard gate view `:96-98`, upload `:100-107`) | yes; the design's list omits the per-shard gate step |
| `mutation.yml:92` (canary line) | `:92` (`pnpm stryker run tools/stryker/canary/stryker.config.mjs`) | yes |
| `mutation.yml:168-186`, `:181-186` (gate job checkout..download) | `:168-186`, download `:181-186` (`pattern: mutation-*`, `merge-multiple: true`) | yes |
| `mutation.yml:10-13` header | "What runs" `:10-15`; the Node line `:17-18` (rewritten by #48) | moved |
| `workflows.test.ts:1364` (canary line) | `:2537`; mutation describe `:2469-2657`; affected call `:2519`; Node == `unicode.json` `checkedOn.node` `:2618-2625`; every pin `parsePin` `:2627-2633` | moved |
| `package.json:2-55` | `:2-57` | moved |
| `pnpm-workspace.yaml:1-29`, ci-deps `:31-43` | `:1-52` (below) | moved |
| `ci-deps:tools/check-action-pins/workflows.ts:14` `PIN` | `tools/check-action-pins/workflows.ts:14` (on base) | yes |
| `ci-deps:ci.yml:80-86` (Action pins) | `ci.yml:82-92` (P1 adds `GITHUB_TOKEN` on that step `:91` and the age floor) | moved |
| `ci-deps:.github/dependabot.yml:84-86` (actions group) | `:84-86`; cooldown 7 `:82-83` | yes |
| ADR 0066 `:413` ("…the root manifest, the workspace list, the root tsconfigs and the workflow affect all four") | `:1163-1164` | moved |
| `ci.md:205-206`, `:325`, `:332` | `:469-470`, `:589`, `:596` | moved |
| `test-matrix.md:211-212`; `matrix.ts:292`; `registry.ts:465` | `:257-264`; `:435`; `:623` | moved |
| `reconciliation-001.md:143-146` | `:141-146` (unchanged); P1's record is `:659-661`, not after item 4 | see F19 |
| pnpm 10.34.8 `dist/pnpm.cjs` `:175231`, `:175441-175453`, `:169491`, `:175724`, `:167203`, `:175971`, `:175212`, `:18906`, `:204854`, `:205081`, `:103318`, `:103356`, `:18940`, `:214066`, `:202927`, `:19036` | each read at `/opt/pnpm-10.34.8/dist/pnpm.cjs` (214,706 lines), 17:27 UTC | yes (text at each line matches the design's claim) |

What the design relies on, at bce57f16:
- **What makes every package affected.** `GLOBAL_INPUTS` (`affected.ts:121-130`) by glob, plus every file of the
  global entry points' closure (`:133`, `globalFiles` `:595-599`). The global closure is now 10 files: `stryker/base.mjs`,
  `tools/content-files.ts`, `tools/screening-capacity/watched.ts`, `tools/stryker/{affected,gate,mutants,shards,workspace}.ts`,
  `tools/stryker/canary/verdict.ts`, `vitest.mutation.config.ts`; its third-party imports: `.`: `@stryker-mutator/api`,
  `vitest`; `tools`: `yaml` (`tmp/scripts/closures.mts`, 17:30 UTC). Unchanged in kind.
- **The closure rule.** Unchanged (`:414-480`). Closures at bce57f16: money 8 files (manifests: money); pricing 97
  (contracts, db, money, pricing, rules, **tools**); ledger 31 (ledger, money); packets 145 (contracts, db, money,
  packets, pricing, rules, triage). So `tools/package.json` and `packages/db/package.json` remain closure manifests.
- **How shards are listed.** `stryker/shards.json`: **seven** shards since #52 (`:12` money-ledger, `:38` packets-scan,
  `:46` packets-rest, `:64` packets-explain, `:80` pricing-engine, `:88` pricing-recompute, `:96` pricing-rest);
  money-ledger holds money (4 files) and ledger (13, `ledger/payment.ts` added) whole, and no other shard holds either.
  `shardsFor` `affected.ts:681`.
- **How Stryker is invoked.** Still by root script/bin: `shards.ts:41` and `mutation.yml:92`. Root bins
  (`node_modules/.bin`): eslint, stryker (`../@stryker-mutator/core/bin/stryker.js`), tsc, tsserver, tsx, vitest. No
  workspace manifest has a `bin`. `@stryker-mutator/core` 10.1.1: `exports` `{".", "./package.json"}`, `bin.stryker`
  `./bin/stryker.js` (read 17:33 UTC). §3.2's mechanism holds.
- **The runtime canary.** `verdict.ts:58-66` records node, unicode, icu (no pnpm); `gate.ts:351-361` checks Unicode/ICU
  only for shards scoring bound equivalents. Unchanged.
- **mutation.yml as #48 and #77 left it.** No path filter: `on.pull_request` is null (`:22`, asserted
  `workflows.test.ts:2495`), so every pull request runs `changes`. All three jobs `runs-on: ubuntu-26.04` (`:42`, `:72`,
  `:116`). Pins: checkout v7.0.1 `3d3c42e5` (`:49`, `:81`, `:168`), action-setup v6.1.0 `ea17c68d` (`:53`, `:84`,
  `:172`), setup-node v7.1.0 `949feb24` (`:54`, `:85`, `:174`), upload-artifact v7.0.2 `cf430e03` (`:100`),
  download-artifact v8.0.2 `90008278` (`:181`); setup-node `node-version: 24.22.0` (`:56`, `:87`, `:177`) with `cache:
  pnpm`; action-setup has no `with` (it takes `packageManager`). affected.ts is called once, `:64`:
  `pnpm -s exec tsx tools/stryker/affected.ts --event "$EVENT" --base "$BASE" --github-output … --summary …`, after a
  `fetch-depth: 0` checkout (`:52`); a non-PR event measures every package (`affected.ts:768-770`).
- **Manifest fields P4 must classify.**
  - Root `package.json:2-57` keys: `name`, `private`, `type`, `packageManager` (`:5`,
    `pnpm@10.34.8+sha512.<128 hex>`), `engines` (`:6-8`), `scripts` (`:9-40`), `devDependencies` (`:41-57`). No `pnpm`,
    `devEngines`, `dependencies`. Eight root devDependencies are now `catalog:` (`:47-49`, `:51`, `:53-56`:
    `@types/node`, `@vitest/coverage-v8`, `eslint`, `fast-check`, `tsx`, `typescript`, `typescript-eslint`, `vitest`), so
    their bumps arrive as catalog edits; the Stryker trio stays `^10.1.1` (`:44-46`).
  - `pnpm-workspace.yaml:1-52`: `packages` `:1-8` (includes `tools/stryker/canary/lib` `:8`); `catalog` `:11-29` (#48
    added `@vitest/coverage-v8`, `eslint`, `typescript-eslint`; #77 `playwright-core: 1.64.1`); `overrides` `:33-34`
    (`typed-rest-client>qs: 6.16.1`); `onlyBuiltDependencies` `:37-38` (esbuild); `minimumReleaseAge: 4320` `:44`;
    `minimumReleaseAgeExclude: []` `:45` (flow sequence); `trustPolicy: no-downgrade` `:50`; `trustPolicyExclude`
    `:51-52`. No `catalogs`, `patchedDependencies`, `packageExtensions`, `ignoredOptionalDependencies`, `nodeLinker`, and
    no anchor, alias or merge key. Only #48 and #77 changed it.
  - Workspace manifests (`git ls-files '*package.json'`, 23): every one has `version`, `private`, `description`
    (unlisted in §2's closure table, so owners'); `packages/brand` also `main`, `types`, `files`, `sideEffects`;
    `packages/ui` `peerDependencies`. **No install lifecycle script in any manifest**, no `bin`, no `pnpm` field. No
    `.npmrc`, `.pnpmfile.*` or `patches/` tracked.
- **Scripts added since 6ddd587.** Root: `actions:check` (`:37`) and `toolchain:check` (`:38`), both #48 (`git log -S`).
  Packages: none (tools' `screening:capacity` and db's `db:domain-model` predate 6ddd587). Manifest edits since #48 on
  the first-parent line: only #77 (`git log --first-parent e908c214..bce57f16 -- <manifests, lockfile>`); #82 (P1) changed
  none.
- **Three facts the design's §2/§3.1 do not account for** (F9, F10, F11 below):
  - `workspace.ts:83-91` reads **every** workspace manifest's `name` and `exports`, and `vitest.mutation.config.ts:88-123`
    aliases them all in every shard. Sound today because `closureOf` resolves imports by the same reading
    (`resolveWorkspaceImport`, `workspace.ts:124`), so a closure import that reaches a package makes its manifest a
    closure manifest at the head.
  - `tools/stryker/canary/lib/package.json` is a workspace manifest (`pnpm-workspace.yaml:8`) under `tools/stryker/**`
    (`affected.ts:123`), and the canary's case 3 imports `@tp/stryker-canary` by name (`canary/linked.test.ts:1`).
  - `tools/package.json:5` (`"type": "module"`) is the manifest of the global entry points' own files, yet it counts
    only for pricing.
- **Guard scan** (`tmp/scripts/guards.mts`, union of the global and four package closures, 200 files): `child_process`
  is imported by `tools/stryker/affected.ts` (`:1`; `git` at `:688`, `:706`, `:721`, `:740`) and `shards.ts`; the
  literals `package.json`/`pnpm-workspace.yaml` occur in `affected.ts`, `workspace.ts`,
  `tools/screening-capacity/watched.ts` (`:70-86`, its watched-path list) and `vitest.mutation.config.ts` (`:82-85`,
  comments); `mutation.yml` only in `affected.ts`; no file names `npm_lifecycle`, `npm_package`, `npm_config` or `PNPM_`.

## 2. Tests

- Local, `flock /tmp/laneb-heavy.lock pnpm exec vitest run --project unit tools/stryker tools/test` in the worktree at
  bce57f16, started 17:28:07 UTC: **32 files, 392 tests passed, 0 failed**, 54.13 s (`tmp/vitest-unit.log`).
- CI: the push run on bce57f16 finished: `ci` run 41330911483 (success, 17:19:49-17:28:25Z), `unit` job 124920631257
  (17:19:52-17:25:08Z): **Test Files 404 passed (404); Tests 6893 passed | 1 skipped (6894)**, 272.21 s (job log line
  1329-1332, read 17:29 UTC). Equal to PR run 41329075340's unit job. Mutation push run 41330911489 was in progress at
  17:29Z (not read to completion).

## 3. The replay, extended (the measured saving)

Method. All 58 pull requests with base `claude/build-platform` (`gh api …/pulls?state=all&base=claude/build-platform`,
17:31 UTC): 37 merged, 13 closed unmerged (Dependabot #19-#23, #26, #28, #29, #33, #37, #38, #40), 8 open (#42, #75,
#83-#86, Dependabot #87-#89). Merged: `<merge>^1..<merge>` (the final head with the base merged in); open:
merge-base with bce57f16..head; closed unmerged: merge-base with the API's `base.sha`..head. "Current" is bce57f16's
`affected.ts` as-is (`repositoryClosures`, `globalFiles`, `unionClosures`, `unionGlobal`, `affected`, each side's tree
via `treeAt`, today's sets and shards); "P4" is a prototype of §2's tables (`tmp/scripts/replay.mts`: root,
workspace, workflow and closure/other manifests field by field, order-sensitive per field, anchors global, pin-only on
same-path SHA-to-SHA step refs except the artifact actions, mirror and owner rules; every unclassified file and the
lockfile through the unchanged rule). The prototype reproduces the design's sim2 on every pull request it lists.

Costs. Seven-shard full runs, 12 push runs (40316928522 on 3486f75c to 40646308297 on 83d71fd6, 2026-10-26 11:41 to
10-28 06:50 UTC, `gh api …/runs/<id>/jobs`, job wall time): money-ledger 4.46, packets-scan 6.95, packets-rest 13.01,
packets-explain 11.84, pricing-engine 7.30, pricing-recompute 3.93, pricing-rest 5.90 runner-minutes; **53.38 per full
run** (min 51.18, max 56.73; 56.8 if each job is rounded up to the minute); pricing 17.12, packets 31.80; `changes` 0.44,
`mutation` 0.44. The design's 33.0 came from six-shard runs (the eight push runs before #52 sum to 30.2-36.4).

| PR | State | Current | P4 | Saved (runner-min, final head, 7 shards) |
|---|---|---|---|---|
| #2, #4 | merged | full | partial (ledger) | 48.9 each |
| #3 | merged | full | none | 53.4 |
| #6 | merged | full | partial (pricing, ledger) | 31.8 |
| #25, #43 | merged | full | none | 53.4 each |
| #31 | merged | full | partial (pricing, packets) | 4.5 |
| #23, #26, #30, #35, #37, #38, #40, #44 | ≤#49 | full | full | 0 |
| #48 | merged 10-26 | full (`packageManager`, artifact-action pins, test tooling, lockfile moves vitest's tree, `watched.ts`) | full | 0 |
| #49 | merged 10-26 | full (`tools/stryker/affected.ts`) | full | 0 |
| #51 | merged | full (`stryker/shards.json`) | full | 0 |
| #52 | merged | full (`stryker/**`, `tools/stryker/**`) | full | 0 |
| #77 | merged | full (`runs-on`, `watched.ts`) | full | 0 |
| #76 | merged | partial (packets) | partial (packets) | 0 |
| #50, #53, #54, #55, #56, #74, #78, #79, #80, #81, #82 | merged | none | none | 0 |
| #84 | open (e3299ea2) | full (`stryker/**`, `tools/stryker/**`) | full | 0 |
| #87 (Dependabot anthropic-sdk) | open | full: the lockfile moves `@opentelemetry/api`, a peer in vitest's snapshot key | full | 0 |
| #89 (Dependabot minor-and-patch, aws-sdk among it) | open | partial (pricing, packets: contracts' and db's manifests, lockfile) | partial (pricing, packets: `@aws-sdk/client-textract`/`-kms` are imported) | 0 |
| #42, #75 | open | partial (pricing, packets) | same | 0 |
| #83, #85, #86, #88 | open | none | none | 0 |

Totals (`tmp/replay-summary.txt`):
- The design's set (35 PRs ≤ #49, any state): full runs **17 → 10** (the design said 16 → 9; #49's final merge adds
  `tools/stryker/affected.ts`, full both ways); the same seven run less; **294.3 runner-minutes** at final heads (the
  design's 173 at 33.0 per full run).
- Merged since #49 (#50-#56, #74, #76-#82: 15) plus #48 and #49 at their final heads (17): full 5 → 5, **none narrowed,
  0 saved**.
- Open after #49 (#75, #83-#89: 8): none narrowed.
- All 58: full 22 → 15, partial 8 → 12, none 28 → 31; **no package widened or lost** on any of them.
- Replay "current" agrees with the shards every actual final-head mutation run chose (#42 6, #48 7, #49 7, #51 7, #52 7,
  #76 3, #77 7, #84 9 of its own, #87 7, #89 6, the rest none; `tmp/final-head-runs.tsv`).
- Actual PR-run stryker minutes, every push (`tmp/pr-run-costs.tsv`): #48 201.5 (5 runs), #49 177.9 (5), #51 161.9 (4),
  #52 169.9 (4), #76 59.8 (2), #77 163.8 (3), #42 197.3 (6), #84 97.3 (1), #87 53.0, #89 43.8; none of it avoidable by
  P4.

**Plainly:** per qualifying pull request the saving is **larger** (a full run is 53.4 runner-minutes, not 33.0; the same
seven PRs now save 294, not 173), and after #84 merges (nine shards; its run 40646243545 had packets-roles 10.1 min and
packets-words cancelled at the 30-minute timeout) a full run costs more again (≥ about 93; not final, not verified). But
in the **25 pull requests since the design (17 merged, 8 open, the first three Dependabot npm PRs among them), P4 would
have saved nothing**: every full run there is driven by the mutation tooling, `runs-on`, `packageManager`, the
artifact-action pins or the lockfile, which P4 keeps. The weekly projection is untested: no Dependabot actions PR has
opened since #48, and the one npm batch (2026-10-29, #87-#89) saves 0 (#87 by vitest's peer key, #89 by real imports).
Its upper bound rises to about 156 runner-minutes a week (actions without transport 53.4 → 4.5 + 0.9; next and
browser-tests 53.4 → 0 each when the lockfile moves no closure or tooling key).

## 4. Overlaps

- **#84** (head e3299ea2, merge base with bce57f16 56ed6279 = #81; `git diff`, 17:34 UTC): `stryker/base.mjs` (packets
  `MUTATE` gains `roles.ts`, `roles-words.ts`), `stryker/shards.json` (`packets-roles`, `packets-words` before
  `packets-rest`: nine shards; `$comment` rewritten), `tools/stryker/affected.test.ts` (`:361-367`: `shardsFor(['pricing',
  'packets'])` lists eight, all `toHaveLength(9)`), `tools/stryker/shards.test.ts` (`:23` the names list, `:69` the throw
  message), `tools/stryker/equivalent/packets.json` (occurrences renumbered, entries removed), `docs/runbooks/ci.md` (two
  table rows at its `:442-443`), test-matrix CAS-43/44, synth matrix and registry CAS rows. **`RUNNER_PROOF_SHARD`
  (money-ledger) is unchanged by #84** and still holds money and ledger whole. #84 merges before P4; P4's own changes to
  `affected.test.ts` and `shards.test.ts` must not list shard names or counts (derive them from `shards.json`), or they
  conflict and go stale. #84's only mutation run, 40646243545 (06:49-07:25Z 2026-10-28), ended `cancelled`
  (packets-words at 30 min), so #84 is not mutation-green yet.
- **#42** (be63bdc2, merge base 56ed6279): touches **no P4 code file** (no `tools/stryker`, `stryker/`, `mutation.yml`,
  `vitest.mutation.config.ts`, root `package.json`, `pnpm-workspace.yaml`, `tools/package.json`, `collection.test.ts`,
  ADR 0066, `ci.md`). It shares the rule-6 documents (test-matrix, reconciliation-001, synth `matrix.ts`, `registry.ts`)
  and **`tools/test/workflows.test.ts`** (its hunks at `:1799-1815`, ci.yml's image identity steps; P4's are in the
  mutation describe `:2469-2657`), which is not on LANES' "Not while #42 is open" list (`LANES.md:84-91`). It also
  changes `apps/web/package.json`, `apps/worker/package.json`, `pnpm-lock.yaml` and `tools/screening-capacity/
  {measure,report,run}.ts`, `watched-paths.txt` (not `watched.ts`), none of which P4 edits. Replayed: pricing and packets
  both ways.
- **P2** (`co-001/ci-trivy-version`, not built; `follow-up-p2-trivy-version.md`) merges before P4. Shared files: ADR 0066
  (Part 6 / Part 7, the header's Status, Date, Deciders and PRD lines, the notice numbers), `test-matrix.md` (CI-24..26 /
  CI-27..29 and the intro sentence, P2 `:414`), synth `matrix.ts` and `registry.ts` (rows and a per-part comment line),
  `tools/test/workflows.test.ts` (P2: ci.yml `images`, release and dry-run blocks, P2 `:255-262`; P4: the mutation block),
  `tools/test/collection.test.ts` (P2 `...testsIn('tools/trivy')` beside `:43`; P4 its new files: adjacent lines),
  `docs/runbooks/ci.md` (different sections). P2 changes reconciliation-001 not at all (P2 `:288`). P2 alone changes
  root `package.json` (`scripts.trivy:pin`, P2 `:235`), `tools/package.json` (`@sigstore/verify`, `@sigstore/tuf`,
  `@sigstore/bundle`, `@sigstore/protobuf-specs`, exact, P2 `:239-242`) and `pnpm-lock.yaml`. Under P4's tables:
  `trivy:pin` is a non-lifecycle root script (inert); the `@sigstore/*` entries in `tools/package.json` are inert by the
  mirror rule, since no closure file in `tools` imports them (pricing's `tools` imports: `@tp/contracts`, `@tp/money`,
  `@tp/pricing`, `@tp/rules`, `vitest`; the global `tools` import: `yaml`); the lockfile decides by its own rule. P2's own
  PR, merged before P4, pays the whole-file rule (a full run). P4's inert list should name `trivy:pin` among the scripts
  and carry a ★ case for a `tools/package.json` dependency no closure imports (`@sigstore/verify`).
- **#82 (P1)** touched none of P4's code files. It touched the shared documents (ADR 0066 Part 5 `:1273-1681` and its
  header lines; reconciliation-001 `:659-661`; test-matrix `:257-264`, `:288-290`; `ci.md`; `matrix.ts:439-441`;
  `registry.ts:628-631`), `tools/test/workflows.test.ts` (other describes: content calendar, ci.yml, Postgres) and
  `tools/check-action-pins/workflows.ts` (`reusableWorkflowProblems` `:113-124`; `PIN` `:14` unchanged), whose rule
  refuses a job-level reusable workflow of another repository.
- **Rule 6** (`LANES.md:31-33`): "merge the latest `claude/build-platform` into the PR branch with a merge commit. Never
  rebase or force-push." The design's §11 "the pull request merged later rebases" is wrong.

## 5. The shared files at bce57f16

- **ADR 0066** (1,681 lines): Status `:3-30` (Part 5's entry `:28-30`), Date `:31`, Deciders `:32-48` (Part 5 `:35-38`),
  PRD sections `:49-61` (Part 5 `:52-53`); Part 1 `:62`, Part 2 `:282`, Part 3 `:731`, Part 4 `:1002-1272` (Decision
  `:1029`; the whole-file sentence `:1163-1164`; Revisit `:1265-1271`, O7 `:1267-1268`), Part 5 `:1273-1681` (Notices
  `:1608-1629`, N23-N31; Revisit `:1674-1681`). No Part 6 yet. Last notice N31; #86 takes N32 (`LANES.md:198`).
- **`docs/runbooks/ci.md`**: "Dependabot's pull requests and runs" `:187-196` (`:192-194`: "mutation in full (31 to 36
  runner-minutes) when it changes the root manifest, the catalog or `mutation.yml`"); "Mutation testing" `:445`; "What
  runs" `:451-472` (`:453` "all six shards", stale since #52; the whole-file sentence `:469-470`); shard table `:474-481`
  (six rows, no packets-explain); "Reading a red `mutation`" `:487`; "Recording an equivalent" `:536`; "Running it
  locally" `:583-600` (canary `:589`, narrow run `:596`, what a branch affects `:599-600`).
- **`docs/product/test-matrix.md`**: CI section `:255`; intro `:257-264` ("CI-21 to CI-23 … and complete the series"
  `:261-262`); rows CI-01..CI-23 `:268-290` (CI-17 `:284`). Last used CI-23.
- **`packages/synth/src/cases/matrix.ts`**: CI rows `:419-441` (CI-17 `:435`). **`registry.ts`**: `:604` the series
  comment; per-part comments `:615` (Part 2), `:620` (Part 4), `:624` (Part 3), `:628` (Part 5); CI-01..10 `:605-614`,
  CI-11..14 `:616-619`, CI-15..17 `:621-623`, CI-18..20 `:625-627`, CI-21..23 `:629-631`; DBF follows `:632`.
- **`docs/product/reconciliation-001.md`**: the CI series list `:141-146`; the co-founder's 2026-10-26 ruling `:653-657`;
  P1's paragraph `:659` and bullet `:661`.
- **`tools/test/collection.test.ts`** `FILES` `:28-46` (no `tools/stryker` entries).

## Changes the design needs

Each: the design text, the new text or fact, the evidence.

- **F1. Header (`:3-8`).** "Written against 6ddd587 plus both designs, and against `co-001/ci-deps` at 19e3d98e …
  Every cite is at 6ddd587" → add a re-read section (as P1's §14): re-read at bce57f16 (2026-11-01), ci-deps (#48,
  e908c214), ci-browser (#77, ecebdc90) and P1 (#82, bce57f16) merged; every cite re-mapped per §1's table; "cut from
  `claude/build-platform` then" → cut locally at bce57f16. Evidence: §1.
- **F2. §1 Goal (`:16-21`; "all six shards" `:20`).** `affected.ts:111-120` → `:121-130`; `affected.ts:618` → `:639`; "all six shards: 31-36
  runner-minutes (push runs 40223130477 and 40229005837; #40's run 40223436319)" → "every shard (seven since #52): 51-57
  runner-minutes, mean 53.4 (12 push runs, 40316928522 to 40646308297)". Evidence: §3 costs.
- **F3. Acceptance 1 (`:25-29`).** "The 35 pull requests … (#1-#49) … 16 full runs become 9 … about 173 runner-minutes"
  → "The 58 pull requests into the build branch to #89 (37 merged, 13 closed, 8 open), replayed through the changed
  rule at bce57f16's sets and shards: 22 full runs become 15; the same seven run less (#2, #3, #4, #6, #25, #31, #43),
  about 294 runner-minutes at final heads; none of the 25 since #49 runs less; no package lost or widened on any". Also
  say the 35 of the old text were 22 merged and 13 unmerged. Evidence: §3 totals.
- **F4. Every count of shards** (acceptance 4 `:40` "runs all six shards", §2 `:134` "runs all six shards", C6 `:385`
  "(all six)") → "every shard" (seven at bce57f16, nine after #84). Evidence: `stryker/shards.json`; #84's diff.
- **F5. §2 the shard's steps (`:46-50`).** `mutation.yml:81-98` → `:81-107`, and name the per-shard gate step
  (`:96-98`) before the upload (`:100-107`); "pnpm 10.34.8, the version ci-deps pins" → "pnpm 10.34.8, `packageManager`
  `package.json:5` (with `+sha512`)". Evidence: §1.
- **F6. §2 root table (`:75-88`).** "keys at 6ddd587 `:2-55`" → `package.json:2-57` (name, private, type,
  packageManager, engines, scripts, devDependencies; no `pnpm`, `devEngines`). The "every other script" row names
  `actions:check` and `toolchain:check` (#48, `:37-38`), `hooks:install`, `gitleaks:install` and P2's `trivy:pin`. The
  dependency row adds: eight root entries are `catalog:` (`:47-56`), so their versions move in the catalog; a change of
  a TEST_TOOLING entry's specifier to or from `catalog:` is global. Evidence: §1.
- **F7. §2 workspace table (`:105`).** "6ddd587 `:1-29`; ci-deps adds `:31-43` and `overrides`; ci-browser adds a
  catalog line" → "`packages` `:1-8`, `catalog` `:11-29`, `overrides` `:31-34`, `onlyBuiltDependencies` `:36-38`,
  release age and trust `:40-52` (`minimumReleaseAgeExclude: []` a flow sequence); no `catalogs`, no anchors". Evidence:
  §1.
- **F8. §2 cites into ci-deps (`:123-125`, `:135`).** `ci-deps:tools/check-action-pins/workflows.ts:14` →
  `tools/check-action-pins/workflows.ts:14`; `ci-deps:ci.yml:80-86` → `ci.yml:82-92` (P1's token and age floor on that
  step); `ci-deps:.github/dependabot.yml:84-86` → `.github/dependabot.yml:84-86` (cooldown `:82-83`). Add P1's
  `reusableWorkflowProblems` (`workflows.ts:113-124`), which already refuses a job-level reusable workflow of another
  repository, beside "P4 does not rely on that check". Evidence: §1, §4.
- **F9. §2 "Every other workspace manifest … Nothing else in it is read by a shard" (`:101-103`).** → "`workspace.ts:83-91`
  reads every workspace manifest's `name` and `exports` into `vitest.mutation.config.ts`'s aliases (`:88-123`) in every
  shard. They stay inert because `closureOf` resolves imports by the same reading (`workspace.ts:124`): any closure
  import that reaches a package makes its manifest a closure manifest at the head." Evidence: §1.
- **F10 (should fix). §3.1 classifies "every changed `package.json` of a workspace directory" and takes a classified
  file out of the global-glob test (`:156-159`, `:166`).** `tools/stryker/canary/lib/package.json` is such a manifest
  (`pnpm-workspace.yaml:8`), matched today by `tools/stryker/**` (`affected.ts:123`), and the canary's case 3 imports it
  by name in every shard (`canary/linked.test.ts:1`). As an "other workspace manifest" its `exports` or `name` edit would
  become inert: a fail-open on every shard's canary. New text: "a file another `GLOBAL_INPUTS` glob matches is never
  classified; it stays global", with a ◆ case (`tools/stryker/canary/lib/package.json` gaining `scripts.x` or changing
  `exports` affects all four). Costs no replayed run (no PR touched it). Evidence: §1.
- **F11 (should fix, a gap the soundness claim covers). Closure-manifest table (`:90-99`).** `tools/package.json`
  (`:5` `"type": "module"`) is the manifest of the global entry points' own files (`tools/stryker/*.ts`,
  `tools/content-files.ts`, `tools/screening-capacity/watched.ts`), which tsx loads as ESM by it, yet today it counts for
  pricing only (its owners). New row: "a manifest whose directory holds a global input (`tools`): `type`, `imports`,
  lifecycle scripts and every unlisted key are global; `exports` and `name` stay its owners'; other scripts inert;
  dependency entries by the mirror rule (`yaml` is a global import keyed by `tools`)". No replayed PR changes class (#31's
  `tools/package.json` edit is `exports` and a script). Evidence: §1 (global closure, closures).
- **F12. §3.1 cites.** `Change` `:553-558` → `:574-579`; `changeSince` `:699-712` → `:720-733`; `affected()` `:603-639` →
  `:624-660`; `:613` → `:634`; `:618` → `:639`; `Closure.imports` `:378-391` → `:377` (field), `importsOf` `:395-408`;
  `closureOf`'s manifests `:403-415` → `:420-432`; `TEST_TOOLING` `:108` → `:118`; the lockfile rule `:623-637` →
  `:644-658`; header `:38-39` holds. Evidence: §1.
- **F13. §3.2, §3.3, §4 cites.** `shards.ts:41`, `mutation.yml:92`, `verdict.ts:57-66`, `gate.ts:352-361` hold;
  `ci.md:325, 332` → `:589, :596`; "which `workflows.test.ts` already holds equal to `mutation.yml`'s" → cite
  `workflows.test.ts:2618-2625`; §4 `mutation.yml` header `:10-13` → `:10-15` (and the Node line `:17-18`);
  `workflows.test.ts:1364` → `:2537`; `collection.test.ts` `FILES` `:28-46`. Evidence: §1.
- **F14 (should fix). §5 guard allowlists (`:267-272`).** As written they fail on the base: `node:child_process` is
  imported by `affected.ts` (`:1`, `git` at `:688`, `:706`, `:721`, `:740`) besides `shards.ts`; the literals
  `package.json`/`pnpm-workspace.yaml` also occur in `tools/screening-capacity/watched.ts` (`:70-86`, its watched-path
  list) and `vitest.mutation.config.ts` (`:82-85`, comments; it reads manifests only through `workspace.ts`). New text:
  "`child_process` only in `affected.ts` (spawning `git` only), `shards.ts` and `stryker.ts` (`process.execPath` with the
  Stryker bin); the three names only in `affected.ts`, `workspace.ts`, `stryker.ts`, `watched.ts` and
  `vitest.mutation.config.ts`, each listed with its reason" (or match reads of those names, not any literal). Evidence:
  §1 guard scan.
- **F15. §5 test cites and #84.** `affected.test.ts:242` holds; `:334-338` → `:345-349`. Add: no P4 test lists shard
  names or counts (derive from `shards.json`), since #84, merging first, rewrites `affected.test.ts:361-367` and
  `shards.test.ts:23, :69` to nine shards. Evidence: §4.
- **F16. §6 ADR 0066.** Part 4 `:413` → `:1163-1164`. Part 7 also adds the header entries Part 5 added: Status (`:3-30`),
  Date (`:31`), Deciders (`:32-48`), PRD sections (`:49-61`); its notices take the next numbers after #86's N32 and P2's
  Part 6 (N31 at `:1629` is the last at bce57f16). Evidence: §5.
- **F17. §6 `docs/runbooks/ci.md`.** `:205-206` → `:469-470`; `:325` → `:589`. Add three edits in sections P4 already
  touches: the Dependabot paragraph `:192-194` ("mutation in full (31 to 36 runner-minutes) when it changes the root
  manifest, the catalog or `mutation.yml`") restated for Part 7's field rule and today's cost (about 51 to 57); "What
  runs" `:453` "all six shards" → "every shard"; the shard table `:474-481` has no packets-explain row since #52 (#84 adds
  two rows and leaves both): whichever of #84 and P4 merges second keeps both (rule 6). Evidence: §5; #84's diff.
- **F18. §6 `mutation.yml:10-13`.** → `:10-15` (what runs) and `:17-18` (the Node line). Evidence: §1.
- **F19. §6 reconciliation-001 (`:295-297`).** "the CI series list (`:143-146`): one line after item 4, as P1 does
  (`p1-design.md:258`)" → P1 placed its record under the co-founder's ruling of 2026-10-26: the paragraph `:659` and the
  bullet `:661`; item 4 (`:146`) is unchanged. P4 adds "- **P4, …**" after `:661` (P2 adds nothing, P2 `:288`). Evidence:
  §5.
- **F20. §7.** Test-matrix intro `:211-212` → `:257-264`, and its "and complete the series" (`:261-262`) changes once
  CI-24 to CI-29 join. `matrix.ts`: CI-17's form is at `:435`; the CI block ends with CI-23 `:441` (P2's CI-24..26
  follow). `registry.ts`: "after `CI-17` (`:465`)" → after P2's CI-26, under its own comment in the per-part form of
  `:628` (e.g. "// The mutation trigger, field by field (docs/adr/0066, Part 7)."); CI-17 is `:623`. Evidence: §5.
- **F21. §8-§9 prototype path.** `scratchpad/p4/sim2.ts`, `sim2.out`, `sim.ts`, `sim.out` are not on this machine
  (`find / -name sim2.ts`, 17:41 UTC): name a prototype that exists and is archived with the design (this scout's
  `tmp/scripts/replay.mts` reproduces sim2's results). Evidence: §3.
- **F22. §9 Measured.** Shard times → the 12 seven-shard push runs (money-ledger 4.46, packets-scan 6.95, packets-rest
  13.01, packets-explain 11.84, pricing-engine 7.30, pricing-recompute 3.93, pricing-rest 5.90; 53.38; pricing 17.12,
  packets 31.80). Table savings → #2, #4 48.9 each; #3 53.4; #6 31.8; #25, #43 53.4 each; #31 4.5; total 294.3. Add the
  extension rows and the sentence "no pull request since #49 runs less". "Projected per week … eight npm groups" → seven
  version-update groups and `security` (`dependabot.yml:32-33`, `:49-72`); actions without transport 53.4 → 4.5 (plus
  0.9), about 49 saved; next, browser-tests 53.4 → 0 each; upper bound about 156 a week (was 95); and state the first
  real batch: 2026-10-29 #87, #88, #89 saved 0 (#87 full by the lockfile: `@opentelemetry/api` re-keys vitest's
  snapshot; #89 pricing and packets by real imports; #88 none); no actions PR yet. "aws-sdk: pricing and packets by the
  lockfile, either way" is confirmed by #89. Evidence: §3.
- **F23. §10 C6 (`:381-385`).** "money-ledger plus packets' two shards (three artifacts, about 16.6 minutes)" → packets
  has three shards (five after #84): money-ledger plus packets is four artifacts and about 36.3 minutes (more after
  #84). Evidence: §3 costs, §4.
- **F24. §11 Interplay.** "the pull request merged later rebases and re-runs `pnpm test`" → "merges the latest
  `claude/build-platform` in with a merge commit and re-runs `pnpm test` (LANES rule 6, `LANES.md:31-33`; never a
  rebase)". "ci-deps and ci-browser merge first" → merged (#48 e908c214, #77 ecebdc90). "At the cut, re-read
  `stryker/shards.json`" → read: seven shards, money-ledger holds money and ledger whole, and #84 leaves it so. "P4
  touches no other #42 file" → #42 also edits `tools/test/workflows.test.ts` (`:1799-1815`, not P4's describe; not on
  the "Not while #42" list), kept by rule 6. Add #84 (above, F15) and P2's `trivy:pin` and `@sigstore/*` (inert under
  P4; P2's own PR pays a full run). "A P1 or P2 pull request that bumps a step SHA in `mutation.yml` is itself
  pin-only" → P1 merged without touching `mutation.yml`. Evidence: §4.

## Notes (outside P4's scope, proposals)

- **packets-rest about doubled after #52** (6.1, the design's three-run mean, or 7.9 over all eight six-shard push runs →
  13.01 over the 12 seven-shard push runs), against
  `stryker/shards.json:2`'s "so packets-rest keeps its time". A rebalance is ci-mutation's open item O7
  (ADR 0066 `:1267-1268`) or #84's.
- **#84's packets-words hit the 30-minute shard timeout** (run 40646243545), so #84 needs a further split or speed-up
  before it merges; every full run after it costs at least about 93 runner-minutes (not verified).
- **The lockfile rule re-keys vitest on any peer move**: #87 (an SDK bump in a non-money package) runs all four
  because `@opentelemetry/api` sits in vitest's snapshot key. A narrower comparison is possible but touches the
  lockfile rule; proposal only.
- **`tools/tsconfig.json`** (a pricing closure manifest) is also what tsx reads for the global entry points, the same gap
  as F11 for tsconfigs, which P4 leaves whole-file; propose making it global.
- **The status file's wording** (`lane-b-ci-deps-status.md:251`, "a replay of 35 merged PRs") → 35 PRs, 22 of them
  merged.
