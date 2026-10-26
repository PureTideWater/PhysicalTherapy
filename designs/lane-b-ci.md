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
| A8 | ubuntu-26.04 | Every job's `runs-on` is `ubuntu-26.04`, except the jobs the F5 ruling keeps on `RELEASE_RUNNER.label` (§3.3.1 gives the exact set for each F5 answer). Every job log's "Runner Image" line confirms it | `workflows.test.ts`; the "Set up job" log lines | ci-browser |
| A9 | Baselines | All seven regenerated with Chrome for Testing 156.0.8078.4 under Playwright 1.64.1, and committed. A second `--update-snapshots=all` on that build leaves `git status` clean, locally and **on CI's ubuntu-26.04**: the baseline step (§3.3.1) regenerates them on the runner whenever a PR changes the baselines, `browser.json` or `brand.spec.ts`, then runs `git diff --exit-code` over the snapshots and prints the seven SHA-256s, and the PR records that run as ADR 0058's proof. CI's headless-shell SHA-256 equals the recorded build's (`4fa61f0b…d9f6`, [S3] M7). A person inspects them in the PR's image diff, against the per-image pixel counts and the crop of the changed band (today: six at 0 px, the without-seal cover at 1,611 px, [S3] M5), and the PR records who did and when | The brand journey and the baseline step in CI; a local no-op regeneration; the PR description | ci-browser |
| A10 | Accessibility | No axe violation under 4.14.0 with the WCAG 2.0/2.1 A and AA tags. A computed check holds every header control's accessible name to contain its visible text | e2e (every spec runs `a11y.ts:12`) | ci-browser |

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

#### 3.3.1 What changes

- **Versions:** @playwright/test (apps/web), playwright-core (apps/worker, tools) and the lockfile to **1.64.1**;
  @axe-core/playwright to **4.14.0**. Both are latest on npm, checked 2026-10-24.
- **The worker image derives its Playwright.**
  - `apps/worker/Dockerfile:23` stops installing a literal `playwright-core@1.56.1`. The build stage writes
    `node -p "require('./apps/worker/package.json').dependencies['playwright-core']"` to a file, and the runtime stage
    installs that version.
  - `tools/test/browser-version.test.ts` (new) requires web's @playwright/test, the worker's and tools' playwright-core,
    and the lockfile's resolution to name one version, and the Dockerfile to read it from the manifest. It replaces
    `tools/screening-capacity/measure.test.ts:232` (`toBe('1.56.1')`, which the comment above it says it is not).
- **WCAG 2.5.3 fixes, real findings of axe 4.14** (the rule lost `experimental`, [S3] §1). Both are in
  `apps/web/src/components/shell.tsx`:
  - `:56`: ``aria-label={`${current?.name ?? 'Choose a practice'}, practice switcher`}``.
  - `:84`: ``aria-label={`${shell.email}, account menu`}``, with the decorative initial drawn as CSS generated content
    (`data-initial`, `before:content-[attr(data-initial)]`), so it is not a text node.
  - Verified: axe-clean, and pixel-neutral on the header (M4, M5).
  - `brand.spec.ts:330-331`'s and `sign-in.spec.ts:18`'s `getByLabel` still match, because the match is a
    case-insensitive substring.
  - A computed check in `brand.spec.ts` holds each header control's accessible name to contain its visible text (CI-19).
- **The baselines:**
  - Regenerated with `--update-snapshots=all` on CfT 156.0.8078.4. Today it comes from
    `storage.googleapis.com/chrome-for-testing-public`; the layout is ready at
    `scratchpad/ci-design/pwr/browsers/ms-playwright`, 676 MB. M7 proved Google's 141 build byte-identical to
    Playwright's own. `playwright install` replaces the hand layout once the two hosts are allowed (section 6).
  - All seven are committed, and a person inspects them (A9).
  - `apps/web/e2e/browser.json` (new) records the version, revision 1248 and the headless shell's SHA-256.
  - ci.yml's install step in `unit`, `db` and `e2e` prints `chrome-headless-shell --version` and its SHA-256, and
    **fails** when it differs from `browser.json`. The baselines are then known to be compared on the build that made
    them. That is ADR 0058's premise, which a print alone only suggests.
    - **The deliberate red.** Every `browser-tests` bump brings a new Chrome for Testing build, so its SHA differs and
      that PR fails here by construction until a person runs ADR 0058's procedure. That is the one exception to A4 (c),
      declared in A4, CI-12, CI-18 and `docs/runbooks/ci.md`. The check is kept, because a new browser under unchanged
      baselines is exactly what ADR 0058 forbids.
    - The failing message reads: "The headless shell is <found version> (revision <found>, SHA-256 <found>), and
      browser.json records <expected version> (revision <expected>, SHA-256 <expected>). A Playwright upgrade needs ADR
      0058's baseline procedure: docs/runbooks/ci.md, 'Upgrading the browser'."
  - **The baselines proved on CI's runner.** A9's no-op regeneration is local, and the local host is Ubuntu 24.04.5
    ([S3] §4), while CI compares on ubuntu-26.04. [S3] M8 varied fontconfig on one host only. So ci.yml's `e2e (1/M)` job
    gains the baseline step:
    - it runs when the PR's diff against the merge base, or a push's against `<before>`, touches `browser.json`,
      `brand.spec.ts` or `brand.spec.ts-snapshots/**`. Otherwise it prints "no baseline change" and passes, so no
      required job is ever skipped;
    - it runs `pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots=all` on the runner, then
      `git diff --exit-code -- apps/web/e2e/brand.spec.ts-snapshots`, and prints the seven files' SHA-256s;
    - on a difference it fails, and prints each changed picture as a `path base64` line in the format of
      `ci.yml:103-108`, so the person can commit CI's bytes and inspect them;
    - the ci-browser PR records the passing run, with its seven SHA-256s, as ADR 0058's proof that CI renders the
      committed bytes.

    The design's label-gated step is dropped: no `regenerate-baselines` label exists
    (`gh api repos/PureTideWater/PhysicalTherapy/labels`), and a diff trigger needs no one to remember a label.
  - If CI's download differs from Google's bucket (unproven for 156, [S3] risk), the `browser.json` check fails on the
    first run. `browser.json` then takes CI's SHA, and the baseline step's output gives the seven pictures as CI renders
    them.
  - The worker image's headless shell SHA-256 is printed in the `images` job too.
- **Runners**, by F5's answer:
  - **Under F5's recommended answer** (keep the release's capacity chain on ubuntu-24.04 for now), these jobs stay on
    `RELEASE_RUNNER.label`, which stays `ubuntu-24.04` (`tools/screening-capacity/launch-check.ts:104`):
    - `release.yml`'s `build`, `capacity`, `push` and `report`;
    - `release-dry-run.yml`'s `build` and `push` (they exercise the release's own steps on its own runner);
    - `screening-capacity.yml`'s `capacity` (the PR measurement that predicts the release's).

    Every other job moves to `ubuntu-26.04`.
  - **Under F5 (a)** (move now, with the store-independent binding): every job moves to `ubuntu-26.04`, the named set is
    empty, and `RELEASE_RUNNER.label` becomes `ubuntu-26.04` in the same commit, so the launch check accepts only reports
    from that runner.
  - **Under F5 (b)** (move now, without it): the same `runs-on` as (a), and the binding stays today's
    `docker image inspect .Id`.
  - `workflows.test.ts:160-171` becomes: every job is on 26.04 but the named set, and each job of the set is on
    `RELEASE_RUNNER.label`. It still refuses `-latest` labels, unversioned labels and larger runners.
  - The 26.04 image runs Docker 29.4.2, Compose 5.1.3 and PostgreSQL 18.6 (Ubuntu2604-Readme, image 20261023.163.3,
    checked). Its `pg_dump` 18 makes the restore drill run instead of skip ([S3] §1).
- **An image binding that holds under either image store.**
  - Today `release.yml:107, 228` and the harness record `docker image inspect -f '{{.Id}}'`. That is the config digest
    only under the classic overlay2 store. Docker 29's fresh-install default is the containerd store
    (docs.docker.com/engine/storage/containerd), and a weekly rebuild of the 24.04 image could bring Docker 29 there
    too.
  - `tools/screening-capacity/image-id.ts` (new) reads the config digest from `docker save` output: a docker-archive
    `manifest.json` `Config`, or OCI `index.json`, then the manifest, then `config.digest`.
  - It is a pure parser, tested on synthetic JSON for both layouts. It imports only `node:` modules, so Node 24 runs it
    directly with its built-in type stripping (`node tools/screening-capacity/image-id.ts <tarball>`), with no install.
    A test holds it to `node:` imports only.
  - **Where it runs, and where it does not.** The push job holds `packages: write` and today runs only download-artifact,
    login and docker (`release.yml:202-237`). The report job's rule is "nothing but the attestation action and gh, never
    the code it measured" (`:244-245`). Neither runs repository code:
    - `build` (which already checks out and builds): after `docker save | gzip`, it writes the tarball's SHA-256
      (`sha256sum`) to `<image>.tar.sha256` and the config digest from `image-id.ts` to `<image>.id`, and uploads both
      with the tarball. It uses `setup-node` with no cache (the release rule, §3.2.1) and no `pnpm install`;
    - `capacity` (which runs the harness anyway): `sha256sum -c` on each tarball before `docker load`; the harness reads
      the config digest with `image-id.ts`;
    - `push`: `sha256sum -c` on each tarball before `docker load`, which is store-independent and runs no repository
      code. It then tags and pushes, and prints the recorded config digest;
    - `report`: unchanged.
  - A `workflows.test.ts` rule: release.yml's `push` and `report` jobs (and the dry run's `push`) have no checkout, no
    setup-node, and no step whose `run` invokes `pnpm`, `tsx` or `node`.
  - The harness's local and PR runs use `image-id.ts` through `containers.ts`.
  - The report records `ImageOS`, `ImageVersion` and the storage driver, with the format bumped to the next free
    number. `launchCheck()` refuses a binding report whose `ImageOS` is not `RELEASE_RUNNER`'s.
- **A 26.04 probe for F5.** `screening-capacity.yml` gains a `workflow_dispatch` input, `runner` (`ubuntu-24.04` or
  `ubuntu-26.04`), always advisory. Under F1 (a) the founder's later move rests on one dispatched 26.04 measurement and
  its `docker info`, recorded on issue #41. Under F1 (b) dispatch needs the default branch, so the probe is one draft
  push of the PR with the label changed, reverted before review.

#### 3.3.2 Files

- **Browser and app:**
  - `apps/web/package.json`, `apps/worker/package.json`, `tools/package.json`, `pnpm-lock.yaml`;
  - `apps/worker/Dockerfile`;
  - `apps/web/src/components/shell.tsx`;
  - `apps/web/e2e/brand.spec.ts`, the seven `apps/web/e2e/brand.spec.ts-snapshots/*-chromium-linux.png`, and
    `apps/web/e2e/browser.json`;
  - `tools/test/browser-version.test.ts`;
  - `tools/screening-capacity/measure.test.ts` (`:232`, and any case P2's binding needs, written by P1).
- **Runners and binding:**
  - every workflow's `runs-on` (`release-dry-run.yml` included); ci.yml's install, SHA and baseline steps;
  - `screening-capacity.yml`'s dispatch input;
  - `release.yml`'s and `release-dry-run.yml`'s identity steps (build: SHA-256 and config digest; capacity and push:
    `sha256sum -c`);
  - `tools/test/workflows.test.ts`;
  - `tools/screening-capacity/{image-id.ts (new), containers.ts, run.ts, report.ts, launch-check.ts}` and their tests
    (`image-id.test.ts`, `report.test.ts`, `launch-check.test.ts`), and `test-support/measurements.ts` if the report's
    new fields need it (#42 also edits it, §5).
- **Documents:**
  - ADR 0058 amendment: the baseline line becomes "CfT headless shell 156.0.8078.4 for 1.64.1, on ubuntu-26.04 in CI";
    the switches' claim becomes M8's measurements; the regenerate command gains `=all`; the `browser.json` check is
    added, with its deliberate red on a browser bump; the baseline step on CI's runner becomes the proof of the
    committed bytes;
  - ADR 0062 amendment: the store-independent binding, the runner image in the report, F5's ruling;
  - ADR 0066 Part 3;
  - `docs/runbooks/screening-capacity.md:464` (no version literal);
  - `docs/runbooks/ci.md` (the baseline procedure, "Upgrading the browser": what the red `browser.json` check means,
    regenerating, reading the baseline step's pictures, the inspection);
  - reconciliation-001 (F5 recorded; its `:529` capacity line if it changes);
  - `docs/product/test-matrix.md` and the synth registry, CI-18 to CI-20.

#### 3.3.3 Tests

- `browser-version.test.ts`: it fails first on 1.56.1 against the Dockerfile literal, the gap [S3] found in #38, where
  `apps/worker/package.json` moved and the image did not.
- `brand.spec.ts`'s computed name check: it fails first on today's labels.
- `workflows.test.ts`: runners, by F5's answer; the `browser.json` step and its message; the baseline step's diff
  trigger, `git diff --exit-code` and SHA print; the dispatch input; the push and report jobs run no repository code
  (no checkout, setup-node, `pnpm`, `tsx` or `node`); `sha256sum -c` precedes every `docker load` in release.yml.
- `image-id.test.ts`: both layouts, a multi-platform index resolved to linux/amd64, and a missing config, which fails;
  the module imports only `node:` modules.
- `launch-check.test.ts`: a report from another image is refused.
- `report.test.ts`: the new fields.

#### 3.3.4 Acceptance

1. Fresh clone, scope and freeze, as before.
2. `pnpm exec vitest run tools/test tools/screening-capacity`.
3. With `PLAYWRIGHT_BROWSERS_PATH` set to the CfT 156 layout, or after `playwright install` once the hosts are allowed,
   and an e2e database named `tp_laneb_<name>_e2e`:
   - `pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots=all`; then `git status` is clean;
   - `sha256sum` of the shell equals `browser.json`;
   - the 11 specs [S3] M9 lists pass with `--workers=2 --retries=0`, about 6 minutes.
4. **CI:**
   - all 26.04 except the named set of F5's answer (A8);
   - e2e passes, the brand journey included, with the shell SHA check passing;
   - the baseline step ran on ubuntu-26.04 (the PR changes the snapshots), `git diff --exit-code` passed, and its seven
     SHA-256s equal `sha256sum apps/web/e2e/brand.spec.ts-snapshots/*.png` at the head;
   - the restore drill runs, not skipped;
   - images, capacity and `release-dry-run` pass, the dry run with the SHA-256 check and the config digest.
5. **The PR description:** the pixel counts, the crop, the person's inspection, and the link to the baseline step's
   run on ubuntu-26.04.

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
| CI-18 | One browser build everywhere | The web tests, the worker, the tools, the lockfile and the worker image name one Playwright version; CI's headless shell is the baselines' build, and CI regenerates the baselines byte for byte when they change; a browser-tests PR is red on the browser build check by design, until the baseline procedure runs (moved from CI-12, §3.2.7) | ci-browser |
| CI-19 | Header controls named by their visible text | Each header control's accessible name contains its visible text (WCAG 2.5.3); axe finds no violation | ci-browser |
| CI-20 | Runner images | Every job on ubuntu-26.04 but the release's capacity chain on the release runner; the release binds images by config digest under either image store, and its push and report jobs run no repository code | ci-browser |

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
