# 0066. Run CI as parallel jobs behind one gate, measure mutation on every money package, move the browser and runner together, and pin every dependency

- **Status:** accepted, Part 1 (`co-001/ci-speed`, combined audit #109) and Part 4 (`co-001/ci-mutation`, #54). Parts 2
  and 3 are appended by the series' later pull requests: `co-001/ci-deps` (#112, with #19's assert loosening,
  Dependabot groups and licence fix) and `co-001/ci-browser` (#19's upgrade part). Part 1 amends
  [0010](0010-supply-chain-gates-beside-ci.md) (the image and licence gates run as ci.yml jobs under `all green`) and
  [0063](0063-protect-main-and-the-build-branch-make-the-founders-github-review-the-approval-of-record-open-each-approval-with-what-changed-and-switch-on-the-edit-hooks.md)
  (the required checks, the job that writes the domain model's summary, the per-job timeouts).
  - **Part 4** (`co-001/ci-mutation`, combined audit #54) amends
    [0064](0064-resolve-a-split-zips-locality-from-the-zip-plus-four-files-ranges-the-one-engine-change-the-freeze-allows.md)
    (mutation by path, not by label; Stryker 10.1.1 in place of 10.0.0 and its patch) and
    [0047](0047-read-narratives-as-they-show-refuse-the-cases-identifiers-bound-ledger-corrections-and-give-them-and-the-regulation-to-the-specialist.md)
    (the verifier's own configuration retired).
- **Date:** 2026-10-25
- **Deciders:** the founder, Tyler Williams, who adopted the combined best-option audit in full on 2026-10-20 (items
  #19, #54, #109 and #112 among it, each placed "CI PR before PR 7"), under the standing rule of 2026-10-18; the build
  (Lane B), for the notices below, decided under that rule and each reversible by the founder
  - **Part 4:** item #54 of that audit, placed "CI PR before PR 7"; and the founder's ruling of 2026-10-25, relayed by
    the co-founder, that his adoption covers #54's 85% exit for milestone 6 and Gate 1 (the series' question F6).
- **PRD sections:** 16 (dependency and image hygiene), 17 (milestone 0: "CI with every gate from section 18"), 18
  (continuous integration: "one workflow on every pull request"); Change Order 001, CO-02; reconciliation-001's checks;
  test matrix CI-01 to CI-10; ADRs 0010, 0058, 0062, 0063 and 0064
  - **Part 4:** 17 (milestone 6's check), 18 (the mutation layer and continuous integration); reconciliation-001's
    checks (the engine freeze, the ledger's additions-only rule, the milestones); test matrix CI-15 to CI-17; ADRs
    0047 and 0064.

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
  a merge's push follows the pull request's gated run; until step 4A's ruleset blocks direct pushes, a direct push is
  checked by the differential test alone (`docs/runbooks/ci.md`).
- **History.** `static`, `unit` and `domain model` check out the whole history (the scan, the differential test's
  `git archive` of the base, the summary's base document); no checkout keeps the token, since no step calls GitHub.
- **Artifacts.** Upload-artifact v4 names are unique per run and immutable, so every per-run name (`web-build`,
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

Once the founder applies `claude/build-platform`'s ruleset (governance runbook, step 4A, after this pull request's first
green push run), it requires these, and so does "Protect main" from the launch pull request; until then nothing
enforces them:

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
  merge is reported beside it: on a pull request touching a watched path the capacity gate, about 13 to 16 minutes,
  sets it; shortening that run changes what the founder ruled it measures, so it goes to the founder with those
  numbers, after the first five push runs.
- No test lost, read on the pull request's run: unit is 49514e8's 4,524 and 1 skipped plus this pull request's own,
  132 new by full name less 12 renamed (4,644 and 1 skipped on 9144b56, each renamed test asserting the same on the new
  graph); golden and e2e equal 49514e8's (38 and 51); the database shards together run 49514e8's 9,041 less the
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
  founder applies the ruleset (governance runbook, step 4A) once this pull request's first push run is green: applied
  earlier, it would require a `check` that no longer reports.
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
  runner's temporary directory, outside the checkout the worker image is built from after the web scan. If the
  founder makes the build branch the default branch until launch (the series' question F1), every branch could restore
  them; Part 2 makes `release.yml` restore no cache whatever the answer.
- What cannot be verified where the series is built (no Docker daemon, no GitHub runner): `needs` results, the
  artifacts between jobs and `overwrite` on a re-run, `github.event.repository.private`, `github.event.before`, the
  caches. The pull request's own runs and the first push runs prove them; every verdict is in the job logs.

### Revisit when

The repository goes private (read the six- and three-shard runs against the 10-minute target), the founder rules on the capacity run's
length, Part 2's pins land, Playwright moves (Part 3), or a db file passes 240 s on CI or a route-test file 90 s.

## Part 2 (`co-001/ci-deps`)

Appended by that pull request.

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
not one: the mutant is recorded and the test dropped (`packages/money/src/rounding.ts`'s bigint check). Where an entry rests on the engine's Unicode data (NFKC forms,
grapheme clusters), its reason says so, the reviewer checks it over every code point on the Node the mutation workflow
pins, and `tools/stryker/unicode.json` lists it with that Node and its Unicode and ICU versions (today readable.ts's
three NFKC records and mismatches.ts's sentence-end comparison, on Node 24.22.0, Unicode 17.0, ICU 78.3). Each shard's
canary verdict names the Node it ran on, so the gate fails those entries, naming them, when a shard ran on other data,
and a test holds the workflow's pin to the Node the listing names: moving the pin re-checks them first.

**What runs** (`.github/workflows/mutation.yml`, its own workflow and concurrency group beside ci.yml's `all green`):
- **Every package** on a push to `claude/build-platform`, weekly and on `workflow_dispatch`.
- **On a pull request** (default types; the `money` label and its step are gone), every shard of each package whose
  closure the change touches (`tools/stryker/affected.ts`), diffed from the merge base. A package's closure is:
  - its mutated files and tests and their import closure, tests included: `importClosure()` of
    `tools/screening-capacity/watched.ts`, with its new `includeTests` option, off by default, so the watched list is
    unchanged. It resolves every package `pnpm-workspace.yaml` lists, through each export's import condition, arrays
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
  the payment-engine fixes' head; the merged head and the pull request's own CI run measure the same scores. Deleting one killing assertion (the row that holds
  `formatUnroundedUsd`'s refusal to its message) fails the gate, naming `packages/money/src/cents.ts:83` and its
  covering test. Before the survivor-killing tests, the money shard alone failed the gate on 151 unexplained survivors
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

- `mutation` is a required check on every pull request. It takes about a minute when no money path changed, and about
  13 to 17 minutes when one did, depending on the slowest affected shard.
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
