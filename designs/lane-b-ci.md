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
     #38 except the browser packages, and #33): every action and image pinned, pnpm without its 23 advisories, a
     Dependabot configuration whose pull requests are green unless something is really incompatible, a release
     workflow that restores no cache, and a dry run that exercises the release's actions on every change to it.
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
| A4 | Dependabot PRs green by construction | (a) A unit test applies a simulated Dependabot rewrite to every action pin and image digest, and every workflow assertion in `workflows.test.ts` and `dependabot-config.test.ts` still passes on the rewritten text. (b) No version is duplicated outside a manifest: the worker image's playwright-core and both images' pnpm are derived. (c) After the merge, the first Dependabot batch is red only where a test names a real incompatibility. **The one deliberate exception:** a `browser-tests` PR is red on the `browser.json` check until a person runs ADR 0058's baseline procedure, and the failing step's message names that procedure, the expected revision and the found one (CI-12, CI-18, `docs/runbooks/ci.md`) | (a) and (b) in `tools/test`; (c) read on the first weekly batch's checks | ci-deps (and ci-browser for Playwright) |
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

#### 3.2.1 What changes

- **Every action pinned, at its latest release.** Each `uses:` becomes `owner/repo@<sha> # vX.Y.Z` in every workflow.
  Latest tags, checked with `git ls-remote --tags` on 2026-10-24:

  | Action | Version |
  |---|---|
  | `actions/checkout` | v7.0.1 |
  | `actions/setup-node` | v7.1.0 |
  | `pnpm/action-setup` | v6.1.0 |
  | `actions/setup-python` | v7.1.0 |
  | `actions/upload-artifact` | v7.0.2 |
  | `actions/download-artifact` | v8.0.2 |
  | `actions/cache` and its `restore` and `save` | v6.1.0 |
  | `docker/setup-buildx-action` | v4.4.1 |
  | `docker/build-push-action` | v7.4.0 |
  | `docker/login-action` | v4.7.0 |
  | `aquasecurity/trivy-action` | v0.36.0 (kept) |
  | `actions/attest-build-provenance` | v4.2.2 (kept) |

  The builder resolves each peeled SHA (`refs/tags/vX.Y.Z^{}`). [S4] §2 checked #40's breaking changes against our
  usage. `publish-content.yml` is pinned only under F4 = yes, and then held to its frozen copy (F4).
- **`workflows.test.ts` pin rules**, replacing `PINNED` (`:46-58`) and every literal ref (`:404, :423, :719`, the
  `PINNED.*` uses):
  - (a) the form, over all workflow files;
  - (b) one SHA and one version per action across files;
  - (c) behaviour asserts match by action name;
  - (d) the **simulated Dependabot rewrite**: every pin and every image digest replaced in memory by another
    well-formed one, with the workflow assertions re-run (A4a).
- **`tools/check-action-pins`** (new; networked; runs in `static`). For each distinct pin it checks three things:
  - `git ls-remote https://github.com/<owner>/<repo> refs/tags/vX.Y.Z refs/tags/vX.Y.Z^{}` gives the pinned SHA;
  - every `with:` key used is an input declared in `action.yml`/`action.yaml` at that SHA (raw.githubusercontent.com),
    and every required input with no default is given;
  - when the action is `runs.using: composite`, every `uses:` among its steps is a full 40-hex SHA, and the check
    recurses into each at that SHA. A nested tag or branch ref fails, naming the chain. It also lists each nested
    `actions/cache*` use with the input that gates it (`trivy-action`'s `cache`, `setup-trivy`'s `cache`), which the
    release rule below reads.

  Read at the pinned commits on 2026-10-25, the nested refs are all SHAs today: trivy-action v0.36.0 pins
  `aquasecurity/setup-trivy@3fb12ec…` and `actions/cache@27d5ce7…`; setup-trivy pins `actions/cache/restore@9255dc7…`
  and `actions/checkout@8e8c483…`; attest-build-provenance v4.2.2 pins `actions/attest@508db95…`, a node action.

  It fails closed after three tries with backoff. Its unit tests use recorded synthetic `ls-remote` lines and action
  files, including a composite with a nested tag ref, which fails. The input check reaches `release.yml`'s tag-only
  actions (login v4, download-artifact v8), and `release-dry-run.yml` (below) runs them: risk R1 of [S4], closed.
- **`release.yml` restores no cache, whatever F1's answer.** Today its capacity job restores the pnpm store
  (`release.yml:153-156`, `setup-node … cache: pnpm`) and the scale release (`:159-169`, `actions/cache/restore` of
  `screening-scale-release-<hash>`). Its `trivy-action` steps default to `cache: 'true'`, which restores the
  Trivy binary (through setup-trivy's `actions/cache/restore`) and its database (`actions/cache`, restore key
  `cache-trivy-`) (trivy-action v0.36.0 `action.yaml:102-146`, read at its pinned SHA; the steps are `release.yml:75-91`).
  - A tag run may restore caches created on the default branch ("Workflow runs can restore caches created in either the
    current branch or the default branch", github/docs `content/actions/reference/workflows-and-actions/dependency-caching.md`,
    "Restrictions for accessing a cache"). Today the default branch is `main` (`gh api repos/PureTideWater/PhysicalTherapy`:
    `default_branch: main`), which runs no workflow, so nothing is restored. Under F1 (a) the build branch's push runs
    would seed all of these. `screening-capacity.yml:29-30` is a push trigger, and its save at `:192-197` has no event
    condition.
  - The binding, attested measurement (decision 13) could then run on a scale release built in another run. Its key
    hashes only `packages/synth/src/release/**`, `tools/release/scale.ts`, `packages/rules/src/**` and release
    900001's directory, not the lockfile or the generator's other imports, so a hit can serve a release built by
    different code. The scanner binary and its database would come from another run too.
  - So in ci-deps: the restore step goes and the scale release is always built in-run (22 s on a miss: the push run
    39977565861's "Build the scale release", 15:24:36-15:24:58). `setup-node` takes no `cache` and sets
    `package-manager-cache: false` (an input of setup-node v7.1.0). `pnpm/action-setup` keeps `cache: false` (its v6.1.0
    default). Every `trivy-action` step sets `cache: 'false'`. `setup-buildx-action` sets `cache-binary: false`
    (default `true` in v4.4.1). No `build-push-action` step gets `cache-from` or `cache-to`.
  - A `workflows.test.ts` rule holds release.yml to it: no `actions/cache*` step; no setup-node `cache`, and
    `package-manager-cache: false`; no buildx `cache-from` or `cache-to`; and every action that `check-action-pins`
    reports as gating a nested cache sets that input to `false`. The attested report then depends only on its own run.
    ADR 0062 records it (Part 2 of ADR 0066 gives the reason).
- **`.github/workflows/release-dry-run.yml`** (new). Only a tag runs `release.yml`, and only the founder creates tags,
  so its new majors (upload-artifact v7, download-artifact v8, login-action v4, build-push-action v7, setup-buildx v4)
  would otherwise first run on the founder's tag. No tag exists yet (`gh api repos/PureTideWater/PhysicalTherapy/tags`:
  0), so release.yml has never run at all. Input validation does not prove runtime behaviour.
  - Triggers: `pull_request` and `push` on `claude/build-platform`, with paths `.github/workflows/release.yml`,
    `.github/workflows/release-dry-run.yml`, `tools/screening-capacity/image-id.ts` (ci-browser) and both Dockerfiles.
    It is advisory, not a required check, so its path filter can never leave a required check pending.
  - `build` job (`contents: read`): checkout; setup-buildx; build the `web` image with `load: true`; `docker save | gzip`;
    record the image's identity as release.yml then does (in ci-deps the `.Id`; from ci-browser on, the tarball's
    SHA-256 and the config digest, §3.3.1); upload `image-web` (v7, `overwrite: true`, retention 1 day).
  - `push` job (needs build; `contents: read`, `packages: read`): download with `pattern: image-*` and
    `merge-multiple: true` (v8); the same identity check as release.yml's push job; `docker load`;
    `docker/login-action` to ghcr.io with the job's `GITHUB_TOKEN`. It never tags, pushes or attests, and holds no
    `packages: write`, `id-token` or `attestations` permission.
  - A `workflows.test.ts` rule holds every step the dry run shares with release.yml (the same action, or the same `run`
    text with only the image list and the push lines removed) equal in `uses:` and `with:` keys, so the dry run cannot
    drift from what the tag runs.
- **Images by digest from one source:**
  - Both Dockerfiles: `FROM node:24-trixie-slim@sha256:43b9ba11…` (index digest, Hub API, 2026-10-24). That leaves
    Debian 12 bookworm, which is what `24-slim` is today (same digest `sha256:55fb5f5a…` as `24-bookworm-slim`, checked).
  - `docker-compose.yml`: `postgres:18-trixie@sha256:<digest>`, resolved at build.
  - Every CI job that needs Postgres (ci.yml's, `large-zip.yml`'s, and any later one) starts it from the compose file
    instead of a `services:` block. The compose file is then the only Postgres reference Dependabot's docker-compose
    ecosystem updates, and CI follows it by construction.
    - `docker compose up --wait` blocks until the service is healthy, and `--detach` alone still pulls first. So the
      first step, before install, runs it in the background:
      `docker compose up --detach --wait postgres > "$RUNNER_TEMP/postgres-up.log" 2>&1 &`. The pull and start then
      overlap the install.
    - Just before the first database step, a loop polls for up to 120 s until the container's health is `healthy`
      (`docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q postgres)"`; `docker-compose.yml:15-19`
      defines the `pg_isready` healthcheck). It polls instead of issuing a second `up`, which could race the first. On a
      timeout the step prints the background log and fails.
  - `tools/screening-capacity/containers.ts:223, 344, 509` and `measure.test.ts:181` read the image from the compose
    file through one tested function.
  - Rejected: a job output feeding `services:` (an extra job on the critical path), and an equality test across copies
    (red by construction, [S4] §6).
- **MinIO removed, not replaced.**
  - `minio/minio` no longer exists on Docker Hub (`hub.docker.com/v2/repositories/minio/minio/` returns "object not
    found", checked 2026-10-24), so `pnpm dev`'s `docker compose up --wait` fails on a fresh machine.
  - Nothing connects to it. The dev and e2e document store is local (`apps/web/src/lib/server/config.ts:242-252`), and
    no S3 endpoint override exists in `apps/`, `packages/` or `tools/` (grep for `endpoint`/`forcePathStyle`/`S3_ENDPOINT`).
  - A replacement (RustFS, SeaweedFS) would be a maintained dependency that nothing exercises. Testing the S3 path
    (presigned PUT, Object Lock COMPLIANCE, multipart) belongs on AWS staging, in infrastructure PR (b) or (c), where the
    real bucket policy and KMS live (open item O4).
  - Wording follows in `tools/dev.ts:11-22`, `README.md:37`, `CLAUDE.md:31`, `PRD.md:645`, the
    `infra/lib/environments.ts:4` comment and `docs/product/diagrams/architecture.svg`.
- **pnpm 10.34.8:**
  - It fixes all 23 of 10.28.0's advisories (npm bulk advisory endpoint, [S4] §9). It writes `libc:` fields on a fresh
    resolution ([S3] M2), but **not** into existing lockfile entries on a plain `install --lockfile-only`.
  - Why 10 and not 12.15.0 (`npm view pnpm dist-tags`: latest 12.15.0, latest-11 11.28.8, latest-10 10.34.8): Dependabot
    supports pnpm "v7, v8, v9, v10" (github/docs `data/reusables/dependabot/supported-package-managers.md:44`). A lockfile
    from 11 or 12 would leave Dependabot unable to update it. ADR 0066 and `dependency-upgrades.md` record the reason and
    the trigger for moving: GitHub listing pnpm 11 or later there. Until then, the latest 10.x.
  - `packageManager` moves to it. Both Dockerfiles derive their pnpm from it after `COPY package.json`.
  - **The licence fix is its own first commit, alone:** `packageManager` set to `pnpm@10.34.8`, then
    `pnpm install --lockfile-only --fix-lockfile` under 10.34.8. Measured at 49514e8 (`scratchpad/reviser-tools/`):
    - a plain `install --lockfile-only` gives 3 `libc:` lines before and after, no diff, and
      `@img/sharp-libvips-linuxmusl-x64@1.3.4` still has no `libc`;
    - `--fix-lockfile` gives 46 `libc:` lines. The diff is 43 insertions and 0 deletions, all `libc: [glibc]` (27) or
      `libc: [musl]` (16) (`fix-lockfile.diff`, matching [R]'s);
    - `pnpm licenses list --prod --json` under 10.34.8 then lists no `linuxmusl` package. It listed
      `@img/sharp-libvips-linuxmusl-x64` before (`lic-orig.json`, `lic-fixed.json`).

    The commit's lockfile diff must be exactly those `libc:` lines, and the PR description carries the measured
    `git diff --numstat` and the line counts. The version bumps come in later commits, each with its own lockfile diff.
  - The `@img/sharp-libvips-linuxmusl-x64` exception is removed from `tools/check-licenses/allowlist.json` in the same
    first commit.
  - A new `check.test.ts` case requires every lockfile entry whose name marks musl (`linuxmusl`, or a `-musl` suffix:
    the 16 above, sharp's, `@next/swc`'s, lightningcss's, rolldown's, tailwind oxide's and `@napi-rs/canvas`'s) to carry
    `libc: [musl]`. Its message names the cause (an entry written before pnpm wrote libc fields) and the remedy
    (`pnpm install --lockfile-only --fix-lockfile`).
- **npm versions taken:**
  - vitest and @vitest/coverage-v8 5.0.5 (catalog);
  - eslint 10.13.0;
  - postcss 8.5.31;
  - next and @next/eslint-plugin-next 16.4.3 (`npm view … dist-tags.latest`, 2026-10-24);
  - a lockfile refresh of qs to at least 6.16.0 and fast-uri to at least 3.1.9 ([S4] §5).

  Not taken:
  - Playwright and axe go to ci-browser.
  - The Anthropic SDK goes to its own group and a deliberate PR that passes the evaluation gate.
  - TypeScript 7.0.2: typescript-eslint 8.72.0 declares `<6.1.0`.
  - @types/node 26 and the Node 26 images wait for a planned Node 26 PR: Node 26 is LTS from 2026-10-28 (nodejs/Release
    `schedule.json`).
  - Node 25 (#33) is end of life since 2026-06-01.
- **Audit and toolchain:**
  - `pnpm audit --prod` stays, and `pnpm audit --audit-level=high` is added.
  - `tools/check-toolchain` (new; networked):
    - checks `packageManager`'s pnpm against the bulk advisory endpoint (moderate or worse fails);
    - checks that neither Dockerfile carries a pnpm literal;
    - keeps the audit exceptions in `tools/check-toolchain/audit-exceptions.json` (`ghsa`, reason, added, expires),
      equal to `pnpm-workspace.yaml`'s `auditConfig.ignoreGhsas`. An entry older than 30 days fails. The list is empty
      today.
  - `pnpm-workspace.yaml` adds:
    - `trustPolicy: no-downgrade`;
    - `minimumReleaseAge: 4320`, three days, equal to the shortest Dependabot cooldown, **subject to F2 (b)**: it is a
      security trade-off, so the founder's (LANES.md:38). It applies to every resolution, transitive packages and
      Dependabot's own lockfile updates included ("This applies to all dependencies, including transitive ones",
      pnpm.io `docs/settings/dependency-resolution.md`, "minimumReleaseAge"; [S4] §9 and its R4). So a security fix
      published less than three days ago cannot enter the lockfile, by Dependabot or by hand, until a person adds a
      dated exclude;
    - `minimumReleaseAgeExclude: []`. An exclude names the exact fixed version (`pkg@1.2.3`, the form pnpm accepts since
      10.19.0, same page), never a bare package name, and `tools/check-toolchain/release-age-exceptions.json` holds each
      entry with its advisory, reason, date and an expiry of at most 7 days. `check-toolchain` fails when the two lists
      differ or an entry has expired. The runbook's step covers it.
  - The builder confirms pnpm 10.34.8's behaviour on a frozen install, and that Dependabot's lockfile updater runs
    within it (O3). The release-age and trust settings land in the commit after the version bumps, and every bumped
    version must already be three days old then (next 16.4.3 from 2026-10-26T13:40Z, Stryker 10.1.1 from
    2026-10-26T19:18Z; N5).
- **`.github/dependabot.yml`:**
  - The config from [S4] §7:
    - npm weekly on Monday, github-actions weekly on Tuesday, and the `container-images` group weekly on Wednesday, each
      at a jittered minute (04:31, 04:37, 04:43 UTC), so one day's batch is at most the npm groups (load plan below);
    - npm with an 8-PR limit;
    - cooldown 7 days by default, 14 for majors, 7 for minors and 3 for patches;
    - semver-major ignored for `@types/node`, `typescript`, `next`, `@next/eslint-plugin-next` and `pg-boss`;
    - groups in this order: `browser-tests` (`@playwright/test`, `playwright`, `playwright-core`,
      `@axe-core/playwright`, `axe-core`), `anthropic-sdk`, `pg-boss`, `next`, `aws-sdk`, `aws-cdk`, `minor-and-patch`,
      and `security` (`applies-to: security-updates`);
    - actions grouped;
    - `docker` (both directories, node majors ignored) and a new `docker-compose` entry (postgres majors ignored) in one
      multi-ecosystem group, `container-images`, with `patterns` on each entry, as the how-to requires
      (github/docs `configuring-multi-ecosystem-updates.md`, "Troubleshooting").
  - Under F1 (b), every entry gains `target-branch: claude/build-platform`, and §3.2.4 applies.
  - `tools/test/dependabot-config.test.ts` (new) replaces the `describe('dependabot')` block (`workflows.test.ts:766-790`).
    It asserts the ignores, the group order, one entry per ecosystem in use, a docker-compose entry while
    `docker-compose.yml` exists, and three distinct schedule days.
  - **The weekly batch's load (a plan, not a hope).** GitHub Free runs 20 jobs at once per account (O1), shared by both
    lanes.
    - Measured: Dependabot's actions PR #40 (head `dependabot/github_actions/claude/build-platform/actions-e4ecb2e43d`)
      ran a 15:40 capacity job (run 39978142533), because it edits `screening-capacity.yml`, a watched path
      (`watched-paths.txt:4`). Every npm PR edits `pnpm-lock.yaml` (`:20`), also watched.
    - Estimate per npm PR: ci.yml 43-48 runner-minutes at a peak of about 11 jobs at once, capacity about 16, and
      mutation either about 1 (no money closure touched) or 45-55 (a full run, [S2] §5).
    - Without §3.4.1's closure rule (the first draft's "the lockfile gives all"), every npm PR runs mutation in full:
      about 120 runner-minutes
      per PR and about 1,000 for an 8-PR Monday, which holds the account's slots for about an hour.
    - With it, an npm PR that moves no package in a money closure costs about 60: five of the eight groups (§3.4.1).
      `aws-sdk` (pricing and packets, five shards) and `minor-and-patch` (usually all six) cost about 100-110. The
      Monday batch is then about 550-600 runner-minutes and saturates the 20 slots for about 30 minutes. A lane's PR
      pushed then waits that long for its first jobs.
    - Staggering the three ecosystems keeps Tuesday's and Wednesday's batches to one PR each.
    - If the repository goes private: about 10 bot PRs a week at about 80-95 billed minutes each (2-vCPU runners, [S1]
      §9), about 3,500-4,000 billed minutes a month, and about double that without the closure rule. It joins §9's
      cost row for the founder's decision to go private.
    - **Not used: one shared concurrency group for bot runs.** By default a group holds one running and one pending
      run, and a newer pending run cancels the older one (github/docs `data/reusables/actions/actions-group-concurrency.md`),
      so a shared group would cancel most of a batch. `queue: max` lets up to 100 runs wait (same file;
      `data/features/actions-nga.yml` lists `fpt: '*'`). But actionlint, which `workflows.test.ts:733-740` runs and
      whose configuration file it forbids (`:168-171`), refuses the key: `unexpected key "queue" for "concurrency"
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
  - pnpm itself;
  - base images;
  - transitive packages;
  - the PostgreSQL major;
  - stored ignores (`@dependabot show/unignore`);
  - the `minimumReleaseAgeExclude` step for a young security fix (F2 (b)): the exact version, its advisory and an
    expiry of at most 7 days, in both lists;
  - a `browser-tests` PR, red by design on the `browser.json` check until ADR 0058's procedure runs (A4).

#### 3.2.2 Files

- **Workflows and the pin rules:**
  - every `.github/workflows/*.yml` (`publish-content.yml` only under F4 = yes), `release.yml`'s cache removal and
    `large-zip.yml`'s compose step included;
  - `.github/workflows/release-dry-run.yml` (new);
  - `.github/dependabot.yml`;
  - `tools/test/workflows.test.ts`;
  - `tools/test/dependabot-config.test.ts`;
  - `tools/test/frozen/publish-content.yml` (new, under F4 = yes: the file at 49514e8, the reference for its frozen
    lines);
  - `tools/check-action-pins/**`;
  - `packages/compliance/src/controls.ts` (any changed step strings).
- **The toolchain:**
  - `package.json` (`packageManager`, devDependencies);
  - `pnpm-workspace.yaml`;
  - `pnpm-lock.yaml`;
  - `apps/web/package.json`;
  - `apps/web/Dockerfile` and `apps/worker/Dockerfile`;
  - `tools/check-licenses/{allowlist.json, check.test.ts}`;
  - `tools/check-toolchain/**`;
  - `docker-compose.yml`;
  - `tools/dev.ts`;
  - `tools/screening-capacity/{containers.ts, measure.test.ts, watched-paths.txt}` (the last regenerated with
    `pnpm exec tsx tools/screening-capacity/watched.ts --write`).
- **Documents:**
  - ADR 0066 Part 2;
  - ADR 0063 amendment (F1; the template line; the pin policy);
  - `docs/runbooks/{dependency-upgrades.md (new), github-governance.md, ci.md}`;
  - `CLAUDE.md:31` (MinIO), and its template line under F1 (a);
  - `README.md` (pnpm version, dev services);
  - `docs/product/PRD.md:645`;
  - `infra/lib/environments.ts:4`;
  - `docs/product/diagrams/architecture.svg`;
  - `docs/product/reconciliation-001.md` (the F4 exception, F1 and F2 recorded with their dates);
  - ADR 0062 amendment: release.yml restores no cache, so the attested report depends only on its own run.
- **Test matrix and synthetic cases:**
  - `docs/product/test-matrix.md`;
  - `packages/synth/src/cases/{matrix,registry}.ts`;
  - `fixtures/synthetic/CI-11…CI-14/expected.json`.

#### 3.2.3 Tests

These are failing first where they replace a rule that made Dependabot red:
- `workflows.test.ts`:
  - (a) to (d) above;
  - no job declares `services:`; every Postgres job starts the compose service in the background before install and
    waits for it before any `DATABASE_URL` step;
  - the release rule: release.yml restores no cache (no `actions/cache*`, no setup-node `cache`,
    `package-manager-cache: false`, no buildx `cache-from` or `cache-to`, and `cache: 'false'` or `cache-binary: false`
    on every action that gates a nested cache). It fails first on today's release.yml;
  - the dry run: release-dry-run.yml's shared steps equal release.yml's, and it holds no `packages: write`,
    `id-token` or `attestations` permission and no `docker push` or attest step;
  - under F4 = yes, the frozen-copy rule: `publish-content.yml` equals `tools/test/frozen/publish-content.yml` once
    both are normalised (each `uses: owner/repo@<ref> # <comment>` reduced to `uses: owner/repo`, and the one-time
    `runs-on` and `timeout-minutes` lines set aside). A Dependabot pin bump passes; any other edit fails.
- `dependabot-config.test.ts`.
- `tools/check-action-pins/*.test.ts`: a composite action with a nested tag ref fails; the nested cache report.
- `tools/check-toolchain/*.test.ts`: an advisory hit, a Dockerfile literal, an expired audit exception, a release-age
  exclude that is a bare package name, and an expired or unlisted release-age exclude, each failing.
- `tools/check-licenses/check.test.ts`: the libc rule.
- `tools/screening-capacity/measure.test.ts`: the Postgres image read from compose.
- `tools/test/no-duplicated-versions.test.ts` (new): no version or digest is written outside its manifest or source of
  record (Dockerfiles for node, compose for postgres, `packageManager` for pnpm, `apps/worker/package.json` for the
  worker's playwright-core once ci-browser adds it). This is A4 (b).

#### 3.2.4 Under F1 (b) only

- The PR into main is separate and opened only on the founder's ruling (the #27 precedent). It carries the same YAML
  with every `target-branch` line kept, plus the new PR template.
- `tools/test/dependabot-config.test.ts` also asserts that the build branch's copy equals `origin/main`'s minus the
  `target-branch` lines (`fetch-depth: 0` already fetches `origin/main`).

#### 3.2.5 Acceptance

1. Fresh clone and scope, as in §3.1.7. No migration and no `packages/pricing` change.
2. Networked checks, which pass from this machine (git and the registry are reachable):
   - `pnpm -s exec tsx tools/check-action-pins`;
   - `pnpm -s exec tsx tools/check-toolchain`.
3. `pnpm audit --prod`; `pnpm audit --audit-level=high`.
4. **The licence commit:** the PR's first commit changes only `package.json`'s `packageManager`, `allowlist.json`'s musl
   entry and `pnpm-lock.yaml`, and `git diff --numstat <mb> <first> -- pnpm-lock.yaml` is `43 0`, every added line
   `libc: [glibc]` or `libc: [musl]` (`git diff <mb> <first> -- pnpm-lock.yaml | grep '^+ ' | sort | uniq -c`).
   `pnpm licenses:check` then passes with no musl package listed.
5. `pnpm exec vitest run tools/test tools/check-action-pins tools/check-toolchain tools/check-licenses tools/screening-capacity`.
6. `grep -ri minio docker-compose.yml tools/dev.ts README.md CLAUDE.md` finds nothing.
7. `git diff <first> -- pnpm-lock.yaml`, after the licence commit, has a summary in the PR description: the named bumps,
   commit by commit, and nothing else unexplained.
8. **CI:**
   - `all green` (images built on trixie and scanned clean, Postgres from compose);
   - `screening-capacity gate` (the lockfile and Dockerfiles are watched): every correctness check passes;
   - `release-dry-run` green on the PR (it changes release.yml): the v7 upload, the v8 download with
     `merge-multiple`, the SHA-256 check, the load and the ghcr login all ran;
   - `approval-of-record`.
9. **After the merge**, under F1 (a): the Dependabot tab shows the config parsed. #40 and #38 are superseded, or rebased
   to what remains; the remaining browser group is red only on what ci-browser fixes. The PR records any Dependabot PR
   left open, with its reason.

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
| CI-12 | Dependabot's configuration | Groups in order, majors ignored for the Node image, its types, TypeScript, Next and pg-boss, cooldowns, staggered days, and an entry per ecosystem in use; a browser-tests PR is red on the browser build check by design, until the baseline procedure runs | ci-deps |
| CI-13 | Images pinned by digest from one source | Every base and service image carries a digest; CI and the capacity harness take Postgres from docker-compose.yml | ci-deps |
| CI-14 | A toolchain without known advisories | The pinned pnpm has no moderate or worse advisory; both images derive it; every musl package in the lockfile carries libc | ci-deps |
| CI-15 | The mutation canary | In every shard, each of its five cases reports its expected status before any score | ci-mutation |
| CI-16 | The mutation gate | Each fully-run money package above 85%, recorded equivalents still counted as survivors in the score, no survivor not recorded as equivalent, no runtime error but a test file's load failure | ci-mutation |
| CI-17 | Mutation where the money code changed | A push runs every package; a pull request runs exactly the packages whose closure (imports, data files, third-party packages) it changes, each package's shards all or none | ci-mutation |
| CI-18 | One browser build everywhere | The web tests, the worker, the tools, the lockfile and the worker image name one Playwright version; CI's headless shell is the baselines' build, and CI regenerates the baselines byte for byte when they change | ci-browser |
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
| ci-deps | **D1, workflows, pins and the release chain** | every line of every workflow file (ci.yml's new `static` steps, the Postgres steps, release.yml's cache removal and `large-zip.yml` included); `release-dry-run.yml` (new); `.github/dependabot.yml`; `tools/test/{workflows,dependabot-config,no-duplicated-versions}.test.ts`; `tools/test/frozen/publish-content.yml` (F4 = yes); `tools/check-action-pins/**`; `packages/compliance/src/controls.ts` | actionlint; tools/test; check-action-pins, live; compliance |
| | **D2, toolchain, lockfile and images** | `package.json`; `pnpm-workspace.yaml`; `pnpm-lock.yaml` (the licence commit first, alone); `apps/web/package.json`; both Dockerfiles; `docker-compose.yml`; `tools/dev.ts`; `tools/check-licenses/**`; `tools/check-toolchain/**`; `tools/screening-capacity/{containers.ts, measure.test.ts, watched-paths.txt}` | install frozen; audits; licences; check-toolchain, live; capacity unit; whole-repo typecheck and unit after the version bumps (vitest, eslint and next move) |
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
`…/pulls/42/files`, 2026-10-25). The ones the CI series also touches:

| File | #42's change | Our PR's change | Resolution (rule 6: the PR merged second resolves, keeping both) |
|---|---|---|---|
| `pnpm-lock.yaml`, `apps/web/package.json`, `apps/worker/package.json` | +`@aws-sdk/client-sesv2` (web), +`client-sqs` (worker), 33 lockfile lines | ci-deps (pnpm 10.34.8, the libc fields, bumps), ci-browser (Playwright), ci-mutation (Stryker) | Take the merged manifests. Start from the lockfile of the parent already on the build branch, then run `pnpm install --lockfile-only` with the then-pinned pnpm (10.34.8 once ci-deps is in), adding `--fix-lockfile` if the libc test names an entry, then `pnpm install --frozen-lockfile`. Check that the lockfile diff against each parent holds the other's entries. Never hand-merge lockfile hunks. Once ci-deps is in, `minimumReleaseAge` (if F2 (b) keeps it) and `trustPolicy: no-downgrade` apply to this re-resolve: a version younger than three days, or one whose trust evidence dropped, fails it. The remedy is the runbook's dated exclude, never removing the setting |
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
  - `minimumReleaseAge` (as F2 (b) is answered) and `trustPolicy: no-downgrade` apply to every re-resolve, #42's
    included;
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
therefore to apply it after ci-speed's first green push run. Until the ruleset exists, rule 6's "green CI on that head"
means `all green` plus the other three. Rule 6 already makes each PR merge the latest build branch in before merging,
so "require branches to be up to date" adds enforcement, not a new step, and its cost is the re-run F7 names.

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
| ci-deps | `minimumReleaseAge` blocks a young security fix | The founder's trade-off, F2 (b). The exact-version exclude, with its advisory and an expiry of at most 7 days, enforced by `check-toolchain` |
| ci-deps | The networked checks flake | Three tries with backoff, then fail closed, with the failing host named |
| ci-deps | Docker Hub rate limits (429 seen by [S4]) | Digests resolved once by the builder; CI's image build proves them |
| ci-deps | `multi-ecosystem-groups` merges parameters in ways not fully documented | The first Dependabot run after merge is read, and the PR's follow-up fixes the config |
| ci-deps | Under F1 (a), ignored majors also stop security updates | The alert still shows; the runbook says how to act |
| ci-deps | The weekly Dependabot batch fills the account's 20 job slots | Measured and estimated in §3.2.1: about 30 minutes of saturation on a Monday with the closure rule, about an hour without. Mitigated by the closure rule (five of eight npm groups measure no mutation), staggered days per ecosystem, and the bot queue time reported in `docs/runbooks/ci.md`; serialising bot runs waits for actionlint to accept `queue` (O13) |
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
  the builder records what 10.34.8 does when no version in range is old enough.
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
