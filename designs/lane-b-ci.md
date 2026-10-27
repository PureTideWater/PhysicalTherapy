# The CI PR (Lane B, item 1): the plan, as four pull requests

Base: `claude/build-platform` at 49514e8 (main checkout, clean). Design step only: nothing was built, committed, pushed
or posted. Date 2026-10-24, revised 2026-10-25 after the adversarial review (section 13 gives each finding's
disposition). Lane B's claim: `LANES.md:103` (ADR 0066; test-matrix CI-01 to CI-20).

Sources (the scout reports and the review are kept on this branch in `designs/lane-b-ci/`, copied 2026-10-25 00:45 UTC
from the session's scratchpad, whose paths below do not survive the session; the measurement logs stayed there):
- the four scout reports, cited as [S1] to [S4], all under
  `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-design/`:
  - [S1] `scout-ci-structure.md` (audit #109 and every required-check name);
  - [S2] `scout-mutation.md` (#54);
  - [S3] `scout-playwright-runner.md` (#19's upgrade part);
  - [S4] `scout-dependency-policy.md` (#112 and the Dependabot PRs);
- combined audit #19, #54, #109 and #112 (`audits/combined/combined-report.md:364-372, 679-687, 1176-1184, 1203-1211`);
- `LANES.md` rules 1-12 and the queues; reconciliation-001's checks (`docs/product/reconciliation-001.md:423-467`);
- HANDOFF.md 54 (the ruleset offer), 73-91 (how the session works) and 292-303 (the efficient pipeline);
- PRD 17 and 18 (`docs/product/PRD.md:693-772`);
- the design review, cited as [R], `scratchpad/ci-design/design-review.md`, and the reviser's own measurements in
  `scratchpad/reviser-tools/` (a detached worktree at 49514e8, `scratchpad/reviser-wt`, removed afterwards).

Claims about code cite `file:line` at 49514e8. Where I checked a claim myself, I cite the command. Otherwise I cite the
scout's measurement. Section 10 lists where this plan departs from a scout, and why.

---

## 0. In one screen

- **Four pull requests, none with a migration.** All go into `claude/build-platform`. Merge order:
  1. **`co-001/ci-speed`** (#109): parallel jobs behind one `all green` gate, plus the slow tests made fast. It goes
     first, because every later PR in both lanes runs CI about 30 minutes faster.
  2. **`co-001/ci-deps`** (#112, with #19's assert loosening, its Dependabot group and its licence part; Dependabot #40,
     #38 except the browser packages, and #33): every action at its latest release and every image by digest (ci-speed
     and ci-mutation already SHA-pinned two workflows at older versions), pnpm without its 23 advisories under a
     three-day release age that the lockfile itself is checked against, Postgres from one digest-pinned compose file, a
     Dependabot configuration whose pull requests are green unless something is really incompatible, a release
     workflow that restores no cache, and a dry run that exercises the release's actions on every change to it.
     Re-read at 6ddd587 on 2026-10-25 (§3.2.6).
  3. **`co-001/ci-browser`** (#19's upgrade part): Playwright 1.64.1 and axe 4.14.0, the two WCAG 2.5.3 fixes, the seven
     baselines regenerated and inspected, every job on ubuntu-26.04 except the release's capacity chain, and an image
     binding that holds under either Docker image store.
  4. **`co-001/ci-mutation`** (#54): Stryker 10.1.1's vitest runner, per package, on every push and on every pull
     request that touches a money path. Its one required gate, `mutation`, needs each package above 85% and no
     unexplained survivor.

  ci-mutation's build starts as soon as ci-speed merges, beside ci-deps (at most two heavy workflows at once). It merges
  last because killing survivors is the longest work.
- **Measured targets** (section 1):
  - `all green` within 10 minutes, median, from the first job's start, against 29-41 minutes today;
  - the time until a pull request can merge (A1′), measured beside it. ci.yml stops setting it. The floor is then the
    `screening-capacity gate`, about 13-16 minutes (capacity jobs of runs 39977565861, 40018476404 and 39978142533:
    13:20, 16:00 and 15:40, the measurement step alone 9:31 to 14:02), on every PR that touches one of
    `watched-paths.txt`'s 514 lines, which include the manifests and the lockfile. Money-path PRs also wait for
    `mutation`, about 13-17 minutes. Shortening the PR capacity run changes what the founder ruled it measures, so it is
    open item O12, for the founder, with A1′'s numbers;
  - no test lost: each suite's count equals the base's, plus or minus the named moves;
  - every money package's score above 85% and no unexplained survivor;
  - a simulated Dependabot rewrite of every pin and digest passes every workflow assertion;
  - every job on ubuntu-26.04 except the release's capacity chain, under F5's recommended answer;
  - the seven baselines regenerated, proved byte-equal on CI's ubuntu-26.04, and inspected by a person.
- **Required checks after ci-speed:** `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`. That
  is four names, where the documents name five today plus the capacity gate. ci-speed updates every place that names
  them (§3.1.6).
- **One batch of founder questions, F1 to F7 (section 7).** None blocks ci-speed.
  - F1 (the default branch), F2 (security updates and the three-day release age) and F4 (`publish-content.yml`) shape
    ci-deps.
  - F5 (the release's capacity runner) shapes ci-browser.
  - F6 (the 85% exit in PRD 17) shapes two documents in ci-mutation.
  - F3 (the SHA-pinning setting, which needs F4 = yes first) and F7 (the ruleset) are repository settings, applied
    after a merge.
  - All seven were ruled as recommended (the founder, relayed 2026-10-25 ~01:10 UTC). F7's ruleset was applied on
    2026-10-25 at 21:14 UTC; F1 (a), F2 (a) and then F3 are applied when ci-deps merges (§3.2.5).
- **Lane A:** #42 (6b-4) overlaps all four PRs: the lockfile, `shell.tsx`, `consumer.db.test.ts`, the capacity
  harness, the test matrix and the synth registry. Rule 6 applies, and section 5 gives the exact resolution for each
  file.

---

## 1. Goal and acceptance (measurable)

| # | Goal | Target | How it is measured | PR |
|---|---|---|---|---|
| A1 | CI wall clock | `all green` completes in **≤ 10:00 median and ≤ 12:00 worst**, measured from the first ci.yml job's `started_at` to the gate's `completed_at`. The sample is the PR's last three heads plus the first five push runs on `claude/build-platform` after the merge. Queue time (each job's `started_at` minus the run's `created_at`) is reported beside it, never folded in. Runner-minutes per run (the sum of each job's `completed_at` − `started_at`) ≤ 50, with billed minutes (each job rounded up to the minute) reported beside them. The job estimates of §3.1.1 sum to 42.7-47.7 | `gh api repos/PureTideWater/PhysicalTherapy/actions/runs/<run>/jobs --paginate --jq '.jobs[] \| [.name,.created_at,.started_at,.completed_at,.conclusion] \| @tsv'`. The command goes in the new `docs/runbooks/ci.md`. Today: 41:20 (job 120475009638) and 29:09 (job 120636573742) [S1 §3] | ci-speed |
| A1′ | Time until a PR can merge | From the head's first workflow run's `created_at` to the `completed_at` of the last of the four required checks (§3.1.6), reported beside A1 on the same sample, split by which check finished last. Expected: `screening-capacity gate` on watched-path PRs (13-16 min today), `mutation` on money-path PRs (13-17 min), `all green` otherwise (≤ 10 min). No target is set here beyond A1's, because the capacity floor is O12's founder decision | `gh api repos/PureTideWater/PhysicalTherapy/actions/runs?head_sha=<sha> --jq '[.workflow_runs[].created_at] \| min'`, then `gh api repos/PureTideWater/PhysicalTherapy/commits/<sha>/check-runs --paginate --jq '.check_runs[] \| select(.name \| IN("all green","mutation","screening-capacity gate","approval-of-record")) \| [.name,.started_at,.completed_at] \| @tsv'`. Both go in `docs/runbooks/ci.md`, with the same pair for Dependabot heads (bot queue time, §3.2.1) | ci-speed (reported again by each later PR) |
| A2 | No test lost to sharding | Unit count = base + the new unit tests. The four db shards sum to the base's test:db count, minus the approval case and the route-count check (now a unit test), plus the snapshot-equivalence case. The e2e shards sum to the base's e2e count. Base 49514e8 = #39's merged tree: unit 4,524 + 1 skipped, golden 38, db 9,041 + 1 skipped, e2e 51 (HANDOFF.md, 2026-10-23 15:21). ci-mutation changes the golden count by its per-claim restructure, and states the new count with the claims-unchanged check (§3.4.1) | The CI job logs' vitest and Playwright totals (`get_job_logs`). Each `db (k/N)` job prints the files it ran, read from vitest's json reporter (sorted, with their count and the list's SHA-256), and the verifier takes the union of the N logs: disjoint, and equal to `pnpm -s vitest list --project db --filesOnly` (unsharded; `vitest list` ignores `--shard`, measured: 105 files for 1/4, 2/4 and the whole, `scratchpad/reviser-tools/{all,shard1,shard2}.txt`). CI-04's unit test proves the split for N = 4 and N = 6 through vitest's own sequencer | ci-speed |
| A3 | The slowest db file stops setting the wall | No db file over 240 s on CI. The 12 route files each ≤ 90 s, against route-tests' 865-1,336 s today [S1 §3] | The CI log's per-file durations | ci-speed |
| A4 | Dependabot PRs green by construction | (a) A unit test applies a simulated Dependabot rewrite to every action pin and image digest, and every workflow assertion in `workflows.test.ts` and `dependabot-config.test.ts` still passes on the rewritten text. (b) No version is duplicated outside a manifest: the worker image's playwright-core and both images' pnpm are derived. (c) After the merge, the first Dependabot batch is red only where a test names a real incompatibility. **The one deliberate exception:** a `browser-tests` PR is red on the `browser.json` check until a person runs ADR 0058's baseline procedure, and the failing step's message names that procedure, the expected revision and the found one (CI-18, `docs/runbooks/ci.md`) | (a) and (b) in `tools/test`; (c) read on the first weekly batch's checks | ci-deps (and ci-browser for Playwright) |
| A5 | Pins | Every `uses:` is `owner/repo@<40 hex> # vX.Y.Z`, the SHA is that tag's commit, and every `with:` key is an input the action declares at that commit. Every `uses:` inside a composite action, followed recursively at its pinned SHA, is a full SHA too (today: trivy-action pins setup-trivy and actions/cache, setup-trivy pins actions/cache/restore and actions/checkout, attest-build-provenance pins actions/attest, all by SHA, read at the pinned commits). Every base and service image carries an `@sha256:` digest | `tools/check-action-pins` (networked) on every run; `tools/test/workflows.test.ts` | ci-deps |
| A6 | Toolchain security | `pnpm audit --prod` gives 0 and `pnpm audit --audit-level=high` passes. The pnpm in `packageManager` has no moderate or worse advisory; 10.28.0 has 23, 11 of them high [S4 §9] | `tools/check-toolchain` on every run | ci-deps |
| A7 | Mutation, per package | The CI gate, on the ci-mutation PR's own full run and on the first push run, requires every package > 85%. Today's measurements (10.1.1, with aliases): money 93.22, ledger 92.19, packets (widened) 85.40, pricing (with golden tests) 91.70 [S2 §3.5]. **Zero unexplained survivors:** every Survived or NoCoverage mutant is killed by a test or recorded as equivalent, with a reason and a reviewer. A recorded equivalent stays in the score's denominator as Survived, so recording one never raises a score. The canary reports 5 of 5 cases as expected in every shard that ran, and no shard takes over 15 minutes | The `mutation` gate's log and summary, per package and per file | ci-mutation |
| A8 | ubuntu-26.04 | Every job's `runs-on` is `ubuntu-26.04` except eight on `RELEASE_RUNNER.label` (`ubuntu-24.04`): `release.yml`'s `build`, `capacity`, `push`, `report`; `release-dry-run.yml`'s `build`, `push`, `capacity`; `screening-capacity.yml`'s `capacity`, whose dispatch input alone may choose 26.04 (§3.3.1; 3.3.7; 3.3.8: `release-capacity.yml`'s and `content-calendar.yml`'s jobs move with every other job, under F5's letter). Every job log's "Runner Image" line confirms it | `workflows.test.ts`; the "Set up job" log lines | ci-browser |
| A9 | Baselines | All seven regenerated with Chrome for Testing 156.0.8078.4 (revision 1248) under Playwright 1.64.1, and committed from CI's baseline step while no local 1248 exists (3.3.7). **On CI's ubuntu-26.04** the baseline step (every pull request and every push run) regenerates all seven byte for byte from nothing and prints their SHA-256s; the PR records that run as ADR 0058's proof. A local second `--update-snapshots=all` leaving `git status` clean follows once the person allows storage.googleapis.com. CI's headless shell and Chromium equal `browser.json`'s tree SHA-256s (`333985b3…54172e`, `2f991090…129545`) and binary SHA-256s (`4fa61f0b…e5f9d6`, `377a9fc0…5f025`) after every install in every workflow, and the worker image's headless shell in `images`, in the release's build and in screening-capacity's and release-capacity's measuring jobs. The inspection (the co-founder's, taken as recommended, 2026-10-27) is recorded in `designs/lane-b-ci/ci-browser-a9.md`, its pictures in `designs/lane-b-ci/ci-browser-a9/` with a `SHA256SUMS` (3.3.8): old and new side by side, exact and comparator pixel counts, crops of the changed box (2026-10-24: six at 0 px, the without-seal cover at 1,611 px, [S3] M5) and the adversarial visual-inspection agent's verdict; it does not block the merge | The baseline step and the browser check in CI; the A9 note linked from the PR description; the local no-op once a local 1248 exists | ci-browser |
| A10 | Accessibility | No axe violation under 4.14.0 with the WCAG 2.0/2.1 A and AA tags on any page a journey scans (72 calls in 14 specs at 2ab2b15). A computed check holds every header control's accessible name to contain its visible text, at 1280 and 390 px | e2e (every `expectAccessible` runs `a11y.ts:12`; the check in `brand.spec.ts`) | ci-browser |
| A11 | The browser jobs' setup | With the apt cache hit, no `playwright install --with-deps` over 60 s, against 10 of 92 over it (86-612 s) in the 14 ci.yml runs before 6ddd587's; every restored archive verified against the signed index before apt uses it | The install step's duration in each job's steps (`gh api …/runs/<run>/jobs`), on the PR's runs and the first five push runs after the merge; `apt-archives.sh verify`'s kept and discarded counts | ci-browser |

---

## 2. The split

| PR | Branch | Audit items and Dependabot | Depends on | Migration | Test-matrix rows | Review checklists |
|---|---|---|---|---|---|---|
| 1 | `co-001/ci-speed` | #109, all of it | 49514e8 | none | CI-01 to CI-10 | CI and test-infrastructure (the gate, sharding coverage, snapshot equivalence); security (the supply-chain gates move under the gate) |
| 2 | `co-001/ci-deps` | #112, all of it; #19's assert loosening, Dependabot groups and licence fix; #40 (all majors, SHA-pinned); #38's tooling (vitest, eslint, postcss, next); #33 (declined by an ignore rule, images moved to trixie digests); the versions dismissed on 2026-10-18; postgres and minio coverage; release.yml cache-free and its dry run | ci-speed merged; F1, F2, F4 | none | CI-11 to CI-14 | security (supply chain; the release chain's provenance) |
| 3 | `co-001/ci-browser` | #19's upgrade part (Playwright with axe, WCAG, baselines, ubuntu-26.04) | ci-speed and ci-deps merged; F4, F5 | none | CI-18 to CI-20 | brand and accessibility (ADR 0058); release and capacity binding (security) |
| 4 | `co-001/ci-mutation` | #54, all of it | ci-speed merged (its build starts then); the lockfile is re-resolved with ci-deps's pnpm if ci-deps merged first; F6 for two documents | none | CI-15 to CI-17 | payment-engine (money paths: tests, plus one non-test money change, `cents.ts:85`'s unreachable branch, reviewed as a money-path change; the freeze; the ledger's additions-only rule) |

**Why four, against "group audit items that change the same code into one PR"** (HANDOFF.md 333, item 4). The split
follows the code, not the audit's item boundaries:
- **#19's parts go where the code they change goes.**
  - Loosening the exact-version asserts is the same code as #112's pinning policy: the `PINNED` table
    (`workflows.test.ts:46-58`) and the `@v4` literals (`:404, :423, :719`). So it rides in ci-deps.
  - The Playwright and accessibility-checker groups are lines of `.github/dependabot.yml`, so they ride in ci-deps.
  - The licence fix is the lockfile writer (pnpm 10.28.0 writes no `libc:` fields, [S3] M2), which is ci-deps's pnpm
    move.
  - Playwright 1.64.1 and ubuntu-26.04 cannot be separated: 1.56.1 has no browser for 26.04 ([S3] §1). They go
    together, with the baselines and the WCAG fixes the new browser and checker bring, in ci-browser.
- **#109 restructures ci.yml, which every other PR edits.** Landing it first means the others are written against the
  final job graph, not rebased onto it.
- **#54 touches test files, mutation tooling and one money line.** The money line is `cents.ts:85`'s unreachable
  `?? '0'` (§3.4.1), a non-test change in a money path that the payment-engine review covers as one. Its own workflow
  and gate keep its large, mostly test-only diff reviewable by the payment-engine checklist alone.

**Why not one PR, against "one PR per change"** (D4 (a)). One CI PR would be four subjects with four reviewer
checklists, and about 600 survivor-killing tests sit beside a workflow rewrite. A red run in any part would block the
30-minute saving for both lanes. ci-speed alone recovers about 25 minutes per run, and every PR in both lanes after it
benefits.

**Splits weighed and rejected:**
- *ci-deps split in two (action pins | npm, pnpm and images).* Both halves rewrite `workflows.test.ts`'s pin and image
  rules and the Dependabot config that covers both, so they are one change.
- *ci-browser inside ci-deps.* ci-browser needs a person to inspect baselines and fix the accessibility findings. It
  should not hold up the security fixes (pnpm's 11 high advisories).
- *Mutation inside ci.yml under `all green`.* Account slots are not the reason: GitHub's 20-job limit is per account,
  so mutation.yml's shards take the same slots, and inside ci.yml they could be conditional too. The reasons are:
  - `all green` stays the fast signal A1 measures. A money PR's mutation shards take 13-17 minutes, and inside ci.yml
    they would make its one gate that slow on every money PR;
  - mutation runs on triggers ci.yml does not (the weekly schedule and `workflow_dispatch`);
  - its result reads apart from the build's, under its own reviewer checklist;
  - the founder's pending ruleset offer already names `mutation` separately (HANDOFF.md:54).

  Merge readiness is the same with a second required gate.

**Parallelism:**
- ci-speed builds alone.
- After it merges, ci-deps and ci-mutation build in parallel. Their files are disjoint apart from:
  - `package.json` and the lockfile;
  - `pnpm-workspace.yaml` (ci-deps adds the release-age and trust settings; ci-mutation removes `patchedDependencies`
    and adds the canary package);
  - `.github/workflows/mutation.yml` (ci-deps pins every workflow; ci-mutation rewrites this one);
  - `workflows.test.ts` (different `describe` blocks);
  - ADR 0066 (different parts), `docs/runbooks/ci.md` (different sections) and reconciliation-001;
  - the test matrix and the synth registry.

  The PR merged second resolves (rule 6). If ci-mutation merges second, it re-pins every `uses:` it added to
  mutation.yml in ci-deps's form, and ci-deps's pin tests hold it to that. If ci-deps merges second, it pins
  ci-mutation's mutation.yml as it stands. The lockfile is re-resolved from the parent already on the build branch with
  `pnpm install --lockfile-only` (§5), never hand-merged.
- ci-browser is cut after ci-deps merges, because it needs pnpm 10.34.8 as the lockfile writer and the Dependabot
  browser group.

---

## 3. Per PR

### 3.1 `co-001/ci-speed` (audit #109)

#### 3.1.1 The job graph (ci.yml)

Triggers:
- `pull_request` (default types);
- `push: branches: [claude/build-platform]`. Every merge is re-verified on its merged tree, and the caches that pull
  requests restore are seeded ([S1] §7; GitHub lets a PR restore its base branch's caches).

Concurrency:
- group `${{ github.workflow }}-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.sha }}`.
  The `${{ github.workflow }}-` prefix keeps the group unique to ci.yml: groups are repository-wide, and two workflows
  sharing one cancel each other's runs (github/docs `data/reusables/actions/actions-group-concurrency.md`, "Only cancel
  in-progress jobs or runs for the current workflow"). Today's files already prefix it (`ci.yml:9-11`,
  `mutation.yml:22-24`). A `workflows.test.ts` rule holds every workflow's group to start with its own name
  (`${{ github.workflow }}-` or the literal name, as `screening-capacity-` and `publish-content` do);
- `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. This is screening-capacity.yml's pattern: a push
  run is never cancelled.

Permissions stay `contents: read`. No path filters: every job runs on every event.

Checkouts: `static`, `unit` and `domain model` check out with `fetch-depth: 0`, as today's job does (`ci.yml:25-26`):
- `static` scans and checks ranges against the base;
- `unit` computes the merge base for `ENGINE_FREEZE_BASE`, and `differential.test.ts` `git archive`s the base commit's
  packages and fails in CI without it (`tools/engine-freeze/differential.test.ts:35, 101-118`);
- `domain model`'s summary reads `origin/$BASE_REF:docs/product/domain-model.md` (`ci.yml:40-45`). At the default depth
  of 1 that ref is absent, and the step would print "no approved document" instead of failing.

No partial-clone filter: the whole history is a 15.28 MiB pack (`git count-objects -vH`, 379 commits), and a
`blob:none` clone would make `git archive` and gitleaks fetch blobs lazily, which depends on the checkout's credentials.
`tools/engine-freeze/check.test.ts`'s ci asserts require `fetch-depth: 0` on those three jobs. Every other job keeps the
default depth.

Ranges on a push run: the secret scan, releases-immutable and `ENGINE_FREEZE_BASE` use `github.event.before`, and fall
back to `HEAD^1` when it is all zeros (a new branch). That covers every commit of a multi-commit push. For a merge
commit, `github.event.before` is `HEAD^1`.

| Job (check name) | Needs | Runs | Timeout | Estimate (public 4 vCPU) |
|---|---|---|---|---|
| `static` | none | checkout (fetch-depth 0); pnpm; node (pnpm cache); Python 3.12 and pyx12; install; tsc cache restore. Then `pnpm audit --prod`; "Secret scan of the pull request's commits" (PR: `origin/$BASE_REF..HEAD`; push: `<before>..HEAD`, above); `pnpm check:fixtures`; `pnpm verify-content`; releases-immutable (PR: the base ref; push: `<before>`); Engine freeze (`check.ts` on PRs only, because its exception logic needs `PR_NUMBER`, `check.ts:864-882`); `pnpm synth --all` and its diff; `pnpm typecheck`; `pnpm lint:logs`; `pnpm test:golden`; `pnpm test:oracle`; `pnpm licenses:check` | 15 | 2.5-3 min |
| `lint` | none | `pnpm lint`: three memory-bounded ESLint groups, as many at once as memory admits (§3.1.2) | 15 | 2 min |
| `unit` | none | checkout (fetch-depth 0); Chromium (`pnpm --filter @tp/web exec playwright install --with-deps chromium`); `ENGINE_FREEZE_BASE` (PR: the merge base; push: `<before>`, above); `pnpm test` | 20 | 3.5-4 min |
| `db (k/N)` | none | Postgres (`services:` here; ci-deps moves it to the compose step); the quiet-logs `psql`; Chromium; the vitest results cache restored; `pnpm db:migrate && pnpm test:db --shard=${{ matrix.shard }}/$SHARDS --reporter=default --reporter=json --outputFile.json=$RUNNER_TEMP/db-results.json`. Then, `if: ${{ !cancelled() }}`, "Files this shard ran": `jq -r '.testResults[].name' \| sed "s\|^$GITHUB_WORKSPACE/\|\|" \| sort` to the log and the summary, with the count and the list's SHA-256 (A2, CI-04). The matrix is `fromJSON(github.event.repository.private && '[1,2,3,4,5,6]' \|\| '[1,2,3,4]')`, so a private repository's 2-vCPU runners get six shards automatically ([S1] §9) | 20 | 4.5-5 min each |
| `domain model` | none | checkout (fetch-depth 0); Postgres; `pnpm db:migrate`; `pnpm db:domain-model --check --strict --require-approval` (the command CLAUDE.md names; `packages/db/src/cli/domain-model.ts:23-40`). On PRs, "Changes since the last approved domain model" (`--summary-since origin/$BASE_REF`) goes to the summary and the log | 10 | 1 min |
| `build` | none | `pnpm build` (web and worker). Then `git rev-parse HEAD > apps/web/.next/BUILD_COMMIT`; a tar of `.next/standalone`, `.next/static`, `BUILD_COMMIT` and whatever `scripts/start-standalone.sh` reads (tar keeps the 154 symlinks, [S1] §6); `actions/upload-artifact` `web-build`, retention 1 day, `overwrite: true`; `pnpm cdk:diff` | 15 | 2.5 min |
| `e2e (k/M)` | build | Postgres; Chromium; download and untar; `E2E_PREBUILT=1 pnpm test:e2e --shard=k/M`. M is 2, or 3 when private. Then upload `playwright-<k>` (`if: always()`, `overwrite: true`) and the base64 diff print (`if: failure()`), both per shard | 25 | 4.5-5.5 min |
| `images` | none | Both images, one after the other, on buildx with `load: true`, each scanned by Trivy (HIGH and CRITICAL, `ignore-unfixed`). The worker's steps run `if: ${{ !cancelled() }}`, so a web failure still scans the worker. Moved from supply-chain.yml as one job, to spare a concurrency slot | 20 | 4 min |
| `all green` | every job above | `if: ${{ always() }}`, no checkout. Prints each needed job's result to the log and the summary, then `echo "$NEEDS" \| jq -e 'length > 0 and all(.[]; .result == "success")'`. A failed, skipped or cancelled job fails it | 5 | 10 s |

- Critical path: build, then the e2e shard holding the 168-s monitoring journey. That is about 7-8 minutes against the
  10-minute target, on the scouts' ±25% host variance ([S1] §9).
- Jobs: 13. The peak is about 11 at once, against GitHub Free's 20 per account ([S1], docs.github.com/en/actions/reference/limits).
- `supply-chain.yml` is deleted: its `licenses` job is a step in `static`, and its `images` job moves into ci.yml. ADR
  0010's reason for a separate file ("ci.yml is the plan's own workflow, imported verbatim ... It is not edited",
  `docs/adr/0010-…md:12-13`) no longer holds, and PRD 18 asks for "one workflow on every pull request" (`PRD.md:764`).
- Every verdict a gate prints goes to the log as well as to `$GITHUB_STEP_SUMMARY`. The proxy refuses the Actions
  artifact host, so the verifier reads results with `get_job_logs`.
- Artifacts: v4 and later make artifact names unique per run and artifacts immutable
  (`actions/upload-artifact` README, "(Not) Uploading to the same artifact" and "Overwriting an Artifact"), so every
  per-run name (`web-build`, `playwright-<k>`, and
  ci-mutation's reports) sets `overwrite: true` (an input of upload-artifact v7.0.2's `action.yml`). "Re-run failed
  jobs" then cannot fail on a name the first attempt left. The builder verifies it on the PR's first re-run.
- How vitest shards: `BaseSequencer.shard()` sorts the files by the SHA-1 of their root-relative path and slices the
  sorted list (vitest 5.0.4, `dist/chunks/index.B8VfM7Mf.js:7740-7751`). Shard membership is therefore fixed by the
  paths, and the results cache only orders files within a shard.

#### 3.1.2 What makes the jobs fast (measured by [S1])

- **Route tests** (`apps/web/src/lib/routes/route-tests.db.test.ts`, 815 lines, 688 worlds built one after another):
  - **One page read per distinct synthetic document per file.** `readDocumentPages` starts a bounded Worker for every
    read (`packages/contracts/src/evidence/pages.ts:104-108`), and the synthetic PDF is deterministic
    (`synthetic-pdf.ts:28-57`).
    - The memo is keyed by SHA-256 in `test-support/contract-world.ts`. The probe diff is
      `scratchpad/ci-design/contract-world.probe.diff`.
    - The first world of each file still reads for real. The bounded reader stays covered by `evidence.test.ts` and
      `contracts.db.test.ts`.
    - Measured: worlds went from 1.74 s to 0.79 s each, and the slice from 131 s to 67 s, with all 606 tests passing.
  - **The snapshot folded into one prepared statement.** It is built in `beforeAll` from `tenantTables()`, so new
    tables (#42 adds 8) join it automatically. It returns exactly the per-table function's string, read in one
    statement snapshot.
  - **Split into 12 files** under `apps/web/src/lib/routes/route-tests/`:
    - `define.ts` exports `defineRouteTests(file)`;
    - `partition.ts` holds `ROUTE_TEST_FILES = 12` and a deterministic cost-balanced `routesOf(file)`. The cost is the
      worlds per route (2, plus 2 for a practice route; a public route costs 1 + originChecked), assigned longest-first
      greedily over registry order;
    - twelve two-line files, `route-tests.<k>.db.test.ts`;
    - `snapshot.db.test.ts`, the equivalence case.
- **SCR-19 in its own file.** It is the kill-and-recover lease test (`consumer.db.test.ts:500-545`, about 190 s).
  - It moves to `apps/worker/src/screening/consumer-lease.db.test.ts`.
  - The two helpers both files need (`consumerBoss`, `timedConsumer`, `consumer.db.test.ts:237-245, 393-400`) move to
    `apps/worker/src/screening/test-support/consumer.ts`, so #42's change to the consumer's mail config lands in one
    place (§5).
- **Slow files first in each shard.** `node_modules/.vite/vitest` (the vitest results cache) is cached per shard:
  - key `vitest-db-v1-${{ runner.os }}-<k>-${{ github.sha }}`, restore prefix `vitest-db-v1-${{ runner.os }}-`;
  - push runs seed it;
  - without it, vitest falls back to file size, and the SCR-19 split already lowers the floor ([S1] §5).
- **Typecheck: a root runner, not tsconfig edits.** `tools/engine-freeze/check.ts:196-198` refuses any change under
  `packages/pricing/` outside `src` ("its manifest, its TypeScript settings ... frozen with the engine, exception or
  not"). So `incremental` cannot go into `packages/pricing/tsconfig.json`.
  - `tools/typecheck/run.ts` runs the root `tsc --noEmit -p tsconfig.json`.
  - For every workspace it runs `tsc --noEmit -p <dir>/tsconfig.json --incremental --tsBuildInfoFile node_modules/.cache/tsc/<slug>.tsbuildinfo`.
    That is the same check as each workspace's own `typecheck` script; all 20 are `tsc --noEmit` (checked with `node -p`
    over every `package.json`).
  - It starts the slowest first (web, tools, worker), and its concurrency is bounded by cores and by memory (about
    2 GB per process).
  - `node_modules/.cache/tsc` is cached with key `tsc-v1-<os>-<lockfile hash>-<sha>` and restored by prefix. tsc
    compares file hashes, so a stale cache cannot pass a broken commit.
  - Web: 47 s cold, 7.6 s warm ([S1] §7). Root `package.json`'s `typecheck` becomes `tsx tools/typecheck/run.ts`, and no
    workspace file changes.
- **Lint: `tools/lint/run.ts`.**
  - Groups: `apps/web`; `packages`; and the complement, `.` with the other two roots as ignore patterns, so coverage is
    total by construction.
  - Each group is its own `node --max-old-space-size=<heap> node_modules/eslint/bin/eslint.js … --max-warnings=0`, with
    nominal heaps of 6,144 MB for web and 4,096 MB for the others.
  - The budget is `os.totalmem()` − 2 GiB. Each group's heap is the smaller of its nominal heap and the budget. Groups
    start, largest first, while the sum of the running groups' heaps stays within the budget and their number stays
    within `os.availableParallelism()`, and the scheduler always starts at least one group when none is running, so no
    group waits forever.
  - On the public 4-vCPU, 16 GB runner (about 15.6 GiB reported, a budget of about 13.6 GiB) that is web and packages
    at once (10,240 MB), then the complement when packages ends. All three at once (14,336 MB) does not fit, and it
    need not: web takes 123 s and the other two 45 s each ([S1] §7), so the wall stays about 123 s.
  - On a private 2-vCPU, **8 GB** runner (github/docs `data/reusables/actions/supported-github-runners.md`, the private
    table: 2 CPU, 8 GB; the public one: 4 CPU, 16 GB) the budget is about 5.7 GiB: web runs alone with a heap of about
    5.7 GiB, above its measured 4,813 MB peak, then the other two one at a time.
  - Measured peaks: 4,813, 2,622 and 2,605 MB; 545 + 450 + 431 = 1,426 files ([S1] §7).
  - No `--cache`: it does not track type information.
  - This departs from audit #109's "lint per workspace": web is the floor whatever the split, because its program
    compiles every workspace package's source ([S1] §7), and more groups would only add processes. Notice N9.
- **Chromium in every vitest job, enforced.** `vitest.config.ts` gains a `globalSetup` for the unit and db projects,
  `tools/test/ci-chromium.ts`. When `CI` is set and `chromiumInstalled()` (`apps/worker/src/report/pdf.ts:37`) is false,
  it throws. Otherwise `report.db.test.ts:165`, `payer-copy.db.test.ts` and six unit files skip in silence ([S1] §5).
  - Every workflow job that runs vitest's unit or db project therefore installs Chromium first. Besides ci.yml's
    `unit` and `db`, that is `large-zip.yml`'s job, which runs
    `pnpm vitest run --project db apps/worker/src/intake/intake.large.db.test.ts` with no install today
    (`large-zip.yml:28-32`) and whose weekly schedule fires under F1 (a). ci-speed adds the same
    `playwright install --with-deps chromium` step there.
  - A `workflows.test.ts` rule finds every step whose `run` invokes `vitest` with the unit or db project (directly, or
    through `pnpm test`/`pnpm test:db`) and requires an earlier Chromium install step in the same job.
  - `vitest.mutation.config.ts` (ci-mutation) does not load this setup: its test set has no printing test.
- **Flaky end-to-end tests fail the run.**
  - `retries: CI ? 1 : 0` stays (`playwright.config.ts:62`), so a "flaky" label still separates nondeterminism from a
    real break.
  - `failOnFlakyTests: Boolean(process.env.CI)` is added. It exists in 1.56.1: `types/test.d.ts:1195-1212`.
  - `trace: 'retain-on-failure'` (`:66`) already keeps the first attempt's trace. That matters because a retry fails on
    the dirty state its first attempt left ([S3] §3).
  - The `github` reporter is added to CI's reporters.

  This is decided under the standing rule (section 7, N3). It is not a founder question: it is a quality choice with
  no cost or product trade-off.
- **e2e over one build.** In `playwright.config.ts:77`, the `webServer.command` runs `tsx e2e/prepare.ts`. Then, with
  `E2E_PREBUILT=1`, it runs `tsx scripts/build-stamp.ts --expect "$(git rev-parse HEAD)"` in place of
  `pnpm run build`, then `start-standalone.sh`.
  - The stamp check lives in `apps/web/scripts/`, because the vitest projects ignore `apps/web/e2e/**`
    (`vitest.config.ts:7`). It refuses a build of another commit, or a missing stamp.
  - The build job runs `pnpm build` with no e2e variables, so the journeys exercise the production build that ships.
    Every page is dynamic, and `next.config.ts:13` is the config's only build-time read ([S1] §6; grep of
    `process.env` in `next.config.ts`).
  - The builder records one diff of the standalone tree built with and without the e2e environment in ADR 0066, as
    proof.
  - Playwright 1.56.1 and 1.64.1 both shard by test count, not by duration. 1.64.1's `filterForShard` takes only an
    internal `PWTEST_SHARD_WEIGHTS` (`playwright@1.64.1 lib/runner/index.js:2462-2487`, read from `npm pack`), which this
    plan does not use.
- **The schema approval as its own check.**
  - The approval case (`packages/db/src/domain-model/domain-model.db.test.ts:61-64`) is removed. The drift case at `:51`
    stays in the db shards.
  - The `domain model` job runs the CLI with `--require-approval`.
  - A schema PR's red then means only "unsigned" (CO-02 unchanged: CLAUDE.md's command, run by name).
  - The summary moves with it (ADR 0063's "CI's `check` job writes the summary").

#### 3.1.3 Files

- **Workflows:**
  - `.github/workflows/ci.yml` (rewritten);
  - `.github/workflows/supply-chain.yml` (deleted);
  - `.github/workflows/large-zip.yml` (the Chromium install step only);
  - `.github/workflows/screening-capacity.yml` (the comment at `:146`, "as supply-chain.yml builds them", only).
- **Tools:**
  - `tools/typecheck/{run.ts, run.test.ts}` (new);
  - `tools/lint/{run.ts, groups.ts, groups.test.ts}` (new);
  - `tools/test/ci-chromium.ts` and `tools/test/ci-chromium.test.ts` (new);
  - `tools/test/ci-gate.test.ts` (new: runs the gate step's own `run` text under bash and jq on fixture `needs` JSON:
    success, a failure, a skip, a cancellation, and an empty object);
  - `tools/test/db-shards.ts` and `tools/test/db-shards.test.ts` (new, CI-04: the split for N = 4 and N = 6 through
    vitest's Node API, §3.1.4);
  - `tools/required-checks.ts` and `tools/test/required-checks.test.ts` (new, §3.1.6);
  - `tools/test/workflows.test.ts` (and its header comment at `:13`);
  - `tools/engine-freeze/check.test.ts` (`:729-747`, its ci-step asserts, now with `fetch-depth: 0` on `static`,
    `unit` and `domain model`);
  - `tools/test/codeowners.test.ts` (the comment at `:89`; ci.yml is covered by `/.github/`);
  - `tools/check-licenses/index.ts` (the comment at `:11`).
- **Configuration:**
  - `package.json` (scripts `typecheck` and `lint` only);
  - `vitest.config.ts` (globalSetup, and the db sequence cache settings).
- **Web:**
  - `apps/web/playwright.config.ts`;
  - `apps/web/scripts/build-stamp.ts` and `build-stamp.test.ts` (new);
  - `apps/web/src/lib/routes/route-tests.db.test.ts` (deleted), replaced by `route-tests/{define.ts, partition.ts, partition.test.ts, snapshot.db.test.ts, route-tests.0.db.test.ts … route-tests.11.db.test.ts}`;
  - `apps/web/src/lib/routes/test-support/contract-world.ts`;
  - comments naming the old file in `apps/web/src/lib/routes/index.ts:44`, `apps/web/src/lib/http/route.ts:144` and
    `apps/web/src/lib/routes/uploads.db.test.ts:30`.
- **Worker:**
  - `apps/worker/src/screening/consumer.db.test.ts`;
  - `consumer-lease.db.test.ts` and `test-support/consumer.ts` (new).
- **Database:** `packages/db/src/domain-model/domain-model.db.test.ts`, the approval case only.
- **Images:** the comments naming `supply-chain.yml` in `apps/web/Dockerfile:24` and `apps/worker/Dockerfile:19`.
- **Compliance:** `packages/compliance/src/controls.ts`, which the test matches verbatim against ci.yml
  (`controls.test.ts:97-101`), and `controls.test.ts`:
  - `:192` becomes two entries: `pnpm typecheck` and `pnpm lint:logs` in `static`, and `pnpm lint`;
  - `:249-250` move from `SUPPLY` to `CI`;
  - the `database_test` entries at `:99, 127-129, 146, 327` keep the evidence rule whole.
    `controls.test.ts:77-85` requires each `database_test` file to exist, to end in `.db.test.ts` and to hold the
    test's title after `it(`, `test(` or `describe(`.
    - Evidence entries gain an optional `definedIn`. For these six:
      `{ kind: 'database_test', file: 'apps/web/src/lib/routes/route-tests/route-tests.0.db.test.ts', definedIn: 'apps/web/src/lib/routes/route-tests/define.ts', test: … }`.
    - The test keeps every existing rule on `file` (it exists, it ends in `.db.test.ts`). When `definedIn` is present,
      it also requires `file` to import `definedIn` (a relative import that resolves to that path), and `definedIn`
      to hold the title under the same `hasTestTitled` rule. Without `definedIn`, the title must be in `file`, as
      today.
    - `EvidenceSource` (`controls.ts:59`) gains `readonly definedIn?: string`. No rule is loosened.
- **Synthetic cases:**
  - `packages/synth/src/expected/types.ts` (add `'CI'` to `CASE_MODULES`, `:9`);
  - `packages/synth/src/cases/{matrix,registry}.ts` (CI-01 to CI-10; `assertedBy` for SEC-02 and SEC-15 points to
    `route-tests/define.ts`, and for SCR-08 and SCR-19 to `consumer-lease.db.test.ts`, at `registry.ts:235, 248, 310, 382`);
  - `fixtures/synthetic/CI-01…CI-10/expected.json` and the regenerated `fixtures/synthetic/{SEC-02,SEC-15,SCR-08,SCR-19}/expected.json`,
    all from `pnpm synth --all`.
- **Documents:** §3.1.5.

#### 3.1.4 Tests (new and changed; failing first where a behaviour is fixed)

| Test | Proves | Failing first |
|---|---|---|
| `tools/test/ci-gate.test.ts` | The gate fails on any needed result but success | yes: today there is no gate |
| `workflows.test.ts`: the gate's `needs` equals every other job id; the matrix expressions for public and private; the per-shard artifact names, each with `overwrite: true`; the timeouts table (`'ci.yml': {static: 15, lint: 15, unit: 20, db: 20, 'domain-model': 10, build: 15, e2e: 25, images: 20, 'all-green': 5}`, plus `large-zip.yml`'s 45); the push trigger and its concurrency; every workflow's concurrency group starts with its own name; every job that runs vitest's unit or db project installs Chromium before it; each `db` shard prints the files it ran; the push ranges use `github.event.before` with the zero fallback; the PR-only steps (freeze `check.ts`, domain-model summary); the steps match by action name, never by ref (this replaces `:404, :423`) | the graph | the old asserts are rewritten; the concurrency and Chromium rules fail first on a fixture workflow |
| `tools/test/db-shards.test.ts` (CI-04): for N = 4 and N = 6, vitest's own Node API (`createVitest` with the db project and `shard: 'k/N'`, `globTestSpecifications()`, then the configured sequencer's `shard()`, run by `tools/test/db-shards.ts` in a child process so the test's own vitest instance is not reused) gives N disjoint sets whose union is the db project's files, none empty | the split loses no file and runs none twice | yes, against a fixture sequencer that drops a file |
| `tools/test/required-checks.test.ts`: every listing of the required checks equals `REQUIRED_CHECKS` (§3.1.6) | one set of names everywhere | yes: today's documents list five |
| `route-tests/partition.test.ts`: every route in `ROUTES` is in exactly one file; the union equals the registry by id; no file is empty; the directory holds exactly `route-tests.0..11.db.test.ts`, each calling `defineRouteTests(<its index>)`; and it absorbs "generates tests for every registered route, and every authenticated route has a sample" | no route escapes the split | yes, before the split |
| `route-tests/snapshot.db.test.ts`: folded equals per-table on two worlds; they differ between worlds; both change identically after an UPDATE | the fold weakens nothing | yes |
| `tools/test/ci-chromium.test.ts`: the global setup throws with `CI` set and no Chromium, and returns otherwise | no silent skip | yes |
| `apps/web/scripts/build-stamp.test.ts`: match, mismatch and missing | a stale build is refused | yes |
| `tools/lint/groups.test.ts`: the complement ignores exactly the other groups' roots; the scheduler's plans for 16 GiB (web and packages, then the complement) and 8 GiB (each alone, web's heap capped at the budget); a host too small for any nominal heap still runs one group at a time | coverage and memory | yes |
| `tools/typecheck/run.test.ts`: the runner's workspaces equal `pnpm-workspace.yaml`'s globs, expanded; every workspace's own `typecheck` is `tsc --noEmit` | no workspace missed | yes |
| `tools/engine-freeze/check.test.ts`: freeze in `static` on PRs; `ENGINE_FREEZE_BASE` set in `unit` before `pnpm test`; `fetch-depth: 0` on `static`, `unit` and `domain model` | the freeze and the differential test still run | rewritten |
| `controls.test.ts`, against the new strings, with the `definedIn` rule (the `file` rules unchanged) | the compliance evidence, weakened nowhere | yes: a `definedIn` that `file` does not import fails |

#### 3.1.5 Documents

- **New:**
  - `docs/adr/0066-run-ci-as-parallel-jobs-behind-one-gate-measure-mutation-on-every-money-package-move-the-browser-and-runner-together-and-pin-every-dependency.md`,
    Part 1. Each later PR appends its part.
  - `docs/runbooks/ci.md`: the job graph; reading a red gate; the timing command; the private-repository widths; the
    caches; never re-run a flaky test to green.
- **Amended:**
  - ADR 0010 (`:17, :20, :54`): the licence and image gates run as ci.yml jobs under `all green`.
  - ADR 0063: lines 61-63, 88, 133-134, 221, 327-331, 339, 376, 458-459 and 477 (the required checks, the
    domain-model summary's job, the per-job timeouts, the audit's job, the security.txt expiry now failing `static`),
    and line 130's "main's 10 files", which is 11 (`git ls-tree -r --name-only origin/main | wc -l`; HANDOFF.md
    312-325, follow-up (1)).
- **Updated:**
  - `docs/runbooks/github-governance.md` (lines 58-67, 100-111, 269, 289-300, 336-339, 351, 424-436, 525 (10 files → 11),
    533-538, 556, 576 and 620-621; [S1] §8 and [R] R8);
  - `docs/runbooks/screening-capacity.md:308-320`;
  - `docs/policies/change-management.md:40-45, 53`;
  - `.github/pull_request_template.md:30-31, 57`;
  - `README.md:106, 131, 551`.
- Every listing of the required checks in these documents sits between `<!-- required-checks -->` and
  `<!-- /required-checks -->` markers, which `required-checks.test.ts` reads (§3.1.6).
- **reconciliation-001:**
  - the series' entry in "Proposed pull requests, in order", before PR 7, where the audit places it;
  - an *Amended* note on "`pnpm test:db` ... passes on every pull request" (`:450`): it runs as `db (1/4)` to `db (4/4)`,
    every shard required through `all green`.
- **Test matrix:** CI-01 to CI-10 (section 3.5), in `docs/product/test-matrix.md` under a new "Continuous integration
  (CI)" heading.

#### 3.1.6 Required checks, and every place that names them

The new set:

| Check | Workflow |
|---|---|
| `all green` | ci |
| `mutation` | mutation (today's job id; ci-mutation keeps the name for its gate) |
| `screening-capacity gate` | screening-capacity, unchanged |
| `approval-of-record` | approval-of-record, unchanged |

Places that name today's checks (the design's grep, completed by the review's,
`` git grep -nE 'ci / check|`check` \(the|five (green )?checks|images \(web\)|supply-chain' `` at 49514e8):
- ci.yml `:13-18, 85-86`;
- `workflows.test.ts` `:13, 223, 263, 401-519, 749, 784, 791-808`;
- `tools/engine-freeze/check.test.ts:729-747`;
- `differential.test.ts:371, 411` (comments);
- `packages/compliance/src/controls.ts` `:82, 95, 160, 192, 218, 248-250, 298`;
- `.github/pull_request_template.md:30-31, 57`;
- the governance runbook lines above (269 and 525 included);
- ADR 0063 `:61-63, 88, 133-134, 221, 327-331, 339, 376, 458-459, 477`;
- `docs/policies/change-management.md:40-45, 53`;
- `README.md:131, 551`;
- `docs/runbooks/screening-capacity.md:308-320`;
- `docs/adr/0010-…md:17, 20, 54`;
- the comments at `screening-capacity.yml:146`, `tools/check-licenses/index.ts:11`, `apps/web/Dockerfile:24` and
  `apps/worker/Dockerfile:19`.

A line list goes stale, so a test replaces it:
- `tools/required-checks.ts` exports `REQUIRED_CHECKS = ['all green', 'mutation', 'screening-capacity gate', 'approval-of-record']`
  (each with its workflow).
- `tools/test/required-checks.test.ts` reads every marked listing (`<!-- required-checks -->` … `<!-- /required-checks -->`)
  in the documents above and the PR template, and requires its names to equal the constant, in order. It also requires
  the marker in each of those files, so a listing cannot drop out of the check. `workflows.test.ts` requires each name
  to be a job's `name:` in its workflow.
- The verifier also runs
  `` git grep -nE 'ci / check|`check` \(the|five (green )?checks|images \(web\)|images \(worker\)|supply-chain\.yml' ``.
  It must be empty, except lines in an ADR's dated amendment or history paragraph, which the PR description lists one
  by one.

Two copies outside this PR also name them:
- **main's `.github/pull_request_template.md`.** This changes only through F1's answer: under (a) the build branch's
  template is the one offered; under (b) the PR into main carries it.
- **ops `HANDOFF.md:54`.** This is Lane A's log. Lane B writes the new names in `lanes/lane-b.md` for Lane A to fold in.

#### 3.1.7 Acceptance (fresh-clone verifier)

1. Fresh clone at the head, then `pnpm install --frozen-lockfile`.
2. **Scope:** `git diff --name-only $(git merge-base origin/claude/build-platform HEAD)` lists only §3.1.3's files.
   `git diff --name-only <mb> -- packages/db/migrations docs/product/domain-model.md packages/db/domain-model packages/pricing`
   is empty.
3. **Freeze:** `PR_NUMBER=<n> pnpm -s exec tsx tools/engine-freeze/check.ts <mb>` passes with an empty engine diff stat.
4. **Static checks:**
   - `pnpm typecheck` twice: the second, warm run reports the cache hit, and the times are recorded;
   - `pnpm lint` prints each group's file count, peak RSS and duration;
   - `actionlint .github/workflows/*.yml`;
   - `pnpm exec vitest run tools/test tools/lint tools/typecheck packages/compliance packages/synth apps/web/scripts apps/web/src/lib/routes/route-tests/partition.test.ts`
     (this includes `db-shards.test.ts`, CI-04's split for N = 4 and N = 6, and `required-checks.test.ts`);
   - `pnpm synth --all && git diff --exit-code -- fixtures/synthetic`;
   - the stale-name `git grep` of §3.1.6 is empty but for the listed history lines.
5. **Bounded database proofs**, on PG18 at 5433 with `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`:
   - `pnpm vitest run --project db apps/web/src/lib/routes/route-tests/snapshot.db.test.ts apps/web/src/lib/routes/route-tests/route-tests.0.db.test.ts`.
6. **CI on the head**, read from the logs:
   - A1's times, and A1′'s time to the last required check, with which check it was;
   - A2's counts against 49514e8's;
   - the shard union (A2, CI-04): the "Files this shard ran" lists of `db (1/4)` to `db (4/4)`, read with
     `get_job_logs`, are disjoint and together equal `pnpm -s vitest list --project db --filesOnly` at the head;
   - A3's per-file durations;
   - `all green` passes, and its log lists every job;
   - `domain model` is green (no schema change), and on the PR its summary compares against `origin/claude/build-platform`
     (not the "no approved document" line);
   - `unit`'s differential test ran, not skipped.
7. **After the merge:** the first push run is green and within A1, and its secret scan's range is
   `github.event.before..HEAD`.

### 3.2 `co-001/ci-deps` (audit #112; #19's assert loosening, Dependabot groups and licence fix; #40, #38's tooling, #33)

Revised on 2026-10-25 at `claude/build-platform` 6ddd587, after ci-speed (#43), ci-mutation (#44) and PR 15 (#45)
merged. In §3.2.1 to §3.2.5 every `file:line` reads at 6ddd587; §3.2.6 lists each change from the 2026-10-24 text with
its evidence. The rulings this section follows:
- the founder's F1 (a), F2 (a) and (b), and F4 yes (relayed by the co-founder, 2026-10-25 ~01:10 UTC);
- F7, applied 2026-10-25 21:14 UTC: "Protect the build branch" (ruleset 25837331) requires `all green`, `mutation`,
  `screening-capacity gate` and `approval-of-record` from GitHub Actions, with branches up to date, a pull request with
  0 approvals, no force push or deletion, and no bypass;
- the co-founder's Q2 (#42's shared files under LANES rule 6) and Q3 (engineering-only choices inside a ruled design
  are pre-approved), 2026-10-25 ~21:05 UTC.

Three choices go to the co-founder (§3.2.6, CQ1 to CQ3; CQ3 added by §3.2.7). Each touches only a few lines. None
blocks the builders' start, and the pull request merges only once all three are answered (§3.2.5 step 11).

#### 3.2.1 What changes

- **Already done by ci-speed and ci-mutation, so not repeated here:**
  - `ci.yml` (9 jobs) and `mutation.yml` (3 jobs) are now SHA-pinned, as `release.yml` and `screening-capacity.yml`
    were, at the versions `PINNED` holds (`tools/test/workflows.test.ts:77-92`): checkout v4.4.0, setup-node v4.4.0,
    action-setup v4.3.0, setup-python v5.6.0, cache v4.3.0, upload v4.6.2, download v4.3.0, buildx v3.12.0,
    build-push v6.19.2 and login v3.7.0. ci-deps moves every one of them to the table below.
  - `supply-chain.yml` is gone. Licences are a step of `static` (`ci.yml:150-151`) and both images one `images` job
    (`:467-519`), whose two Trivy steps already set `cache: false` (`:493`, `:516`).
  - Every job has a timeout except `publish-content`'s (CI-10, `workflows.test.ts:1513-1535`). Every checkout sets
    `persist-credentials: false` except `large-zip.yml`'s and `publish-content.yml`'s, which pushes (grep over the
    seven workflows). The Postgres services check health on TCP (`ci.yml:243-247`).
  - Tag refs remain in three files only: `approval-of-record.yml:30,32`, `large-zip.yml:30-32` and
    `publish-content.yml:25,27,28`. `approval-of-record` is one of F7's four required checks, so a moved `v4` tag could
    decide a required check until ci-deps merges.
- **Every action pinned, at its latest release.** Each `uses:` becomes `owner/repo@<sha> # vX.Y.Z` in every workflow.
  Read with `git ls-remote --tags` on 2026-10-25: no tag newer than 2026-10-24's. "Tag's commit" is the commit's date
  from a depth-1 fetch of the tag (GitHub's release API is refused for other repositories in this session); "Uses"
  counts every workflow at 6ddd587.

  | Action | Version | Peeled commit (the pin) | Tag's commit (UTC) | #40 offers | Uses |
  |---|---|---|---|---|---|
  | `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` | 2026-07-17 18:45 | v7.0.1 | 18 |
  | `actions/setup-node` | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` | 2026-10-08 02:43 | v7.1.0 | 15 |
  | `pnpm/action-setup` | v6.1.0 | `ea17c68df8912ef543352723c149a84f56e3d413` | 2026-09-04 23:42 (annotated tag 09-05 07:26) | **v6.0.10** `0977fd99` | 14 |
  | `actions/setup-python` | v7.1.0 | `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` | 2026-10-22 02:33 | v7.1.0 | 1 |
  | `actions/upload-artifact` | v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | 2026-10-07 10:00 | v7.0.2 | 7 |
  | `actions/download-artifact` | v8.0.2 | `9000827ccba6bdab643e8b6fd33ac0654aef8333` | 2026-10-07 10:00 | v8.0.2 | 6 |
  | `actions/cache/restore` and `/save` | v6.1.0 | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` | 2026-06-23 20:30 | v6.1.0 | 7 + 4 |
  | `docker/setup-buildx-action` | v4.4.1 | `f87e5991a6d7451dcb8d9637bfbc97413f497069` | 2026-09-16 07:47 | v4.4.1 | 3 |
  | `docker/build-push-action` | v7.4.0 | `c3c9e263c25d99ce0380d002d59b67737d91b0dc` | 2026-09-15 07:29 | v7.4.0 | 5 |
  | `docker/login-action` | v4.7.0 | `81c6f93d4bc991e510b342a00b419b3bb4efc5c6` | **2026-10-23 15:11** | **v4.6.0** `dbcb8138` | 1 |
  | `aquasecurity/trivy-action` | v0.36.0 (kept) | `ed142fd0673e97e23eac54620cfb913e5ce36c25` | 2026-04-22 09:20 (annotated tag 09:29) | not offered | 4 |
  | `actions/attest-build-provenance` | v4.2.2 (kept) | `4d101475d8b20a2381f78447822ac1eab6504dd8` | 2026-08-06 19:54 | not offered | 1 |

  - ci-speed and ci-mutation added no new action, only more uses: cache/restore at `ci.yml:124, 187, 263, 272, 425`,
    cache/save at `:136, 194, 309`, and `mutation.yml`'s checkout, action-setup, setup-node, upload and download
    (`:49-181`).
  - **The new majors already ran green here.** Dependabot's #40 (head e0d5b6f, runs 40223436311, 40223436319 and
    40223436304, 2026-10-25 18:54-19:10 UTC) ran every job of `ci.yml`, `mutation.yml` and `screening-capacity.yml` on
    these majors, with action-setup at v6.0.10. All passed except `unit`, which failed only on `workflows.test.ts`'s
    literal pins. Its log (job 121259732714) gives 14 failed, 4,974 passed and 1 skipped; GitHub shows only 10 of them
    as annotations, its cap per step. The 14: `:457`, `:1373` and `:1397` (each through `stepIndex` `:174`), and
    `:489, :540, :645, :818, :936, :1062, :1213, :1250, :1271, :1447, :1456`. Every one is pin-derived. Rules (b) to
    (d) below remove exactly that failure.
  - ci-deps differs from #40 in two pins. It takes action-setup v6.1.0, the latest release, where #40 offers v6.0.10
    (why Dependabot passed over a release seven weeks old could not be read: the release API is refused here). And it
    takes login v4.7.0, where #40 offers v4.6.0, most likely because GitHub's default three-day cooldown held v4.7.0.
    The builder pins v4.7.0 after 2026-10-26T15:11Z, when its tag commit is three days old. That is this one pin's
    timing, not a rule of ci-deps, and it costs nothing: the pull request cannot merge before its bump commits, which
    come after 2026-10-26T19:18:50Z (below). A check that holds every action pin to three days is P1, a security
    trade-off for the co-founder outside ci-deps (§3.2.6).
  - action-setup v6.1.0 bootstraps pnpm 11.25.0 from its own lock, then runs `pnpm self-update` to `packageManager`'s
    version in its own directory (`src/install-pnpm/run.ts` at `ea17c68d`). The workspace's release age therefore never
    applies to that switch, and `check-toolchain` checks `packageManager`'s version itself (below).
  - The builder resolves each peeled SHA again when it pins (`refs/tags/vX.Y.Z^{}`). [S4] §2 checked #40's breaking
    changes against our usage. Re-checked on 2026-10-25 for the uses added since:
    - checkout v7.0.0 blocks a fork's checkout under `pull_request_target` and `workflow_run`, which no workflow uses;
      v7.0.1 is fixes (`CHANGELOG.md:3-23` at `3d3c42e5`);
    - setup-python v7 removed `pip-install`, and build-push v7 dropped `DOCKER_BUILD_NO_SUMMARY` and
      `DOCKER_BUILD_EXPORT_RETENTION_DAYS`, all unused (grep);
    - every `with:` key used at 6ddd587 is an input at the new SHAs (`action.yml` at each, raw.githubusercontent.com).
      download v8.0.2 adds `digest-mismatch` (default `error`, stricter), upload v7.0.2 adds `archive` (default
      `true`), and setup-node v7.1.0's `package-manager-cache` turns on only for an npm `packageManager`.
  - `publish-content.yml` is pinned too (F4, yes) and held to its frozen copy (§3.2.3). **How ci-deps reads F4's
    "SHA pins at the current majors now" (§7):** "current" as the latest release, so publish-content.yml takes
    checkout v7.0.1, action-setup v6.1.0 and setup-node v7.1.0, as rule (b) requires of every workflow. Three facts
    support that reading. Only its `uses:` refs and their comments change, which F4's operative clause allows. The
    first Dependabot actions PR would bring these majors anyway, and F4 lets it do so with no further ruling. And the
    same three actions run in ci.yml on every pull request with the same inputs (`fetch-depth: 0`; none;
    `node-version: 24, cache: pnpm`), apart from `persist-credentials`, which publish-content.yml keeps for its push.
    reconciliation-001's F4 entry records this reading. If anyone doubts it, it goes to the founder before ci-deps
    merges.
- **`workflows.test.ts` pin rules.** They replace `PINNED` (`:77-92`), its 26 uses and every literal ref:
  - the 26 uses are 24 `PINNED.*` on 23 lines (`:457, 469, 489, 490, 505, 540, 545, 645, 668, 682, 684, 690, 699, 710,
    818, 936, 1062, 1213, 1219, 1373, 1397, 1445, 1457`; `:540` holds two) and `Object.values(PINNED)` at `:1247` and
    `:1454`, with the `typeof PINNED` cast at `:1250`;
  - the literal refs are `:686`'s `'actions/cache@v4'`, `:1271`'s `'actions/checkout@v4'` and `'actions/setup-node@v4'`,
    and `:545`'s `# v4.2.2`.

  The rules:
  - (a) the form `owner/repo@<40 hex> # vX.Y.Z`, over every workflow file. It replaces the form test at `:1236-1253`,
    which reads only `release.yml`, `screening-capacity.yml` and `ci.yml`, so it also covers `approval-of-record.yml`,
    `large-zip.yml`, `publish-content.yml` and `release-dry-run.yml`;
  - (b) one SHA and one version per action across files;
  - (c) behaviour asserts match by the action's name, the part before `@`, through the helper that already exists,
    `usesAction(step, action)` (`:181`), which 14 sites use today (`:764, 828, 855, 857, 991, 997, 1078, 1097, 1126,
    1143, 1165, 1176, 1217, 1220`). The 26 `PINNED` uses move to it, `mutation.yml`'s every-step check (`:1453-1460`)
    and its Node lookup (`:1445`) included. It keeps `:686`'s check alive. Today `:686` asserts that no capacity step
    uses exactly `'actions/cache@v4'`, which no SHA pin equals, and an `actions/cache@<sha>` in screening-capacity.yml
    is caught only by the set check at `:1247-1250`, since `actions/cache` is not in `PINNED`. Rules (a) and (b) replace
    that set check with the form test, so by name `:686` must fail on any `actions/cache` step;
  - (d) the **simulated Dependabot rewrite** (A4a). A unit test copies `.github/`, both Dockerfiles and
    `docker-compose.yml` into a temporary directory, with every pin replaced by another well-formed one (a new 40-hex
    SHA and a higher `# vX.Y.Z`) and every image digest by another. It then spawns vitest, as `collection.test.ts`
    does (`:37-46`), on `workflows.test.ts` and `dependabot-config.test.ts`, with `CI_TREE` set to that directory, and
    the run must pass. Every read of those files in the two test files goes through one root: `CI_TREE` when set, the
    repository otherwise. The rewrite test skips itself when `CI_TREE` is set, so it never recurses. A second copy
    with one deliberate break (one checkout's `persist-credentials` removed), run with `-t` on that one test, must
    fail: that proves the spawned run reads the rewritten files. #40's red `unit` (above) is the same rewrite failing
    on the literal pins.
- **`tools/check-action-pins`** (new; root script `pnpm actions:check`; runs in `static`). Offline, on every run, over
  every workflow: rules (a) and (b) above, read from the files. Networked, for each pin it verifies, three things:
  - `git ls-remote https://github.com/<owner>/<repo> refs/tags/vX.Y.Z refs/tags/vX.Y.Z^{}` gives the pinned SHA;
  - every `with:` key used is an input declared in `action.yml`/`action.yaml` at that SHA (raw.githubusercontent.com),
    and every required input with no default is given;
  - when the action is `runs.using: composite`, every `uses:` among its steps is a full 40-hex SHA, and the check
    recurses into each at that SHA. A nested tag or branch ref fails, naming the chain.

  **Which pins go to the network (§3.2.7, S4).** An `action.yml` at a given SHA never changes, and a moved tag cannot
  change what a SHA pin runs. So the network is read only for a pin that is new against the base (an `owner/repo@sha`
  the base tree does not use), and for a pin used by a step whose `with:` changed. Those fail closed after three tries
  with backoff, naming the host. Every pin is verified when the base has no `tools/check-action-pins` (ci-deps' own
  pull request) or when the change touches `tools/check-action-pins/**`. The base is the range step's
  (`ci.yml:54-74`), reduced with `git merge-base <base> HEAD` as the engine freeze does (`:110`), and the base tree's
  pins are read with `git show <base>:<file>` (`static` checks out the whole history). On push runs it also re-reads
  every unchanged pin's tag, and a moved tag or a failed read there is a `::warning::` naming the action, never a
  failure, so an upstream re-tag or a rate limit cannot turn both lanes red. A lane PR that touches no pin reads
  nothing from the network. No facts are committed per SHA: Dependabot's actions PRs rewrite only `uses:` lines, so a
  committed file would be stale on every one of them and make it red (A4 c).

  **The release's nested caches (§3.2.7, S3).** For every action `release.yml` uses, the check follows each nested
  `actions/cache*` use (recursively) to the top-level input that gates it, through `with:` bindings of the form
  `${{ inputs.<name> }}`. That input must be set to `false` in release.yml's step. A nested cache whose `if:` does not
  reduce to `inputs.<name> == 'true'` (ungated, or a form the check cannot read) fails, naming the chain. Today:
  trivy-action's `cache` gates its own `actions/cache` (`action.yaml:139-142`) and, through `cache: ${{ inputs.cache }}`
  (`:129-133`), setup-trivy's restore and save (`if: inputs.cache == 'true' && …`). A bump that adds an ungated cache
  fails on its own pull request, which A4 (c) counts as a real incompatibility.

  Read at the pinned commits on 2026-10-25, the nested refs are all SHAs: trivy-action v0.36.0 pins
  `aquasecurity/setup-trivy@3fb12ec…` (v0.2.6) and `actions/cache@27d5ce7…` (v5.0.5) (`action.yaml:129, 142`);
  setup-trivy pins `actions/cache/restore@9255dc7…` (`action.yaml:56`), `actions/checkout@8e8c483…` (`:66`) and
  `actions/cache/save@9255dc7…` (`:100`); attest-build-provenance v4.2.2 pins `actions/attest@508db95…`, a node action.

  Its unit tests use recorded synthetic `ls-remote` lines and action files: a composite with a nested tag ref fails; a
  nested cache gated through a binding is reported, and an ungated one fails; an unchanged pin makes no network read; a
  moved tag on an unchanged pin warns on a push run; three failed reads of a new pin fail. The input check reaches the
  actions only a tag runs (`release.yml`'s login), and `release-dry-run.yml` (below) runs them: risk R1 of [S4],
  closed.
- **`release.yml` restores no cache.** F1 (a) is ruled, so this is no longer a hedge. `release.yml` is unchanged since
  49514e8, and its cites hold:
  - Its capacity job restores the pnpm store (`release.yml:153-156`, `setup-node … cache: pnpm`) and the scale release
    (`:159-168`, `actions/cache/restore` of `screening-scale-release-<hash>`). Its `trivy-action` steps (`:75-91`) set
    no `cache` input, so they default to `cache: 'true'`, which restores the Trivy binary (through setup-trivy's
    `actions/cache/restore`) and its database (`actions/cache`, restore key `cache-trivy-`) (trivy-action v0.36.0
    `action.yaml:102-146`, read at its pinned SHA).
  - A tag run may restore caches created on the default branch ("Workflow runs can restore caches created in either the
    current branch or the default branch", github/docs `content/actions/reference/workflows-and-actions/dependency-caching.md`,
    "Restrictions for accessing a cache"). Today the default branch is `main` (`gh api repos/PureTideWater/PhysicalTherapy`
    `--jq .default_branch`, 2026-10-25), which runs no workflow, so nothing is restored. When ci-deps merges, F1 (a)
    makes the build branch the default, and its push runs seed all of these: `ci.yml`'s header says so (`:5-6`),
    `screening-capacity.yml:29-30` is a push trigger, and its save at `:192-197` has no event condition.
  - The binding, attested measurement (decision 13) could then run on a scale release built in another run. Its key
    hashes only `packages/synth/src/release/**`, `tools/release/scale.ts`, `packages/rules/src/**` and release
    900001's directory, not the lockfile or the generator's other imports, so a hit can serve a release built by
    different code. The scanner binary and its database would come from another run too.
  - So in ci-deps:
    - the restore step goes, and the scale release is always built in-run (22 s on a miss: the push run 39977565861's
      "Build the scale release", 15:24:36-15:24:58);
    - `setup-node` takes no `cache` and sets `package-manager-cache: false`; `pnpm/action-setup` keeps `cache: false`
      (its v6.1.0 default);
    - both `trivy-action` steps take the two lines `ci.yml`'s `images` job already has (`:493-494`): `cache: false`, and
      a `cache-dir` under `runner.temp`, outside the checkout;
    - `setup-buildx-action` sets `cache-binary: false` (default `true` in v4.4.1), and no `build-push-action` step gets
      `cache-from` or `cache-to`.
  - A `workflows.test.ts` rule holds release.yml to it, offline and by named inputs: no `actions/cache*` step; no
    setup-node `cache`, and `package-manager-cache: false`; `cache-binary: false` on setup-buildx; no build-push
    `cache-from` or `cache-to`; and `cache: false` on every trivy-action step. What the actions nest is
    `check-action-pins`' to check, since only it reads the actions' files (above). The attested report then depends
    only on its own run. ADR 0062 records it (Part 2 of ADR 0066 gives the reason).
  - **Its uploads overwrite (§3.2.7, S2).** release.yml's three uploads (`:92-96` the bill of materials, `:110-118` the
    image, `:188-198` the capacity report) gain `overwrite: true`. Upload-artifact v4 and later names are unique per
    run and immutable, so a re-run of a tag's failed job conflicts on the name its first attempt left; ADR 0066:96-97
    found the same for ci.yml, whose per-run uploads already set it. The image and its `.id` file stay one artifact,
    so the push job's identity check still compares an image with its own scan.
- **`.github/workflows/release-dry-run.yml`** (new). Only a tag runs `release.yml`, and only the founder creates tags,
  so its new majors (upload-artifact v7, download-artifact v8, login-action v4, build-push-action v7, setup-buildx v4)
  would otherwise first run on the founder's tag. No tag exists yet (`gh api repos/PureTideWater/PhysicalTherapy/tags`:
  0), so release.yml has never run at all. Input validation does not prove runtime behaviour.
  - Triggers: `pull_request` and `push` on `claude/build-platform`, with paths `.github/workflows/release.yml`,
    `.github/workflows/release-dry-run.yml`, `tools/screening-capacity/image-id.ts` (ci-browser) and both Dockerfiles.
    It is advisory: not one of F7's four required checks, so its path filter can never leave a required check pending.
    Its job names (`build`, `push`) collide with none of them (`workflows.test.ts:1661-1680`).
  - `build` job (`contents: read`): checkout; setup-buildx; build the `web` image with `load: true`; `docker save | gzip`;
    record the image's identity as release.yml then does (in ci-deps the `.Id`; from ci-browser on, the tarball's
    SHA-256 and the config digest, §3.3.1); upload `image-web` (v7, `overwrite: true`, retention 1 day).
  - `push` job (needs build; `contents: read`, `packages: read`): download with `pattern: image-*` and
    `merge-multiple: true` (v8); the same identity check as release.yml's push job; `docker load`;
    `docker/login-action` to ghcr.io with the job's `GITHUB_TOKEN`. It never tags, pushes or attests, and holds no
    `packages: write`, `id-token` or `attestations` permission.
  - Timeouts in CI-10's table: `build` 20 and `push` 10, each about three times its expected time. The existing rules
    already cover the new file with no edit: the runner (`:349-360`), the concurrency group's workflow prefix
    (`:1537-1543`) and continue-on-error (`:1629-1645`).
  - A `workflows.test.ts` rule holds every step the dry run shares with release.yml (the same action, or the same `run`
    text with only the image list and the push lines removed) equal in `uses:` and in the set of `with:` keys, so the
    dry run cannot drift from what the tag runs. Values are compared only for `overwrite` (`true` in both) and the cache
    inputs above; `name`, `path` and `retention-days` may differ, since the dry run builds one image and keeps it a day.
- **Images by digest, from one source each:**
  - Both Dockerfiles (web `:7, :17`, worker `:5, :12`):
    `FROM node:24-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea`, the index digest,
    unchanged since 2026-10-24 (Node 24.22.1, pushed 2026-10-21T17:39Z). That leaves Debian 12 bookworm, which is what
    `24-slim` is today (`sha256:55fb5f5a…`, the same digest as `24-bookworm-slim`).
  - `docker-compose.yml:8`:
    `postgres:18-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6` (pushed
    2026-10-21T19:08Z). Today's `postgres:18` already resolves to that index (it is `18.6-trixie` and `18.6`), so the pin
    changes no bits for CI or the capacity harness; only the node images change Debian release (N7).
  - Reading a digest through the session's proxy (both work, checked 2026-10-25 ~23:00 UTC):
    - the Hub API, `curl -sS https://hub.docker.com/v2/repositories/library/<name>/tags/<tag>`, field `digest`;
    - the registry: a token from `https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/<name>:pull`,
      then `curl -sSI` with that bearer token and the OCI index and Docker manifest-list `Accept` types on
      `https://registry-1.docker.io/v2/library/<name>/manifests/<tag>`, header `docker-content-digest`.
- **Postgres from the compose file, decided on the evidence of 2026-10-25.**
  - Today there are four `services:` blocks, each with ci-speed's TCP health options: `ci.yml`'s db (`:238-247`),
    domain-model (`:322-331`) and e2e (`:402-411`), and `large-zip.yml:20-28`. That is 7 job instances on a public
    `ci.yml` run (db 4, domain model 1, e2e 2) and 10 on a private one, plus the weekly large-zip run.
  - Measured on three push runs (40201435875, 40223130551, 40229005858, `gh api …/runs/<id>/jobs`):
    - "Initialize containers" takes 8 to 18 s in every Postgres job. It runs before checkout, on the job's own path;
    - after checkout, action-setup, setup-node and install take 7 to 14 s;
    - in db and e2e, the browser restore (3-5 s) and Playwright's install (12-22 s) follow, before anything needs the
      database.
  - **Decision: compose, as planned in 2026-10-24's text.**
    - One digest-pinned reference, which Dependabot's docker-compose ecosystem updates and which CI and the capacity
      harness follow by construction. `services:` cannot read an image from a file. Four digest copies in workflows
      would drift, since Dependabot's github-actions ecosystem rewrites `uses:` only, and an equality test across them
      goes red on every compose bump ([S4] §6). A job output feeding `services:` adds a job to the critical path. A
      tag-only `services:` image fails CI-13.
    - It is also faster: about 10-15 s off each Postgres job, since the pull overlaps setup. That is about 1 to 1.5
      runner-minutes a run, and 9 to 18 s off the `build` → `e2e` path that sets `all green`'s time.
  - **How, in order:**
    1. **The healthcheck on TCP, first.** `docker-compose.yml:16` runs `pg_isready -U postgres`, on the Unix socket.
       The image's first-run setup serves that socket before the server listens on TCP (ci-speed's finding,
       `ci.yml:243-244`, `workflows.test.ts:1613`), so a wait on that health could pass early. It becomes
       `pg_isready -h localhost -U postgres`, the form ci-speed's services proved on CI (`ci.yml:246`). `pnpm dev`'s
       `docker compose up --wait` gains the same fix.
    2. **One script, `tools/ci/postgres.sh`, instead of four copies of the steps.** It runs under
       `set -euo pipefail` (§3.2.7, N11):
       - `up`, the step right after checkout, starts a background subshell and returns at once. The subshell runs
         `docker compose up --detach --wait --wait-timeout 120 postgres` with all three standard streams redirected
         (stdin from `/dev/null`, stdout and stderr to `$RUNNER_TEMP/postgres-up.log`), so the step never waits on an
         open pipe. With `set +e` inside, it then writes compose's exit status to `$RUNNER_TEMP/postgres-up.status`
         (to a temporary name, then `mv`), so a failure is recorded too. `--wait` returns only once the service is
         healthy, and `--detach` alone still pulls first, so the background start overlaps setup and install;
       - `wait`, just before the first step that reads `DATABASE_URL`, polls for that status file once a second for up
         to 130 s. Status 0 passes. Any other status fails at once, printing the log. No file by then prints the log
         and fails. It reads compose's own verdict, so it never calls `docker inspect` on a container id that is
         empty while the image still pulls, and it never issues a second `up`, which could race the first;
       - used by `ci.yml`'s db, domain-model and e2e jobs and by `large-zip.yml`. A script, not a local composite
         action, keeps F3's SHA rule and `check-action-pins` simple. A unit test runs `up` and `wait` with a stub
         `docker` on `PATH` (healthy; failing at once; never finishing, with the 130 s shortened by a variable).
    3. **"Quiet the database's log" moves after the browser install** (db `:259-260`, e2e `:421-422`), with `wait`
       just before it. The pull and start then overlap the install, the browser restore and Playwright's install.
    4. **The database's log on failure.** GitHub printed a service container's log after the job (`ci.yml:257-258`);
       compose prints nothing. A last step with `if: failure()` runs
       `docker compose logs --no-color --tail=200 postgres`. The quiet step stays, so that tail shows the failure, not
       the tests' deliberate refusals.
    5. `DATABASE_URL` is unchanged (`postgres://postgres:test@localhost:5432/postgres`): compose publishes 5432 with the
       password `test` (`docker-compose.yml:9-12`).
    6. `tools/screening-capacity/containers.ts:223, 344, 509` and `measure.test.ts:181` read the image from the compose
       file through one tested function. `WATCHED_FIXED` (`tools/screening-capacity/watched.ts:62-80`) gains
       `docker-compose.yml`, so a compose digest bump runs the capacity measurement; today the file is not a watched
       path. `watched-paths.txt` is regenerated with `pnpm exec tsx tools/screening-capacity/watched.ts --write`.
       `screening-capacity.yml`'s push paths (`:31-44`) gain `docker-compose.yml` too, and so does `workflows.test.ts`'s
       `pushPaths` (`:612-627`), which holds that list exactly: `watched.test.ts:82-91` requires every watched line to
       fall inside those push paths, so without it the regenerated list fails ci-speed's test (§3.2.7, S1). A merged
       compose bump then measures on push as well.
- **MinIO removed, not replaced.**
  - `minio/minio` no longer exists on Docker Hub (`hub.docker.com/v2/repositories/minio/minio/` returns "object not
    found", checked 2026-10-24), so `pnpm dev`'s `docker compose up --wait` fails on a fresh machine.
  - Nothing connects to it. The dev and e2e document store is local (`apps/web/src/lib/server/config.ts:242-252`), and
    no S3 endpoint override exists in `apps/`, `packages/` or `tools/` (grep for `endpoint`/`forcePathStyle`/`S3_ENDPOINT`).
  - A replacement (RustFS, SeaweedFS) would be a maintained dependency that nothing exercises. Testing the S3 path
    (presigned PUT, Object Lock COMPLIANCE, multipart) belongs on AWS staging, in infrastructure PR (b) or (c), where the
    real bucket policy and KMS live (open item O4).
  - Wording follows in `docker-compose.yml:1-3`, `tools/dev.ts:11, 22`, `README.md:37` (and `:11-15`, which also name
    pnpm 10.28 and "CI's `postgres:18` service"), `CLAUDE.md:31`, `PRD.md:645`, the `infra/lib/environments.ts:4`
    comment and `docs/product/diagrams/architecture.svg:1`. That is every MinIO line outside the lockfile
    (`git grep -n -i minio -- ':!pnpm-lock.yaml'`, 6ddd587). One more stale service wording, not MinIO's:
    `apps/worker/src/platform/restore-drill.db.test.ts:75`, "a CI runner against the postgres:18 service", becomes
    "against the compose file's PostgreSQL 18".
  - README.md:11-12 then names no version: pnpm "at the version `package.json`'s `packageManager` names
    (`corepack enable` installs it)", so it cannot go stale (A4 b; §3.2.7, N13).
- **pnpm 10.34.8:**
  - It fixes all 23 of 10.28.0's advisories (11 high, 12 moderate). The highest fixed-in bound among them is `<10.34.5`
    (GHSA-vq4v-j7r6-jq4m, GHSA-c59q-g84q-2gj5, GHSA-vx52-2968-3vc6), and 10.34.8 has none (npm bulk advisory endpoint,
    2026-10-25). It writes `libc:` fields on a fresh resolution ([S3] M2), but **not** into existing lockfile entries on
    a plain `install --lockfile-only`.
  - **10.34.8, not 10.34.9.** `latest-10` moved to 10.34.9 on 2026-10-25T17:54:00Z. Its one change (0bff20d, #17344)
    records the pin when pnpm 10 switches to a pnpm 11 or 12 target, which a 10.x `packageManager` never does
    (`pnpm/src/switchCliVersion.ts` at v10.34.9). 10.34.8 is the version the licence diff was measured on, and it is
    three days old from 2026-10-26T18:06:38Z; 10.34.9 only from 2026-10-28T17:54Z.
  - **A person moves `packageManager`; Dependabot never does** (§3.2.7, S6). dependabot-core parses only
    `dependencies`, `devDependencies` and `optionalDependencies` (`npm_and_yarn/.../file_parser.rb:32` at 7c06280), and
    reads `packageManager` only to choose the pnpm it runs (`package_manager.rb:54, :296-320`); nothing in
    `npm_and_yarn/lib` writes it. So `check-toolchain` warns, never fails, when a newer 10.x is at least three days old,
    and `dependency-upgrades.md` gives the bump, its cadence and the outage remedy (below).
  - **Why 10, not 12.15.0** (`npm view pnpm dist-tags`, 2026-10-25: latest 12.15.0, latest-11 11.28.8):
    - GitHub's support table still lists pnpm "v7, v8, v9, v10" (github/docs
      `data/reusables/dependabot/supported-package-managers.md:44`, read 2026-10-25). A lockfile from 11 or 12 would
      rest on support GitHub does not state.
    - dependabot-core already handles 11 and 12 in code (`pnpm_package_manager.rb`'s `SUPPORTED_VERSIONS`; "Beta support
      of PNPM 11", 8ac9b21a, 2026-07-28; "add pnpm 12 support", 493da6c4, 2026-09-15), and its updater image runs pnpm
      12.10.1 (run 40223237798 logs "Installed version of pnpm: 12.10.1", then `corepack install pnpm@10.28.0`).
    - ADR 0066 and `dependency-upgrades.md` record the reason, that code-level support, and the trigger for moving:
      GitHub listing pnpm 11 or later in that table.
  - `packageManager` moves to it. Both Dockerfiles derive their pnpm from it after `COPY package.json`, in place of
    `npm install --global pnpm@10.28.0` (web `:11`, worker `:6`).
  - **The licence fix is its own first commit, alone:** `packageManager` set to `pnpm@10.34.8`, then
    `pnpm install --lockfile-only --fix-lockfile` under 10.34.8. Measured at 49514e8 (`scratchpad/reviser-tools/`):
    - the lockfile holds no `libc:` field. The "3 `libc:` lines" of the 2026-10-24 text were the three `detect-libc:`
      dependency lines (`pnpm-lock.yaml:6147, 6163, 6498` at 6ddd587). Fields are counted with
      `grep -c '^ *libc: \['`, which gives 0 at 6ddd587;
    - a plain `install --lockfile-only` gives no diff, and `@img/sharp-libvips-linuxmusl-x64@1.3.4` still has no `libc`;
    - `--fix-lockfile` adds 43 `libc:` fields and nothing else (`git diff --numstat`: `43 0`), each `libc: [glibc]` (27)
      or `libc: [musl]` (16) (`fix-lockfile.diff`, matching [R]'s);
    - `pnpm licenses list --prod --json` under 10.34.8 then lists no `linuxmusl` package. It listed
      `@img/sharp-libvips-linuxmusl-x64` before (`lic-orig.json`, `lic-fixed.json`).

    43 is expected at the cut. Since 49514e8 the lockfile changed only by Stryker 10.0.0 → 10.1.1, the removed patch and
    the canary's workspace link, and none of those entries carries `os`, `cpu` or `libc`. The builder re-measures on
    the commit's own parent and does not assume it. The commit's lockfile diff must be exactly those fields, and the PR
    description carries `git diff --numstat <first>^ <first> -- pnpm-lock.yaml` and both counts, taken at `<first>^`
    and `<first>`. The commit's own diff still holds after the build branch is merged in, where a diff from the moving
    merge base would not (§3.2.7, S5). The version bumps come in later commits, each with its own lockfile diff.
  - The `@img/sharp-libvips-linuxmusl-x64` exception (`tools/check-licenses/allowlist.json:9-13`) is removed in the same
    first commit.
  - A new `check.test.ts` case requires every lockfile entry whose name marks musl (`linuxmusl`, or a `-musl` suffix:
    the 16 above, sharp's, `@next/swc`'s, lightningcss's, rolldown's, tailwind oxide's and `@napi-rs/canvas`'s) to carry
    `libc: [musl]`. Its message names the cause (an entry written before pnpm wrote libc fields) and the remedy
    (`pnpm install --lockfile-only --fix-lockfile`).
- **npm versions taken.** Each was published more than three days before the bump commits, which are made after
  2026-10-26T19:18:50Z (below), so `minimumReleaseAge: 4320` resolves every one with no exclude (`npm view <pkg> time`,
  2026-10-25):

  | Package (where) | Locked at 6ddd587 | Target | Published (UTC) | Three days old from |
  |---|---|---|---|---|
  | vitest (catalog, root) and @vitest/coverage-v8 (root) | 5.0.4 | 5.0.5 | 2026-10-15 14:29 and 14:27 | 2026-10-18 |
  | eslint (root, tools; to the catalog) | 10.12.0 | 10.13.0 | 2026-10-16 14:24 | 2026-10-19 |
  | typescript-eslint (root, tools; to the catalog) | 8.71.2 | 8.72.0 | 2026-10-19 17:08 | 2026-10-22 |
  | postcss (apps/web) | 8.5.30 | 8.5.31 | 2026-10-18 19:39 | 2026-10-21 |
  | next (apps/web) and @next/eslint-plugin-next (root) | 16.4.1 | 16.4.3 | 2026-10-23 13:40:24 and 13:28:29 | 2026-10-26 13:40 |
  | fast-uri (through ajv), by lockfile refresh | 3.1.8 | 3.1.9 | 2026-10-19 23:05 | 2026-10-22 |
  | qs (through typed-rest-client), by override | 6.15.1 | 6.16.1 | 2026-10-14 22:06 | 2026-10-17 |
  | pnpm (`packageManager`) | 10.28.0 | 10.34.8 | 2026-10-23 18:06:37 | 2026-10-26 18:06:38 |

  - **typescript-eslint 8.72.0 is added.** It is lint tooling in lockstep with eslint 10.13.0, #38's refresh tried it,
    and its peer range is `eslint ^8.57 || ^9 || ^10`. The other peers hold: coverage-v8 5.0.5 needs vitest 5.0.5
    exactly; vitest-runner 10.1.1 needs vitest `>=2.0.0`; next 16.4.3 needs react `^18.2 || ^19` and
    `@playwright/test ^1.51.1` (`npm view <pkg>@<ver> peerDependencies`).
  - **qs needs an override, not a refresh.** `@stryker-mutator/core` 10.1.1 depends on `typed-rest-client ~2.3.0`, and
    typed-rest-client 2.3.1 pins `qs` to exactly 6.15.1 (3.1.2 depends on `qs ^6.16.0`). So `pnpm-workspace.yaml` gains
    `overrides: { "typed-rest-client@2>qs": "6.16.1" }` (pnpm 10 reads `overrides` there). That closes qs's three
    moderate advisories (GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g, GHSA-q8mj-m7cp-5q26, fixed in 6.16.0).
    `check-toolchain` keeps each override with its reason and removal trigger (Stryker on typed-rest-client 3, or on
    qs 6.16.0 or later), and fails an override whose target is no longer in the lockfile. fast-uri 3.1.9 comes by
    refresh. Both are development-only (`pnpm why`), so `pnpm audit --prod` and `--audit-level=high` pass today.
  - **One line per shared tool.** `tools/package.json:36, 38` repeats root's `eslint` and `typescript-eslint` ranges
    (`package.json:47, 53`), and root's devDependencies repeat five catalog entries as literal ranges (`@types/node`,
    `fast-check`, `tsx`, `typescript`, `vitest`; `package.json:39-55` against `pnpm-workspace.yaml:11-25`). eslint and
    typescript-eslint join the catalog, and every manifest names all seven as `catalog:`. Dependabot updates catalog
    entries (#38 changed `pnpm-workspace.yaml`'s vitest line), so its PRs keep one line per tool, and
    `no-duplicated-versions.test.ts` holds it (§3.2.3).
  - Not taken:
    - Playwright and axe go to ci-browser.
    - The Anthropic SDK goes to its own group and a deliberate PR that passes the evaluation gate (N8).
    - TypeScript 7.0.2: typescript-eslint 8.72.0 declares `typescript >=4.8.4 <6.1.0`.
    - @types/node 26 and the Node 26 images wait for a planned Node 26 PR (N8): Node 26 is LTS from 2026-10-28
      (nodejs/Release `schedule.json`).
    - #33 now proposes `node:26-slim` (head bc82651, rebased 2026-10-25 14:18 UTC); before that it proposed Node 25, end
      of life since 2026-06-01. ci-deps rewrites both Dockerfiles' `FROM` lines to the trixie digest, so #33's diff no
      longer applies, and the node semver-major ignore stops its kind of PR.
    - stripe 23.0.1, aws-cdk 2.1146.1 with aws-cdk-lib 2.274.0, and @aws-sdk/* 3.1156.0 come through their Dependabot
      groups after the merge.
- **Audit and toolchain:**
  - `pnpm audit --prod` stays, and `pnpm audit --audit-level=high` is added, both in `static`.
  - `tools/check-toolchain` (new; root script `pnpm toolchain:check`; networked; in `static`, which checks out the whole
    history). Its base is the range step's (`ci.yml:54-74`), reduced with `git merge-base <base> HEAD`, the same as
    `check-action-pins`', so a pull request into any base, the launch pull request included, is measured against its own
    base (§3.2.7, N12):
    - it checks `packageManager`'s pnpm against the bulk advisory endpoint (moderate or worse fails);
    - it warns, never fails, when a newer 10.x than `packageManager`'s is at least three days old (npm's `time` for
      pnpm), naming it, since Dependabot never moves `packageManager` (above);
    - under CQ3's recommended answer, it fails when `packageManager`'s pnpm is under three days old, unless that exact
      version has a live entry in both exclude lists below, as any locked version would need. action-setup switches to
      that pnpm with `pnpm self-update` in its own directory, where the workspace's release age never applies (above);
    - it checks that neither Dockerfile carries a pnpm literal;
    - it keeps the audit exceptions in `tools/check-toolchain/audit-exceptions.json` (`ghsa`, reason, added, expires),
      equal to `pnpm-workspace.yaml`'s `auditConfig.ignoreGhsas`. An entry older than 30 days fails. The list is empty
      today;
    - **the lockfile's release age (new).** Every `packages:` key the lockfile adds against that base must have a
      registry `time[version]` at least `minimumReleaseAge` old, or be listed in `minimumReleaseAgeExclude` with a live
      entry in `release-age-exceptions.json`. The message names the version, its publish time and the remedy. Why it is needed:
      pnpm 10.34.8's frozen install never checks release age (an up-to-date lockfile skips resolution,
      `dist/pnpm.cjs:175478`; the age filter lives only in resolution, `:66130-66139, :66217-66225`), and Dependabot's
      security updates pass `--config.minimum-release-age=0` (dependabot-core `pnpm_lockfile_updater.rb:540-556`).
      Without this rule, F2 (b) would hold only re-resolutions;
    - it keeps the release-age excludes: `release-age-exceptions.json` holds each with its advisory, reason, the date
      added and an expiry, equal to `minimumReleaseAgeExclude`. Each entry is one exact version, `name@x.y.z` (the form
      pnpm accepts since 10.19.0). pnpm also accepts a bare name, a `*` pattern and a `||` union
      (`dist/pnpm.cjs:141938-142001`), which `check-toolchain` refuses, so each entry has one expiry. It fails when the
      two lists differ. **Expiry (§3.2.7, S7):** an entry the change adds must have publish time + 3 days ≤ expiry ≤
      added + 7 days, so it covers the version's whole young window and never outlives F2 (b)'s seven days. Once the
      version is three days old the exclude changes no resolution, so an expired entry fails only a pull request that
      edits either exclude list (the person is already there) and is a `::warning::` everywhere else: push runs, which
      follow a green pull request, and every other pull request, Dependabot's npm ones included, which always touch the
      lockfile (A4 c). The weekly triage removes expired entries (`dependency-upgrades.md`);
    - it keeps the trust excludes: `trust-exceptions.json` (package, reason, added; no expiry, since each is a fixed old
      version), equal to `trustPolicyExclude`, each entry still resolved in the lockfile (CQ2);
    - it keeps the overrides, each with its entry (above);
    - every networked read fails closed after three tries with backoff, naming the host.
  - `pnpm-workspace.yaml` adds:
    - `minimumReleaseAge: 4320`, three days (F2 (b), ruled), and `minimumReleaseAgeExclude: []`;
    - `trustPolicy: no-downgrade`, and `trustPolicyExclude: ['semver@6.3.1']` (CQ2's recommended answer). Under
      no-downgrade (`dist/pnpm.cjs:67150-67240`) a version fails when an earlier non-prerelease version had stronger
      evidence (trusted publisher over provenance over none). Applied to all 614 locked versions and every target, one
      fails: semver 6.3.1 (2023-07-10, no provenance), published after 7.5.1 (2023-05-12, with provenance). It is
      reached through next > styled-jsx > @babel/core and through eslint-plugin-react-hooks > @babel/core, and the next
      bump re-resolves that subtree, so without the exclude the gate stops the bump;
    - the qs override (above).
  - **What the release age does under pnpm 10.34.8** (O3, answered from pnpm's source and Dependabot run 40223237798's
    log, 2026-10-25):
    - a frozen install never checks it (above), so CI installs a young locked version without complaint.
      `check-toolchain`'s lockfile rule covers that;
    - any re-resolution re-checks every direct dependency, not only the one changed. Run 40223237798 (on de8f9b5) failed
      every update with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` on the locked `@stryker-mutator/api` 10.1.1, then 47 hours
      old. A young version merged into the lockfile so stops every Dependabot npm run, and every person's
      re-resolution, until it is three days old. That is what closed #38;
    - the CLI flag `--config.minimum-release-age=N` replaces the minutes and keeps the workspace's excludes. Dependabot
      passes its own gate only when it is longer than the repository's (`helpers.rb:144-148`), from two places (§3.2.7,
      B1): the update checker's peer probe, `pnpm update <dep>@<ver> --lockfile-only`, passes the version's own
      semver-specific cooldown, uncapped (`update_checker/version_resolver.rb:894-905, :912-924`), and a release-age
      failure there makes Dependabot skip that version and try older ones (`:185-190, :288-296`); the file updater passes
      the smallest per-dependency `min(semver days, default-days)` (`file_updater.rb:475-514`). CQ1 turns on this;
    - pnpm 10 has no strict toggle: `minimumReleaseAgeStrict` and `trustLockfile` arrive in pnpm 11 (P3).

    So a security fix younger than three days can enter a pull request, since Dependabot's security update resolves it
    with the gate off, and `check-toolchain` holds that pull request red until a person adds the dated exclude. That is
    F2 (b)'s ruled trade-off, enforced where the version lands. The builder confirms O3 live (§3.2.5 step 5).
  - **Commit order.**
    1. The licence fix, alone (above).
    2. `minimumReleaseAge`, `minimumReleaseAgeExclude: []`, `trustPolicy` and `trustPolicyExclude`.
    3. Then the bump commits, the qs override among them, each made after 2026-10-26T19:18:50Z. That is when the last
       young locked version is three days old: the five Stryker 10.1.1 packages, published 2026-10-23T19:17:52Z to
       19:18:49.904Z, are the only locked versions under three days old (all 614 checked). Every resolution in the PR
       then runs under the gates Dependabot uses, and one that would break Dependabot breaks the builder first. Before
       that instant pnpm refuses any re-resolution anyway, because of the locked Stryker. After the gates' commit, only
       commits that change `pnpm-lock.yaml` or a resolution setting (a manifest's dependency ranges,
       `pnpm-workspace.yaml`'s catalog or overrides) wait for it. The pins (login v4.7.0's after 2026-10-26T15:11Z, above), compose, the checks,
       the tests and the documents resolve nothing and do not wait (§3.2.7, S18).
  - **Dependabot after the merge.** Under F1 (a) Dependabot reads this configuration from the build branch as soon as
    the founder switches the default branch. A configuration change has started immediate runs before (2026-10-18 02:41,
    10-20 22:24, 10-22 05:53 and 10-25 18:51 UTC), so the new groups open at once, on ci-deps' versions. An npm run that
    starts after 2026-10-26T19:18:50Z passes the gate. One before it fails as #38's did and opens nothing
    (`lanes/lane-b.md:43`'s "about 19:50 UTC" is 30 minutes late).
- **`.github/dependabot.yml`:**
  - The config from [S4] §7, with the changes of 2026-10-25 marked:
    - **days (changed):** github-actions weekly on Tuesday at 04:37 UTC, the `container-images` group on Wednesday at
      04:43, and npm on **Thursday** at 04:31 (it was Monday). Under F1 (a) the three weekly runs start at the switch,
      all on Monday: mutation at 05:23 (every package, `mutation.yml:26`), large-zip at 06:17 (up to 45 minutes,
      `large-zip.yml:10`) and screening-capacity at 06:41 (`screening-capacity.yml:25`). Thursday keeps the week's
      largest batch off that morning, at no cost to freshness;
    - npm with an 8-PR limit;
    - **cooldown (changed):** github-actions, docker and docker-compose take `default-days: 7`, the only cooldown key
      those ecosystems support (github/docs `dependabot-options-reference.md:230-288`). npm takes CQ1's answer:
      recommended `default-days: 3` alone, equal to `minimumReleaseAge`, so neither the peer probe nor the file updater
      ever passes a longer gate to pnpm; under CQ1 (b), 2026-10-24's 7 by default, 14 for majors, 7 for minors and 3 for
      patches. Raising only the semver-specific days over a default of 3 would not help: the probe passes them uncapped
      (§3.2.7, B1). GitHub applies a three-day cooldown when none is set (same page, `:191-196`), most likely why #40
      offers login v4.6.0;
    - semver-major ignored for `@types/node`, `typescript`, `next`, `@next/eslint-plugin-next` and `pg-boss`;
    - groups in this order: `browser-tests` (`@playwright/test`, `playwright`, `playwright-core`,
      `@axe-core/playwright`, `axe-core`), `anthropic-sdk`, `pg-boss`, `next`, `aws-sdk`, `aws-cdk`, `minor-and-patch`,
      and `security` (`applies-to: security-updates`);
    - actions grouped;
    - `docker` (both directories, node majors ignored) and a new `docker-compose` entry (postgres majors ignored) in one
      multi-ecosystem group, `container-images`, with `patterns` on each entry, as the how-to requires
      (github/docs `configuring-multi-ecosystem-updates.md`, "Troubleshooting").
  - No `target-branch` lines: under F1 (a) the build branch is the default branch until launch (§3.2.4 is not taken).
    The header (`:1-7`) is rewritten: `ci.yml` costs "about 38 to 39 runner minutes (44 to 45 billed)" (`:4` says about
    45), and Dependabot reads the file from the default branch, `claude/build-platform` until launch (`:6-7` say
    `main`'s copy is in force, which the switch makes false). `origin/main`'s copy (220f2b4) is no longer read after the
    switch, and stays as it is: no pull request goes into `main`.
  - `tools/test/dependabot-config.test.ts` (new) replaces the `describe('dependabot')` block
    (`workflows.test.ts:1486-1511`; its comment's "about 10 minutes" goes with it). It asserts the ignores, the group
    order, one entry per ecosystem in use, a `docker-compose` entry while `docker-compose.yml` exists, three distinct
    schedule days with none on Monday, the cooldowns CQ1's answer sets (under (a), npm `default-days: 3` and no
    semver-specific key anywhere; under (b), semver-specific keys on the npm entry only), the `docker-compose` entry's
    postgres-major ignore, and no `target-branch`.
  - **The weekly batch's load (a plan, not a hope).** GitHub Free runs 20 jobs at once per account (O1), shared by both
    lanes.
    - Measured per pull request, 2026-10-25:
      - `ci.yml`: 38.0 to 39.1 runner-minutes on push runs (44 to 45 billed; 40201435875, 40223130551, 40229005858),
        and 48.3 on #40's pull request run (56 billed; 40223436311). 13 jobs, at most about 11 at once;
      - the capacity job: 12 to 19 minutes on every PR that touches a watched path. Every npm PR edits `pnpm-lock.yaml`
        (`watched-paths.txt:20`), and every actions PR edits `screening-capacity.yml` (`:4`);
      - mutation: about 1 when no money closure moves, or a full run of 31 to 36 runner-minutes (push runs 40223130477
        and 40229005837: 30.9 and 35.9, 36 and 38 billed; #40's run 40223436319: 35.1). [S2] §5's 45-55 was the estimate
        before ci-mutation's shards were measured.
    - Which PRs run mutation in full. `tools/stryker/affected.ts:111-120` makes root `package.json`,
      `pnpm-workspace.yaml` and `mutation.yml` global inputs, and `:108` makes vitest, `@vitest/*`, Stryker, fast-check
      and tsx test tooling. So:
      - ci-deps' own pull request;
      - every actions PR, since it edits `mutation.yml` (#40's ran all six shards);
      - every npm PR that edits the root manifest or the catalog: `minor-and-patch` nearly always, `next` (through
        `@next/eslint-plugin-next`, a root devDependency), and any group that moves a catalog entry;
      - `aws-sdk`, which reaches pricing and packets through the lockfile (§3.4.1).

      Each costs about 95 to 110 runner-minutes (#40's pull request: 99.2 in all, 115 billed). `browser-tests`,
      `anthropic-sdk`, `pg-boss` and `aws-cdk` touch no root manifest and no money closure: about 55 to 65 each.
    - A full Thursday batch of eight groups is then about 550 to 650 runner-minutes. It fills the 20 slots for about 30
      to 35 minutes, and a lane's PR pushed then waits that long for its first jobs.
    - Without §3.4.1's closure rule (the first draft's "the lockfile gives all"), every npm PR would run mutation in
      full, about 100 runner-minutes each and about 800 for an eight-PR batch.
    - Staggering the three ecosystems keeps Tuesday's and Wednesday's batches to one PR each, and Monday to the three
      weekly runs.
    - If the repository goes private: about 10 bot PRs a week at about 80-95 billed minutes each (2-vCPU runners, [S1]
      §9), about 3,500-4,000 billed minutes a month, and about double that without the closure rule. It joins §9's
      cost row for the founder's decision to go private.
    - **Not used: one shared concurrency group for bot runs.** By default a group holds one running and one pending
      run, and a newer pending run cancels the older one (github/docs `data/reusables/actions/actions-group-concurrency.md`),
      so a shared group would cancel most of a batch. `queue: max` lets up to 100 runs wait (same file;
      `data/features/actions-nga.yml` lists `fpt: '*'`). But actionlint, which `workflows.test.ts:1285-1293` runs and
      whose configuration file it forbids (`:355-359`), refuses the key: `unexpected key "queue" for "concurrency"
      section` (measured with the installed 1.7.7), and `parse.go` on actionlint's main branch, past its latest release
      v1.7.12 of 2026-03-30, still accepts only `group` and `cancel-in-progress` (read 2026-10-25). The combination
      with a `cancel-in-progress` expression is also unproven. Open item O13 revisits it when actionlint accepts
      `queue`, if A1′'s bot-queue reading shows lanes waiting more than 15 minutes.
    - `docs/runbooks/ci.md` reports the bot queue time (A1′'s commands on each Dependabot head, and each lane PR's queue
      time during a batch) for the first four weekly batches.
- **`docs/runbooks/dependency-upgrades.md`** (new; [S4] §8's outline). It covers:
  - triage, and never merging a Dependabot PR as it stands;
  - Next minors;
  - Node 24 to 26 on a plan, before Gate 1;
  - **pg-boss, whose minors migrate its schema** (26 at 12.0.0 to 46 at 12.38.0; `apps/worker/src/main.ts:93,110,129`
    migrates at start while `apps/web/src/lib/uploads/queue.ts:36` refuses a mismatch). The procedure has the
    pre-traffic task migrate it, every runtime `PgBoss` set to `migrate: false` and a test enforcing that; the code
    change lands in infrastructure PR (d), before the first staging deploy (O2);
  - Playwright with its baselines;
  - TypeScript 7;
  - the SDK;
  - AWS;
  - pnpm itself, with the trigger for leaving major 10. Dependabot never moves `packageManager` (§3.2.1), so the bump
    is a person's: at the weekly triage, when `check-toolchain` warns that a newer 10.x is at least three days old, a
    one-line `packageManager` pull request (both Dockerfiles derive their pnpm, so nothing else names it), re-running
    `pnpm install --lockfile-only` under the new pnpm (with `--fix-lockfile` if the libc rule names an entry) and
    `pnpm licenses:check`. **The outage it prevents:** an advisory published against the pinned pnpm turns `static`
    red on every pull request of both lanes. The remedy is that same pull request to the first fixed version (with its
    dated exclude if under three days old, under CQ3's answer), merged first; every other pull request then merges the
    build branch in;
  - base images;
  - transitive packages, and an override's removal trigger;
  - the PostgreSQL major;
  - stored ignores (`@dependabot show/unignore`);
  - the release age (F2 (b)): why a young locked version stops every re-resolution, `check-toolchain`'s lockfile rule,
    and the dated exclude for a young security fix (the exact version, its advisory, and an expiry no earlier than
    its publish time + 3 days and no later than 7 days after it is added, in both lists), removed at the weekly triage
    once expired (an expired entry warns; §3.2.1);
  - the trust policy's excludes, and how to add one only for a fixed old version;
  - a `browser-tests` PR, red by design on the `browser.json` check until ADR 0058's procedure runs (A4);
  - **the weekly triage reads Dependabot's own runs** (§3.2.7, S8), since a run that opens no pull request is the
    design's main Dependabot risk (CQ1, the trust policy, #38). Dependabot's runs are Actions runs with
    `event=dynamic`: `gh api 'repos/PureTideWater/PhysicalTherapy/actions/runs?event=dynamic&created=>=<last triage
    date>' --jq '.workflow_runs[] | [.id,.name,.conclusion,.created_at] | @tsv'` (run 40223237798, #38's, reads
    `failure`). Each `failure` is opened and its log read. A version skipped by a release-age block is not a failure:
    the run succeeds and its log says "release-age block detected", which under CQ1 (a) should not occur. The same
    command goes in `docs/runbooks/ci.md`.

#### 3.2.2 Files

- **Workflows and the pin rules:**
  - `.github/workflows/ci.yml`: every pin bumped; `static` gains three steps, each run once after the install:
    `pnpm audit --audit-level=high` on the install's condition, and `pnpm actions:check` and `pnpm toolchain:check`, each
    with `env: { BASE: "${{ steps.range.outputs.base }}" }` and
    `if: ${{ !cancelled() && steps.install.outcome == 'success' && steps.range.outcome == 'success' }}` (so `all
    green`'s `needs` at `:526` and `ci-gate.test.ts` do not change); db, domain-model and e2e move to compose; the
    comments at `:52-53` and `:101-104` say the ruleset blocks force and direct pushes (F7 applied);
  - `.github/workflows/mutation.yml`: pins (`:49, 53, 54, 81, 84, 85, 100, 168, 172, 174, 181`). Its exact
    `node-version: 24.22.0` (`:56, 87, 177`) stays, held to `tools/stryker/unicode.json` (`workflows.test.ts:1444`). The
    header comment's "one exact Node, 24.22.0" (`:17`) becomes "the one exact Node `tools/stryker/unicode.json` names",
    so the version sits only where a test holds it (§3.2.7, N13);
  - `.github/workflows/approval-of-record.yml:30, 32` and `large-zip.yml:30-32`: SHA pins. `large-zip.yml` also moves
    to compose and gains `persist-credentials: false` on its checkout, as every other workflow but publish-content has;
  - `.github/workflows/release.yml`: pins, the cache removal and `overwrite: true` on its three uploads (§3.2.1);
  - `.github/workflows/screening-capacity.yml`: pins, and `docker-compose.yml` in its push paths (`:31-44`; §3.2.1);
  - `.github/workflows/publish-content.yml:25, 27, 28`: pins, plus its one `timeout-minutes: 15` on `publish` (F4).
    Basis (§3.2.7, N4): its one run took 21 s with nothing to publish (run 39090999122, 2026-10-18, job 02:41:42 to
    02:42:03, install 7 s), and its work is `static`'s in small (a whole-history checkout, the install and
    `pnpm verify-content`, `ci.yml:39-49, 92`), whose band is 15. That leaves room for a cold install and several
    releases, and stops a hung push at 15 minutes instead of GitHub's 360;
  - `.github/workflows/release-dry-run.yml` (new). `supply-chain.yml` no longer exists;
  - `.github/dependabot.yml`;
  - `.github/pull_request_template.md:4-5`: "GitHub offers this template only from main, which has none until launch"
    turns false at the F1 switch, when the build branch, which holds the template, becomes the default;
  - `tools/test/workflows.test.ts`: the pin rules; the compose rule in place of "the Postgres services"
    (`:1606-1620`) and of the `services` checks at `:980`, `:1042` and `:1094`; the release and dry-run rules; the
    frozen-copy rule; the CI-10 table (`:1513-1535`); the artifact test (`:1164`): its name says upload-artifact v7, and
    it also holds release.yml's and the dry run's uploads to `overwrite: true`; `pushPaths` (`:612-627`) gains
    `docker-compose.yml`; the static test's `checks` (`:819`) gains `pnpm audit --audit-level=high`, and a sibling
    assertion holds `pnpm actions:check` and `pnpm toolchain:check` once each, after the install and the range step,
    on the condition above; every read of `.github/**`, the Dockerfiles and `docker-compose.yml` goes through the
    `CI_TREE` root (rule (d));
  - `tools/test/dependabot-config.test.ts` and `tools/test/no-duplicated-versions.test.ts` (new);
  - `tools/test/frozen/publish-content.yml` (new): the file at 49514e8 plus ci-deps' `timeout-minutes` line, its
    `runs-on: ubuntu-24.04` included (§3.2.3);
  - `tools/test/collection.test.ts`: its `FILES` (`:19-29`) gain ci-deps' new test files (dependabot-config,
    no-duplicated-versions, check-action-pins', check-toolchain's), under the N-6 temporary-directory rule;
  - `tools/check-action-pins/**`;
  - `tools/ci/postgres.sh` (new), and its test with a stub `docker`;
  - `apps/worker/src/platform/restore-drill.db.test.ts:75`: the comment's "the postgres:18 service" (§3.2.1);
  - `packages/compliance/src/controls.ts`: no change needed, since it matches steps by substring
    (`controls.test.ts:221-235`) and the supply-chain evidence already names ci.yml (`:259-261`). Optional: evidence
    rows for `check-action-pins` and `check-toolchain` under the same control.
- **The toolchain:**
  - `package.json`: `packageManager` (`:5`); devDependencies, with eslint, typescript-eslint and the five catalog copies
    as `catalog:`; two root scripts in the form of `licenses:check` (`:36`), `actions:check` →
    `tsx tools/check-action-pins/index.ts` and `toolchain:check` → `tsx tools/check-toolchain/index.ts` (§3.2.7, N8);
  - `pnpm-workspace.yaml`: the catalog (`:11-25`: vitest 5.0.5, eslint, typescript-eslint); the release-age and trust
    settings; the override;
  - `pnpm-lock.yaml`;
  - `tools/package.json:36, 38` (`catalog:`);
  - `apps/web/package.json`: next (`:39`), postcss (`:53`);
  - `apps/web/Dockerfile` and `apps/worker/Dockerfile`;
  - `tools/check-licenses/{allowlist.json, check.test.ts}`;
  - `tools/check-toolchain/**` (the checker; `audit-exceptions.json`, `release-age-exceptions.json`,
    `trust-exceptions.json` and the overrides' entries);
  - `docker-compose.yml`;
  - `tools/dev.ts`;
  - `tools/screening-capacity/{containers.ts, measure.test.ts, watched.ts, watched.test.ts, watched-paths.txt}` (the
    last regenerated with `pnpm exec tsx tools/screening-capacity/watched.ts --write`).
- **Documents:**
  - ADR 0066: Part 2, in place of the placeholder at `:243-245`, and the status header (`:3-13`). In the same file:
    - F7 made stale: `:91-93` ("until step 4A's ruleset blocks direct pushes"), `:151-153` ("Once the founder applies
      …; until then nothing enforces them"), `:218-220` (a consequence now done) and `:496-497` ("one of the required
      checks once the founder applies the ruleset");
    - F1, ruled: `:231-233`;
    - the carry-ins: `:175`, the capacity gate "about 12 to 19 minutes" (measured 11:59, 15:52, 18:28, 18:32, 17:30);
      `:178-180`, "146 new by full name less 12 renamed (4,658 and 1 skipped on CI, b5ff4c7)"; `:96`'s "Upload-artifact
      v4" becomes v7;
    - kept as they are: `:46-47`, the dated Context; and `:333`, "the required `mutation` job", which F7 made true.
  - ADR 0063:
    - the F1 (a) amendment: `:86-88` (security updates against the default branch), `:140-142` and `:146-151` (the
      template offered from the default branch), `:339-347` (Dependabot reads the build branch's copy until launch);
    - `:480-482`, "Dates to record here": F7 was applied on 2026-10-25 21:14 UTC, on the personal account
      `PureTideWater`, ahead of runbook steps 1 to 3 (ruleset id 25837331);
    - `:494-497`, the 2026-10-25 amendment's item 1: "the founder sets the ruleset with these names once ADR 0066's
      pull request has its first green push run" gains "applied 2026-10-25 21:14 UTC (ruleset 25837331)" (§3.2.7,
      S10). The marked listing at `:491-492` stays as it is;
    - the pin policy. `:17`, the dated Context, stays.
  - ADR 0062: the amendment that release.yml restores no cache, so the attested report depends only on its own run.
  - `docs/runbooks/github-governance.md`:
    - step 4A (`:279-317`) gains a dated "Applied 2026-10-25 21:14 UTC" line. The step table (`:26`) puts step 4 after
      step 2, and the check (`:350-354`) expects five rulesets, while 4B and 4C do not exist yet: both say so;
    - F1 (a): 4B targets "Include default branch" (`:325`, `:330`), which must become **Include by pattern** → `main`
      only, since the default branch is the build branch until launch; `:394` (security updates against the default
      branch); `:556` ("Leave Default branch at `main`" becomes "switch it back to `main`" at launch, and that switch
      moves ahead of step 4's merge, §3.2.7 N14); `:562-620` (Dependabot and the template read from the default
      branch). **The switch comes immediately before the launch pull request merges.** A run on `main` may restore
      caches the default branch saved, and the launch merge's push starts publish-content.yml (`contents: write`,
      `setup-node … cache: pnpm`, `publish-content.yml:15, 28-29`), whose `cache: pnpm` F4 keeps. With `main` the default
      first, that run restores no pnpm store the build branch saved. For the minutes until the merge lands, Dependabot
      reads `main`'s old copy (220f2b4, which targets the build branch); a pull request it opens then is closed;
    - the carry-ins: `:65` ("about 38 to 39 runner minutes (44 to 45 billed)") and `:66` ("about 12 to 19").
  - `docs/runbooks/ci.md`: `:44-46` and `:55-56` (F7 applied), `:97` (the capacity gate about 12 to 19 minutes) and
    `:135` (about 38 to 39 runner minutes, 44 to 45 billed); the bot-queue section; the weekly read of Dependabot's
    runs (`event=dynamic`, the command in `dependency-upgrades.md`; §3.2.7, S8).
  - `docs/runbooks/screening-capacity.md:306-318`, "Making it required": steps 1 to 3 are done; the section gains
    "applied 2026-10-25 21:14 UTC (ruleset 25837331)" and keeps its marked listing at `:315-316` (§3.2.7, S10).
  - **How the F7 records are worded (§3.2.7, S9).** ci-speed's `required-checks.test.ts` fails any tracked Markdown
    paragraph that names three or more of the four checks in backticks outside `<!-- required-checks -->` markers
    (`tools/required-checks.ts:100-113`), and only the seven files at `:35-43` may hold a marked listing;
    reconciliation-001 is not one. `STALE_NAMES` (`:127`) also fails `supply-chain.yml` and "five checks" in any
    tracked file. So the F7 records (ADR 0063, ADR 0066 Part 2, governance step 4A, `screening-capacity.md`, ci.md and
    reconciliation-001) name the ruleset, "Protect the build branch" (id 25837331), and say "the four required checks"
    without listing them. A listing, where one is wanted, goes between the markers in a file that list names. No new
    text names `supply-chain.yml`.
  - `docs/runbooks/dependency-upgrades.md` (new).
  - `CLAUDE.md:31` (MinIO), and `:54`'s "(GitHub offers it only from main)" under F1 (a).
  - `README.md:11-15` (pnpm at `packageManager`'s version, named by the field, not a literal; Postgres from the
    compose file) and `:37` (dev services).
  - `docs/product/PRD.md:645`; `infra/lib/environments.ts:4`; `docs/product/diagrams/architecture.svg:1`.
  - `docs/product/reconciliation-001.md`: F4's standing exception to the content-pipeline check (`:461`), with the
    reading of "SHA pins at the current majors now" that §3.2.1 gives (§3.2.7, S12), and F1, F2 and F7 recorded with
    their dates, worded as above.
- **Test matrix and synthetic cases:**
  - `docs/product/test-matrix.md`: CI-11 to CI-14 between `:225` (CI-10) and `:226` (CI-15), and the reservation note
    at `:211-212`;
  - `packages/synth/src/cases/matrix.ts` (between `:289` and `:290`) and `registry.ts` (between `:461`, CI-10, and
    `:462`, the comment that opens the mutation workflow's rows);
  - `fixtures/synthetic/CI-11…CI-14/expected.json`.
- **Shared with Lane A's #42 (LANES rule 6; the co-founder's Q2).** #42 is a draft at 13f59b1 on base 49514e8,
  `mergeable_state: dirty`, 143 files (`gh api …/pulls/42` and its `files` pages 1-2, 2026-10-25). The pull request
  merged second keeps both sides:

  | File | #42 | ci-deps | Resolution by the PR merged second |
  |---|---|---|---|
  | `pnpm-lock.yaml` | +33 lines: `@aws-sdk/client-sesv2`, `@aws-sdk/client-sqs` 3.1152.0, `@aws-sdk/middleware-sdk-sqs` 3.972.44 | the licence commit, the bumps | Take the merged manifests, start from the lockfile already on the build branch, and re-resolve with `pnpm install --lockfile-only` under the then-pinned pnpm (with `--fix-lockfile` if the libc rule names an entry); never hand-merge. #42's versions are older than three days (2026-10-14, 2026-10-09), so the gate passes them, and they carry no `libc`, so the licence commit's 43 fields stand |
  | `apps/web/package.json` | `:17` adds `client-sesv2` | next `:39`, postcss `:53` | Separate hunks: keep both |
  | `tools/screening-capacity/watched-paths.txt` | +6 closure paths | `docker-compose.yml` through `WATCHED_FIXED` | Regenerate with `watched.ts --write` |
  | ADR 0062 | header `:1-6`, `:863`, appends at the end (`:1353`; its hunk is `@@ -1351,3 +1367,99 @@`) | the no-cache amendment | Keep both amendments in merge order and merge the header lines |
  | `docs/product/reconciliation-001.md` | appends at the end of 49514e8's 599 lines (`@@ -597,3 @@`) | F1, F2, F4 and F7 records | Keep both |
  | `docs/product/test-matrix.md`, `packages/synth/src/cases/{matrix,registry}.ts` | SEC-18, SEC-19, SCR-21, SCR-22, JOB-05 | CI-11 to CI-14 | Different sections: keep both, then `pnpm synth --all` |

  `apps/worker/package.json` is #42's alone; root `package.json`, `containers.ts`, `measure.test.ts` and
  `infra/lib/environments.ts` are ci-deps' alone. #42 changes no workflow, ADR 0063 or 0066, and neither the CI nor the
  governance runbook. Under F7's "branches up to date", whichever merges second also merges the build branch in and
  re-runs all four required checks.

  **The parallel Lane B pull requests (§3.2.7, S19).** Five were claimed on 2026-10-25 at 23:55 to 23:58 UTC
  (`LANES.md:167-171`): PR 15b, #111, #10, #84 with #120 (an evaluation gate that may add a CI job) and the release
  content checks (#7, #30, #31, #59). They share rule-6 documents with ci-deps (reconciliation-001, the test matrix,
  the synth registry). The resolutions above apply to any of them merged before ci-deps, and a workflow or job such a
  pull request adds is held by rule (a) and needs its CI-10 row; ci-deps pins it when it merges the build branch in. One
  merged after ci-deps takes ci-deps' rules as they stand.

#### 3.2.3 Tests

**Failing first (§3.2.7, S13).** Every test below that fixes a behaviour fails on the merge base's tree, and the PR
description records that red run. The tests read the files they judge through one root, `CI_TREE` when set (rule
(d)), and `check.test.ts`'s libc rule reads the lockfile the same way, so the verifier runs the new tests against the
base's files without checking the base out:

```
tmp=$(mktemp -d) && git archive "$(git merge-base origin/claude/build-platform HEAD)" | tar -x -C "$tmp"
CI_TREE="$tmp" pnpm exec vitest run --project unit tools/test/workflows.test.ts tools/check-licenses/check.test.ts \
  -t '<each name below>'
```

Each must fail there and pass on the head:
- the release rule (today's release.yml restores the pnpm store, the scale release and Trivy's caches);
- the compose rule, its healthcheck's `-h` included (`docker-compose.yml:16` has none; four `services:` blocks);
- `persist-credentials: false` on every checkout but publish-content's (`large-zip.yml:30` has none);
- CI-10's table with `publish-content.yml`'s `publish: 15` (the base has none, 360);
- the frozen-copy rule (the base's publish-content.yml has no timeout line; the frozen copy is read from the head);
- the libc rule (0 `libc:` fields at 6ddd587);
- (c) on its fixture step `actions/cache@<40 hex>`, which today's exact comparison at `:686` lets through.

The simulated rewrite (d) is proven by its own deliberate break (§3.2.1) and by #40's red `unit`, which is the same
rewrite failing on the literal pins (job 121259732714).

- `workflows.test.ts`:
  - (a) to (d) above;
  - the compose rule, in place of "the Postgres services" (`:1606-1620`) and the `services` checks at `:980`, `:1042`
    and `:1094`: no job declares `services:`; every Postgres job (`ci.yml`'s db, domain-model and e2e, and
    `large-zip.yml`) runs `tools/ci/postgres.sh up` right after checkout and `tools/ci/postgres.sh wait` before the first
    step that reads `DATABASE_URL`; in db and e2e the quiet step follows Playwright's install; a last `if: failure()`
    step prints the database's log; and `docker-compose.yml`'s healthcheck runs `pg_isready` with `-h`;
  - the release rule, by named inputs: no `actions/cache*` step, no setup-node `cache`,
    `package-manager-cache: false`, `cache-binary: false`, no build-push `cache-from` or `cache-to`, and `cache: false`
    on every trivy-action step. The nested caches are `check-action-pins`' (below);
  - the dry run: release-dry-run.yml's shared steps equal release.yml's in `uses:` and `with:` keys (§3.2.1), and it
    holds no `packages: write`, `id-token` or `attestations` permission and no `docker push` or attest step;
  - the artifact test (`:1164`): its name says upload-artifact v7, and release.yml's three uploads and the dry run's set
    `overwrite: true`;
  - `screening-capacity.yml`'s push paths (`pushPaths`, `:612-627`) with `docker-compose.yml`;
  - the static test (`:817-824`): `pnpm audit --audit-level=high` joins `checks`; `pnpm actions:check` and
    `pnpm toolchain:check` each run once, after the install and the range step, on the condition and with the `BASE`
    of §3.2.2. That holds A5's and A6's "on every run" (§3.2.7, S15);
  - CI-10's table (`:1513-1535`) gains `'release-dry-run.yml': { build: 20, push: 10 }` and
    `'publish-content.yml': { publish: 15 }`; its comment at `:1527-1528` ("until the founder's ruling … (F4 …)")
    goes;
  - the frozen-copy rule (F4): `publish-content.yml` equals `tools/test/frozen/publish-content.yml` once both are
    normalised, each `uses: owner/repo@<ref> # <comment>` reduced to `uses: owner/repo`. Nothing else is set aside,
    `runs-on` included (§3.2.7, S11). The frozen copy is the file at 49514e8 (whose `runs-on` has been `ubuntu-24.04`
    since 7ac60bc6, 2026-10-20) plus ci-deps' `timeout-minutes: 15` line, so a second timeout edit fails. F4's one
    change to `runs-on` is ci-browser's move to ubuntu-26.04, which edits the workflow and the frozen copy together,
    where a reviewer sees an F4 edit; a later global runner move then fails here instead of changing the file
    unruled. A Dependabot pin bump passes; any other edit fails;
  - every workflow's checkout sets `persist-credentials: false`, except `publish-content.yml`'s, which pushes.
- `dependabot-config.test.ts` (§3.2.1).
- `tools/check-action-pins/*.test.ts` (§3.2.1): a composite with a nested tag ref fails; a nested cache gated through
  a binding is reported, and an ungated one fails; an unchanged pin makes no network read, and a new one does; a moved
  tag on an unchanged pin warns on a push run; three failed reads of a new pin fail closed.
- `tools/check-toolchain/*.test.ts`, each failing unless said: an advisory hit; a Dockerfile literal; an expired audit
  exception; a release-age exclude that is a bare name, a pattern or a union; an unlisted exclude; an added exclude whose
  expiry is before its version's publish time + 3 days or after its added date + 7 days; an expired exclude, which
  fails on a pull request that edits either list and warns on a push run and on any other pull request; a version the
  lockfile adds that is under three days old (the same version passes with a live exclude, and a young version
  already in the base passes, which tests the exclude path F2 (b) needs); the base taken from `BASE` through
  `git merge-base`; a newer 10.x at least three days old, which warns; under CQ3 (a), a `packageManager` pnpm under
  three days old, which passes only with its exclude; a trust exclude missing from either list or no longer in the
  lockfile; an override without its entry, or whose target left the lockfile; three failed tries (fails closed).
- `tools/check-licenses/check.test.ts`: the libc rule.
- `tools/ci/postgres.sh`'s test, with a stub `docker` on `PATH`: healthy passes; a failed `up` fails `wait` at once,
  printing the log; an `up` that never finishes fails after the (shortened) limit.
- `tools/screening-capacity/measure.test.ts`: the Postgres image read from compose. `watched.test.ts` (`:79` asserts
  the lockfile is watched) gains the compose file, and its push-path test (`:82-91`) passes with it.
- `tools/test/no-duplicated-versions.test.ts` (new): no version or digest is written outside its manifest or source of
  record. The sources: the Dockerfiles for the node image; compose for postgres; `packageManager` for pnpm;
  `tools/stryker/unicode.json` for `mutation.yml`'s exact `node-version` (24.22.0, `mutation.yml:56, 87, 177`), which
  `workflows.test.ts:1444` already holds equal; `apps/worker/package.json` for the worker's playwright-core once
  ci-browser adds it. It scans the whole text, comments included, of every workflow, both Dockerfiles,
  `docker-compose.yml`, `README.md` and `CLAUDE.md`; ADRs and dated runbook entries record what was and are not scanned
  (§3.2.7, N13). So `mutation.yml:17`'s comment and README.md:11-12 name their source, not the number. Every package the
  catalog holds is `catalog:` in every manifest's dependencies and devDependencies (peer ranges stay their own).
  Without the `unicode.json` source, the new test would fail on ci-mutation's pin. This is A4 (b).
- `tools/test/collection.test.ts`: the new files in `FILES`.

#### 3.2.4 Under F1 (b) only: not taken

The founder ruled F1 (a) (relayed 2026-10-25 ~01:10 UTC), so ci-deps opens no pull request into `main`, writes no
`target-branch` line and adds no drift test against `origin/main`. The plan for (b), kept for the record: a separate
pull request into `main` on the founder's ruling (the #27 precedent), carrying the same YAML with every `target-branch`
line kept, plus the new PR template; and a test that the build branch's copy equals `origin/main`'s minus those lines.

#### 3.2.5 Acceptance

1. Fresh clone and scope, as in §3.1.7. No migration, no change under `packages/pricing`, `packages/ledger`,
   `packages/db/migrations`, `content/`, `tools/verify-content` or `.claude/hooks/protect-content.sh`, and
   `publish-content.yml` changed only in its `uses:` refs, their comments and one `timeout-minutes: 15` line (F4).
   `diff <(git show 49514e8:.github/workflows/publish-content.yml) tools/test/frozen/publish-content.yml` shows only
   that line; the frozen copy's `runs-on` is still `ubuntu-24.04`.
2. Networked checks, which pass from this machine (git and the registry are reachable), each against the merge base:
   - `BASE=origin/claude/build-platform pnpm actions:check` (every pin read live, since the base has no checker);
   - `BASE=origin/claude/build-platform pnpm toolchain:check`.
3. `pnpm audit --prod`; `pnpm audit --audit-level=high`.
4. **The licence commit:** the PR's first commit changes only `package.json`'s `packageManager`, `allowlist.json`'s musl
   entry and `pnpm-lock.yaml`. Measured on the commit itself, so it holds after the build branch is merged in (§3.2.7,
   S5): `git show <first>^:pnpm-lock.yaml | grep -c '^ *libc: \['` gives 0 and the same at `<first>` gives 43;
   `git diff --numstat <first>^ <first> -- pnpm-lock.yaml` is `43 0`, every added line `libc: [glibc]` or
   `libc: [musl]` (`git diff <first>^ <first> -- pnpm-lock.yaml | grep '^+ ' | sort | uniq -c`). Any other count is
   re-measured and each difference explained by its entries before the PR goes on. `pnpm licenses:check` then passes
   with no musl package listed.
5. **The gates' commit and O3, live:** the second commit changes only `pnpm-workspace.yaml`'s four release-age and
   trust settings. Every later commit that changes `pnpm-lock.yaml` or a resolution setting is dated after
   2026-10-26T19:18:50Z, and its resolution ran under the gates; the login pin's commit is after 2026-10-26T15:11Z;
   other commits are not held (§3.2.7, S18). The PR description records the builder's live check of O3 in a scratch
   copy, never committed: a resolution that needs a version under three days old fails with
   `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, and passes with that version's exact exclude;
   `pnpm install --frozen-lockfile` does not check.
6. `pnpm exec vitest run tools/test tools/check-action-pins tools/check-toolchain tools/check-licenses tools/screening-capacity tools/ci`.
7. **Failing first** (§3.2.3; §3.2.7, S13): the verifier runs §3.2.3's command against the merge base's tree, and each
   named test fails there; the PR description carries that red run's output and the green one on the head.
8. `git grep -n -i minio -- ':!pnpm-lock.yaml' ':!docs/adr/0066-*'` prints nothing; ADR 0066's Part 2 alone records
   the removal (§3.2.7, N7).
9. `git diff <first> -- pnpm-lock.yaml`, after the licence commit, has a summary in the PR description: the named bumps,
   the override and the refresh, commit by commit, and nothing else unexplained.
10. **CI.** The F7 ruleset's four required checks ("Protect the build branch", applied 2026-10-25 21:14 UTC, branches
    up to date), on the PR's head:
    - `all green` (images built on trixie and scanned clean, Postgres from compose);
    - `mutation`, every package: root `package.json`, `pnpm-workspace.yaml` and `mutation.yml` are global inputs
      (`affected.ts:111-120`), so it runs all six shards, about 10 minutes and 31-36 runner-minutes;
    - `screening-capacity gate` (the lockfile, the Dockerfiles and now the compose file are watched): every correctness
      check passes;
    - `approval-of-record`, now on SHA pins.

    Also `release-dry-run` green on the PR (it changes release.yml; advisory, outside the ruleset): the v7 upload, the v8
    download with `merge-multiple`, the identity check, the load and the ghcr login all ran. If #42 or another PR merges
    first, ci-deps merges the build branch in, re-resolves the lockfile under the gates (never hand-merged) and re-runs
    all four checks.

    **No test lost** (§0; §3.2.7, S16), read from CI's logs on the head: unit = 6ddd587's 4,996 passed and 1 skipped
    (run 40229005858, job 121281841727), plus ci-deps' new tests, less the three it replaces (`describe('dependabot')`'s
    one test, by `dependabot-config.test.ts`; "the Postgres services", by the compose rule; the form test at
    `:1236-1253`, by rule (a)), with 1 skipped. The PR description lists the new tests by name and does the sum. Golden
    188, db 9,049 and 1 skipped over 118 files, and e2e 51 stay unchanged. A Lane B or Lane A pull request merged in
    first adds its own stated counts.
11. **The co-founder's answers** (§3.2.7, S17): the pull request merges only after CQ1, CQ2 and CQ3 are answered. The
    PR description records each answer, its date and who relayed it, and the cooldown, trust and `packageManager`
    lines match them. Until then the builder writes each recommended option.
12. **After the merge**, under F1 (a):
    - the founder makes `claude/build-platform` the default branch (F1 (a)) and turns on Dependabot alerts and security
      updates (F2 (a)); then, with F4's pins in, requires actions pinned to a full SHA (F3);
    - the Dependabot tab shows the config parsed from the build branch. #40 closes as up to date (every version it
      offers is at or below ci-deps'), or is recorded with its state. #33 is declined by the node major ignore. npm
      runs resume after 2026-10-26T19:18:50Z, and the remaining browser group is red only on what ci-browser fixes. The
      PR records any Dependabot PR left open, with its reason;
    - the conclusions of Dependabot's first runs after the switch are read (§3.2.7, S8): any immediate runs at the
      switch and each ecosystem's first weekly run (actions Tuesday 04:37, container images Wednesday 04:43, npm
      Thursday 04:31 UTC), with
      `gh api 'repos/PureTideWater/PhysicalTherapy/actions/runs?event=dynamic&created=>=<switch date>' --jq
      '.workflow_runs[] | [.id,.name,.conclusion,.created_at] | @tsv'`. Each is logged with the pull requests it opened;
      a `failure` is read and fixed in a follow-up;
    - the first Monday's weekly runs (mutation 05:23, large-zip 06:17, screening-capacity 06:41 UTC) are read, and
      their results logged.

#### 3.2.6 Re-read at 6ddd587 (2026-10-25)

Sources: two scout reports, `designs/lane-b-ci/scout-ci-deps-reread-files.md` and
`designs/lane-b-ci/scout-ci-deps-reread-versions.md`, both 2026-10-25, read whole; and the code and the network,
re-checked here. Every cite below is at 6ddd587.

**What changed from the 2026-10-24 text, and why:**

| § | Change | Evidence |
|---|---|---|
| 3.2 | The rulings are stated as ruled: F1 (a), F2 (a) and (b), F4 yes, F7 applied. "Under F4 = yes" and "subject to F2 (b)" are gone, and §3.2.4 is marked not taken | `lanes/lane-b.md`, "Rulings and decisions of record"; `gh api …/rulesets/25837331` (4 checks, `strict_required_status_checks_policy: true`, 0 approvals, no bypass; created 21:07:53Z, updated 21:14:05Z) |
| 3.2.1 | A list of what ci-speed and ci-mutation already did: ci.yml and mutation.yml SHA-pinned at the old versions, supply-chain.yml folded into ci.yml, Trivy in ci.yml cache-free, timeouts, TCP health. Tag refs remain in three files only | `ci.yml:39-517`; `mutation.yml:49-181`; `ci.yml:493, 516`; `approval-of-record.yml:30,32`; `large-zip.yml:30-32`; `publish-content.yml:25,27,28` |
| 3.2.1 | The action table gains the peeled SHAs, the tag commits' dates, #40's offers and the uses; no newer tag | `git ls-remote --tags` and depth-1 tag fetches, 2026-10-25 (versions scout §2; re-checked here for checkout, setup-node, action-setup, login) |
| 3.2.1 | The new majors are shown to run: #40's head passed every job but `unit`, which failed only on literal pins | check runs on e0d5b6f; `unit`'s annotations (check run 121259732714) |
| 3.2.1 | login v4.7.0 is pinned only once three days old (from 2026-10-26T15:11Z) | tag commit 2026-10-23T15:11Z; Dependabot's default cooldown (`dependabot-options-reference.md:191-196`) |
| 3.2.1 | The pin rules cite `PINNED` at `:77-92` (it gained `setupPython`), its 25 uses (26, §3.2.7 N1), and the literal refs at `:686`, `:1271` and `:545`; `:404` and `:423` are gone (now `PINNED.uploadArtifact`); the form test is `:1235-1253` | `grep -n PINNED tools/test/workflows.test.ts` |
| 3.2.1 | Rule (c) also closes `:686`'s vacuous check | `:686` compares `step.uses` to `'actions/cache@v4'`, which a SHA pin never equals |
| 3.2.1 | release.yml's cites hold; its Trivy steps take ci.yml's two lines (`cache: false`, a `cache-dir` under `runner.temp`) | `git diff 49514e8 6ddd587 -- .github/workflows/release.yml` is empty; `ci.yml:493-494, 516-517` |
| 3.2.1 | release-dry-run.yml gets timeouts (CI-10) and is stated as outside F7's ruleset | `workflows.test.ts:1513-1535`; the ruleset's four checks |
| 3.2.1 | Both digests in full; Postgres pinned as `18-trixie`, which is today's `postgres:18`; two working ways to read a digest | Hub API and `registry-1.docker.io` HEAD, 2026-10-25 ~23:00 UTC (versions scout §4) |
| 3.2.1 | Postgres: compose decided on measured evidence; the healthcheck moves to TCP first; one script; the quiet step after the browser install; the log printed on failure; the compose file becomes a watched path | three push runs' job steps; `docker-compose.yml:16`; `ci.yml:243-246, 257-260, 421-422`; `watched.ts:62-80` |
| 3.2.1 | pnpm: latest-10 is 10.34.9; 10.34.8 kept. The pnpm-12 reason gains dependabot-core's code-level support, with GitHub's table still the trigger | `npm view pnpm dist-tags` (re-checked 23:17 UTC); pnpm v10.34.9 changelog; dependabot-core 8ac9b21a, 493da6c4; `supported-package-managers.md:44` |
| 3.2.1 | The "3 `libc:` lines" were `detect-libc:` lines; the lockfile has no `libc:` field; 43 expected at the cut, re-measured | `grep -n libc pnpm-lock.yaml`: `:2601, 5711, 6147, 6163, 6498`, none a field; `grep -c '^ *libc: \['`: 0 |
| 3.2.1 | npm versions with dates; typescript-eslint 8.72.0 added; qs by override, not refresh; one catalog line per shared tool; #33 is now `node:26-slim` | `npm view … time`; `npm view typed-rest-client@2.3.1 dependencies`; `tools/package.json:36, 38`; `package.json:39-55`; #38's `pnpm-workspace.yaml` patch; `gh api …/pulls/33` |
| 3.2.1 | `check-toolchain` gains the lockfile release-age rule, the trust and override entries; the "cannot enter the lockfile" sentence is replaced | `dist/pnpm.cjs:175478, 66130-66139`; `pnpm_lockfile_updater.rb:540-556`; run 40223237798's log |
| 3.2.1 | `trustPolicyExclude: ['semver@6.3.1']` (CQ2) | `dist/pnpm.cjs:67150-67240` applied to all 614 locked versions; `pnpm why semver` |
| 3.2.1 | Commit order: licence, then the gates, then the bumps after 2026-10-26T19:18:50Z (was: gates after the bumps; Stryker at "19:18Z") | `npm view @stryker-mutator/vitest-runner time`: 2026-10-23T19:18:49.904Z |
| 3.2.1 | O3 answered from source and the log; the builder only confirms it live | versions scout §6 |
| 3.2.1 | Dependabot: npm on Thursday; semver-specific cooldowns on npm only (values per CQ1); no `target-branch`; the header's figures; the test asserts no Monday and npm-only semver keys | `mutation.yml:26`, `large-zip.yml:10`, `screening-capacity.yml:25`; `dependabot-options-reference.md:230-288`; `dependabot.yml:4, 6-7` |
| 3.2.1 | The load plan: ci.yml 38.0-39.1 runner-minutes on push runs; a full mutation run is 31-36 (not 45-55); `next` and every actions PR run mutation in full; a Thursday batch about 550-650 | push runs 40201435875, 40223130551, 40229005858; mutation runs 40223130477, 40229005837; #40's runs; `affected.ts:108, 111-120` |
| 3.2.1 | Actionlint cites: `:1285-1293`, its configuration ban `:355-359` | `workflows.test.ts` |
| 3.2.2 | Added: `watched.ts`, `tools/package.json`, `pull_request_template.md:4-5`, `collection.test.ts`, `tools/ci/postgres.sh`, the three `tools/check-toolchain` lists; removed: `supply-chain.yml`; each document with its lines (F7, F1 (a), the carry-ins); #42's shared files under rule 6 | the files scout §2, §5-7, re-checked: ADR 0066, ADR 0063, `github-governance.md`, `ci.md` at the lines cited |
| 3.2.2 | Carry-in corrected: ADR 0066:333 needs no edit (F7 made "the required `mutation` job" true); `:496-497` is the stale line. The runner-minute figure sits in three files | `adr/0066…md:333, 496-497`; `dependabot.yml:4`, `github-governance.md:65`, `ci.md:135` |
| 3.2.3 | The compose rule replaces `:1606-1620`, `:980`, `:1042` and `:1094`; CI-10's table grows; the frozen copy is stricter; `persist-credentials: false` everywhere but publish-content; `no-duplicated-versions` names `unicode.json` and the catalog; the new `check-toolchain` cases | `workflows.test.ts` at those lines; `mutation.yml:15-18, 56`; `tools/stryker/unicode.json:4` |
| 3.2.5 | The CI step names the F7 ruleset, mutation's full run and the up-to-date re-run; the licence step counts fields; a gates step and the live O3 check; the frozen-copy diff; after the merge, the founder's three settings and the first weekly runs | as above |
| §0, §3.5, §4, §5, §9, §11 | Cross-references only: §0's ci-deps line and a line on the rulings; CI-14 gains the release-age rule; D1's and D2's files in §4 (the new files need an owner each); §5's lockfile row, Lane A's notes and an "Applied" paragraph under the ruleset offer; §9's release-age rows and batch row; O3 marked answered | this section |

Sections outside §3.2 keep their 49514e8 cites (line 22), apart from those cross-references.

**Engineering-only choices made here, each pre-approved (the co-founder's Q3, 2026-10-25) and reversible** (updated by
§3.2.7):
- pnpm 10.34.8 kept over 10.34.9;
- typescript-eslint 8.72.0 taken with eslint 10.13.0;
- eslint and typescript-eslint moved to the catalog, and root's five literal copies of catalog entries named `catalog:`,
  held by `no-duplicated-versions.test.ts`;
- qs 6.16.1 by an override, with its removal trigger, kept by `check-toolchain`;
- `check-toolchain`'s lockfile release-age rule, which enforces the founder's F2 (b) where pnpm 10 and Dependabot's
  security updates do not;
- the commit order (the gates before the bumps; only commits that resolve wait for 2026-10-26T19:18:50Z);
- the compose healthcheck on TCP (`-h localhost`, ci-speed's proven form rather than the scout's `127.0.0.1`), one
  `tools/ci/postgres.sh` (its `wait` reading `up`'s recorded exit status), the quiet step after the browser install,
  and the database's log on failure;
- `docker-compose.yml` added to `WATCHED_FIXED` and to `screening-capacity.yml`'s push paths;
- `persist-credentials: false` on `large-zip.yml`'s checkout, and a rule for every workflow but publish-content;
- release.yml's Trivy steps in ci.yml's form (`cache: false`, a `cache-dir` under `runner.temp`), and `overwrite: true`
  on its three uploads;
- the stricter F4 frozen copy (49514e8 plus the timeout line; nothing set aside, `runs-on` included);
- publish-content's `timeout-minutes: 15` (F4 allows one timeout; the value is engineering);
- rule (c) through `usesAction`, keeping `:686`'s check alive;
- the simulated rewrite through `CI_TREE` and a spawned vitest;
- `check-action-pins` reading the network only for new or changed pins, warning on a moved tag of an unchanged pin,
  and checking release.yml's nested caches itself, with no committed per-SHA file;
- `check-toolchain`'s base from the range step, its warning for a newer 10.x, and the exclude expiry rules (an added
  entry's window; an expired one failing only where the lists are edited);
- root scripts `actions:check` and `toolchain:check`;
- npm's Dependabot day moved from Monday to Thursday 04:31 UTC;
- semver-specific cooldown keys, if CQ1 keeps any, on the npm entry only (the other ecosystems support only
  `default-days`);
- release-dry-run.yml's timeouts (build 20, push 10);
- ci-deps' new test files in `collection.test.ts`'s `FILES`;
- `no-duplicated-versions.test.ts` naming `tools/stryker/unicode.json` as mutation.yml's Node source, and its scan
  scope (workflows, Dockerfiles, compose, README.md and CLAUDE.md, comments included);
- the governance runbook's default-branch switch moved to just before the launch pull request merges (F1 (a)'s "at
  the launch merge", read so the merge's push restores no build-branch cache).

login v4.7.0's timing (after 2026-10-26T15:11Z) is not on this list: it is a security choice of P1's kind, and here
it costs nothing, since nothing in the PR can merge before 2026-10-26T19:18:50Z (§3.2.7, N9).

**For the co-founder (security trade-offs; recommended option first). None blocks the builders' start; each touches a
few lines; the pull request merges only once all three are answered (§3.2.5 step 11).**
- **CQ1. Dependabot's npm cooldown (soak time before a version update opens).** Corrected on 2026-10-25 (§3.2.7, B1).
  - **(a) Recommended: npm `cooldown: { default-days: 3 }`, with no semver-specific days.** Actions and images keep
    `default-days: 7`, which passes no gate to pnpm. Every gate Dependabot computes for npm is then 3 days, equal to
    `minimumReleaseAge`, so it is never passed to pnpm (`helpers.rb:144-148`), and every npm update, majors included,
    opens once its versions are three days old: F2 (b)'s floor. People still triage every PR, and none merges as it
    stands.
  - (b) Keep 2026-10-24's values (7 by default, 14 for majors, 7 for minors, 3 for patches). Two code paths then pass
    pnpm a gate longer than the repository's, per dependency. The update checker's peer probe passes the version's own
    semver days, uncapped: 14 for a major, 7 for a minor (`update_checker/version_resolver.rb:894-905, :912-924`), and a
    release-age failure there makes Dependabot skip that version and try older ones (`:185-190, :288-296`). The file
    updater passes `min(semver days, default-days)`, so 7 for a minor or a major (`file_updater.rb:500-514`). pnpm 10
    re-checks every locked direct dependency on those re-resolutions. So a **major** update is dropped, with no pull
    request and no failed run, whenever any locked direct dependency is under 14 days old. After any week that took a
    patch bump 3 to 6 days old (the minor-and-patch group nearly always has one), that is most weeks. A **minor**
    update is dropped whenever one is under 7 days old: after a security update, a hand bump, a newly added
    dependency or an expired exclude in the past 7 days. Patch updates (3 days, the repository's own) always arrive.
  - (c) Raise `minimumReleaseAge` to 7 days to match. That changes the founder's F2 (b), so it would go to him, and
    every young security fix would need its exclude for longer. Majors would still be probed at 14 days.
  - Not an option: `default-days: 3` with semver days of 14 and 7. The file updater would pass nothing, but the probe
    passes the semver days uncapped, so majors and minors would be dropped as under (b).
  - (a) against the corrected (b): (a) opens minor updates 4 days sooner and majors 11 days sooner (3 days of public
    soak against 7 and 14). (b) drops majors silently in most weeks and minors in some. Its drops are successful runs
    whose log says "release-age block detected", so the weekly read of Dependabot's runs (§3.2.1) would not see them as
    failures. Both keep the three-day floor on every resolution and a person on every merge, and both leave the
    founder's F2 (b) as ruled; only the design's own cooldown values of 2026-10-24 change.
  - It blocks only the npm entry's `cooldown` lines and their assertion; the builder writes (a) until told otherwise.
- **CQ2. One exclude from the trust policy.**
  - **(a) Recommended: `trustPolicyExclude: ['semver@6.3.1']`**, mirrored in `trust-exceptions.json` with its reason,
    held equal and still resolved by `check-toolchain`. It waives the provenance-downgrade check for one version
    published in 2023 and already locked, reached through `@babel/core`; every other locked version (613) and every
    target passes the policy.
  - (b) `trustPolicyIgnoreAfter` (pnpm 10.27.0), which waives the check for every version older than a set age. It is
    broader: it would also pass a future downgrade in any old version.
  - (c) No `trustPolicy`. That drops the check for every package.
  - Without one of these, the next bump cannot resolve, since it re-resolves `@babel/core`'s subtree.
- **CQ3. The pnpm that CI runs, held to the three-day release age** (added on 2026-10-25, §3.2.7, S6).
  - **(a) Recommended: `check-toolchain` fails when `packageManager` names a pnpm published under three days ago,
    unless that exact version has a live dated exclude in both lists**, the same rule as any version the lockfile adds.
    action-setup v6.1.0 switches to `packageManager`'s pnpm with `pnpm self-update` in its own directory
    (`src/install-pnpm/run.ts:70, :113-114` at `ea17c68d`), where the workspace's `minimumReleaseAge` never applies, and
    Dependabot never proposes it, so only a person moves it. Without this rule, a hand bump could make every CI job run
    a pnpm published minutes ago, inside the window F2 (b) exists for.
  - (b) As written before: the advisory check alone, no age rule on `packageManager`.
  - What (a) costs: an urgent pnpm fix younger than three days needs a person's dated exclude before its pull request
    is green, which is the trade-off F2 (b) already makes for every other package. It changes nothing today: 10.34.8
    is three days old from 2026-10-26T18:06:38Z, before the bump commits.
  - It blocks only that `check-toolchain` rule and its test; the builder writes (a) until told otherwise.

**Proposed improvements outside ci-deps** (not in this PR; each would be its own item):
- P1, a security trade-off for the co-founder: hold action pins and image digests to the same three-day floor
  (`check-action-pins` refuses a tag commit, and `check-toolchain` a digest's push, under three days old). Today it
  would have held back only login v4.7.0, by a day. Recommended yes.
- P2: set trivy-action's `version:` to the latest trivy (v0.76.1, 2026-10-21) instead of v0.36.0's default v0.70.0,
  with a check against March 2026's hijacked tags (CVE-2026-33634) and a pin rule in `check-action-pins`.
- P3: pnpm 11.3 or later verifies every lockfile entry against `minimumReleaseAge` and `trustPolicy` on every install,
  frozen included (`trustLockfile`). Revisit N10's trigger when GitHub's table lists pnpm 11 or 12.
- P4: narrow `tools/stryker/affected.ts`'s root-manifest input to `packageManager`, `engines`, the Stryker scripts and
  `TEST_TOOLING`'s specifiers; other devDependencies already reach a money closure through the lockfile. It would spare
  a full mutation run (31-36 runner-minutes) on most npm PRs. ci-mutation's area, as its own PR.
- P5: one catalog line for every package that two manifests name with the same literal range: pg-boss (web, worker),
  `@aws-sdk/client-s3` (web, worker), tailwindcss (web, brand), playwright-core (worker, tools), yauzl and
  `@types/yauzl` (worker, contracts), pdfjs-dist (worker, contracts). After #42 and ci-browser merge, since both touch
  those manifests.
- P6: re-read "Protect the build branch" through the rulesets API after runbook step 2 moves the repository, and put
  that check in step 2.
- P7: `lanes/lane-b.md:43` gives Dependabot's resume time as "about 19:50 UTC"; it is 2026-10-26T19:18:50Z.
- P8 (§3.2.7): dependabot-core's two release-age gates disagree. The file updater caps each dependency's gate at
  `default-days` (`file_updater.rb:500-514`, whose comment says the gate must never exceed the window a version was
  selected under), while the update checker's peer probe passes the uncapped semver days (`version_resolver.rb:912-924`)
  and skips a version on a release-age block caused by any locked dependency. A report upstream, with this repository's
  case and no repository data beyond public versions, is the founder's or co-founder's to send; ci-deps does not depend
  on its outcome under CQ1 (a).

**Migration and frozen code:** ci-deps still needs no migration, and changes no engine (`packages/pricing`), ledger or
content-pipeline code beyond F4's pins and one timeout in `publish-content.yml`.

#### 3.2.7 Review of the re-read (2026-10-25)

The review: `designs/lane-b-ci/ci-deps-reread-review.md` (1 blocking, 20 should-fix, 16 nits). Each finding was
checked again against 6ddd587, GitHub (`gh api` GET and the job-log tool, read only) and dependabot-core at main
7c06280 (a sparse clone of `npm_and_yarn/` and `common/lib/dependabot/`), before any text changed. Every finding names a real
defect, though B1's mechanism was only half right. Four are fixed by another means than the review proposed (B1's
majors, S3, S4, S7), each with its reason below.
The design's sections above carry each change, marked "§3.2.7".

**Blocking**
- **B1. Fixed, and the review's own premise corrected.** The review is right that the file updater caps each
  dependency's gate at `default-days` (`file_updater.rb:500-514`). It missed a second path: the update checker's peer
  probe runs `pnpm update <dep>@<ver> --lockfile-only` under the version's uncapped semver days
  (`update_checker/version_resolver.rb:894-905, :912-924`, through `pnpm_lockfile_updater.rb:550-555` and
  `helpers.rb:144-148`), and a release-age block there makes Dependabot skip that version and try older ones
  (`:185-190, :288-296`). The probe runs on every update check (`relevant_unmet_peer_dependencies` →
  `peer_dependency_errors`). The versions scout's "a majors-only update gets 20,160" was the probe's figure, not a
  contradiction. So under (b) majors are probed at 14 days and dropped in most weeks; minors at 7 days and dropped only
  after a young direct dependency in the past 7 days. CQ1 (b) is rewritten per dependency with both paths; (a) stays
  recommended, with its cost stated against the corrected (b) (§3.2.6). One alternative the fix looked at,
  `default-days: 3` with semver days of 14 and 7, is shown not to work (the probe is uncapped). §3.2.1's O3 bullet and
  the dependabot.yml cooldown text name both paths. P8 proposes an upstream report.

**Should fix**
- **S1. Fixed.** `screening-capacity.yml`'s push paths (`:31-44`) and `workflows.test.ts`'s `pushPaths` (`:612-627`,
  held with `toEqual` at `:627`) gain `docker-compose.yml`; `watched.test.ts:82-91` then passes (§3.2.1, §3.2.2,
  §3.2.3).
- **S2. Fixed, by the second option.** release.yml's three uploads (`:92-96`, `:110-118`, `:188-198`; none sets
  `overwrite`) gain `overwrite: true`, which fixes a real re-run conflict (ADR 0066:96-97 found it for ci.yml). The
  dry-run rule compares `uses:` and the `with:` key sets, and values only for `overwrite` and the cache inputs; the
  artifact test holds all three files' uploads to `overwrite: true`.
- **S3. Fixed, by another means.** The finding holds: an offline unit test cannot read a networked report. The fix
  splits the rule where its data is. `workflows.test.ts` names release.yml's cache inputs explicitly (trivy-action
  `cache: false`, setup-buildx `cache-binary: false`, setup-node's two), and `check-action-pins` follows each nested
  `actions/cache*` to the top-level input that gates it and requires that input `false` in release.yml (§3.2.1). No
  `verified.json`: Dependabot's github-actions ecosystem rewrites only `uses:` lines, so a committed per-SHA file would
  be stale on every actions PR and make it red, against A4 (c).
- **S4. Fixed, by another means.** The finding holds (`static` is under `all green`; a re-tag or rate limit would fail
  both lanes). `check-action-pins` now reads the network only for a pin new against the base, or used by a step whose
  `with:` changed, or for every pin when the base has no checker or the checker itself changed; on push runs it
  re-reads unchanged pins' tags as warnings only. A PR that touches no pin reads nothing. The review's "store facts per
  SHA" half is not taken, for S3's reason.
- **S5. Fixed.** Acceptance 4 and §3.2.1 measure the commit's own diff, `git diff --numstat <first>^ <first>`, with
  the counts at `<first>^` and `<first>`.
- **S6. Fixed, with one addition.** Confirmed: `file_parser.rb:32` parses only the three dependency fields; nothing in
  `npm_and_yarn/lib` writes `packageManager`. The sentence is gone; `check-toolchain` warns when a newer 10.x is at
  least three days old; `dependency-upgrades.md` gives the manual bump, its cadence (the weekly triage, on that
  warning) and the outage remedy. Added: CQ3, whether `packageManager`'s pnpm is held to the three-day age, since
  action-setup's self-update escapes the workspace's gate. It has a security trade-off, so it goes to the co-founder.
- **S7. Fixed, with a narrower fail scope.** The add-time window (publish + 3 days ≤ expiry ≤ added + 7 days) is taken
  as proposed. An expired entry fails only a PR that edits either exclude list and warns elsewhere. The review proposed
  failing on push runs and on any PR touching the lockfile; not taken, because every Dependabot npm PR touches the
  lockfile (A4 c) and a push run follows a green PR. Since expiry ≥ publish + 3 days, an expired entry can no longer
  change any resolution, so warning loses nothing.
- **S8. Fixed.** Confirmed: `event=dynamic` lists Dependabot's runs (31; run 40223237798 reads `failure`). The command
  goes in `dependency-upgrades.md` and `ci.md` for the weekly triage, and acceptance 12 reads the first runs after the
  switch. B1's silent drops are successful runs, which the triage notes.
- **S9. Fixed.** Confirmed at `tools/required-checks.ts:35-43, :100-113, :127`; the test scans every tracked `*.md`
  (`required-checks.test.ts:40`). §3.2.2 states the wording rule for every F7 record.
- **S10. Fixed.** ADR 0063:494-497 and `screening-capacity.md:306-318` join §3.2.2, each keeping its marked listing
  (`:491-492`; `:315-316`).
- **S11. Fixed.** The frozen copy keeps `runs-on`; ci-browser edits the workflow and the copy together.
- **S12. Fixed.** §3.2.1 and reconciliation-001's F4 entry record the reading of "the current majors", with the three
  facts and the route to the founder if doubted.
- **S13. Fixed.** §3.2.3 opens with the failing-first list and the verifier's command (`CI_TREE` on the merge base's
  `git archive`); acceptance 7 records the red run.
- **S14. Fixed.** Rule (d) names the mechanism: a temporary copy with every pin and digest rewritten, vitest spawned as
  `collection.test.ts` does, with `CI_TREE`; the rewrite test skips itself there; a deliberate break proves it reads
  the copy.
- **S15. Fixed.** The static test's `checks` (`:819`) gains the second audit, and a sibling assertion holds
  `pnpm actions:check` and `pnpm toolchain:check`, which need the range step's base too.
- **S16. Fixed.** Acceptance 10 states the count: 4,996 and 1 skipped (job 121281841727, read again), plus the new
  tests, less three named replacements; golden 188, db 9,049 and 1 skipped, e2e 51.
- **S17. Fixed.** Acceptance 11: the merge waits for CQ1, CQ2 and CQ3, each answer recorded with its date.
- **S18. Fixed.** Only commits that change the lockfile or a resolution setting wait for 2026-10-26T19:18:50Z; the
  login pin waits for 15:11Z.
- **S19. Fixed, and one more.** `LANES.md:167-171` holds five claims, not four: the release content checks (#7, #30,
  #31, #59) were claimed at 23:58. §3.2.2's one paragraph covers all five.
- **S20. Fixed.** Rule (c) names `usesAction` (`:181`, 14 call sites, re-counted).

**Nits** (each confirmed, each fixed)
- **N1.** 26 uses (24 `PINNED.*` on 23 lines, `:540` holding two, and two `Object.values`), plus the `:1250` cast.
- **N2.** Rule (c) "keeps `:686`'s check alive" once the set check at `:1247-1250` goes.
- **N3.** The log of job 121259732714, read with the job-log tool: 14 failed, 4,974 passed, 1 skipped; all 14 listed.
- **N4.** `timeout-minutes: 15`, from its one run (21 s, run 39090999122) and `static`'s band for the same work.
- **N5.** `registry.ts`: between `:461` and `:462`.
- **N6.** CI-12 gains the postgres-major ignore; the browser-tests clause moves to CI-18, and A4's cite follows.
- **N7.** `git grep -n -i minio -- ':!pnpm-lock.yaml' ':!docs/adr/0066-*'`, empty. ADR 0066 is excluded because its
  Part 2 records the removal, which a bare grep would report.
- **N8.** Root scripts `actions:check` and `toolchain:check`, in `licenses:check`'s form (`package.json:36`).
- **N9.** Dropped from the pre-approved list, with the reason the timing costs nothing.
- **N10.** setup-trivy's `actions/cache/save@9255dc7…` (`action.yaml:100`) added, with `:56` and `:66` cited.
- **N11.** `set -euo pipefail`, all three streams redirected, and `up` recording its exit status. Refined beyond the
  review: `wait` reads that status instead of polling `docker inspect`, so the empty-id race cannot occur at all.
- **N12.** Both checkers take the range step's base, reduced with `git merge-base`.
- **N13.** README names `packageManager`, not a version; `mutation.yml:17`'s comment names `unicode.json`;
  `no-duplicated-versions` scans comments in workflows, Dockerfiles, compose, README.md and CLAUDE.md.
- **N14.** The governance step switches the default branch back to `main` just before the launch pull request merges,
  with the few minutes of `main`'s old Dependabot copy noted.
- **N15.** `restore-drill.db.test.ts:75` joins the wording list.
- **N16.** ADR 0062 "appends at the end (`:1353`)"; the reconciliation-001 row likewise (end of 49514e8's 599 lines).

**Open questions after this review:** CQ1 (corrected), CQ2 (unchanged) and CQ3 (new), all in §3.2.6. Each blocks only
a few lines, and the merge waits for all three.

**Ruled (the co-founder, 2026-10-26 ~00:20 UTC: "Don't ask for approvals anymore just build and optimize"; recorded in
lanes/lane-b.md):** each takes its recommended option, the safer one.
- CQ1 (a): Dependabot's npm cooldown is `default-days: 3`, with no semver-specific days. Actions and images keep 7.
- CQ2 (a): `trustPolicyExclude: ['semver@6.3.1']`, mirrored in `tools/check-toolchain/trust-exceptions.json`.
- CQ3 (a): check-toolchain holds `packageManager`'s pnpm to the three-day age unless a live dated exclude names it.

ci-deps is ready for builders. P1 to P8 (§3.2.6) are queued as their own items under "improve as you go"; ci-deps does
not take them.

### 3.3 `co-001/ci-browser` (audit #19, upgrade part)

Revised on 2026-10-26 at `claude/build-platform` 6ddd587, after ci-speed (#43), ci-mutation (#44) and PR 15 (#45)
merged, and written as the branch will be cut: from the build branch **after ci-deps merges** (§2), so on top of §3.2
as re-read (§3.2.1 to §3.2.7). It does not wait for the checklist pull request (`co-001/ux-brand-reviewer`): the
orchestrator's brief for the CI session (2026-10-26 ~00:40 UTC, on the co-founder's direction of 2026-10-25 ~23:40 UTC
to speed the build) runs acceptance 9's UX and brand review from `.claude/agents/ux-brand-reviewer.md` if that pull
request has merged by then, and otherwise from `designs/lane-b-ux-review-brief.md` and `.claude/rules/brand.md`, which
the checklist is written from (§3.3.6, S7). In §3.3.1 to §3.3.4 every `file:line` reads at 6ddd587; a cite in a file ci-deps changes is
marked "(moves with ci-deps)", and §3.3.5 says how the builder re-reads it. §3.3.5 also lists each change from the
2026-10-24 text with its evidence, and §3.3.6 each finding of the adversarial review of this re-read with its
disposition. Sources: the two scout reports of 2026-10-26, `scratchpad/ci-browser/scout-files.md`
and `scout-versions.md` (copied to `designs/lane-b-ci/scout-ci-browser-{files,versions}.md` with this text), cited as
[SF] and [SV]; [S3], the 2026-10-24 Playwright scout; and the code and the network, re-checked here.

The rulings this section follows:
- the founder's **F4** (yes, standing): `publish-content.yml`'s `runs-on` changes once, to `ubuntu-26.04`, by this pull
  request, which edits `tools/test/frozen/publish-content.yml` (ci-deps') in the same commit;
- the founder's **F5**, as recommended (relayed by the co-founder, 2026-10-25 ~01:10 UTC): the release's capacity chain
  stays on `ubuntu-24.04` (`release.yml`'s `build`, `capacity`, `push` and `report`; `release-dry-run.yml`'s `build` and
  `push`; `screening-capacity.yml`'s `capacity`); every other job moves to `ubuntu-26.04`; the image binding becomes
  store-independent; a `workflow_dispatch` input runs one advisory 26.04 probe, and its numbers decide the later move
  (issue #41, O5);
- the co-founder's **Q2** (2026-10-25 ~21:05 UTC): `shell.tsx` and the capacity harness are #42 files that ci-browser
  may change under LANES rule 6; ci-browser does not wait for #42; the axe sweep over #42's pages (O6) runs in whichever
  merges second;
- the co-founder's ruling of **2026-10-26 ~00:20 UTC** ("Don't ask for approvals anymore just build and optimize"):
  every choice takes its recommended option, for security the safer one, without asking. **A9's inspection** of the
  seven regenerated baselines is done by an adversarial visual-inspection agent (every old and new baseline at full
  resolution, pixel-difference counts and crops), published as a private artifact gallery whose URL goes in the pull
  request; it does not block the merge (`lanes/lane-b.md:714`).

Nothing here goes to the founder or the co-founder before the merge. The carry-ins of `lanes/lane-b.md:135-146` are
folded in: V3 (§3.3.1, "The browser jobs' system packages"), O6 and O7 (§3.3.1, "Conditional work"), and the browser
layout (§3.3.1, "Local browsers").

#### 3.3.1 What changes

- **Versions** (`npm view <pkg> dist-tags time --json`, 2026-10-26 00:47 UTC, [SV] §1):

  | Package | Where (at 6ddd587) | From | To | Published (UTC) | Three days old from |
  |---|---|---|---|---|---|
  | `@playwright/test` | `apps/web/package.json:48` | 1.56.1 | **1.64.1** | 2026-10-14 11:58:13 | 2026-10-17 |
  | `playwright-core` | `apps/worker/package.json:53`, `tools/package.json:33` (`:32` at 49514e8; `:34` at 2ab2b15, 3.3.7) | 1.56.1 | **1.64.1**, as one catalog line | 2026-10-14 11:54:58 | 2026-10-17 |
  | `playwright` (through `@playwright/test`) | lockfile | 1.56.1 | 1.64.1 | 2026-10-14 11:54:49 | 2026-10-17 |
  | `@axe-core/playwright` | `apps/web/package.json:47` | 4.13.0 | **4.14.0** | 2026-10-15 13:33:17 | 2026-10-18 |
  | `axe-core` (through it, `~4.14.0`) | lockfile (`pnpm-lock.yaml:2490`; `:2537` at 2ab2b15, 3.3.7) | 4.13.0 | 4.14.0 | 2026-10-05 17:43:36 | 2026-10-08 |

  - All are npm `latest`; no stable release follows 1.64.1 (`git ls-remote --tags https://github.com/microsoft/playwright
    'v1.64*' 'v1.65*'`: v1.64.0 and v1.64.1 only; `next` is 1.65.0-alpha-2026-10-25; on 2026-10-27 it is 1.65.0-alpha-2026-10-26, axe's `next` and `rc` are 4.14.1
    prereleases, and no 1.64.2, 1.65.0 or 4.14.1 stable exists, 3.3.7). axe's later tags are prereleases only.
  - **ci-deps' gates pass them with no exclude.** `minimumReleaseAge: 4320`: every version is over three days old.
    `trustPolicy: no-downgrade`: every one is published by a GitHub Actions trusted publisher with SLSA v1 provenance,
    as were 1.56.1 and 4.13.0, so no evidence drops ([SV] §2, scored from the full packuments with
    `scratchpad/ci-browser/scripts/trust.js`). From 1.64.0 and 4.14.0 the publisher's `oidcConfigId` drops its `oidc:`
    prefix with the same UUID; phase 2's install under the gates proves pnpm reads that as no downgrade (3.3.7). No
    `trustPolicyExclude` or `minimumReleaseAgeExclude` entry is added (the file's `semver@6.3.1` exclude and qs override
    are ci-deps' and untouched, 3.3.7), and `check-toolchain`'s lockfile rule passes.
  - **No new transitive package, and one fewer.** `@playwright/test` 1.64.1 depends on `playwright` 1.64.1, which
    depends on `playwright-core` 1.64.1 alone: 1.64.1 has no `optionalDependencies` (`npm view playwright@1.64.1
    dependencies optionalDependencies --json` → `{"playwright-core": "1.64.1"}`), where 1.56.1 had `fsevents` 2.3.2.
    `fsevents@2.3.2` is referenced only by playwright (`pnpm-lock.yaml:2877, :5946, :6376`; `:2924, :6001, :6431` at 2ab2b15, 3.3.7), so the
    lockfile loses it; `fsevents@2.3.3` stays for its other users. `@axe-core/playwright` 4.14.0 depends on
    `axe-core ~4.14.0`, peers on `playwright-core >=1.0.0`, and needs Node >=22.12.0, which `package.json:6-8`'s `>=24`
    meets. next 16.4.3's optional peer `@playwright/test ^1.51.1` holds. The lockfile diff is version swaps plus
    `fsevents` 2.3.2 removed (§3.3.6, N1), written by pnpm 10.34.8 under the gates.
  - **`playwright-core` becomes one catalog line.** The worker and the tools name it with the same literal today, and
    ci-deps' `no-duplicated-versions.test.ts` requires every catalog package to be `catalog:` in every manifest
    (§3.2.3; `no-duplicated-versions.test.ts:124-139` at 2ab2b15, root included, 3.3.7). So `pnpm-workspace.yaml`'s
    catalog gains `playwright-core: 1.64.1` (between `pg` and `react`, 3.3.7), and both manifests say `catalog:`.
    That takes P5's playwright-core pair (§3.2.6) here, where the lines change anyway. `@playwright/test` and
    `@axe-core/playwright` have one manifest each and stay literal. Dependabot's `browser-tests` group (ci-deps)
    updates catalog entries as it does vitest's.
- **The worker image installs the lockfile's playwright-core, with no version of its own.**
  - Today `apps/worker/Dockerfile:23` (moves with ci-deps, which adds the trixie `FROM` digests and derives pnpm) runs
    `npm install --no-save --omit=dev playwright-core@1.56.1`: a literal that #38 showed can drift from the manifest
    ([S3]), fetched from the registry with no integrity pin, so the comment at `:16-17` ("at the version the lockfile
    pins") is not enforced.
  - **The change (best of three):** the build stage, which already installs with `pnpm install --frozen-lockfile
    --filter "@tp/worker..."` (`:9`; pnpm checks every tarball's integrity there, under ci-deps' gates), copies the
    resolved package out with `cp -RL apps/worker/node_modules/playwright-core /out/playwright-core`. The runtime stage
    takes it with `COPY --from=build /out/playwright-core ./node_modules/playwright-core` and installs its browser with
    `node node_modules/playwright-core/cli.js install --with-deps chromium-headless-shell`. npm, npx and corepack are
    still removed after (`:27-28`), and the `npm cache clean` line goes.
  - Not chosen: (b) the 2026-10-24 text's `node -p` of the manifest's version into `npm install`, which keeps the
    unpinned registry fetch and, once the manifest says `catalog:`, reads no version at all; (c) a literal held equal by
    a test, which is the duplication A4 (b) forbids.
  - Debian 13 (ci-deps' base) is a supported host for 1.64.1 (`lib/coreBundle.js:9248` `hostPlatform: "debian13"`,
    `:33142` the `debian13-x64` table, `:34270` the headless shell from CfT; [SV] §8).
  - `tools/test/browser-version.test.ts` (new) requires `@playwright/test`, the catalog's `playwright-core` and the
    lockfile's resolutions of `playwright`, `playwright-core` and `@playwright/test` to name one version, the lockfile's
    `axe-core` to satisfy `@axe-core/playwright`'s range, and the worker Dockerfile to name no playwright-core version
    and to copy it from the build stage. `browser.json` names no Playwright version (§3.3.6, S9): its `revision` and
    `browserVersion` bind, and `browser-build.ts` compares them with the installed playwright-core's `browsers.json`. It replaces
    `tools/screening-capacity/measure.test.ts:232` (`expect(workerPlaywrightVersion()).toBe('1.56.1')`), whose comment
    above it says it holds the image's version and does not.
  - `workerPlaywrightVersion()` (`tools/screening-capacity/containers.ts:544-548`) reads the manifest, which will say
    `catalog:`; it reads the installed `apps/worker/node_modules/playwright-core/package.json` instead.
    `processImagesProblems`' message (`:568-570`) and the runbook's process layout
    (`docs/runbooks/screening-capacity.md:467`, `:464` at 49514e8) name the image's own method, `cp -RL
    apps/worker/node_modules/playwright-core <images>/worker/node_modules/`, and no version.
- **WCAG 2.5.3 fixes: real findings of axe 4.14.** `label-content-name-mismatch` loses its `experimental` tag in 4.14.0
  (axe-core 4.13.0 and 4.14.0 `axe.js`; CHANGELOG at v4.14.0:11, "Enable rule by default (#5421)"), so every
  `AxeBuilder` scan with `wcag21a` runs it ([SV] §7). `a11y.ts:12` scans with `['wcag2a','wcag2aa','wcag21a','wcag21aa']`,
  and fourteen specs call `expectAccessible` on shell pages, 72 calls in all at 2ab2b15 (twelve and 66 at 6ddd587; 3.3.7), so the fix is needed for the whole
  suite, not only for brand. Both findings are in `apps/web/src/components/shell.tsx` (unchanged since 49514e8):
  - `:56` `<summary … aria-label="Practice switcher">`, whose visible text is the practice's name (`:57`) →
    ``aria-label={`${current?.name ?? 'Choose a practice'}, practice switcher`}``;
  - `:84` `<summary … aria-label="Account menu" title={shell.email}>`, whose visible text is the initial (an
    `aria-hidden` span, `:85-87`) and, from `md` up, the email (`:88`) → ``aria-label={`${shell.email}, account menu`}``,
    with the initial drawn as CSS generated content (`data-initial`, `before:content-[attr(data-initial)]`), so it is
    not a text node;
  - verified axe-clean and pixel-neutral on the header ([S3] M4, M5);
  - `brand.spec.ts:330-331` and `sign-in.spec.ts:18` reach the two controls with `getByLabel('Practice switcher')` and
    `getByLabel('Account menu')`; both still match, since `getByLabel` is a case-insensitive substring match by default.
    No other spec names them ([SF] §3);
  - **#42 and `shell.tsx`:** #42 adds 4 lines in two hunks, `@@ -156,6` (`| 'console_mail'`) and `@@ -259,6` (a
    `RailLink` "Mail streams"), neither near `:56` or `:84`, so the two merge cleanly in either order (`pulls/42/files`,
    [SF] §3);
  - a computed check in `brand.spec.ts`'s header step (`:325-345`), at 1280 and 390 px, holds each header control's
    accessible name to contain its visible text, lower-cased and whitespace-folded, as WCAG 2.5.3 reads (CI-19). One
    mechanism each (§3.3.6, N9): the **name** by `toHaveAccessibleName` (3.3.7: an aria snapshot prints a `summary`'s text, not
    its name, `brand.spec.ts:189`); the **visible text** from `locator.evaluate` as `innerText` plus each descendant's
    `getComputedStyle(el, '::before').content` (unquoted, `none` dropped), so the initial drawn as generated content
    counts. At 390 px the account control's only visible text is that initial, which `innerText` alone would miss, and
    axe answers "incomplete", not a violation, for a one-letter label (axe-core 4.14.0 `axe.js:30885-30886`,
    `is_human_interpretable < 1`), so this check is the only guard there. It is a step of the existing journey, not a
    new test, so e2e stays at the base's count (51 at 6ddd587; 54 at e908c21, 3.3.7).
- **The browser build, recorded and checked.**
  - Playwright 1.64.1 pins chromium and chromium-headless-shell at **revision 1248, Chrome for Testing 156.0.8078.4**
    (`raw.githubusercontent.com/microsoft/playwright/v1.64.1/packages/playwright-core/browsers.json`; the published
    tarball's says the same). Its executables are CfT's own layout, `chrome-linux64/chrome` and
    `chrome-headless-shell-linux64/chrome-headless-shell` (`coreBundle.js:34170-34185`). The headless shell is the
    one that renders the baselines and prints the worker's PDFs; full Chromium must be present for
    `playwright.config.ts`'s `bundledChromium` probe (`existsSync(chromium.executablePath())`), or the config falls back
    to Google Chrome.
  - **`apps/web/e2e/browser.json`** (new) records both builds, from Google's bucket
    (`storage.googleapis.com/chrome-for-testing-public/156.0.8078.4/linux64/`, both zips downloaded under the lock, each
    MD5 equal to GCS's `x-goog-hash`, [SV] §3):

    | Field | headless shell | chromium |
    |---|---|---|
    | `dir` | `chrome-headless-shell-linux64` | `chrome-linux64` |
    | `path` | `chrome-headless-shell-linux64/chrome-headless-shell` | `chrome-linux64/chrome` |
    | `treeSha256` (every file of the build; what CI checks) | `333985b325984894be390c5275ab467ff9ee99ef55414ba6abe2222b2454172e` (287 files) | `2f991090d91aec41a37cbe49da4d6b3a03cd575dbd9d3daa6a1f36440d129545` (301 files) |
    | `sha256` (the binary; named in the message) | `4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6` | `377a9fc07b495c3b8d0ab8ec1fdfd153641759f9756fea34d8dfce4de82f5025` |
    | `zip` | `chrome-headless-shell-linux64.zip` (125,797,539 bytes) | `chrome-linux64.zip` (200,345,244 bytes) |
    | `zipSha256` (the local layout's pin) | `c3e50596aef52c58f8fda3c6b3411c33d34c88b177b3ed1c2243359fd3b8ba20` | `43fd31766c7533a02dda2ded5ad50c2f861cd5400be7509c0abad71129f79d79` |

    plus `revision` (1248) and `browserVersion` (156.0.8078.4); no Playwright version, which the manifests and the
    lockfile already say (§3.3.6, S9).
    - **`treeSha256`** (§3.3.6, S3) binds the whole build, not one file: the headless shell's zip has 287 files, among
      them `libGLESv2.so`, `libEGL.so`, `libvk_swiftshader.so` (the software GL that draws the pictures), `icudtl.dat`
      and the `.pak` resources, all of which affect rendering, and Playwright verifies no download (no checksum in
      `coreBundle.js`) while the browsers cache is restored by key alone (`ci.yml:185-191`). It is the SHA-256 of the
      lines `"<sha256>  <path>\n"` of every regular file under `dir`, sorted by path bytes: exactly
      `cd <revision dir> && find <dir> -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum`.
      The values above were computed from the zips with no extraction
      (`python3 -I scratchpad/ci-browser/scripts2/ztree.py <zip>`, 2026-10-26 01:29 UTC: 287 files, no symlinks; 301
      files and 8 directory entries, no symlinks). Playwright's two marker files (`INSTALLATION_COMPLETE`,
      `DEPENDENCIES_VALIDATED`) sit beside `dir`, not under it, so they are outside the tree.
    - Three hashes per build, because CI hashes the unpacked tree (Playwright deletes the zip after unpacking), the
      message names the binary, and the local layout is pinned by the zip (`setup-container.sh`'s `CFT_BUILDS`,
      `:957-960` on claude/build-ops 99b2e05, `:967-968` on c2041dfc (3.3.7), whose two 1248 rows equal these zip SHA-256s). The binary hashes were
      read through `zipfile` with no extraction (`python3 -I scratchpad/ci-browser/scripts/zsha.py <zip> <member>`).
  - **`tools/ci/browser-build.ts`** (new; `node:` imports only, run as `node tools/ci/browser-build.ts`, with Node 24's
    type stripping). It reads `browser.json` and the installed playwright-core's `browsers.json`, requires their
    revision and version to agree, finds both builds under `PLAYWRIGHT_BROWSERS_PATH` or `~/.cache/ms-playwright`,
    computes each `treeSha256` (about 1 s for about 500 MB) and the binary's SHA-256, prints
    `chrome-headless-shell --version` and the hashes, and **fails** on any difference.
    - **Finding playwright-core** (§3.3.6, S5). pnpm does not hoist it: `apps/web/node_modules` holds only
      `@playwright` and the root `node_modules` no `playwright*` (`ls` at 6ddd587). So it resolves the chain with
      `createRequire` from `apps/web/package.json`: `@playwright/test/package.json` → `playwright/package.json` →
      `playwright-core/package.json`, each exported as `./package.json` (the 1.64.1 tarballs and the installed
      `@playwright/test`), and reads `browsers.json` beside the last.
    - **`--image <ref>`** needs no `node_modules`: it reads the image's own
      `/app/node_modules/playwright-core/browsers.json` (`docker run --rm --entrypoint cat <ref> …`) and computes the
      headless shell's tree inside the image (`docker run --rm --entrypoint sh <ref> -c 'cd
      /ms-playwright/chromium_headless_shell-<rev> && find … | sha256sum'`, the command above), against the same
      record. Every job that runs it takes `actions/setup-node` with Node 24 before it, so the type stripping does not
      depend on the runner image's own Node (3.3.8, S6: the rule is the Node, not the cache inputs; the check imports
      only `node:` modules, so a restored pnpm store cannot reach it). The cache inputs stay each job's own: off in
      `ci.yml`'s `images` (`:719-723`) and the release's build (`release.yml:148-151`, ci-deps' no-cache rule), `cache:
      pnpm` as they stand in the two weekly capacity jobs (`screening-capacity.yml:201`, `release-capacity.yml:72`).
    - **Where it runs** (§3.3.6, S4): the step **right after every `CHROMIUM_INSTALL`** in every workflow: `unit`,
      every `db` and `e2e` shard (`ci.yml:191, :267, :429`), `large-zip.yml:37`, `release.yml`'s `capacity` (`:157`)
      and `screening-capacity.yml`'s `capacity` (`:177`), before any test and before any cache is saved, so a build
      that fails the check is never cached. With `--image` on the worker image: in `ci.yml`'s `images`, and in
      `release.yml`'s and `release-dry-run.yml`'s `build` before `docker save`, so the worker image that ships is held
      to the record, not only another build of its Dockerfile (both builds already run repository code; `push` and
      `report` stay clean). The worker prints customers' PDFs with that headless shell. Also on the two measured worker images,
      `release-capacity.yml`'s and `screening-capacity.yml`'s `capacity` (3.3.7).
    - **The tests still run after a red check** (§3.3.6, S9). The steps after the check (the tests, the db shards, the
      journeys, the baseline step) take `if: ${{ !cancelled() && steps.browser-install.outcome == 'success' }}`, the
      install step carrying `id: browser-install`: a failed browser check leaves the job red but still shows what the
      new browser does to the suite, while a failed install, or any earlier failure, still stops the job. The cache
      saves keep the default `success()`, so a build that failed the check is never cached.
    - **The deliberate red.** Every `browser-tests` bump brings a new CfT build, so its hashes differ and that pull
      request fails here by construction until a person runs ADR 0058's procedure: the one exception to A4 (c), named
      in A4, CI-18, `docs/runbooks/ci.md` and `dependency-upgrades.md` (ci-deps). The check stays, because a new browser
      under unchanged baselines is exactly what ADR 0058 forbids. Since every later step still runs, the bump's other
      failures (a broken journey, a moved baseline) show in the same run, and acceptance 10 can observe them.
    - The message: "The headless shell is <found version> (revision <found>, tree SHA-256 <found>, binary SHA-256
      <found>), and browser.json records <expected version> (revision <expected>, tree SHA-256 <expected>, binary
      SHA-256 <expected>). A Playwright upgrade needs ADR 0058's baseline procedure: docs/runbooks/ci.md, 'Upgrading
      the browser'." (and the same form for chromium). When only the tree differs, it names every path whose SHA-256 differs from the
      committed list (`apps/web/e2e/browser-builds/<dir>.sha256`) and prints the found list in full, as `--list` does, so
      one CI run gives a new record (3.3.7).
  - **Where CI downloads from.** `playwright install` fetches the build from `cdn.playwright.dev/builds/cft/156.0.8078.4/linux64/*.zip`,
    Playwright's mirror of CfT, not Google's bucket (`coreBundle.js:33999-34006, 34225, 34260`).
    `PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST` cannot point it at Google: the override keeps the `builds/cft/<ver>/…` path
    (`:35014-35019`), and Google's bucket is `<ver>/linux64/…` ([SV] corrections 2-3). That the mirror's bytes equal
    Google's is unproven, since the proxy refuses `cdn.playwright.dev`. [S3] M7 proved it for 141; for 156 the first CI
    run proves or refutes it. **If they differ,** the check fails on that first run, `browser.json`'s `treeSha256` and
    `sha256` take CI's printed values (the zip fields keep Google's, marked as the local layout's only), the baselines come from
    CI's baseline step (below), and the PR records it as a finding against ADR 0058's "Google's build renders as
    Playwright's".
- **The baselines.**
  - Regenerated with `pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots=all` on CfT
    156.0.8078.4 under 1.64.1 (`=all` rewrites every snapshot, matching or not; 1.64 renamed the bare flag's modes),
    on CI's 1248 through the baseline step while no local layout can be made (3.3.7; the procedure in §3.3.7). All
    seven are committed (`apps/web/e2e/brand.spec.ts-snapshots/`, at 6ddd587:
    header-1280 9,995 bytes, blob f1837c27; header-390 5,418, ca184879; header-lockup-1280 2,797, ac324b65;
    header-lockup-390 2,802, 163dd863; report-cover-top 4,638, 99d56128; report-cover-with-seal 49,661, b7cc1b6e;
    report-cover-without-seal 35,355, a8659238; [SF] §3).
  - **Why CI must prove the bytes.** The comparisons carry tolerances (`brand.spec.ts:69` `VISUAL`:
    `maxDiffPixelRatio: 0.01`; `:77` `STRICT`: `threshold: 0.05, maxDiffPixels: 6`), so a green journey does not prove
    that CI renders the committed bytes, and the local host is Ubuntu 24.04.5 (`/etc/os-release`) while CI compares on
    ubuntu-26.04, whose `--with-deps` installs other font packages ([SV] §5).
  - **The baseline step** (ci.yml's `e2e (1/M)`, after the shard's tests, `if: ${{ !cancelled() &&
    steps.browser-install.outcome == 'success' }}`, so it also runs after a red browser check and gives a bump's
    pictures as CI renders them):
    - **When it runs: on every pull request and every push run, with no diff condition** (§3.3.6, B1). The seven
      pictures are drawn by application code as well as by the six rendering inputs a diff list could name: the header
      by `apps/web/src/components/shell.tsx`, the lockup components, `globals.css` and the brand tokens; the covers by
      worker code the journey imports (`brand.spec.ts:10-12`: `worker/src/mail/mail`, `mail/template`,
      `reconcile/statement-html`). The journey's own comparisons pass a change under 1% (`brand.spec.ts:69` `VISUAL`),
      so a diff-gated step would let such a pull request merge green and turn the next push run red on the build
      branch, with no pull request open to fix it; ADR 0058 names that case itself (`:225`, "A deliberate change to the
      header or the cover … may need new baselines"). The cost is one more run of one spec on one shard; the PR
      measures it (the step's duration on its own runs) and ci.md records it. If it is ever too slow, the inputs are
      derived from the import closure of `brand.spec.ts` and the header's components by `watched.ts`' mechanism, never
      a hand list. Push runs also catch a weekly runner image that moves a font package, off the merge path.
    - **What it does:**
      1. `rm` the seven `apps/web/e2e/brand.spec.ts-snapshots/*-chromium-linux.png`, so a picture the run does not
         reach shows as a deleted file, not as an unchanged one (`--update-snapshots=all` writes only the screenshots a
         run reaches, and over an equal file writes nothing: `playwright/lib/matchers/expect.js:12620-12660` in 1.64.1);
      2. `E2E_PREBUILT=1 pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots=all
         --retries=0`, its output kept, and its exit status required to be 0 (kept in a variable so the pictures are
         still printed, then enforced at the end). `--retries=0` because `playwright.config.ts:83` retries once on CI,
         and a retried attempt would find the first attempt's files and print other lines;
      3. (3.3.7: replaced by the set written equal to `git ls-files` of the committed baselines, `ci.yml:607, :623`)
         exactly seven lines `A snapshot doesn't exist at <path>, writing actual.` in that output, one per baseline
         (the message of a missing file under `all`, `expect.js:12484-12487`; the review's "is re-generated" is the
         message for an existing file that differs, which step 1 rules out);
      4. `git diff --exit-code -- apps/web/e2e/brand.spec.ts-snapshots` (a deleted or changed file fails), and the seven
         files' SHA-256s printed.
    - **On a difference or a failure** it fails and prints each changed picture as a `path base64` line, in the form
      of the failed comparisons' step (`ci.yml:453-462` at 6ddd587, moves with ci-deps; the 2026-10-24 text's
      `:103-108`), so a person can commit CI's bytes and inspect them (3.3.7: in chunks, `<path> <i>/<n> <8,000 characters>`,
      each picture's SHA-256 first).
    - The ci-browser pull request records its passing run, with the seven SHA-256s, as ADR 0058's proof that CI renders
      the committed bytes.
  - **A local no-op too** (3.3.7: waiting on the person, storage.googleapis.com; CI's from-nothing run is the proof
    until then). A second `--update-snapshots=all` on the local layout leaves `git status` clean. If the local
    host and CI disagree, CI's bytes are committed (CI is where comparisons run) and the disagreement is recorded as a
    finding against ADR 0058's host-independence claim (`:162-176`), which is amended with it.
  - **A9: the inspection, by an adversarial visual-inspection agent** (the 00:20 ruling). Once the baseline step has
    passed on the head:
    - the agent reads every old baseline (the 6ddd587 blobs above) and every new one at full resolution;
    - for each it gives the changed-pixel count twice, exact (any byte) and under the journey's own comparator settings
      (`VISUAL` or `STRICT`), the bounding box of the changed pixels, and three crops of that box (old, new,
      difference), and checks ADR 0058's brand points on the new image: the lockup and keystone, the brand colours, the
      faces, the seal and its definition line on the with-seal cover, and a blank Paper foot on the without-seal cover.
      For comparison, [S3] M5 measured six at 0 px and the without-seal cover at 1,611 px between 141 and 156;
    - its verdict per image is pass or a finding; a finding is fixed in the PR (regenerated, or the cause fixed)
      before the merge;
    - (3.3.7) the session records the pictures side by side, the counts, the crops and the agent's verdict in
      `designs/lane-b-ci/ci-browser-a9.md`, which the PR links, in place of a private gallery. The co-founder may
      look at it; it does not block the merge.
- **The browser jobs' system packages, cached and verified (V3).**
  - **Measured** ([SF] §6, `scratchpad/ci-browser/logs/`): push runs install in 12-29 s, but #45's pull-request run
    40226881568 spent 609 s of `db (4/4)`'s 13:02 in `playwright install --with-deps chromium` (19:37:46 → 19:47:55):
    the browsers came from the cache, the index update took 1 s ("Fetched 12.6 MB in 1s"), and then "Fetched 25.9 MB in
    9min 59s (43.3 kB/s)" from `azure.archive.ubuntu.com`, one package at a time (job 121270018490). Over the last 14
    ci.yml runs (`awk '{print $1}' logs/install-durations.tsv | sort -u | wc -l` → 14; §3.3.6, N2), 10 of 92 installs took over 60 s (86-612 s), all on pull-request runs. About one install in nine
    stalls on the mirror, and the stall sets the job's length.
  - **What Playwright runs:** `sudo -- sh -c "apt-get update&& apt-get install -y --no-install-recommends <libraries>"`
    (`coreBundle.js:33435-33444, :33681-33688`). sudo resets the environment, so an `APT_CONFIG` variable would not
    reach apt; the cache goes into apt's own archive directory instead.
  - **What apt checks, and what it does not.** apt takes a file already in `Dir::Cache::Archives` as downloaded when
    **its size** matches the index; it does not hash it (Debian/apt main 6b128124, `apt-pkg/acquire-item.cc:3578-3591`,
    "Make sure the size matches"). So a restored archive must be verified before apt sees it: this corrects [SF] §6's
    "apt checks every `.deb` against the SHA-256 in the Packages index".
  - **The design** (`tools/ci/apt-archives.sh`, under `set -euo pipefail`, with two commands):
    1. A step `id: runner-image` writes two outputs to `$GITHUB_OUTPUT`: `key=$ImageOS-$ImageVersion` and
       `os=$ImageOS` (§3.3.6, N3). These are the runner's environment variables, not the `env` context, which holds
       only what a workflow sets, so `${{ env.ImageOS }}` would be empty ([SF] §6's key form).
    2. `actions/cache/restore` (ci-deps' pin) of `$RUNNER_TEMP/apt-archives`, key
       `apt-v1-${{ steps.runner-image.outputs.key }}-${{ hashFiles('node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json') }}`
       (3.3.7: the installed `browsers.json`, as the browsers' cache key), restore-keys
       `apt-v1-${{ steps.runner-image.outputs.key }}-` and `apt-v1-${{ steps.runner-image.outputs.os }}-` (the image's
       weekly update and a rollout that mixes image versions still reuse last week's files).
    3. `tools/ci/apt-archives.sh verify "$RUNNER_TEMP/apt-archives"`: `sudo apt-get update` (the signed `InRelease`
       indexes, fresh), then for each `*.deb` its package, version and architecture from apt's own file name
       (`name_version_arch.deb`, `%3a` for an epoch's colon), its expected `SHA256` from `apt-cache show
       "name:arch=version"` (the index just fetched), and `sha256sum`. A file that matches is copied with `sudo cp` into
       `/var/cache/apt/archives/`; a file that differs, or whose version the index no longer lists, is deleted. It prints
       the counts kept and discarded, never fails on a bad file (apt then downloads that package), and fails only when
       apt itself fails.
    4. The install (`CHROMIUM_INSTALL`, `tools/test/ci-chromium.ts:12`), unchanged but for `id: browser-install`
       (§3.3.1, the browser check): it now downloads only what the cache lacked.
    5. The browser check (above).
    6. In `unit` only, on a miss (`cache-hit != 'true'`, as the browsers' save, `ci.yml:192-197`) and off
       `pull_request` (3.3.7): `apt-archives.sh
       collect "$RUNNER_TEMP/apt-archives"` copies `/var/cache/apt/archives/*.deb` there and gives it to the runner's
       user, then `actions/cache/save` under the primary key. `apt-get` keeps what it downloads
       (`APT::Keep-Downloaded-Packages` defaults to false only for the `apt` binary); `verify` also writes
       `/etc/apt/apt.conf.d/90paidwhole-keep-archives` (`APT::Keep-Downloaded-Packages "true";`), so the property is
       set, not assumed, and `collect` warns when it finds no file.
  - **Where:** `ci.yml`'s `unit` (restore, verify, save), every `db` shard and every `e2e` shard (restore and verify);
    `large-zip.yml` (restore and verify; 26.04, as unit); `screening-capacity.yml`'s `capacity`, which stays on 24.04 and
    so has its own key (`ImageOS` `ubuntu24`): restore, verify, and save on a miss. `release.yml` takes no cache, by
    ci-deps' rule (§3.2.1), and its one install stays uncached. content-calendar and release-capacity take none: neither
    installs a browser on the runner (3.3.7).
  - **The capacity job watches what it runs** (§3.3.6, N7). `screening-capacity.yml`'s `capacity` runs
    `tools/ci/apt-archives.sh` and `tools/ci/browser-build.ts`, but neither its push `paths` (`:29-43`) nor the watched
    list names `tools/ci/**`, so a change to either would not run on that job's 24.04 image until a later push or the
    weekly run. Both files join `WATCHED_FIXED` (`tools/screening-capacity/watched.ts:62`), the push paths and
    `workflows.test.ts`' `pushPaths`, and `watched-paths.txt` is regenerated with `watched.ts --write`: ci-deps' own
    mechanism for `docker-compose.yml` (§3.2.1, §3.2.7 S1). `watched-paths.txt` is a #42 file: it is regenerated
    after either merge, never hand-merged (§3.3.2, the #42 table).
  - **Trust:** the cache can only save bandwidth. Every file apt uses has the SHA-256 that the archive's signed index
    gives for that exact version, so a tampered, truncated or stale file is discarded and fetched again. A pull
    request's cache is scoped to its own ref, and the base branch's is written only by runs of the build branch's own
    code (push, schedule, dispatch), since under F1 (a) the build branch is the default branch (§3.3.6, N8). ci.md's
    Caches paragraph (`docs/runbooks/ci.md:148-149`, "only push runs on the build branch write the base branch's") is
    reworded to match.
  - **Invalidation:** the key changes with the runner image (`ImageOS`, `ImageVersion`, weekly) and with the browser
    build (playwright-core's installed `browsers.json`, 3.3.7, which moves with every Playwright bump and so with Playwright's dependency list). A security
    update in the archive is a new version: its file is missing from the cache, so apt fetches it, and the next miss in
    `unit` saves it. About 26 MB per image.
  - **Not chosen:** a hand-kept `.deb` set installed with `dpkg -i` (loses the index check and goes stale with every
    security update); Playwright's container image for the jobs (changes the rendering host the baselines depend on;
    ADR 0058:214 rejected it, and compose Postgres would need Docker in Docker); dropping `--with-deps` (CI-05 requires
    it, `workflows.test.ts:228, :1582-1583`, and its fonts are part of the rendering host); another mirror (moves the
    throttle, does not remove it).
- **Runners (F5, as recommended; A8).**
  - **At 6ddd587, 23 jobs, all `ubuntu-24.04`** (`grep -n runs-on .github/workflows/*.yml`): approval-of-record `:27`;
    ci.yml `:34` static, `:156` lint, `:169` unit, `:231` db, `:319` domain-model, `:360` build, `:395` e2e, `:468`
    images, `:527` all-green; large-zip `:18`; mutation `:42` changes, `:72` stryker, `:116` mutation; publish-content
    `:23`; release `:29` build, `:131` capacity, `:204` push, `:251` report; screening-capacity `:64` changes, `:132`
    capacity, `:241` gate, `:277` notify. ci-deps' `release-dry-run.yml` adds `build` and `push`: **25 jobs** (3.3.7: and `capacity`, 26; the base's #49 adds
    four more, **30 at 2ab2b15**).
  - **8 stay on `RELEASE_RUNNER.label`** (3.3.7 and 3.3.8; 7 in the 2026-10-26 text), which stays `ubuntu-24.04`
    (`tools/screening-capacity/launch-check.ts:107` at 2ab2b15): `release.yml`'s `build`, `capacity`, `push` and
    `report`; `release-dry-run.yml`'s `build`, `push` and `capacity`; `screening-capacity.yml`'s `capacity`. **22 move to
    `ubuntu-26.04`** (3.3.8; content-calendar's two jobs and release-capacity's two among them), `publish-content.yml`'s `publish` with its
    frozen copy (F4).
  - **Why 26.04 needs 1.64.1, together.** 1.64.1 is the first of the two versions to support Ubuntu 26.04
    (`coreBundle.js:9230`, `isOfficiallySupportedPlatform … "26.04"`; `:32773`, the `ubuntu26.04-x64` table). 1.56.1's
    `nativeDeps.ts` has tables for 20.04, 22.04 and 24.04 only ([SV] correction 4). No commit may move a browser job
    before the bump.
  - **The 26.04 image** (`actions/runner-images` `images/ubuntu/Ubuntu2604-Readme.md`, main, 2026-10-26; the newest tag
    `ubuntu26/20261023.163`, c3c3ced4): image 20261023.163.3, Ubuntu 26.04.1 LTS, kernel 7.0.0-1017-azure, Node
    24.21.0, Docker client and server 29.4.2, Compose 5.1.3, Buildx 0.38.0, PostgreSQL 18.6 (service disabled). The
    image is generally available (its announcement #14747); `ubuntu-latest` moves to it in November 2026 (#14748),
    which changes nothing here, since the runner rule refuses `-latest` ([SV] §5, correction 7). The 24.04 jobs run
    image 20261012.334.1 today (job logs 121270018490, 121281841727); 20261023.334.3 is current, with Docker 28.0.4,
    Compose 2.38.2 and PostgreSQL 16.15. (3.3.7: on 2026-10-27 the newest are `ubuntu26/20261026.180`, image
    20261026.180.1, Node 24.22.1, Buildx 0.38.1, Docker, Compose and PostgreSQL as above, and 24.04's 20261026.354.1;
    `ubuntu-latest`'s November move is not re-verified, `README.md:25` still mapping it to 24.04.)
  - **The restore drill runs.** `restore-drill.db.test.ts:96-102` skips when the client tools are older than the
    server (`:191-192`); on 24.04 `pg_dump` is 16 against server 18, which is db's one skip. On 26.04 the client is
    18.6, so the drill runs: db goes from 9,049 passed and 1 skipped to **9,050 and 0** (plus whatever ci-deps adds; it
    adds no db test). At e908c21: 9,222 and 1 → **9,223 and 0** (3.3.7). The comment at `:73-75` (reworded by ci-deps, moves with it) then says the drill runs on CI.
  - **`workflows.test.ts`.** The rule "every job on ubuntu-24.04" (`:349-360`; the 2026-10-24 text's `:160-171`)
    becomes: every job is on `ubuntu-26.04` except the named set `RELEASE_CHAIN` (the eight above, 3.3.8, by file and job),
    each of which is on `RELEASE_RUNNER.label`; the set is exact, so a job added to a release workflow must be placed by
    a test edit. It still refuses `-latest`, unversioned and larger runners (`:146-163`, `:362-405`; their fixtures
    keep 24.04 literals). The release capacity test (`:478-487`) holds both capacity jobs to `RELEASE_RUNNER.label`, as
    today. The comment at `:142` ("ubuntu-latest to Ubuntu 26.04 from 2026-10-19") becomes "in November 2026
    (runner-images #14748)", and `ci.yml:32-33`'s comment ("Playwright 1.56.1 predates it") names no version, since
    ci-deps' `no-duplicated-versions.test.ts` scans workflow comments.
  - **actionlint does not know `ubuntu-26.04`.** actionlint 1.7.7 (this machine's) fails a `runs-on: ubuntu-26.04` job
    with `label "ubuntu-26.04" is unknown … [runner-label]`, exit 1; `rule_runner_label.go` at v1.7.7, v1.7.12 (the
    latest release, still on 2026-10-27, 3.3.7) and main lists 22.04 and 24.04 only ([SF] §0 item 1). `workflows.test.ts:1285-1293` runs actionlint
    wherever it is installed and forbids its configuration file (`:355-359`). **The fix:** the test spawns actionlint
    with `-ignore 'label "ubuntu-26\.04" is unknown'`: one exact label, no configuration file, the ban kept, and
    removed when actionlint lists 26.04. Not chosen: an `actionlint.yaml` with `self-hosted-runner.labels`, which would
    reverse a ruled ban and call a hosted label self-hosted. CI has no actionlint, so that test stays unit's one skip
    (job 121281841727, log line 531).
- **An image binding that holds under either image store.**
  - **Today** `release.yml:107` and `:228` (moves with ci-deps, which removes caches and adds `overwrite`) and the
    harness (`run.ts:825`, comment `:821-824`) record `docker image inspect -f '{{.Id}}'`. That is the config digest
    only on the classic overlay2 store. Docker 29 defaults to the containerd image store on a fresh install
    (docker/docs `content/manuals/engine/storage/containerd.md:11-12`), and the 26.04 image installs Docker 29.4.2 with
    no `daemon.json` (runner-images `install-docker.sh`; `toolset-2604.json`), so there `.Id` is the manifest or index
    digest. The 24.04 capacity chain stays on overlay2 until GitHub changes `toolset-2404.json`'s docker-ce 28.0.4 pin
    (the 2026-10-24 text's "a weekly rebuild could bring Docker 29" overstated it, [SV] correction 5). The binding is
    made store-independent anyway, for the probe and for that change.
  - **`tools/screening-capacity/image-id.ts`** (new; `node:` imports only, so `node tools/screening-capacity/image-id.ts
    <archive>` runs with no install). It reads a `docker save` or buildx `type=docker` archive, plain or gzipped, as a
    stream (a ustar reader with pax headers): `manifest.json`'s `Config` when present (docker-archive, which Docker 25
    and later write beside `index.json`), else `index.json` → the linux/amd64 manifest → `config.digest`. It hashes the
    config blob's bytes as they pass and fails unless they equal the digest named, so the identity is computed from
    content, not taken from a name. It returns three digests (§3.3.6, S2): `config` (the config blob's), `manifest`
    (the linux/amd64 manifest's) and `target` (the digest of `index.json`'s top-level descriptor, which is what the
    containerd store's `.Id` names: an index when the image carries attestations, the manifest when it does not; absent
    for an archive with no `index.json`). A test holds it to `node:` imports.
  - **One manifest per image** (§3.3.6, S2). Every `build-push-action` step that feeds an identity check
    (`release.yml:61`, `release-dry-run.yml`'s copy, `ci.yml:476, :498`, `screening-capacity.yml:151, :162`) passes
    `provenance: false` and `sbom: false`, so buildx writes no attestation manifest and both stores see one manifest.
    Buildx keeps attestations on the containerd store and drops them on the classic one, so without this the two
    stores would hold different objects. The release's attestation is the `report` job's
    (`actions/attest-build-provenance`, `release.yml:263-265`, the step at `:265`) and its bill of materials Trivy's (`:89`), not buildx's,
    so nothing is lost.
  - **The build's identities are job outputs, not files beside the tarball** (§3.3.6, S1). The tarball, its
    `.tar.sha256` and its `.id` ride in one artifact, which ci-deps uploads with `overwrite: true` (§3.2.1), and
    `release.yml`'s `capacity` runs repository code and every installed package (`pnpm install`, `release.yml:153-156`)
    on a runner with passwordless sudo, concurrently with `push` (both `needs: build`, `:130`, `:203`): a step there
    that reached the run's artifact token could replace the tarball and both files together, and a check against the
    artifact's own files would pass. A job's outputs are fixed once it ends and no later job can write them. So `build`
    (a matrix over the four images) sets, per image, `sha256_<image>` (the gzipped tarball's SHA-256), `config_<image>`
    and `target_<image>` (image-id.ts's), distinct names so no matrix leg overwrites another's; every later job reads
    them as `toJSON(needs.build.outputs)` into one environment variable and selects with `jq`, and never trusts the
    artifact's own `.tar.sha256` or `.id`, which stay for a person reading the artifact and must equal the outputs.
  - **Where each identity is read** (no job that holds `packages: write`, and not `report`, runs repository code):
    - `release.yml` `build`: after `docker save | gzip -1`, `sha256sum` and image-id.ts write the outputs above (and
      the two files, as today). It takes `actions/setup-node` with Node 24, no `cache` and `package-manager-cache:
      false` (ci-deps' release rule, §3.2.1; §3.3.6, N4), and no `pnpm install`. For the worker image it runs
      `node tools/ci/browser-build.ts --image <ref>` before `docker save` (§3.3.6, S4);
    - `release.yml` `capacity`: each tarball's SHA-256 against `sha256_<image>` before `docker load`; the harness gets
      `--image-archive web=<tar.gz> --image-archive worker=<tar.gz>` and `--expect-image web=<config_web-production>
      --expect-image worker=<config_worker>`, and stops unless image-id.ts's config digest of each archive equals the
      expected one, so the measured image is the built one even if the artifact was replaced before this job read it;
    - `release.yml` `push`: for each image, the tarball's SHA-256 against `sha256_<image>`, then `docker load`, then,
      **before any push**, the loaded tag's `.Id` against `config_<image>` on the classic store or `target_<image>` on
      the containerd store (the store read from `docker info`'s `DriverStatus` `driver-type`, in shell, no repository
      code); only then it tags and pushes, and after the pushes reads each pushed manifest's config digest with
      `docker buildx imagetools inspect --raw <ref>` (and `jq`, following an index to its linux/amd64 manifest) and
      fails unless it equals `config_<image>`. `:228-229`'s pre-push compare is kept, made store-aware, and the
      registry check is added: a mismatch is found before the tag is public, and what was pushed is proved to be what
      was measured, in the form the launch check reads;
    - `report`: unchanged;
    - `release-dry-run.yml` (ci-deps): its `build` sets the same outputs (it builds `web` only); its `push` runs the
      SHA-256 check against them, `docker load` and the store-aware `.Id` compare (it never pushes, so no registry read).
      Its path filter already names `tools/screening-capacity/image-id.ts` (§3.2.1). ci-deps' equality rule between the
      two files ("only the image list and the push lines removed", §3.2.1) becomes (§3.3.6, N5): the dry run's steps
      equal release's with the image list, the push lines and the post-push registry check removed, and the build's
      new steps (setup-node, image-id.ts, the outputs) present in both. Since the dry run builds `web` only, the
      worker's `--image` browser check is not exercised there; `ci.yml`'s `images` exercises it on every pull request;
    - `screening-capacity.yml` `capacity`: both builds write `outputs: type=docker,dest=$RUNNER_TEMP/image/<name>.tar`
      in place of `load: true` (`:143-150`), then `docker load --input`, and the harness gets `--image-archive` (no
      `--expect-image`: the same job built them). The archive is the bytes `load: true` would have streamed, so the
      cost is a disk write, measured on the PR;
    - `ci.yml` `images` (26.04, the containerd store), **store-independent** (§3.3.6, S10): both builds write
      `outputs: type=docker,dest=$RUNNER_TEMP/image/<name>.tar` in place of `load: true` (`:480`, `:502`); Trivy scans
      the archive (`trivy-action` `input: <tar>` in place of `image-ref:`, an input of the pinned `ed142fd…`'s
      `action.yaml:13-16`), so the scanned bytes are the bytes checked and the scan does not depend on how Trivy's
      daemon source reads the containerd store; image-id.ts over each archive must equal build-push-action's own
      `metadata` `containerimage.config.digest` (the equality `run.ts:821-824` cites for overlay2); then the worker
      archive is loaded, its `.Id` must equal `target` (the store-aware compare `push` runs, here on the containerd
      store), and `browser-build.ts --image` checks its headless shell. Each pull request then proves the reader and
      the containerd rule on the store the probe will use.
  - **The harness proves the loaded tag is the archive.** (3.3.7: `run.ts`'s flags and its `.Id` read move to the
    follow-up after #42; `containers.ts`' `proveLoadedImage`, `:379`, is built and tested now.) `run.ts:825-826` (outside every #42 hunk: `-813,6` ends at
    `:818`, `-853,6` starts at `:853`) calls one function in `containers.ts`: with `--image-archive`, it reads the
    archive with image-id.ts (and, with `--expect-image`, requires its config digest to equal the expected one);
    without (a local run), it streams `docker save <tag>` into it. It then reads the store from `docker info`
    (`Driver`, and `DriverStatus`' `driver-type` for the containerd snapshotter) and requires the tag's `.Id` to equal
    the archive's `config` (classic) or its `target` (containerd); otherwise the run stops before measuring, naming
    both. `run.ts`'s options gain `imageArchives` and `expectImages` beside `webImage` and `workerImage` (`:127-128`,
    parsed at `:181-182`; the usage line `:1060`), all outside #42's hunks (`-46,6`, `-58,6`, `-288,6`, `-813,6`,
    `-853,6`, `-903,6`, `-912,7`, `-926,6`, `-948,6`; [SF] §4).
  - **The report** (`report.ts`, a #42 file; 3.3.7: in the follow-up after #42): `REPORT_FORMAT` (`:56`) moves to **`tp-screening-capacity/9`** (8 today;
    #42 adds `Measurements.mail` without a bump). `WorkflowRun` (`workflowRun`, `:339-346`, called at `run.ts:833`)
    gains `imageOS` and `imageVersion` from the runner's environment; the measurements gain `imageStore` (driver and
    snapshotter) and `imageSource` (`archive` with each archive's SHA-256, or `save`). They go beside `workflow` and
    `images` (`:327-357`), never at the `Measurements` interface's end, the verdict's end or the markdown's `Layout:`
    line, where #42's hunks are (`-389,6`, `-529,6`, `-745,6`). `test-support/measurements.ts` gains them in
    `measured()` beside `workflow` and `images`, away from #42's `:218`.
  - **The launch check** (`launch-check.ts`; 3.3.7: its refusals in the follow-up after #42, comments now): `RELEASE_RUNNER` (`:104`) gains `imageOS: 'ubuntu24'` (GitHub's
    `ImageOS` for 24.04). `launchCheck()` refuses a binding report whose `imageOS` is not `RELEASE_RUNNER.imageOS`, or
    whose `imageSource` is not `archive`; it already refuses another format (`:166-168`). The doc text at `:61-70`,
    `:85-88` and `:526`, and `report.ts:354-357`, say the images are config digests read from the archive.
    `launch-check.ts:399-401` ("both workflows build them on ubuntu-24.04") is false for a dispatched probe once F5's
    input exists, and is reworded (§3.3.6, N8): release.yml builds them on `RELEASE_RUNNER.label`, and
    screening-capacity.yml does too except for a dispatched 26.04 probe, whose report the launch check refuses.
  - **A `workflows.test.ts` rule:** `release.yml`'s `push` and `report` (and the dry run's `push`) have no checkout, no
    `setup-node`, and no step whose `run` invokes `pnpm`, `tsx` or `node`; `build` declares `sha256_<image>`,
    `config_<image>` and `target_<image>` for each image of its matrix; every `docker load` in `release.yml` and
    `release-dry-run.yml` is preceded by a SHA-256 check against `needs.build.outputs`, not against a downloaded file;
    the push job's store-aware `.Id` compare precedes its first `docker push`, and its registry check follows its
    pushes; the capacity job passes `--expect-image` from `needs.build.outputs`; every `build-push-action` step in
    `release.yml`, `release-dry-run.yml`, `ci.yml` and `screening-capacity.yml` sets `provenance: false` and `sbom:
    false`; `images`' Trivy steps take `input:`, not `image-ref:`. `:473` (the `.Id` literal) and `:519-520` (the `.Id`
    compare) change with it.
- **The 26.04 probe (F5; O5).** `screening-capacity.yml`'s `workflow_dispatch:` (`:26`, null today) gains one input,
  `runner`, `type: choice`, options `ubuntu-24.04` and `ubuntu-26.04`, default `ubuntu-24.04`, and the `capacity` job
  takes `runs-on: ${{ inputs.runner || 'ubuntu-24.04' }}` (`inputs` is empty on push, pull request and schedule, so
  those stay on 24.04).
  - A failing probe must not open the capacity-failure issue (§3.3.6, N6): `notify`'s condition
    (`screening-capacity.yml:276`, `failure() && github.event_name != 'pull_request'`) gains `&&
    !(github.event_name == 'workflow_dispatch' && inputs.runner == 'ubuntu-26.04')`, and `workflows.test.ts` holds that
    exact condition. The probe's result goes to #41 by hand (below).
  - `runnerProblems` (`workflows.test.ts:146-163`) resolves exactly that form, `${{ inputs.<name> || '<label>' }}`, to
    the label and the choice input's options, and checks each; any other expression is still refused. The runner rule
    holds the resolved set to `{ubuntu-24.04, ubuntu-26.04}` for that job alone, with `ubuntu-24.04` as the value for
    every event but dispatch. `:606-608`'s `on.workflow_dispatch` toBeNull becomes the input's exact shape.
  - A dispatched run is advisory: only `release.yml` measures binding, and the launch check refuses the probe's report
    for its `imageOS` (`ubuntu26`). Under F1 (a) (applied when ci-deps merges) dispatch runs from the build branch. After
    the merge the session dispatches it once (`gh workflow run screening-capacity.yml -f runner=ubuntu-26.04`) and
    records the numbers, the report's `imageStore` and `docker info` on issue #41, for the founder's later move.
- **Conditional work.**
  - **O6, the axe sweep over #42's journeys.** #42 is a draft (head 13f59b1, base 49514e8, `mergeable_state: dirty`,
    last updated 2026-10-23T20:51Z; [SF] §0 item 12; 3.3.7: on 2026-10-27 head 098636e3, base e908c21, 188 files,
    `mergeable_state: blocked`, updated 2026-10-27T01:45:57Z). Whichever of the two merges second runs axe 4.14 over #42's
    console mail page and its two journeys (`mail-cutoff.spec.ts`, `mail-notices.spec.ts`) in its own CI, because every
    spec's `expectAccessible` runs it, and fixes any Label-in-Name finding in that pull request. If #42 merges first,
    ci-browser merges the build branch in (the ruleset's "up to date"), runs the full e2e, and fixes #42's findings in
    its own files' terms (a new control's `aria-label`); if ci-browser merges first, #42's fix round does it (Lane A,
    `lanes/lane-b.md` "What Lane A must know"). Either way the baseline step, which runs on every pull request, decides in the
    second pull request's own run whether #42's rail link moves a brand baseline, before that merge; it is not assumed
    (§3.3.6, B1).
  - **O7, the mutation shards.** Re-measured ([SF] §7, `logs/mutation-durations.tsv`): `packets-rest`'s successful runs
    took 308-606 s (mean 6:49, max 10:06; push runs 40229005837, 40223130477; PR runs 40225007752, 40223436319,
    40219164294, 40195705539), and the other shards' maxima are 528 s (pricing-engine), 422 s (packets-scan) and 410 s
    (pricing-rest). ci-browser changes `mutation.yml`'s three `runs-on`, a global input of `tools/stryker/affected.ts`
    (`:111-120`), so its own pull request runs all six shards on 26.04. **Rule:** `stryker/shards.json` is rebalanced in
    this pull request only if a shard on its own run, or the slowest of the last ten successful push runs, reaches
    12:00 (80% of the 15-minute bound, A7); otherwise the PR records the table and "no rebalance". At 10:06 today it is
    not.
- **Local browsers (the browser layout).** The CfT 156 layout of the 2026-10-24 text
  (`scratchpad/ci-design/pwr/browsers/ms-playwright`) was in an earlier session's scratchpad and is gone;
  `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`) holds 1194 and the image's 1243 only ([SV] correction 6; 3.3.7: on 2026-10-27, 1243 only, the verified zips are gone
  and both hosts are refused, so no local 1248 until the person allows storage.googleapis.com).
  - **The fix, on `claude/build-ops`** (`/home/user/ops/tools/setup-container.sh` at 99b2e05; a session commit there,
    not part of this pull request). `step_playwright` (`:999-1029`) reads only `$CLONE_DIR/apps/web/package.json`
    (`:1001-1003`) and that version's `browsers.json` (`:1004`), and runs once at `:1087`, before the argument worktrees
    are made and installed (`:1089-1093`), so a ci-browser worktree on 1.64.1 never gets 1248:
    1. `worktree()` with `INSTALL=1` appends its directory to a new array `PW_ROOTS` once `modules` succeeds
       (`:1063`); `PW_ROOTS` starts as `("$CLONE_DIR")` when `OK_MODULES=1`;
    2. the call moves from `:1087` to after the worktree loop (`:1093`);
    3. for each root, it reads that root's `apps/web/package.json` `@playwright/test` version and that root's own
       `node_modules/.pnpm/playwright-core@<ver>/node_modules/playwright-core/browsers.json` (each worktree has its
       own `node_modules`), and unions the `chromium-<rev>` and `chromium_headless_shell-<rev>` names, remembering
       which roots named each; a root whose `browsers.json` cannot be read is a FAIL line naming it;
    4. each revision missing `INSTALLATION_COMPLETE` is laid out by the unchanged `cft_layout`; one with no
       `CFT_BUILDS` row already fails with "no pinned Chrome for Testing build for <rev>", which is right: a person adds
       the row with its SHA-256;
    5. one `line ok playwright` per Playwright version, naming its roots, its revisions, the CfT version looked up per
       revision (today's message prints the loop's last `$ver`, a defect) and present or laid out;
    6. `SETUP_CHECK=1` reports every missing revision across all roots.
  - **Before that runs** (the branch is cut after ci-deps merges, and the bump happens in the worktree after setup),
    P1 lays 1248 out once as `cft_layout` does: both pinned zips are already verified in `scratchpad/ci-browser/cft/`
    (SHA-256 equal to the pins); unzip them into `$PLAYWRIGHT_BROWSERS_PATH/chromium-1248/chrome-linux64` and
    `…/chromium_headless_shell-1248/chrome-headless-shell-linux64`, and touch `INSTALLATION_COMPLETE` and
    `DEPENDENCIES_VALIDATED` in each. After the fix, re-running setup with the ci-browser worktree as an argument does
    the same.

#### 3.3.2 Files

At 6ddd587 unless "(ci-deps)": the file exists only once ci-deps merges, or ci-deps changes the lines named.
- **Browser, app and baselines:**
  - `apps/web/package.json` (`:47-48`), `apps/worker/package.json` (`:53`), `tools/package.json` (`:33`; `:34` at 2ab2b15, 3.3.7),
    `pnpm-workspace.yaml` (the catalog's `playwright-core` line; ci-deps), `pnpm-lock.yaml` (ci-deps);
  - `apps/worker/Dockerfile` (the runtime stage's install; ci-deps moves `:23`);
  - `apps/web/src/components/shell.tsx` (`:56`, `:84-87`);
  - `apps/web/e2e/brand.spec.ts` (the computed name check in `:325-345`), the seven
    `apps/web/e2e/brand.spec.ts-snapshots/*-chromium-linux.png`, and `apps/web/e2e/browser.json` (new);
  - `tools/ci/browser-build.ts` and `browser-build.test.ts` (new);
  - `tools/test/browser-version.test.ts` (new); `tools/test/no-duplicated-versions.test.ts` (ci-deps): the worker's
    playwright-core source becomes the catalog line, which ci-deps names "once ci-browser adds it".
- **Runners, CI steps and binding:**
  - every workflow's `runs-on` (the 22 of §3.3.1 as of 3.3.8, `content-calendar.yml:43, :68` and
    `release-capacity.yml:36, :114` among them; `release-dry-run.yml`'s unchanged), the
    worker `--image` steps in `release-capacity.yml` and `screening-capacity.yml` (3.3.7), and
    `tools/test/frozen/publish-content.yml`'s `runs-on` (F4; ci-deps);
  - `ci.yml`: the runner-image, apt restore, verify and save steps; `id: browser-install`, the browser check after
    each install and the later steps' `if:`; the baseline step (every run, no diff condition); in `images` the archive
    builds with `provenance: false` and `sbom: false`, Trivy's `input:`, the image-id equality, the store-aware `.Id`
    compare and the worker image's browser check; the comment at `:32-33`;
  - `large-zip.yml` (apt restore and verify, the browser check); `screening-capacity.yml` (the dispatch input, the
    capacity job's `runs-on` expression, `notify`'s condition, the archive builds, `--image-archive`, its own apt
    cache, the browser check, `tools/ci/apt-archives.sh` and `tools/ci/browser-build.ts` in the push paths);
    `release.yml` and `release-dry-run.yml` (the build's per-image outputs, setup-node, image-id.ts and the worker's
    `--image` check; the SHA-256 checks against the outputs; `--expect-image`; the push job's pre-push compare and
    registry check; `provenance: false` and `sbom: false`; the capacity job's browser check);
  - `tools/screening-capacity/watched.ts` (`WATCHED_FIXED`, `:62`) and `watched-paths.txt` (regenerated; a #42 file);
  - `tools/ci/apt-archives.sh` and its test, with stub `apt-get`, `apt-cache` and `sudo` on `PATH` (new);
  - `tools/test/workflows.test.ts`; `tools/test/collection.test.ts`'s `FILES` (ci-deps) gains the new unit test files;
  - (3.3.7: `run.ts`, `report.ts`, `report.test.ts`, `launch-check.test.ts` and `test-support/measurements.ts` move to
    the follow-up after #42; `launch-check.ts` changes in comments only)
    `tools/screening-capacity/{image-id.ts (new), containers.ts, run.ts, report.ts, launch-check.ts}`, their tests
    (`image-id.test.ts` new, `measure.test.ts`, `report.test.ts`, `launch-check.test.ts`) and
    `tools/screening-capacity/test-support/measurements.ts` (the 2026-10-24 text's "`test-support/measurements.ts`";
    no root `test-support/` exists);
  - `apps/worker/src/platform/restore-drill.db.test.ts:73-75` (the comment; ci-deps rewords `:75`).
- **Documents:**
  - ADR 0058 (unchanged since 49514e8), amended: the baseline line `:159` becomes "Chrome for Testing 156.0.8078.4
    (revision 1248) for `@playwright/test` 1.64.1, proved on ubuntu-26.04 by CI's baseline step"; the switches' claim
    (`:162-176`) gains the 26.04 result (and any local/CI disagreement); the rejected options (`:213-214`) gain the
    apt-cache alternatives; the consequences (`:221-224`) gain `browser.json`, the browser check with its deliberate
    red, and the baseline step; the regenerate command (`:225-228`) gains `=all` and points at ci.md's procedure;
  - ADR 0062, amended (#42 appends to it: keep both, in merge order, rule 6): the binding text the amendment rewords
    is at `:1096` ("both images' config digests") and `:1322-1325` ("the containerd store's `{{.Id}}`, a manifest's
    digest, is never read"), and F5's runner line at `:1164-1166`; `:1052` ("every other job, the gate included …,
    stays on `ubuntu-24.04`") gains the 26.04 move (§3.3.6, S11; `sed -n` at 6ddd587; the earlier `:1115` and `:1186`
    are runner-layout text). The amendment records the store-independent binding, the build's job outputs and the
    pre-push compare, the archive checks, the push job's registry check, the runner image and image store in the report
    (format 9), the launch check's `imageOS` and `imageSource`, and F5's ruling;
  - ADR 0063, item 15 (`:478`, "It runs on `ubuntu-24.04`, as every job has since #24"): reworded to
    `ubuntu-26.04` since ci-browser, with the release chain's exception named and ADR 0066 Part 3 cited, in place, as
    ci-deps edits `:494-497` (§3.2.7, S10; §3.3.6, S11);
  - ADR 0066: Part 3 in place of its placeholder (`:247-249` at 6ddd587; ci-deps' Part 2 moves it), the status header
    (`:3-13`, ci-deps edits it first), and `:241`'s revisit line; Part 3 also records the 00:20 ruling's A9 form,
    V3's design with apt's size-only check, actionlint's `-ignore`, and `ubuntu-latest`'s November move;
  - `docs/runbooks/screening-capacity.md:467` (the process layout's copy, no version), its binding text
    (`:460-462`: the images' IDs "only on Docker's classic image store" become config digests from the archive under
    either store, checked against the build's job outputs), and `:288-289` ("so the image stays pinned as
    `ubuntu-24.04` pins every other job's"), which becomes "as every job's runner is pinned to a versioned image"
    (§3.3.6, S11);
  - `docs/runbooks/ci.md`: the jobs table's runner note (`:27, :28, :31`); the Caches table (`:139-146`) gains the apt
    row and its paragraph (`:148-157`) the verify step; **new** "Upgrading the browser": what the red browser check
    means, laying out the new CfT build locally, regenerating with `=all`, reading the baseline step's pictures,
    committing CI's bytes, the A9 inspection and gallery, and `browser.json`'s six hashes (tree, binary and zip per build), with the tree hash's shell form; the Caches paragraph (`:148-149`) reworded for F1 (a) (§3.3.1, V3's Trust); the baseline step's measured cost (§3.3.1);
  - `docs/runbooks/dependency-upgrades.md` (ci-deps): its `browser-tests` paragraph points at ci.md's procedure;
  - `docs/product/reconciliation-001.md`: F5 recorded with its date (grep "F5" finds nothing today); F4's one
    `runs-on` change recorded as done; the capacity line `:548` ("(ubuntu-24.04; …)"; the 2026-10-24 text's `:529`)
    says the measuring job stays on 24.04 while `changes`, `gate` and `notify` run on 26.04; `:576` ("every job runs on
    `ubuntu-24.04`", the merge-rule entry) says the same (§3.3.6, S11); `:145`'s series line stays;
  - `docs/product/test-matrix.md`, `packages/synth/src/cases/{matrix,registry}.ts` and
    `fixtures/synthetic/CI-18…CI-20/expected.json` (`pnpm synth --all`): CI-18 to CI-20 (§3.5) after CI-17
    (test-matrix `:228`, matrix.ts before `:293`'s `];`, registry.ts after `:465`, each 4 lines lower once ci-deps adds
    CI-11 to CI-14), and the reservation note (`:211-212`, which ci-deps edits) says the series is complete.
- **Outside the pull request:** `/home/user/ops/tools/setup-container.sh` (`claude/build-ops`; §3.3.1, "Local
  browsers").
- **The files #42 also changes** (§3.3.6, S6; 3.3.7: at head 098636e3 the table is §3.3.7's, where ADR 0062 is a sure
  conflict at the end of the file, both amendments kept in merge order). #42 (head 13f59b1, 143 files, `scratchpad/pr42-files.txt`; hunks from
  `gh api repos/PureTideWater/PhysicalTherapy/pulls/42/files?per_page=100&page=1..2`, saved in
  `scratchpad/ci-browser/pr42f/`) touches 13 of ci-browser's files. Neither waits for the other; whichever merges
  second merges the build branch in and resolves as below.

  | File | #42's hunks | ci-browser's lines | Merge rule | Ruling |
  |---|---|---|---|---|
  | `apps/web/package.json` | `@@ -14,6` (+`@aws-sdk/client-sesv2`) | `:47-48` | keep both sides; disjoint lines | rule 6 (manifest) |
  | `apps/worker/package.json` | `@@ -36,6` (+`@aws-sdk/client-sqs`) | `:53` (`catalog:`) | keep both sides; disjoint lines | rule 6 (manifest) |
  | `pnpm-lock.yaml` | +33 in six hunks (`-112`, `-239`, `-904`, `-964`, `-3962`, `-4112`; the two SDK clients) | the Playwright, axe and fsevents entries | never hand-merged: take either side, then `pnpm install` re-resolves it under the gates, and the diff is checked against both sides' manifests (`lanes/lane-b.md:67`) | rule 6 |
  | `apps/web/src/components/shell.tsx` | `@@ -156,6`, `@@ -259,6` (4 lines) | `:56`, `:84-87` | clean in either order | Q2 |
  | `tools/screening-capacity/run.ts` | nine hunks (§3.3.1, the harness) | `:127-128`, `:181-182`, `:825-826`, `:1060` | clean in either order | Q2 |
  | `tools/screening-capacity/report.ts` | `-389,6`, `-529,6`, `-745,6` | `:56`, `:327-357` | clean; the format is 9 whichever merges second | Q2 |
  | `tools/screening-capacity/report.test.ts` | `@@ -1,9`, `-16,6`, `-468,6`, `-547,6` (the mail lines) | `:527-528` (format 9), the new fields' assertions | clean; `:527-528` say format 9 whichever merges second, since #42 adds `Measurements.mail` without a bump | Q2 |
  | `tools/screening-capacity/test-support/measurements.ts` | `@@ -1,6`, `-218,6` (`mail`) | the new fields beside `workflow` and `images` | clean; format 9 as above | Q2 |
  | `tools/screening-capacity/watched-paths.txt` | regenerated by #42 | regenerated with the two `tools/ci` files | never hand-merged: `pnpm exec tsx tools/screening-capacity/watched.ts --write` after the merge, and `watched.test.ts` holds it | rule 6 |
  | `packages/synth/src/cases/matrix.ts` | `@@ -157,6` (SEC-18, SEC-19), `-265,10` (SCR-21, SCR-22, JOB-05) | CI-18 to CI-20 after CI-17 | rows kept from both, in merge order; `pnpm synth --all` with a clean diff | rule 6 |
  | `packages/synth/src/cases/registry.ts` | `@@ -247,6`, `-392,6`, `-402,6` | CI-18 to CI-20 after CI-17 | rows kept from both, in merge order | rule 6 |
  | `docs/product/test-matrix.md` | `@@ -153,10`, `-180,6`, `-189,6` | CI-18 to CI-20 after `:228`; `:211-212` | rows kept from both, in merge order | rule 6 |
  | `docs/product/reconciliation-001.md` | `@@ -597,3` (+10 at the end) | `:548`, `:576`, F4 and F5 entries | entries kept from both, in merge order | rule 6 |
  | ADR 0062 | `@@ -1,6`, `-863,6`, `-1351,3` (its amendment) | `:1052`, `:1096`, `:1164-1166`, `:1322-1325`, a new amendment | amendments appended in merge order | rule 6 |

#### 3.3.3 Tests

**Failing first.** Each test below that fixes a behaviour fails on the merge base's tree, through ci-deps' `CI_TREE`
root (§3.2.3), and the PR description records the red run:

```
tmp=$(mktemp -d) && git archive "$(git merge-base origin/claude/build-platform HEAD)" | tar -x -C "$tmp"
CI_TREE="$tmp" pnpm exec vitest run --project unit tools/test/workflows.test.ts tools/test/browser-version.test.ts \
  -t '<each name below>'
```
- `browser-version.test.ts`: fails on the base's Dockerfile literal and on the base's two playwright-core literals
  (the gap [S3] found in #38, where the manifest moved and the image did not). It reads the Dockerfile and manifests
  through `CI_TREE`;
- the runner rule (every job on 24.04 today), the browser-check step, the apt steps, the baseline step, the dispatch
  input, and the release identity rules (today's `.Id`);
- `brand.spec.ts`'s computed name check fails on today's labels (run locally on the base's `shell.tsx`, recorded in the
  PR; e2e is not under `CI_TREE`).

**Failing first, for the behaviours `CI_TREE` cannot reach** (§3.3.6, S8). `CI_TREE` reroutes file reads only
(§3.2.3); the harness and launch-check tests import modules. So a second red run, in a worktree at the merge base with
the head's test file and its test support copied in (3.3.8, N8: `measure.test.ts` and `test-support/image-archive.ts`;
`report.test.ts`, `launch-check.test.ts` and `test-support/measurements.ts` follow #42):

```
mb=$(git merge-base origin/claude/build-platform HEAD); tmp=$(mktemp -d)/base
git worktree add --detach "$tmp" "$mb"
cp tools/screening-capacity/measure.test.ts "$tmp/tools/screening-capacity/"
cp tools/screening-capacity/test-support/image-archive.ts "$tmp/tools/screening-capacity/test-support/"
(cd "$tmp" && pnpm install --frozen-lockfile && pnpm exec vitest run --project unit tools/screening-capacity \
  -t '<each name below>'); git worktree remove --force "$tmp"
```
Each named test must fail there, on an assertion (not on a missing export, which the PR description would show as
an import error and which does not count): the loaded tag proved per store (`config` on classic, `target` on
containerd) and `--expect-image` refused on a different archive (`measure.test.ts`); format 9 and the four new fields
(`report.test.ts`); another `ImageOS`, `imageSource: save` and format 8 refused (`launch-check.test.ts`). (3.3.7: the `report` and
`launch-check` cases move with their code to the follow-up after #42; this PR's worktree run covers `measure.test.ts`; 3.3.8: `proveLoadedImage` and `loadedImageProblems` are new exports of
`containers.ts`, so their cases can fail at e908c21 only on the missing export, and the PR names them so.) Where a test
can only fail on a missing export, the PR names it and why. The PR description records this run beside the `CI_TREE`
run.

The tests:
- `workflows.test.ts`:
  - runners: the exact `RELEASE_CHAIN` (eight jobs, 3.3.8) on `RELEASE_RUNNER.label`, every other job on `ubuntu-26.04`, and
    `runnerProblems`' `inputs.<name> || '<label>'` form (resolved, and an unresolvable expression still refused);
  - the install test (`:1205-1225`) in its new order, for `unit`, `db` and `e2e`: browsers restore, runner image
    outputs (`key` and `os`, both named), apt restore (its key and both restore-keys exactly), `apt-archives.sh
    verify`, `CHROMIUM_INSTALL` with `id: browser-install`, `node tools/ci/browser-build.ts`; in `unit` only, then the
    browsers' save (`:1218-1219`'s exact step), `apt-archives.sh collect` and the apt save, each on a miss and with
    the default condition; no other job saves either key; `large-zip.yml` and `screening-capacity.yml` restore and
    verify before their install; `release.yml` has none (ci-deps' release rule already refuses `actions/cache*`
    there);
  - **every** step whose `run` is `CHROMIUM_INSTALL`, in every workflow, is followed directly by `node
    tools/ci/browser-build.ts` (§3.3.6, S4), and every later test step of that job has `if: ${{ !cancelled() &&
    steps.browser-install.outcome == 'success' }}` (S9);
  - `--image` on the worker in `images` and in `release.yml`'s `build` before `docker save` (3.3.8, N9: the dry run
    builds `web` only, `release-dry-run.yml:81`); (3.3.7) every job that builds `apps/worker/Dockerfile` into a local
    tag runs `--image <that tag>` before using it; and (3.3.8, S6) every job that runs `--image` has an
    `actions/setup-node` step with `node-version: 24` before that step, the release's build keeping both cache inputs
    off under ci-deps' release rule;
  - `images`: archive outputs, Trivy's `input:`, the image-id equality with build-push's metadata, the store-aware
    `.Id` compare;
  - the baseline step: in `e2e` only, run by `matrix.shard == 1`, after the shard's tests, with **no diff condition**
    (its `if:` exactly the one above), the seven PNGs removed first, `--update-snapshots=all --retries=0`, the exit
    status enforced, the written set, taken as the PNGs present after the run (3.3.8, N5: every one was removed first, so no Playwright
    message text is read, as `ci.yml:611` still does at 2ab2b15), equal to `git ls-files` of the committed baselines (3.3.7; was seven "doesn't exist … writing actual"
    lines counted), `git diff --exit-code` over the snapshots,
    the SHA-256 print and the chunked base64 form (3.3.7; §3.3.6, B1);
  - the dispatch input's shape, the capacity job's `runs-on` expression and `notify`'s exact condition (N6);
  - `pushPaths` with `tools/ci/apt-archives.sh` and `tools/ci/browser-build.ts`, and `watched.test.ts` with both in
    `WATCHED_FIXED` (N7);
  - the release identity rules of §3.3.1 (`push` and `report` run no repository code; the build's per-image outputs;
    a SHA-256 check against `needs.build.outputs` before every `docker load`; the pre-push compare before the first
    push and the registry check after; `--expect-image` from the outputs; `provenance: false` and `sbom: false` on
    every identity build; the dry run's equality rule with N5's two changes);
  - actionlint spawned with the one `-ignore`, the configuration ban kept;
  - publish-content.yml equal to its frozen copy (ci-deps' rule; the frozen copy's `runs-on` is now `ubuntu-26.04`).
- `tools/ci/browser-build.test.ts`, on a temporary `PLAYWRIGHT_BROWSERS_PATH` with stand-in builds and a stand-in
  `browser.json`: every hash equal passes; a binary difference fails with the exact message; **a changed, added or
  removed file beside an equal binary fails** with the tree message naming the path (S3); the marker files beside
  `dir` do not count; the tree hash equals the shell form's on the same directory; a revision or version that differs
  from the installed `browsers.json` fails; a missing build fails; on a tree difference every found file line is printed (3.3.7); playwright-core found through the
  `@playwright/test` → `playwright` → `playwright-core` chain in a stand-in pnpm layout with nothing hoisted (S5);
  `--image` with a stub `docker` that serves the image's `browsers.json` and tree, and needs no `node_modules`.
- `tools/ci/apt-archives.sh`'s test, with stub `sudo`, `apt-get`, `apt-cache` and a temporary archive directory: a
  matching file is kept and copied; a file whose SHA-256 differs, a truncated one of the right name and a version the
  index no longer lists are deleted and counted; an epoch's `%3a` is read; `collect` copies and warns on none; a
  failing `apt-get update` fails.
- `browser-version.test.ts` (above), and `no-duplicated-versions.test.ts` with the catalog as playwright-core's source.
- `image-id.test.ts`, on synthetic archives the test writes in a temporary directory: docker-archive and OCI layouts;
  plain and gzipped; a multi-platform index resolved to linux/amd64; **an index holding the linux/amd64 manifest and
  an attestation manifest (`unknown/unknown`), whose `target` is the index's digest and `manifest` the amd64
  manifest's** (S2); a single manifest, whose `target` equals `manifest`; a config blob whose bytes do not hash to its
  name, which fails; a missing config, which fails; a long name through a pax header; the module imports only `node:`
  modules.
- `measure.test.ts` (`containers.ts`): the harness's identity check, with a stub `docker`: classic store, `.Id` equal
  to `config` passes; containerd store, `.Id` equal to `target` passes, and equal to the amd64 manifest's digest of an
  attested index stops the run (S2); any other `.Id` stops the run; `--expect-image` with a different config digest
  stops the run (S1); no archive streams `docker save`. `workerPlaywrightVersion()` reads the installed package; `:225`'s message
  regex names the copy; `:232` goes (to `browser-version.test.ts`).
- (after #42, 3.3.7) `report.test.ts`: format 9; `imageOS`, `imageVersion`, `imageStore` and `imageSource` recorded.
- (after #42, 3.3.7) `launch-check.test.ts`: a binding report from another `ImageOS`, or with `imageSource: save`, is refused; format 8
  is refused; `:227, :231` hold `RELEASE_RUNNER`'s new field.
- `brand.spec.ts`: the computed name check at both widths, the visible text including `::before` content (N9).
- `collection.test.ts`: the new unit test files in `FILES`.

#### 3.3.4 Acceptance

1. **Fresh clone and scope**, as §3.1.7: no migration and no change under `packages/pricing`, `packages/ledger`,
   `packages/db/migrations`, `content/`, `tools/verify-content` or `.claude/hooks/protect-content.sh`;
   `git diff --name-only <mb> -- packages/db/migrations docs/product/domain-model.md packages/db/domain-model` is
   empty. `publish-content.yml` differs from its base only in `runs-on`, and so does its frozen copy (F4):
   `diff <(git show <mb>:tools/test/frozen/publish-content.yml) tools/test/frozen/publish-content.yml` shows that one
   line.
2. `pnpm exec vitest run --project unit tools/test tools/ci tools/screening-capacity packages/synth` (3.3.7: the bare form
   also collects a db test), with actionlint installed (the `-ignore`
   exercised); then `pnpm typecheck` and `pnpm lint`.
3. **Failing first:** §3.3.3's two commands against the merge base (the `CI_TREE` run and the worktree run) fail on
   each named test, and pass on the head; the PR description records both (3.3.8, B1: the merge base is e908c21 since
   the merge, so both run there, phase 1's red run of `watched.test.ts` at 123b8fa not counting; `brand.spec.ts`'s
   computed-name red run on the base's `shell.tsx` per phase 2's step 8).
4. **Locally, on the 1248 layout** (§3.3.1, "Local browsers"; 3.3.7: waiting on the person, storage.googleapis.com,
   and not blocking the PR), with an e2e database `tp_laneb_<name>_e2e`:
   - `node tools/ci/browser-build.ts` passes against `browser.json`, both `treeSha256` included (the hand layout
     unzips the same zips the values were computed from);
   - `pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots=all`, then again: `git status`
     is clean after the second;
   - the specs that reach a header control or scan a shell page: `sign-in` and the fourteen with `expectAccessible`
     (billing, brand, era-exports, models, monitoring, onboarding, packets, pricing, reports, screening, security, triage,
     unattested, viewer-phi; 3.3.7), `--workers=2 --retries=0`; the full e2e once in the fix round (§6).
5. **The worker image** builds only on CI (no Docker daemon here, §6): the `images` job's browser check passes on it,
   its image-id equality holds, its loaded `.Id` equals `target` on 26.04's containerd store, and both Trivy scans
   read the archives.
6. **CI**, the four required checks of "Protect the build branch" on the head, branches up to date:
   - `all green`: every moved job's "Set up job" log names the ubuntu-26.04 image (20261026.180.1 or later, 3.3.7), and the
     release chain's jobs the 24.04 image (A8; 3.3.7: content-calendar's `check` runs on the PR, its own path being
     the workflow, while its `notify` and release-capacity's jobs show only after the merge or by dispatch; 3.3.8: release-capacity's
     dispatch on the PR's head shows its `capacity` on 26.04); the browser
     check passes in `unit`, every `db` and `e2e` shard and `images`; e2e passes, brand included; **the baseline step
     ran** (it runs on every pull request), wrote seven files, `git diff --exit-code` passed, and its seven SHA-256s
     equal `sha256sum apps/web/e2e/brand.spec.ts-snapshots/*.png` at the head; its duration goes in ci.md; the apt
     steps logged files kept and discarded;
   - `mutation`: all six shards on 26.04 (`mutation.yml` is a global input); O7's table from that run;
   - `screening-capacity gate`: the capacity job on 24.04 with its archive builds, the store-aware load, the browser
     check and the worker's `--image` check passing (3.3.7; `--image-archive` and the report at format 9 naming
     `ubuntu24`, `overlay2` and `archive` come with the follow-up after #42);
   - `large-zip` (where its paths run it): the browser check passes after its install;
   - `approval-of-record`, on 26.04.

   Also `release-dry-run` green (advisory): the build's per-image outputs set (and its `.tar.sha256` and `.id` equal
   to them), the SHA-256 check against the outputs, the load and the store-aware `.Id` compare in push.

   **Counts, from CI's logs:** unit = ci-deps' merged count, plus ci-browser's new tests by name, with 1 skipped
   (actionlint); db = ci-deps' count + 1 passed, 0 skipped (the restore drill); e2e 54; golden 376 (3.3.7: was e2e 51 and golden 188; at e908c21 unit 6,265 and db 9,222 + 1
   skipped, so unit 6,331 plus phase 2's tests (3.3.8, S1: was 6,320), and db 9,223 + 0; §3.3.7). The PR description
   does the sum.
7. **V3, measured:** the PR's own runs and the first five push runs after the merge give each install's duration; no
   install over 60 s on a cache hit, and the stalled-mirror case (a cold key) still passes. The numbers go in ci.md.
8. **A9** (3.3.7): `designs/lane-b-ci/ci-browser-a9.md` with the old and new pictures side by side, both pixel counts,
   the crops and the visual-inspection agent's verdict per image, the pictures in `designs/lane-b-ci/ci-browser-a9/` with
   their SHA-256s (3.3.8, S7), linked from the PR description by a commit-pinned URL; any finding fixed
   before the merge. It does not block the merge.
9. **Reviews:** two adversarial reviews, one of them the UX and brand review (`lanes/lane-b.md:143`; it changes
   `shell.tsx` and the brand baselines), run from `.claude/agents/ux-brand-reviewer.md` if the checklist pull request
   has merged, otherwise from `designs/lane-b-ux-review-brief.md` and `.claude/rules/brand.md` (§3.3), with before and after screenshots at 1280 and 390 px (3.3.7: 1280 and 390 px light and 1280 px dark; the checklist
   merged as #55, so the agent file is the reviewer, and its shots wait on the person, storage.googleapis.com); the other under §2's
   brand-and-accessibility and release-binding checklists.
10. **After the merge:** the session dispatches the 26.04 probe once and records its report, `imageStore` and
    `docker info` on issue #41 (O5); the next weekly Dependabot `browser-tests` run, if any, is red on the browser check,
    with the message above, and every later step ran (S9): any other red step there is a real incompatibility of the
    new version, recorded on the pull request, not an effect of the check.

#### 3.3.5 Re-read at 6ddd587 (2026-10-26)

Sources: [SF] and [SV], both 2026-10-26, read whole; `designs/lane-b-ci.md` §0, §1, §3.2 (as re-read), §3.5, §4-§7 and
§11; `lanes/lane-b.md:135-146, :714`; and the code and the network, re-checked here (commands below).

**How the builder re-reads the cites that move with ci-deps.** At the cut, `git diff --stat 6ddd587 HEAD -- <file>`
for each file this section cites. Files ci-deps leaves alone keep every cite: `shell.tsx`, `brand.spec.ts` and its
snapshots, `sign-in.spec.ts`, `a11y.ts`, `playwright.config.ts`, `apps/worker/package.json`, `launch-check.ts`,
`report.ts`, `run.ts`, `test-support/measurements.ts` and ADR 0058 ([SF] §1, and ci-deps' file list, §3.2.2). In a
file ci-deps changes (`ci.yml`, `release.yml`, `screening-capacity.yml`, `large-zip.yml`, `workflows.test.ts`,
`apps/worker/Dockerfile`, `containers.ts`, `measure.test.ts`, `restore-drill.db.test.ts`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `tools/package.json`, `watched.ts`, `watched-paths.txt`, ADR 0062, ADR 0063, ADR 0066, `ci.md`, `screening-capacity.md`, reconciliation-001,
the test matrix, `matrix.ts`, `registry.ts`, `collection.test.ts`), each cite is found again by the text it quotes
(`grep -n`), and the PR description carries a table of old and new lines. `workflows.test.ts` moves most (ci-deps
replaces `PINNED`, the services checks and the form test): its rules here are named by their test titles, not lines.

**What changed from the 2026-10-24 text, and why:**

| § | Change | Evidence |
|---|---|---|
| 3.3 | Written as cut after ci-deps; the rulings stated as ruled (F4, F5 as recommended, Q2, the 00:20 ruling); F5 (a) and (b) dropped | `lanes/lane-b.md:135-146, :308-316, :714`; §3.2.7's last paragraph |
| 3.3.1 | Versions unchanged (1.64.1, 4.14.0), now dated, aged, trust-scored and with no new transitive package; no exclude needed | `npm view … time` 2026-10-26 00:47 UTC; `git ls-remote --tags …/playwright`; packuments scored by `trust.js` ([SV] §1-2) |
| 3.3.1 | playwright-core becomes one catalog line (P5's pair, here) | `apps/worker/package.json:53`, `tools/package.json:33`; §3.2.3's catalog rule |
| 3.3.1 | The worker image copies the lockfile's playwright-core from the build stage; the `node -p` + `npm install` plan dropped (unpinned fetch; reads `catalog:` once the manifest says it) | `apps/worker/Dockerfile:9, :16-17, :23-28`; `containers.ts:544-548` |
| 3.3.1 | 2.5.3: the suite-wide reach (12 specs, 66 calls) and #42's hunks in `shell.tsx` stated; the check is a step, so e2e stays 51 | `a11y.ts:12`; grep over `apps/web/e2e`; `pulls/42/files` ([SF] §3) |
| 3.3.1 | `browser.json` records, per build, the tree SHA-256 (what CI checks; §3.3.6 S3), the binary SHA-256 and the zip SHA-256 (the local pin), and no Playwright version (S9); the 2026-10-24 text named one unspecified hash | `zsha.py` and `ztree.py` over both zips; `setup-container.sh:957-960`; Playwright deletes the zip ([SV] correction 1) |
| 3.3.1 | The browser check is a script after each install, before any cache save; the worker image is checked, not printed | `ci.yml:185-197`; `workflows.test.ts:1213-1219` |
| 3.3.1 | CI downloads from `cdn.playwright.dev`, and the download host cannot be pointed at Google | `coreBundle.js:33999-34006, 34225, 34260, 35014-35019` ([SV] corrections 2-3) |
| 3.3.1 | The baseline step: on every pull request and push with no diff condition, the seven files removed first, the exit status and seven written files required (§3.3.6 B1); why a green journey is not proof (tolerances) | `brand.spec.ts:10-12, :69, :77`; ADR 0058:225; `expect.js:12484-12487, :12620-12660` (1.64.1) |
| 3.3.1 | The picture print cites `ci.yml:453-462` (was `:103-108`) | `ci.yml` at 6ddd587 |
| 3.3.1 | A9 by the visual-inspection agent and a private gallery, not blocking | the 00:20 ruling, `lanes/lane-b.md:714` |
| 3.3.1 | V3 added: the apt archives cached and verified against the signed index, because apt trusts a cached file by size; the key from a step, since `env.ImageOS` is empty; a conf file, since sudo drops `APT_CONFIG` | jobs 121270018490 and the 14-run table ([SF] §6; §3.3.6 N2); `acquire-item.cc:3578-3591` at Debian/apt 6b128124; `coreBundle.js:33435-33444, :33681-33688` |
| 3.3.1 | Runners: 25 jobs, 7 stay, 18 move; the rule cited at `:349-360` (was `:160-171`); 26.04 support starts at 1.64.1 | `grep -n runs-on`; `coreBundle.js:9230, :32773` ([SV] correction 4) |
| 3.3.1 | actionlint 1.7.7 to 1.7.12 and main refuse `ubuntu-26.04`: the test passes `-ignore` for that one label | scratch workflow run; `rule_runner_label.go` at three refs ([SF] §0 item 1) |
| 3.3.1 | The restore drill: db 9,050 and 0 skipped | `restore-drill.db.test.ts:96-102, :191-192`; 26.04's PostgreSQL 18.6 |
| 3.3.1 | Docker 29 reaches 24.04 only by a toolset change, not a weekly rebuild | `toolset-2404.json` docker-ce 28.0.4; `install-docker.sh` writes no `daemon.json` ([SV] §6) |
| 3.3.1 | The harness's `.Id` is read in `run.ts:825-826`, not `containers.ts`; the change there sits outside #42's hunks | `grep -n .Id`; #42's run.ts hunks ([SF] §4) |
| 3.3.1 | The binding hashes the config blob, proves the loaded tag by store, and checks the pushed manifest's config digest; screening-capacity builds an archive; `images` proves the reader on 26.04 | `release.yml:98-118, :202-237`; `screening-capacity.yml:143-160`; `run.ts:821-824` |
| 3.3.1 | Report format 9 (8 today); fields beside `workflow`/`images`; `RELEASE_RUNNER.imageOS` added; `imageSource` must be `archive` | `report.ts:56, :327-357`; `launch-check.ts:104, :166-168` |
| 3.3.1 | The probe's `runs-on` is an `inputs.runner || 'ubuntu-24.04'` expression the runner rule resolves; `:606-608` changes | `workflows.test.ts:146-163, :606-608`; `screening-capacity.yml:26` |
| 3.3.1 | O6 conditional (still a draft); O7 measured, rule set at 12:00, no rebalance today | `gh api …/pulls/42`; `logs/mutation-durations.tsv` ([SF] §7) |
| 3.3.1 | The local layout: gone; `setup-container.sh` lays out every argument worktree's revisions; a hand layout until then | `ls /opt/pw-browsers`; `setup-container.sh:999-1029, :1063, :1087-1093` |
| 3.3.2 | `test-support/measurements.ts` is under `tools/screening-capacity/`; `screening-capacity.md:467` (was `:464`); reconciliation `:548` (was `:529`); new files: `browser-build.ts`, `apt-archives.sh`, `no-duplicated-versions` source, `collection.test.ts`, `pnpm-workspace.yaml`, the frozen copy | `git diff --numstat 49514e8 6ddd587` ([SF] §1) |
| 3.3.3 | Failing first through `CI_TREE`; the install-order test; new script tests; the identity tests | §3.2.3's mechanism |
| 3.3.4 | Steps for the four required checks, mutation's full run, counts, V3's measurement, A9's agent and gallery, the UX review, the probe | as above |
| §0, §1, §3.5, §4, §6, §9, §11 | Applied with this text: the replacements under "Changes to other sections" below | this section |

**Engineering choices made here** (the 00:20 ruling; each reversible):
- the worker image's playwright-core copied from the build stage's lockfile install (integrity-checked, no literal),
  over a derived `npm install`;
- playwright-core as one catalog line;
- `browser.json` with tree, binary and zip SHA-256s for both builds, the check failing on any file of either build;
- the browser check after every install in every workflow, before any cache save, and on the worker image in `images`
  and in the release's builds; the tests still running after a red check;
- the baseline step on every pull request and push, deletion-first and exit-checked;
- V3 through apt's own archive directory with a SHA-256 verify against the signed index (apt checks size only), the
  key from the runner's `ImageOS`/`ImageVersion` and `browser.json`, saved by `unit` and by the 24.04 capacity job;
- actionlint's one-label `-ignore`;
- the exact `RELEASE_CHAIN` set in the runner rule, and the `inputs.<name> || '<label>'` resolution for the probe;
- image-id.ts hashing the config blob and returning the top-level descriptor; `provenance: false` and `sbom: false` on
  every identity build; the build's identities as per-image job outputs; the harness proving the loaded tag per store
  and against `--expect-image`; `--image-archive` in both workflows (screening-capacity's builds write archives); the
  push job's store-aware compare before any push and its registry config check after; the `images` job scanning and
  checking archives, with the equality with buildx's metadata;
- report format 9 with `imageOS`, `imageVersion`, `imageStore` and `imageSource`; the launch check refusing another
  `ImageOS` and a non-archive binding;
- O7's 12:00 threshold;
- `setup-container.sh`'s per-worktree layout (an ops commit).

Security trade-offs: none is weakened. The apt cache adds a verify step that is stricter than apt's own check; the
binding adds checks (the build's identities as job outputs no later job can rewrite, archive SHA-256 against them,
content-hashed config, loaded-tag proof, pushed-manifest check) and keeps the pre-push `.Id` compare, now store-aware
(§3.3.6, S1; the first revision of this text had moved it after the push, so "removes none" was not true of it).

**Proposed improvements outside ci-browser** (each its own item, continuing §3.2.6's P-series):
- P9: install a pinned actionlint in CI (as gitleaks is, its archive's SHA-256 in a committed file) so
  `workflows.test.ts`'s actionlint test runs on CI instead of being unit's one skip. Recommended yes; with this
  section's `-ignore` it passes on the 26.04 labels.
- P10: report upstream that actionlint lacks `ubuntu-26.04` (a public issue or a one-line pull request to
  `rule_runner_label.go`); the founder's or co-founder's to send. When it lands, the `-ignore` goes.
- P11: once the person allows `cdn.playwright.dev` (O9), compare Playwright's mirror zip with Google's for every
  pinned revision, and record the result in `CFT_BUILDS`' comment.
- P12: the PR capacity run's archive build (`type=docker,dest`) gives the image's tarball for free; the capacity gate
  could record its SHA-256 beside the release's, so a PR and its release are comparable by bytes (Lane A's harness; a
  note for 6b-3's owner).
- P13: `ubuntu-latest` moves to 26.04 in November 2026 (#14748); nothing here uses it, and ADR 0066 Part 3 says so.

**Changes to other sections, applied with this text** (each replaces the named row or line):
- **§0**, the target line "the seven baselines regenerated, proved byte-equal on CI's ubuntu-26.04, and inspected by a
  person" becomes "… proved byte-equal on CI's ubuntu-26.04, and inspected by an adversarial visual-inspection agent
  whose gallery the pull request links (the co-founder's ruling of 2026-10-26 ~00:20 UTC)".
- **§1:**

  | # | Goal | Target | How it is measured | PR |
  |---|---|---|---|---|
  | A8 | ubuntu-26.04 | Every job's `runs-on` is `ubuntu-26.04` except F5's release chain, seven jobs on `RELEASE_RUNNER.label` (`ubuntu-24.04`): `release.yml`'s `build`, `capacity`, `push`, `report`; `release-dry-run.yml`'s `build`, `push`; `screening-capacity.yml`'s `capacity`, whose dispatch input alone may choose 26.04 (§3.3.1). Every job log's "Runner Image" line confirms it | `workflows.test.ts`; the "Set up job" log lines | ci-browser |
  | A9 | Baselines | All seven regenerated with Chrome for Testing 156.0.8078.4 (revision 1248) under Playwright 1.64.1, and committed. A second `--update-snapshots=all` leaves `git status` clean locally, and **on CI's ubuntu-26.04** the baseline step (§3.3.1; every pull request and every push run) regenerates all seven byte for byte from nothing and prints the seven SHA-256s; the PR records that run as ADR 0058's proof. CI's headless shell and Chromium equal `browser.json`'s tree SHA-256s (`333985b3…54172e`, `2f991090…129545`) and binary SHA-256s (`4fa61f0b…e5f9d6`, `377a9fc0…5f025`) after every install in every workflow, and the worker image's headless shell in `images` and in the release's build. An adversarial visual-inspection agent reads every old and new baseline at full resolution, with exact and comparator pixel counts and crops of the changed box (2026-10-24: six at 0 px, the without-seal cover at 1,611 px, [S3] M5), and the session publishes them as a private artifact gallery linked from the PR; it does not block the merge | The baseline step and the browser check in CI; a local no-op regeneration; the agent's verdict and the gallery's URL in the PR description | ci-browser |
  | A10 | Accessibility | No axe violation under 4.14.0 with the WCAG 2.0/2.1 A and AA tags on any page a journey scans (66 calls in 12 specs). A computed check holds every header control's accessible name to contain its visible text, at 1280 and 390 px | e2e (every `expectAccessible` runs `a11y.ts:12`; the check in `brand.spec.ts`) | ci-browser |
  | A11 | The browser jobs' setup | With the apt cache hit, no `playwright install --with-deps` over 60 s, against 10 of 92 over it (86-612 s) in the 14 ci.yml runs before 6ddd587's; every restored archive verified against the signed index before apt uses it | The install step's duration in each job's steps (`gh api …/runs/<run>/jobs`), on the PR's runs and the first five push runs after the merge; `apt-archives.sh verify`'s kept and discarded counts | ci-browser |
- **§3.5**, the three rows:

  | ID | Case | Assertion | PR |
  |---|---|---|---|
  | CI-18 | One browser build everywhere | The web tests, the worker, the tools and the lockfile name one Playwright version (playwright-core one catalog line), and the worker image installs the lockfile's playwright-core with no version of its own; every step that installs the browser, in every workflow, is followed by the check that holds every file of the headless shell's and Chromium's builds to `browser.json`'s tree SHA-256s before any test runs or cache is saved, and the worker image's headless shell is held to it in `images` and in the release's build before it is saved; CI regenerates all seven baselines from nothing, byte for byte, on every pull request and every push; a browser-tests PR is red on the browser check by design, until the baseline procedure runs, and its other steps still run (moved from CI-12, §3.2.7) | ci-browser |
  | CI-19 | Header controls named by their visible text | Each header control's accessible name contains its visible text (WCAG 2.5.3) at 1280 and 390 px; axe 4.14 with the WCAG 2.0/2.1 A and AA tags finds no violation on any page a journey scans | ci-browser |
  | CI-20 | Runner images | Every job on ubuntu-26.04 but the release's capacity chain, on the release runner; the probe's runner comes only from its dispatch input; the browser jobs' cached system packages are used only after each matches the signed index's SHA-256; the release binds images by the config digest hashed from the saved archive under either image store, carries each image's identities from the build as job outputs no later job can rewrite, proves the measured image, the loaded image before any push and the pushed image are that one, builds every checked image with no attestation manifest, and its push and report jobs run no repository code; the image scan reads the built archive; the report names its runner image, image store and identity source, and the launch check refuses another image or a non-archive binding | ci-browser |

  Registry (`none(0, …)`, `assertedBy`): CI-18 `tools/test/browser-version.test.ts`, `tools/ci/browser-build.test.ts`,
  `tools/test/no-duplicated-versions.test.ts`, `tools/test/workflows.test.ts`; CI-19 `apps/web/e2e/brand.spec.ts`,
  `apps/web/e2e/a11y.ts`; CI-20 `tools/test/workflows.test.ts`, `tools/ci/apt-archives.test.ts`,
  `tools/screening-capacity/{image-id,measure,report,launch-check}.test.ts`.
- **§4**, the interfaces: "the `browser.json` fields, the baseline step's output format and the runbook heading
  'Upgrading the browser'" becomes "`browser.json`'s fields (`revision`, `browserVersion`, and per build `dir`, `path`,
  `treeSha256` with its shell form, `sha256`, `zip`, `zipSha256`), `tools/ci/browser-build.ts`'s command line (`node
  tools/ci/browser-build.ts [--image <ref>] [--list]`) and message, the install step's `id: browser-install`, the
  baseline step's `path base64` output, the apt cache key (`apt-v1-<ImageOS>-<ImageVersion>-<hash of browser.json>`,
  the `runner-image` step's `key` and `os` outputs) and `tools/ci/apt-archives.sh {verify,collect} <dir>`, image-id.ts's
  three digests (`config`, `manifest`, `target`), the release build's outputs (`sha256_<image>`, `config_<image>`,
  `target_<image>`), the harness's `--image-archive <name>=<path>` and `--expect-image <name>=<config digest>`,
  `processImagesProblems`' copy wording, and the runbook heading 'Upgrading the browser'"; "`<image>.tar.sha256` and
  `<image>.id` beside each release tarball" stays for a person reading the artifact, `.id` now image-id.ts's config
  digest, and no check reads either (§3.3.6, S1). The two ci-browser rows:

  | PR | Builder | Owns | Runs locally |
  |---|---|---|---|
  | ci-browser | **P1, browser, app and baselines** (lays 1248 out by hand first, until the session's `setup-container.sh` commit lands) | `apps/web/package.json`, `apps/worker/package.json`, `tools/package.json`, `pnpm-workspace.yaml`'s catalog line, `pnpm-lock.yaml`; `apps/worker/Dockerfile`; `shell.tsx`; `brand.spec.ts` and the seven PNGs; `browser.json`; `tools/ci/browser-build{,.test}.ts` (with the tree hash, the resolution chain and `--image`); `tools/test/{browser-version,no-duplicated-versions}.test.ts`; ADR 0058; `docs/runbooks/ci.md` (the jobs note, the Caches row and paragraph from §4's interfaces, "Upgrading the browser"); `dependency-upgrades.md`'s browser paragraph | `node tools/ci/browser-build.ts`; the brand journey and the 12 axe specs plus sign-in, on the 1248 layout; the regeneration no-op; tools/test; `pnpm install --frozen-lockfile` under the gates |
  | | **P2, runners, CI steps and binding** | every line of every workflow file (`runs-on`; ci.yml's apt, browser-check and baseline steps; `images`' checks; large-zip's apt steps; `screening-capacity.yml`'s dispatch input, archive builds and apt cache; release.yml's and `release-dry-run.yml`'s identity steps); `tools/test/frozen/publish-content.yml`'s `runs-on`; `tools/ci/apt-archives.sh` and its test; `tools/test/{workflows,collection}.test.ts`; `tools/screening-capacity/{watched.ts, watched.test.ts, watched-paths.txt}` (N7); `tools/screening-capacity/{image-id,containers,run,report,launch-check}.ts`, `image-id.test.ts`, `measure.test.ts` (whole file: it tests `containers.ts`; `:232` moves to P1's `browser-version.test.ts`), `report.test.ts`, `launch-check.test.ts`, `test-support/measurements.ts`; `restore-drill.db.test.ts`'s comment; `docs/runbooks/screening-capacity.md`; ADR 0062; ADR 0063's item 15; ADR 0066 Part 3; reconciliation-001; the test matrix and the synth registry (CI-18 to CI-20) | capacity unit; actionlint (with the `-ignore`); tools/test, tools/ci; `pnpm synth --all` with a clean diff |

  The 2026-10-24 rows gave P1 `measure.test.ts` and `screening-capacity.md:464`; both move to P2, which owns the code
  they test or describe. Outside the PR, the session commits the `setup-container.sh` change to `claude/build-ops`
  before P1 starts, or P1 lays 1248 out by hand (§3.3.1).
  §4's order line for ci-browser reads "after ci-deps merges"; the UX review's checklist is the merged
  `ux-brand-reviewer.md` if there is one, otherwise the brief and `brand.md` (§3.3.6, S7).
- **§6**, the row "Playwright 1.64.1's browser (1248), for ci-browser": **Yes, by hand-layout** from the two pinned zips
  (`scratchpad/ci-browser/cft/`, SHA-256 equal to `CFT_BUILDS`), into `/opt/pw-browsers`, then by `setup-container.sh`
  for every argument worktree (§3.3.1); covered by CI's browser check and baseline step. The row on the 1194 layout
  stays for worktrees on older bases. Docker's row gains: the worker image's browser check, image-id.ts's equality, the
  containerd `.Id` compare on 26.04, the archive scans and the harness's store proof run only on CI.
- **§9**, ci-browser's rows:

  | PR | Risk | Mitigation |
  |---|---|---|
  | ci-browser | The 26.04 Docker uses the containerd store | The config digest hashed from the archive under either store; the harness proves the loaded tag per store (`config` or `target`); `images` proves the reader and the containerd rule on 26.04 each run; the capacity chain stays on 24.04 (F5) |
  | ci-browser | Buildx attestations make the containerd store's `.Id` an index's digest | `provenance: false` and `sbom: false` on every identity build; image-id.ts returns `target` and the harness compares it (§3.3.6, S2) |
  | ci-browser | Trivy's daemon source misreads images on the containerd store | `images` scans the built archive with `input:` and never the daemon (§3.3.6, S10) |
  | ci-browser | A job running repository code replaces a release artifact (`overwrite: true`) | The build's identities are job outputs; `capacity` and `push` check against them, `push` before any push (§3.3.6, S1) |
  | ci-browser | A file beside an equal browser binary differs (mirror or cache) | `treeSha256` over every file of each build (§3.3.6, S3) |
  | ci-browser | An application change moves a baseline under the comparators' tolerance | The baseline step runs on every pull request, deletion-first (§3.3.6, B1) |
  | ci-browser | Playwright's mirror (`cdn.playwright.dev`) serves other bytes than Google's CfT 156 | The browser check fails on the first run; `browser.json`'s tree and binary SHA-256s take CI's, its zip fields stay the local pin, and the baseline step gives the pictures as CI renders them (recorded against ADR 0058) |
  | ci-browser | The baselines render differently on 26.04 than on the 24.04 host that made them | The baseline step regenerates them on CI's runner, fails on any byte, and prints CI's pictures to commit and inspect |
  | ci-browser | A weekly runner image changes a font package | The baseline step runs on every push run, off the merge path, and on every pull request; the apt key changes with `ImageVersion` |
  | ci-browser | A poisoned or stale cached `.deb` | apt checks size only, so `apt-archives.sh verify` deletes any file whose SHA-256 differs from the signed index's before apt runs |
  | ci-browser | Every Playwright bump is red on the browser check | Deliberate (A4): the message names ADR 0058's procedure and the expected and found builds |
  | ci-browser | actionlint refuses `ubuntu-26.04` | One exact `-ignore` in the test; P9 and P10 |
  | ci-browser | Compose 5.1.3 on 26.04 differs from 2.38.2 under `tools/ci/postgres.sh` | The PR's own db, domain-model and e2e jobs run it on 26.04; the script's stub test cannot |
  | ci-browser | axe 4.14 flags #42's new pages | O6: fixed by whichever PR merges second |
  | ci-browser | The restore drill fails on `pg_dump` 18 | Fixed in the PR, as a real check gained |
  | ci-browser | Playwright 1.64's breaking changes (hidden iframes, renamed snapshot modes) | The full e2e run on CI; `=all` in the regenerate command |
- **§11:**
  - **O5.** After the merge, the session dispatches `gh workflow run screening-capacity.yml -f runner=ubuntu-26.04`
    once, and records the report, its `imageStore` and `docker info` on issue #41, for F5's later move.
  - **O6.** The axe sweep over #42's journeys runs in whichever of #42 and ci-browser merges second (§3.3.1). #42 is a
    draft at 13f59b1 on 2026-10-26.
  - **O7.** Measured on 2026-10-26: `packets-rest` at most 10:06; ci-browser rebalances `stryker/shards.json` only if a
    shard reaches 12:00 on its own full run or in the last ten push runs (§3.3.1).
  - **O8.** The 2026-10-24 scratchpad layout no longer exists. After ci-browser merges and no worktree names 1194,
    `setup-container.sh`'s `CFT_BUILDS` may drop the 1194 rows and `/opt/pw-browsers/*-1194` may be removed.
  - **O9.** Unchanged: the two Playwright hosts are still refused (2026-10-26, [SV] §3). Once allowed, P11.

#### 3.3.6 Review of the re-read (2026-10-26)

The review: `scratchpad/ci-browser/review.md` (copied to `designs/lane-b-ci/ci-browser-reread-review.md` with this
text; 1 blocking, 11 should-fix, 9 nits). Each finding was checked again against 6ddd587, Playwright 1.64.1's published
code (`scratchpad/ci-browser/pw-review/x/package/lib/matchers/expect.js`), axe-core 4.14.0's `axe.js`, the two CfT
zips, the npm registry, #42's files (`gh api …/pulls/42/files`, GET, read only) and trivy-action's `action.yaml` at its
pin, before any text changed. Every finding names a real defect; S2 and S10 are plausible rather than reproduced (no
Docker daemon here) and are taken because the fix is the safer design either way. Two are fixed by another means than
the review proposed (B1's line count, S9's condition), each with its reason below, and S11 and S3 go further than
proposed. The sections above carry each change, marked "§3.3.6".

**Blocking**
- **B1. Fixed, with the review's count corrected.** Confirmed: the pictures are also drawn by application code
  (`brand.spec.ts:10-12` imports the worker's mail, template and statement modules; the header is `shell.tsx`), the
  comparators pass a change under 1% (`:69`), and ADR 0058:225 names the case. The step now runs on every pull request
  and every push with no diff condition (the cost, one spec on one shard, is measured on the PR and kept in ci.md; an
  import-closure list by `watched.ts`' mechanism is the fallback, never a hand list). The second bypass is confirmed too:
  under `all`, Playwright writes only the screenshots a run reaches and writes nothing over an equal file
  (`expect.js:12620-12660`). The step removes the seven files first, runs with `--retries=0` (the config retries once
  on CI, `playwright.config.ts:83`, and a retry would find the first attempt's files), enforces exit 0, and counts seven
  lines. The review's count named the wrong line: after the removal each file logs "A snapshot doesn't exist at
  <path>, writing actual." (`handleMissing`, `expect.js:12484-12487`), not "is re-generated", which is logged only for
  an existing file. `git diff --exit-code` then fails on a deleted file. O6's "decided on the merged head's push run"
  becomes the second pull request's own run.

**Should fix**
- **S1. Fixed as proposed, and the "removes none" sentence corrected.** Confirmed: the `.id` and the tarball share one
  artifact (`release.yml:110-118`), ci-deps uploads it with `overwrite: true`, and `capacity` runs `pnpm install` and
  the harness (`:153-156`) beside `push` (both `needs: build`, `:130`, `:203`). The build's identities become
  per-image job outputs (`sha256_<image>`, `config_<image>`, `target_<image>`; distinct names, since the build is a
  matrix), read through `toJSON(needs.build.outputs)`. `push` checks the tarball and, before any push, the loaded
  `.Id` per store; the registry check follows the pushes. `capacity` passes `--expect-image`. The first revision had
  moved `:228-229`'s compare after the push; it is kept before it.
- **S2. Fixed (plausible; not reproduced, no daemon).** image-id.ts returns `target`, `index.json`'s top-level
  descriptor digest, which the harness and `push` compare on the containerd store; every identity build passes
  `provenance: false` and `sbom: false` (`release.yml:61`, `ci.yml:476, :498`, `screening-capacity.yml:151, :162`),
  so both stores see one manifest. Nothing is lost: the release's attestation is `attest-build-provenance` on the
  report (`release.yml:265`), its bill of materials Trivy's (`:89`). `image-id.test.ts` gains the attested-index case.
- **S3. Fixed, with the values computed here.** Confirmed: 287 files in the headless shell's zip, 301 in Chromium's
  (no symlinks; `scratchpad/ci-browser/scripts2/ztree.py`, 2026-10-26 01:29 UTC). `browser.json` gains `dir` and
  `treeSha256` per build (`333985b3…54172e`, `2f991090…129545`), defined so that `find <dir> -type f -print0 | LC_ALL=C
  sort -z | xargs -0 sha256sum | sha256sum` reproduces it, which the `--image` mode runs inside the image and the test
  holds equal to the script's own computation. The binary hash stays for the message.
- **S4. Fixed.** Confirmed: six install steps (`ci.yml:191, :267, :429`, `large-zip.yml:37`, `release.yml:157`,
  `screening-capacity.yml:177`) and the release's unverified worker build. The check follows every one, a
  `workflows.test.ts` rule holds that for every workflow, and `--image` runs in `release.yml`'s and
  `release-dry-run.yml`'s `build` before `docker save`; `push` and `report` stay clean.
- **S5. Fixed as proposed.** Confirmed: nothing hoists playwright-core (`ls`), and `images` installs nothing
  (`ci.yml:466-514`). The script resolves the `@playwright/test` → `playwright` → `playwright-core` chain (each exports
  `./package.json`); `--image` reads the image's own `browsers.json` by `docker run`. One addition: every job that runs
  the script takes setup-node 24 with both cache inputs off, rather than relying on the runner image's Node.
- **S6. Fixed.** Confirmed: 13 files shared with #42. §3.3.2 gains the table, with #42's hunks from the API, ci-browser's
  lines, the merge rule (the lockfile and `watched-paths.txt` regenerated, never hand-merged, `lanes/lane-b.md:67`;
  rows and amendments kept from both in merge order) and the ruling (Q2 or rule 6). The format is 9 whichever merges
  second (#42 leaves `report.test.ts:527-528` alone).
- **S7. Fixed, by the brief of record.** Confirmed at `lanes/lane-b.md:135, :143`; `.claude/agents/` has no UX
  reviewer and no `co-001/ux-brand-reviewer` branch exists (`git ls-remote`). The orchestrator's brief for the CI session
  (2026-10-26 ~00:40 UTC) is later than `lane-b.md:135` and settles it: ci-browser is cut after ci-deps merges, and its
  UX and brand review runs from `ux-brand-reviewer.md` if merged, otherwise from `designs/lane-b-ux-review-brief.md` and
  `.claude/rules/brand.md`. The review's "or from that PR's head" is not taken: an unmerged file is not the reviewer of
  record, while the brief and the brand rules are. §4's row says the same.
- **S8. Fixed as proposed.** §3.3.3 adds the worktree red run for `measure`, `report` and `launch-check` tests, with
  the test support copied too, and requires each to fail on an assertion, not on a missing export; acceptance 3 names
  both runs.
- **S9. Fixed, by a narrower condition.** Confirmed: every step after the check has `success()`, and `browser.json`'s
  `playwright` duplicated the manifests. The later steps take `!cancelled() && steps.browser-install.outcome ==
  'success'`, not the review's bare `!cancelled()`: a failed `pnpm install` or browser install would otherwise run every
  test into noise. The cache saves keep `success()`. `playwright` leaves `browser.json`. Acceptance 10 then observes a
  bump's other failures.
- **S10. Fixed (plausible; not reproduced).** `images` builds archives, Trivy scans them with `input:` (present at the
  pinned `ed142fd…`, `action.yaml:13-16`), image-id.ts and the browser check read the same bytes, and the worker is
  loaded only for `--image` and the store-aware compare. §9 gains the row.
- **S11. Fixed, and two more.** Confirmed `reconciliation-001.md:576`, ADR 0063:478 and ADR 0062's binding text at
  `:1096, :1322-1325` (the earlier `:1115`, `:1186` are runner-layout text). The same grep found two more stale
  statements: ADR 0062:1052 ("every other job, the gate included …, stays on `ubuntu-24.04`") and
  `screening-capacity.md:288-289` ("as `ubuntu-24.04` pins every other job's"). All five join §3.3.2; ADR 0063's item
  is reworded in place, as ci-deps edits `:494-497`.

**Nits**
- **N1. Fixed.** `npm view playwright@1.64.1 dependencies optionalDependencies` → playwright-core only; the lockfile
  loses `fsevents@2.3.2` (`:2877, :5946, :6376`).
- **N2. Fixed.** 14 runs (`sort -u` of the run column), 92 installs, 10 over 60 s; §3.3.1, A11 and the table say 14.
- **N3. Fixed.** The `runner-image` step writes `key` and `os`; the restore-keys use both, and the test names them.
- **N4. Fixed.** The release build's setup-node sets no `cache` and `package-manager-cache: false` (ci-deps, design
  `:686`); the same for every job that runs `browser-build.ts`.
- **N5. Fixed.** The dry-run equality rule strips the registry check as well and admits the build's new steps; the
  worker's `--image` check is exercised by `images`, not the dry run (which builds `web` only).
- **N6. Fixed.** `notify` (`screening-capacity.yml:274-276`) skips a dispatched 26.04 probe; the test holds the
  condition.
- **N7. Fixed, by ci-deps' own mechanism.** `tools/ci/apt-archives.sh` and `tools/ci/browser-build.ts` (the second,
  which S4 adds to the job, found here) join `WATCHED_FIXED` (`watched.ts:62`), the push paths and `pushPaths`, and
  `watched-paths.txt` is regenerated, as ci-deps does for `docker-compose.yml` (§3.2.7, S1).
- **N8. Fixed.** `launch-check.ts:399-401` is reworded; the cache sentence and ci.md's Caches paragraph say "runs of
  the build branch's own code (push, schedule, dispatch)" under F1 (a).
- **N9. Fixed.** One mechanism each: the name from `ariaSnapshot()`, the visible text from `innerText` plus
  `::before` content; axe's `incomplete` for a one-letter label confirmed at `axe.js:30885-30886` (4.14.0).

**Left open:** none in the design. Three facts are proved only on CI and are acceptance steps, not open questions:
the mirror's bytes against `browser.json`'s tree hashes (first run), the containerd `.Id` rule on 26.04 (`images`,
every run, and the probe), and the baseline step's cost (measured on the PR).

#### 3.3.7 Re-read at e908c21 (2026-10-27)

**Sources and method.** ci-deps (#48) merged as e908c21 with nine other pull requests behind it (#46, #49 to #56), and
the session merged it into ci-browser as 2ab2b15 (`git log -1 2ab2b15`; pushed, 3.3.8: `git ls-remote origin refs/heads/co-001/ci-browser` gives 2ab2b15 at 02:24 UTC, and no CI run exists for it yet, `gh api …/actions/runs?head_sha=2ab2b15…` total 0). This re-read takes two
scout reports of 2026-10-27, `scratchpad/reread2/scout-files.md` and `scratchpad/reread2/scout-versions.md` (cited as
[RF] and [RV]), the phase-1 summary (`approval-summaries/lane-b-ci-browser-build-summary.md`, cited as [BS]), the
status file (`approval-summaries/lane-b-ci-deps-status.md`) and the rules (`LANES.md:84-92`, rule 6;
`lanes/lane-b-session-brief.md:9, :30-60`). Every claim was checked again at 2ab2b15 in `/home/user/ci-browser`
before it went in: `grep -n runs-on .github/workflows/*.yml` (30 jobs), `workflows.test.ts:205-210, :415-429`,
`release-capacity.yml:1-140`, `content-calendar.yml:1-75`, `screening-capacity.yml:186-262`, the apt keys
(`grep -n "apt-v1-"`), the baseline step (`ci.yml:595-645`), `brand.spec.ts:189, :213`, the lockfile and manifest
lines, the documents' anchors, `grep -o "expectAccessible(" apps/web/e2e/*.spec.ts` (14 files, 72 calls), #42 by `gh
api repos/PureTideWater/PhysicalTherapy/pulls/42` (GET, 2026-10-27 02:02 UTC), and the unit delta by `vitest list
--project unit --json` on e908c21 (the main checkout) and on 2ab2b15 (`scratchpad/reread2/revise/list-{base,head}.json`).
Where a fact could not be checked here it says "not verified". Cites in this subsection read at 2ab2b15 unless they
name another commit; the earlier subsections keep 6ddd587's cites, except where an edit marked "(3.3.7)" corrects a
fact that is now wrong.

**What changed from the 2026-10-26 text, and why.** "Adopted" means the built or found form is now the design's text,
with the reason it is the better option; "reverted" means the build goes back to the design.

| § | Change | Evidence |
|---|---|---|
| 3.3.1 Runners | **30 jobs at 2ab2b15** (the base's `content-calendar.yml` and `release-capacity.yml` add four). **8 stay** on `RELEASE_RUNNER.label` (`ubuntu-24.04`): `release.yml`'s four; `release-dry-run.yml`'s `build`, `push` and `capacity`; `screening-capacity.yml`'s `capacity`. **22 move** to `ubuntu-26.04`, among them content-calendar's `check` and `notify` and release-capacity's `capacity` and `notify` (3.3.8, B2: F5's letter; the 2026-10-27 text kept release-capacity's `capacity` on 24.04). Reason under "The new workflows" below. | `grep -n runs-on` (18 lines on 26.04, 12 on 24.04 or the probe expression); `release-dry-run.yml:219`; `workflows.test.ts:210, :429` |
| 3.3.1 Runners | **Adopted: `RELEASE_CHAIN` holds the dry run's `capacity`** ([BS] P2; ADR 0066 N12, `:865-866`). The dry run's `capacity` existed at 8b38f48 and mirrors release.yml's measuring job, so it measures on the same runner; the design's "seven" missed it. | `release-dry-run.yml:219`; `workflows.test.ts:210` |
| 3.3.1 Runners | The 18-count (`workflows.test.ts:429`) becomes **22** (3.3.8; the 2026-10-27 text's 21); `RELEASE_CHAIN` (`:210`) and its comment (`:205-209`) stay as they are. | `workflows.test.ts:205-210, :429` |
| 3.3.1 Runners | The 26.04 image: `ubuntu26/20261026.180` (e2ea192b), image 20261026.180.1, kernel 7.0.0-1017-azure, Node 24.22.1, Docker 29.4.2, Compose 5.1.3, Buildx 0.38.1, PostgreSQL 18.6 (service disabled). The 24.04 image: 20261026.354.1, Node 22.23.4, Docker 28.0.4, Compose 2.38.2, PostgreSQL 16.15. | [RV] §3: `Ubuntu2604-Readme.md:9-11, :25, :72-75, :161-164`; `Ubuntu2404-Readme.md:9-11, :26, :75-78, :173` at those tags |
| 3.3.1 Runners | "Docker 29 reaches 24.04 only by a toolset change" stands: re-checked 2026-10-27, `toolset-2404.json:199-206` still pins docker-ce and docker-ce-cli 28.0.4 at the newest tag and at main (6d35e161). | [RV] §3 |
| 3.3.1 Runners | "`ubuntu-latest` moves to 26.04 in November 2026 (#14748)": **not re-verified** on 2026-10-27 (the issue is unreadable from here); `README.md:25` still maps `ubuntu-latest` to 24.04 with no date. Nothing changes, since the runner rule refuses `-latest`. | [RV] §3 |
| 3.3.1 Runners | actionlint: v1.7.12 is still the latest release (main 011a6d15, 2026-04-19); `rule_runner_label.go:44-47, :85-88` lists 22.04 and 24.04 only. The `-ignore` stays. | [RV] §4 |
| 3.3.1 Restore drill | db at e908c21: **9,222 passed and 1 skipped** over 127 files (the skip is the drill on 24.04). On 26.04: **9,223 and 0**. | CI run 40401493722, db jobs 121848211735, 121848211680, 121848211747, 121848211603 ([RF] §3); `restore-drill.db.test.ts:73-76, :103, :194` |
| 3.3.1 Versions | Unchanged: 1.64.1 and 4.14.0 are still npm `latest`. `@playwright/test`'s `next` is 1.65.0-alpha-2026-10-26; axe's `next` and `rc` are 4.14.1 prereleases; no 1.64.2, 1.65.0 or 4.14.1 stable. `browsers.json` in the 1.64.1 tarball (integrity equal to the registry's) still names 1248, CfT 156.0.8078.4. | `npm view … dist-tags time`, `git ls-remote --tags`, 2026-10-27 01:49-02:05 UTC ([RV] §1) |
| 3.3.1 Versions | Trust: from 1.64.0 and 4.14.0 the trusted publisher's `oidcConfigId` drops its `oidc:` prefix, with the same UUID; no evidence is lost. pnpm 10.34.8's trust check reads only whether `_npmUser.trustedPublisher` is present (`getTrustEvidence`, `/opt/pnpm-10.34.8/dist/pnpm.cjs:67239-67241`), never `oidcConfigId`, and all five bumped versions carry it with SLSA provenance (3.3.8, N1). | the packuments ([RV] §1); `npm view <pkg>@<v> _npmUser.trustedPublisher dist.attestations.provenance.predicateType`, 2026-10-27 02:23 UTC |
| 3.3.1 Versions | `tools/package.json:33` → **`:34`**; `axe-core@4.13.0` at `pnpm-lock.yaml:2537` (snapshot `:5673`); `fsevents@2.3.2` at `:2924, :6001` (playwright's reference `:6431`); `playwright-core@1.56.1` `:3452, :6425`; `playwright@1.56.1` `:3457, :6427`; `@playwright/test@1.56.1` `:2055, :5197`. ci-deps changed no Playwright, axe or fsevents entry. | `grep -n` at 2ab2b15 |
| 3.3.1 Versions | `pnpm-workspace.yaml` already carries `trustPolicyExclude: [semver@6.3.1]` and the override `typed-rest-client>qs: 6.16.1` (ci-deps'); the bump adds no exclude and touches neither. | `pnpm-workspace.yaml`; [RF] §1 |
| 3.3.1 Versions | The catalog rule now lives in `no-duplicated-versions.test.ts:124-139` (every catalog package is `catalog:` in every workspace manifest, root included). `playwright-core: 1.64.1` goes between `pg` (`pnpm-workspace.yaml:21`) and `react` (`:22`), the keys being sorted. The only `playwright-core` entries are `apps/worker/package.json:53` and `tools/package.json:34`. | `grep -n playwright-core` |
| 3.3.1 Versions | next is `^16.4.3` (`apps/web/package.json:39`); its optional peer `@playwright/test ^1.51.1` (`pnpm-lock.yaml:3323`) holds for 1.64.1, and the `next@16.4.3(…)(@playwright/test@1.56.1)` snapshot re-resolves with the bump. | `sed -n` at 2ab2b15 |
| 3.3.1 Worker image | **Adopted: `RUN mkdir /out && cp -RL …`** (`apps/worker/Dockerfile:21`), and `/root/.npm` no longer removed ([BS] P1). Nothing writes `/root/.npm` once npm installs nothing, so removing it was dead code; `mkdir` makes the copy's target explicit. | `Dockerfile:21` |
| 3.3.1 Worker image | `workerPlaywrightVersion` moved to `containers.ts:661`, `processImagesProblems` to `:671` (the base added `ServiceName` `'worker'`). `processImagesProblems` has a second caller, `tools/release-capacity/run.ts:20, :359`; its copy wording serves both. | [RF] §1; `grep -n processImagesProblems` |
| 3.3.1 WCAG 2.5.3 | Reach: **14 specs, 72 calls** (was 12 and 66): `pricing.spec.ts` (4) and `viewer-phi.spec.ts` (1) are new, `billing.spec.ts` went from 3 to 4. `shell.tsx` is unchanged by the base; no new header control (`:328` "Menu" and `:341` "Help with this screen" show their text and carry no `aria-label`). | `grep -o "expectAccessible("`; [RF] §3 |
| 3.3.1 WCAG 2.5.3 | **Adopted: `toHaveAccessibleName`, not `ariaSnapshot()`** ([BS] P1; `brand.spec.ts:189, :213`). A `<summary>` has no role in Playwright's aria snapshot, which prints its text, not its name, so `ariaSnapshot()` cannot read the name the check needs; `toHaveAccessibleName` reads the computed name directly and is a web-first assertion that retries. | `brand.spec.ts:189` |
| 3.3.1 WCAG 2.5.3 | e2e at e908c21 is **54**, not 51 (the check is a step, so ci-browser adds none). | jobs 121849065662 and 121849065557, 27 each ([RF] §3) |
| 3.3.1 Browser check | **Adopted: `apps/web/e2e/browser-builds/<dir>.sha256`** ([BS] P1): each build's file list (`<sha256>  <path>` lines) is committed and must hash to `treeSha256`, so a difference names the files, not only the tree. The design's "names the first ten paths … from the zip's list" needed that list in the repository anyway; now it is one, held by the tree hash. | `ls apps/web/e2e/browser-builds/` |
| 3.3.1 Browser check | **Adopted:** `browser-build.ts` fails on a non-regular entry (a symlink or device in a build), runs the binary's `--version` and prints it, names the only directory present when the recorded `dir` is absent, and uses `xargs -0r` in the image ([BS] P1; `browser-build.ts:141, :183, :191, :210-211`). Each is stricter or clearer than the design, at no cost. | as cited |
| 3.3.1 Browser check | **Changed: on any tree difference it prints every file line**, as `--list` does (about 590 lines, only on a red check), not the first ten. With no local browser, one CI run must give everything needed to rewrite `browser.json` and `browser-builds/*.sha256` if Playwright's mirror serves other bytes than Google's; the workflows run it without `--list` (`ci.yml:241, :353, :552`). | `browser-build.ts:243-255, :274-276, :330` ([RV] §5) |
| 3.3.1 Browser check | **Added: `--image` on the two measured worker images that lacked it**: `release-capacity.yml`'s `capacity` (after its build and setup-node) and `screening-capacity.yml`'s `capacity` (after "Load the images as built"). Both measure the worker image whose headless shell prints the PDFs, and the check takes seconds. A `workflows.test.ts` rule holds that every job that builds `apps/worker/Dockerfile` into a local tag runs `browser-build.ts --image <that tag>` before the tag is used. | `release-capacity.yml:60-73`; `screening-capacity.yml:186-221`; `ci.yml:762`, `release.yml:159` |
| 3.3.1 Browser check | **Adopted: the capacity jobs keep the default condition past the browser check** ([BS] P2). A measurement on a browser that fails the record is not a result of record, and a red capacity job opens an issue; `ci.yml`'s test jobs keep `!cancelled() && steps.browser-install.outcome == 'success'`, where seeing a bump's other failures is the point (S9). | [BS] P2; `screening-capacity.yml:254-255` |
| 3.3.1 Baselines | **Adopted: the step compares the set written with `git ls-files` of the committed baselines** ([BS] P2; ADR 0066 N14, `:869`; `ci.yml:607, :623, :630`), with its own `--output` and after the failed-pictures step. It is held by the committed set, not by a message text a Playwright release may reword or a count of seven a new baseline would break; its own `--output` keeps the shard's results for the failed-pictures step, which prints first. | `ci.yml:595-645` |
| 3.3.1 Baselines | **Changed: the bytes of record come from CI's baseline step, not from a local 1248 layout**, which cannot be made here (`storage.googleapis.com` and `cdn.playwright.dev` refused, 01:50 UTC; `/opt/pw-browsers` holds 1194 (laid out 2026-10-27 02:00 UTC) and 1243, not 1248, `ls -la --time-style=full-iso /opt/pw-browsers`; the verified zips of 2026-10-26 are gone). CI's 1248, held to `browser.json`'s hashes by the browser check, is the build of record, not a stand-in (brief `:9`). Procedure under "Phase 2 on this base". | [RV] §2, §5 |
| 3.3.1 Baselines | **Changed: the picture print is chunked**, `<path> <i>/<n> <base64 chunk of 8,000 characters>`, with each picture's SHA-256 printed first. CI artifacts and the REST log endpoint redirect to `productionresultssa18.blob.core.windows.net`, which the proxy refuses; the GitHub MCP `get_job_logs` works, and whether a 66,216-character line survives it is not verified. Chunks make that question moot, and the printed SHA-256 proves each decode. | [RV] §5 |
| 3.3.1 Baselines | The local no-op (acceptance 4) **waits on the person: storage.googleapis.com**. It adds only ADR 0058's host-independence finding (`:162-176`) and does not block the PR; CI's from-nothing run is the proof until then. | brief `:9` |
| 3.3.1 A9 | **Changed (the 2026-10-27 direction):** the inspection is the co-founder's, taken as recommended by the session and recorded with its evidence in `designs/lane-b-ci/ci-browser-a9.md` (side-by-side old and new images and pixel counts); the visual-inspection agent still runs and its verdict goes in the note. The private gallery is no longer the record. | the task's direction of 2026-10-27 |
| 3.3.1 V3 | **Adopted: the apt key hashes playwright-core's installed `browsers.json`** (`hashFiles('node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json')`, `ci.yml:229, :341, :540`, `large-zip.yml:53`, `screening-capacity.yml:243`; ADR 0066 N13, `:867-868`), as the browsers' own cache does (`ci.yml:209`). It follows the build Playwright actually installs, including on a `browser-tests` bump whose `browser.json` still names the old one, so the cache never mixes two builds' dependency sets. | as cited |
| 3.3.1 V3 | **Adopted: the apt cache is saved only off `pull_request`** ([BS] P2; `ci.yml:251, :254`), in `unit` and in screening-capacity's `capacity`. The safer form: only runs of the build branch's own code write a cache a pull request reads. | as cited |
| 3.3.1 V3 | Where: content-calendar and release-capacity take no apt cache, since neither installs a browser on the runner (the image's apt runs inside `docker build`, `Dockerfile:34-36`). | `grep -n "playwright install"` |
| 3.3.1 Binding | **Adopted: the after-#42 split** ([BS] "After #42"; ADR 0066 `:813-823`). Built now: image-id.ts, `provenance: false`/`sbom: false`, the build's per-image outputs, the archive SHA-256 checks against them, the store-aware `.Id` compare, `release.yml`'s `push` checking all four archives before any push (stronger than per-image-then-push: no partial push), the registry check, release and dry-run builds proving the saved tag, screening-capacity's archive builds and loads, `images`' archive scan, and `containers.ts`' `proveLoadedImage` (`:379`) with its tests. Moved to a follow-up cut after #42 merges (or when GitHub moves 24.04's docker-ce past 28, first): `run.ts`'s `--image-archive`/`--expect-image` and its `.Id` read, report format 9 and its four fields, the launch check's `imageOS`/`imageSource`/format-8 refusals, and `release.yml`'s and screening-capacity's harness flags. Reason: `run.ts` and `report.ts` are on the "Not while #42 is open" list (`LANES.md:90`), and under F5 the binding chain stays on 24.04's classic store, where `.Id` is the config digest, so the deferred checks protect nothing until the probe or the toolset change. | [BS]; `containers.ts:379`; `LANES.md:84-92` |
| 3.3.1 Binding | release-capacity's build is not an identity build: it reads no `.Id`, its `run.ts` uses only `DockerRuntime` and `processImagesProblems` (`tools/release-capacity/run.ts:20, :359`), and nothing binds its report (`workflows.test.ts:1231-1233`). Its read-only `cache-from` stays (ADR 0066 `:399-401`). `provenance`/`sbom` there: not added (no identity reads it; the `--image` check needs a loaded tag, which `load: true` gives). | as cited |
| 3.3.1 BuildKit, login | No effect: the BuildKit pin is now on five setup-buildx steps (`release-capacity.yml:54` added); `docker/login-action` v4.7.0 (`release.yml:342`, `release-dry-run.yml:175`) clears phase 1's node20 warning. | [RF] §1 |
| 3.3.1 O6 | #42: draft, open, head **098636e3**, base **e908c21**, 188 files, 17 commits, `mergeable: true`, `mergeable_state: blocked`, updated 2026-10-27T01:45:57Z. It adds `mail-cutoff.spec.ts` and `mail-notices.spec.ts` with 2 `expectAccessible` calls each, which O6 covers. | `gh api …/pulls/42`, 02:02 UTC |
| 3.3.1 Local browsers | `setup-container.sh` reads every argument worktree's revisions (`:42-44`; the 01:45 run named the main checkout and the worktree); `CFT_BUILDS`' 1248 rows are `:967-968` (table `:965-968`) on claude/build-ops c2041dfc. The hand layout is impossible: the verified zips of 2026-10-26 are gone and both hosts are refused. | `grep -n 1248 tools/setup-container.sh`; status file 01:45 UTC |
| 3.3.2 | Files: `tools/package.json:34`; **`content-calendar.yml:43, :68` and `release-capacity.yml:36, :114` (`runs-on`; 3.3.8 adds `:36`), `release-capacity.yml`'s `--image` step, `screening-capacity.yml`'s worker `--image` step** join the list. `browser.json` and `browser-builds/*` are in `WATCHED_FIXED` (`watched.ts:65-68`; [BS] P2 and integrator), adopted because they change what the capacity job's check holds Chromium to. | `watched.ts:62-89` |
| 3.3.2 Documents | 3.3.8 (B2): with every new job on 26.04, F5's wording in ADR 0062 `:1391-1393`, ADR 0063 `:485-486`, reconciliation-001 `:646`, `screening-capacity.md:312-313` and CI-20 (`test-matrix.md:280`, `matrix.ts:420`) is already right and none of them changes; the counts change: ADR 0066 `:753` ("The other eighteen jobs") and N12 `:866` ("eighteen move") become twenty-two as of 2ab2b15, and `docs/runbooks/ci.md:36-40` gains the dry run's `capacity`, which it omits today. CI-18 (`test-matrix.md:278`, `matrix.ts:418`) gains the two weekly capacity jobs' `--image` check (S2). Moved anchors: ADR 0066 Part 3 `:715`; reconciliation F5 `:646`, Q2 `:651`, the capacity line `:569`; CI-18 to CI-20 `test-matrix.md:278-280`, the series note `:252-257`; `matrix.ts:418-420`; `registry.ts:615-617`; ci.md `## Caches` `:222`, `## Upgrading the browser` `:258`. | `grep -n` at 2ab2b15 |
| 3.3.2 #42 table | Updated to 098636e3 below ("The files #42 also changes, now"). The ADR 0062 row becomes a **sure conflict** at the end of the file. | [RF] §4 |
| 3.3.3 | The runner rule with 8 and 22 (3.3.8); the `--image` rule; the full-list print; the chunked picture print; the baseline step's set compare (not a count of seven lines); the second red run covers `measure.test.ts` only (report and launch-check moved after #42). | this table |
| 3.3.4 | Acceptance 4 waits on the person; acceptance 6's image 20261026.180.1 or later, its counts (below), and which new jobs run on the PR's own runs; acceptance 8 the A9 note; acceptance 9 the merged `ux-brand-reviewer.md` (#55) with its shots waiting on the person. | below |
| §1, §3.5 | A8 to A10 still carried pre-§3.3.5 text and A11 was absent; CI-18 to CI-20 likewise. Replaced with the text as built (`test-matrix.md:278-280`) plus CI-18's capacity-job clause (3.3.8: CI-20 back to its text at 2ab2b15). | `sed -n 91,93p`, `:2988-2990` before this edit |

Not taken from the scouts: [RF]'s acceptance-6 note that neither new workflow runs on the PR is half right.
`content-calendar.yml`'s `pull_request` paths (`:26-32`) name the workflow file itself, so the PR runs its `check` on
26.04; its `notify` skips on `pull_request` (`:67`). `release-capacity.yml` has no `pull_request` trigger (`:14-18`).
[RV]'s P16 (the runner rule) is inside ci-browser and is the runner change above, not a proposal.

**The new workflows under ci-browser's rules**

`content-calendar.yml` (#49): no Docker, no browser, no image, no measurement.
- `check` (`:42-60`; `runs-on` `:43`): checkout without credentials, pnpm, setup-node 24 with `cache: pnpm`, `pnpm
  install`, `tsx tools/content-calendar/index.ts`; findings as a job output. **26.04.** It reads files and depends on
  nothing in the host. Runs on this PR (its own path), so the PR's log shows its 26.04 image.
- `notify` (`:65-75`; `runs-on` `:68`; `issues: write`): shell and `gh`, no checkout. **26.04.** Runs after the merge
  (daily schedule `:16`) or by dispatch.
- Rules that apply: the runner rule (both outside `RELEASE_CHAIN`, so 26.04). None of the browser rules (no
  `CHROMIUM_INSTALL`), no apt cache, no `--image`, no binding. actionlint's `-ignore` covers their labels.

`release-capacity.yml` (#49): weekly (`:17`) and on dispatch; advisory and not a required check
(`workflows.test.ts:1231-1233`).
- `capacity` (`:29-106`; `runs-on` `:36`; 180 min): builds the worker image (`:60-68`, `load: true`, tag
  `tp-worker:capacity`, read-only `cache-from`), installs, builds the synthetic release 900110, runs
  `tools/release-capacity/run.ts --worker-image` under `taskset`, and fails on an OOM, a restart, `memory.peak` above
  90%, a count mismatch or an out-of-fetch read (`:3-13`); its audit report prints a PDF from the image's headless
  shell. **Moves to `ubuntu-26.04`** (3.3.8, B2;
  the 2026-10-27 text kept it on 24.04 in `RELEASE_CHAIN`). F5's letter moves every job of every workflow but the chain
  it names (`reconciliation-001.md:646`), and its recorded reason is the binding measurement, made only on the image the
  launch check accepts. This job's report is advisory, never attested, and no launch check, deploy or required check
  reads it (`release-capacity.yml:56-59`; ADR 0066 `:399-401`); its failing checks are an OOM, a restart, `memory.peak`,
  counts and reads, with times recorded and advisory (`:8-12`), so it does not fail on host-sensitive timings. Keeping it
  on 24.04 would extend a founder ruling on the session's authority (brief §6); moving it applies the ruling as written
  and costs nothing binding. The PR-head dispatch below proves it on 26.04 (Docker 29's containerd store, kernel 7.0)
  before the merge; a red result there that the PR causes is fixed in the PR, and one the host causes is recorded on #41
  as a data point, never by moving the job back without the founder.
  - Browser rules: no `CHROMIUM_INSTALL`, so no runner browser check and no apt cache. **`--image tp-worker:capacity`**
    after the build and setup-node (adopted above): the weekly run's PDFs come from that headless shell, and the check
    catches a mirror build that changed between pull requests. `browser-build.ts --image` reads only the image and
    `browser.json`, so it needs no `pnpm install` and can run before it.
  - Binding: not an identity build (above); no `provenance`/`sbom` change; its `cache-from` stays.
- `notify` (`:111-146`; `runs-on` `:114`): no checkout, shell and `gh`. **26.04.**
- Its jobs never run on a pull request. **Recommended:** after the PR's CI is green, the session dispatches it once on
  the PR's head (`gh workflow run release-capacity.yml --ref co-001/ci-browser`), so the `--image` step and the job on
  26.04 are proved before the merge; a failure there opens the advisory issue, which the session closes with the run's
  link if the cause is the PR's. Dispatch from the branch works (3.3.8, N3): the default branch is
  `claude/build-platform` (`gh api repos/PureTideWater/PhysicalTherapy --jq .default_branch`, 02:24 UTC), it carries
  `release-capacity.yml` (contents API at that ref, blob 486e36f5), and `workflow_dispatch` (`:18`) has no branch
  filter; the run uses the branch's copy of the workflow.

**Phase 2 on this base, in order** (3.3.8 folded in)

Needs no local 1248 (each heavy command under `flock /tmp/laneb-heavy.lock`, with Node 24 first on `PATH`):
1. **Runners.** `content-calendar.yml:43, :68` and `release-capacity.yml:36, :114` to `ubuntu-26.04` (3.3.8, B2: F5's
   letter); `RELEASE_CHAIN` (`workflows.test.ts:210`) keeps its eight; `:429` 18 → 22. Check: `pnpm exec vitest run
   --project unit tools/test/workflows.test.ts` turns the runner rule and the simulated Dependabot rewrite (`:2742`)
   green.
2. **`--image` on the measured worker images** (release-capacity's `capacity` after its build and setup-node,
   screening-capacity's after "Load the images as built"), with the rule over every local worker build and the rule
   that every `--image` step has setup-node 24 before it (3.3.8, S6); the full-list print in `browser-build.ts`; in the
   baseline step, the written set taken as the PNGs present after the run (3.3.8, N5) and the chunked picture print
   (`<path> <i>/<n> <chunk>`, each picture's SHA-256 first); each with its test (failing first through `CI_TREE` for the
   workflow rules; `browser-build.test.ts` for the print). Check: the tools vitest run in step 7.
3. **The bump.** `apps/web/package.json:47-48` → `@axe-core/playwright` 4.14.0, `@playwright/test` 1.64.1;
   `pnpm-workspace.yaml`'s catalog gains `playwright-core: 1.64.1` between `pg` and `react`;
   `apps/worker/package.json:53` and `tools/package.json:34` → `catalog:`.
4. **The lockfile under the gates.** `pnpm install` with pnpm 10.34.8, adding no exclude (its trust check needs only
   `_npmUser.trustedPublisher`, which all five versions carry; 3.3.8, N1); then `git diff pnpm-lock.yaml` holds only the
   version swaps (playwright, playwright-core, @playwright/test, @axe-core/playwright, axe-core), `fsevents@2.3.2`
   removed, next's snapshot re-resolved, and one `playwright-core`; then `pnpm install --frozen-lockfile`,
   `BASE=origin/claude/build-platform pnpm toolchain:check` (networked: age, trust, host, integrity, overrides;
   `check.ts:558-786`) and `pnpm actions:check`. Check: `browser-version.test.ts`'s catalog line and
   `no-duplicated-versions.test.ts:124-139` green.
5. **`browser.json` stays** (1248, 156.0.8078.4; `browser.json:2-3`).
6. **Documents** (3.3.2 Documents row above, as 3.3.8 left it): ADR 0066 `:753` and N12 `:866` "eighteen" →
   "twenty-two"; `ci.md:36-40` gains the dry run's `capacity`; CI-18's §3.5 text into `test-matrix.md:278` and
   `matrix.ts:418`, without the design's cross-references (3.3.8, S2, N7); CI-20 stays as it is at 2ab2b15; ADR 0066
   Part 3 records the `--image` additions, the CI-first baselines with the Google-zip check, and the chunked print as
   notices after N14.
7. **Regenerate and check.** `pnpm synth --all`: it writes `fixtures/synthetic/CI-18/expected.json` only, its
   `assertion` (`:5`) taking CI-18's new text; any other file written is a finding (3.3.8, S2). `pnpm exec tsx
   tools/screening-capacity/watched.ts --write` (expected no-op; `git status` shows only intended files). `pnpm
   typecheck`, `pnpm lint`, `pnpm exec vitest run --project unit tools/test tools/ci tools/screening-capacity
   packages/synth --reporter=json --outputFile=<scratchpad>/head-subset.json` (697 tests at 2ab2b15 plus phase 2's, 0
   failed; the delta from `numTotalTests`, 3.3.8, S1), actionlint with the `-ignore`, then `pnpm test` once. Local
   counts carry the printing tests' skips (`tools/test/ci-chromium.ts` does nothing off CI and no 1248 is installed;
   3.3.8, S5); CI's counts are the record.
8. **Failing first at the merge base e908c21** (acceptance 3; 3.3.8, B1), on the finished head, before the push:
   - §3.3.3's `CI_TREE` command over `workflows.test.ts` and `browser-version.test.ts` with each named test (the runner
     rule, the browser-check step, the apt steps, the baseline step, the dispatch input, the `--image` rules, the release
     identity rules, the Dockerfile and catalog literals);
   - §3.3.3's worktree command with `measure.test.ts` and `test-support/image-archive.ts` only (N8);
   - `brand.spec.ts`'s computed name check on e908c21's `shell.tsx`: the base pins 1.56.1, whose build is 1194, and
     `/opt/pw-browsers` holds 1194 (laid out 2026-10-27 02:00 UTC), so it runs here as phase 1's 10-pass run did ([BS]
     `:55-56`), with an e2e database `tp_laneb_cibrowser_e2e` dropped after. If that layout is not one
     `setup-container.sh` verified (not verified here), this one run is recorded as "waiting on the person:
     storage.googleapis.com" instead;
   - each log saved in the session's scratchpad with its command and UTC time; the PR description lists each named
     test red on the base and green on the head, and names the cases that can fail only on a missing export
     (`proveLoadedImage`, `loadedImageProblems`, `image-id.ts`).
9. **Push** and open the draft PR (template, every section).

**Local runs after the bump** (3.3.8, S5). With no 1248, `apps/web/playwright.config.ts:30, :93` would fall back to the
`chrome` channel, another browser build (absent here, but a silent switch wherever Chrome is installed). So: no local
e2e on the bumped tree until a verified 1248 exists; e2e results come from CI; the fix round's "full local suite" is
unit, db, typecheck, lint and golden, with the printing tests' skips stated beside the counts, and the e2e part recorded
as waiting.

Waits on a local Chromium 1248, recorded as **"waiting on the person: storage.googleapis.com"**:
- the 1248 layout from the zips checked against `CFT_BUILDS` (`setup-container.sh:967-968`), then `node
  tools/ci/browser-build.ts` green locally;
- the local regeneration no-op (acceptance 4; ADR 0058's host-independence finding);
- sign-in and the 14 specs with `expectAccessible` on 1.64.1 and axe 4.14, `--workers=2 --retries=0` (not a gate: CI's
  e2e is the record for tests, brief `:9`), and any other local e2e on the bumped tree (S5);
- the computed name check run locally at 1280 and 390 px on 1.64.1 (CI runs it in the brand journey);
- the UX and brand review's before and after shots at 1280 and 390 px light and 1280 px dark (the review waits; P16 and
  N10's alternative below).

**The baselines with no local browser.** CI's baseline step (`ci.yml:595-645`, e2e shard 1, every run) is the source
of the committed bytes:
1. **Run 1:** push phase 2 with the old PNGs. The browser check passes if the mirror's bytes equal the record (the
   first proof of it). If it fails on a tree or binary difference, CI's values are **not** adopted on their own word
   (3.3.8, S3): a one-off step, in a commit of its own, runs in `unit` after the check (`if: ${{ !cancelled() }}`),
   downloads Google's two zips (`https://storage.googleapis.com/chrome-for-testing-public/156.0.8078.4/linux64/<zip>`,
   the URLs `setup-container.sh:969` uses; CI reaches the host), requires `sha256sum` to equal `browser.json`'s
   `zipSha256`, unzips each into a temporary `PLAYWRIGHT_BROWSERS_PATH` layout and prints `node
   tools/ci/browser-build.ts --list` over it. Then: (a) Google's tree equals `browser.json`'s and the mirror's does not:
   the mirror serves another build, so the record stands and CI installs Google's verified zips instead of the
   mirror's (an install-step change, built and proved in the PR, recorded under the co-founder's 2026-10-26 ruling);
   (b) Google's tree equals the mirror's and not `browser.json`'s: the record's tree values (from the 2026-10-26 local
   unpack) were wrong, and `treeSha256`, `sha256` and `browser-builds/*.sha256` take the values the two sources agree
   on, the zip fields unchanged; (c) anything else: stop and report. The one-off commit is reverted before run 2. The
   brand journey may be red against the old baselines (one cover differed by 1,611 px between 141 and 156, [S3] M5);
   that is expected. The baseline step fails and prints each changed picture's SHA-256 and its chunks.
2. The session reads the e2e shard 1 log with the GitHub MCP `get_job_logs` (`job_id`, `return_content: true`,
   `tail_lines` above the job's whole line count, since the default is the last 500 lines and the database's log step
   (`ci.yml:639-641`) and the post-job lines follow the baseline step; 3.3.8, S4), requires every `<path> <i>/<n>` for
   i = 1..n and each picture's printed SHA-256 before decoding (a gap means a larger `tail_lines` and a new read, never a
   partial decode), joins and decodes each picture, requires `sha256sum` to equal the printed value, and commits CI's
   bytes (an unchanged picture's committed bytes stand).
3. **Run 2:** all seven regenerate from nothing, byte for byte: ADR 0058's proof, its seven SHA-256s in the PR. Both
   runs on the same `ImageVersion` (the "Set up job" line), so a weekly image does not move a font between them;
   otherwise run 2 is repeated.
- Cost: two full ci.yml runs (three if run 1's check fails and its outcome needs its own proof), one PNG commit. The
  local no-op is recorded as waiting.

**A9 under the 2026-10-27 direction.** Once run 2 is green, the session takes the recommended option and records it in
`designs/lane-b-ci/ci-browser-a9.md` on claude/build-ops (synthetic brand pictures only). Its evidence goes in
`designs/lane-b-ci/ci-browser-a9/` beside it (3.3.8, S7): per baseline `<name>.old.png` (the 6ddd587 blob, §3.3.1),
`<name>.new.png` (CI's bytes), `<name>.side.png` (`convert old.png new.png +append`; ImageMagick is on this machine),
`<name>.diff.png` and `<name>.crop-<k>.png` for each changed box, and a `SHA256SUMS` over the directory, whose old and
new lines must equal the blobs' and run 2's printed values. The note gives per picture the exact changed-pixel count
(`compare -metric AE`), the count under the journey's comparator settings (`VISUAL` or `STRICT`, `brand.spec.ts:69,
:77`) through playwright-core's own comparator, `require('playwright-core/lib/coreBundle').utils.getComparator('image/png')`
(exported as `./lib/coreBundle`, the 1.64.1 tarball's `package.json:26`; `coreBundle.js:8506, :11494, :77995`; read from
the tarball, not yet run, 3.3.8, N2; if it does not load, the note says exact counts only), and ADR 0058's brand points
checked. The header pictures have two causes, `shell.tsx`'s change and the browser: phase 1's 1194 run with the new
`shell.tsx` passed the header comparisons ([BS] `:55-56`), so the note marks the box of each control whose text
`shell.tsx` changed, attributes changes inside it to both and changes outside it to the browser, and gives the counts
per box. The adversarial visual-inspection agent still runs over the same pictures and its per-image verdict goes in
the note; a finding is fixed in the PR before the merge. The session commits and pushes the note and directory on
claude/build-ops (its pre-push hook), and the PR description links them by the commit-pinned URL
(`https://github.com/PureTideWater/PhysicalTherapy/blob/<commit>/designs/lane-b-ci/ci-browser-a9.md`). It does not
block the merge.

**The counts the PR must reach** (from e908c21's CI, run 40401493722, plus ci-browser's changes):
- **unit: 6,265 + 66 = 6,331 passed, 1 skipped** (actionlint, absent on CI), plus phase 2's new tests (3.3.8, S1: the
  2026-10-27 text's 55 came from `vitest list`, which lists an `it.each` once). The 66 are the run delta of `vitest run
  --project unit tools/test tools/ci tools/screening-capacity packages/synth --reporter=json` between e908c21 (631) and
  2ab2b15 (697, of which 3 fail until phase 2): `apt-archives.test.ts` +5, `browser-build.test.ts` +19,
  `image-id.test.ts` +6, `measure.test.ts` +6, `browser-version.test.ts` +16, `no-duplicated-versions.test.ts` +1,
  `workflows.test.ts` +13 (`scratchpad/reread2/review/{base,head}-subset.json`). The PR states the exact sum from its
  own `numTotalTests` delta. Base: job 121848211472.
- **db: 9,223 passed, 0 skipped** (the restore drill runs on 26.04), 127 files.
- **e2e: 54** (27 per shard); plus #42's journeys if #42 merges first (its count **not verified**).
- **golden: 376**, unchanged (status file, fresh-clone verification of #48, `lane-b-ci-deps-status.md:29`).

**The files #42 also changes, now** (head 098636e3, base e908c21, 188 files; hunks from `pulls/42/files`, saved in
`scratchpad/reread2/pr42-files.json`; `git merge-tree` not run, since #42's head is not in the local object store, so
the verdicts come from hunk ranges):

| File | #42's hunks | ci-browser's hunks | Verdict |
|---|---|---|---|
| `shell.tsx` | `-156`, `-259` | `-53`, `-81` | clean |
| ADR 0062 | `-1,6`, `-863`, `-1379,3` (+100 at the end) | `-1049`, `-1093`, `-1163`, `-1322`, `-1379,3` (+54 at the end) | **sure conflict at the end**: both amendments kept, in merge order (rule 6) |
| reconciliation-001 | `-638,6` (+10) | `-478`, `-566`, `-594`, `-643,10` | lines 641-645 separate them; likely clean, both kept |
| test-matrix | `-176`, `-203`, `-212` | `-252`, `-273` | clean |
| `matrix.ts` | `-217`, `-325` | `-415` | clean |
| `registry.ts` | `-360`, `-506`, `-516` | `-611` | clean |
| `watched-paths.txt` | 4 hunks | 2 hunks | regenerated (`watched.ts --write`), never hand-merged |
| `apps/web/package.json`, `apps/worker/package.json` | `-14`, `-36` | `:47-48`, `:53` (phase 2) | disjoint |
| `pnpm-lock.yaml` | six hunks, +33 | phase 2's re-resolve | re-resolved under the gates, never hand-merged (Q2) |
| `run.ts`, `report.ts`, `report.test.ts`, `measurements.ts` | 9, 3, 4, 2 hunks | none now (after #42) | the deferral stands (`LANES.md:90`) |

#42 touches no workflow, no `tools/test`, no Dockerfile, no `pnpm-workspace.yaml` and no `tools/package.json`.

**Engineering choices made here** (each reversible; the recommended option under the co-founder's rulings):
- release-capacity's two jobs and content-calendar's two on 26.04 under F5's letter, `RELEASE_CHAIN` kept at eight
  (3.3.8, B2);
- `--image` on every measured worker image (release-capacity, screening-capacity), held by a rule over every local
  worker build;
- the full file list printed on any tree difference;
- the chunked, SHA-256-checked picture print, read whole (every chunk, `tail_lines` set), and CI's baseline step as the
  source of the committed bytes while no local 1248 exists, with run 2 as the proof;
- on a browser-check difference, Google's zips checked on CI against `zipSha256` before any record changes, and
  Google's build installed rather than the mirror's if they differ (3.3.8, S3);
- the baseline step's written set read from the files, not from Playwright's message (3.3.8, N5);
- the failing-first runs at e908c21 before the push, the brand one on the base's own 1194 (3.3.8, B1);
- A9 recorded in a design note with side-by-side images and both pixel counts, the agent's verdict in it, its pictures
  committed beside it with their SHA-256s and linked by a commit-pinned URL (3.3.8, S7);
- dispatching release-capacity once on the PR's head before the merge;
- the phase-1 deviations adopted above (the dry run's `capacity` in the chain, `toHaveAccessibleName`, the committed
  file lists, the apt key and its off-PR save, the set compare, the capacity jobs' default condition, the all-archives
  check before any push, the after-#42 split, `browser.json` and its lists in `WATCHED_FIXED`).

Security trade-offs: none weakened. The `--image` checks and the off-PR cache save add checks; the chunked print adds a
SHA-256 proof per picture; the Google-zip check keeps the browser record anchored to Google's published bytes, never to
the mirror's first answer (3.3.8, S3). Moving release-capacity's `capacity` to 26.04 changes no binding measurement: its
report is advisory and never attested (`release-capacity.yml:56-59`), and the release chain the launch check reads stays
on 24.04.

**Proposed improvements outside ci-browser** (continuing P13):
- **P14: withdrawn** (3.3.8, B2): release-capacity's `capacity` runs on 26.04 every week, which gives #41 the data
  point P14 was for.
- **P15 (ops):** move `setup-container.sh`'s actionlint pin from 1.7.7 to 1.7.12 (`:90-93`). Currency only; it does not
  fix 26.04. Recommended.
- **P16:** ask the person to also allow `productionresultssa18.blob.core.windows.net`, so CI artifacts and REST logs can
  be read here: the baseline bytes would come from the artifact, and the UX review's shots from CI's 1248 run
  (`brand.spec.ts:376-463` writes them; `ci.yml:580` uploads them). Whether CI's shots meet the brief's "local
  screenshots" (`:9`) is the co-founder's call. Note: e908c21's "before" artifact expires 2026-11-02T21:13:55Z.
  Alternatives without the blob host (3.3.8, N10): the "after" shots through the same chunked, SHA-256-checked print, as
  a one-off step over `brand-screenshots/` in a commit reverted before the merge's last run (whether CI's shots count
  stays the co-founder's call); the "before" shots taken locally now at e908c21, whose 1.56.1 uses the 1194 build laid
  out here (`brand.spec.ts` at e908c21 writes them to `brand-screenshots/`, `:24, :34`), the dark and 390 px ones by the
  reviewer's own capture.
- **P17:** once storage.googleapis.com is allowed, run the local no-op and record ADR 0058's host-independence result
  (24.04 host against CI's 26.04), and P11's mirror comparison with it.

#### 3.3.8 Review of the re-read at e908c21 (2026-10-27)

Review: `designs/lane-b-ci/ci-browser-reread2-review.md`, scouts `designs/lane-b-ci/scout-ci-browser-reread2-files.md` and
`scout-ci-browser-reread2-versions.md`. Each finding was checked again at 2ab2b15 in `/home/user/ci-browser`, on the npm
registry and on GitHub (GET only), 2026-10-27 02:20-02:30 UTC, before any text changed; edits are in 3.3.7 or in place
marked "(3.3.8)".

**Totals: 19 findings (2 blocking, 7 should fix, 10 nits): 18 Fixed, 1 Fixed by another means, 0 Not taken; none
wrong.**

- **B1. Fixed by another means.** Real: phase 1 recorded only `watched.test.ts`'s red run (build summary `:20`) and left
  "Failing first at the merge base" open (`:111`); the merge base is now e908c21. Phase 2's new step 8 runs §3.3.3's
  `CI_TREE` and worktree commands at e908c21 before the push and records both logs (acceptance 3 edited). The other
  means: `brand.spec.ts`'s red run does not wait on the person, since e908c21 pins 1.56.1, whose build 1194 is laid out
  in `/opt/pw-browsers` (02:00 UTC, `ls --time-style=full-iso`), as phase 1's local brand run used (build summary
  `:55-56`); it waits only if that layout proves unverified.
- **B2. Fixed** (the recommended option). Real: F5 moves every job but the chain it names (`reconciliation-001.md:646` at
  2ab2b15); release-capacity's report is advisory and never attested (`release-capacity.yml:56-59`; ADR 0066
  `:399-401`), its failing checks are OOM, restart, `memory.peak`, counts and reads with times advisory (`:8-12`), and
  reversing a founder ruling is the founder's (brief `:38`). `release-capacity.yml:36` moves to 26.04; `RELEASE_CHAIN`
  stays at eight; `workflows.test.ts:429` 18 → 22; P14 withdrawn; A8, §3.3.1, §3.3.2, §3.3.3, the table, the new-workflows
  text, the document list (only ADR 0066 `:753`, `:866` and `ci.md:36-40` change) and CI-20 (back to `test-matrix.md:280`)
  updated. The PR-head dispatch proves the job on 26.04 before the merge.
- **S1. Fixed.** Real: `review/{base,head}-subset.json` give `numTotalTests` 631 and 697; per file +5, +19, +6, +6, +16,
  +1, +13 (`browser-build.test.ts:161` 3 cases, `browser-version.test.ts:119` 10). Target 6,331 plus phase 2's, 1
  skipped, the delta taken from the json reporter (counts and acceptance 6).
- **S2. Fixed.** Real: `fixtures/synthetic/CI-18/expected.json:5` holds the assertion text, and CI-18 changes
  (`test-matrix.md:278`, `matrix.ts:418`). After B2 CI-20 does not change, so `pnpm synth --all` writes CI-18's file only;
  step 6 and step 7 say so, and any other file written is a finding.
- **S3. Fixed.** Real: with no local layout, CI's values would rest on the mirror alone. Run 1 now checks Google's zips on
  CI against `zipSha256` (`browser.json:11, :18`; URLs as `setup-container.sh:969`) and lists their tree; the record
  changes only where Google's bytes agree, and a mirror that differs from Google's is replaced on CI by Google's build.
- **S4. Fixed.** Real: `get_job_logs`' `tail_lines` defaults to 500 (the tool's schema), and the database-log step
  (`ci.yml:639-641`) follows the baseline step. The read sets `tail_lines` above the job's line count and requires every
  `i/n` chunk and each SHA-256 before decoding.
- **S5. Fixed.** Real: `tools/test/ci-chromium.ts` does nothing off CI, and `apps/web/playwright.config.ts:30, :93` falls
  back to the `chrome` channel without Playwright's build. "Local runs after the bump" states the skips, CI's e2e as the
  record, no local e2e on the bumped tree until 1248, and the wait.
- **S6. Fixed.** Real: §3.3.1's "no cache" rule against `cache: pnpm` at `screening-capacity.yml:201` and
  `release-capacity.yml:72`. The rule is now Node 24 before every `--image` step (the check imports only `node:`
  modules); the cache stays each job's own, off in `images` (`ci.yml:719-723`) and the release build
  (`release.yml:148-151`); the test holds exactly that.
- **S7. Fixed.** Real. The evidence goes in `designs/lane-b-ci/ci-browser-a9/` on claude/build-ops (on GitHub,
  `git ls-remote` 60b09c67) with a `SHA256SUMS`, linked from the PR by a commit-pinned URL; the header's two causes are
  attributed per changed box, using phase 1's 1194 pass with the new `shell.tsx` (build summary `:55-56`).
- **N1. Fixed.** `getTrustEvidence` reads only `_npmUser.trustedPublisher`'s presence (`/opt/pnpm-10.34.8/dist/pnpm.cjs:67239-67241`);
  all five versions carry it and SLSA provenance (`npm view`, 02:23 UTC). "Not verified" dropped.
- **N2. Fixed.** The 1.64.1 tarball exports `./lib/coreBundle` (`package.json:26`), with `getComparator` at
  `coreBundle.js:8506, :11494, :77995`; named in the A9 text, read and not run.
- **N3. Fixed.** Default branch `claude/build-platform`, `release-capacity.yml` on it (blob 486e36f5), `workflow_dispatch`
  (`:18`) with no filter (`gh api`, 02:24 UTC).
- **N4. Fixed.** `git ls-remote` gives 2ab2b15 for `co-001/ci-browser`; no run exists for it (`actions/runs?head_sha=`,
  total 0, 02:24 UTC).
- **N5. Fixed.** `ci.yml:611` parses Playwright's "doesn't exist … writing actual" text. The written set is now the PNGs
  present after the run (§3.3.3 and phase 2 step 2).
- **N6. Fixed.** `RELEASE_RUNNER` is `launch-check.ts:107` at 2ab2b15; §3.3.1's line edited (the 6ddd587 table in §3.3.5
  keeps its own cite).
- **N7. Fixed.** CI-18's "(moved from CI-12, §3.2.7)" and CI-20's "§3.3.7" clause leave the rows for a note under the
  §3.5 table; CI-20's text now equals `test-matrix.md:280`.
- **N8. Fixed.** The worktree command copies `measure.test.ts` and `test-support/image-archive.ts` only (the head's new
  test support, `git diff --stat e908c21 2ab2b15 -- tools/screening-capacity/test-support/`), and names the
  missing-export cases (`proveLoadedImage`, `loadedImageProblems`).
- **N9. Fixed.** `release-dry-run.yml:81` builds `apps/web/Dockerfile` only; §3.3.3's `--image` rule no longer names the
  dry run's `build`.
- **N10. Fixed.** Recorded under P16: the "after" shots through a one-off chunked print, whether they count still the
  co-founder's call; and, found here, the "before" shots taken locally now at e908c21 on 1194 (`brand.spec.ts` at
  e908c21 writes them, `:24, :34`), so they no longer depend on the artifact that expires 2026-11-02.

Also corrected while folding: `/opt/pw-browsers` holds 1194 and 1243, not "1243 only" (the 3.3.1 Baselines row).

#### 3.3.9 The fix round on PR #77 (2026-10-27): what it changes in the text above

PR #77's first CI run (367a659f) and its three adversarial reviews (`approval-summaries/lane-b-ci-browser-review-{ci-infra,security-supply,ux-brand}.md`; dispositions in `lane-b-ci-browser-fix-round.md`) changed the design in these places. Where earlier text in §3.3 says otherwise, this subsection holds.
- **The header's names (§3.3.1 "WCAG 2.5.3"; UX-1, UX-2):** not ``<name>, practice switcher`` and ``<email>, account menu`` through `aria-label`, but UX-094's words under the co-founder's ruling (the UX baseline's section 6.1): each summary named from its content, the visible text then a visually hidden ", switch practice" or ", account and sign out", with no `aria-label` and no `title` (so Chromium gives no description that repeats them); the address visually hidden below `md`. Tests reach the two by `data-slot` (`practice-switcher`, `account-menu`), since `getByLabel` cannot find a summary named from its content. UX-094's visible "Current" mark and UX-6 (the open switcher's reflow below 640 px) stay with UX PR 67 (`co-001/ux-header-menus`).
- **The computed name check (§3.3.1; CI-19; UX-3):** the name must start with the first visible piece and contain every other; it covers summaries, buttons, ARIA buttons, inputs and selects; the journey also reads Chromium's own name and description through CDP. CI-19's text: "starts with its visible text and contains every other piece of it".
- **The browser check (§3.3.1; CI-1, CI-5, SEC-1, SEC-3, SEC-4, SEC-7):** `--image` reads the image as root, offline and from the local tag only (`docker run --rm --pull never --user 0:0 --network none`): as the image's own user it could not read Chrome for Testing's mode-0600 `deb.deps` and `rpm.deps`. A file found but not hashed fails as "could not be hashed whole", naming the tool and the file. Once a build's every file equals the record, and only then, `--version` must exit 0 printing `Google Chrome for Testing <browserVersion>`, on the runner as the job's user and in the image as the image's own user. Modes and system libraries are not hashed; the version run proves the build starts. (§3.3.1 said the check "prints `chrome-headless-shell --version`".)
- **The baseline step (§3.3.1 "The baselines"; CI-2, SEC-2):** not deletion-first. It regenerates into an empty directory outside the repository (`E2E_BASELINES_DIR`, the config's snapshot path, laid out as the repository is), so the tracked tree stays clean for the prebuilt build's stamp, which is not relaxed; it compares the set written with `git ls-files` and each file with `cmp`.
- **The dry run (§3.3.1 "An image binding"; CI-3):** `release-dry-run.yml`'s build is release.yml's on its `web` and `worker` legs as a matrix, held step for step to it, so a pull request runs the tag's worker `--image` step and the legs' merged outputs; it also runs on a change to `tools/ci/browser-build.ts`, `apps/web/e2e/browser.json` or `browser-builds/*`. ADR 0066 N16 names the tag-only steps no pull request runs.
- **image-id.ts (SEC-5):** an entry's size from its pax header; a pax header, pax global header or GNU long name over 1 MiB, and more than 64 MiB kept, refused by name; only JSON documents' bytes kept.
- **CI's first run proved:** the browser check equal to `browser.json` on CI's own download from Playwright's mirror (so the mirror serves Google's bytes for 1248, P11 for this revision); the containerd `.Id` rule on 26.04; unit 6,339 + 1 skipped. Counts after the fix round: unit 6,352 + 1 skipped, db 9,223 + 0, e2e 54, golden 376.
- **Notices:** ADR 0066 N20 (the baseline step outside the repository), N21 (`--image` as root), N22 (the version gate and local-only reads); N16 rewritten.
- **The screen tour (UX-5, ops tooling):** `tools/lane-b-screen-tour/capture/tour.spec.ts` clicks the slots, or the old labels on a tree before #77, and captures the open switcher (`p.settings`, `interaction:practice-switcher`); `designs/lane-b-ux-review/route-map.json` follows.

### 3.4 `co-001/ci-mutation` (audit #54)

#### 3.4.1 What changes

- **Runner:** @stryker-mutator/{api,core,vitest-runner} at **10.1.1** (published 2026-10-23T19:18Z; `npm view`).
  - It supports Vitest 5 (#6214) and reports collection failures instead of survivors (#6269).
  - The patch `patches/@stryker-mutator__vitest-runner@10.0.0.patch` is deleted, along with its `patchedDependencies`
    entry (`pnpm-workspace.yaml`) and `tools/stryker/runner.test.ts`. The canary's case 1 replaces it.
  - The vitest runner stays, with `coverageAnalysis: perTest`. It matched the command runner mutant for mutant on 878
    compared mutants and is 2.5 to 6 times faster ([S2] §5). This departs from the audit's "command runner", as notice
    N4 records.
- **Configs:**
  - `stryker/base.mjs`: the vitest runner, perTest, json/html/clear-text reporters, `tempDirName: .stryker-tmp`,
    `concurrency: os.availableParallelism()`, `thresholds.break: null` (the gate decides).
  - `stryker/{money,pricing,ledger,packets}.config.mjs`.
  - Mutate sets:
    - money: `src/**`;
    - pricing: `src/**` minus `testing.ts`;
    - ledger: `src/**`;
    - packets: `verifier/**`, readable, scan, facts, payer, placeholders, plus interest, calculation, dates, assemble and
      **windows.ts** (35 mutants; deadline arithmetic, so it is in), minus `test-support.ts`.
  - Total 6,279 mutants ([S2] §4: 6,244, plus windows' 35).
  - `stryker/shards.json` holds the six jobs:
    - money + ledger;
    - packets-scan;
    - packets-rest;
    - pricing-engine;
    - pricing-recompute;
    - pricing-rest.

    A test requires every mutate file to be in exactly one shard, and the workflow's matrix to equal the file.
- **`vitest.mutation.config.ts`** replaces `vitest.stryker.config.ts` and `vitest.stryker.packets.config.ts`:
  - aliases for every workspace export, generated from each `packages/*/package.json` `exports`, to the sandbox's files.
    Otherwise tests that import `@tp/pricing` by name reach the unmutated original ([S2] §3.3);
  - a setup file that seeds fast-check, `fc.configureGlobal({ seed: <committed constant> })`, for mutation runs only;
  - an exclusion list, each entry with its reason:
    - `packages/pricing/src/performance.test.ts` (asserts only counts and time);
    - `packages/pricing/src/purity.test.ts` (reads source text);
    - `tools/engine-freeze/differential.test.ts` (kills every engine mutant by construction);
    - `*.db.test.ts`.
  - Pricing's test set adds `tools/golden-worksheet/engine*.test.ts`.
- **The golden engine test, priced per test.** `tools/golden-worksheet/engine.golden.test.ts:55` runs
  `runEngineOnGolden()` in a `describe` body, which makes 93% of engine mutants static ([S2] §3.5).
  - Each claim is priced inside its own test, with **no memo shared across tests**. With a memo, perTest coverage would
    credit the first test alone, and Stryker would skip the others' assertions.
  - The claims and assertions stay the same. It is a test file: the freeze allows it, and `fixtures/golden` is unchanged.
  - **Claims unchanged, proved:**
    - a test in the file requires the set of golden claim ids it prices to equal the set under `fixtures/golden`, each
      priced in exactly one test;
    - the assertion bodies move into the per-claim tests unchanged: the PR description carries
      `git diff --color-moved=plain -- tools/golden-worksheet/engine.golden.test.ts`, whose only unmoved lines are the
      per-claim wrapper;
    - `pnpm test:golden`'s count changes from 38 to the per-claim count, stated in the PR with the arithmetic (claims ×
      tests per claim), and every claim still passes.
- **Canary** (`tools/stryker/canary`): five cases, each held to an expected status per mutant in `expected.json`:
  1. a runtime mutant, selected by its test's name;
  2. a mutant reached at import that breaks the test file's load: RuntimeError or Killed, never Survived;
  3. a mutant in `@tp/stryker-canary`, a new private workspace package at `tools/stryker/canary/lib`, added to
     `pnpm-workspace.yaml`. A `tools` test imports it by name through `tools/node_modules`, so the case reproduces the
     link that misled the runner, and proves the aliases. Its `package.json` has `"typecheck": "tsc --noEmit"`, so
     ci-speed's typecheck runner test (every workspace's `typecheck` is `tsc --noEmit`) holds, and the runner checks it;
  4. a mutant only a seeded fast-check property kills;
  5. two tests whose names share a prefix (#6246).

  The canary runs as the first step of every shard job, not as a job of its own. It takes 5-9 s ([S2] §3.1:
  5 s on 10.1.1, `mut-canary-10.1.1.log`), so a separate job would add a whole job's setup, about a minute, to every
  money PR's wall (A1′), and every shard's own runner is then proved before it scores. A shard whose canary fails stops
  before its mutants.
- **Gate `tools/stryker/gate.ts`** (with `gate.test.ts`). It merges the shards' JSON reports by package. A package is
  **fully run** when every shard holding it ran: `shards.json` lists each package's shards, and a shard runs all of its
  packages' mutants in full, so a package's shards run all or none. The gate fails when:
  - any shard that ran lacks its canary verdict of 5 of 5 as expected;
  - any fully-run package scores at or below 85% (PRD 18 says "above"). The score is Stryker's,
    (killed + timeout) / valid. Ignored and RuntimeError mutants are excluded. A recorded equivalent stays in the
    denominator as Survived, so recording one never raises a score;
  - **any Survived or NoCoverage mutant is not recorded as equivalent;**
  - any RuntimeError's reason is not a test file's load failure;
  - a recorded equivalent of a fully-run package no longer exists.

  A package that did not run is reported as "not affected" and judged by neither score rule. The gate prints
  per-package and per-file scores, and the survivors with their covering tests, to the log and the summary.
- **Equivalents.** `tools/stryker/equivalent/{money,pricing,ledger,packets}.json` (one file per builder). Each entry
  holds:
  - the file;
  - the mutator;
  - the replacement;
  - the original source text and its occurrence index (stable across unrelated edits, unlike a line number);
  - why it is equivalent;
  - who reviewed it, and when.

  The match is per mutant, on the gate's side. A Stryker ignorer plugin was weighed and rejected: its `shouldIgnore`
  ignores a whole AST node, every mutant in it, which is coarser than the evidence. The freeze forbids
  `// Stryker disable` comments in the engine, so this is the only form.
- **Survivors killed by tests only.** Today's count is 16 + 162 + 130 + 345 ([S2] §8).
  - Assert error classes and messages.
  - Test the boundary values.
  - Turn property-only kills into fixed examples (for example ledger `allocation.ts:50`, `[1n, [0n, 1n, 1n]]`).
  - Write table tests for scan's and the templates' regular expressions.
  - Add field-level assertions for interest, calculation and assembly.
  - Record only true equivalents.
  - No non-test change under `packages/pricing/src` or `packages/ledger/src`: the freeze (reconciliation-001 `:428`).
  - **The ledger: additions only, line by line.** reconciliation-001 requires "LED-01 to LED-11 and the ledger oracle
    pass unchanged" and "Changes under `packages/ledger/src` are additions only" (`:439-440`). The LED cases are asserted
    in `packages/ledger/src/{matching,templates,pairing,totals,stages,allocation,roi,statement}.test.ts`
    (`packages/synth/src/cases/registry.ts:186-235`), the same files [S2] §8 finds the survivors in. So a ledger survivor
    dies only by a new `it` block or a new test file, never by editing an existing line, a `toThrow()` included.
    `git diff --numstat <mb> -- packages/ledger/src` must show 0 deletions on every file.
  - **Test helpers in pricing** live inside a `*.test.ts` file or outside `packages/pricing/src`: the freeze treats only
    `/\.test\.tsx?$/` as a test file (`tools/engine-freeze/check.ts:65, 196-201`), so a new `test-helpers.ts` there
    would be an engine change.
- **Coverage:**
  - `packages/money/src/**` joins `BRANCH_GATED` (`vitest.config.ts:13-18`).
  - The unreachable `match[2] ?? '0'` at `packages/money/src/cents.ts:85` (the group is required by the regex at `:73`)
    becomes branch-free, with behaviour unchanged. `differential.test.ts` proves prices equal, and money's own tests
    prove the formatting. That takes money from 57/58 to 100% ([S2] §7).
  - **This is the series' one non-test change in a money path.** `packages/money` is outside the freeze, but not test
    code: the payment-engine review checks it as a money-path change (the before and after of `:85`, the regex at `:73`
    that makes the branch unreachable, and the differential test's result), and the PR description names it.
- **`.github/workflows/mutation.yml` rewritten:**
  - Triggers:
    - `push` on `claude/build-platform`, every package;
    - `pull_request` on its default types (the label events and the `money` label step, `:13, :34-52`, go);
    - the weekly schedule (fires under F1 (a));
    - `workflow_dispatch`.
  - Concurrency: group `${{ github.workflow }}-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.sha }}`,
    with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`: ci.yml's form under mutation's own name, so
    the two workflows never share a group (§3.1.1).
  - **What a change affects** (`tools/stryker/affected.ts`, on the diff from the merge base, or from `<before>` on a
    push). Each package has a closure:
    - its mutate files and its test set (the files `vitest.mutation.config.ts` selects for it, golden tests included);
    - their import closure, traced by `importClosure()` from `tools/screening-capacity/watched.ts:146`, which follows
      relative imports and every workspace package's exports. It skips test files today (`:152`), so it gains an
      `includeTests` option, off by default, and the watched list's own unit test proves that list unchanged. It follows
      type-only imports too, which only widens a closure. It reaches upstream workspace code: pricing depends on
      `@tp/contracts`, `@tp/money` and `@tp/rules`; packets on `@tp/money`, `@tp/pricing` and `@tp/triage`; ledger on
      `@tp/db` and `@tp/money` (`node -p` over each `packages/*/package.json`);
    - the `package.json` of every workspace package the closure reaches;
    - the data files its tests read: a fixed list per package (`fixtures/golden/**`, the `fixtures/synthetic/**` cases
      and `content/releases/**` paths they name), and a test that scans the test set for path literals under
      `fixtures/` and `content/` and fails on one the list does not cover;
    - the third-party packages its closure imports by bare name, with their transitive dependencies from the lockfile's
      `snapshots`, and the test tooling (vitest and `@vitest/*`, `@stryker-mutator/*`, fast-check).

    A change affects a package when it touches a file in that closure. A lockfile change affects it only when it moves
    a resolved version among its closure's third-party packages or the test tooling. The configs, `stryker/**`,
    `tools/stryker/**`, `vitest.mutation.config.ts`, the root `package.json`, `pnpm-workspace.yaml` and the workflow
    affect all four.
  - Jobs:

    | Job | Timeout | What it does |
    |---|---|---|
    | `changes` | 5 | `affected.ts`, as above. It outputs the affected packages, whether any is affected, and the shard matrix: every shard of each affected package (`shards.json`) |
    | `stryker (<shard>)` | 30 | `if: needs.changes.outputs.any == 'true'` (an empty matrix is an error, so the job is skipped instead). The canary first, then the shard in full. Its JSON report is uploaded with `overwrite: true` and its verdicts are printed to the log |
    | `mutation` | 10 | `if: always()`. Needs both; fails on a failed or cancelled job or a gate rule, and on a skipped `stryker` when `any` is true; passes with "no money path changed" when nothing was affected |

  - A docs-only pull request finishes in under a minute.
  - Read on 49514e8's graph (greps of each package's imports): five of the eight npm groups (`browser-tests`,
    `anthropic-sdk`, `pg-boss`, `next`, `aws-cdk`) reach no money closure, so their PRs measure nothing (§3.2.1's
    load plan). The `aws-sdk` group reaches pricing and packets, through `@tp/contracts`' index
    (`evidence/scan.ts:1`, `@aws-sdk/client-textract`) and `@tp/db/runtime` (`crypto/kms-key-provider.ts:1`,
    `@aws-sdk/client-kms`). `minor-and-patch` reaches all four whenever it moves the test tooling.

#### 3.4.2 Files

- **Runner and configuration:**
  - `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`;
  - `patches/**` (deleted);
  - `stryker.config.mjs` and `stryker.verifier.config.mjs` (deleted), replaced by `stryker/**`;
  - `vitest.stryker*.ts` (deleted), replaced by `vitest.mutation.config.ts`;
  - `vitest.config.ts` (`BRANCH_GATED`).
- **Tooling:** `tools/stryker/**` (canary, lib, gate, affected, shards, equivalent, seed);
  `tools/screening-capacity/watched.ts` (the `includeTests` option only) and `watched.test.ts`.
- **Workflow:** `.github/workflows/mutation.yml`, and `workflows.test.ts`'s mutation block (`:744-764`).
- **Money:** `packages/money/src/cents.ts` (the one non-test money change) and its test.
- **Golden:** `tools/golden-worksheet/engine.golden.test.ts`.
- **Survivor tests:** under `packages/{money,pricing,ledger,packets}/src/**/*.test.ts` (in the ledger, new `it` blocks
  and new files only).
- **Canary package:** `tools/stryker/canary/lib/package.json` (with its `typecheck` script), and its entry in
  `pnpm-workspace.yaml`.
- **Documents:**
  - ADR 0066 Part 4;
  - ADR 0064 amendment: the label mechanism, the patch and 10.0.0 replaced; path-affected runs;
  - ADR 0047 amendment: `stryker.verifier.config.mjs` retired; the packets shards and today's score;
  - `docs/product/PRD.md`:
    - 18's mutation row (`:753`): scope money, pricing, ledger and packets (verifier, interest, calculation, dates,
      assembly, windows); gate "above 85% per package, every surviving mutant killed or recorded as equivalent";
    - 18's CI line (`:764`): "on every pull request that touches a money path, sharded, the affected packages in full;
      on every push to the build branch and weekly";
    - 17's milestone 6 check (`:707`), only under F6;
  - reconciliation-001: the F6 exception added to `:459`;
  - `docs/runbooks/ci.md`, a mutation section (reading the gate, recording an equivalent);
  - the test matrix and the synth registry, CI-15 to CI-17.
- **Hand-over:** PR 7's Gate 1 line for `docs/product/gates.md`, which Lane A creates
  (reconciliation-001.md:146), written in `lanes/lane-b.md`.

#### 3.4.3 Tests

- **Failing first:**
  - the canary's cases 2 to 5 fail on 10.0.0 with the patch, or without the aliases or seed;
  - `gate.test.ts`: 85.00% fails, 85.01% passes; an unexplained survivor fails; a non-load RuntimeError fails; a stale
    equivalent fails; an empty run passes with its message; a shard without its canary verdict fails; a package with
    one of its shards missing is "not affected" only when none ran, and fails when some did; a stale equivalent of a
    package that did not run passes; recording an equivalent leaves the score unchanged;
  - `affected.test.ts`, on synthetic graphs: a file in a closure affects that package; a lockfile move outside every
    closure affects none; a move of a closure's transitive third-party dependency affects it; a fixture path a test
    names but the list lacks fails;
  - `affected.test.ts`, on the repository's own graph, with the results read at 49514e8: docs-only gives none; money
    gives all four; `packages/rules/src` gives pricing and packets; `packages/triage/src` gives packets;
    `packages/db/src/runtime.ts` gives pricing and packets (through `@tp/contracts`' `@tp/db/runtime` imports) and not
    ledger, whose source and tests import only `@tp/money` (`grep -rln '@tp/db' packages/ledger/src`: none); a
    test-only pricing change gives pricing and packets; a `next` lockfile bump gives none; an `@aws-sdk/*` group bump
    gives pricing and packets; a vitest bump gives all four;
  - the shard partition test, including "each package's shards are listed".
- **Rewritten:** `workflows.test.ts`'s mutation block (triggers exactly; the canary as the first step of every shard;
  the `stryker` job's `if:` on `any`; the gate's `if: always()`; the concurrency group's prefix; `overwrite: true` on the
  reports; the mutate and test sets equal the configs).
- **Golden:** the claim-set test in `engine.golden.test.ts` (every claim id priced in exactly one test).
- **Coverage:** `pnpm test` holds money at 100% branches.

#### 3.4.4 Acceptance

1. Fresh clone and scope:
   - `git diff <mb> -- packages/pricing/src ':!**/*.test.ts'` is empty;
   - `git diff --numstat <mb> -- packages/ledger/src` shows 0 deletions on every file, and only `*.test.ts` files;
   - `git diff --name-only <mb> -- packages/money/src ':!**/*.test.ts'` is exactly `packages/money/src/cents.ts`, and
     its diff is the `:85` change;
   - `fixtures/golden` is unchanged.
2. `pnpm test:golden` (the new count, every claim passing, the claim-set test green); the ledger oracle; LED-01 to
   LED-11 unchanged and passing.
3. `pnpm stryker run tools/stryker/canary/stryker.config.mjs`: 5 of 5 as expected.
4. `pnpm stryker run stryker/money.config.mjs` (about 1 minute), then `pnpm -s exec tsx tools/stryker/gate.ts <reports>`
   passes. Delete one killing assertion in a scratch copy and rerun: the gate fails and names the survivor and its file.
   Restore the assertion.
5. **CI:** the PR changes the configs, so every package is affected and the PR's own run is a full one. Every shard
   ≤ 15 minutes, with its canary verdict in its log; the gate passes with A7's numbers; A1′ is reported for the PR's
   head. After the merge, the first push run passes.

### 3.5 Test-matrix rows (CI-01 to CI-20; Lane B's reserved series)

Each row is a `none(0, …)` registry case with `assertedBy`. Milestone 0 is "CI with every gate from section 18"
(`PRD.md:701`).

| ID | Case | Assertion | PR |
|---|---|---|---|
| CI-01 | One gate over every CI job | `all green` needs every other ci.yml job and passes only when each succeeded; a failed, skipped or cancelled job fails it | ci-speed |
| CI-02 | Every route's tests in exactly one of twelve files | Each registered route is in one file; the twelve files exist and each runs its own index | ci-speed |
| CI-03 | A route snapshot in one statement | The folded snapshot equals the per-table snapshot on two worlds and after an update | ci-speed |
| CI-04 | The database suite in shards | Through vitest's own sequencer, the shards' files are disjoint and together are the whole db project, for 4 and for 6 shards; each shard prints the files it ran and migrates its own database | ci-speed |
| CI-05 | Chromium missing on CI | A unit or database run fails instead of skipping its printing tests | ci-speed |
| CI-06 | End-to-end shards over one build | Every shard runs the build job's artifact; a build stamped with another commit is refused | ci-speed |
| CI-07 | A flaky end-to-end test | Passing only on its retry fails the run and names the test | ci-speed |
| CI-08 | Lint in memory-bounded groups | The groups cover every linted file exactly once; the scheduler fits 16 GiB and 8 GiB hosts and always runs at least one group; any group's warning or error fails the run | ci-speed |
| CI-09 | The domain model's approval as its own check | `domain model` runs `--check --strict --require-approval`; the database suite carries no approval case | ci-speed |
| CI-10 | A timeout on every job | Every job of every workflow has the timeout its table names | ci-speed |
| CI-11 | Actions pinned to their release | Every `uses:` is a full SHA with its version, one SHA per action; the SHA is the tag's and every input is declared; every action nested in a composite is pinned by SHA too; the release restores no cache | ci-deps |
| CI-12 | Dependabot's configuration | Groups in order, majors ignored for the Node image, its types, TypeScript, Next and pg-boss, and for the compose file's postgres; cooldowns; staggered days; and an entry per ecosystem in use (§3.2.7, N6) | ci-deps |
| CI-13 | Images pinned by digest from one source | Every base and service image carries a digest; CI and the capacity harness take Postgres from docker-compose.yml | ci-deps |
| CI-14 | A toolchain without known advisories | The pinned pnpm has no moderate or worse advisory; both images derive it; every musl package in the lockfile carries libc; every version the lockfile adds is at least three days old or a dated exclude (§3.2.1, re-read 2026-10-25) | ci-deps |
| CI-15 | The mutation canary | In every shard, each of its five cases reports its expected status before any score | ci-mutation |
| CI-16 | The mutation gate | Each fully-run money package above 85%, recorded equivalents still counted as survivors in the score, no survivor not recorded as equivalent, no runtime error but a test file's load failure | ci-mutation |
| CI-17 | Mutation where the money code changed | A push runs every package; a pull request runs exactly the packages whose closure (imports, data files, third-party packages) it changes, each package's shards all or none | ci-mutation |
| CI-18 | One browser build everywhere | The web tests, the worker, the tools and the lockfile name one Playwright version (playwright-core one catalog line), and the worker image installs the lockfile's playwright-core with no version of its own; every step that installs the browser, in every workflow, is followed by the check that holds every file of the headless shell's and Chromium's builds to `browser.json`'s tree SHA-256s before any test runs or any cache is saved, and the worker image's headless shell is held to it in `images` and in the release's build before it is saved and in screening-capacity's and release-capacity's measuring jobs before it is measured; CI regenerates the committed brand baselines from nothing, byte for byte, on every pull request and every push; a browser-tests pull request is red on the browser check by design until the baseline procedure runs, and its other steps still run | ci-browser |
| CI-19 | Header controls named by their visible text | Each header control's accessible name contains its visible text (WCAG 2.5.3) at 1280 and 390 px; axe 4.14 with the WCAG 2.0/2.1 A and AA tags finds no violation on any page a journey scans | ci-browser |
| CI-20 | Runner images | Every job on ubuntu-26.04 but the release's capacity chain, on the release runner; the probe's runner comes only from its dispatch input; the browser jobs' cached system packages are used only after each matches the signed index's SHA-256; the release binds images by the config digest hashed from the saved archive under either image store, carries each image's identities from the build as job outputs no later job can rewrite, proves the measured image, the loaded image before any push and the pushed image are that one, builds every checked image with no attestation manifest, and its push and report jobs run no repository code; the image scan reads the built archive | ci-browser |

Notes to the rows above, not part of any row's text (3.3.8, N7): the Assertion column is copied verbatim into
`test-matrix.md` and `matrix.ts`, so cross-references stay here. CI-18's last clause moved from CI-12 (§3.2.7), and its
capacity-job clause is ci-browser's (3.3.7, 3.3.8, S2). CI-20 is its text at 2ab2b15 (`test-matrix.md:280`), unchanged by
ci-browser after 3.3.8's B2; the report's runner image and image store and the launch check's refusals join it after #42
(§3.3.7, "After #42").

---

## 4. Builders and integrators

Every builder runs, before pushing:
- `pnpm typecheck` (the whole repository);
- `pnpm lint`;
- the tests of the packages and files it changed;
- `actionlint` for a workflow;
- the db tests of the files it changed, bounded (no file over 5 minutes).

No full `test:db`, no full e2e and no full mutation run at build time. No two builders of a PR own the same file. The
interfaces between builders are fixed here, so they work in parallel:
- the commands `pnpm typecheck`, `pnpm lint` and `pnpm test:db --shard`;
- `E2E_PREBUILT=1` and `apps/web/.next/BUILD_COMMIT`;
- the vitest cache path `node_modules/.vite/vitest`;
- the new test file paths of §3.1.3;
- `stryker/shards.json` names;
- `tools/stryker/equivalent/<pkg>.json`;
- `REQUIRED_CHECKS` and the `<!-- required-checks -->` markers;
- the `browser.json` fields, the baseline step's output format and the runbook heading "Upgrading the browser";
- `<image>.tar.sha256` and `<image>.id` beside each release tarball.

| PR | Builder | Owns | Runs locally |
|---|---|---|---|
| ci-speed | **S1, workflows, gate and documents** | every line of ci.yml; supply-chain.yml (deleted); `large-zip.yml`'s Chromium step; the comment at `screening-capacity.yml:146`; the comments at `apps/web/Dockerfile:24`, `apps/worker/Dockerfile:19` and `tools/check-licenses/index.ts:11`; `tools/test/{workflows,ci-gate,codeowners,required-checks}.test.ts`; `tools/required-checks.ts`; `tools/engine-freeze/check.test.ts`; `packages/compliance/src/{controls.ts, controls.test.ts}`; `packages/db/src/domain-model/domain-model.db.test.ts`; `.github/pull_request_template.md`; §3.1.5's documents (ADR 0066 Part 1, 0010, 0063, runbooks, policy, README, reconciliation-001); the test matrix; `packages/synth/src/{expected/types.ts, cases/matrix.ts, cases/registry.ts}`; the generated fixtures | tools/test, compliance, synth, the freeze's check tests; actionlint; `pnpm synth --all` with a clean diff; `db:domain-model --check --require-approval` against PG18; the stale-name grep |
| | **S2, database and e2e suites** | `apps/web/src/lib/routes/route-tests*/**`; `test-support/contract-world.ts`; the three comment lines; `apps/worker/src/screening/{consumer,consumer-lease}.db.test.ts`, `test-support/consumer.ts`; `vitest.config.ts`; `tools/test/{ci-chromium.ts, ci-chromium.test.ts, db-shards.ts, db-shards.test.ts}`; `apps/web/playwright.config.ts`; `apps/web/scripts/build-stamp{,.test}.ts` | the partition test; `snapshot.db.test.ts`; two route files; `consumer-lease.db.test.ts` once; `db-shards.test.ts`; web and worker unit |
| | **S3, lint and typecheck runners** | `tools/lint/**`; `tools/typecheck/**`; `package.json` (two scripts) | the runners' tests; `pnpm typecheck` cold and warm; `pnpm lint` with RSS |
| ci-deps | **D1, workflows, pins and the release chain** | every line of every workflow file (ci.yml's new `static` steps, the Postgres steps, release.yml's cache removal and `large-zip.yml` included); `release-dry-run.yml` (new); `.github/dependabot.yml`; `.github/pull_request_template.md`; `tools/test/{workflows,dependabot-config,no-duplicated-versions,collection}.test.ts`; `tools/test/frozen/publish-content.yml` (F4); `tools/ci/postgres.sh`; `tools/check-action-pins/**`; `packages/compliance/src/controls.ts` | actionlint; tools/test; check-action-pins, live; compliance |
| | **D2, toolchain, lockfile and images** | `package.json`; `pnpm-workspace.yaml`; `pnpm-lock.yaml` (the licence commit first, alone); `apps/web/package.json`; `tools/package.json`; both Dockerfiles; `docker-compose.yml`; `tools/dev.ts`; `tools/check-licenses/**`; `tools/check-toolchain/**`; `tools/screening-capacity/{containers.ts, measure.test.ts, watched.ts, watched.test.ts, watched-paths.txt}` | install frozen; audits; licences; check-toolchain, live; capacity unit; whole-repo typecheck and unit after the version bumps (vitest, eslint and next move) |
| | **D3, policy documents** | `docs/runbooks/{dependency-upgrades,github-governance,ci}.md`; ADR 0066 Part 2; ADR 0063; ADR 0062's release-cache line; `CLAUDE.md`; `README.md`; `PRD.md:645`; `infra/lib/environments.ts:4`; `architecture.svg`; reconciliation-001; the test matrix and the synth registry (CI-11 to CI-14) | synth; the docs' citations checked against the code |
| ci-browser | **P1, browser, app and baselines** | the three manifests; the lockfile; the worker Dockerfile; `shell.tsx`; `brand.spec.ts` and the seven PNGs; `browser.json`; `tools/test/browser-version.test.ts`; `tools/screening-capacity/measure.test.ts` (the whole file; P2 asks P1 for any case its binding needs); ADR 0058; `docs/runbooks/screening-capacity.md:464`; `docs/runbooks/ci.md` ("Upgrading the browser") | the 11 affected specs and the brand journey, locally, on the CfT 156 layout; the regeneration no-op |
| | **P2, runners, CI steps and binding** | every line of every workflow file (`runs-on`; ci.yml's install, SHA and baseline steps; `screening-capacity.yml`'s dispatch input; release.yml's and `release-dry-run.yml`'s identity steps); `workflows.test.ts`; `tools/screening-capacity/{image-id,containers,run,report,launch-check}.ts`, `image-id.test.ts`, `report.test.ts`, `launch-check.test.ts` and `test-support/measurements.ts`; ADR 0062; ADR 0066 Part 3; reconciliation-001; the test matrix and the synth registry (CI-18 to CI-20) | capacity unit; actionlint; tools/test |
| ci-mutation | **M1, runner, configs, workflow and gate** (lands the 10.1.1 bump and the configs as its first commit, so M2 to M4 can measure) | `package.json`; `pnpm-lock.yaml`; `pnpm-workspace.yaml`; `patches/**`; `stryker.config.mjs`, `stryker.verifier.config.mjs` and `vitest.stryker*.ts` (deleted); `stryker/**`; `vitest.mutation.config.ts`; `vitest.config.ts`; `tools/stryker/**` except `equivalent/*.json`; `tools/screening-capacity/{watched.ts, watched.test.ts}`; `mutation.yml`; `workflows.test.ts`; ADR 0066 Part 4, 0064, 0047; PRD; reconciliation-001; `docs/runbooks/ci.md` (the mutation section); the test matrix and the synth registry (CI-15 to CI-17) | canary; money shard; gate, affected and shard tests; actionlint |
| | **M2, pricing survivors and the golden test** | `packages/pricing/src/**/*.test.ts`; `tools/golden-worksheet/engine.golden.test.ts`; `tools/stryker/equivalent/pricing.json` | the pricing shards one at a time (each ≤ about 11 min locally, [S2] §4); `pnpm test:golden`; the freeze check |
| | **M3, money and ledger survivors** | `packages/money/src/**` (`cents.ts` and its tests); `packages/ledger/src/**/*.test.ts`, by new `it` blocks and new files only (0 deletions, reconciliation-001 `:440`); `equivalent/{money,ledger}.json` | the money+ledger shard; the money and ledger unit tests with coverage; the ledger oracle; `git diff --numstat` on `packages/ledger/src` |
| | **M4, packets survivors** | `packages/packets/src/**/*.test.ts`; `equivalent/packets.json` | the two packets shards (about 7 min each) |

**Integrator, per PR:**
1. Merges the builders' work and fixes the seams.
2. Runs the whole-repo typecheck and lint, every touched package's unit tests, actionlint and the PR's bounded db
   proofs.
3. Pushes once and opens the draft PR from the template, opened with `pnpm db:domain-model --summary-since <base>`,
   which shows "no change". It subscribes to the PR.
4. Writes the approval summary (the house format) with each check's result.

Then the pipeline continues: two adversarial reviews (default workflow agents with the checklists in §2), a fix round
running the full local suite once (§6 bounds it), and a fresh-clone verification that reads CI.

---

## 5. Interplay with Lane A

**#42 (PR 6b-4, draft, head 13f59b1, fix round after the 2026-10-27 14:00 UTC reset).** It changes 143 files
(`gh api repos/PureTideWater/PhysicalTherapy/pulls/42 --jq .changed_files`, and 143 names over both pages of
`…/pulls/42/files`, 2026-10-25). The ones the CI series also touches (ci-speed and ci-mutation have merged since, so
their rows now fall to #42; §3.2.2 gives ci-deps' shared files as they read at 6ddd587, under the co-founder's Q2):

| File | #42's change | Our PR's change | Resolution (rule 6: the PR merged second resolves, keeping both) |
|---|---|---|---|
| `pnpm-lock.yaml`, `apps/web/package.json`, `apps/worker/package.json` | +`@aws-sdk/client-sesv2` (web), +`client-sqs` (worker), 33 lockfile lines | ci-deps (pnpm 10.34.8, the libc fields, bumps), ci-browser (Playwright), ci-mutation (Stryker) | Take the merged manifests. Start from the lockfile of the parent already on the build branch, then run `pnpm install --lockfile-only` with the then-pinned pnpm (10.34.8 once ci-deps is in), adding `--fix-lockfile` if the libc test names an entry, then `pnpm install --frozen-lockfile`. Check that the lockfile diff against each parent holds the other's entries. Never hand-merge lockfile hunks. Once ci-deps is in, `minimumReleaseAge: 4320` (F2 (b), ruled) and `trustPolicy: no-downgrade` apply to this re-resolve: a version younger than three days, or one whose trust evidence dropped, fails it, and `check-toolchain` refuses a young version the lockfile adds. The remedy is the runbook's dated exclude, never removing the setting. #42's own additions (`client-sqs` 3.1152.0, `middleware-sdk-sqs` 3.972.44, `client-sesv2`) are older than three days and carry no `libc` |
| `tools/screening-capacity/test-support/measurements.ts` | the `mail` measurements' test data | ci-browser (the report's new fields, if their tests need it) | Keep both. The report's format number is the next free after both |
| `apps/web/src/components/shell.tsx` | the `console_mail` section and rail link (`:156-160, :259-265`) | ci-browser: `:56, :84` | Clean text merge. The second PR's CI runs axe 4.14 over #42's new console mail page and its two journeys (`mail-cutoff.spec.ts`, `mail-notices.spec.ts`), and fixes any Label-in-Name finding. If the admin rail moves a brand baseline, regenerate and inspect it (ADR 0058) |
| `apps/worker/src/screening/consumer.db.test.ts` | the consumer's mail config adds `eventsDir`, `streamPrefix` (`:240, :396`) | ci-speed moves SCR-19 and the two helpers to `test-support/consumer.ts` | Apply #42's two-line change in the helper. Typecheck finds any miss |
| `tools/screening-capacity/{report,run}.ts`, `report.test.ts`, `watched-paths.txt` | `mail` measurements (`report.ts:389-430`) | ci-deps (compose image), ci-browser (image ID, runner image, format bump) | Keep both. The report's format takes the next number free after both. Regenerate `watched-paths.txt` with `watched.ts --write` |
| `docs/product/test-matrix.md`, `packages/synth/src/cases/{matrix,registry}.ts`, `fixtures/synthetic/*` | SCR-21, SCR-22, SEC-18, SEC-19, JOB-05 | CI-01 to CI-20 and path moves | Keep both, then `pnpm synth --all` |
| `docs/product/reconciliation-001.md`, ADR 0062, ADR 0049 | 6b-4's records | the series entry, F-rulings, ADR 0062 (ci-browser) | Keep both |
| `apps/web/src/lib/routes/**` | new routes (`console-mail.ts`, `practice.ts`, `index.ts`), `mail-routes.db.test.ts` | ci-speed's split | Nothing to resolve. The partition assigns new routes by itself and the fold reads `tenantTables()` at run time. `partition.test.ts` proves it on the merged head |
| `packages/db/**` schema and the domain model | migration `20261107090000_mail_streams.sql` | none (the CI series never touches them) | After ci-speed merges, #42's unsigned state shows as a red `domain model`, not as a red database suite |

**What Lane A must know** (Lane B writes it in `lanes/lane-b.md`; Lane A folds it into HANDOFF.md and the tracker):
- **ci-speed:**
  - `check` becomes `all green`;
  - the approval case is the `domain model` job (the founder reads "Changes since the last approved domain model" in
    that job's summary);
  - the database suite runs in 4 shards;
  - a new route or tenant table needs no test-file change.
- **ci-deps:**
  - resolve lockfiles with pnpm 10.34.8, starting from the lockfile already on the build branch, then
    `pnpm install --lockfile-only` (with `--fix-lockfile` when the libc test names an entry);
  - `minimumReleaseAge: 4320` (F2 (b), ruled) and `trustPolicy: no-downgrade` apply to every re-resolve, #42's
    included. pnpm 10 re-checks every locked direct dependency on any re-resolution, so a version under three days old
    in the lockfile stops every re-resolve until it ages (what closed #38), and `check-toolchain` refuses a young
    version the lockfile adds unless a dated exclude lists it (§3.2.1);
  - npm Dependabot PRs arrive on Thursdays, actions on Tuesdays and images on Wednesdays;
  - the ops branch's `tools/setup-container.sh` pins pnpm 10.28.0 (`:36-37, 72-74`). It should move to 10.34.8, with the
    registry's SHA-512, so session containers match `packageManager`;
  - Postgres comes from `docker-compose.yml`;
  - every action change is a SHA with its version comment;
  - release.yml restores no cache, and `release-dry-run.yml` runs on any change to it.
- **ci-browser:**
  - axe 4.14's Label-in-Name rule applies to every new screen;
  - the baselines live on CfT 156, and a PR that changes one is regenerated on CI's runner and must match byte for
    byte;
  - a Playwright bump is red on the `browser.json` check until ADR 0058's procedure runs.
- **ci-mutation:**
  - the `money` label is gone;
  - every PR that touches a money path's closure (upstream workspace code, its tests' data files and the third-party
    packages it imports included) is measured, and an unexplained survivor fails it. PR 6c (engine corrections under
    its freeze exception) plans its killing tests in its design.
  - If 6c merges before ci-mutation, ci-mutation kills 6c's survivors too, and its estimate grows accordingly.
- **Gate 1:** PR 7 receives the Gate 1 line for `gates.md`.

**The ruleset offer (HANDOFF.md:54).** The founder was offered "check, mutation, capacity, approval-of-record" on
2026-10-22, with no answer yet. The new names fit it one for one:
- `all green` replaces `check`;
- `mutation` keeps its name through ci-mutation;
- `screening-capacity gate` is the capacity gate;
- `approval-of-record` is unchanged.

Applying the ruleset before ci-speed merges would require a `check` that then disappears. The recommendation (F7) is
therefore to apply it after ci-speed's first green push run. Rule 6 already makes each PR merge the latest build branch
in before merging, so "require branches to be up to date" adds enforcement, not a new step, and its cost is the re-run
F7 names.

**Applied (2026-10-25 21:14 UTC).** F7 was ruled as recommended, and "Protect the build branch" (ruleset 25837331)
now requires those four checks from GitHub Actions on `claude/build-platform`, with branches up to date, a pull request
with 0 approvals, no force push or deletion, and no bypass (`gh api repos/PureTideWater/PhysicalTherapy/rulesets/25837331`).
Rule 6's "green CI on that head" is now enforced by GitHub, for #42 as for the CI series.

---

## 6. Local verification limits

| What | Locally? | How, or why not | What covers it |
|---|---|---|---|
| Playwright 1.56.1's browser (chromium-1194), for e2e and the worker's print tests before ci-browser | **Yes, by hand-layout** | `cdn.playwright.dev` and `playwright.download.prss.microsoft.com` still refuse (curl: "CONNECT tunnel failed, response 403", 2026-10-24 ~23:25 UTC; the proxy status lists the denial). Instead, take CfT 141.0.7390.37 from `storage.googleapis.com/chrome-for-testing-public` and lay it out as `chromium_headless_shell-1194` and `chromium-1194`. [S3] M7 proved it regenerates all seven baselines byte for byte. `/opt/pw-browsers` holds only 1.63.0's 1243, which must not be used: it is a different build | CI installs the real build |
| Playwright 1.64.1's browser (1248), for ci-browser | **Yes** | The CfT 156 layout at `scratchpad/ci-design/pwr/browsers/ms-playwright`. Delete it after ci-browser merges | CI, and the `browser.json` SHA check |
| The two Playwright hosts | No | The person adds `cdn.playwright.dev` and `playwright.download.prss.microsoft.com` under the cloud environment's **Network access → Allowed domains**, with **Allow package managers** left ticked (code.claude.com/docs/en/cloud-environments#network-access). That box covers the package registries, not Playwright's browser CDN. Then `playwright install chromium` replaces the hand layout | – |
| Docker: images, Trivy, compose, the capacity measurement, the release chain | **No**: the CLI exists, no daemon (`docker info`: no `/var/run/docker.sock`) | – | CI's `images`, `screening-capacity`, `release-dry-run` and the Postgres compose step; the baseline step for 26.04 rendering |
| Full `test:db` | Fix round only, once | After ci-speed, about 10-15 minutes locally at 3 workers on shared CPUs, inside the 30-minute bound. At build time, only the changed files | CI's four shards |
| Full e2e | Fix round only, once (about 10-12 min, `--workers=2`, own database `tp_laneb_<name>_e2e`) | Through the hand layout above | CI's e2e shards |
| Full mutation run | **No**: pricing alone took 27.5 min at load 8-11 ([S2] §3.5) | Locally: one shard at a time (money+ledger 3 min, packets 7 min each, pricing about 7-11 min each), never two at once | The ci-mutation PR's own full CI run, then every push |
| GitHub-only behaviour: `needs` results, cache restore from the base branch, artifacts between jobs (and `overwrite` on a re-run), `github.event.repository.private`, `github.event.before`, Dependabot reading its config, `workflow_dispatch` | No | – | CI. The verifier reads job logs; every gate prints its verdict to the log, because the proxy refuses the artifact host |
| Networked checks (`git ls-remote`, raw.githubusercontent.com, the npm advisory endpoint) | Yes | Reachable from here | Also in CI's `static` |
| Machine | – | 4 CPUs shared with three agents. Builders bound every run; at most two heavy workflows at once (HANDOFF.md 299); no run over about 30 minutes | – |

---

## 7. Founder questions (one batch; recommended option first)

| ID | Question | Recommended | Alternatives | What each gives up | Blocks |
|---|---|---|---|---|---|
| **F1** | Where Dependabot's configuration takes effect, and whether the weekly schedules run (the mutation weekly run, the 2 GB intake check, the capacity measurement) | **(a) Make `claude/build-platform` the default branch until launch, and switch back to `main` at the launch merge.** Dependabot reads the CI-tested config with no second copy; alerts and security updates see the real lockfile; schedules and `workflow_dispatch` work; GitHub offers the PR template; a stray PR defaults to the build branch. ADR 0063, governance runbook step 4B (target `main` by pattern, not "default branch") and launch step 5 (switch back), and CLAUDE.md's template line are amended in ci-deps | (b) One PR into `main` with the new config, every `target-branch` line kept, plus the new PR template, on your ruling (the #27 precedent); a drift test on the build branch. (c) No change: main's old config stays (no ignores, Playwright inside minor-and-patch, no compose entry) | (a): `main` stops being the landing page until launch; the governance documents change; scheduled runs would cost minutes if the repository went private; ignore rules also stop a security update whose only fix is an ignored major (the alert still shows). **The cache scope widens:** runs on every branch, and every tag's run, may restore caches the build branch's push runs save ("Workflow runs can restore caches created in either the current branch or the default branch", github/docs `dependency-caching.md`, "Restrictions for accessing a cache"). Today `main` runs no workflow, so a tag restores nothing. Under (a), release.yml's capacity job would restore the build branch's pnpm store, scale release and Trivy binary and database into the attested measurement. ci-deps therefore makes release.yml restore no cache whatever you answer (§3.2.1, test-enforced), at about 22 s per tag. (b): no alerts, security updates or schedules until launch, and every later config change needs another ruling and another PR into `main`. (c): Dependabot keeps opening PRs that are red by construction (#38, #33) | ci-deps (the config's shape and the documents). It also decides whether ci-mutation's weekly run, the large-zip check and ci-browser's dispatch probe can run |
| **F2** | Two security settings that interact. (a) Turn on Dependabot alerts and Dependabot security updates (repository settings, off today: `security_and_analysis` disabled, the alerts API returns 403)? (b) Hold every dependency resolution, security fixes included, to a three-day minimum release age (pnpm `minimumReleaseAge: 4320` in `pnpm-workspace.yaml`)? | **(a) Yes, now. (b) Yes, three days, with a dated exclude for a young fix.** Security fixes arrive as one grouped PR (`applies-to: security-updates`). Dependabot's cooldown does not delay them, but pnpm's release age applies to every resolution, Dependabot's lockfile update included (pnpm.io `dependency-resolution.md`, "minimumReleaseAge"; [S4] §9). So a fix published less than three days ago resolves only after a person adds an exclude naming that exact version (`pkg@1.2.3`), with its advisory and an expiry of at most 7 days, which `check-toolchain` enforces. Three days equals Dependabot's shortest cooldown, and pnpm's own guidance is that "in most cases, malicious releases are discovered and removed from the registry within an hour" (same page) | (a) Wait for the launch merge, as ADR 0063 planned. (b) No release age, or a longer one (7 days) | Recommended (b): a security fix younger than three days waits up to three days, or for a person's exclude, before its PR can go green. (a) waiting: no alerts for transitive packages, which version updates never touch, and `pnpm audit` in each PR stays the only check. Turning (a) on under F1 (b) costs nothing but shows nothing until launch. (b) none: any update, Dependabot's included, can take a version published minutes ago, inside the window in which a compromised release is still live. (b) 7 days: up to a week before a fix resolves without an exclude, and Dependabot's 3-day patch cooldown would open PRs that cannot resolve for four more days | (a) none (a setting). (b) ci-deps's `pnpm-workspace.yaml` and `check-toolchain` |
| **F3** | After ci-deps merges, turn on "Require actions to be pinned to a full-length commit SHA" (Settings → Actions) | **Yes, once ci-deps has merged and F4 is yes** (or `publish-content.yml` is pinned some other way). With the setting on, "all actions must be pinned to a full-length commit SHA to be used" (github/docs `data/reusables/actions/actions-use-policy-settings.md`), so under F4 = no, `publish-content.yml`'s `@v4` refs would stop it running and content would stop publishing. It enforces the pin on any branch's workflow, not only where a PR runs the test. Whether GitHub also enforces it on actions nested inside composite actions is not documented (the review's search was inconclusive), so `check-action-pins` makes every nested ref a SHA first (§3.2.1): nothing nested runs by tag either way | Rely on `workflows.test.ts` and `check-action-pins` alone | Yes: no adding an action by tag in a hurry, and it must wait for F4 = yes. No: a workflow pushed on a branch without a PR runs unpinned actions | None (after ci-deps and F4) |
| **F4** | A standing exception to reconciliation-001's content-pipeline check (`:444`, "`.github/workflows/publish-content.yml` [is] unchanged"): may that file change only in its `uses:` refs and their version comments (SHA pins at the current majors now, by ci-deps, and Dependabot's later pin bumps with no further ruling), plus, once, its `runs-on` (ubuntu-26.04, by ci-browser) and a `timeout-minutes`? Every other line stays identical to a committed frozen copy, and a test enforces it | **Yes, standing.** It is the one workflow with `contents: write` that pushes to `main`, and a moved tag (the trivy-action hijack, CVE-2026-33634) is exactly what pinning stops. It is also the one workflow with no timeout. Dependabot's actions group updates every workflow's pins weekly, so a one-time exception would be breached by the first bump. The frozen-copy test (§3.2.3) makes the check mechanical: a pin bump passes, any other edit fails | (b) A one-time exception for the CI series only. (c) Leave it untouched: excluded by name from the pin, runner and timeout tests, and from Dependabot by `exclude-paths` (github/docs `dependabot-options-reference.md`, "exclude-paths") | Yes: the file is no longer byte-for-byte untouched; its steps and logic are, by test. (b): every weekly actions PR either breaches the check again or needs the file excluded, after which its pins rot. (c): the most privileged workflow stays on moving `@v4` tags (Node 20 actions forced onto Node 24), on ubuntu-24.04, with GitHub's 360-minute default, and F3 cannot be turned on | ci-deps (pins, timeout, frozen copy), ci-browser (label), F3 |
| **F5** | Move the release's binding capacity measurement (`release.yml` build, capacity, push and report; `RELEASE_RUNNER`) and the PR capacity job that predicts it from ubuntu-24.04 to ubuntu-26.04 with everything else? | **Not in the CI series.** Keep them on ubuntu-24.04, which GitHub supports until the next LTS (runner-images README), while every other job moves. In ci-browser, make the image binding store-independent and record the runner image in the report. Then dispatch one advisory 26.04 measurement and decide the move on its numbers, recorded on issue #41. §3.3.1 gives the exact `runs-on` set for each answer | (a) Move now, with the store-independent binding. (b) Move now without it | Recommended: one runner label for every job (two to maintain, and a test that names the exception). (a): continuity with the 24.04 S4 timings (38-57 s on the same code, #41), and a release's pass or fail would rest on a new kernel (7.0) and Docker (29.4.2) with no measurement there first. (b): if 26.04's Docker uses the containerd store (likely, not yet observed), every genuine report is refused and production stays closed | ci-browser's runner test |
| **F6** | Your adoption of the whole combined audit on 2026-10-20 covers #54's "Make 85% an exit condition of milestone 6 and Gate 1" (combined-report.md:683). Does it also cover adding that exception to reconciliation-001's "the fourteen milestones and their checks in PRD 17 are unchanged" (`:459`), whose list of exceptions does not name it? | **Yes, covered.** ci-mutation amends PRD 17's milestone 6 check and adds "the 85% mutation exit added to milestone 6 and Gate 1 (combined audit #54, adopted 2026-10-20)" to the check's exceptions; Lane A's PR 7 writes Gate 1's line into `gates.md` | (b) Keep PRD 17 unchanged, and PRD 18's "before Monitoring v1". (c) A fresh ruling with other words | (b): the earlier proof the audit asked for; the gate binds a milestone only at Monitoring v1, after the first real audits (CI enforces it on every PR either way). (c): only a round trip | ci-mutation's PRD 17 and reconciliation-001 lines; not its code or gate |
| **F7** | Apply the `claude/build-platform` ruleset you were offered on 2026-10-22 (governance runbook step 4A): require `all green`, `mutation`, `screening-capacity gate` and `approval-of-record` (each from GitHub Actions), require a PR, block force pushes, and require branches to be up to date | **Yes, once ci-speed's first push run is green.** Nothing enforces these checks today: a red PR can merge by mistake, and CODEOWNERS on `exception.json` and `pinned-tables.json` is unenforced (HANDOFF.md:54) | (b) Not yet. (c) The ruleset without "require branches to be up to date" | Yes: no merge while a required check is pending or red, the capacity job's queue included; no direct push to the build branch; and each merge leaves every other open PR out of date, so each must merge the branch in and re-run its CI (about 10 min) and, on watched paths, its capacity job (13-16 min) before it can merge. Rule 6 already asks for that merge, so the cost is enforced, not new. (b): merging rests on each session reading every check by hand. (c): a PR could merge green against a base it was never tested with | None (after ci-speed) |

**Notices: decided under the standing rule.** Each is recorded in ADR 0066, and you can reverse any of them:
- **N1.** supply-chain.yml folds into ci.yml under `all green`, with ADR 0010 amended. That leaves one required check
  for CI, in place of four.
- **N2.** The schema approval runs as the named `domain model` job, using CLAUDE.md's own command. The database suite no
  longer turns red for a missing signature, and CO-02 is unchanged.
- **N3.** A flaky end-to-end test fails CI. The retry stays for its trace and label.
- **N4.** Mutation uses Stryker 10.1.1's vitest runner, not the command runner the audit named. Their results match on
  the evidence, and the vitest runner is 2.5 to 6 times faster and names the tests. Affected packages run in full, not
  only the changed files. The gate is stricter than 85%: no unexplained survivor.
- **N5.** Stryker 10.1.1 (2026-10-23T19:18Z), pnpm 10.34.8 (18:06Z) and next 16.4.3 (13:40Z) were all published on
  2026-10-23 (`npm view <pkg> time`). All three will be older than the three-day release age (F2 (b)) by the time they
  merge, from 2026-10-26T19:18Z at the latest. They are taken for measured correctness, for the 23 advisories fixed and
  for Next's latest patch on the 16.4 line.
- **N6.** MinIO is removed, not replaced: the image is gone and nothing connects to it. PRD 15's, CLAUDE.md's and the
  README's dev-environment words follow.
- **N7.** Both production images move from Debian 12 bookworm to Debian 13 trixie at the same Node 24. The images,
  e2e and capacity jobs prove the move.
- **N8.** Node 26 (LTS from 2026-10-28), TypeScript 7 and the Anthropic SDK 1.x each get a deliberate PR of their own.
  Node 26 lands before Gate 1, and these join the tracker as follow-ups.
- **N9.** Lint runs as three memory-bounded groups in one job, not "per workspace" as audit #109 put it. The web group
  is the floor whatever the split, because its program compiles every workspace package's source ([S1] §7). More groups
  or jobs would add processes and account slots without lowering the wall.
- **N10.** pnpm stays on major 10 (10.34.8), not 12.15.0, because Dependabot supports pnpm v7 to v10 only
  (github/docs `supported-package-managers.md:44`). ADR 0066 and the upgrades runbook name the trigger for moving: GitHub
  listing a later major.
- **N11.** `release.yml` restores no cache, whatever F1's answer, and `release-dry-run.yml` exercises its actions on
  every change to it. That costs about 22 s per tag and a few runner-minutes per release change, and the attested
  report then depends only on its own run (§3.2.1).

---

## 8. Migration check

None of the four PRs adds a migration or regenerates `docs/product/domain-model.md`. Each verifier asserts that
`git diff --name-only <mb> -- packages/db/migrations docs/product/domain-model.md packages/db/domain-model` is empty.

- **ci-speed** removes a test case from `domain-model.db.test.ts` and runs the CLI in a job. Neither regenerates the
  text, and the founder's approval line is untouched.
- **ci-deps** pins Postgres to a digest within major 18. It does not change pg-boss.
- **ci-browser** moves the db shards to ubuntu-26.04. They still run the compose Postgres, not the runner's 18.6.
- **ci-mutation** does not touch `packages/db`.

**The one way a hand-off could arise.** If the digest pin's PostgreSQL minor changed the catalog output, the
`domain model` job would show drift. Only a regenerated document fixes that, and a regenerated document belongs to
Lane A. The PR stops, records the drift under "Handed to Lane A" in LANES.md, and drops the digest bump until Lane A
regenerates. **Nothing is handed to Lane A today.**

---

## 9. Risks and rollback

Rollback for every PR: `git revert -m 1 <merge commit>` in a new PR, on green CI (no force push, no rebase). After F7,
a check rename also needs the founder's ruleset edit.

| PR | Risk | Mitigation |
|---|---|---|
| ci-speed | A hidden coupling between e2e journeys surfaces when they shard | Run the two-shard setup on three heads before marking the PR ready. A coupling found is fixed, never hidden by a retry (N3) |
| ci-speed | Queueing: two lanes can hit GitHub Free's 20-job account limit | 13 ci.yml jobs (images in one job, licences in `static`); queue time reported apart from A1. The account's plan is unknown (`gh api user` gives plan null), open item O1 |
| ci-speed | Host variance (865 to 1,336 s for the same file, [S1] §3) | A1 is judged on the median and the worst over 8 runs |
| ci-speed | A wrong partition drops routes | The partition test is exactly-once and fails first; A2's counts |
| ci-speed | A stale cache | tsc compares hashes; the vitest results cache only orders files; ESLint stays uncached |
| ci-speed | Watched paths set the time to merge | `package.json` and the lockfile are watched, so the PR and most product PRs also wait for the 13-16 minute capacity measurement. A1′ reports it beside A1, and O12 takes the PR capacity run's length to the founder |
| ci-deps | trixie changes glibc and OpenSSL in both images | images, e2e (on the build artifact) and capacity on the same head |
| ci-deps | The lockfile re-resolve brings surprises | The licence commit is alone and holds exactly the 43 measured `libc:` lines (§3.2.5 step 4). Each bump's lockfile diff is reviewed and summarised; anything beyond the named bumps is explained or reverted |
| ci-deps | `minimumReleaseAge` blocks a young security fix | The founder's trade-off, F2 (b). Dependabot's security update resolves it with the gate off, and `check-toolchain`'s lockfile rule holds that PR red until a person adds the exact-version exclude, with its advisory and an expiry of at most 7 days (§3.2.1, re-read 2026-10-25) |
| ci-deps | A young version merged into the lockfile stops every re-resolution until it is three days old (what closed #38) | `check-toolchain` refuses one unless a dated exclude lists it; the bump commits are made after 2026-10-26T19:18:50Z (§3.2.1) |
| ci-deps | The networked checks flake | Three tries with backoff, then fail closed, with the failing host named |
| ci-deps | Docker Hub rate limits (429 seen by [S4]) | Digests resolved once by the builder; CI's image build proves them |
| ci-deps | `multi-ecosystem-groups` merges parameters in ways not fully documented | The first Dependabot run after merge is read, and the PR's follow-up fixes the config |
| ci-deps | Under F1 (a), ignored majors also stop security updates | The alert still shows; the runbook says how to act |
| ci-deps | The weekly Dependabot batch fills the account's 20 job slots | Measured and estimated in §3.2.1 (re-read 2026-10-25): about 30 to 35 minutes of saturation on a Thursday with the closure rule. Mitigated by the closure rule (four of eight npm groups measure no mutation; a root-manifest or catalog change runs it in full), staggered days per ecosystem away from Monday's weekly runs, and the bot queue time reported in `docs/runbooks/ci.md`; serialising bot runs waits for actionlint to accept `queue` (O13) |
| ci-deps | The dry run differs from the tag's run | A test holds its shared steps equal to release.yml's; what it cannot cover (pushing, attesting, `packages: write`) is read job by job on the founder's first tag after the merge |
| ci-deps | Under F1 (a), a tag run restores the build branch's caches | release.yml restores no cache, by test (§3.2.1, N11) |
| ci-browser | The 26.04 Docker uses the containerd store | The store-independent ID; the capacity chain stays on 24.04 (F5) |
| ci-browser | Google's CfT 156 bytes differ from Playwright's mirror | The `browser.json` check fails on the first run; `browser.json` takes CI's SHA and the baseline step gives the pictures as CI renders them |
| ci-browser | The baselines render differently on ubuntu-26.04 than on the 24.04 host that made them | The baseline step regenerates them on CI's runner and fails on any byte difference, printing CI's pictures for a person to commit and inspect (A9) |
| ci-browser | Every Playwright bump is red on the `browser.json` check | Deliberate (A4): the message names ADR 0058's procedure and the expected and found builds |
| ci-browser | axe 4.14 flags #42's new pages | Fixed by whichever PR merges second |
| ci-browser | The restore drill fails on `pg_dump` 18 | Fixed in the PR, as a real check gained |
| ci-browser | Playwright 1.64's breaking changes (hidden iframes, renamed snapshot modes) | The full e2e run on CI; `=all` in the regenerate command |
| ci-mutation | Packets sits only 0.40 points above 85% | The PR kills survivors to zero unexplained, which leaves headroom by construction |
| ci-mutation | A pricing shard nears its 30-minute timeout | The per-test golden pricing removes the static share; rebalance `shards.json` after the PR's first CI run |
| ci-mutation | The closure misses an input a test reads at run time (a computed path, an environment variable) | The data-file scan fails on a literal path the list lacks; a dynamic read is caught by the push run, which measures every package, and its gap is added to the list in the fix |
| ci-mutation | A private repository doubles shard times and bills minutes | Noted for the founder's decision to go private (cost), with the Dependabot batch's estimate of about 3,500-4,000 billed minutes a month (§3.2.1) |
| ci-mutation | An "equivalent" entry hides a real gap | Each entry carries a reason and a reviewer; the payment-engine review checks every one |
| ci-mutation | Any new release can have defects (Stryker 10.1.1) | The canary's five cases run before every score |
| ci-mutation | 6c merges first | ci-mutation also kills 6c's survivors (§5) |

---

## 10. Where this plan departs from a scout, and why

- **Typecheck caching ([S1] §7 proposed `incremental` in every tsconfig).** A root runner passes `--incremental
  --tsBuildInfoFile` instead. The freeze forbids touching `packages/pricing/tsconfig.json` and its manifest
  (`tools/engine-freeze/check.ts:196-198`).
- **Mutation's home ([S2] left it open).** It stays in its own workflow with the required `mutation` gate. That keeps
  `all green` under 10 minutes on money PRs, keeps the schedule and dispatch triggers apart, and matches the founder's
  pending offer (§2; account slots are shared either way).
- **The images job ([S1] kept the matrix).** It becomes one job, and licences become a step in `static`. This spares
  two of GitHub Free's 20 concurrent slots, with no effect on the wall.
- **Postgres from compose ([S4] §6 proposed a job output).** A compose step in each job reads the file directly. It adds
  no job to the critical path and stays one source by construction.
- **MinIO ([S4] proposed a replacement).** It is removed. Nothing connects to it (§3.2.1).
- **Equivalent mutants ([S2] proposed an ignorer plugin).** They are matched per mutant on the gate's side, because the
  plugin API ignores whole AST nodes.
- **The golden test fix ([S2]: move the call "into the tests").** Each claim is priced in its own test with no shared
  memo; a memo would defeat perTest.
- **The mutation gate ([S2]: 85% per package).** It also requires zero unexplained survivors, as N4 records.
- **Shard widths ([S1]: widen by hand if private).** They widen automatically from `github.event.repository.private`.
- **The browser build ([S3] proposed printing its SHA).** CI fails when the SHA differs from `browser.json`, a
  deliberate red on every Playwright bump (A4). The baselines are also regenerated on CI's runner whenever they change.
- **Release-only actions ([S4] R1: a dry run).** S4 was right. `release-dry-run.yml` runs the release's build, save,
  upload, download, load, identity check and registry login on every change to release.yml, never pushing or
  attesting, and `tools/check-action-pins` also validates every `with:` input at the pinned SHA.
- **The mutation affected rule ([S2] §6 listed the fixtures the tests read).** Each package's closure is its import
  graph (tests included), its data files and its third-party packages, so upstream code, fixtures and lockfile moves
  count, and a lockfile move outside every closure does not.
- **The canary ([S2]: a job before the shards).** It is the first step of every shard, which proves each shard's runner
  and spares a job's setup on the critical path.
- **The flaky policy ([S1] asked the founder).** It is decided under the standing rule (N3): it is a quality choice
  with no cost, product or legal trade-off.
- **Stryker 10.1.1's age ([S2] asked the founder).** It is decided (N5). By merge time it is past the release age, and
  10.0.0 is measurably wrong.

---

## 11. Open items

- **O1.** The account's plan (Free or Pro) sets the concurrent-job limit (20 or 40). `gh api user` gives plan null. Ask
  the founder; it is a fact, not a decision.
- **O2.** The pg-boss `migrate: false` change and the migration task migrating pg-boss land in infrastructure PR (d),
  before the first staging deploy. The runbook in ci-deps documents it.
- **O3.** Confirm pnpm 10.34.8's `minimumReleaseAge` behaviour on frozen installs and under Dependabot's updater
  (ci-deps build). pnpm 10 has no `minimumReleaseAgeStrict` (added in 11.0.0, pnpm.io `dependency-resolution.md`), so
  the builder records what 10.34.8 does when no version in range is old enough. **Answered from source on 2026-10-25**
  (§3.2.1): a frozen install never checks; any re-resolution re-checks every direct dependency and fails with
  `ERR_PNPM_NO_MATURE_MATCHING_VERSION` (Dependabot run 40223237798); the CLI flag sets the minutes; Dependabot's
  security updates pass 0. The builder only confirms it live (§3.2.5 step 5).
- **O4.** Test the S3 path (presigned PUT, Object Lock COMPLIANCE, multipart) against AWS staging, in infrastructure
  PR (b) or (c), now that no local S3 stand-in exists.
- **O5.** The dispatched 26.04 capacity probe and its `docker info`, for F5's later ruling (issue #41).
- **O6.** Re-run the axe sweep over #42's new journeys in whichever of #42 and ci-browser merges second.
- **O7.** Rebalance `stryker/shards.json` after ci-mutation's first CI run, replacing the loaded-machine estimates.
- **O8.** Delete the 676 MB CfT 156 layout (`scratchpad/ci-design/pwr/browsers/`) once ci-browser merges.
- **O9.** The network policy: the person allows the two Playwright hosts (section 6). Until then, the hand layout serves.
- **O10.** Before any builder starts, record in LANES.md's claim row (rule 4, `LANES.md:24-26`; the row at `:103` says
  "no `packages/synth` case IDs (any the design needs are added here first)"):
  - the split: four branches, `co-001/ci-{speed,deps,browser,mutation}`;
  - the synth cases **CI-01 to CI-20, in a new case module `CI`** (`packages/synth/src/expected/types.ts:9`), with
    their fixtures `fixtures/synthetic/CI-01` to `CI-20`, beside the test-matrix rows already reserved.
- **O11.** Lane B's usage reading: 0% on 2026-10-24, reset next Friday (the relayed request). Read the meter before each
  heavy run (rule 9).
- **O12. For the founder, after ci-speed's first five push runs: the PR capacity run's length.** Once ci.yml takes
  about 10 minutes, `screening-capacity gate` sets the time to merge on every watched-path PR: 13:20 to 16:00 of job
  time, of which the measurement step is 9:31 to 14:02 (runs 39977565861, 40018476404, 39978142533). Shortening it
  means changing what a PR run measures: S4 once instead of three times on PRs (the founder's ruling of 2026-10-23
  asked for three), or the scenarios split across parallel runners (which changes the CPU layout the verdict holds).
  Both touch the founder's rulings and Lane A's harness (PR 6b-3), so this series changes neither. Lane B brings A1′'s
  numbers to the founder with those two options and their costs, and the ruling, if any, becomes its own PR.
- **O13.** Serialise Dependabot's runs with `concurrency: queue: max` once actionlint accepts the key (it does not on
  its main branch, 2026-10-25), and only if A1′'s bot-queue readings show a lane PR waiting more than 15 minutes during
  a batch. A shared group without `queue` would cancel most of a batch (§3.2.1).

## 12. Evidence index (beyond the scout reports)

| Fact | Command or source (2026-10-24) |
|---|---|
| The Playwright hosts are still refused | `curl https://cdn.playwright.dev/builds/cft/156.0.8078.4/linux64/chrome-headless-shell-linux64.zip` gives `CONNECT tunnel failed, response 403`; `$HTTPS_PROXY/__agentproxy/status` lists the denial |
| Latest versions | `npm view <pkg> dist-tags.latest`: @stryker-mutator/* 10.1.1, @playwright/test 1.64.1, @axe-core/playwright 4.14.0, vitest 5.0.5, next 16.4.3, eslint 10.13.0, typescript-eslint 8.72.0, typescript 7.0.2. `npm view pnpm time`: 10.34.8 at 2026-10-23T18:06Z |
| Action tags | `git ls-remote --tags --refs https://github.com/<action>.git` for all twelve actions (§3.2.1) |
| Node schedule | raw.githubusercontent.com/nodejs/Release/main/schedule.json: v24 maintenance 2026-10-20, end 2028-04-30; v25 end 2026-06-01; v26 LTS 2026-10-28 |
| Node image digests | Hub API: `24-slim` = `24-bookworm-slim` = sha256:55fb5f5a…; `24-trixie-slim` = sha256:43b9ba11… |
| MinIO image | `hub.docker.com/v2/repositories/minio/minio/` returns "object not found" |
| Runner images | Ubuntu2604-Readme (20261023.163.3): Docker 29.4.2, Compose 5.1.3, PostgreSQL 18.6, kernel 7.0.0-1017-azure. Ubuntu2404-Readme (20261012.334.1): Docker 28.0.4 |
| Playwright 1.64.1 sharding | `npm pack playwright@1.64.1`; `lib/runner/index.js:2462-2487` (count-based; internal `PWTEST_SHARD_WEIGHTS`) |
| Multi-ecosystem groups need `patterns` | github/docs `configuring-multi-ecosystem-updates.md`, "Troubleshooting" |
| The freeze covers pricing's manifest and tsconfig | `tools/engine-freeze/check.ts:13-19, 196-198` |
| Every workspace's typecheck | `node -p` over each `package.json`: all `tsc --noEmit` |
| No local Docker daemon | `docker info` fails at `/var/run/docker.sock` |
| #42's overlapping files | `gh api repos/PureTideWater/PhysicalTherapy/pulls/42/files?per_page=100&page=1..2` |
| `main`'s files | `git ls-tree -r --name-only origin/main`: 11 files, among them `dependabot.yml` and the PR template |
| The licence fix needs `--fix-lockfile` (2026-10-25) | In `scratchpad/reviser-wt` at 49514e8 with `npm pack pnpm@10.34.8`: `install --lockfile-only` leaves 3 `libc:` lines; `--fix-lockfile` gives 46, `git diff --numstat` `43 0`; `licenses list --prod --json` lists `@img/sharp-libvips-linuxmusl-x64` before and no `linuxmusl` package after (`scratchpad/reviser-tools/{lockonly.log, fix.log, fix-lockfile.diff, lic-orig.json, lic-fixed.json}`) |
| `vitest list` ignores `--shard` | `pnpm -s vitest list --project db --shard=k/4 --filesOnly`: 105 files for k = 1 and 2, identical to the unsharded list (`scratchpad/reviser-tools/{all,shard1,shard2}.txt`); vitest 5.0.4's `BaseSequencer.shard()` sorts by the SHA-1 of the path (`dist/chunks/index.B8VfM7Mf.js:7740-7751`) |
| Capacity job times | `gh api …/actions/runs/{39977565861,40018476404,39978142533}/jobs`: capacity 13:20, 16:00, 15:40; the measurement 9:31, 12:58, 14:02; "Build the scale release" 22 s on the one miss |
| Cache scope and concurrency | raw github/docs: `content/actions/reference/workflows-and-actions/dependency-caching.md` ("Restrictions for accessing a cache"); `data/reusables/actions/actions-group-concurrency.md` (pending runs cancelled; `queue: max`); `data/features/actions-nga.yml` (`fpt: '*'`) |
| Runner sizes | raw github/docs `data/reusables/actions/supported-github-runners.md`: public Linux 4 CPU, 16 GB; private 2 CPU, 8 GB |
| Pin and SHA settings | raw github/docs `data/reusables/actions/actions-use-policy-settings.md`; `data/reusables/dependabot/supported-package-managers.md:44` (pnpm v7-v10); `content/code-security/reference/supply-chain-security/dependabot-options-reference.md:895` (`exclude-paths`) |
| Nested actions and their caches | `action.yaml`/`action.yml` at the pinned SHAs of trivy-action (`ed142fd…`: `cache` default `'true'`, setup-trivy and actions/cache by SHA), setup-trivy (`3fb12ec…`), attest-build-provenance (`4d10147…`); setup-node v7.1.0 (`package-manager-cache`), pnpm/action-setup v6.1.0 (`cache`, default false), setup-buildx v4.4.1 (`cache-binary`, default true), upload-artifact v7.0.2 (`overwrite`) |
| actionlint and `queue` | `actionlint` 1.7.7 on a fixture with `queue: max`: `unexpected key "queue" for "concurrency" section`; `parse.go` on rhysd/actionlint main accepts only `group` and `cancel-in-progress` |
| pnpm's release-age settings | pnpm.io `docs/settings/dependency-resolution.md`: `minimumReleaseAge` (all dependencies, transitive included), exact-version excludes since 10.19.0, `minimumReleaseAgeStrict` since 11.0.0 |
| Publish times and pnpm majors | `npm view next time` (16.4.3: 2026-10-23T13:40:24Z); `npm view pnpm dist-tags` (latest 12.15.0, latest-10 10.34.8) |
| #42 | `gh api …/pulls/42`: `changed_files` 143, head 13f59b1, draft; its files include `tools/screening-capacity/test-support/measurements.ts` |
| Labels and tags | `gh api …/labels`: no `regenerate-baselines`; `gh api …/tags`: 0 |
| Money closures | `grep` of each package's `@tp/*` imports: ledger imports only `@tp/money`; pricing `@tp/contracts`, `@tp/money`, `@tp/rules`; contracts imports `@tp/db/runtime`; `@aws-sdk/client-textract` at `packages/contracts/src/evidence/scan.ts:1`, `@aws-sdk/client-kms` at `packages/db/src/crypto/kms-key-provider.ts:1` |

---

## 13. Review (2026-10-24)

The adversarial review ([R], `scratchpad/ci-design/design-review.md`) found 1 blocking, 22 should-fix and 10 nit
findings. Each was checked again before it was dispositioned: the lockfile, shard and actionlint behaviour by running them
in a fresh worktree at 49514e8 (`scratchpad/reviser-wt`, removed afterwards; outputs in `scratchpad/reviser-tools/`),
and the rest against the files, GitHub's API and the upstream sources §12 cites. All 33 hold. Two had a part that did
not survive checking, and that part is rejected with its evidence below; everything else is fixed in the sections named.

| ID | Severity | Disposition |
|---|---|---|
| R1 | blocking | **Fixed** (§3.2.1, §3.2.3, F1, N11). release.yml restores no cache whatever F1's answer, by test. Checking it found two more caches than the review named: trivy-action (`cache: 'true'` by default, which restores the Trivy binary and database) and setup-buildx (`cache-binary`). Both are now off too |
| R2 | should_fix | **Fixed** (§3.2.1, §3.2.5 step 4). The licence fix is its own first commit, `--fix-lockfile` under 10.34.8. Reproduced: `43 0`, 27 glibc and 16 musl; `licenses list` drops the musl package |
| R3 | should_fix | **Fixed** (A2, §3.1.1, §3.1.4, §3.1.7). Shards print the files they ran, the verifier unions the logs, and CI-04 uses vitest's own sequencer for N = 4 and 6. Reproduced: `list` gives 105 files for 1/4 and 2/4 |
| R4 | should_fix | **Fixed** (§3.1.2, §3.1.3). large-zip.yml installs Chromium in ci-speed, and a rule requires it before any unit or db vitest run |
| R5 | should_fix | **Fixed** (§3.4.1, §3.4.3), with two of its table cases **rejected**. The closure is file-level: imports (tests included), data files, and third-party packages through the lockfile. On that graph, db → ledger is false (ledger imports only `@tp/money`), and an aws-sdk bump reaches pricing and packets (`client-textract`, `client-kms`), not none |
| R6 | should_fix | **Fixed** (§3.4.1, §3.4.4 step 1, M3). Ledger survivors die only by new `it` blocks or files; `--numstat` shows 0 deletions |
| R7 | should_fix | **Fixed** (§3.1.3, §3.1.4). `definedIn`, with every existing `file` rule kept |
| R8 | should_fix | **Fixed** (§3.1.3, §3.1.5, §3.1.6). `REQUIRED_CHECKS`, marked listings and `required-checks.test.ts`, plus the stale-name grep. Checking added three places the review missed: the two Dockerfile comments and ADR 0063:477 |
| R9 | should_fix | **Fixed** (§0, A1′, O12). Time to merge is measured with its command, and the capacity floor (13-16 min, measured) is stated. Its length goes to the founder as O12. The canary moves into the shards, saving a job on mutation's path |
| R10 | should_fix | **Fixed** (F2 (b), §3.2.1). The release age is a founder question, as a security trade-off, recommended at three days, with exact-version dated excludes enforced by `check-toolchain` |
| R11 | should_fix | **Fixed** (F3, §3.2.1). F3 only after F4 = yes. `check-action-pins` recurses into composites; every nested ref is a SHA today (read at the pinned commits) |
| R12 | should_fix | **Fixed** (F4, §3.2.3). The exception is standing and limited to `uses:` refs, enforced by a frozen-copy test. The cited line is `:444`, not `:447` |
| R13 | should_fix | **Fixed** (§3.3.1, §3.3.3). build records the tarball's SHA-256 and the config digest (a `node:`-only parser, no install). capacity and push check with `sha256sum -c`. A rule keeps push and report free of repository code |
| R14 | should_fix | **Fixed** (§2, §4). Ownership is disjoint, file by file. The four shared files are named, and the PR merged second re-pins mutation.yml |
| R15 | should_fix | **Fixed** (O10). Synth cases CI-01 to CI-20 (module `CI`) are reserved in the claim row before any builder starts |
| R16 | should_fix | **Fixed** (§3.3.1, F5). The text now says "F5's recommended answer", with the exact `runs-on` set for each option |
| R17 | should_fix | **Fixed** (§3.1.1, §3.1.4). `fetch-depth: 0` on `unit` and `domain model`, asserted in `check.test.ts`. No `blob:none`: the pack is 15.28 MiB, and lazy blob fetches would make `git archive` and gitleaks depend on the checkout's credentials |
| R18 | should_fix | **Fixed** (§3.1.2, §3.1.4). Each heap is capped at the budget, and one group always runs. Plans for 16 GiB (two at once, no cost to the wall: 123 s against 45 + 45) and 8 GiB |
| R19 | should_fix | **Fixed** (§3.1.1, §3.4.1). Both groups take the `${{ github.workflow }}-` prefix, and a rule holds every group to its workflow's name |
| R20 | should_fix | **Fixed** (A9, §3.3.1, §3.3.4). The baselines are regenerated on CI's 26.04 with `git diff --exit-code` and the SHAs printed. The step is triggered by the diff, not a label: no `regenerate-baselines` label exists |
| R21 | should_fix | **Fixed** (A4, §3.3.1, CI-12, CI-18, runbook). The check is kept as the one deliberate red, and its message names the procedure and both builds |
| R22 | should_fix | **Fixed** (§3.2.1, §3.2.3, §10). `release-dry-run.yml`, held equal to release.yml's steps by test. No tag exists, so release.yml has never run |
| R23 | should_fix | **Fixed** (§3.2.1, §9), with one mitigation **rejected**. The batch's load is measured and estimated, and the plan is the closure rule, staggered days and bot queue reporting. The shared `dependabot/**` concurrency group is rejected: a default group cancels pending runs, and `queue: max` is refused by actionlint (measured), so it waits as O13 |
| R24 | nit | **Fixed** (§3.2.1). The compose start runs in the background before install, then waits before the first database step |
| R25 | nit | **Fixed** (§3.1.1). `github.event.before`, falling back to `HEAD^1`, for the scan, releases-immutable and `ENGINE_FREEZE_BASE` |
| R26 | nit | **Fixed** (N5, N10, §3.2.1). next 16.4.3 is added, and the pnpm-10 reason (Dependabot v7-v10) and its trigger are recorded |
| R27 | nit | **Fixed** (§5). 143 files; the `measurements.ts` row is added |
| R28 | nit | **Fixed** (N9, §2, A4, A1). The lint notice; the mutation rationale without slots; A4 (a) reworded; runner-minutes ≤ 50 against a 42.7-47.7 estimate |
| R29 | nit | **Fixed** (§3.4.1, A7, §3.4.3). The rules apply to fully-run packages, a package's shards run all or none, and equivalents stay in the denominator |
| R30 | nit | **Fixed** (§3.1.5). ADR 0063:130 and governance:525 read 11 files, in ci-speed |
| R31 | nit | **Fixed** (F7, §5). The re-run cost of "up to date"; the release age and trust policy on #42's re-resolve; setup-container.sh's pnpm; the starting lockfile |
| R32 | nit | **Fixed** (§3.4.1, §3.4.2, §2). The canary's `typecheck` script; the golden claim-set check and moved-lines diff; pricing helpers in `*.test.ts`; `cents.ts` reviewed as a money-path change |
| R33 | nit | **Fixed** (§3.1.1, §3.4.1). `overwrite: true` on every per-run artifact, verified on the first re-run |
