# 0066. Run CI as parallel jobs behind one gate, measure mutation on every money package, move the browser and runner together, and pin every dependency

- **Status:** accepted, Part 1 (`co-001/ci-speed`, combined audit #109), Part 2 (`co-001/ci-deps`, #112, with #19's
  assert loosening, Dependabot groups and licence fix) and Part 4 (`co-001/ci-mutation`, #54). Part 3 is appended by
  the series' later pull request, `co-001/ci-browser` (#19's upgrade part). Part 1 amends
  [0010](0010-supply-chain-gates-beside-ci.md) (the image and licence gates run as ci.yml jobs under `all green`) and
  [0063](0063-protect-main-and-the-build-branch-make-the-founders-github-review-the-approval-of-record-open-each-approval-with-what-changed-and-switch-on-the-edit-hooks.md)
  (the required checks, the job that writes the domain model's summary, the per-job timeouts).
  - **Part 4** (`co-001/ci-mutation`, combined audit #54) amends
    [0064](0064-resolve-a-split-zips-locality-from-the-zip-plus-four-files-ranges-the-one-engine-change-the-freeze-allows.md)
    (mutation by path, not by label; Stryker 10.1.1 in place of 10.0.0 and its patch) and
    [0047](0047-read-narratives-as-they-show-refuse-the-cases-identifiers-bound-ledger-corrections-and-give-them-and-the-regulation-to-the-specialist.md)
    (the verifier's own configuration retired).
  - **Part 2** (`co-001/ci-deps`) amends
    [0062](0062-screen-prospects-from-aggregate-rows-without-phi-price-each-row-with-the-unchanged-engine-and-send-the-result-by-emailed-link.md)
    (the release restores no cache, so the attested capacity report depends only on its own run) and
    [0063](0063-protect-main-and-the-build-branch-make-the-founders-github-review-the-approval-of-record-open-each-approval-with-what-changed-and-switch-on-the-edit-hooks.md)
    (the build branch is the default branch until launch, the build branch's ruleset applied, every action pinned by
    SHA at its release).
- **Date:** 2026-10-25; Part 2 2026-10-26
- **Deciders:** the founder, Tyler Williams, who adopted the combined best-option audit in full on 2026-10-20 (items
  #19, #54, #109 and #112 among it, each placed "CI PR before PR 7"), under the standing rule of 2026-10-18; the build
  (Lane B), for the notices below, decided under that rule and each reversible by the founder
  - **Part 4:** item #54 of that audit, placed "CI PR before PR 7"; and the founder's ruling of 2026-10-25, relayed by
    the co-founder, that his adoption covers #54's 85% exit for milestone 6 and Gate 1 (the series' question F6).
  - **Part 2:** items #112 and #19 of that audit; the founder's rulings on the series' questions F1 (a), F2 (a) and
    (b), F4 and F7, relayed by the co-founder on 2026-10-25 at about 01:10 UTC, F7 applied that day at 21:14 UTC; and
    the co-founder's answers to CQ1, CQ2 and CQ3, each its recommended and safer option (2026-10-26, about 00:20 UTC),
    and to Q2 and Q3 (2026-10-25, about 21:05 UTC).
- **PRD sections:** 16 (dependency and image hygiene), 17 (milestone 0: "CI with every gate from section 18"), 18
  (continuous integration: "one workflow on every pull request"); Change Order 001, CO-02; reconciliation-001's checks;
  test matrix CI-01 to CI-10; ADRs 0010, 0058, 0062, 0063 and 0064
  - **Part 4:** 17 (milestone 6's check), 18 (the mutation layer and continuous integration); reconciliation-001's
    checks (the engine freeze, the ledger's additions-only rule, the milestones); test matrix CI-15 to CI-17; ADRs
    0047 and 0064.
  - **Part 2:** 15 (the dev environment), 16 (dependency and image hygiene), 18; reconciliation-001's content-pipeline
    check (F4's standing exception); test matrix CI-11 to CI-14; ADRs 0058, 0062 and 0063.

## Part 1 (`co-001/ci-speed`)

### Context

CI was one serial job, `check`, of 29 to 41 minutes (job 120636573742 took 29:09 on #42's head, job 120475009638
41:20 on #39's), and every pull request in both lanes waits on it in turn, often two to five times. Measured from those
two jobs' step times and logs:

- The database step was two thirds of it (15:40 and 23:54), and one file set its wall:
  `apps/web/src/lib/routes/route-tests.db.test.ts`, 865 to 1,336 s for about 6,900 tests. Its cost was building 688
  synthetic worlds one after another, two thirds of each world being three worker-thread reads of the same
  deterministic synthetic contract PDF (`readDocumentPages` starts a bounded Worker for every read); the 53-statement
  snapshot behind each persona's check was 8%.
- The next file was `apps/worker/src/screening/consumer.db.test.ts`, 206 to 227 s, nearly all of it SCR-19's
  kill-and-recover lease test (about 190 s).
- The end-to-end step built Next itself inside Playwright's web server (6:42 and 8:26); typecheck and lint ran one
  after another (2:18 and 3:08), lint in one process with an 8 GB heap a private repository's runner cannot hold.
- `supply-chain.yml` ran beside ci.yml because ci.yml was the plan's verbatim Starter kit file, not to be edited (ADR
  0010), so the documents named five required checks (`check`, the two image checks, `licenses` and
  `approval-of-record`), and the capacity runbook a sixth, `screening-capacity gate`. No ruleset exists yet
  (`gh api repos/PureTideWater/PhysicalTherapy/rulesets` returns `[]`), so renaming the checks breaks only text.
- The domain model's approval case lived in the database suite (`domain-model.db.test.ts`), so a schema pull request's
  whole database step was red until the founder signed, hiding any real database failure behind it.
- Six unit files, `report.db.test.ts` and `payer-copy.db.test.ts` skip in silence when Playwright's Chromium is
  missing; a sharded job that forgot the install would have lost them unnoticed. A flaky end-to-end test passed on its
  retry. No job ran on the build branch, so no pull request could restore a cache its base had saved.

### Decision (Part 1: `co-001/ci-speed`)

#### The job graph

`.github/workflows/ci.yml` runs on every pull request and on every push to `claude/build-platform`, with no path
filter, as these jobs (`docs/runbooks/ci.md` reads them):

| Job (its check) | Needs | What it runs | Timeout (min) |
| --- | --- | --- | --- |
| `static` | none | `pnpm audit --prod`; the secret scan; `pnpm check:fixtures`; `pnpm verify-content`; releases and prompts unchanged; the engine freeze (a pull request's); `pnpm synth --all` and its clean diff; `pnpm typecheck` over a restored cache; `pnpm lint:logs`; `pnpm test:golden`; the 10,000-claim PAR-29 remittance (`pnpm synth --large`) and `pnpm test:oracle`; `pnpm licenses:check` | 15 |
| `lint` | none | `pnpm lint`: ESLint in memory-bounded groups (`tools/lint/run.ts`) | 15 |
| `unit` | none | Chromium; the pinned gitleaks the pre-push hook's tests run; the engine freeze's base; `pnpm test` | 20 |
| `db (k/N)` | none | its own Postgres, quieted; Chromium; this shard's durations restored; `pnpm db:migrate && pnpm test:db --shard=k/N`; the files it ran | 20 |
| `domain model` | none | its own Postgres; on a pull request, the changes since the last approved document; `pnpm db:migrate`; `pnpm db:domain-model --check --strict --require-approval` | 10 |
| `build` | none | `pnpm build`; the web build stamped with its commit and kept as the run's `web-build` artifact; `pnpm cdk:diff` | 15 |
| `e2e (k/M)` | `build` | its own Postgres; Chromium; the downloaded build; `E2E_PREBUILT=1 pnpm test:e2e --shard=k/M`; its report as `playwright-<k>` | 25 |
| `images` | none | both images built and scanned by Trivy (HIGH and CRITICAL with a fix), the worker whatever the web image did | 20 |
| `all green` | every job above | each job's result to its log and summary; passes only when every one succeeded | 5 |

- **The gate.** `all green` runs `if: ${{ always() }}`, checks nothing out, and fails unless
  `echo "$NEEDS" | jq -e 'length > 0 and all(.[]; .result == "success")'` holds over `toJSON(needs)`: a failed, skipped
  or cancelled job fails it, and so does an empty `needs`. It always runs because GitHub counts a job its own condition
  skipped as passing a required check, the same reason the capacity gate does. A test holds its `needs` to every other
  job, so a job added later cannot escape it, and runs its script under bash and jq on each kind of result (CI-01).
- **Widths.** `db` runs four shards and `e2e` two on the public repository's 4-CPU runners, and six and three on a
  private repository's 2-CPU runners, chosen by `github.event.repository.private` in the matrix, so the move to a
  private organization needs no edit. vitest shards by the SHA-1 of each file's path, so membership is fixed by the
  paths; each shard prints the files it ran, sorted, with their count and the list's SHA-256, and the union of the
  shards' lists is the db project, each file once (CI-04; `tools/test/db-shards.test.ts` proves the split for 4 and 6
  shards through vitest's own sequencer).
- **Concurrency.** The group is `${{ github.workflow }}-` and the pull request's number, or the commit for a push;
  only a pull request's older run is cancelled. Every workflow's group starts with its own name, by test, since groups
  are shared across the repository's workflows.
- **Ranges.** A pull request's secret scan and release check read `origin/<base>..HEAD`; a push's read
  `github.event.before..HEAD` (a merge's first parent, or every commit of a multi-commit push), falling back to
  `HEAD^1` for a new branch, and a previous head the clone does not hold fails the step rather than check fewer commits.
  The unit job's differential test compares with a pull request's merge base or a push's previous head. The engine
  freeze's own check runs on pull requests only: its exception names a pull request, which a push does not carry, and
  a merge's push follows the pull request's gated run; the build branch's ruleset (step 4A, applied 2026-10-25 21:14
  UTC) refuses a direct push, and the differential test still checks every push (`docs/runbooks/ci.md`).
- **History.** `static`, `unit` and `domain model` check out the whole history (the scan, the differential test's
  `git archive` of the base, the summary's base document); no checkout keeps the token, since no step calls GitHub.
- **Artifacts.** Upload-artifact names (v4 and later; v7 since Part 2) are unique per run and immutable, so every per-run name (`web-build`,
  `playwright-<k>`) sets `overwrite: true`, and a re-run of failed jobs replaces rather than fails.
- **Logs.** Every verdict written to a job's summary is written to its log too (`tee -a`), because the verifier reads
  results with the job logs.
- **Actions.** ci.yml's actions are pinned to full commit SHAs with their version, the ones `release.yml` and
  `screening-capacity.yml` already run (and `actions/setup-python` v5.6.0, read with `git ls-remote`), held by the pin
  test that already covered those two workflows. Part 2 moves every workflow to current majors and checks every pin and
  input against its tag.

#### What makes it fast

- **The route tests.** One page read per distinct synthetic document per file (a memo keyed by the bytes' SHA-256 in
  `test-support/contract-world.ts`; the first world of each file still reads for real, and the bounded reader stays
  covered by `evidence.test.ts` and `contracts.db.test.ts`); the snapshot folded into one prepared statement built
  from `tenantTables()` (`route-tests/snapshot.db.test.ts` proves it equals the per-table snapshot on two worlds and
  after an update, CI-03); and the file split into twelve, `route-tests/route-tests.0.db.test.ts` to `.11`, each
  `defineRouteTests(<k>)` over a cost-balanced, deterministic slice of the registry (`route-tests/partition.ts`), with
  every route in exactly one (CI-02). A new route or tenant table needs no test-file change.
- **SCR-19 in its own file**, `apps/worker/src/screening/consumer-lease.db.test.ts`, with the helpers both files
  need in `test-support/consumer.ts`.
- **Slowest first.** Each shard restores the vitest results cache it saved last (`node_modules/.vite/vitest`, keyed
  by the shard's width and number), so its long files start first; push runs seed it.
- **Typecheck** (`tools/typecheck/run.ts`): the root and every workspace's `tsc --noEmit`, incremental into
  `node_modules/.cache/tsc`, slowest first and bounded by cores and memory, with no tsconfig changed (the engine freeze
  covers `packages/pricing`'s). The cache is restored by prefix and saved by commit; tsc compares every input's hash,
  so a stale cache can only cost time.
- **Lint** (`tools/lint/run.ts`): three groups, `apps/web`, `packages` and the complement, each its own process with a
  heap bounded by the host's memory, as many at once as memory admits, at least one always (CI-08).
- **One build for the journeys.** The build job's production build, stamped with its commit
  (`apps/web/.next/BUILD_COMMIT`), runs in every e2e shard: with `E2E_PREBUILT=1` the web server checks the stamp
  (`apps/web/scripts/build-stamp.ts`, which refuses another commit's build, an unstamped one and one beside uncommitted
  changes, and prints its verdict, a pass included, to the stderr the web server keeps in the log) in place of building
  again (CI-06). The build runs with no e2e setting, so the journeys run the build that ships.

#### What it holds that it did not

- **Chromium in every vitest job.** `tools/test/ci-chromium.ts`, the unit and db projects' global setup, fails a run
  on CI with no Chromium instead of letting the printing tests skip, and a workflow test requires a Chromium install
  before any step that runs the unit or db project, in every workflow (`large-zip.yml` gains one) (CI-05).
- **Nothing a step of the serial job left behind is assumed.** In the one job, the secret scan had installed the pinned
  gitleaks before `pnpm test`, and `pnpm test` had written the 10,000-claim PAR-29 remittance before `pnpm test:oracle`.
  Now `unit` installs the pinned gitleaks itself, and `tools/hooks/pre-push.test.ts` fails on CI without it rather than
  skip its real secret-scan cases; `static` runs `pnpm synth --large` before the oracle. This pull request's first run
  found both.
- **A flaky journey fails the run** (`failOnFlakyTests` on CI), its one retry kept for the trace and the "flaky" label,
  and the `github` reporter names it on the pull request (CI-07).
- **The schema approval as its own check**, `domain model`, which runs CLAUDE.md's command; the database suite keeps
  the drift case and drops the approval case, so a schema pull request awaiting the signature is red there alone
  (CI-09). The changes since the last approved document move to that job's summary and log.
- **A timeout on every job of every workflow**, held to one table by test (CI-10). `publish-content.yml` keeps
  GitHub's default: reconciliation-001 keeps that file unchanged, and a standing exception for its pins, runner and
  timeout is the founder's to grant (the series' question F4, put with Part 2).

#### The required checks

The build branch's ruleset, "Protect the build branch" (governance runbook, step 4A; ruleset 25837331), requires these
from GitHub Actions since the founder applied it on 2026-10-25 at 21:14 UTC, after this pull request's first green
push runs, and "Protect main" will from the launch pull request:

<!-- required-checks -->
- `all green` (ci.yml: every ci.yml job, the image and licence gates among them)
- `mutation` (mutation.yml; Part 4 keeps the name for its gate)
- `screening-capacity gate` (screening-capacity.yml, unchanged)
- `approval-of-record` (approval-of-record.yml, unchanged)
<!-- /required-checks -->

`tools/required-checks.ts` holds that list. Every document that lists the checks does so between `required-checks`
markers, and `tools/test/required-checks.test.ts` holds each listing to it; `tools/test/workflows.test.ts` holds each
name to a job of its workflow that runs on every pull request and that no condition of its own skips. The founder's
offer of 2026-10-22 ("check, mutation, capacity, approval-of-record") maps one for one: `all green` replaces `check`.

### Measured

- Before, on 49514e8's heads: 41:20 and 29:09 for the one `check` job, run serially.
- Expected after (the scouts' estimates on the public 4-vCPU runner, about ±25% by host): `all green` in about 7 to 8
  minutes, its critical path the build and the e2e shard holding the 168-s monitoring journey; about 42.7 to 47.7
  runner-minutes a run against today's 29 to 41, setup repeated in 13 jobs. The targets are 10:00 median and 12:00
  worst from the first job's start to the gate's end, and at most 50 runner-minutes, read on this pull request's last
  three heads and the first five push runs (`docs/runbooks/ci.md`, "Timing a run"). The time until a pull request can
  merge is reported beside it: on a pull request touching a watched path the capacity gate, about 12 to 19 minutes
  (11:59, 15:52, 18:28, 18:32 and 17:30 on five runs since), sets it; shortening that run changes what the founder ruled it measures, so it goes to the founder with those
  numbers, after the first five push runs.
- No test lost, read on the pull request's run: unit is 49514e8's 4,524 and 1 skipped plus this pull request's own,
  146 new by full name less 12 renamed (4,658 and 1 skipped on CI, b5ff4c7, each renamed test asserting the same on the
  new graph); golden and e2e equal 49514e8's (38 and 51); the database shards together run 49514e8's 9,041 less the
  approval case and the route-count check (now a unit test, `route-tests/partition.test.ts`), plus the snapshot
  equivalence case.
- **The journeys run the build that ships.** Measured on 2026-10-25 at this pull request's head (three
  `pnpm --filter @tp/web build` runs, 69, 72 and 76 s): two builds with no e2e setting and one with every variable the
  e2e web server sets (`apps/web/playwright.config.ts`: the database URLs, the local providers and their directories,
  the keys and secrets) each held the same 3,788 files under `.next/standalone` and `.next/static`, each build's own
  `BUILD_ID` set aside. The e2e build differed from a plain one in 261 files, exactly the 261 in which the two plain
  builds differed from each other: the server action IDs, their encryption key and the preview-mode keys Next draws for
  every build, and the chunks, manifests and trace files that carry them. None of the e2e values (the database URLs and
  logins, the origin, the secrets) appears anywhere in the e2e build's tree. So the build job builds without them, and
  the e2e shards run that build.

### Alternatives considered

| Option | Why not |
| --- | --- |
| Keep one job and shorten the slow files | The database suite alone would still take 8 to 10 minutes after the route-test fixes; jobs run in parallel for free |
| A ruleset requiring every job by name | Thirteen names in every document, renamed whenever a shard is added; one gate needs none of that, and a test keeps every job under it |
| Gate on `!cancelled()` | A gate skipped on a cancelled run reports as passing a required check |
| Keep `supply-chain.yml` beside ci.yml | Six names to require and keep in step, two workflows for "one workflow on every pull request" (PRD 18), and ADR 0010's reason (a verbatim plan file) no longer holds |
| Lint per workspace in parallel (audit #109's words) | Web is the floor whatever the split, since its program compiles every workspace's source; more processes add memory, not speed (notice N9) |
| `incremental` in each tsconfig | The engine freeze refuses any change to `packages/pricing/` outside `src`; the root runner passes the same options on the command line |
| Shard e2e by duration | Playwright 1.56.1 and 1.64.1 shard by test count; their only weighting is an internal variable |
| Three e2e shards on the public runners | Still by count: on 9144b56's durations the slowest shard's tests would take 3:57 instead of 4:24, 27 s off the wall for about 1.5 more runner-minutes a run, and the 3-minute monitoring journey's place, which sets it, moves with every journey added |
| Mutation inside ci.yml | `all green` stays the fast signal; mutation's own triggers (every push to the build branch, the schedule, dispatch, and pull requests by the paths they change) and its 13 to 17 minutes on money pull requests stay apart, under their own required gate (Part 4) |
| Pins only in Part 2 | ci.yml's rewrite already names each action; taking the SHAs the release and capacity workflows run costs nothing and leaves no tag-pinned action in the required gate between the two pull requests |

### Notices (decided by the build under the standing rule; the founder can reverse any)

- **N1.** `supply-chain.yml` folds into ci.yml under `all green`, with ADR 0010 amended: one required check for CI in
  place of four.
- **N2.** The schema approval runs as the named `domain model` job with CLAUDE.md's own command; CO-02 is unchanged.
- **N3.** A flaky end-to-end test fails CI; the retry stays for its trace and label.
- **N9.** Lint runs as three memory-bounded groups in one job, not per workspace.

### Consequences

- `all green` replaces `check`; the image checks are one job under it and the licence check a step of `static`. The
  founder applied the ruleset (governance runbook, step 4A) on 2026-10-25 at 21:14 UTC, after this pull request's first
  push runs were green (9c57d2d; ci run 40201435875): applied earlier, it would have required a `check` that no longer
  reports.
- A schema pull request shows a red `domain model` until the approval line is signed, and a green database suite if
  nothing else broke; the founder reads "Changes since the last approved domain model" in that job's summary.
- Each shard migrates its own database; the catalog and cross-tenant tests run in whichever shard their paths hash to,
  on every pull request, and `all green` requires every shard (reconciliation-001's "pnpm test:db passes on every pull
  request", amended to say so).
- Thirteen jobs at the peak's eleven or so at once fit GitHub Free's 20 concurrent jobs per account; two lanes pushing
  at once with mutation, capacity and approval-of-record can queue briefly.
- Caches: a pull request restores what the build branch's push runs saved (tsc's build information, each shard's
  durations, the pnpm store, and Playwright's browsers under the key of the builds the installed Playwright pins). The
  image scans keep none: each downloads Trivy's vulnerability database, the data its verdict is made from, into the
  runner's temporary directory, outside the checkout the worker image is built from after the web scan. The founder
  ruled that the build branch becomes the default branch until launch (F1 (a)), so from that switch every branch's
  runs, and every tag's, may restore them; Part 2 makes `release.yml` restore none.
- What cannot be verified where the series is built (no Docker daemon, no GitHub runner): `needs` results, the
  artifacts between jobs and `overwrite` on a re-run, `github.event.repository.private`, `github.event.before`, the
  caches. The pull request's own runs and the first push runs prove them; every verdict is in the job logs.

### Revisit when

The repository goes private (read the six- and three-shard runs against the 10-minute target), the founder rules on the capacity run's
length, Part 2's pins land, Playwright moves (Part 3), or a db file passes 240 s on CI or a route-test file 90 s.

## Part 2 (`co-001/ci-deps`)

### Context

Combined audit #112 asked for every dependency pinned and kept current by updates that pass CI; #19 added the looser
asserts, Dependabot's groups and the licence fix. What the build branch held on 2026-10-25, at 6ddd587, after Parts 1
and 4 had merged:

- **Actions.** ci.yml and mutation.yml ran SHA pins, as release.yml and screening-capacity.yml already did, but at the
  versions `workflows.test.ts` held literally (`PINNED`): checkout v4.4.0, setup-node v4.4.0, action-setup v4.3.0,
  setup-python v5.6.0, cache v4.3.0, upload v4.6.2, download v4.3.0, buildx v3.12.0, build-push v6.19.2 and login
  v3.7.0. `approval-of-record.yml`, `large-zip.yml` and `publish-content.yml` still ran tag refs, so a moved `v4` tag
  could decide one of the four required checks. Dependabot's #40 (head e0d5b6f, 2026-10-25 18:54 to 19:10 UTC) ran every
  job of ci.yml, mutation.yml and screening-capacity.yml on the current majors, and every one passed but `unit`, which
  failed on the literal pins alone (14 tests, job 121259732714).
- **The release.** Only a tag runs `release.yml`, only the founder creates tags, and no tag existed, so the workflow had
  never run. Its capacity job restored the pnpm store (`setup-node … cache: pnpm`), a cached scale release
  (`actions/cache/restore`, keyed on the generator's sources and release 900001 but not the lockfile) and, through
  trivy-action's default `cache: 'true'`, Trivy's binary and vulnerability database. A tag's run may restore caches
  its default branch saved, which was `main` (no workflow, so nothing to restore) until F1 (below).
- **Images.** Both Dockerfiles built from `node:24-slim` by tag (Debian 12 bookworm) and installed
  `npm install --global pnpm@10.28.0`; four `services:` blocks (ci.yml's db, domain-model and e2e jobs, and
  large-zip.yml) ran `postgres:18` by tag, beside `docker-compose.yml`'s own copy, whose healthcheck ran `pg_isready`
  on the Unix socket. `minio/minio` no longer exists on Docker Hub (checked 2026-10-24), so `pnpm dev` failed on a
  fresh machine, and nothing connected to it: the dev and e2e document store is local
  (`apps/web/src/lib/server/config.ts`).
- **The toolchain.** pnpm 10.28.0 had 23 advisories, 11 of them high; the highest fixed-in bound among them is
  `<10.34.5`. Its lockfile carried no `libc:` field, so `pnpm licenses list --prod` listed
  `@img/sharp-libvips-linuxmusl-x64`, and the licence allowlist carried an exception for it. No release age or trust
  policy applied to a resolution.
- **Dependabot.** It read `main`'s copy (220f2b4, from #27 under the founder's ruling of 2026-10-20), with no ignores,
  Playwright inside the minor-and-patch group and no compose entry. #38 (npm) failed every update on 2026-10-25 (run
  40223237798): it ran pnpm with `--config.minimum-release-age=4320`, and Part 4's Stryker 10.1.1 was then 47 hours
  old; it closed as "no longer updatable". #33 proposed `node:26-slim`, a major the plan moves on purpose.

The founder ruled the series' questions as recommended (relayed by the co-founder, 2026-10-25 ~01:10 UTC): F1 (a), the
build branch becomes the default branch until launch; F2 (a), Dependabot alerts and security updates on, and (b), every
resolution held to a three-day release age with a dated, exact-version exclude for a young security fix; F4, a
standing exception for `publish-content.yml`'s pins and one timeout, held to a frozen copy; F7, the build branch's
ruleset, applied on 2026-10-25 at 21:14 UTC as "Protect the build branch" (ruleset 25837331), which requires the four
required checks from GitHub Actions, branches up to date, a pull request with no approval yet, and no force push,
deletion or bypass. The co-founder answered the three security choices this part raised with their recommended, safer
options (CQ1 (a), CQ2 (a), CQ3 (a); 2026-10-26 ~00:20 UTC: "Don't ask for approvals anymore just build and optimize"),
and on 2026-10-25 ~21:05 UTC ruled that the files this part shares with Lane A's #42 follow LANES rule 6 (Q2) and that
engineering-only choices inside a ruled design are pre-approved and reversible (Q3).

### Decision

#### Every action at its latest release, pinned by SHA

Every `uses:` in every workflow is `owner/repo@<40 hex> # vX.Y.Z`, read with `git ls-remote --tags` on 2026-10-25 and
again when pinned (`refs/tags/vX.Y.Z^{}`):

| Action | Version | Commit | Tag's commit (UTC) |
| --- | --- | --- | --- |
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` | 2026-07-17 |
| `actions/setup-node` | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` | 2026-10-08 |
| `pnpm/action-setup` | v6.1.0 | `ea17c68df8912ef543352723c149a84f56e3d413` | 2026-09-04 |
| `actions/setup-python` | v7.1.0 | `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` | 2026-10-22 |
| `actions/upload-artifact` | v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | 2026-10-07 |
| `actions/download-artifact` | v8.0.2 | `9000827ccba6bdab643e8b6fd33ac0654aef8333` | 2026-10-07 |
| `actions/cache/restore` and `/save` | v6.1.0 | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` | 2026-06-23 |
| `docker/setup-buildx-action` | v4.4.1 | `f87e5991a6d7451dcb8d9637bfbc97413f497069` | 2026-09-16 |
| `docker/build-push-action` | v7.4.0 | `c3c9e263c25d99ce0380d002d59b67737d91b0dc` | 2026-09-15 |
| `docker/login-action` | v4.7.0 | `81c6f93d4bc991e510b342a00b419b3bb4efc5c6` | 2026-10-23 15:11 |
| `aquasecurity/trivy-action` | v0.36.0 (kept) | `ed142fd0673e97e23eac54620cfb913e5ce36c25` | 2026-04-22 |
| `actions/attest-build-provenance` | v4.2.2 (kept) | `4d101475d8b20a2381f78447822ac1eab6504dd8` | 2026-08-06 |

Two differ from #40's offer: action-setup v6.1.0, the latest release, where #40 offers v6.0.10, and login v4.7.0, where
#40 offers v4.6.0, most likely because GitHub's default three-day cooldown held it back. login is pinned at v4.7.0 only
once its tag commit is three days old (from 2026-10-26T15:11Z). action-setup v6.1.0 bootstraps its own pnpm and then
runs `pnpm self-update` to `packageManager`'s version in its own directory, so the workspace's release age never
applies to that switch, and `check-toolchain` checks `packageManager`'s version itself (below). Each new major's
breaking changes were read against our use: none removes an input or behaviour a workflow relies on, and every `with:`
key in use is an input at its pinned commit.

`tools/test/workflows.test.ts` holds the pins by rule, never by a literal version, so a Dependabot pull request that
rewrites them stays green unless something really broke:
- (a) every `uses:` of every workflow file has the form above;
- (b) one commit and one version per action across all files;
- (c) behaviour asserts find a step by the action's name, the part before `@` (`usesAction`), so no assert names a
  version, and the check that no capacity step uses `actions/cache` holds for a pinned step too;
- (d) a simulated Dependabot rewrite (A4): a test copies `.github/`, both Dockerfiles and `docker-compose.yml` into a
  temporary directory, replaces every pin with another well-formed one and every image digest with another, and runs
  `workflows.test.ts`, `dependabot-config.test.ts` and `no-duplicated-versions.test.ts` on that copy (`CI_TREE`) in a
  spawned vitest, which must pass. Its counts are read from vitest's JSON report written to a scratch file
  (`--reporter=json --outputFile`), never from its printed summary, whose colour codes CI's runner turns on (run
  40255481181): no test failed, all three files ran, and every test passed but the rewrite test itself, which skips
  inside the run it starts. A second copy with one deliberate break must fail, read from its own report, which proves
  the spawned run reads the copy.

**`tools/check-action-pins`** (`pnpm actions:check`, in `static`, on every run) checks the same form offline and, for
each pin, three things on the network: the tag's peeled commit is the pinned SHA (`git ls-remote`); every `with:` key
used is an input the action declares at that SHA, and every required input without a default is given; and a
composite action nests no action by tag or branch, recursively, naming the chain. It reads the network only for a pin
the base does not use, or one used by a step whose `with:` changed, or for every pin when the checker itself changed or
the base has none; each read fails closed after three tries, naming the host. An action's files are read with git
from github.com, the host `git ls-remote` reads (a shallow fetch of the pinned commit without file contents, then the
one blob), not from raw.githubusercontent.com, whose unauthenticated per-address rate limit a shared runner can exhaust
(the ci-infra review's N5). On push runs it re-reads every unchanged pin's tag, four at a time under one two-minute
deadline for them all, well inside `static`'s fifteen; a moved or unreadable tag there is a warning, never a failure,
and the tags the deadline leaves unread are one warning, so an upstream re-tag, a rate limit or a github.com that
never answers cannot turn both lanes red (the ci-infra review's S1). A pin it reads whose action runs on a Node.js
runtime GitHub has deprecated (node20 or older) is a warning naming it. No facts are committed per SHA: Dependabot's actions pull requests rewrite only `uses:` lines, and a
committed file would make each of them red. Read at the pinned commits, every nested reference is already a SHA:
trivy-action pins setup-trivy and `actions/cache`, setup-trivy pins `actions/cache/restore`, `actions/checkout` and
`actions/cache/save`, and attest-build-provenance pins `actions/attest`.

#### The release restores no cache, and a dry run exercises it

Under F1 (a) the build branch's push runs save caches a tag's run may restore, so `release.yml`'s capacity job could
otherwise measure, for the binding and attested report (decision 13 of ADR 0062), a scale release another run built
from other code, and scan with another run's Trivy binary and database. So `release.yml` restores nothing (ADR 0062,
amended): no `actions/cache*` step, and the scale release is built in the run (about 22 s on a miss, run
39977565861); setup-node takes no `cache` and sets `package-manager-cache: false`, and action-setup keeps
`cache: false`; both trivy-action steps set `cache: false` and a `cache-dir` under `runner.temp`, as ci.yml's `images`
job does; setup-buildx sets `cache-binary: false`, and no build sets `cache-from` or `cache-to`. `workflows.test.ts`
holds release.yml to those inputs by name, offline. What the actions nest is `check-action-pins`' to check, since only
it reads their files: it follows every `actions/cache*` step a composite action release.yml uses nests, through
composites up to eight levels deep (failing closed beyond them), to the top-level input that gates it, which must be
`false` in release.yml, and fails an ungated one, naming the chain. A JavaScript action's built-in cache (setup-node's,
action-setup's, setup-buildx's binary cache) is code, not steps, and the check cannot see it: `workflows.test.ts`'s
assertions of release.yml's explicit inputs are the guard for JavaScript actions. Its three uploads set
`overwrite: true`, as ci.yml's per-run uploads do (Part 1, "Artifacts"), so a re-run of a tag's failed job replaces
what the first attempt left. Every upload of every workflow overwrites, screening-capacity's per-run report
included, which had the same re-run conflict. release.yml and the dry run run their scripts under
`defaults: run: shell: bash`, GitHub's bash with `pipefail`: the default `bash -e` has none, so a failed `docker save`
piped to `gzip` would pass its step. action-setup's `cache: false` is written out rather than left to its default, so a
later default cannot turn the cache back on.

**`.github/workflows/release-dry-run.yml`** (new, advisory, outside the ruleset) runs on every pull request and push
that changes release.yml, itself, `tools/screening-capacity/image-id.ts` or either Dockerfile. Its `build` job
(`contents: read`) builds the web image as release.yml does, saves it with its identity and uploads it (v7,
`overwrite: true`, kept a day); its `push` job (`contents: read`, `packages: read`) downloads it with
`merge-multiple` (v8), runs release.yml's identity check, loads it and logs in to ghcr.io with the job's own token. It
names its image `ghcr.io/<repository>/web:dry-run-<run id>`, since a pull request's ref name (`<n>/merge`) is no image
tag, and never tags, pushes or attests. Its build job also writes the image's bill of materials with release.yml's
Trivy step and reads the file as SPDX, and its `capacity` job (`contents: read`) runs release.yml's capacity job up to
its frozen install: the checkout, a download by name, action-setup with `cache: false`, setup-node with
`package-manager-cache: false` and `pnpm install --frozen-lockfile`, so those inputs run on every change to the
release, not first on a tag (the ci-infra review's N4). A test holds every step it shares with release.yml to the same action and the same
`with:` keys, with `overwrite` and the cache inputs equal in value, so the dry run cannot drift from what a tag runs.
The new majors of upload, download, login, build-push and setup-buildx therefore run on a pull request, not first on
the founder's tag.

`large-zip.yml` runs its steps under the same `defaults: run: shell: bash`, so its scripts have `pipefail` too.

#### Images by digest, each from one source

- Both Dockerfiles build every stage from
  `node:24-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea`, the index digest
  (Node 24.22.1, pushed 2026-10-21T17:39Z): Debian 13 trixie, where `24-slim` was Debian 12 bookworm (notice N7). Each
  installs the pnpm `package.json`'s `packageManager` names, read after `COPY package.json`, so no image carries a pnpm
  version of its own.
- `docker-compose.yml` pins
  `postgres:18-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6` (pushed
  2026-10-21T19:08Z), the index `postgres:18` already resolved to, so the pin changes no bits for CI or the capacity
  harness. Its healthcheck runs `pg_isready -h localhost -U postgres`, on TCP: the image's first-run setup serves the
  Unix socket before the server listens on TCP, which Part 1 found for the service blocks. Its timing is the service
  blocks' that CI proved, held whole by a test: every 2 s, a 5 s timeout, 30 retries, so interval times retries (60 s)
  stays under `postgres.sh`'s `--wait-timeout 120` (the ci-infra review's S2).
- **The builder and the frontend by digest too** (the security review's S4). Neither Dockerfile has a
  `# syntax=docker/dockerfile:1` line, which pulled the frontend from Docker Hub by tag on every build: neither uses a
  feature the frontend built into BuildKit lacks, so the pinned builder's own frontend parses them. Every
  setup-buildx step (ci.yml's images, release.yml, the dry run, screening-capacity) sets
  `driver-opts: image=moby/buildkit:v0.34.1@sha256:99368f3e46177c6405b9740e4461d91cee004128daeecca78d4ceac50ec1da5c`
  (pushed 2026-10-20T21:37Z, the latest release at least three days old), where the driver ran
  `moby/buildkit:buildx-stable-1` by tag. CI-13's test holds both, that the copies are one value, that every job that
  builds sets up buildx first, and that no container or `docker://` step runs by tag. Dependabot cannot update a
  `driver-opts` string, so `check-action-pins` reads Docker Hub for it on every networked run: the version's tag must
  be the pinned digest, and a newer release three days old is a warning naming it, for the manual step in
  `docs/runbooks/dependency-upgrades.md`.
- **Postgres comes from the compose file everywhere.** `services:` cannot read an image from a file, four digest copies
  in workflows would drift (Dependabot's actions ecosystem rewrites only `uses:`), and a job output feeding `services:`
  would add a job to the critical path. So ci.yml's db, domain-model and e2e jobs and large-zip.yml declare no
  `services:`; each runs `tools/ci/postgres.sh up` right after checkout, which starts
  `docker compose up --detach --wait --wait-timeout 120 postgres` in the background with every stream redirected and
  records compose's exit status, and `tools/ci/postgres.sh wait` just before the first step that reads `DATABASE_URL`,
  which passes on status 0, fails at once on any other and prints the log, and fails after 130 s with no status. The
  image pulls while setup, the install and Playwright's install run. "Quiet the database's log" moves after the
  browser install, and a last `if: failure()` step prints the database's log, which GitHub printed for a service
  container and compose does not. `DATABASE_URL` is unchanged. The capacity harness reads the image from the compose
  file through one tested function, `docker-compose.yml` becomes a watched path (`WATCHED_FIXED`, and
  `screening-capacity.yml`'s push paths), so a compose bump runs the capacity measurement.
- **MinIO is removed, not replaced** (notice N6). A stand-in would be a maintained dependency nothing exercises; the S3
  path (presigned PUT, Object Lock COMPLIANCE, multipart) is tested on AWS staging, where the real bucket policy and
  KMS live. The dev environment's descriptions follow (PRD 15, CLAUDE.md, the README, the architecture diagram).

#### pnpm 10.34.8, its lockfile and the licence fix

`packageManager` moves to `pnpm@10.34.8` (published 2026-10-23T18:06:37Z), which fixes all 23 advisories and has none
(npm's bulk advisory endpoint, 2026-10-25). It is kept over 10.34.9 (`latest-10` from 2026-10-25T17:54Z), whose one
change concerns a switch to pnpm 11 or 12 that a 10.x `packageManager` never makes, and on which the licence diff was
measured. pnpm stays on major 10, not 12.15.0 (notice N10): GitHub's list of the pnpm versions Dependabot supports
still reads "v7, v8, v9, v10", though dependabot-core already handles 11 and 12 in code; the trigger for moving is
GitHub listing pnpm 11 or later (`docs/runbooks/dependency-upgrades.md`). Dependabot never moves `packageManager`
(dependabot-core parses only the three dependency fields), so a person does: `check-toolchain` warns when a newer 10.x
is at least three days old.

The licence fix is the pull request's first commit, alone: `packageManager`, then
`pnpm install --lockfile-only --fix-lockfile` under 10.34.8, which adds 43 `libc:` fields to existing entries (27
`[glibc]`, 16 `[musl]`) and nothing else; a plain `--lockfile-only` adds none. `pnpm licenses list --prod` then lists
no musl package, and the allowlist's `@img/sharp-libvips-linuxmusl-x64` exception goes. A `check.test.ts` case
requires every lockfile entry whose name marks musl to carry `libc: [musl]`, naming the remedy.

#### The npm versions taken

Each was published more than three days before the commit that takes it, so the release age resolves it with no
exclude:

| Package | From | To | Published (UTC) |
| --- | --- | --- | --- |
| vitest (catalog) and @vitest/coverage-v8 | 5.0.4 | 5.0.5 | 2026-10-15 |
| eslint (into the catalog) | 10.12.0 | 10.13.0 | 2026-10-16 |
| typescript-eslint (into the catalog) | 8.71.2 | 8.72.0 | 2026-10-19 |
| postcss | 8.5.30 | 8.5.31 | 2026-10-18 |
| next and @next/eslint-plugin-next | 16.4.1 | 16.4.3 | 2026-10-23 13:40 |
| fast-uri (through ajv), by refresh | 3.1.8 | 3.1.9 | 2026-10-19 |
| qs (through typed-rest-client), by override | 6.15.1 | 6.16.1 | 2026-10-14 |

typescript-eslint moves with eslint, in lockstep. qs needs an override, `"typed-rest-client@2>qs": "6.16.1"` in
`pnpm-workspace.yaml`, because Stryker 10.1.1's `typed-rest-client ~2.3.0` pins qs to exactly 6.15.1; it closes qs's
three moderate advisories, and `check-toolchain` keeps it with its reason and its removal trigger (Stryker on
typed-rest-client 3, or on qs 6.16.0 or later), failing an override whose target has left the lockfile. eslint and
typescript-eslint join the catalog, and every manifest names each package the catalog holds as `catalog:`, root's five
literal copies (`@types/node`, fast-check, tsx, typescript, vitest) and `tools/`'s eslint and typescript-eslint among
them, so a Dependabot catalog update moves one line; `no-duplicated-versions.test.ts` holds it.
Not taken here: Playwright and axe (Part 3); the Anthropic SDK, Node 26 and `@types/node` 26, and TypeScript 7, each a
deliberate pull request (notice N8; typescript-eslint 8.72.0 declares `typescript <6.1.0`); stripe, aws-cdk and
`@aws-sdk/*`, which their Dependabot groups bring.

The bumps, and every other commit that changes the lockfile or a resolution setting, are dated after
2026-10-26T19:18:50Z, when the last young locked version, Part 4's Stryker 10.1.1 (published 2026-10-23T19:17:52Z to
19:18:49.904Z), is three days old: every resolution in the pull request then runs under the gates Dependabot meets.

#### The release age and the trust policy (F2 (b), CQ2, CQ3)

`pnpm-workspace.yaml` sets `minimumReleaseAge: 4320` (three days) with `minimumReleaseAgeExclude: []`, and
`trustPolicy: no-downgrade` with `trustPolicyExclude: ['semver@6.3.1']`. Under no-downgrade a version fails when an
earlier version of its package had stronger evidence (a trusted publisher over provenance over none). Of all 614
locked versions and every target, semver 6.3.1 alone fails (2023-07-10, no provenance, after 7.5.1 of 2023-05-12 with
provenance); it is reached through `@babel/core`, whose subtree the Next bump re-resolves. The exclude names that one
version, where `trustPolicyIgnoreAfter` would pass a future downgrade of any old version (CQ2 (a)).

What the release age does under pnpm 10.34.8, read from its source and measured live on 2026-10-26: a resolution that
needs a version under three days old fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, and passes with that version's
exact exclude; a frozen install never checks it; and a full update re-checks every locked direct dependency, which is
how Part 4's young Stryker stopped every Dependabot npm update on 2026-10-25. Dependabot passes its own gate to pnpm
(`--config.minimum-release-age`) only when it is longer than the repository's, and its security updates pass 0. So
the release age alone would hold re-resolutions, not what lands. **`tools/check-toolchain`** (`pnpm toolchain:check`,
in `static`, networked, against the range step's base reduced with `git merge-base`) holds it where it lands:
- every lockfile entry the change adds against the base must be at least `minimumReleaseAge` old by the registry's
  `time`, or listed in `minimumReleaseAgeExclude` with a live entry in `tools/check-toolchain/release-age-exceptions.json`;
- each exclude is one exact version (`name@x.y.z`; a bare name, a pattern or a union fails), with its advisory, reason,
  date added and expiry, and the two lists are equal. An entry the change adds expires no earlier than the version's
  publish time plus three days and no later than seven days after it was added; an expired entry fails a pull request
  that edits either list and warns everywhere else, since it can no longer change a resolution;
- `packageManager`'s pnpm has no moderate or worse advisory (npm's bulk advisory endpoint); it fails while that pnpm is
  under three days old unless that exact version has a live exclude, as any version the lockfile adds would (CQ3 (a):
  action-setup's `self-update` escapes the workspace's gate, and without the rule a hand bump could make every CI job
  run a pnpm published minutes before); and it warns when a newer 10.x is at least three days old;
- neither Dockerfile carries a pnpm literal;
- `trust-exceptions.json` equals `trustPolicyExclude`, each entry still in the lockfile; `audit-exceptions.json` equals
  `auditConfig.ignoreGhsas` (empty), an entry over 30 days old failing; each override has its entry;
- every networked read fails closed after three tries, naming the host.

`static` keeps `pnpm audit --prod` and adds `pnpm audit --audit-level=high`; both pass, qs and fast-uri being
development-only. So a security fix younger than three days can enter a pull request, since Dependabot resolves it with
the gate off, and that pull request stays red until a person adds the dated exclude: F2 (b)'s ruled trade-off, enforced
where the version lands.

#### Dependabot's configuration (F1 (a), CQ1)

Under F1 (a) Dependabot reads `.github/dependabot.yml` from the build branch once the founder switches the default
branch, so the file has no `target-branch` line and `main`'s copy (220f2b4) is no longer read; no pull request goes
into `main`. Its alerts and security updates read the default branch's lockfile too (F2 (a)).
- **Days:** actions on Tuesday at 04:37 UTC, the container images on Wednesday at 04:43, npm on Thursday at 04:31.
  The weekly runs that start at the switch all fall on Monday (mutation at 05:23, large-zip at 06:17, capacity at
  06:41), so no ecosystem runs then.
- **Cooldown:** npm `default-days: 3`, equal to `minimumReleaseAge`, with no semver-specific days (CQ1 (a)). Dependabot
  passes pnpm a gate longer than the repository's from two places: its update checker's peer probe, with the version's
  own semver days uncapped, where a release-age failure skips that version; and its file updater, with the smallest
  per-dependency `min(semver days, default-days)`. With 14 days for majors and 7 for minors, a major would be dropped
  silently whenever any locked direct dependency was under 14 days old, most weeks. Actions and images take
  `default-days: 7`, the only cooldown key those ecosystems support.
- **Groups**, in this order: `browser-tests` (Playwright and axe, red by design on the brand journey's baselines, and
  from Part 3 on the `browser.json` check, until ADR 0058's regeneration runs with a person's inspection), `anthropic-sdk`, `pg-boss`, `next`, `aws-sdk`, `aws-cdk`, `minor-and-patch`, and
  `security` (security updates); npm opens at most 8. Every action in one pull request. The node image and compose's
  postgres in one multi-ecosystem group, `container-images`.
- **Majors ignored**, each a deliberate pull request instead: `@types/node`, `typescript`, `next`,
  `@next/eslint-plugin-next`, `pg-boss`, the node image (which declines #33's kind) and compose's postgres.

`tools/test/dependabot-config.test.ts` holds all of it, and no `target-branch` (CI-12).

#### `publish-content.yml` under F4

The one workflow that pushes to `main` changes only in its `uses:` refs and their comments, and once in one line,
`timeout-minutes: 15` on `publish` (its one run took 21 s, run 39090999122; `static` does the same work in 15). Its
pins take the current majors, checkout v7.0.1, action-setup v6.1.0 and setup-node v7.1.0, as every workflow's do: F4's
"SHA pins at the current majors now" read as the latest release, since only `uses:` refs and their comments change,
the first Dependabot actions pull request would bring these majors with no further ruling, and the same three actions
run in ci.yml on every pull request with the same inputs (reconciliation-001 records the reading). A test holds the
file equal to `tools/test/frozen/publish-content.yml` (the file at 49514e8 plus that timeout line) once each
`uses: owner/repo@<ref> # <comment>` is reduced to `uses: owner/repo`, nothing else set aside, `runs-on` included: a
Dependabot pin bump passes, any other edit fails. Part 3's one move of its `runs-on` edits the file and the copy
together.

### Measured (2026-10-25 and 2026-10-26)

- **ci.yml's cost:** 38.0 to 39.1 runner-minutes on push runs (44 to 45 billed; runs 40201435875, 40223130551,
  40229005858), and 48.3 on #40's pull request run (56 billed, 40223436311). The capacity gate took about 12 to 19
  minutes on a watched pull request; a full mutation run 31 to 36 runner-minutes.
- **Postgres from compose:** "Initialize containers" took 8 to 18 s in every Postgres job, before checkout, on the
  job's own path; checkout, action-setup, setup-node and the install then take 7 to 14 s, and in db and e2e the
  browser restore and Playwright's install 15 to 27 s more before anything needs the database. A background start
  overlaps them: about 10 to 15 s off each Postgres job and 9 to 18 s off the build-to-e2e path.
- **The licence commit:** 0 `libc:` fields before it and 43 after (`grep -c '^ *libc: \['`), its lockfile diff 43
  added lines and none removed, each `libc: [glibc]` (27) or `libc: [musl]` (16).
- **The release age, live** (pnpm 10.34.8, a scratch workspace, 2026-10-26 01:00 to 01:03 UTC): a resolution needing
  `@stryker-mutator/util` 10.1.1, then two days old, failed with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` and passed with
  its exact exclude; a frozen install with no exclude passed; `pnpm update --lockfile-only` re-checked the young locked
  version and failed, while a targeted update or range edit of another dependency did not.
- **`check-toolchain`, live** against 6ddd587 on 2026-10-26 at 01:00 UTC: every rule passed but CQ3's, which holds
  pnpm 10.34.8 until it is three days old (2026-10-26T18:06:37Z, before the bump commits); with 49514e8 as its
  base it also refused the five Stryker 10.1.1 packages the lockfile has added since, then under three days old.
- **No test lost.** Unit at 6ddd587 is 4,996 passed and 1 skipped (job 121281841727); the pull request adds its new
  tests and replaces three (the Dependabot block by `dependabot-config.test.ts`, "the Postgres services" by the compose
  rule, the old pin-form test by rule (a)); its description gives the sum. Golden 188, db 9,049 and 1 skipped, and e2e
  51 are unchanged.
- **The weekly batch:** a full Thursday batch of eight npm groups is about 550 to 650 runner-minutes, filling GitHub
  Free's 20 concurrent jobs for about 30 to 35 minutes; `docs/runbooks/ci.md` reads the bot queue time for the first
  four batches.

### Alternatives considered

| Option | Why not |
| --- | --- |
| Take #40 as it stands | Red on the literal pins, a release seven weeks old for action-setup, and no rule that keeps the next bump green |
| Tag refs with Dependabot's updates | A moved tag runs other code under a required check (the trivy-action tag hijack of March 2026, CVE-2026-33634); F3's setting needs every ref a SHA |
| A committed file of facts per pinned SHA | Stale on every Dependabot actions pull request, which rewrites only `uses:`, so each would be red |
| Keep release.yml's caches, keyed more tightly | Under F1 (a) any cache another run saved can reach the attested measurement; building in the run costs about 22 s a tag |
| Postgres as four `services:` blocks with a digest each | Four copies Dependabot's actions ecosystem never rewrites; an equality test across them goes red on every compose bump |
| A local composite action for Postgres | It would need its own SHA rule under F3 and `check-action-pins`; a script needs neither |
| A replacement for MinIO (RustFS, SeaweedFS) | A maintained dependency nothing exercises; the S3 path is tested on AWS staging |
| pnpm 12 | GitHub does not list it as supported for Dependabot; a lockfile from 11 or 12 would rest on support GitHub does not state |
| No release age, or seven days | The founder ruled three days (F2 (b)); seven would hold every young fix's exclude for a week |
| `trustPolicyIgnoreAfter`, or no trust policy | Broader: it would pass a future downgrade of any old version, or drop the check for every package (CQ2) |
| npm cooldown 7 days by default, 14 for majors and 7 for minors | Dependabot's peer probe passes the semver days to pnpm uncapped, so majors and minors would be dropped silently (CQ1) |
| One concurrency group for Dependabot's runs | A group holds one pending run and cancels the older; `queue: max` is refused by actionlint 1.7.7 (open item O13) |
| A pull request into `main` with the new configuration and every `target-branch` kept (F1 (b)) | No alerts, security updates or schedules until launch, and another ruling for every later change |

### Notices (decided by the build under the standing rule; the founder can reverse any)

- **N5.** pnpm 10.34.8 and next 16.4.3 were published on 2026-10-23, and are older than the three-day release age by
  the commits that take them.
- **N6.** MinIO is removed, not replaced: the image is gone and nothing connects to it.
- **N7.** Both production images move from Debian 12 bookworm to Debian 13 trixie at the same Node 24; the images, e2e
  and capacity jobs prove the move.
- **N8.** Node 26 (LTS from 2026-10-28), TypeScript 7 and the Anthropic SDK 1.x each get a deliberate pull request;
  Node 26 lands before Gate 1.
- **N10.** pnpm stays on major 10 until GitHub lists a later major as supported for Dependabot.
- **N11.** `release.yml` restores no cache, whatever F1's answer, and `release-dry-run.yml` exercises its actions on
  every change to it.

### Consequences

- Every workflow's actions are SHA-pinned at their latest release, so the founder can turn on "Require actions to be
  pinned to a full-length commit SHA" (F3) once this part merges. Dependabot's actions pull requests rewrite the pins
  and stay green unless a test names a real incompatibility.
- At the merge the founder switches the default branch to `claude/build-platform` (F1 (a)) and turns on Dependabot
  alerts and security updates (F2 (a)), then F3 (`docs/runbooks/github-governance.md`). From the switch the weekly
  mutation, large-zip and capacity runs start, every branch's and tag's runs may restore the build branch's caches
  (`release.yml` restores none), GitHub offers the pull request template from the build branch, and Dependabot's
  configuration change opens its first batch at once. An npm run before 2026-10-26T19:18:50Z fails as #38's did; one
  after it passes the gate. #40 closes as superseded, and #33 is declined by the node major ignore.
- The switch back to `main` comes immediately before the launch pull request merges, so the launch merge's push, which
  starts `publish-content.yml` with its `cache: pnpm`, restores no store the build branch saved.
- A young security fix is red until a person adds its dated exclude to both lists; the weekly triage removes expired
  ones (`docs/runbooks/dependency-upgrades.md`). A young version merged into the lockfile stops every full
  re-resolution, Dependabot's included, until it is three days old.
- `packageManager` moves only by a person's pull request, on `check-toolchain`'s warning or an advisory against the
  pinned pnpm, which turns `static` red on every pull request until that pull request merges first.
- A Lane A or Lane B pull request that resolves the lockfile does so under pnpm 10.34.8 and both gates, starting from
  the build branch's lockfile, never by hand-merging it.
- What cannot be verified where the series is built (no Docker daemon, no GitHub runner): compose on a runner, the
  images on trixie, the dry run's upload, download and login, Dependabot reading its configuration. The pull request's
  own runs and the first runs after the switch prove them; the first Dependabot runs are read with
  `event=dynamic` (`docs/runbooks/ci.md`).

### Revisit when

GitHub lists pnpm 11 or later as supported for Dependabot (pnpm 11.3's `trustLockfile` then checks every lockfile entry
on every install); actionlint accepts `concurrency.queue` and the bot-queue reading shows a lane waiting over 15 minutes
(O13); a newer trivy is wanted than trivy-action's default (a `version:` pin and its check); the repository goes private
(about 10 bot pull requests a week, about 3,500 to 4,000 billed minutes a month); or the launch switches the default
branch back to `main`.

## Part 3 (`co-001/ci-browser`)

Appended by that pull request.

## Part 4 (`co-001/ci-mutation`)

### Context

PRD 18 asks for a mutation score "above 85% before Monitoring v1" on the money packages, and for mutation testing in
CI. Combined audit #54 found the measurement not to be trusted, and the run not to happen:

- **The runner was unfaithful.** `@stryker-mutator/vitest-runner` 10.0.0 named a test by its describe and test names
  joined by spaces, where Vitest 5 filters by `fullTestName` (joined by " > "), so a mutant run selected no test and
  every runtime mutant survived. The local patch of PR 6b-1 (ADR 0064) fixed the names, but 10.0.0 still reported
  **Survived** for any mutant that breaks a test file's load: 7 of the money package's 243 mutants (2.9 points), 21 of
  pricing's (20 in `trace.ts`, whose 76.16% on CI was really 90.08%) and 2 of the verifier's.
- **Tests that import a package by name reached the original files.** Stryker links each `node_modules` into its
  sandbox, so `@tp/pricing` resolved to the unmutated checkout. The golden engine tests, the pricing oracle, could kill
  no engine mutant, and were not in the run at all.
- **The run rarely ran.** It ran only on a pull request labelled `money`, in one job of 26 to 46 minutes. Of 31 runs,
  3 measured anything. No push or scheduled run ever happened.
- **Kills depended on the run.** 18 test files on the money paths hold fast-check properties, none seeded, so a
  property-only kill could flip between runs (the ledger's `allocation.ts:50`).
- **The money package was outside both gates.** It was in neither the branch-coverage gate (98.28%, one unreachable
  `?? '0'`, `cents.ts:85`) nor the mutation run.

Stryker 10.1.0 and 10.1.1 (2026-10-23) fixed the runner upstream (#6214 Vitest 5, #6269 collection failures reported as
errors, #6246 no prefix selection). The mutation scout measured 10.1.1's vitest runner against Stryker's command runner
mutant for mutant on 878 mutants across the four packages. They agreed but for labels, the load failures and one
seed-dependent kill.

### Decision

**The runner.** `@stryker-mutator/{api,core,vitest-runner}` 10.1.1, the vitest runner with `coverageAnalysis: perTest`.
The patch, its `patchedDependencies` entry and `tools/stryker/runner.test.ts` are gone.

- `stryker/base.mjs` holds the options every run shares: the json, html and clear-text reports, every CPU, no break
  threshold (the gate decides), and `timeoutMS: 30000`. On four shared CPUs, Stryker's 5 s let the load decide a
  static mutant's status: five pricing mutants timed out at load 8 to 11 and survived or errored at load 2 to 5.
- One configuration per package, `stryker/{money,pricing,ledger,packets}.config.mjs`. The mutate sets are:
  - money: `src/**`;
  - pricing: `src/**` less the test helper `testing.ts`;
  - ledger: `src/**`;
  - packets: the verifier and what it reads (`verifier/**`, readable, scan, facts, payer, placeholders) and the packet's
    arithmetic (interest, calculation, dates, windows, assemble), less `test-support.ts`.

  Each package's tests run against its mutants, through `vitest.mutation.config.ts`:
  - Pricing's tests add the golden engine tests (`tools/golden-worksheet/engine*.test.ts`).
  - Every workspace package's exports are aliased to the sandbox's files, generated from each `package.json`.
  - fast-check is seeded (`tools/stryker/seed.ts`) in mutation runs only, so unit runs keep finding new
    counterexamples.
  - Four exclusions, each with its reason: the timing test, the source-reading purity test, the differential test
    (which kills every engine mutant by construction) and the database tests.
- The golden engine test prices each claim inside its own test, with no memo shared across tests. Priced in its
  `describe` body, it made 93% of the engine's mutants static, and perTest coverage would credit only the first test.
  The claims, their assertions and `fixtures/golden` are unchanged.

**Six shards** (`stryker/shards.json`), split by the scout's measured mutant time:

| Shard | Packages and files |
| --- | --- |
| `money-ledger` | money and the ledger |
| `packets-scan` | packets' `scan.ts` |
| `packets-rest` | the rest of packets' set |
| `pricing-engine` | pricing's `engine.ts` |
| `pricing-recompute` | pricing's `recompute.ts` |
| `pricing-rest` | the rest of pricing |

A test holds every mutated file in exactly one shard of its package. A shard runs all its files; a package's shards run
all or none.

**The canary** (`tools/stryker/canary`) is the first step of every shard job, before any of its mutants (about 7 s).
It holds five cases to an expected status per mutant (`expected.json`), each proving one thing a score rests on:

1. runtime mutants selected by their tests' names;
2. mutants reached at import that break the test file's load: RuntimeError or Killed, never Survived;
3. a mutant in `@tp/stryker-canary`, a private workspace package at `tools/stryker/canary/lib`, which only a `tools`
   test importing it by name kills: the aliases;
4. a mutant only a property run from the committed seed kills: the seed. The input it marks is derived from that seed
   at run time (`seeded-input.ts`), so a fast-check release that draws other values moves it with them;
5. a mutant covered by one of two tests whose names share a prefix, which must survive: no prefix selection.

A case is as expected only when every mutant of its file has an expectation, every expectation a mutant, and every
status is allowed. The verdict goes to the log and to `reports/mutation/<shard>/canary.json`; any case not as expected
stops the shard.

**The gate** (`tools/stryker/gate.ts`), the required `mutation` job, merges the shards' reports by package. A package
is fully run when every shard holding it ran. The gate fails when:
- a shard the changes job selected reported nothing;
- a shard that ran lacks its canary verdict of 5 of 5 as expected (with the Node, Unicode and ICU versions it ran on),
  or one of its packages' reports, or a file of its package that the report leaves out (`stryker/shards.json`'s
  `noMutants` lists the four files Stryker finds no mutant in, which a test holds to imports, re-exports, types and
  `as const` values);
- a shard leaves a report of a package it does not hold, or the reports directory holds a file outside the shards'
  directories;
- a package ran in some of its shards and not all;
- a fully-run package scores at or below 85%. The score is Stryker's, (Killed + Timeout) / (Killed + Timeout +
  Survived + NoCoverage), compared in integers, so 85.00% fails and 85.01% passes. RuntimeError mutants are left out
  of it, as Stryker leaves them. A recorded equivalent stays in it as a survivor, so recording one never raises a
  score;
- any Survived or NoCoverage mutant of a fully-run package is not recorded as equivalent;
- a RuntimeError's reason is not a test file's load failure;
- a mutant is Ignored, CompileError or Pending;
- an equivalents file is malformed, unsorted or holds a duplicate;
- for a fully-run package, a recorded equivalent lacks its reviewer and date, is reviewed by its proposer or on a date
  after the run, no longer matches a mutant (stale), or matches one a test detects or that breaks a load;
- for a fully-run package, an equivalent that rests on the engine's Unicode data (`tools/stryker/unicode.json`) was
  scored by a shard whose Node has other Unicode or ICU data than the entry was checked on, or the listing names an
  entry no equivalents file records.

A package none of whose shards ran is "not affected", and neither score rule judges it. The gate prints per-package
and per-file scores, and every survivor with its covering tests, to the log and the summary.

**Equivalents** live in `tools/stryker/equivalent/<package>.json`, one file per package. Each is a JSON array sorted
by file, then original, then occurrence. Each entry has exactly these keys:
- the file;
- the mutator;
- the original source text and its occurrence index (stable across unrelated edits, unlike a line number);
- the replacement;
- why no input can tell the two apart;
- who proposed it, and who reviewed it and when.

The builder leaves `reviewedBy` and `reviewedOn` empty, and only an independent reviewer fills them: the gate refuses a
`reviewedBy` equal to `proposedBy` and a `reviewedOn` after the run's UTC date. The match is per mutant, on the gate's
side. The freeze forbids `// Stryker disable` comments in the engine, and the gate refuses an
Ignored mutant anywhere, so the file is the only form.

An entry is a true equivalent only when no input tells the mutant from the original: no value of the function's
declared parameter types, as plain data (a string is any text, an object exactly its declared fields), on any
conforming engine. The reviewer tries to build one before signing. A mutant told apart only under a sort that calls its
comparator in an order ECMAScript allows and V8 never uses, or only by text that is not a date where the code compares
dates as text, or only once an earlier sort's comparator is inconsistent for a value of the declared type (a NaN
line number), is not equivalent, and a test kills it. A test may also hold the code to an input beyond its declared
types, as hardening, when it asserts the code's own outcome for that input (its own check's error class and message,
or its reason): such a kill stands and the mutant is not recorded, but it is no evidence against an entry. A kill
that rests only on an incidental failure (a TypeError from a method the value lacks, asserted by a bare `toThrow`) is
not one: the mutant is recorded and the test dropped (`packages/money/src/rounding.ts`'s bigint check). Where an
entry rests on the engine's Unicode data (NFKC forms, grapheme clusters), its reason says so, the reviewer checks it
over every code point on the Node the mutation workflow pins, and `tools/stryker/unicode.json` lists it with that Node
and its Unicode and ICU versions (today readable.ts's three NFKC records and mismatches.ts's sentence-end comparison,
on Node 24.22.0, Unicode 17.0, ICU 78.3); a test fails while an equivalent whose reason names Unicode is not listed.
Each shard's canary verdict names the Node it ran on, so the gate fails those entries, naming them, when a shard ran
on other data, and a test holds the workflow's pin to the Node the listing names: moving the pin re-checks them first.

**What runs** (`.github/workflows/mutation.yml`, its own workflow and concurrency group beside ci.yml's `all green`):
- **Every package** on a push to `claude/build-platform`, weekly and on `workflow_dispatch`.
- **On a pull request** (default types; the `money` label and its step are gone), every shard of each package whose
  closure the change touches (`tools/stryker/affected.ts`), diffed from the merge base. A package's closure is:
  - its mutated files and tests and their import closure, tests included: `importGraph()` of
    `tools/screening-capacity/watched.ts` (the graph `importClosure()` returns the files of), with its new
    `includeTests` option, off by default, so the watched list is unchanged. It resolves every package `pnpm-workspace.yaml` lists, through each export's import condition, arrays
    and `*` patterns, with the module the mutation aliases are generated from (`tools/stryker/workspace.ts`), so a
    closure holds what a mutation run loads; an import of a relative path, or of a workspace package's name or scope,
    that resolves to no file stops the changes job;
  - the `package.json` and `tsconfig.json` of every workspace package the closure lies in;
  - the data files its tests and code read, held complete by a scan of the closure for path literals under
    `fixtures/`, `content/` and `docs/` (a root after an interpolation, after `./` or `../`, or in a nested
    `join`/`resolve`/`new URL` call included), and by requiring every closure file that imports `node:fs` to be a
    data entry's listed reader, a directory read whose every named file is listed, or a reader no mutation run calls;
  - the third-party packages it imports and the test tooling (tsx, which runs the tooling, among it), and what the
    mutation tooling's own files import, resolved through the lockfile's snapshots.

  The closures are taken on both sides of the change, at the head and at the merge base (its tree read from git), and
  any changed path a package's mutate or test set selects affects it, so a pull request that deletes a money test,
  renames one into the exclusions, or deletes a helper, manifest or data file only the old side held, is measured. A
  lockfile change counts only when it moves one of those resolved versions. The mutation configuration and tooling,
  the root manifest, the workspace list, the root tsconfigs and the workflow affect all four.
- **Jobs:**
  - `changes` (5 min);
  - `stryker (<shard>)` (30 min; skipped when nothing is affected; reports uploaded with `overwrite: true`);
  - `mutation` (10 min, `if: always()`). It fails on a failed or cancelled job, and on a skipped shard job when a
    package was affected. It fails closed on the changes job's outputs: an `any` other than `true` or `false`, shards
    or packages that are not JSON arrays of names, or ones that disagree with `any`. It passes with "no money path
    changed" when none was.
  - All three on one exact Node, 24.22.0, the one the Unicode-bound equivalents were checked on.

**Coverage.** `packages/money/src/**` joins `BRANCH_GATED`. `cents.ts:85`'s unreachable `match[2] ?? '0'` (the
regular expression at `:73` requires the group) becomes branch-free, with behaviour unchanged. This is the series' one
non-test change in a money path, reviewed as one.

**Survivors are killed by tests only.** Each package's survivors (16 money, 162 pricing, 130 ledger, 345 packets at
the scout's measurement) die by tests, or are recorded only when truly equivalent:
- nothing non-test changes under `packages/pricing/src` (the freeze), where test helpers stay inside `*.test.ts`;
- the ledger takes new `it` blocks and new files only (reconciliation-001: LED-01 to LED-11 and the ledger oracle
  unchanged, additions only).

**Milestone 6 and Gate 1** (F6). PRD 17's milestone 6 check gains "every money package's mutation score above 85% with
no unexplained survivor" (the `mutation` gate). PRD 18's mutation row and CI line say what this part runs.
reconciliation-001's milestone check names the exception. Lane A's PR 7 writes the same condition into Gate 1 in
`docs/product/gates.md`.

### Measured (2026-10-25, four CPUs shared with other agents)

- **The canary on 10.1.1:** 24 mutants, 5 of 5 cases as expected, 7 s. On 10.0.0 with the patch, case 2 fails (its
  three load-breaking mutants Survived) and so does case 5 (the prefix mutant Killed by the longer-named test): 3 of 5.
  On 10.0.0 without the patch: 0 of 5. On 10.1.1 without the aliases, case 3 fails (its two mutants NoCoverage); on
  10.1.1 without the seed, case 4 fails (the seeded mutant Survived): 4 of 5 each.
- **Every package, before and after this part** (10.1.1; all six shards run in full, one after another, then the
  gate over their reports as the `mutation` job reads them; scores as the gate computes them, truncated to two
  decimals, never rounded up, recorded equivalents counted as survivors and load failures left out):

  | Package | Before (the runner bump alone) | After | Undetected, all recorded | Shard time |
  | --- | --- | --- | --- | --- |
  | money | 93.22% (220 of 236; 16 undetected) | 96.58% (226 of 234) | 8 | money-ledger 3 min 37 s (money 32 s) |
  | ledger | 91.88% (1,529 of 1,664; 135) | 98.13% (1,633 of 1,664) | 31 | (with money) |
  | pricing | 91.47% (1,782 of 1,948; 166) | 98.67% (1,934 of 1,960) | 26 | engine 8 min 25 s, recompute 3 min 47 s, rest 5 min 24 s |
  | packets | 85.61% (2,053 of 2,398; 345) | 95.87% (2,299 of 2,398) | 99 | scan 6 min 13 s, rest 5 min 43 s |

  The gate passes: every package above 85%, no unexplained survivor, every shard's canary 5 of 5. Undetected mutants
  went from 662 to 164, each a reviewed equivalent; the builders proposed 175, and the integrator, trying to build an
  input that told each apart, killed ten by tests (seven comparators right only in the order V8 calls them, three
  told apart only by text that is not a date). The payment-engine review killed two more by a test (engine.ts's
  visit sort, told apart when a NaN line number leaves `price`'s own sort of the lines to the implementation) and
  found one that a test told apart only with text cast past its type, through an incidental TypeError, now recorded
  (`rounding.ts`'s `typeof amount === 'bigint'`). The scores and Stryker's times above are the fix round's run, on
  the payment-engine fixes' head; all six shards run again on the head merged with Part 1 measure the same scores,
  mutant for mutant, and the pull request's own CI run measures them once more. Deleting one killing assertion (the
  row that holds `formatUnroundedUsd`'s refusal to its message) fails the gate, naming
  `packages/money/src/cents.ts:83` and its covering test. Before the survivor-killing tests, the money shard alone failed the gate on 151 unexplained survivors
  (16 money, 135 ledger). The scout's measurement had packets at 85.40% without `windows.ts` (35 mutants, all killed).
- **The golden comparison's tests** (`tools/golden-worksheet/engine.test.ts`) price each claim inside the test that
  reads it, so 45 of engine.ts's 855 mutants are static where 799 were. Every mutant's status is the same either way
  and the engine shard's time barely moves (9 min 21 s against 9 min 27 s): the tests that price every claim still
  cover nearly every engine mutant.

### Alternatives considered

| Option | Why not |
| --- | --- |
| Stryker's command runner per package (the audit's proposal) | Equal statuses on the evidence, but 2.5 to 6 times slower (pricing about 45 minutes in one job). Any non-zero exit counts as a kill, so a crash or a flaky timing test reads as one. It names no killing or covering test, which killing survivors needs (notice N4) |
| Keep 10.0.0 and the patch, adding one for #6269 | Two local patches that every Dependabot bump of Stryker breaks, for what 10.1.1 does upstream |
| `inPlace: true` instead of the aliases | Equal statuses, but it mutates the checkout itself, which a killed local run leaves mutated |
| A Stryker ignorer plugin for equivalents | Its `shouldIgnore` ignores a whole AST node, every mutant in it, which is coarser than the evidence for one mutant |
| `// Stryker disable` comments | The freeze forbids any non-test change in the engine, and a comment hides the record from review |
| Mutate only the changed files (the audit's fallback) or Stryker's incremental mode | A change can make another file's mutants survive, and incremental mode cannot see changes to static mutants' tests, helpers, fixtures or dependencies. The affected packages' full shards take minutes |
| The canary as a job of its own | A job's setup, about a minute, on every money pull request's wall, and it proves a different runner from the one each shard scores with |
| The `money` label | A forgotten label is an unmeasured change; path-affected runs cannot be forgotten |
| Mutation inside ci.yml under `all green` | It would make `all green` as slow as the longest shard on every money pull request, and mutation has triggers ci.yml does not |

### Notices (decided by the build under the standing rule; the founder can reverse any)

- **N4.** Mutation uses Stryker 10.1.1's vitest runner, not the command runner the audit named. Affected packages run
  in full, not only the changed files. The gate is stricter than 85%: no unexplained survivor.
- **N5.** Stryker 10.1.1 was published on 2026-10-23T19:18Z, and is older than a three-day release age from
  2026-10-26T19:18Z. It is taken because 10.0.0 is measurably wrong, and the canary's five cases prove, before every
  score, what it relies on.

### Consequences

- `mutation` runs on every pull request, and is one of the required checks of the build branch's ruleset, applied on
  2026-10-25 at 21:14 UTC (Part 1, "The required checks"). It takes about a minute when no money path changed, and about 13 to 17 minutes when
  one did, depending on the slowest affected shard.
- A Stryker, Vitest or fast-check bump runs all four packages. If the canary fails, the bump has changed what the
  scores rest on, and the pull request says why before `expected.json` changes.
- A new money file needs a shard in `stryker/shards.json` (the partition test fails until it has one), and a shard
  report that leaves it out fails the gate unless `noMutants` lists it. A new data file a money test reads needs
  `DATA_FILES`, and a new closure file that reads the file system needs to be named as its reader, or the changes job
  stops naming it.
- Moving the mutation workflow's Node (one exact version in all three jobs) means checking the Unicode-bound
  equivalents again over every code point on the new Node and recording it in `tools/stryker/unicode.json`: a test
  fails until the two agree, and the gate fails those entries on a shard that ran on other Unicode data.
- Every new survivor in a money package fails its pull request until a test kills it or a reviewed equivalent records
  it. PR 6c plans its killing tests in its design.
- What cannot be verified locally (GitHub's `needs` results, the artifacts between jobs and `overwrite` on a re-run,
  the weekly schedule) is read on this pull request's own full run and the first push run. Every verdict is printed to
  the job logs.

### Revisit when

- A shard nears its 30-minute timeout, or after this pull request's first CI run, which replaces the loaded-machine
  estimates in `stryker/shards.json` (open item O7).
- The repository goes private: two vCPUs double shard times, and runner minutes are billed.
- Stryker ships an ignorer that matches a single mutant.
- fast-check, Stryker or Vitest fails a canary case on an upgrade.
