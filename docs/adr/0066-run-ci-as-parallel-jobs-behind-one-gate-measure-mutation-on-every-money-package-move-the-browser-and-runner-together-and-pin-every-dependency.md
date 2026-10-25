# 0066. Run CI as parallel jobs behind one gate, measure mutation on every money package, move the browser and runner together, and pin every dependency

- **Status:** accepted, Part 1 (`co-001/ci-speed`, combined audit #109). Parts 2 to 4 are appended by the series' later
  pull requests: `co-001/ci-deps` (#112, with #19's assert loosening, Dependabot groups and licence fix),
  `co-001/ci-browser` (#19's upgrade part) and `co-001/ci-mutation` (#54). Part 1 amends
  [0010](0010-supply-chain-gates-beside-ci.md) (the image and licence gates run as ci.yml jobs under `all green`) and
  [0063](0063-protect-main-and-the-build-branch-make-the-founders-github-review-the-approval-of-record-open-each-approval-with-what-changed-and-switch-on-the-edit-hooks.md)
  (the required checks, the job that writes the domain model's summary, the per-job timeouts).
- **Date:** 2026-10-25
- **Deciders:** the founder, Tyler Williams, who adopted the combined best-option audit in full on 2026-10-20 (items
  #19, #54, #109 and #112 among it, each placed "CI PR before PR 7"), under the standing rule of 2026-10-18; the build
  (Lane B), for the notices below, decided under that rule and each reversible by the founder
- **PRD sections:** 16 (dependency and image hygiene), 17 (milestone 0: "CI with every gate from section 18"), 18
  (continuous integration: "one workflow on every pull request"); Change Order 001, CO-02; reconciliation-001's checks;
  test matrix CI-01 to CI-10; ADRs 0010, 0058, 0062, 0063 and 0064

## Context

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

## Decision (Part 1: `co-001/ci-speed`)

### The job graph

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
  freeze's own check runs on pull requests only: its exception names a pull request.
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

### What makes it fast

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
  (`apps/web/scripts/build-stamp.ts`, which refuses another commit's build or none) in place of building again (CI-06).
  The build runs with no e2e setting, so the journeys run the build that ships.

### What it holds that it did not

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

### The required checks

From this pull request, `claude/build-platform`'s ruleset requires, and "Protect main" from the launch pull request:

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

## Measured

- Before, on 49514e8's heads: 41:20 and 29:09 for the one `check` job, run serially.
- Expected after (the scouts' estimates on the public 4-vCPU runner, about ±25% by host): `all green` in about 7 to 8
  minutes, its critical path the build and the e2e shard holding the 168-s monitoring journey; about 42.7 to 47.7
  runner-minutes a run against today's 29 to 41, setup repeated in 13 jobs. The targets are 10:00 median and 12:00
  worst from the first job's start to the gate's end, and at most 50 runner-minutes, read on this pull request's last
  three heads and the first five push runs (`docs/runbooks/ci.md`, "Timing a run"). The time until a pull request can
  merge is reported beside it: on a pull request touching a watched path the capacity gate, about 13 to 16 minutes,
  sets it; shortening that run changes what the founder ruled it measures, so it goes to the founder with those
  numbers, after the first five push runs.
- No test lost, read on the pull request's run: unit, golden and e2e counts equal 49514e8's (unit 4,524 and 1 skipped,
  golden 38, e2e 51); the database shards together run 49514e8's 9,041 less the approval case and the route-count check
  (now a unit test, `route-tests/partition.test.ts`), plus the snapshot equivalence case.
- **The journeys run the build that ships.** Measured on 2026-10-25 at this pull request's head (three
  `pnpm --filter @tp/web build` runs, 69, 72 and 76 s): two builds with no e2e setting and one with every variable the
  e2e web server sets (`apps/web/playwright.config.ts`: the database URLs, the local providers and their directories,
  the keys and secrets) each held the same 3,788 files under `.next/standalone` and `.next/static`, each build's own
  `BUILD_ID` set aside. The e2e build differed from a plain one in 261 files, exactly the 261 in which the two plain
  builds differed from each other: the server action IDs, their encryption key and the preview-mode keys Next draws for
  every build, and the chunks, manifests and trace files that carry them. None of the e2e values (the database URLs and
  logins, the origin, the secrets) appears anywhere in the e2e build's tree. So the build job builds without them, and
  the e2e shards run that build.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep one job and shorten the slow files | The database suite alone would still take 8 to 10 minutes after the route-test fixes; jobs run in parallel for free |
| A ruleset requiring every job by name | Thirteen names in every document, renamed whenever a shard is added; one gate needs none of that, and a test keeps every job under it |
| Gate on `!cancelled()` | A gate skipped on a cancelled run reports as passing a required check |
| Keep `supply-chain.yml` beside ci.yml | Six names to require and keep in step, two workflows for "one workflow on every pull request" (PRD 18), and ADR 0010's reason (a verbatim plan file) no longer holds |
| Lint per workspace in parallel (audit #109's words) | Web is the floor whatever the split, since its program compiles every workspace's source; more processes add memory, not speed (notice N9) |
| `incremental` in each tsconfig | The engine freeze refuses any change to `packages/pricing/` outside `src`; the root runner passes the same options on the command line |
| Shard e2e by duration | Playwright 1.56.1 and 1.64.1 shard by test count; their only weighting is an internal variable |
| Mutation inside ci.yml | `all green` stays the fast signal; mutation's own triggers (the schedule, labels) and its 13 to 17 minutes on money pull requests stay apart, under their own required gate (Part 4) |
| Pins only in Part 2 | ci.yml's rewrite already names each action; taking the SHAs the release and capacity workflows run costs nothing and leaves no tag-pinned action in the required gate between the two pull requests |

## Notices (decided by the build under the standing rule; the founder can reverse any)

- **N1.** `supply-chain.yml` folds into ci.yml under `all green`, with ADR 0010 amended: one required check for CI in
  place of four.
- **N2.** The schema approval runs as the named `domain model` job with CLAUDE.md's own command; CO-02 is unchanged.
- **N3.** A flaky end-to-end test fails CI; the retry stays for its trace and label.
- **N9.** Lint runs as three memory-bounded groups in one job, not per workspace.

## Consequences

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
  durations, the pnpm store). If the founder makes the build branch the default branch until launch (the series'
  question F1), every branch could restore them; Part 2 makes `release.yml` restore no cache whatever the answer.
- What cannot be verified where the series is built (no Docker daemon, no GitHub runner): `needs` results, the
  artifacts between jobs and `overwrite` on a re-run, `github.event.repository.private`, `github.event.before`, the
  caches. The pull request's own runs and the first push runs prove them; every verdict is in the job logs.

## Revisit when

The repository goes private (read the six- and three-shard runs against the 10-minute target), the founder rules on the capacity run's
length, Part 2's pins land, Playwright moves (Part 3), or a db file passes 240 s on CI or a route-test file 90 s.

## Part 2 (`co-001/ci-deps`)

Appended by that pull request.

## Part 3 (`co-001/ci-browser`)

Appended by that pull request.

## Part 4 (`co-001/ci-mutation`)

Appended by that pull request.
