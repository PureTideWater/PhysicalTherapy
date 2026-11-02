# P4 re-read: scout of versions, upstream facts and runs (2026-11-01)

Base `claude/build-platform` bce57f16 (#82, P1, merged 2026-11-01T17:19:46Z), read in `/home/user/ci-mutation-trigger`
(clean, at bce57f16) between 17:23Z and 17:40Z. Design: `follow-up-p4-mutation-trigger.md` (2026-10-26, written at
6ddd587). Raw evidence: `/home/user/laneb-sp/p4reread/raw-pins/` (`runs/`: run and job JSON, `jobs.tsv`, job logs;
`npm/`: `npm view <pkg> time --json`, Node index and changelog). Progress: `progress/scout-pins.progress.md`. Scratch
clones (github/docs, nodejs/node tags, pnpm/action-setup, PR refs) were made under `tmp/` and removed. No tracked file
changed in any worktree.

## 1. Runtime canary and gate (§3.3): versions as locked, and what is newer

**As locked at bce57f16**

| Package | Locked | Where |
|---|---|---|
| `@stryker-mutator/{api,core,instrumenter,util,vitest-runner}` | 10.1.1 | `pnpm-lock.yaml:2233-2253` (packages), `:5323-5380` (snapshots); root specifiers `^10.1.1` at `:76-84`, `package.json:44-46` |
| vitest-runner's peer | `@stryker-mutator/core: 10.1.1` exact | `pnpm-lock.yaml:2249-2253` |
| `vitest`, `@vitest/coverage-v8` | 5.0.5 | `pnpm-lock.yaml:3825`, `:2451`; catalog `^5.0.5` (`pnpm-workspace.yaml`) |
| `tsx`, `fast-check`, `vite`, `esbuild` | 4.23.15, 4.10.2, 8.3.4, 0.28.2 | `pnpm-lock.yaml:3718`, `:2859`, `:3782`, `:2787` |
| pnpm | 10.34.8 (+sha512) | `package.json:5` |
| Node in all three mutation jobs | 24.22.0 | `mutation.yml:56, :87, :177`; `tools/stryker/unicode.json:4-6` (Node 24.22.0, Unicode 17.0, ICU 78.3); held equal by `tools/test/workflows.test.ts:2618-2625` |

Installed `@stryker-mutator/core` 10.1.1: `exports` = `{".", "./package.json"}`, `bin.stryker` = `./bin/stryker.js`,
`engines.node >=22`. From the root, `createRequire(...).resolve('@stryker-mutator/core/package.json')` resolves and
the bin by specifier fails `ERR_PACKAGE_PATH_NOT_EXPORTED` (node, 17:25Z). §3.2's mechanism holds unchanged.

**Newer releases** (registry.npmjs.org, `npm view <pkg> time --json` and `dist-tags`, 17:24:39Z-17:25:11Z; the floor
is 4,320 minutes, so "aged" means published before 2026-10-29T17:24Z):
- Stryker: none. `latest` is 10.1.1 for all five packages (published 2026-10-23T19:17Z-19:18Z, 9.0 days).
- vitest and `@vitest/coverage-v8`: none stable. `latest` 5.0.5 (2026-10-15); only `5.1.0-beta.1` (2026-10-19, a
  prerelease, outside `^5.0.5`).
- tsx 4.23.15, fast-check 4.10.2, esbuild 0.28.2: each is `latest`.
- vite 8.3.5 (2026-10-21T06:38Z, 11.4 days, aged). Transitive only (through vitest; no workspace manifest names
  `vite`), so a Dependabot version update does not move it; a lockfile move of it is `TEST_TOOLING`'s snapshot and
  global under today's rule and P4 alike.
- pnpm 10.34.9 (2026-10-25T17:54Z, 7.0 days, `latest-10`); `latest-11` 11.28.9, `latest` 12.16.1. A
  `packageManager` move is global under P4 (§2), so nothing changes.
- Node: 24.22.1 (nodejs.org index date 2026-10-20; a security release: seven CVEs, OpenSSL 3.5.9, undici 7.30.1, tz
  2026e, changelog at the v24.22.2 tag) and 24.22.2 (2026-10-27, V8 backports and one stream fix). Both are aged. Their
  ICU and Unicode are those of 24.22.0: `deps/icu-small/source/common/unicode/uvernum.h` gives ICU 78.3 and Unicode
  17.0, and `tools/icu/current_ver.dep` names icu4c 78.3, at v24.22.0 (f14cd3aa), v24.22.1 (ce7aaf1c) and v24.22.2
  (f7f273a9) (blobless tag fetch from github.com/nodejs/node, 17:25:46Z). Node 26.13.0 became LTS ("Lithium") on
  2026-10-28.

**Measured runtime.** `pnpm -s exec node` in the worktree prints `npm_config_user_agent` = `pnpm/10.34.8 npm/? node/v24.22.0
linux x64`, `PNPM_PACKAGE_NAME=therapy-platform` and no `npm_lifecycle_event` (17:26:04Z). That is exactly the string
§5's `verdict.test.ts` case uses. On CI, run 40646308297's money-ledger job (122675954379) logged `canary: on Node
v24.22.0 (Unicode 17.0, ICU 78.3)` and setup-node "Acquiring 24.22.0 - x64 from
.../actions/node-versions/releases/download/24.22.0-38668177966/...".

**New fact for §3.3: the pnpm leg is not near-tautological for a pin change.** The same log has action-setup's
"Running self-installer...", then `Switching pnpm from v11.25.0 to v10.34.8...`, then the install's "Done in 3.6s using
pnpm v10.34.8". pnpm/action-setup v6.1.0 (ea17c68d, fetched at depth 1) installs a bootstrap pnpm, 11.25.0, from its
committed lock (`src/install-pnpm/bootstrap/pnpm-lock.json:12`). It reads the target from `packageManager`
(`src/install-pnpm/run.ts:38`, `readTargetVersion` `:130`) and runs `<bootstrap> self-update <target>` (`:108-114`). So
the switch to `packageManager`'s pnpm is the action's code and its bootstrap pnpm, and both move with an
`pnpm/action-setup` pin. pnpm 10's `manage-package-manager-versions` is a second guard behind it, not the mechanism.
The pnpm leg therefore checks something a step pin can break.

**What P4 must hold differently: nothing.** No Stryker, vitest or tsx release would change the canary, the gate, or
§3.2's resolution, and every runtime leg still reads the same values. A Node move (24.22.0 to 24.22.2) is a `with:`
edit in `mutation.yml`, which P4 treats as global, and `workflows.test.ts:2618-2625` already forces `unicode.json` to
move with it. Outside P4 (see §5), mutation's exact Node misses the 24.22.1 security release, and the move would not
change the Unicode data.

## 2. Mutation run durations now

`gh api .../actions/workflows/mutation.yml/runs?branch=claude/build-platform&event=push` (17:26:38Z; total 21). The
last ten: 41330911489 (bce57f16, finished 17:35:17Z), 40646308297 (83d71fd6, #78), 40639109797 (#81), 40624946474
(#74), 40615991421 (#79), 40607540781 (#80), 40593100114 (ecebdc90, #77), 40567044164 (085299bd), 40401493941
(e908c214, #48) and 40339580137 (#49). All ten succeeded, and each ran nine jobs: `changes`, the gate and **seven**
shards.

**Seven shards, not six.** `packets-explain` (the calculation words, `packages/packets/src/explain*`) was added by
7fce82ed (2026-10-26T04:34Z, #52). See `stryker/shards.json` at bce57f16: money-ledger, packets-scan, packets-rest,
packets-explain, pricing-engine, pricing-recompute, pricing-rest. money-ledger still holds money and ledger whole, and
no other shard holds either.

Durations, in minutes from each job's `started_at` to `completed_at` (`raw-pins/runs/jobs.tsv`), over the ten runs:

| Job | Mean | Median | Min | Max | Design (§9, three 6ddd587-era runs) |
|---|---|---|---|---|---|
| money-ledger | 4.54 | 4.83 | 3.13 | 5.10 | 4.0 |
| packets-scan | 7.17 | 7.54 | 5.00 | 8.53 | 6.4 |
| packets-rest | 13.15 | 14.21 | 8.80 | 15.35 | 6.1 |
| packets-explain | 11.73 | 12.56 | 7.55 | 13.47 | (none) |
| pricing-engine | 7.48 | 7.87 | 4.78 | 10.18 | 7.2 |
| pricing-recompute | 4.08 | 4.31 | 3.08 | 4.60 | 4.0 |
| pricing-rest | 5.73 | 5.81 | 3.97 | 7.13 | 5.2 |
| **shards** | **53.88** | | | | 33.0 |
| changes / gate | 0.45 / 0.44 | | | | |

- Per package: money and ledger 4.54; pricing 17.29 (3 shards); packets 32.05 (3 shards).
- A full run costs 54.8 runner-minutes on average, all jobs included. Per run it was 52.0 to 57.8, or 56 to 64 with each
  job rounded up to the minute, and 13.5 to 19.5 minutes of wall time (mean 15.9). The repository is public
  (`gh api repos/...`: `visibility: public`) and `/actions/runs/40646308297/timing` gives `billable.UBUNTU.total_ms: 0`. So
  runner-minutes measure job-slot time, not money.
- Runner: from 40593100114 (ci-browser) on, `ubuntu-26.04`, image 20261012.163.1 or 20261025.179.1, provisioner
  20261021.618, runner 2.338.0. Earlier runs used `ubuntu-24.04` 20261012.334.1 (job logs 122675954379, 122652986211,
  122502077825 and 122411254697). On 26.04 alone (six runs) the shards sum to 52.91, so the image is not the cause.
  packets-rest doubled after #52 (6.1 to 13.2).
- **Coming with #84**, which merges before P4 (open; head e3299ea2): its `stryker/shards.json` has **nine** shards and
  adds `packets-roles` and `packets-words`. money-ledger is still money and ledger whole, so the `RUNNER_PROOF_SHARD`
  test holds. Its run 40646243545 (2026-10-28) took 10.07 min for packets-roles. packets-words was **cancelled at
  30.30 min** (`mutation.yml:73` `timeout-minutes: 30`), and the gate failed. A full run after #84 is therefore at least
  about 94 runner-minutes, but that figure is not verified: #84 must first fit packets-words under the timeout.

**§9 re-priced at today's seven shards** (the design's narrowed sets, which the files scout re-checks, with today's
means):

| PR | Narrowed | Saved (runner-min) | Design |
|---|---|---|---|
| #2, #4 | ledger (money-ledger) | 49.34 each | 29.0 each |
| #3 | none | 53.88 | 33.0 |
| #6 | pricing, ledger | 32.05 (packets) | 12.5 |
| #25, #43 | none | 53.88 each | 33.0 each |
| #31 | pricing, packets | 4.54 | 4.0 |
| **Total** | | **296.9** | 173 |

Weekly projection at today's means: `actions` without transport, 53.9 down to 4.5 (49.3 saved); `next`, 53.9 down to 0; `browser-tests`,
53.9 down to 0; a release-age or trust exclude alone, 53.9 down to 0; a catalog `zod` line, 53.9 down to 49.3 (4.5 saved). The total is up to about
157 runner-minutes in a week when the three groups open (the design says about 95). Each figure is conditional on the lockfile move
reaching no closure and no `TEST_TOOLING` snapshot (§3, #87). C6's alternative for transport (money-ledger plus
packets' shards) is now four artifacts and about 36.6 min, not three and 16.6.

## 3. Dependabot: open pull requests, config, and acceptance 2 and 3

**Config at bce57f16** (`.github/dependabot.yml`, unchanged since 871d4e59, 2026-10-26T01:12Z):
- npm runs on Thursday at 04:31 UTC (`:25-31`), with a 3-day cooldown (`:34-35`) and `open-pull-requests-limit: 8` (`:33`). It has
  seven version-update groups, `browser-tests`, `anthropic-sdk`, `pg-boss`, `next`, `aws-sdk`, `aws-cdk` and
  `minor-and-patch`, plus `security` (`:49-72`).
- github-actions runs on Tuesday at 04:37 UTC, with a 7-day cooldown, one group `actions` with `patterns: ["*"]` (`:74-86`, so the design's
  `ci-deps:...:84-86` cite now reads on the base) and `open-pull-requests-limit: 2`.
- docker and docker-compose share the multi-ecosystem group `container-images`, Wednesday 04:43 UTC, 7-day cooldown
  (`:15-22`, `:88-108`).

**Open pull requests** (`gh api pulls?state=open`, 17:28:21Z). Dependabot has three open, all made by the Thursday
2026-10-29 run and all on base 83d71fd6. No actions or images pull request is open. The lane pull requests #86, #85,
#84, #83, #75 and #42 are drafts.

| PR | Change | Today (its mutation run, changes-job reasons) | Under P4 |
|---|---|---|---|
| #87 anthropic-sdk, `@anthropic-ai/sdk` 0.131.0 to 1.3.0 (head 20c180a0) | `packages/model-gateway/package.json`, lockfile +44 −43 | Run 40818722504 ran **all seven shards**. The lockfile moves `@opentelemetry/api` 1.9.1 to 1.10.0, which re-keys vitest's snapshot `5.0.5(@opentelemetry/api@…)` in every importer and drizzle-orm's (job 123265876441) | Unchanged: the lockfile rule (`TEST_TOOLING`'s snapshot) gives all four, correctly. P4 narrows nothing |
| #88 aws-cdk (f69063f0) | `infra/package.json`, lockfile | Run 40818798127: none | Unchanged: none |
| #89 minor-and-patch, 10 updates (83f04cbd) | seven workspace manifests (incl. closure manifests `packages/contracts`, `packages/db`), lockfile +238 −238 | Run 40819336871: pricing and packets, **six shards**. Reasons: both closure manifests, and the lockfile moves `@aws-sdk/client-kms`, `-textract` and 29 more (job 123267856346) | Unchanged: the manifest reasons drop under the mirror and owner rules, but the lockfile rule still names pricing and packets. This matches §9's "aws-sdk: … by the lockfile, either way" |

So P4 narrows none of the three. #87 shows that a group the projection would count as "→ 0" (a non-closure package)
can run every shard through a shared optional peer that vitest resolves, and that is correct. #89 carries nine
`@aws-sdk/*` minors in `minor-and-patch`, although `aws-sdk` (`:62-64`) comes first and the docs say "it's included in
the first group that it matches" (github/docs `dependabot-options-reference.md:326`). The cause is not verified, and
the result for mutation is the same either way.

**Acceptance 2** (a Dependabot actions pull request that only moves step SHAs runs money-ledger) has no candidate
today. The last actions pull request was #40, closed unmerged on 2026-10-26T21:10Z. Its `mutation.yml` diff is 11 step
`uses:` lines, SHA plus same-line comment, and it moves both artifact actions (upload v4.6.2 to v7.0.2, download v4.3.0 to
v8.0.2). That is global under P4, as §9 says. All five actions `mutation.yml` pins are at their latest tag
(`git ls-remote --tags`, 17:29:38Z): checkout v7.0.1 3d3c42e5, action-setup v6.1.0 (peeled ea17c68d), setup-node
v7.1.0 949feb24, upload-artifact v7.0.2 cf430e03, download-artifact v8.0.2 9000827c (`mutation.yml:49, :53-54, :81,
:84-85, :100, :168, :172, :174, :181`). With the 7-day cooldown, no actions pull request can touch `mutation.yml` on
Tuesday 2026-11-03. The acceptance's shape matches Dependabot's documented behaviour: it rewrites `owner/repo@<commit>`
and "the version documentation … when the comment is on the same line", and it ignores `./` and `docker://` refs
(`data/reusables/actions/dependabot-version-updates-actions-caveats.md:1-4`). The `money-ledger` holding money and
ledger whole is true at bce57f16 and at #84's head.

**Acceptance 3** (the globals): no open Dependabot pull request touches the root `package.json`,
`pnpm-workspace.yaml` or `mutation.yml`, so none exercises it. #87 confirms the adjacent invariant: a lockfile move of
the test tooling's snapshot stays all four, by the lockfile rule, with no P4 field involved.

**Recent lane pull requests**, extended past the design's #1-#49 replay. These are the final-head mutation runs of #50
to #86 into the build branch, 18 with a run (`raw-pins/runs/recent/`). The full runs were #51, #52 and #84 (the
`stryker/**` and `tools/stryker/**` tooling) and #77 (`mutation.yml` `runs-on` and `tools/screening-capacity/watched.ts`).
All four stay global under P4. #77's `pnpm-workspace.yaml` and `tools/package.json` reasons would narrow, but the other
two keep it full. P4 would narrow none of the 18. So the saving since #49 is nil, and §9 rests on #2-#43.

## 4. GitHub Actions behaviour P4 relies on

github/docs, a blobless sparse clone at 33b1f4a6 (committed 2026-10-31T07:47:08Z, cloned 17:30:34Z, removed after).

- **Merge ref and SHA.** For `pull_request`, `GITHUB_SHA` is the "Last merge commit on the `GITHUB_REF` branch" and
  `GITHUB_REF` is `refs/pull/N/merge` (`content/actions/reference/workflows-and-actions/events-that-trigger-workflows.md:462`,
  `:473`). `actions/checkout` checks out the merge branch, so the run tests the merged result (`:475-481`). Workflows
  do not run while the pull request has a merge conflict (`:466`). The default types are `opened`, `synchronize` and
  `reopened` (`:465`), so a moving base does not re-run a pull request.
- **`github.event.pull_request.base.sha` is the fork point, not the tip the merge used.** The docs do not define it. I
  measured it in three runs and with the API:

  | Run (PR, time) | Merge commit (checkout log) | Payload `BASE` |
  |---|---|---|
  | 41331792024 (#85, 2026-11-01T17:30:17Z) | 81737f1c "Merge 90ec40ab into bce57f16" (parents bce57f1, 90ec40a) | 83d71fd6 |
  | 40651775778 (#42, 2026-10-28T07:42Z) | b52d83de "into 83d71fd6" | 56ed6279 |
  | 41329075505 (#82, 2026-11-01T16:58Z) | b148dc0e "into 83d71fd6" | 83d71fd6 |

  The REST `base.sha` at 17:31Z (#85 83d71fd6, #84 56ed6279, #42 56ed6279, #75 a6e754fc, #86 83d71fd6) equals `git merge-base
  <head> <tip>` for each (blobless fetch of `refs/pull/*`). `affected.ts` takes `merge-base(BASE, HEAD)` = BASE, so the
  changes job diffs **fork point → merge commit**. That is the pull request's own change *plus every base commit since
  it forked* (`mutation.yml:62-64`; the log line "diffed from 83d71fd6 … (the merge base of 83d71fd6 and HEAD)").
  Consequences for P4:
  - It stays sound. "Both sides of the change" are the fork point's text and the merge commit's. At the field level
    that is a superset of what merging changes. A clean three-way merge cannot set a field the base changed back to its
    fork-point value (the pull request would have to change it too, which conflicts, and then no run happens, `:466`).
  - It over-charges lagging pull requests. A base change of a global field since the fork makes a lagging pull request
    global. P4 shrinks that for inert fields, a saving the head-vs-merge-base replay of §9 does not count.
  - Acceptance 4's comparison base has to be the push run of the merge commit's first parent, which the checkout log
    prints as "Merge <head> into <tip>". It is not the event's `base.sha`, and not "the base's last push run" if the
    base moved after P4's run.
- **Paths filters**, which P4 rightly does not use (`mutation.yml:19-27` has none). For pull requests they use three-dot diffs. Past 3,000 changed files the
  workflow does **not** run if its match is not in the first 3,000 (`data/reusables/actions/workflows/triggering-a-workflow-paths5.md:3-12`),
  so they fail open. A workflow skipped by a filter leaves its checks "Pending" and blocks a required check
  (`content/actions/how-tos/manage-workflow-runs/skip-workflow-runs.md:21`). That supports §10's choice of an in-job
  classifier, and the required `mutation` gate, `mutation.yml:112-191`.
- **`uses:` forms** (`workflow-syntax.md`): step refs are `{owner}/{repo}@{ref}` and `{owner}/{repo}/{path}@{ref}` (`:680`, `:709`,
  `:727`). There is **a new `$/path` self-reference** (`:741-749`, `:755`), which takes no `@ref` and runs the
  workflow's own repository at the running commit. `./` is resolved against the workspace (`:774`), `docker://` is at
  `:780-821`, and job-level `jobs.<id>.uses` at `:1550`. ci-deps' `PIN` and `workflows.test.ts:2627-2630` (every step
  `uses` must parse as a SHA pin) already refuse `$/`, so it is global under P4's rule, but §2's list should name it.
- **New: workflow dependency lockfiles.** These live at `.github/workflows/actions.lock`, in public preview and enabled on
  github.com (`data/features/actions-workflow-lockfiles.yml`: `fpt: '*'`, `ghec: '*'`;
  `content/actions/concepts/security/workflow-dependency-lockfiles.md:18, :26, :30-31, :34`). Once a workflow is
  onboarded, "the locked commit is what runs", transitive action dependencies included, and Dependabot "regenerates
  the matching lockfile entry in the same pull request" (`content/actions/how-tos/secure-your-work/lock-workflow-dependencies.md:107-109`).
  The repository has none (`ls .github/workflows` at bce57f16). Neither today's `GLOBAL_INPUTS`
  (`tools/stryker/affected.ts:121-130`) nor P4 lists it. With full-SHA step pins and no composite action in
  `mutation.yml` it cannot change what runs today. A composite action's transitive pins could, and an onboarded
  `mutation.yml` would put every Dependabot actions pull request on two files.

## 5. Notes and proposals outside P4's scope

- **Mutation's Node.** `mutation.yml` pins 24.22.0, which lacks the 24.22.1 security fixes. 24.22.1 and 24.22.2 carry
  the same ICU 78.3 and Unicode 17.0 (§1), so moving the pin (three `with:` lines and `unicode.json`'s `checkedOn.node`)
  needs only the recorded re-check. The other workflows' floating `24` already get 24.22.2. This is a proposal for a CI
  follow-up, not P4.
- **Diff from the merge's first parent.** For a `pull_request` run, `affected.ts` could take `HEAD^1`, the tip GitHub
  merged into, as the base. That diff is exactly what the merge changes. It would end the lagging-PR over-charge (§4)
  and make acceptance 4's comparison base the same commit. It changes the rule for every file, not only manifests, so it
  is a ci-mutation follow-up. It needs a fallback when HEAD is not a two-parent merge.
- **#84's packets-words** exceeded the shard timeout (30.30 min, cancelled). It merges before P4, so every later full
  run (P4's own included) needs that fixed first. This is #84's business, recorded here because it sets P4's cost
  figures at the cut.
- **#89's grouping** contradicts the documented first-match rule (§3). Not verified. It is a dependency-policy note for
  Lane B's Dependabot owner.
- pnpm 10.34.9 exists, 7 days old. Moving `packageManager` is global under P4, and it is not this item's.

## Changes the design needs

1. **Header and §1 (`:19-21`)**: "each runs all six shards: 31-36 runner-minutes (push runs 40223130477 and
   40229005837; #40's run 40223436319)". New text: "each runs all seven shards (`stryker/shards.json` at bce57f16;
   nine after #84): 52-58 runner-minutes, mean 54.8 (the last ten push runs, 40339580137 to 41330911489)". Evidence:
   §2 above; `raw-pins/runs/jobs.tsv`.
2. **§1 acceptance 1 (`:25-29`) and §9 closing (`:341-344`)**: "about 173 runner-minutes". New text: "about 297 runner-minutes
   at today's seven shards (#2, #4 49.3 each; #3, #25, #43 53.9 each; #6 32.1; #31 4.5), more after #84's nine".
   Evidence: §2's table. The 16-to-9 count stands, since the files scout re-checks the sets.
3. **§1 acceptance 4 (`:40-42`)**: "it runs all six shards … equal those of the base's last push run". New text: "it
   runs every shard (seven at bce57f16, nine once #84 merges) … equal those of the push run of the commit P4's run was
   merged into: the first parent of its merge commit, which the checkout log prints as 'Merge <head> into <tip>', not
   `pull_request.base.sha`, which is the fork point". Also §8 (`:318`). Evidence: §4, runs 41331792024, 40651775778 and
   41329075505.
4. **§1 (`:21`) "on both sides of the change", and §9's Method (`:321-322`)**: add a sentence. "On CI the two sides are the
   pull request's fork point (`github.event.pull_request.base.sha`, measured as `git merge-base <head> <tip>`) and the
   merge commit `refs/pull/N/merge`. Every base commit since the fork counts as the pull request's. The classifier
   stays sound (at the field level a superset of what merging changes), and the replay's head-vs-merge-base diff is
   GitHub's three-dot diff, so CI runs at least what §9 counts." Evidence: §4;
   `events-that-trigger-workflows.md:462, :473-481`; `triggering-a-workflow-paths5.md:3-4`.
5. **§2 (`:46-47`) "pnpm/action-setup, which installs the pnpm that `packageManager` names"**: new text. "pnpm/action-setup,
   which installs its bootstrap pnpm (11.25.0 at v6.1.0) and runs `self-update` to `packageManager`'s version (the CI
   log: 'Switching pnpm from v11.25.0 to v10.34.8')". Evidence: action-setup ea17c68d
   `src/install-pnpm/bootstrap/pnpm-lock.json:12`, `src/install-pnpm/run.ts:38, :108-114`; job 122675954379's log.
6. **§3.3 (`:199-202`) "The pnpm leg is close to tautological on its own …"**: replace with: "The pnpm leg checks what a
   `pnpm/action-setup` pin controls: that action installs a bootstrap pnpm and self-updates it to `packageManager`'s, so
   a pin bump moves both the bootstrap and the switch. pnpm 10's `manage-package-manager-versions` (`pnpm.cjs:18940`,
   `:214066`) is a second guard behind it." Also §13's N7 row (`:458`). Evidence: as 5.
7. **§2 (`:121-123`) and §5 (◆ global `uses:` cases)**: the global ref forms gain `$/path` (the self-repository reference,
   no `@ref`, `workflow-syntax.md:741-749`). Add one ◆ case: `uses: $/.github/actions/x` gives all four. Evidence: §4.
   It costs nothing, since `PIN` and `workflows.test.ts:2627-2630` already refuse it.
8. **§2 "Added to `GLOBAL_INPUTS`" (`:137-140`), §3.1 (`:171`), §5 (`:256`) and C11**: add `.github/workflows/actions.lock`, GitHub's
   workflow dependency lockfile. It is in public preview on github.com, and in it "the locked commit is what runs",
   including transitive actions. No such file exists, so nothing runs more. Add a ◆ case. Part 7's revisit list (§6,
   `:286`) gains: "the repository adopts `actions.lock`: every Dependabot actions pull request then also changes it,
   and pin-only must then read its `commit` entries for `mutation.yml` the way §2 reads step SHAs". Evidence:
   `workflow-dependency-lockfiles.md:18, :26, :30-31, :34`; `lock-workflow-dependencies.md:107-109`;
   `data/features/actions-workflow-lockfiles.yml`.
9. **§2 (`:134-135`) "Dependabot's weekly `actions` group (`ci-deps:.github/dependabot.yml:84-86`)"**: the cite becomes
   `.github/dependabot.yml:84-86` at bce57f16. Add: "on Tuesdays at 04:37 UTC with a 7-day cooldown (`:74-83`). At
   bce57f16 all five actions `mutation.yml` pins are at their latest tag, so no actions pull request touches it yet."
   Evidence: §3; `git ls-remote` at 17:29:38Z.
10. **§9 shard times (`:325-327`)**: "money-ledger 4.0 … 33.0 in all (pricing 16.4, packets 12.5)". New text:
    "money-ledger 4.54, packets-scan 7.17, packets-rest 13.15, packets-explain 11.73, pricing-engine 7.48,
    pricing-recompute 4.08, pricing-rest 5.73; 53.88 in all (pricing 17.29, packets 32.05). These are the means of the
    ten push runs 40339580137 to 41330911489, `ubuntu-26.04` since 40593100114. Re-measured at the cut once #84 adds
    packets-roles and packets-words (its run 40646243545: 10.07 min, and words cancelled at the 30-minute timeout)."
    Update the table's saved column (`:331-337`) as in §2 above.
11. **§9 weekly projection (`:346-360`)**: "dependabot.yml at 19e3d98e: eight npm groups" becomes "at bce57f16: seven
    version-update groups and `security` (`:49-72`)". The figures become: 53.9 → 4.5 (49.3 saved), 53.9 → 0, 53.9 → 0, 53.9 → 49.3,
    "up to about 157 runner-minutes". Add the condition, with #87 as evidence: "each '→ 0' holds only while the
    lockfile move reaches no closure and no `TEST_TOOLING` snapshot; #87 (anthropic-sdk) moved `@opentelemetry/api`,
    re-keyed vitest's snapshot in every importer, and ran all seven". Recompute the "15% of §3.2.1's 550-650" share from
    a re-measured batch or drop it (not verified here).
12. **C6 (`:383-385`)**: "running money-ledger plus packets' two shards (three artifacts, about 16.6 minutes)" becomes
    "plus packets' three shards (four artifacts, about 36.6 minutes; five shards after #84)", and "(all six)" becomes
    "(every shard)". Also `:134` "runs all six shards" and §3.4 `:208` "which today runs all six" become "every shard".
13. **R2 (`:427-428`)**: "the first push run, which runs every package minutes after the merge". New text: "… about 16
    minutes after the merge (wall time 13.5-19.5 over the last ten push runs)". Evidence: `raw-pins/runs/push-runs2.json`.
14. **§11, the shards re-read (`:410-412`)**: add "#84 (merging before P4) splits packets into five shards; money-ledger
    stays money and ledger whole at its head e3299ea2, so `RUNNER_PROOF_SHARD` holds". Evidence: `git show
    refs/pull/84/head:stryker/shards.json` (17:36Z).
15. **§3.3 or §6 (a fact, no code)**: "No Stryker, vitest, tsx or fast-check release newer than the lock exists on
    2026-11-01 (npm, 17:24Z). Node 24.22.1 (security) and 24.22.2 carry 24.22.0's ICU 78.3 and Unicode 17.0, so the
    runtime check is unaffected by a later move of mutation's Node, which is global under P4." Evidence: §1.
